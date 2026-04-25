import {
  ErrorCodec,
  InvestmentConfigResponseCodec,
  InvestmentSubmitResponseCodec,
  SkillResponseCodec,
  ThreadCatalogResponseCodec,
  VerificationAckCodec,
  WalletStatusResponseCodec,
  applySyncJoinResult,
  contentTypeToKey,
  initialSyncState,
  protocolError,
  reduceSync,
  type HumanAgentSubmitPayload,
  type HumanSubmitPayload,
  type IdentitySubmitPayload,
  type InvestmentConfigRequestPayload,
  type InvestmentSubmitPayload,
  type JoinRequestPayload,
  type ProtocolError,
  type SyncChannelState,
  type ThreadCatalogRequestPayload,
  type WalletStatusRequestPayload,
} from "@kharisma/protocol";
import { GroupMessageKind } from "@xmtp/node-sdk";
import type { DecodedMessage, Dm } from "@xmtp/node-sdk";
import type { AppLogger } from "../logging.js";
import type { GroupManager, ManagedGroup } from "../groups/manager.js";
import {
  announceMemberJoined,
  handleJoinRequest,
  sendJoinError,
  sendJoinOk,
} from "../groups/join.js";
import { buildCircleSyncSkill } from "../protocol/skill.js";
import { VerificationService } from "../verification/service.js";
import type { InvestmentManager } from "../investments/manager.js";
import type { GroupStore } from "../storage/store.js";
import { getThreadCatalog } from "../groups/thread-catalog.js";

/**
 * Owns the sync-channel state machine across every per-group client.
 * A single instance is shared by every managed group: the manager tells
 * it which group's per-group client produced each message so it can
 * route join-request/1 to the right record.
 */
export class SyncChannel {
  private readonly states = new Map<string, SyncChannelState>();

  constructor(
    private readonly manager: GroupManager,
    private readonly store: GroupStore,
    private readonly verification: VerificationService,
    private readonly investments: InvestmentManager,
    private readonly logger: AppLogger,
  ) {}

  async handleMessage(
    managed: ManagedGroup,
    message: DecodedMessage,
  ): Promise<void> {
    if (managed.record.status === "deleted") return;
    if (message.senderInboxId === managed.client.inboxId) return;
    if (message.kind !== GroupMessageKind.Application) return;

    const conversation = await managed.client.conversations.getConversationById(
      message.conversationId,
    );
    if (!conversation) {
      this.logger.warn(
        {
          groupId: managed.record.groupId,
          conversationId: message.conversationId,
        },
        "Per-group client received message for unknown conversation",
      );
      return;
    }
    const dm = conversation as Dm<unknown>;
    const state =
      this.states.get(dm.id) ??
      (managed.record.members[message.senderInboxId]
        ? ({ kind: "JOINED" } as const)
        : initialSyncState);

    const transition = reduceSync(state, message.contentType);

    if (!transition.ok) {
      this.logger.warn(
        {
          groupId: managed.record.groupId,
          contentType: contentTypeToKey(message.contentType),
          code: transition.error.code,
        },
        "Sync channel rejected message",
      );
      await this.sendError(dm, transition.error);
      return;
    }

    try {
      switch (transition.command.kind) {
        case "skill": {
          await dm.send(
            SkillResponseCodec.encode(
              buildCircleSyncSkill(managed),
            ),
          );
          this.states.set(dm.id, transition.nextState);
          return;
        }

        case "wallet-status": {
          const payload = message.content as WalletStatusRequestPayload | undefined;
          if (!payload || typeof payload.walletAddress !== "string") {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "wallet-status-request/2 missing walletAddress",
              ),
            );
            return;
          }
          await dm.send(
            WalletStatusResponseCodec.encode(
              this.verification.getWalletStatus(payload.walletAddress),
            ),
          );
          this.states.set(dm.id, transition.nextState);
          return;
        }

        case "submit-identity": {
          const payload = message.content as IdentitySubmitPayload | undefined;
          if (!payload || typeof payload.walletAddress !== "string") {
            await this.sendError(
              dm,
              protocolError("malformed", "identity-submit/2 missing walletAddress"),
            );
            return;
          }
          const ack = await this.verification.submitIdentity({
            ...payload,
            senderInboxId: message.senderInboxId,
          });
          await dm.send(VerificationAckCodec.encode(ack));
          this.states.set(dm.id, transition.nextState);
          return;
        }

        case "submit-human": {
          const payload = message.content as HumanSubmitPayload | undefined;
          if (
            !payload ||
            typeof payload.walletAddress !== "string" ||
            typeof payload.handle !== "string" ||
            !payload.handle.trim()
          ) {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "human-submit/2 missing walletAddress or handle",
              ),
            );
            return;
          }
          const ack = await this.verification.submitHuman({
            ...payload,
            handle: payload.handle.trim(),
            senderInboxId: message.senderInboxId,
          });
          await dm.send(VerificationAckCodec.encode(ack));
          this.states.set(dm.id, transition.nextState);
          return;
        }

        case "submit-human-agent": {
          const payload = message.content as HumanAgentSubmitPayload | undefined;
          if (
            !payload ||
            typeof payload.walletAddress !== "string" ||
            typeof payload.ownerHumanId !== "string" ||
            typeof payload.handle !== "string" ||
            !payload.handle.trim()
          ) {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "human-agent-submit/2 missing walletAddress, ownerHumanId, or handle",
              ),
            );
            return;
          }
          const ack = await this.verification.submitHumanAgent({
            ...payload,
            handle: payload.handle.trim(),
            senderInboxId: message.senderInboxId,
          });
          await dm.send(VerificationAckCodec.encode(ack));
          this.states.set(dm.id, transition.nextState);
          return;
        }

        case "investment-config": {
          const payload = message.content as
            | InvestmentConfigRequestPayload
            | undefined;
          if (!payload || typeof payload.groupId !== "string") {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "investment-config-request/1 missing groupId",
              ),
            );
            return;
          }
          try {
            const config = this.investments.getInvestmentConfig(payload.groupId);
            await dm.send(
              InvestmentConfigResponseCodec.encode({
                status: "ok",
                ...config,
              }),
            );
          } catch (err) {
            await dm.send(
              InvestmentConfigResponseCodec.encode({
                status: "error",
                groupId: payload.groupId,
                error: protocolError(
                  "malformed",
                  err instanceof Error ? err.message : "investment config failed",
                ),
              }),
            );
          }
          this.states.set(dm.id, transition.nextState);
          return;
        }

        case "investment-submit": {
          const payload = message.content as InvestmentSubmitPayload | undefined;
          if (
            !payload ||
            typeof payload.groupId !== "string" ||
            typeof payload.walletAddress !== "string" ||
            typeof payload.chainId !== "number" ||
            (payload.token !== "WLD" && payload.token !== "USDC") ||
            typeof payload.amount !== "string"
          ) {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "investment-submit/1 missing required fields",
              ),
            );
            return;
          }
          try {
            const result = await this.investments.submitInvestment({
              groupId: payload.groupId,
              chainId: payload.chainId,
              token: payload.token,
              amount: payload.amount,
              investorWalletAddress: payload.walletAddress,
              ...(payload.txHash ? { txHash: payload.txHash } : {}),
              ...(payload.userOpHash ? { userOpHash: payload.userOpHash } : {}),
            });
            await dm.send(
              InvestmentSubmitResponseCodec.encode({
                status: result.status,
                groupId: payload.groupId,
                investment: result.investment,
              }),
            );
          } catch (err) {
            await dm.send(
              InvestmentSubmitResponseCodec.encode({
                status: "error",
                groupId: payload.groupId,
                error: protocolError(
                  "malformed",
                  err instanceof Error ? err.message : "investment failed",
                ),
              }),
            );
          }
          this.states.set(dm.id, transition.nextState);
          return;
        }

        case "thread-catalog": {
          const payload = message.content as ThreadCatalogRequestPayload | undefined;
          if (!payload || typeof payload.groupId !== "string") {
            await this.sendError(
              dm,
              protocolError(
                "malformed",
                "thread-catalog-request/1 missing groupId",
              ),
            );
            return;
          }
          if (payload.groupId !== managed.record.groupId) {
            await dm.send(
              ThreadCatalogResponseCodec.encode({
                status: "error",
                groupId: payload.groupId,
                error: protocolError(
                  "group-not-found",
                  `sync inbox does not own group ${payload.groupId}`,
                ),
              }),
            );
            this.states.set(dm.id, transition.nextState);
            return;
          }
          if (!managed.record.members[message.senderInboxId]) {
            await dm.send(
              ThreadCatalogResponseCodec.encode({
                status: "error",
                groupId: payload.groupId,
                error: protocolError(
                  "verification-required",
                  "join this group before requesting its thread catalog",
                ),
              }),
            );
            this.states.set(dm.id, transition.nextState);
            return;
          }
          try {
            const threads = await getThreadCatalog({
              managed,
              store: this.store,
              logger: this.logger,
            });
            await dm.send(
              ThreadCatalogResponseCodec.encode({
                status: "ok",
                groupId: payload.groupId,
                conversationId: managed.record.xmtpGroupId,
                threads,
              }),
            );
          } catch (err) {
            await dm.send(
              ThreadCatalogResponseCodec.encode({
                status: "error",
                groupId: payload.groupId,
                error:
                  err && typeof err === "object" && "code" in err
                    ? (err as ProtocolError)
                    : protocolError(
                        "internal",
                        err instanceof Error
                          ? err.message
                          : "thread catalog failed",
                      ),
              }),
            );
          }
          this.states.set(dm.id, transition.nextState);
          return;
        }

        case "attempt-join":
          break;
      }

      const payload = message.content as JoinRequestPayload | undefined;
      if (!payload) {
        await this.sendError(
          dm,
          protocolError("malformed", "join-request/2 missing payload"),
        );
        return;
      }

      const outcome = await handleJoinRequest({
        request: payload,
        senderInboxId: message.senderInboxId,
        managed,
        manager: this.manager,
        verification: this.verification,
        logger: this.logger,
      });

      if (!outcome.ok) {
        await sendJoinError(dm, payload.groupId, outcome.error);
        this.states.set(dm.id, applySyncJoinResult(state, false));
        return;
      }

      await sendJoinOk(
        dm,
        payload.groupId,
        outcome.member.name,
        managed.record.xmtpGroupId,
      );
      await announceMemberJoined(
        managed.client,
        managed.record.xmtpGroupId,
        outcome.member,
      );
      this.states.set(dm.id, applySyncJoinResult(state, true));
    } catch (error) {
      this.logger.error(
        {
          err: error,
          groupId: managed.record.groupId,
          senderInboxId: message.senderInboxId,
        },
        "Sync channel handler threw",
      );
      await this.sendError(
        dm,
        protocolError("internal", "unexpected server error"),
      );
    }
  }

  private async sendError(
    dm: Dm<unknown>,
    error: ProtocolError,
  ): Promise<void> {
    try {
      await dm.send(ErrorCodec.encode(error));
    } catch (err) {
      this.logger.error(
        { err, code: error.code },
        "Failed to send error on sync DM",
      );
    }
  }
}
