import type { AppLogger } from "./logging.js";
import type { GroupsConfig } from "./config.js";
import { MainChannel } from "./channels/main-channel.js";
import { SyncChannel } from "./channels/sync-channel.js";
import { GroupManager, type ManagedGroup } from "./groups/manager.js";
import { GroupStore } from "./storage/store.js";
import {
  createLocalClient,
  mainDbPath,
  type KharismaClient,
} from "./xmtp/client.js";
import { localSignerFromHex } from "./xmtp/local-signer.js";
import { VerificationService } from "./verification/service.js";
import type { InvestmentManager } from "./investments/manager.js";
import {
  contentTypeEquals,
  JoinApprovalVoteCodec,
  protocolError,
  type JoinApprovalVotePayload,
} from "@kharisma/protocol";
import { GroupMessageKind } from "@xmtp/node-sdk";
import { handleJoinApprovalVote } from "./groups/join.js";

/**
 * Top-level orchestrator for groups-service. Owns the main XMTP client,
 * every per-group client (via `GroupManager`), and the inbound message
 * streams that dispatch through the main / sync channel handlers.
 */
export class GroupsService {
  private mainClient: KharismaClient | null = null;
  private readonly groupStreamAborts = new Map<string, AbortController>();
  private readonly groupMessageStreamAborts = new Map<string, AbortController>();
  private mainStreamAbort: AbortController | null = null;
  private mainChannel: MainChannel | null = null;
  private syncChannel: SyncChannel | null = null;

  constructor(
    private readonly config: GroupsConfig,
    private readonly logger: AppLogger,
    private readonly store: GroupStore,
    private readonly manager: GroupManager,
    private readonly verification: VerificationService,
    private readonly investmentManager: InvestmentManager,
  ) {}

  async start(): Promise<void> {
    const { address } = localSignerFromHex(this.config.kharismaPrivateKey);
    const { client: mainClient } = await createLocalClient({
      config: this.config,
      privateKeyHex: this.config.kharismaPrivateKey,
      dbPath: mainDbPath(this.config, address),
    });
    this.mainClient = mainClient;

    this.logger.info(
      {
        address,
        inboxId: mainClient.inboxId,
        env: this.config.xmtpEnv,
      },
      "Main kharisma client ready",
    );

    this.mainChannel = new MainChannel(
      mainClient,
      this.manager,
      this.verification,
      this.logger.child({ component: "main-channel" }),
    );
    this.syncChannel = new SyncChannel(
      this.manager,
      this.store,
      this.verification,
      this.investmentManager,
      this.logger.child({ component: "sync-channel" }),
    );

    // Observe new groups so the service can start a stream the moment a
    // `create-group-request/1` finishes, without waiting for a restart.
    this.manager.onGroupStarted((managed) => {
      this.startSyncStream(managed).catch((err) => {
        this.logger.error(
          { err, groupId: managed.record.groupId },
          "Failed to start sync stream for new group",
        );
      });
      this.startGroupMessageStream(managed).catch((err) => {
        this.logger.error(
          { err, groupId: managed.record.groupId },
          "Failed to start group message stream for new group",
        );
      });
    });

    await this.manager.rehydrate();

    await mainClient.conversations.syncAll();
    this.startMainStream(mainClient).catch((err) => {
      this.logger.error({ err }, "Main stream exited abnormally");
    });

    for (const managed of this.manager.all()) {
      try {
        await managed.client.conversations.syncAll();
      } catch (err) {
        this.logger.warn(
          { err, groupId: managed.record.groupId },
          "syncAll failed for group; stream will retry",
        );
      }
      this.startSyncStream(managed).catch((err) => {
        this.logger.error(
          { err, groupId: managed.record.groupId },
          "Sync stream exited abnormally",
        );
      });
      this.startGroupMessageStream(managed).catch((err) => {
        this.logger.error(
          { err, groupId: managed.record.groupId },
          "Group message stream exited abnormally",
        );
      });
    }

    this.logger.info(
      { groupCount: this.manager.all().length },
      "GroupsService started",
    );

  }

  async stop(): Promise<void> {
    this.mainStreamAbort?.abort();
    this.mainStreamAbort = null;
    for (const [, controller] of this.groupStreamAborts) {
      controller.abort();
    }
    this.groupStreamAborts.clear();
    for (const [, controller] of this.groupMessageStreamAborts) {
      controller.abort();
    }
    this.groupMessageStreamAborts.clear();
    this.store.close();
    this.logger.info({}, "GroupsService stopped");
  }

  private async startMainStream(client: KharismaClient): Promise<void> {
    if (!this.mainChannel) return;
    const mainChannel = this.mainChannel;

    const controller = new AbortController();
    this.mainStreamAbort = controller;

    const stream = await client.conversations.streamAllDmMessages();
    this.logger.info({ inboxId: client.inboxId }, "Main DM stream open");

    try {
      for await (const message of stream) {
        if (controller.signal.aborted) break;
        if (!message) continue;
        try {
          await mainChannel.handleMessage(message);
        } catch (err) {
          this.logger.error({ err }, "Main channel dispatch failed");
        }
      }
    } finally {
      this.logger.info({ inboxId: client.inboxId }, "Main DM stream closed");
    }
  }

  private async startSyncStream(managed: ManagedGroup): Promise<void> {
    if (!this.syncChannel) return;
    const syncChannel = this.syncChannel;

    if (this.groupStreamAborts.has(managed.record.groupId)) {
      return;
    }
    const controller = new AbortController();
    this.groupStreamAborts.set(managed.record.groupId, controller);

    const stream = await managed.client.conversations.streamAllDmMessages();
    this.logger.info(
      {
        groupId: managed.record.groupId,
        inboxId: managed.client.inboxId,
      },
      "Sync DM stream open",
    );

    try {
      for await (const message of stream) {
        if (controller.signal.aborted) break;
        if (!message) continue;
        try {
          await syncChannel.handleMessage(managed, message);
        } catch (err) {
          this.logger.error(
            { err, groupId: managed.record.groupId },
            "Sync channel dispatch failed",
          );
        }
      }
    } finally {
      this.logger.info(
        { groupId: managed.record.groupId },
        "Sync DM stream closed",
      );
      this.groupStreamAborts.delete(managed.record.groupId);
    }
  }

  private async startGroupMessageStream(managed: ManagedGroup): Promise<void> {
    if (this.groupMessageStreamAborts.has(managed.record.groupId)) {
      return;
    }
    const controller = new AbortController();
    this.groupMessageStreamAborts.set(managed.record.groupId, controller);

    const stream = await managed.client.conversations.streamAllMessages();
    this.logger.info(
      {
        groupId: managed.record.groupId,
        xmtpGroupId: managed.record.xmtpGroupId,
      },
      "Group message stream open",
    );

    try {
      for await (const message of stream) {
        if (controller.signal.aborted) break;
        if (!message) continue;
        if (managed.record.status === "deleted") continue;
        if (message.senderInboxId === managed.client.inboxId) continue;
        if (message.kind !== GroupMessageKind.Application) continue;
        if (message.conversationId !== managed.record.xmtpGroupId) continue;
        if (!contentTypeEquals(message.contentType, JoinApprovalVoteCodec.contentType)) {
          continue;
        }

        const payload = message.content as JoinApprovalVotePayload | undefined;
        if (
          !payload ||
          typeof payload.groupId !== "string" ||
          typeof payload.pendingJoinId !== "string" ||
          payload.vote !== "approve"
        ) {
          this.logger.warn(
            { groupId: managed.record.groupId, senderInboxId: message.senderInboxId },
            "Ignoring malformed join approval vote",
          );
          continue;
        }

        const outcome = await handleJoinApprovalVote({
          request: payload,
          senderInboxId: message.senderInboxId,
          managed,
          manager: this.manager,
          store: this.store,
          logger: this.logger.child({ component: "group-channel" }),
        });

        if (!outcome.ok) {
          this.logger.warn(
            {
              groupId: managed.record.groupId,
              senderInboxId: message.senderInboxId,
              code: outcome.error.code,
            },
            "Join approval vote rejected",
          );
        } else if (outcome.status === "ignored") {
          this.logger.debug(
            {
              groupId: managed.record.groupId,
              senderInboxId: message.senderInboxId,
              reason: outcome.reason,
            },
            "Join approval vote ignored",
          );
        }
      }
    } catch (err) {
      this.logger.error(
        {
          err,
          groupId: managed.record.groupId,
          error: protocolError("internal", "group message stream failed"),
        },
        "Group message stream failed",
      );
    } finally {
      this.logger.info(
        { groupId: managed.record.groupId },
        "Group message stream closed",
      );
      this.groupMessageStreamAborts.delete(managed.record.groupId);
    }
  }
}
