import { rmSync } from "node:fs";
import path from "node:path";
import {
  CreateGroupRequestCodec,
  CreateGroupResponseCodec,
  ErrorCodec,
  HelloCodec,
  HumanAgentSubmitCodec,
  HumanSubmitCodec,
  IdentitySubmitCodec,
  InvestmentConfigRequestCodec,
  InvestmentConfigResponseCodec,
  InvestmentSubmitCodec,
  InvestmentSubmitResponseCodec,
  JoinRequestCodec,
  JoinResponseCodec,
  ListGroupsRequestCodec,
  ListGroupsResponseCodec,
  ThreadCreateCodec,
  VerificationAckCodec,
  WalletStatusRequestCodec,
  WalletStatusResponseCodec,
  allCodecs,
  contentTypeEquals,
  normalizeGroupLanguages,
  type CreateGroupResponsePayload,
  type GroupJoinPolicy,
  type GroupLanguageCode,
  type GroupSummary,
  type InvestmentConfigResponsePayload,
  type InvestmentSubmitResponsePayload,
  type JoinResponsePayload,
  type ListGroupsResponsePayload,
  type ProtocolError,
  type VerificationAckPayload,
  type WalletStatusResponsePayload,
} from "@kharisma/protocol";
import { signRequest } from "@worldcoin/idkit-core/signing";
import {
  Client,
  ConsentState,
  IdentifierKind,
  contentTypeText,
  type Conversation,
  type DecodedMessage,
  type Dm,
  type Reply,
} from "@xmtp/node-sdk";
import type { BackendConfig } from "../config.js";
import type { AppLogger } from "../logging.js";
import type {
  AppDatabase,
  UserRecord,
  XmtpAccountRecord,
} from "../storage/database.js";
import type { WebSocketHub } from "../ws/hub.js";
import { getUserXmtpDbPath } from "./paths.js";
import { RemoteWalletSigner } from "./remote-wallet-signer.js";
import {
  encodeVideoMessagePayload,
  serializeConversation,
  serializeMessage,
  type SerializedMessage,
} from "./serializers.js";
import type { SignatureRequestBroker } from "./signature-broker.js";
import {
  GENERAL_THREAD_ID,
  deriveThreadsFromMessages,
  filterMessagesForThread,
  type ThreadSummary,
} from "./threads.js";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPersistedDbKeyMismatchError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("PRAGMA key or salt has incorrect value");
}

type ManagedClient = {
  user: UserRecord;
  account: XmtpAccountRecord | null;
  client: Awaited<ReturnType<typeof Client.create>>;
  lastUsedAt: number;
  streams: Array<{ end?: () => Promise<unknown>; return?: () => Promise<unknown> }>;
};

type KharismaResponseKind = "list-groups" | "create-group";
type VerificationResponseKind = "wallet-status" | "verification-ack";
type InvestmentResponseKind = "investment-config" | "investment-submit";

type KharismaResponse =
  | {
      kind: "list-groups";
      payload: ListGroupsResponsePayload;
    }
  | {
      kind: "create-group";
      payload: CreateGroupResponsePayload;
    };

type VerificationResponse =
  | {
      kind: "wallet-status";
      payload: WalletStatusResponsePayload;
    }
  | {
      kind: "verification-ack";
      payload: VerificationAckPayload;
    };

type InvestmentResponse =
  | {
      kind: "investment-config";
      payload: InvestmentConfigResponsePayload;
    }
  | {
      kind: "investment-submit";
      payload: InvestmentSubmitResponsePayload;
    };

type KharismaMainDm = {
  dm: Dm<unknown>;
  inboxId: string;
};

export type KharismaJoinResult = {
  groupId: string;
  syncInboxId: string;
  name: string;
  conversationId: string;
};

export class XmtpClientManager {
  private readonly clients = new Map<number, ManagedClient>();
  private readonly locks = new Map<number, Promise<ManagedClient>>();
  private readonly idleTimer: NodeJS.Timeout;

  constructor(
    private readonly config: BackendConfig,
    private readonly database: AppDatabase,
    private readonly signatureBroker: SignatureRequestBroker,
    private readonly websocketHub: WebSocketHub,
    private readonly logger: AppLogger,
  ) {
    this.idleTimer = setInterval(() => {
      void this.closeIdleClients();
    }, 60_000);
    this.idleTimer.unref();
  }

  listLoadedClients() {
    return [...this.clients.values()].map((entry) => ({
      userId: entry.user.id,
      walletAddress: entry.user.walletAddress,
      inboxId: entry.client.inboxId ?? entry.account?.inboxId ?? null,
      installationId: entry.client.installationId ?? entry.account?.installationId ?? null,
      dbPath:
        entry.account?.dbPath ??
        getUserXmtpDbPath(this.config.xmtpDataDir, entry.user.walletAddress),
      lastUsedAt: new Date(entry.lastUsedAt).toISOString(),
    }));
  }

  async bootstrapUserClient(user: UserRecord) {
    const managed = await this.getOrCreateClientForUser(user);
    return {
      info: {
        network: this.config.xmtpEnv,
        inboxId: managed.client.inboxId ?? managed.account?.inboxId ?? null,
        identity: user.walletAddress.toLowerCase(),
        installationId:
          managed.client.installationId ?? managed.account?.installationId ?? null,
        identityCount: 1,
        installationCount: 1,
        conversationCount: (await managed.client.conversations.list()).length,
        dmCount: managed.client.conversations.listDms().length,
        groupCount: managed.client.conversations.listGroups().length,
      },
      conversations: await this.listConversations(user),
    };
  }

  async createWorldIdRequest(
    user: UserRecord,
    action: "identity" | "human" | "human-agent" = "identity",
  ) {
    if (
      !this.config.worldIdAppId ||
      !this.config.worldIdRpId ||
      !this.config.worldIdRpSigningKeyHex
    ) {
      throw new Error("World ID is not configured");
    }

    const managed = await this.getOrCreateClientForUser(user);
    const signal = managed.client.inboxId ?? managed.account?.inboxId ?? null;

    if (!signal) {
      throw new Error("XMTP inbox is unavailable for this user");
    }

    const signed = signRequest({
      signingKeyHex: this.config.worldIdRpSigningKeyHex,
      action,
      ttl: this.config.worldIdRequestTtlSeconds,
    });

    return {
      appId: this.config.worldIdAppId,
      action,
      environment: this.config.worldIdEnvironment,
      signal,
      rpContext: {
        rp_id: this.config.worldIdRpId,
        nonce: signed.nonce,
        created_at: signed.createdAt,
        expires_at: signed.expiresAt,
        signature: signed.sig,
      },
    };
  }

  async listKharismaGroups(input: {
    user: UserRecord;
    languages?: GroupLanguageCode[];
  }): Promise<GroupSummary[]> {
    const response = await this.sendKharismaRequest({
      user: input.user,
      expectedKind: "list-groups",
      buildRequest: () =>
        ListGroupsRequestCodec.encode(
          input.languages?.length ? { languages: input.languages } : {},
        ),
    });

    if (response.kind !== "list-groups") {
      throw new Error("Unexpected Kharisma response type");
    }

    return response.payload.groups;
  }

  async createKharismaGroup(input: {
    user: UserRecord;
    title: string;
    description: string;
    mediaUrl: string;
    thumbnailUrl: string;
    languages: GroupLanguageCode[];
    joinPolicy: GroupJoinPolicy;
    maxMembers: number;
  }): Promise<GroupSummary> {
    const languages = normalizeGroupLanguages(input.languages);
    if (!languages || languages.length === 0) {
      throw new Error("languages must include at least one ISO 639-1 code");
    }

    const response = await this.sendKharismaRequest({
      user: input.user,
      helloRole: "H",
      expectedKind: "create-group",
      buildRequest: () =>
        CreateGroupRequestCodec.encode({
          title: input.title,
          description: input.description,
          mediaUrl: input.mediaUrl,
          thumbnailUrl: input.thumbnailUrl,
          languages,
          joinPolicy: input.joinPolicy,
          maxMembers: input.maxMembers,
        }),
    });

    if (response.kind !== "create-group") {
      throw new Error("Unexpected Kharisma response type");
    }

    if (response.payload.status === "error") {
      throw this.protocolResponseError(response.payload.error);
    }

    const profile = this.database.getKharismaProfileByUserId(input.user.id);
    return {
      groupId: response.payload.groupId,
      title: input.title,
      description: input.description,
      mediaUrl: input.mediaUrl,
      thumbnailUrl: input.thumbnailUrl,
      languages,
      syncInboxId: response.payload.syncInboxId,
      memberCount: 1,
      maxMembers: input.maxMembers,
      availableSeats: input.maxMembers - 1,
      joinPolicy: input.joinPolicy,
      isMember: true,
      conversationId: response.payload.conversationId,
      senders: [
        {
          inboxId: managedInboxId(await this.getOrCreateClientForUser(input.user)),
          name: profile?.handle ?? "creator",
          role: "H",
          walletAddress: input.user.walletAddress,
          humanId: profile?.humanId ?? null,
          agentId: null,
          verificationLevel: profile?.verificationLevel ?? "none",
        },
      ],
    };
  }

  async joinKharismaGroup(input: {
    user: UserRecord;
    groupId: string;
    syncInboxId: string;
    name?: string;
  }): Promise<KharismaJoinResult> {
    const managed = await this.getOrCreateClientForUser(input.user);
    const dm = await this.getDmByInboxId(managed, input.syncInboxId);
    const startedAt = new Date();

    await dm.send(
      JoinRequestCodec.encode({
        groupId: input.groupId,
        walletAddress: input.user.walletAddress,
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      }),
    );

    const response = await this.waitForJoinResponse({
      dm,
      syncInboxId: input.syncInboxId,
      startedAt,
    });

    if (response.status === "error") {
      throw this.protocolResponseError(response.error);
    }

    return {
      groupId: response.groupId,
      syncInboxId: input.syncInboxId,
      name: response.name,
      conversationId: response.conversationId,
    };
  }

  async getInvestmentConfig(input: {
    user: UserRecord;
    groupId: string;
    syncInboxId: string;
  }): Promise<InvestmentConfigResponsePayload> {
    const response = await this.sendInvestmentRequest({
      user: input.user,
      syncInboxId: input.syncInboxId,
      expectedKind: "investment-config",
      buildRequest: () =>
        InvestmentConfigRequestCodec.encode({
          groupId: input.groupId,
        }),
    });
    if (response.payload.status === "error") {
      throw this.protocolResponseError(response.payload.error);
    }
    return response.payload as InvestmentConfigResponsePayload;
  }

  async submitInvestment(input: {
    user: UserRecord;
    groupId: string;
    syncInboxId: string;
    chainId: number;
    token: "WLD" | "USDC";
    amount: string;
    txHash?: string;
    userOpHash?: string;
  }): Promise<InvestmentSubmitResponsePayload> {
    const response = await this.sendInvestmentRequest({
      user: input.user,
      syncInboxId: input.syncInboxId,
      expectedKind: "investment-submit",
      buildRequest: () =>
        InvestmentSubmitCodec.encode({
          groupId: input.groupId,
          walletAddress: input.user.walletAddress,
          chainId: input.chainId,
          token: input.token,
          amount: input.amount,
          ...(input.txHash ? { txHash: input.txHash } : {}),
          ...(input.userOpHash ? { userOpHash: input.userOpHash } : {}),
        }),
    });
    if (response.payload.status === "error") {
      throw this.protocolResponseError(response.payload.error);
    }
    return response.payload as InvestmentSubmitResponsePayload;
  }

  async listConversations(user: UserRecord) {
    const managed = await this.getOrCreateClientForUser(user);
    const conversations = await managed.client.conversations.list({
      consentStates: [ConsentState.Allowed, ConsentState.Unknown],
    });

    return Promise.all(
      conversations.map(async (conversation) => serializeConversation(conversation)),
    );
  }

  async listMessages(input: {
    user: UserRecord;
    conversationId: string;
    cursor?: string | null;
    limit?: number;
  }) {
    const managed = await this.getOrCreateClientForUser(input.user);
    const conversation = await this.getConversationById(managed, input.conversationId);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const messages = await conversation.messages();
    const limit = input.limit ?? 50;
    const sorted = [...messages].sort((left, right) =>
      right.sentAt.getTime() - left.sentAt.getTime(),
    );
    const startIndex = input.cursor
      ? Math.max(
          0,
          sorted.findIndex((message) => message.id === input.cursor) + 1,
        )
      : 0;
    const page = sorted.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < sorted.length ? page[page.length - 1]?.id ?? null : null;

    return {
      messages: page.map((message) => serializeMessage(message)),
      nextCursor,
    };
  }

  async sendMessage(input: {
    user: UserRecord;
    conversationId?: string;
    recipientInboxId?: string;
    text: string;
  }) {
    const managed = await this.getOrCreateClientForUser(input.user);
    let conversation: Conversation | undefined;

    if (input.conversationId) {
      conversation = await this.getConversationById(managed, input.conversationId);
    } else if (input.recipientInboxId) {
      conversation = await managed.client.conversations.createDm(input.recipientInboxId);
    }

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const messageId = await conversation.sendText(input.text);
    const message = await conversation.lastMessage();

    if (!message || message.id !== messageId) {
      throw new Error("Message send completed but message could not be reloaded");
    }

    const serializedMessage = serializeMessage(message);
    this.websocketHub.sendToUser(input.user.id, {
      type: "message:sent",
      conversationId: serializedMessage.conversationId,
      message: serializedMessage,
    });

    return serializedMessage;
  }

  async sendRemoteAttachment(input: {
    user: UserRecord;
    conversationId: string;
    url: string;
    mimeType: string;
    filename: string;
    contentLength: number;
    contentDigest: string;
    thumbnailUrl?: string | null;
  }) {
    const managed = await this.getOrCreateClientForUser(input.user);
    const conversation = await this.getConversationById(
      managed,
      input.conversationId,
    );

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Send as a text message with a structured prefix so clients can parse it.
    // Legacy clients only understand "[video] <url>"; when we have richer
    // metadata (thumbnail, mime) we switch to a JSON envelope.
    const text = encodeVideoMessagePayload({
      url: input.url,
      thumbnailUrl: input.thumbnailUrl ?? null,
      mimeType: input.mimeType,
    });
    const messageId = await conversation.sendText(text);
    const message = await conversation.lastMessage();

    if (!message || message.id !== messageId) {
      throw new Error("Attachment send completed but message could not be reloaded");
    }

    const serializedMessage = serializeMessage(message);

    // Enrich with attachment metadata
    const enriched = {
      ...serializedMessage,
      attachment: {
        url: input.url,
        mimeType: input.mimeType,
        filename: input.filename,
        contentLength: input.contentLength,
        thumbnailUrl: input.thumbnailUrl ?? null,
      },
    };

    this.websocketHub.sendToUser(input.user.id, {
      type: "message:sent",
      conversationId: enriched.conversationId,
      message: enriched,
    });

    return enriched;
  }

  async markConversationRead(input: {
    user: UserRecord;
    conversationId: string;
    lastReadMessageId: string | null;
  }) {
    this.database.upsertConversationRead({
      userId: input.user.id,
      conversationId: input.conversationId,
      lastReadMessageId: input.lastReadMessageId,
      lastReadAt: new Date().toISOString(),
    });
  }

  async listThreads(input: {
    user: UserRecord;
    conversationId: string;
  }): Promise<ThreadSummary[]> {
    const messages = await this.loadAllSerializedMessages(
      input.user,
      input.conversationId,
    );
    return deriveThreadsFromMessages({
      conversationId: input.conversationId,
      messages,
    });
  }

  async listThreadMessages(input: {
    user: UserRecord;
    conversationId: string;
    threadId: string;
  }): Promise<{ messages: SerializedMessage[] }> {
    const messages = await this.loadAllSerializedMessages(
      input.user,
      input.conversationId,
    );
    return {
      messages: filterMessagesForThread({
        threadId: input.threadId,
        messages,
      }),
    };
  }

  async createThread(input: {
    user: UserRecord;
    conversationId: string;
    title: string;
  }): Promise<{ thread: ThreadSummary; rootMessage: SerializedMessage }> {
    const managed = await this.getOrCreateClientForUser(input.user);
    const conversation = await this.getConversationById(
      managed,
      input.conversationId,
    );
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const messageId = await conversation.send(
      ThreadCreateCodec.encode({
        title: input.title,
        createdAt: new Date().toISOString(),
      }),
    );
    const message = await conversation.lastMessage();
    if (!message || message.id !== messageId) {
      throw new Error(
        "Thread create completed but message could not be reloaded",
      );
    }

    const serialized = serializeMessage(message);
    this.websocketHub.sendToUser(input.user.id, {
      type: "message:sent",
      conversationId: serialized.conversationId,
      message: serialized,
    });

    return {
      rootMessage: serialized,
      thread: {
        threadId: serialized.id,
        conversationId: serialized.conversationId,
        title: input.title,
        createdAt: serialized.threadCreate?.createdAt ?? serialized.sentAt,
        createdBy: serialized.senderInboxId,
        lastActivityAt: serialized.sentAt,
        lastMessageId: serialized.id,
        lastMessagePreview: `Thread: ${input.title}`,
        lastMessageSenderInboxId: serialized.senderInboxId,
        replyCount: 0,
      },
    };
  }

  async sendThreadMessage(input: {
    user: UserRecord;
    conversationId: string;
    threadId: string;
    text: string;
  }): Promise<SerializedMessage> {
    if (input.threadId === GENERAL_THREAD_ID) {
      // Implicit "General" thread: messages are sent as plain text without
      // a reply reference (preserves compatibility with pre-thread history).
      return this.sendMessage({
        user: input.user,
        conversationId: input.conversationId,
        text: input.text,
      });
    }

    const managed = await this.getOrCreateClientForUser(input.user);
    const conversation = await this.getConversationById(
      managed,
      input.conversationId,
    );
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const reply: Reply = {
      reference: input.threadId,
      content: {
        type: contentTypeText(),
        parameters: {},
        fallback: input.text,
        content: new TextEncoder().encode(input.text),
      },
    };
    const messageId = await conversation.sendReply(reply);
    const message = await conversation.lastMessage();
    if (!message || message.id !== messageId) {
      throw new Error(
        "Thread reply send completed but message could not be reloaded",
      );
    }

    const serialized = serializeMessage(message);
    this.websocketHub.sendToUser(input.user.id, {
      type: "message:sent",
      conversationId: serialized.conversationId,
      message: serialized,
    });
    return serialized;
  }

  async sendThreadAttachment(input: {
    user: UserRecord;
    conversationId: string;
    threadId: string;
    url: string;
    mimeType: string;
    filename: string;
    contentLength: number;
    contentDigest: string;
    thumbnailUrl?: string | null;
  }): Promise<SerializedMessage> {
    if (input.threadId === GENERAL_THREAD_ID) {
      return this.sendRemoteAttachment({
        user: input.user,
        conversationId: input.conversationId,
        url: input.url,
        mimeType: input.mimeType,
        filename: input.filename,
        contentLength: input.contentLength,
        contentDigest: input.contentDigest,
        thumbnailUrl: input.thumbnailUrl,
      });
    }

    const managed = await this.getOrCreateClientForUser(input.user);
    const conversation = await this.getConversationById(
      managed,
      input.conversationId,
    );
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const text = encodeVideoMessagePayload({
      url: input.url,
      thumbnailUrl: input.thumbnailUrl ?? null,
      mimeType: input.mimeType,
    });
    const reply: Reply = {
      reference: input.threadId,
      content: {
        type: contentTypeText(),
        parameters: {},
        fallback: text,
        content: new TextEncoder().encode(text),
      },
    };
    const messageId = await conversation.sendReply(reply);
    const message = await conversation.lastMessage();
    if (!message || message.id !== messageId) {
      throw new Error(
        "Thread attachment send completed but message could not be reloaded",
      );
    }

    const serialized = serializeMessage(message);
    const enriched: SerializedMessage = {
      ...serialized,
      attachment: {
        url: input.url,
        mimeType: input.mimeType,
        filename: input.filename,
        contentLength: input.contentLength,
        thumbnailUrl: input.thumbnailUrl ?? null,
      },
    };
    this.websocketHub.sendToUser(input.user.id, {
      type: "message:sent",
      conversationId: enriched.conversationId,
      message: enriched,
    });
    return enriched;
  }

  /**
   * Cross-Circle latest threads: pulls every group conversation the user
   * is a member of and returns the latest thread per (or top N).
   *
   * Naive implementation — fine while a user is in a handful of groups.
   * If membership grows, replace with a SQLite projection.
   */
  async listLatestThreads(input: {
    user: UserRecord;
    limit?: number;
  }): Promise<ThreadSummary[]> {
    const limit = input.limit ?? 50;
    const managed = await this.getOrCreateClientForUser(input.user);
    const groups = managed.client.conversations.listGroups();

    const allThreads: ThreadSummary[] = [];
    for (const group of groups) {
      const messages = await group.messages();
      const serialized = messages.map((m) => serializeMessage(m));
      const threads = deriveThreadsFromMessages({
        conversationId: group.id,
        messages: serialized,
      });
      for (const thread of threads) allThreads.push(thread);
    }

    return allThreads
      .sort(
        (left, right) =>
          new Date(right.lastActivityAt).getTime() -
          new Date(left.lastActivityAt).getTime(),
      )
      .slice(0, limit);
  }

  private async loadAllSerializedMessages(
    user: UserRecord,
    conversationId: string,
  ): Promise<SerializedMessage[]> {
    const managed = await this.getOrCreateClientForUser(user);
    const conversation = await this.getConversationById(managed, conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    const messages = await conversation.messages();
    return messages.map((m) => serializeMessage(m));
  }

  private async getConversationById(
    managed: ManagedClient,
    conversationId: string,
  ): Promise<Conversation | undefined> {
    const existing =
      await managed.client.conversations.getConversationById(conversationId);

    if (existing) {
      return existing;
    }

    await managed.client.conversations.syncAll([
      ConsentState.Allowed,
      ConsentState.Unknown,
    ]).catch((error) => {
      this.logger.warn(
        {
          err: error,
          userId: managed.user.id,
          conversationId,
        },
        "XMTP conversation sync before lookup failed",
      );
    });

    return managed.client.conversations.getConversationById(conversationId);
  }

  private async getOrCreateClientForUser(user: UserRecord): Promise<ManagedClient> {
    const cached = this.clients.get(user.id);

    if (cached) {
      cached.lastUsedAt = Date.now();
      this.database.touchXmtpAccount(user.id);
      this.logger.debug({ userId: user.id }, "Reused cached XMTP client");
      return cached;
    }

    const existingLock = this.locks.get(user.id);
    if (existingLock) {
      return existingLock;
    }

    const lock = this.createClientForUser(user).finally(() => {
      this.locks.delete(user.id);
    });
    this.locks.set(user.id, lock);
    return lock;
  }

  private async createClientForUser(user: UserRecord) {
    const existingAccount = this.database.getXmtpAccountByUserId(user.id);
    const now = new Date().toISOString();
    let client: Awaited<ReturnType<typeof Client.create>>;
    let account = existingAccount;

    const baseClientOptions = {
      env: this.config.xmtpEnv,
      appVersion: this.config.xmtpAppVersion,
      structuredLogging: true,
    } as NonNullable<ConstructorParameters<typeof Client>[0]>;

    if (existingAccount) {
      try {
        client = await Client.build(
          {
            identifier: user.walletAddress.toLowerCase(),
            identifierKind: IdentifierKind.Ethereum,
          },
          {
            ...baseClientOptions,
            dbPath: existingAccount.dbPath,
            dbEncryptionKey: this.config.xmtpDbEncryptionKey,
            codecs: [...allCodecs],
          } as Parameters<typeof Client.build>[1],
        );
        this.logger.info(
          {
            dbPath: existingAccount.dbPath,
            userId: user.id,
            walletAddress: user.walletAddress,
          },
          "Reopened persisted XMTP client",
        );
      } catch (error) {
        if (isPersistedDbKeyMismatchError(error)) {
          this.resetPersistedClientState(user, existingAccount, error);
          throw new Error(
            `XMTP local storage was reset for ${user.walletAddress} because the persisted database key no longer matches. Retry XMTP bootstrap to create a fresh client.`,
          );
        }

        this.logger.error(
          {
            dbPath: existingAccount.dbPath,
            err: error,
            userId: user.id,
            walletAddress: user.walletAddress,
          },
          "Failed to reopen persisted XMTP client",
        );
        throw new Error(
          `Failed to reopen persisted XMTP client for ${user.walletAddress}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
    } else {
      const dbPath = getUserXmtpDbPath(this.config.xmtpDataDir, user.walletAddress);
      rmSync(path.dirname(dbPath), { recursive: true, force: true });
      const freshDbPath = getUserXmtpDbPath(this.config.xmtpDataDir, user.walletAddress);
      const signer = await new RemoteWalletSigner(
        user,
        this.signatureBroker,
      ).createSigner();

      client = await Client.create(
        signer,
        {
          ...baseClientOptions,
          dbPath: freshDbPath,
          dbEncryptionKey: this.config.xmtpDbEncryptionKey,
          codecs: [...allCodecs],
        } as Parameters<typeof Client.create>[1],
      );

      this.database.upsertXmtpAccount({
        userId: user.id,
        walletAddress: user.walletAddress,
        inboxId: client.inboxId ?? null,
        installationId: client.installationId ?? null,
        dbPath: freshDbPath,
        dbEncryptionKeyHex: this.config.xmtpDbEncryptionKey.replace(/^0x/, ""),
        lastInitializedAt: now,
      });
      account = this.database.getXmtpAccountByUserId(user.id);
      this.logger.info(
        {
          dbPath: freshDbPath,
          userId: user.id,
          walletAddress: user.walletAddress,
        },
        "Created XMTP client",
      );
    }

    this.database.touchXmtpAccount(user.id);

    try {
      await client.conversations.syncAll([ConsentState.Allowed, ConsentState.Unknown]);
    } catch (error) {
      this.logger.warn(
        {
          err: error,
          userId: user.id,
          walletAddress: user.walletAddress,
        },
        "Initial XMTP conversation sync failed",
      );
      this.websocketHub.sendToUser(user.id, {
        type: "sync:required",
        reason: "Initial conversation sync failed",
      });
    }

    const managed: ManagedClient = {
      user,
      account,
      client,
      lastUsedAt: Date.now(),
      streams: [],
    };

    await this.attachStreams(managed);
    this.clients.set(user.id, managed);
    this.logger.debug({ userId: user.id }, "Attached XMTP client streams");

    this.websocketHub.sendToUser(user.id, {
      type: "xmtp.ready",
      inboxId: client.inboxId ?? account?.inboxId ?? null,
      installationId: client.installationId ?? account?.installationId ?? null,
    });

    return managed;
  }

  private async getKharismaMainDm(
    managed: ManagedClient,
  ): Promise<KharismaMainDm> {
    if (this.config.kharismaMainAddress) {
      const identifier = {
        identifier: this.config.kharismaMainAddress.toLowerCase(),
        identifierKind: IdentifierKind.Ethereum,
      };

      const existing =
        await managed.client.conversations.fetchDmByIdentifier(identifier);
      const dm =
        existing ?? (await managed.client.conversations.createDmWithIdentifier(identifier));

      return {
        dm: dm as Dm<unknown>,
        inboxId: dm.peerInboxId,
      };
    }

    if (!this.config.kharismaMainInboxId) {
      throw new Error(
        "Kharisma is not configured: missing KHARISMA_MAIN_ADDRESS or KHARISMA_MAIN_INBOX_ID",
      );
    }

    return {
      dm: await this.getDmByInboxId(managed, this.config.kharismaMainInboxId),
      inboxId: this.config.kharismaMainInboxId,
    };
  }

  private async getDmByInboxId(
    managed: ManagedClient,
    inboxId: string,
  ): Promise<Dm<unknown>> {
    const existing = managed.client.conversations.getDmByInboxId(inboxId);

    if (existing) {
      return existing as Dm<unknown>;
    }

    return (await managed.client.conversations.createDm(inboxId)) as Dm<unknown>;
  }

  private protocolResponseError(error: ProtocolError): Error {
    return new Error(`Kharisma protocol error (${error.code}): ${error.message}`);
  }

  private decodeKharismaResponse(
    message: DecodedMessage,
  ): KharismaResponse | Error | null {
    if (contentTypeEquals(message.contentType, ErrorCodec.contentType)) {
      return this.protocolResponseError(message.content as ProtocolError);
    }

    if (
      contentTypeEquals(message.contentType, ListGroupsResponseCodec.contentType)
    ) {
      return {
        kind: "list-groups",
        payload: message.content as ListGroupsResponsePayload,
      };
    }

    if (
      contentTypeEquals(message.contentType, CreateGroupResponseCodec.contentType)
    ) {
      return {
        kind: "create-group",
        payload: message.content as CreateGroupResponsePayload,
      };
    }

    return null;
  }

  private decodeVerificationResponse(
    message: DecodedMessage,
  ): VerificationResponse | Error | null {
    if (contentTypeEquals(message.contentType, ErrorCodec.contentType)) {
      return this.protocolResponseError(message.content as ProtocolError);
    }

    if (contentTypeEquals(message.contentType, WalletStatusResponseCodec.contentType)) {
      return {
        kind: "wallet-status",
        payload: message.content as WalletStatusResponsePayload,
      };
    }

    if (contentTypeEquals(message.contentType, VerificationAckCodec.contentType)) {
      return {
        kind: "verification-ack",
        payload: message.content as VerificationAckPayload,
      };
    }

    return null;
  }

  private decodeJoinResponse(
    message: DecodedMessage,
  ): JoinResponsePayload | Error | null {
    if (contentTypeEquals(message.contentType, ErrorCodec.contentType)) {
      return this.protocolResponseError(message.content as ProtocolError);
    }

    if (contentTypeEquals(message.contentType, JoinResponseCodec.contentType)) {
      return message.content as JoinResponsePayload;
    }

    return null;
  }

  private decodeInvestmentResponse(
    message: DecodedMessage,
  ): InvestmentResponse | Error | null {
    if (contentTypeEquals(message.contentType, ErrorCodec.contentType)) {
      return this.protocolResponseError(message.content as ProtocolError);
    }

    if (
      contentTypeEquals(
        message.contentType,
        InvestmentConfigResponseCodec.contentType,
      )
    ) {
      return {
        kind: "investment-config",
        payload: message.content as InvestmentConfigResponsePayload,
      };
    }

    if (
      contentTypeEquals(
        message.contentType,
        InvestmentSubmitResponseCodec.contentType,
      )
    ) {
      return {
        kind: "investment-submit",
        payload: message.content as InvestmentSubmitResponsePayload,
      };
    }

    return null;
  }

  private async waitForKharismaResponse(input: {
    dm: Dm<unknown>;
    expectedKind: KharismaResponseKind;
    senderInboxId: string;
    startedAt: Date;
  }): Promise<KharismaResponse> {
    const deadline = Date.now() + this.config.kharismaRequestTimeoutMs;

    while (Date.now() <= deadline) {
      await input.dm.sync().catch((error) => {
        this.logger.warn({ err: error }, "Kharisma main DM sync failed");
      });

      const messages = await input.dm.messages();
      const sorted = [...messages].sort(
        (left, right) => left.sentAt.getTime() - right.sentAt.getTime(),
      );

      for (const message of sorted) {
        if (message.senderInboxId !== input.senderInboxId) {
          continue;
        }

        if (message.sentAt.getTime() < input.startedAt.getTime()) {
          continue;
        }

        const decoded = this.decodeKharismaResponse(message);
        if (!decoded) {
          continue;
        }

        if (decoded instanceof Error) {
          throw decoded;
        }

        if (decoded.kind !== input.expectedKind) {
          continue;
        }

        return decoded;
      }

      await delay(500);
    }

    throw new Error("Timed out waiting for Kharisma protocol response");
  }

  private async waitForJoinResponse(input: {
    dm: Dm<unknown>;
    syncInboxId: string;
    startedAt: Date;
  }): Promise<JoinResponsePayload> {
    const deadline = Date.now() + this.config.kharismaRequestTimeoutMs;

    while (Date.now() <= deadline) {
      await input.dm.sync().catch((error) => {
        this.logger.warn({ err: error }, "Kharisma sync DM sync failed");
      });

      const messages = await input.dm.messages();
      const sorted = [...messages].sort(
        (left, right) => left.sentAt.getTime() - right.sentAt.getTime(),
      );

      for (const message of sorted) {
        if (message.senderInboxId !== input.syncInboxId) {
          continue;
        }

        if (message.sentAt.getTime() < input.startedAt.getTime()) {
          continue;
        }

        const decoded = this.decodeJoinResponse(message);
        if (!decoded) {
          continue;
        }

        if (decoded instanceof Error) {
          throw decoded;
        }

        return decoded;
      }

      await delay(500);
    }

    throw new Error("Timed out waiting for Kharisma join response");
  }

  private async waitForInvestmentResponse(input: {
    dm: Dm<unknown>;
    syncInboxId: string;
    expectedKind: InvestmentResponseKind;
    startedAt: Date;
  }): Promise<InvestmentResponse> {
    const deadline = Date.now() + this.config.kharismaRequestTimeoutMs;

    while (Date.now() <= deadline) {
      await input.dm.sync().catch((error) => {
        this.logger.warn({ err: error }, "Kharisma investment DM sync failed");
      });

      const messages = await input.dm.messages();
      const sorted = [...messages].sort(
        (left, right) => left.sentAt.getTime() - right.sentAt.getTime(),
      );

      for (const message of sorted) {
        if (message.senderInboxId !== input.syncInboxId) {
          continue;
        }
        if (message.sentAt.getTime() < input.startedAt.getTime()) {
          continue;
        }

        const decoded = this.decodeInvestmentResponse(message);
        if (!decoded) {
          continue;
        }
        if (decoded instanceof Error) {
          throw decoded;
        }
        if (decoded.kind !== input.expectedKind) {
          continue;
        }
        return decoded;
      }

      await delay(500);
    }

    throw new Error("Timed out waiting for Kharisma investment response");
  }

  private async waitForVerificationResponse(input: {
    dm: Dm<unknown>;
    expectedKind: VerificationResponseKind;
    senderInboxId: string;
    startedAt: Date;
  }): Promise<VerificationResponse> {
    const deadline = Date.now() + this.config.kharismaRequestTimeoutMs;

    while (Date.now() <= deadline) {
      await input.dm.sync().catch((error) => {
        this.logger.warn({ err: error }, "Kharisma verification DM sync failed");
      });

      const messages = await input.dm.messages();
      const sorted = [...messages].sort(
        (left, right) => left.sentAt.getTime() - right.sentAt.getTime(),
      );

      for (const message of sorted) {
        if (message.senderInboxId !== input.senderInboxId) {
          continue;
        }
        if (message.sentAt.getTime() < input.startedAt.getTime()) {
          continue;
        }

        const decoded = this.decodeVerificationResponse(message);
        if (!decoded) {
          continue;
        }
        if (decoded instanceof Error) {
          throw decoded;
        }
        if (decoded.kind !== input.expectedKind) {
          continue;
        }
        return decoded;
      }

      await delay(500);
    }

    throw new Error("Timed out waiting for Kharisma verification response");
  }

  private async sendKharismaRequest(input: {
    user: UserRecord;
    helloRole?: "H" | "HA";
    expectedKind: KharismaResponseKind;
    buildRequest: () => ReturnType<typeof ListGroupsRequestCodec.encode>;
  }): Promise<KharismaResponse> {
    const managed = await this.getOrCreateClientForUser(input.user);
    const mainDm = await this.getKharismaMainDm(managed);
    const startedAt = new Date();

    if (input.helloRole) {
      await mainDm.dm.send(
        HelloCodec.encode({
          role: input.helloRole,
          walletAddress: input.user.walletAddress,
        }),
      );
    }
    await mainDm.dm.send(input.buildRequest());

    return this.waitForKharismaResponse({
      dm: mainDm.dm,
      expectedKind: input.expectedKind,
      senderInboxId: mainDm.inboxId,
      startedAt,
    });
  }

  private async sendSyncVerificationRequest(input: {
    user: UserRecord;
    syncInboxId: string;
    expectedKind: VerificationResponseKind;
    buildRequest: () => ReturnType<typeof WalletStatusRequestCodec.encode>;
  }): Promise<VerificationResponse> {
    const managed = await this.getOrCreateClientForUser(input.user);
    const dm = await this.getDmByInboxId(managed, input.syncInboxId);
    const startedAt = new Date();

    await dm.send(input.buildRequest());

    return this.waitForVerificationResponse({
      dm,
      expectedKind: input.expectedKind,
      senderInboxId: input.syncInboxId,
      startedAt,
    });
  }

  private async sendInvestmentRequest(input: {
    user: UserRecord;
    syncInboxId: string;
    expectedKind: InvestmentResponseKind;
    buildRequest: () =>
      | ReturnType<typeof InvestmentConfigRequestCodec.encode>
      | ReturnType<typeof InvestmentSubmitCodec.encode>;
  }): Promise<InvestmentResponse> {
    const managed = await this.getOrCreateClientForUser(input.user);
    const dm = await this.getDmByInboxId(managed, input.syncInboxId);
    const startedAt = new Date();

    await dm.send(input.buildRequest());

    return this.waitForInvestmentResponse({
      dm,
      syncInboxId: input.syncInboxId,
      expectedKind: input.expectedKind,
      startedAt,
    });
  }

  private cacheKharismaProfile(
    user: UserRecord,
    payload: WalletStatusResponsePayload | VerificationAckPayload,
  ) {
    return this.database.upsertKharismaProfile({
      userId: user.id,
      walletAddress: user.walletAddress,
      status:
        "resolvedStatus" in payload ? payload.resolvedStatus : payload.status,
      verificationLevel: payload.verificationLevel,
      humanId: payload.humanId,
      agentId: payload.agentId,
      handle: payload.handle,
    });
  }

  async getKharismaWalletStatus(input: { user: UserRecord }) {
    const managed = await this.getOrCreateClientForUser(input.user);
    const mainDm = await this.getKharismaMainDm(managed);
    const startedAt = new Date();

    await mainDm.dm.send(
      WalletStatusRequestCodec.encode({
        walletAddress: input.user.walletAddress,
      }),
    );

    const response = await this.waitForVerificationResponse({
      dm: mainDm.dm,
      expectedKind: "wallet-status",
      senderInboxId: mainDm.inboxId,
      startedAt,
    });

    this.cacheKharismaProfile(input.user, response.payload);
    return response.payload;
  }

  async submitKharismaIdentityVerification(input: {
    user: UserRecord;
    proof: unknown;
  }) {
    const managed = await this.getOrCreateClientForUser(input.user);
    const mainDm = await this.getKharismaMainDm(managed);
    const startedAt = new Date();

    await mainDm.dm.send(
      IdentitySubmitCodec.encode({
        walletAddress: input.user.walletAddress,
        proof: input.proof,
      }),
    );

    const response = await this.waitForVerificationResponse({
      dm: mainDm.dm,
      expectedKind: "verification-ack",
      senderInboxId: mainDm.inboxId,
      startedAt,
    });
    this.cacheKharismaProfile(input.user, response.payload);
    if (response.payload.status === "error" && response.payload.error) {
      throw this.protocolResponseError(response.payload.error);
    }
    return response.payload;
  }

  async submitKharismaHumanVerification(input: {
    user: UserRecord;
    handle: string;
    proof: unknown;
  }) {
    const managed = await this.getOrCreateClientForUser(input.user);
    const mainDm = await this.getKharismaMainDm(managed);
    const startedAt = new Date();

    await mainDm.dm.send(
      HumanSubmitCodec.encode({
        walletAddress: input.user.walletAddress,
        handle: input.handle,
        proof: input.proof,
      }),
    );

    const response = await this.waitForVerificationResponse({
      dm: mainDm.dm,
      expectedKind: "verification-ack",
      senderInboxId: mainDm.inboxId,
      startedAt,
    });
    this.cacheKharismaProfile(input.user, response.payload);
    if (response.payload.status === "error" && response.payload.error) {
      throw this.protocolResponseError(response.payload.error);
    }
    return response.payload;
  }

  async getKharismaSyncWalletStatus(input: {
    user: UserRecord;
    syncInboxId: string;
  }) {
    const response = await this.sendSyncVerificationRequest({
      user: input.user,
      syncInboxId: input.syncInboxId,
      expectedKind: "wallet-status",
      buildRequest: () =>
        WalletStatusRequestCodec.encode({
          walletAddress: input.user.walletAddress,
        }),
    });

    this.cacheKharismaProfile(input.user, response.payload);
    return response.payload;
  }

  async submitKharismaSyncIdentityVerification(input: {
    user: UserRecord;
    syncInboxId: string;
    proof: unknown;
  }) {
    const response = await this.sendSyncVerificationRequest({
      user: input.user,
      syncInboxId: input.syncInboxId,
      expectedKind: "verification-ack",
      buildRequest: () =>
        IdentitySubmitCodec.encode({
          walletAddress: input.user.walletAddress,
          proof: input.proof,
        }),
    });

    this.cacheKharismaProfile(input.user, response.payload);
    if (response.payload.status === "error" && response.payload.error) {
      throw this.protocolResponseError(response.payload.error);
    }
    return response.payload;
  }

  async submitKharismaSyncHumanVerification(input: {
    user: UserRecord;
    syncInboxId: string;
    handle: string;
    proof: unknown;
  }) {
    const response = await this.sendSyncVerificationRequest({
      user: input.user,
      syncInboxId: input.syncInboxId,
      expectedKind: "verification-ack",
      buildRequest: () =>
        HumanSubmitCodec.encode({
          walletAddress: input.user.walletAddress,
          handle: input.handle,
          proof: input.proof,
        }),
    });

    this.cacheKharismaProfile(input.user, response.payload);
    if (response.payload.status === "error" && response.payload.error) {
      throw this.protocolResponseError(response.payload.error);
    }
    return response.payload;
  }

  async submitKharismaSyncHumanAgentVerification(input: {
    user: UserRecord;
    syncInboxId: string;
    ownerHumanId: string;
    handle: string;
    proof: unknown;
  }) {
    const response = await this.sendSyncVerificationRequest({
      user: input.user,
      syncInboxId: input.syncInboxId,
      expectedKind: "verification-ack",
      buildRequest: () =>
        HumanAgentSubmitCodec.encode({
          walletAddress: input.user.walletAddress,
          ownerHumanId: input.ownerHumanId,
          handle: input.handle,
          proof: input.proof,
        }),
    });

    this.cacheKharismaProfile(input.user, response.payload);
    if (response.payload.status === "error" && response.payload.error) {
      throw this.protocolResponseError(response.payload.error);
    }
    return response.payload;
  }

  private resetPersistedClientState(
    user: UserRecord,
    account: XmtpAccountRecord,
    error: unknown,
  ) {
    this.database.deleteXmtpAccount(user.id);

    try {
      rmSync(path.dirname(account.dbPath), { recursive: true, force: true });
    } catch (cleanupError) {
      this.logger.warn(
        {
          cleanupError,
          dbPath: account.dbPath,
          userId: user.id,
          walletAddress: user.walletAddress,
        },
        "Failed to remove stale XMTP client storage after key mismatch",
      );
    }

    this.logger.warn(
      {
        dbPath: account.dbPath,
        err: error,
        userId: user.id,
        walletAddress: user.walletAddress,
      },
      "Reset stale persisted XMTP client after key mismatch",
    );
  }

  private async attachStreams(managed: ManagedClient) {
    const conversationStream = await managed.client.conversations.stream();
    const messageStream = await managed.client.conversations.streamAllMessages({
      consentStates: [ConsentState.Allowed, ConsentState.Unknown],
    });

    managed.streams.push(conversationStream, messageStream);

    void this.consumeConversationStream(managed, conversationStream);
    void this.consumeMessageStream(managed, messageStream);
  }

  private async consumeConversationStream(
    managed: ManagedClient,
    stream: AsyncIterable<Conversation>,
  ) {
    try {
      for await (const conversation of stream) {
        const serialized = await serializeConversation(conversation);
        this.websocketHub.sendToUser(managed.user.id, {
          type: "conversation:new",
          conversation: serialized,
        });
      }
    } catch (error) {
      this.logger.warn(
        {
          err: error,
          userId: managed.user.id,
        },
        "Conversation stream failed",
      );
      this.websocketHub.sendToUser(managed.user.id, {
        type: "sync:required",
        reason: error instanceof Error ? error.message : "Conversation stream failed",
      });
    }
  }

  private async consumeMessageStream(
    managed: ManagedClient,
    stream: AsyncIterable<DecodedMessage>,
  ) {
    try {
      for await (const message of stream) {
        const serialized = serializeMessage(message);
        this.websocketHub.sendToUser(managed.user.id, {
          type: "message:new",
          conversationId: serialized.conversationId,
          message: serialized,
        });
      }
    } catch (error) {
      this.logger.warn(
        {
          err: error,
          userId: managed.user.id,
        },
        "Message stream failed",
      );
      this.websocketHub.sendToUser(managed.user.id, {
        type: "sync:required",
        reason: error instanceof Error ? error.message : "Message stream failed",
      });
    }
  }

  private async closeIdleClients() {
    const cutoff = Date.now() - this.config.idleClientTtlMs;
    const staleClients = [...this.clients.values()].filter(
      (entry) => entry.lastUsedAt < cutoff,
    );

    if (staleClients.length > 0) {
      this.logger.info(
        { staleClientCount: staleClients.length },
        "Closing idle XMTP clients",
      );
    }

    for (const entry of staleClients) {
      for (const stream of entry.streams) {
        try {
          if (typeof stream.end === "function") {
            await stream.end();
          } else if (typeof stream.return === "function") {
            await stream.return();
          }
        } catch {
          // Ignore shutdown errors for stale streams.
        }
      }

      this.clients.delete(entry.user.id);
      this.logger.debug(
        {
          userId: entry.user.id,
          walletAddress: entry.user.walletAddress,
        },
        "Closed idle XMTP client",
      );
    }
  }
}

function managedInboxId(managed: ManagedClient) {
  return managed.client.inboxId ?? managed.account?.inboxId ?? "";
}
