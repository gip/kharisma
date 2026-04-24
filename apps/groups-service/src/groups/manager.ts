import { randomUUID } from "node:crypto";
import type { KharismaClient } from "../xmtp/client.js";
import { createLocalClient, groupDbPath } from "../xmtp/client.js";
import type { GroupsConfig } from "../config.js";
import type { AppLogger } from "../logging.js";
import type { GroupStore } from "../storage/store.js";
import type { GroupRecord, MemberRecord } from "../storage/schema.js";
import type { GroupLanguageCode } from "@kharisma/protocol";
import { type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";

export type ManagedGroup = {
  record: GroupRecord;
  client: KharismaClient;
};

/**
 * Owns the lifecycle of per-group XMTP clients: creating a new group
 * (including minting and persisting its private key), and rehydrating
 * every persisted group on startup.
 *
 * All mutations of the underlying `GroupStore` go through here so the
 * in-memory `ManagedGroup` map and the on-disk state can never disagree.
 */
export type GroupStartedListener = (managed: ManagedGroup) => void;

export class GroupManager {
  private readonly managed = new Map<string, ManagedGroup>();
  private readonly groupStartedListeners = new Set<GroupStartedListener>();

  constructor(
    private readonly config: GroupsConfig,
    private readonly store: GroupStore,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Register a listener invoked whenever a new per-group client has
   * been started — both during `rehydrate()` and after `createGroup()`.
   * Used by `GroupsService` to attach the sync-channel stream.
   */
  onGroupStarted(listener: GroupStartedListener): void {
    this.groupStartedListeners.add(listener);
  }

  private emitGroupStarted(managed: ManagedGroup): void {
    for (const listener of this.groupStartedListeners) {
      try {
        listener(managed);
      } catch (err) {
        this.logger.error(
          { err, groupId: managed.record.groupId },
          "group-started listener threw",
        );
      }
    }
  }

  /** All currently running groups. */
  all(): ManagedGroup[] {
    return [...this.managed.values()];
  }

  get(groupId: string): ManagedGroup | undefined {
    return this.managed.get(groupId);
  }

  getBySyncInboxId(inboxId: string): ManagedGroup | undefined {
    for (const managed of this.managed.values()) {
      if (managed.record.syncInboxId === inboxId) {
        return managed;
      }
    }
    return undefined;
  }

  /** Start clients for every previously persisted group. */
  async rehydrate(): Promise<void> {
    for (const record of this.store.listGroups()) {
      try {
        const privateKey = this.store.openPrivateKey(record.encryptedPrivateKey);
        const { client } = await createLocalClient({
          config: this.config,
          privateKeyHex: privateKey,
          dbPath: groupDbPath(this.config, record.groupId),
        });
        const managed: ManagedGroup = { record, client };
        this.managed.set(record.groupId, managed);
        this.logger.info(
          { groupId: record.groupId, title: record.title, inboxId: client.inboxId },
          "Rehydrated group client",
        );
        this.emitGroupStarted(managed);
      } catch (error) {
        this.logger.error(
          { err: error, groupId: record.groupId },
          "Failed to rehydrate group client — skipping",
        );
      }
    }
  }

  /**
   * Create a new group:
   * 1. mint a fresh private key,
   * 2. start an XMTP client for it,
   * 3. create an MLS group containing only this identity,
   * 4. persist the encrypted record,
   * 5. return the managed handle.
   */
  async createGroup(input: {
    title: string;
    description: string;
    mediaUrl: string;
    thumbnailUrl: string;
    languages: GroupLanguageCode[];
    joinPolicy: GroupRecord["joinPolicy"];
    maxMembers: number;
    creator?: MemberRecord;
  }): Promise<ManagedGroup> {
    const groupId = randomUUID();
    const privateKey: Hex = generatePrivateKey();

    const dbPath = groupDbPath(this.config, groupId);
    const { client } = await createLocalClient({
      config: this.config,
      privateKeyHex: privateKey,
      dbPath,
    });

    // Create the MLS group without any initial members. It starts
    // locally-only and gets published when the first member is added on
    // a join-request/1.
    const mlsGroup = client.conversations.createGroupOptimistic();

    if (input.creator) {
      await (
        mlsGroup as unknown as { addMembers(inboxIds: string[]): Promise<void> }
      ).addMembers([input.creator.inboxId]);
    }

    const record: GroupRecord = {
      groupId,
      title: input.title,
      description: input.description,
      mediaUrl: input.mediaUrl,
      thumbnailUrl: input.thumbnailUrl,
      languages: input.languages,
      joinPolicy: input.joinPolicy,
      maxMembers: input.maxMembers,
      encryptedPrivateKey: this.store.sealPrivateKey(privateKey),
      syncInboxId: client.inboxId,
      xmtpGroupId: mlsGroup.id,
      members: input.creator ? { [input.creator.inboxId]: input.creator } : {},
      createdAt: new Date().toISOString(),
    };

    this.store.putGroup(record);
    const managed: ManagedGroup = { record, client };
    this.managed.set(groupId, managed);

    this.logger.info(
      {
        groupId,
        title: input.title,
        languages: input.languages,
        syncInboxId: client.inboxId,
        xmtpGroupId: mlsGroup.id,
      },
      "Created new group",
    );

    this.emitGroupStarted(managed);
    return managed;
  }

  /** Replace a group record in both the store and the in-memory map. */
  updateRecord(
    groupId: string,
    mutator: (record: GroupRecord) => GroupRecord,
  ): GroupRecord {
    const next = this.store.updateGroup(groupId, mutator);
    const managed = this.managed.get(groupId);
    if (managed) {
      managed.record = next;
    }
    return next;
  }
}
