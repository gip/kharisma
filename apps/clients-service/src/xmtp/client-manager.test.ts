import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContentTypeCreateGroupRequest,
  ContentTypeHello,
  ContentTypeIdentitySubmit,
  ContentTypeJoinRequest,
  ContentTypeListGroupsRequest,
  ContentTypeVerificationAck,
  ContentTypeWalletStatusRequest,
  CreateGroupRequestCodec,
  IdentitySubmitCodec,
  ListGroupsRequestCodec,
  contentTypeEquals,
} from "@kharisma/protocol";
import type { DecodedMessage } from "@xmtp/node-sdk";
import type { BackendConfig } from "../config.js";
import type { AppLogger } from "../logging.js";
import type { UserRecord, XmtpAccountRecord } from "../storage/database.js";
import { XmtpClientManager } from "./client-manager.js";

const { createSigner, clientBuild, clientCreate } = vi.hoisted(() => ({
  createSigner: vi.fn(async () => ({})),
  clientBuild: vi.fn(),
  clientCreate: vi.fn(),
}));

vi.mock("./remote-wallet-signer.js", () => ({
  RemoteWalletSigner: class {
    async createSigner() {
      return createSigner();
    }
  },
}));

vi.mock("@xmtp/node-sdk", () => ({
  Client: {
    build: clientBuild,
    create: clientCreate,
  },
  ConsentState: {
    Allowed: "allowed",
    Unknown: "unknown",
  },
  IdentifierKind: {
    Ethereum: "Ethereum",
  },
}));

type LoggedEntry = {
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  bindings: Record<string, unknown>;
  args: unknown[];
};

type UpsertXmtpAccountInput = {
  userId: number;
  walletAddress: `0x${string}`;
  inboxId: string | null;
  installationId: string | null;
  dbPath: string;
  dbEncryptionKeyHex: string;
  lastInitializedAt: string;
};

function createSpyLogger(
  bindings: Record<string, unknown> = {},
  entries: LoggedEntry[] = [],
): AppLogger {
  return {
    child(childBindings) {
      return createSpyLogger({ ...bindings, ...childBindings }, entries);
    },
    trace(...args) {
      entries.push({ level: "trace", bindings, args });
    },
    debug(...args) {
      entries.push({ level: "debug", bindings, args });
    },
    info(...args) {
      entries.push({ level: "info", bindings, args });
    },
    warn(...args) {
      entries.push({ level: "warn", bindings, args });
    },
    error(...args) {
      entries.push({ level: "error", bindings, args });
    },
    fatal(...args) {
      entries.push({ level: "fatal", bindings, args });
    },
  };
}

function createTestConfig(overrides: Partial<BackendConfig> = {}): BackendConfig {
  return {
    appDataDir: "/tmp/app",
    appOrigin: "http://localhost:3000",
    authChallengeTtlMs: 1000,
    corsAllowedOrigins: ["http://localhost:3000"],
    dataRoot: "/tmp",
    host: "127.0.0.1",
    idleClientTtlMs: 60_000,
    logLevel: "info",
    masterKeyHex:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    metadataDbPath: "/tmp/backend.sqlite",
    mediaUploadsDir: "/tmp/uploads",
    mediaStorageProvider: "local",
    mediaPublicBaseUrl: "",
    r2AccountId: "",
    r2Bucket: "",
    r2AccessKeyId: "",
    r2SecretAccessKey: "",
    port: 0,
    rpcUrls: {},
    sessionSecret: "secret",
    sessionTtlMs: 1000,
    signatureRequestTimeoutMs: 1000,
    xmtpDbEncryptionKey:
      "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    x402Enabled: false,
    x402FacilitatorUrl: "https://x402.org/facilitator",
    x402Network: "eip155:84532",
    x402PayTo: "0x1111111111111111111111111111111111111111",
    x402PriceUsd: "$0.01",
    kharismaMainAddress: "",
    kharismaMainInboxId: "kharisma-main-inbox",
    kharismaRequestTimeoutMs: 1_000,
    worldIdAppId: "app_test",
    worldIdRpId: "rp_test",
    worldIdRpSigningKeyHex:
      "0x2222222222222222222222222222222222222222222222222222222222222222",
    worldIdAction: "human",
    worldIdEnvironment: "staging",
    xmtpAppVersion: "kharisma-backend/test",
    xmtpDataDir: "/tmp/xmtp",
    xmtpEnv: "dev",
    adminToken: "admin-token",
    ...overrides,
  };
}

const user: UserRecord = {
  id: 1,
  walletAddress: "0x1111111111111111111111111111111111111111",
  walletAccountType: "EOA",
  walletChainId: 8453,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("XmtpClientManager logging", () => {
  beforeEach(() => {
    createSigner.mockClear();
    clientBuild.mockReset();
    clientCreate.mockReset();
  });

  it("logs initial sync failures", async () => {
    const entries: LoggedEntry[] = [];
    let account: XmtpAccountRecord | null = null;
    clientCreate.mockResolvedValue({
      inboxId: "inbox-id",
      installationId: "installation-id",
      conversations: {
        list: vi.fn(async () => []),
        listDms: vi.fn(() => []),
        listGroups: vi.fn(() => []),
        stream: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        streamAllMessages: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        syncAll: vi.fn(async () => {
          throw new Error("sync failed");
        }),
      },
    });

    const manager = new XmtpClientManager(
      {
        appDataDir: "/tmp/app",
        appOrigin: "http://localhost:3000",
        authChallengeTtlMs: 1000,
        corsAllowedOrigins: ["http://localhost:3000"],
        dataRoot: "/tmp",
        host: "127.0.0.1",
        idleClientTtlMs: 60_000,
        logLevel: "info",
        masterKeyHex:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        metadataDbPath: "/tmp/backend.sqlite",
        mediaUploadsDir: "/tmp/uploads",
        mediaStorageProvider: "local",
        mediaPublicBaseUrl: "",
        r2AccountId: "",
        r2Bucket: "",
        r2AccessKeyId: "",
        r2SecretAccessKey: "",
        port: 0,
        rpcUrls: {},
        sessionSecret: "secret",
        sessionTtlMs: 1000,
        signatureRequestTimeoutMs: 1000,
        xmtpDbEncryptionKey:
          "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        x402Enabled: false,
        x402FacilitatorUrl: "https://x402.org/facilitator",
        x402Network: "eip155:84532",
        x402PayTo: "0x1111111111111111111111111111111111111111",
        x402PriceUsd: "$0.01",
        kharismaMainAddress: "",
        kharismaMainInboxId: "kharisma-main-inbox",
        kharismaRequestTimeoutMs: 1_000,
        worldIdAppId: "app_test",
        worldIdRpId: "rp_test",
        worldIdRpSigningKeyHex:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        worldIdAction: "human",
        worldIdEnvironment: "staging",
        xmtpAppVersion: "kharisma-backend/test",
        xmtpDataDir: "/tmp/xmtp",
        xmtpEnv: "dev",
        adminToken: "admin-token",
      },
      {
        getXmtpAccountByUserId: vi.fn(() => account),
        getKharismaProfileByUserId: vi.fn(() => null),
        touchXmtpAccount: vi.fn(),
        upsertXmtpAccount: vi.fn((input: UpsertXmtpAccountInput) => {
          account = {
            userId: input.userId,
            walletAddress: input.walletAddress,
            inboxId: input.inboxId,
            installationId: input.installationId,
            dbPath: input.dbPath,
            encryptedDbEncryptionKey: input.dbEncryptionKeyHex,
            lastInitializedAt: input.lastInitializedAt,
            lastSeenAt: null,
          };
        }),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[1],
      {} as unknown as ConstructorParameters<typeof XmtpClientManager>[2],
      {
        sendToUser: vi.fn(),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[3],
      createSpyLogger({}, entries),
    );
    const user: UserRecord = {
      id: 1,
      walletAddress: "0x1111111111111111111111111111111111111111",
      walletAccountType: "EOA",
      walletChainId: 8453,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await manager.bootstrapUserClient(user);

    expect(result.info.inboxId).toBe("inbox-id");
    const warnLog = entries.find(
      (entry) =>
        entry.level === "warn" && entry.args[1] === "Initial XMTP conversation sync failed",
    );
    expect(warnLog).toBeDefined();
    expect(warnLog?.args[0]).toMatchObject({
      userId: user.id,
      walletAddress: user.walletAddress,
    });
  });

  it("creates World ID request context with the user's XMTP inbox as signal", async () => {
    let account: XmtpAccountRecord | null = null;
    clientCreate.mockResolvedValue({
      inboxId: "inbox-id",
      installationId: "installation-id",
      conversations: {
        list: vi.fn(async () => []),
        listDms: vi.fn(() => []),
        listGroups: vi.fn(() => []),
        stream: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        streamAllMessages: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        syncAll: vi.fn(async () => undefined),
      },
    });

    const manager = new XmtpClientManager(
      createTestConfig(),
      {
        getXmtpAccountByUserId: vi.fn(() => account),
        touchXmtpAccount: vi.fn(),
        upsertXmtpAccount: vi.fn((input: UpsertXmtpAccountInput) => {
          account = {
            userId: input.userId,
            walletAddress: input.walletAddress,
            inboxId: input.inboxId,
            installationId: input.installationId,
            dbPath: input.dbPath,
            encryptedDbEncryptionKey: input.dbEncryptionKeyHex,
            lastInitializedAt: input.lastInitializedAt,
            lastSeenAt: null,
          };
        }),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[1],
      {} as unknown as ConstructorParameters<typeof XmtpClientManager>[2],
      {
        sendToUser: vi.fn(),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[3],
      createSpyLogger(),
    );

    const result = await manager.createWorldIdRequest(user);

    expect(result).toMatchObject({
      appId: "app_test",
      action: "identity",
      environment: "staging",
      signal: "inbox-id",
      rpContext: {
        rp_id: "rp_test",
      },
    });
    expect(result.rpContext.signature).toMatch(/^0x/);
  });

  it("lists Kharisma groups without hello", async () => {
    let account: XmtpAccountRecord | null = null;
    const sent: Array<{ type: unknown }> = [];
    const messages: DecodedMessage[] = [];
    const dm = {
      id: "dm-1",
      sync: vi.fn(async () => undefined),
      messages: vi.fn(async () => messages),
      send: vi.fn(async (encoded: { type: unknown }) => {
        sent.push(encoded);
        if (contentTypeEquals(encoded.type as never, ContentTypeListGroupsRequest)) {
          messages.push({
            id: "response-1",
            contentType: {
              authorityId: "kharisma.xyz",
              typeId: "list-groups-response",
              versionMajor: 2,
              versionMinor: 0,
            },
            content: {
              groups: [
                {
                  groupId: "group-1",
                  title: "Example",
                  description: "This is a test group description",
                  mediaUrl: "https://example.com/media/test.jpg",
                  thumbnailUrl: "https://example.com/media/thumb.jpg",
                  languages: ["en"],
                  syncInboxId: "sync-1",
                  memberCount: 1,
                  maxMembers: 25,
                  availableSeats: 24,
                  joinPolicy: "H_ONLY",
                  isMember: true,
                  conversationId: "xmtp-group-1",
                  senders: [],
                },
              ],
            },
            conversationId: "dm-1",
            senderInboxId: "kharisma-main-inbox",
            sentAt: new Date(),
            deliveryStatus: "published",
            kind: 0,
            numReplies: 0,
            reactions: [],
          } as unknown as DecodedMessage);
        }
        return `sent-${sent.length}`;
      }),
    };

    clientCreate.mockResolvedValue({
      inboxId: "inbox-id",
      installationId: "installation-id",
      conversations: {
        createDm: vi.fn(async () => dm),
        getDmByInboxId: vi.fn(() => undefined),
        list: vi.fn(async () => []),
        listDms: vi.fn(() => []),
        listGroups: vi.fn(() => []),
        stream: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        streamAllMessages: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        syncAll: vi.fn(async () => undefined),
      },
    });

    const manager = new XmtpClientManager(
      createTestConfig(),
      {
        getXmtpAccountByUserId: vi.fn(() => account),
        touchXmtpAccount: vi.fn(),
        upsertXmtpAccount: vi.fn((input: UpsertXmtpAccountInput) => {
          account = {
            userId: input.userId,
            walletAddress: input.walletAddress,
            inboxId: input.inboxId,
            installationId: input.installationId,
            dbPath: input.dbPath,
            encryptedDbEncryptionKey: input.dbEncryptionKeyHex,
            lastInitializedAt: input.lastInitializedAt,
            lastSeenAt: null,
          };
        }),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[1],
      {} as unknown as ConstructorParameters<typeof XmtpClientManager>[2],
      {
        sendToUser: vi.fn(),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[3],
      createSpyLogger(),
    );

    const groups = await manager.listKharismaGroups({ user });

    expect(groups).toEqual([
      {
        groupId: "group-1",
        title: "Example",
        description: "This is a test group description",
        mediaUrl: "https://example.com/media/test.jpg",
        thumbnailUrl: "https://example.com/media/thumb.jpg",
        languages: ["en"],
        syncInboxId: "sync-1",
        memberCount: 1,
        maxMembers: 25,
        availableSeats: 24,
        joinPolicy: "H_ONLY",
        isMember: true,
        conversationId: "xmtp-group-1",
        senders: [],
      },
    ]);
    expect(sent).toHaveLength(1);
    expect(contentTypeEquals(sent[0]!.type as never, ContentTypeListGroupsRequest)).toBe(
      true,
    );
  });

  it("sends language filters when listing Kharisma groups", async () => {
    let account: XmtpAccountRecord | null = null;
    const sent: Array<{ type: unknown; content: Uint8Array }> = [];
    const messages: DecodedMessage[] = [];
    const dm = {
      id: "dm-1",
      sync: vi.fn(async () => undefined),
      messages: vi.fn(async () => messages),
      send: vi.fn(async (encoded: { type: unknown; content: Uint8Array }) => {
        sent.push(encoded);
        if (contentTypeEquals(encoded.type as never, ContentTypeListGroupsRequest)) {
          messages.push({
            id: "response-1",
            contentType: {
              authorityId: "kharisma.xyz",
              typeId: "list-groups-response",
              versionMajor: 2,
              versionMinor: 0,
            },
            content: { groups: [] },
            conversationId: "dm-1",
            senderInboxId: "kharisma-main-inbox",
            sentAt: new Date(),
            deliveryStatus: "published",
            kind: 0,
            numReplies: 0,
            reactions: [],
          } as unknown as DecodedMessage);
        }
        return `sent-${sent.length}`;
      }),
    };

    clientCreate.mockResolvedValue({
      inboxId: "inbox-id",
      installationId: "installation-id",
      conversations: {
        createDm: vi.fn(async () => dm),
        getDmByInboxId: vi.fn(() => undefined),
        list: vi.fn(async () => []),
        listDms: vi.fn(() => []),
        listGroups: vi.fn(() => []),
        stream: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        streamAllMessages: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        syncAll: vi.fn(async () => undefined),
      },
    });

    const manager = new XmtpClientManager(
      createTestConfig(),
      {
        getXmtpAccountByUserId: vi.fn(() => account),
        touchXmtpAccount: vi.fn(),
        upsertXmtpAccount: vi.fn((input: UpsertXmtpAccountInput) => {
          account = {
            userId: input.userId,
            walletAddress: input.walletAddress,
            inboxId: input.inboxId,
            installationId: input.installationId,
            dbPath: input.dbPath,
            encryptedDbEncryptionKey: input.dbEncryptionKeyHex,
            lastInitializedAt: input.lastInitializedAt,
            lastSeenAt: null,
          };
        }),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[1],
      {} as unknown as ConstructorParameters<typeof XmtpClientManager>[2],
      {
        sendToUser: vi.fn(),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[3],
      createSpyLogger(),
    );

    await manager.listKharismaGroups({ user, languages: ["en", "ko"] });

    expect(ListGroupsRequestCodec.decode(sent[0] as never)).toEqual({
      languages: ["en", "ko"],
    });
  });

  it("resolves the Kharisma main DM from an Ethereum address", async () => {
    let account: XmtpAccountRecord | null = null;
    const sent: Array<{ type: unknown }> = [];
    const messages: DecodedMessage[] = [];
    const dm = {
      id: "dm-1",
      peerInboxId: "resolved-main-inbox",
      sync: vi.fn(async () => undefined),
      messages: vi.fn(async () => messages),
      send: vi.fn(async (encoded: { type: unknown }) => {
        sent.push(encoded);
        if (contentTypeEquals(encoded.type as never, ContentTypeListGroupsRequest)) {
          messages.push({
            id: "response-1",
            contentType: {
              authorityId: "kharisma.xyz",
              typeId: "list-groups-response",
              versionMajor: 2,
              versionMinor: 0,
            },
            content: {
              groups: [
                {
                  groupId: "group-1",
                  title: "Example",
                  description: "This is a test group description",
                  mediaUrl: "https://example.com/media/test.jpg",
                  thumbnailUrl: "https://example.com/media/thumb.jpg",
                  languages: ["en"],
                  syncInboxId: "sync-1",
                  memberCount: 1,
                  maxMembers: 25,
                  availableSeats: 24,
                  joinPolicy: "H_ONLY",
                  isMember: true,
                  conversationId: "xmtp-group-1",
                  senders: [],
                },
              ],
            },
            conversationId: "dm-1",
            senderInboxId: "resolved-main-inbox",
            sentAt: new Date(),
            deliveryStatus: "published",
            kind: 0,
            numReplies: 0,
            reactions: [],
          } as unknown as DecodedMessage);
        }
        return `sent-${sent.length}`;
      }),
    };
    const createDmWithIdentifier = vi.fn(async () => dm);

    clientCreate.mockResolvedValue({
      inboxId: "inbox-id",
      installationId: "installation-id",
      conversations: {
        createDmWithIdentifier,
        fetchDmByIdentifier: vi.fn(async () => undefined),
        list: vi.fn(async () => []),
        listDms: vi.fn(() => []),
        listGroups: vi.fn(() => []),
        stream: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        streamAllMessages: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        syncAll: vi.fn(async () => undefined),
      },
    });

    const manager = new XmtpClientManager(
      createTestConfig({
        kharismaMainAddress: "0xdc61e88b41f404f2f3e053459d0d771d1a753082",
        kharismaMainInboxId: "",
      }),
      {
        getXmtpAccountByUserId: vi.fn(() => account),
        touchXmtpAccount: vi.fn(),
        upsertXmtpAccount: vi.fn((input: UpsertXmtpAccountInput) => {
          account = {
            userId: input.userId,
            walletAddress: input.walletAddress,
            inboxId: input.inboxId,
            installationId: input.installationId,
            dbPath: input.dbPath,
            encryptedDbEncryptionKey: input.dbEncryptionKeyHex,
            lastInitializedAt: input.lastInitializedAt,
            lastSeenAt: null,
          };
        }),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[1],
      {} as unknown as ConstructorParameters<typeof XmtpClientManager>[2],
      {
        sendToUser: vi.fn(),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[3],
      createSpyLogger(),
    );

    const groups = await manager.listKharismaGroups({ user });

    expect(groups).toEqual([
      {
        groupId: "group-1",
        title: "Example",
        description: "This is a test group description",
        mediaUrl: "https://example.com/media/test.jpg",
        thumbnailUrl: "https://example.com/media/thumb.jpg",
        languages: ["en"],
        syncInboxId: "sync-1",
        memberCount: 1,
        maxMembers: 25,
        availableSeats: 24,
        joinPolicy: "H_ONLY",
        isMember: true,
        conversationId: "xmtp-group-1",
        senders: [],
      },
    ]);
    expect(createDmWithIdentifier).toHaveBeenCalledWith({
      identifier: "0xdc61e88b41f404f2f3e053459d0d771d1a753082",
      identifierKind: "Ethereum",
    });
    expect(sent).toHaveLength(1);
  });

  it("sends hello before creating Kharisma groups", async () => {
    let account: XmtpAccountRecord | null = null;
    const sent: Array<{ type: unknown }> = [];
    const messages: DecodedMessage[] = [];
    const dm = {
      id: "dm-1",
      sync: vi.fn(async () => undefined),
      messages: vi.fn(async () => messages),
      send: vi.fn(async (encoded: { type: unknown }) => {
        sent.push(encoded);
        if (contentTypeEquals(encoded.type as never, ContentTypeCreateGroupRequest)) {
          messages.push({
            id: "response-1",
            contentType: {
              authorityId: "kharisma.xyz",
              typeId: "create-group-response",
              versionMajor: 1,
              versionMinor: 0,
            },
            content: {
              status: "ok",
              groupId: "group-1",
              syncInboxId: "sync-1",
              conversationId: "xmtp-group-1",
            },
            conversationId: "dm-1",
            senderInboxId: "kharisma-main-inbox",
            sentAt: new Date(),
            deliveryStatus: "published",
            kind: 0,
            numReplies: 0,
            reactions: [],
          } as unknown as DecodedMessage);
        }
        return `sent-${sent.length}`;
      }),
    };

    clientCreate.mockResolvedValue({
      inboxId: "inbox-id",
      installationId: "installation-id",
      conversations: {
        createDm: vi.fn(async () => dm),
        getDmByInboxId: vi.fn(() => undefined),
        list: vi.fn(async () => []),
        listDms: vi.fn(() => []),
        listGroups: vi.fn(() => []),
        stream: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        streamAllMessages: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        syncAll: vi.fn(async () => undefined),
      },
    });

    const manager = new XmtpClientManager(
      createTestConfig(),
      {
        getXmtpAccountByUserId: vi.fn(() => account),
        getKharismaProfileByUserId: vi.fn(() => null),
        touchXmtpAccount: vi.fn(),
        upsertXmtpAccount: vi.fn((input: UpsertXmtpAccountInput) => {
          account = {
            userId: input.userId,
            walletAddress: input.walletAddress,
            inboxId: input.inboxId,
            installationId: input.installationId,
            dbPath: input.dbPath,
            encryptedDbEncryptionKey: input.dbEncryptionKeyHex,
            lastInitializedAt: input.lastInitializedAt,
            lastSeenAt: null,
          };
        }),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[1],
      {} as unknown as ConstructorParameters<typeof XmtpClientManager>[2],
      {
        sendToUser: vi.fn(),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[3],
      createSpyLogger(),
    );

    const group = await manager.createKharismaGroup({
      user,
      title: "Example",
      description: "This is a test group description",
      mediaUrl: "https://example.com/media/test.jpg",
      thumbnailUrl: "https://example.com/media/thumb.jpg",
      languages: ["en", "ko"],
      joinPolicy: "H_ONLY",
      maxMembers: 25,
    });

    expect(group).toEqual({
      groupId: "group-1",
      title: "Example",
      description: "This is a test group description",
      mediaUrl: "https://example.com/media/test.jpg",
      thumbnailUrl: "https://example.com/media/thumb.jpg",
      languages: ["en", "ko"],
      syncInboxId: "sync-1",
      memberCount: 1,
      maxMembers: 25,
      availableSeats: 24,
      joinPolicy: "H_ONLY",
      isMember: true,
      conversationId: "xmtp-group-1",
      senders: [
        {
          inboxId: "inbox-id",
          name: "creator",
          role: "H",
          walletAddress: "0x1111111111111111111111111111111111111111",
          humanId: null,
          agentId: null,
          verificationLevel: "none",
        },
      ],
    });
    expect(contentTypeEquals(sent[0]!.type as never, ContentTypeHello)).toBe(true);
    expect(contentTypeEquals(sent[1]!.type as never, ContentTypeCreateGroupRequest)).toBe(
      true,
    );
    expect(sent).toHaveLength(2);
    expect(CreateGroupRequestCodec.decode(sent[1] as never)).toEqual({
      title: "Example",
      description: "This is a test group description",
      mediaUrl: "https://example.com/media/test.jpg",
      thumbnailUrl: "https://example.com/media/thumb.jpg",
      languages: ["en", "ko"],
      joinPolicy: "H_ONLY",
      maxMembers: 25,
    });
  });

  it("sends join requests to the group sync inbox", async () => {
    let account: XmtpAccountRecord | null = null;
    const sent: Array<{ type: unknown }> = [];
    const messages: DecodedMessage[] = [];
    const dm = {
      id: "sync-dm-1",
      sync: vi.fn(async () => undefined),
      messages: vi.fn(async () => messages),
      send: vi.fn(async (encoded: { type: unknown }) => {
        sent.push(encoded);
        if (contentTypeEquals(encoded.type as never, ContentTypeJoinRequest)) {
          messages.push({
            id: "join-response-1",
            contentType: {
              authorityId: "kharisma.xyz",
              typeId: "join-response",
              versionMajor: 1,
              versionMinor: 0,
            },
            content: {
              status: "ok",
              groupId: "group-1",
              name: "alice",
              conversationId: "xmtp-group-1",
            },
            conversationId: "sync-dm-1",
            senderInboxId: "sync-1",
            sentAt: new Date(),
            deliveryStatus: "published",
            kind: 0,
            numReplies: 0,
            reactions: [],
          } as unknown as DecodedMessage);
        }
        return `sent-${sent.length}`;
      }),
    };
    const createDm = vi.fn(async () => dm);

    clientCreate.mockResolvedValue({
      inboxId: "inbox-id",
      installationId: "installation-id",
      conversations: {
        createDm,
        getDmByInboxId: vi.fn(() => undefined),
        list: vi.fn(async () => []),
        listDms: vi.fn(() => []),
        listGroups: vi.fn(() => []),
        stream: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        streamAllMessages: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        syncAll: vi.fn(async () => undefined),
      },
    });

    const manager = new XmtpClientManager(
      createTestConfig(),
      {
        getXmtpAccountByUserId: vi.fn(() => account),
        getKharismaProfileByUserId: vi.fn(() => null),
        touchXmtpAccount: vi.fn(),
        upsertXmtpAccount: vi.fn((input: UpsertXmtpAccountInput) => {
          account = {
            userId: input.userId,
            walletAddress: input.walletAddress,
            inboxId: input.inboxId,
            installationId: input.installationId,
            dbPath: input.dbPath,
            encryptedDbEncryptionKey: input.dbEncryptionKeyHex,
            lastInitializedAt: input.lastInitializedAt,
            lastSeenAt: null,
          };
        }),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[1],
      {} as unknown as ConstructorParameters<typeof XmtpClientManager>[2],
      {
        sendToUser: vi.fn(),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[3],
      createSpyLogger(),
    );

    const join = await manager.joinKharismaGroup({
      user,
      groupId: "group-1",
      syncInboxId: "sync-1",
      name: "alice",
    });

    expect(join).toEqual({
      groupId: "group-1",
      syncInboxId: "sync-1",
      name: "alice",
      conversationId: "xmtp-group-1",
    });
    expect(createDm).toHaveBeenCalledWith("sync-1");
    expect(sent).toHaveLength(1);
    expect(contentTypeEquals(sent[0]!.type as never, ContentTypeJoinRequest)).toBe(
      true,
    );
  });

  it("sends sync verification requests to the group sync inbox and caches the profile", async () => {
    let account: XmtpAccountRecord | null = null;
    const sent: Array<{ type: unknown; content: Uint8Array }> = [];
    const messages: DecodedMessage[] = [];
    const upsertKharismaProfile = vi.fn();
    const dm = {
      id: "sync-dm-1",
      sync: vi.fn(async () => undefined),
      messages: vi.fn(async () => messages),
      send: vi.fn(async (encoded: { type: unknown; content: Uint8Array }) => {
        sent.push(encoded);
        if (contentTypeEquals(encoded.type as never, ContentTypeIdentitySubmit)) {
          messages.push({
            id: "verification-ack-1",
            contentType: ContentTypeVerificationAck,
            content: {
              action: "identity",
              walletAddress: user.walletAddress,
              status: "ok",
              resolvedStatus: "UNKNOWN",
              verificationLevel: "identity",
              humanId: null,
              agentId: null,
              handle: null,
            },
            conversationId: "sync-dm-1",
            senderInboxId: "sync-1",
            sentAt: new Date(),
            deliveryStatus: "published",
            kind: 0,
            numReplies: 0,
            reactions: [],
          } as unknown as DecodedMessage);
        }
        return `sent-${sent.length}`;
      }),
    };
    const createDm = vi.fn(async () => dm);

    clientCreate.mockResolvedValue({
      inboxId: "inbox-id",
      installationId: "installation-id",
      conversations: {
        createDm,
        getDmByInboxId: vi.fn(() => undefined),
        list: vi.fn(async () => []),
        listDms: vi.fn(() => []),
        listGroups: vi.fn(() => []),
        stream: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        streamAllMessages: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        syncAll: vi.fn(async () => undefined),
      },
    });

    const manager = new XmtpClientManager(
      createTestConfig(),
      {
        getXmtpAccountByUserId: vi.fn(() => account),
        getKharismaProfileByUserId: vi.fn(() => null),
        touchXmtpAccount: vi.fn(),
        upsertKharismaProfile,
        upsertXmtpAccount: vi.fn((input: UpsertXmtpAccountInput) => {
          account = {
            userId: input.userId,
            walletAddress: input.walletAddress,
            inboxId: input.inboxId,
            installationId: input.installationId,
            dbPath: input.dbPath,
            encryptedDbEncryptionKey: input.dbEncryptionKeyHex,
            lastInitializedAt: input.lastInitializedAt,
            lastSeenAt: null,
          };
        }),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[1],
      {} as unknown as ConstructorParameters<typeof XmtpClientManager>[2],
      {
        sendToUser: vi.fn(),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[3],
      createSpyLogger(),
    );

    const response = await manager.submitKharismaSyncIdentityVerification({
      user,
      syncInboxId: "sync-1",
      proof: { action: "identity" },
    });

    expect(response).toMatchObject({
      action: "identity",
      status: "ok",
      verificationLevel: "identity",
    });
    expect(createDm).toHaveBeenCalledWith("sync-1");
    expect(sent).toHaveLength(1);
    expect(contentTypeEquals(sent[0]!.type as never, ContentTypeIdentitySubmit)).toBe(
      true,
    );
    expect(IdentitySubmitCodec.decode(sent[0] as never)).toEqual({
      walletAddress: user.walletAddress,
      proof: { action: "identity" },
    });
    expect(upsertKharismaProfile).toHaveBeenCalledWith({
      userId: user.id,
      walletAddress: user.walletAddress,
      status: "UNKNOWN",
      verificationLevel: "identity",
      humanId: null,
      agentId: null,
      handle: null,
    });
  });

  it("sends sync status requests to the group sync inbox", async () => {
    let account: XmtpAccountRecord | null = null;
    const sent: Array<{ type: unknown }> = [];
    const messages: DecodedMessage[] = [];
    const dm = {
      id: "sync-dm-1",
      sync: vi.fn(async () => undefined),
      messages: vi.fn(async () => messages),
      send: vi.fn(async (encoded: { type: unknown }) => {
        sent.push(encoded);
        if (contentTypeEquals(encoded.type as never, ContentTypeWalletStatusRequest)) {
          messages.push({
            id: "status-response-1",
            contentType: {
              authorityId: "kharisma.xyz",
              typeId: "wallet-status-response",
              versionMajor: 2,
              versionMinor: 0,
            },
            content: {
              walletAddress: user.walletAddress,
              status: "H",
              verificationLevel: "human",
              humanId: "human-1",
              agentId: null,
              handle: "alice",
            },
            conversationId: "sync-dm-1",
            senderInboxId: "sync-1",
            sentAt: new Date(),
            deliveryStatus: "published",
            kind: 0,
            numReplies: 0,
            reactions: [],
          } as unknown as DecodedMessage);
        }
        return `sent-${sent.length}`;
      }),
    };
    const createDm = vi.fn(async () => dm);

    clientCreate.mockResolvedValue({
      inboxId: "inbox-id",
      installationId: "installation-id",
      conversations: {
        createDm,
        getDmByInboxId: vi.fn(() => undefined),
        list: vi.fn(async () => []),
        listDms: vi.fn(() => []),
        listGroups: vi.fn(() => []),
        stream: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        streamAllMessages: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {},
        })),
        syncAll: vi.fn(async () => undefined),
      },
    });

    const manager = new XmtpClientManager(
      createTestConfig(),
      {
        getXmtpAccountByUserId: vi.fn(() => account),
        touchXmtpAccount: vi.fn(),
        upsertKharismaProfile: vi.fn(),
        upsertXmtpAccount: vi.fn((input: UpsertXmtpAccountInput) => {
          account = {
            userId: input.userId,
            walletAddress: input.walletAddress,
            inboxId: input.inboxId,
            installationId: input.installationId,
            dbPath: input.dbPath,
            encryptedDbEncryptionKey: input.dbEncryptionKeyHex,
            lastInitializedAt: input.lastInitializedAt,
            lastSeenAt: null,
          };
        }),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[1],
      {} as unknown as ConstructorParameters<typeof XmtpClientManager>[2],
      {
        sendToUser: vi.fn(),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[3],
      createSpyLogger(),
    );

    const response = await manager.getKharismaSyncWalletStatus({
      user,
      syncInboxId: "sync-1",
    });

    expect(response).toMatchObject({
      status: "H",
      verificationLevel: "human",
      handle: "alice",
    });
    expect(createDm).toHaveBeenCalledWith("sync-1");
    expect(contentTypeEquals(sent[0]!.type as never, ContentTypeWalletStatusRequest)).toBe(
      true,
    );
  });

  it("resets persisted XMTP state when the stored db key no longer matches", async () => {
    const entries: LoggedEntry[] = [];
    const deleteXmtpAccount = vi.fn();
    const touchXmtpAccount = vi.fn();
    const existingAccount: XmtpAccountRecord = {
      userId: 1,
      walletAddress: "0x1111111111111111111111111111111111111111",
      inboxId: "inbox-id",
      installationId: "installation-id",
      dbPath: "/tmp/xmtp/0x1111111111111111111111111111111111111111/client.db3",
      encryptedDbEncryptionKey: "encrypted-key",
      lastInitializedAt: new Date().toISOString(),
      lastSeenAt: null,
    };

    clientBuild.mockRejectedValue(
      new Error("[StorageError::Platform] PRAGMA key or salt has incorrect value"),
    );

    const manager = new XmtpClientManager(
      {
        appDataDir: "/tmp/app",
        appOrigin: "http://localhost:3000",
        authChallengeTtlMs: 1000,
        corsAllowedOrigins: ["http://localhost:3000"],
        dataRoot: "/tmp",
        host: "127.0.0.1",
        idleClientTtlMs: 60_000,
        logLevel: "info",
        masterKeyHex:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        metadataDbPath: "/tmp/backend.sqlite",
        mediaUploadsDir: "/tmp/uploads",
        mediaStorageProvider: "local",
        mediaPublicBaseUrl: "",
        r2AccountId: "",
        r2Bucket: "",
        r2AccessKeyId: "",
        r2SecretAccessKey: "",
        port: 0,
        rpcUrls: {},
        sessionSecret: "secret",
        sessionTtlMs: 1000,
        signatureRequestTimeoutMs: 1000,
        xmtpDbEncryptionKey:
          "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        x402Enabled: false,
        x402FacilitatorUrl: "https://x402.org/facilitator",
        x402Network: "eip155:84532",
        x402PayTo: "0x1111111111111111111111111111111111111111",
        x402PriceUsd: "$0.01",
        kharismaMainAddress: "",
        kharismaMainInboxId: "kharisma-main-inbox",
        kharismaRequestTimeoutMs: 1_000,
        worldIdAppId: "app_test",
        worldIdRpId: "rp_test",
        worldIdRpSigningKeyHex:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        worldIdAction: "human",
        worldIdEnvironment: "staging",
        xmtpAppVersion: "kharisma-backend/test",
        xmtpDataDir: "/tmp/xmtp",
        xmtpEnv: "dev",
        adminToken: "admin-token",
      },
      {
        deleteXmtpAccount,
        getXmtpAccountByUserId: vi.fn(() => existingAccount),
        touchXmtpAccount,
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[1],
      {} as unknown as ConstructorParameters<typeof XmtpClientManager>[2],
      {
        sendToUser: vi.fn(),
      } as unknown as ConstructorParameters<typeof XmtpClientManager>[3],
      createSpyLogger({}, entries),
    );
    const user: UserRecord = {
      id: 1,
      walletAddress: "0x1111111111111111111111111111111111111111",
      walletAccountType: "EOA",
      walletChainId: 8453,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await expect(manager.bootstrapUserClient(user)).rejects.toThrow(
      "persisted database key no longer matches",
    );

    expect(deleteXmtpAccount).toHaveBeenCalledWith(user.id);
    expect(createSigner).not.toHaveBeenCalled();
    expect(touchXmtpAccount).not.toHaveBeenCalled();

    const resetLog = entries.find(
      (entry) =>
        entry.level === "warn" &&
        entry.args[1] === "Reset stale persisted XMTP client after key mismatch",
    );
    expect(resetLog).toBeDefined();
  });
});
