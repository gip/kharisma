import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAdaptorServer } from "@hono/node-server";
import type { MiddlewareHandler } from "hono";
import type { GroupLanguageCode } from "@kharisma/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createSessionToken } from "../auth/session.js";
import { buildBackendApp, type BackendApp } from "../app.js";
import * as x402Module from "../http/x402.js";
import type {
  DatabaseLike,
  BackendAppEnv,
  SignatureVerifierLike,
  XmtpClientManagerLike,
} from "../backend-types.js";
import type { VerificationResult } from "../auth/signature-verifier.js";
import type { BackendConfig } from "../config.js";
import type { AppLogger } from "../logging.js";
import type {
  AuthNonceRecord,
  KharismaProfileRecord,
  SessionRecord,
  SiweNonceRecord,
  UserRecord,
  MediaUploadRecord,
  XmtpAccountRecord,
} from "../storage/database.js";
import type { MediaStorage } from "../media/storage.js";
import type {
  SerializedConversation,
  SerializedMessage,
} from "../xmtp/serializers.js";

type LoggedEntry = {
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  bindings: Record<string, unknown>;
  args: unknown[];
};

function createTestConfig(
  rootDir: string,
  overrides: Partial<BackendConfig> = {},
): BackendConfig {
  return {
    port: 0,
    host: "127.0.0.1",
    logLevel: "info",
    dataRoot: rootDir,
    appDataDir: path.join(rootDir, "app"),
    xmtpDataDir: path.join(rootDir, "xmtp"),
    mediaUploadsDir: path.join(rootDir, "uploads"),
    metadataDbPath: path.join(rootDir, "app", "backend.sqlite"),
    mediaStorageProvider: "local",
    mediaPublicBaseUrl: "",
    r2AccountId: "",
    r2Bucket: "",
    r2AccessKeyId: "",
    r2SecretAccessKey: "",
    appOrigin: "http://localhost:3000",
    corsAllowedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
    sessionSecret: "test-session-secret",
    masterKeyHex:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    xmtpDbEncryptionKey:
      "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    adminToken: "test-admin-token",
    xmtpEnv: "dev",
    xmtpAppVersion: "kharisma-backend/test",
    rpcUrls: {},
    signatureRequestTimeoutMs: 1_000,
    sessionTtlMs: 1000 * 60 * 60,
    authChallengeTtlMs: 1000 * 60 * 5,
    idleClientTtlMs: 1000 * 60 * 15,
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
    worldIdRequestTtlSeconds: 900,
    ...overrides,
  };
}

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

function createStubX402Middleware(): MiddlewareHandler<BackendAppEnv> {
  return async (c, next) => {
    if (c.req.header("payment-signature") !== "paid") {
      return c.json(
        {
          error: "Payment required",
        },
        402,
        {
          "PAYMENT-REQUIRED": "stub-payment-required",
        },
      );
    }

    await next();
  };
}

function createPassThroughX402Middleware(): MiddlewareHandler<BackendAppEnv> {
  return async (_c, next) => {
    await next();
  };
}

function createFakeDatabase(): DatabaseLike {
  let userId = 0;
  const users = new Map<number, UserRecord>();
  const usersByAddress = new Map<`0x${string}`, UserRecord>();
  const sessions = new Map<string, SessionRecord>();
  const authNonces = new Map<string, AuthNonceRecord>();
  const siweNonces = new Map<string, SiweNonceRecord>();
  const mediaUploads = new Map<string, MediaUploadRecord>();
  const xmtpAccounts: XmtpAccountRecord[] = [];
  const kharismaProfiles = new Map<number, KharismaProfileRecord>();

  return {
    createAuthNonce(input) {
      const createdAt = new Date().toISOString();
      const id = input.id ?? `nonce-${authNonces.size + 1}`;
      const record: AuthNonceRecord = {
        id,
        walletAddress: input.walletAddress,
        chainId: input.chainId,
        loginMethod: input.loginMethod,
        nonce: input.nonce,
        message: input.message,
        expiresAt: input.expiresAt,
        createdAt,
        consumedAt: null,
      };
      authNonces.set(id, record);
      return id;
    },
    consumeAuthNonce(id) {
      const existing = authNonces.get(id);

      if (!existing) {
        return;
      }

      authNonces.set(id, {
        ...existing,
        consumedAt: new Date().toISOString(),
      });
    },
    createSiweNonce(input) {
      const createdAt = new Date().toISOString();
      const id = input.id ?? `siwe-${siweNonces.size + 1}`;
      const record: SiweNonceRecord = {
        id,
        nonce: input.nonce,
        loginMethod: input.loginMethod,
        expiresAt: input.expiresAt,
        createdAt,
        consumedAt: null,
      };
      siweNonces.set(id, record);
      return id;
    },
    getSiweNonceById(id) {
      return siweNonces.get(id) ?? null;
    },
    consumeSiweNonce(id) {
      const existing = siweNonces.get(id);

      if (!existing) {
        return;
      }

      siweNonces.set(id, {
        ...existing,
        consumedAt: new Date().toISOString(),
      });
    },
    createSession(input) {
      const now = new Date().toISOString();
      const session = {
        id: `00000000-0000-0000-0000-${String(sessions.size + 1).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`,
        userId: input.userId,
        walletAddress: input.walletAddress,
        expiresAt: input.expiresAt,
        createdAt: now,
        lastSeenAt: now,
      };
      sessions.set(session.id, session);
      return session;
    },
    getAuthNonceById(id) {
      return authNonces.get(id) ?? null;
    },
    getSessionById(id) {
      return sessions.get(id) ?? null;
    },
    getUserById(id) {
      return users.get(id) ?? null;
    },
    getKharismaProfileByUserId(userId) {
      return kharismaProfiles.get(userId) ?? null;
    },
    createMediaUpload(input) {
      const record: MediaUploadRecord = {
        ...input,
        createdAt: new Date().toISOString(),
      };
      mediaUploads.set(record.id, record);
      return record;
    },
    getMediaUploadById(id) {
      return mediaUploads.get(id) ?? null;
    },
    upsertKharismaProfile(input) {
      const record: KharismaProfileRecord = {
        userId: input.userId,
        walletAddress: input.walletAddress,
        status: input.status,
        verificationLevel: input.verificationLevel,
        humanId: input.humanId,
        agentId: input.agentId,
        handle: input.handle,
        updatedAt: new Date().toISOString(),
      };
      kharismaProfiles.set(input.userId, record);
      return record;
    },
    listXmtpAccounts() {
      return xmtpAccounts;
    },
    touchSession(id) {
      const existing = sessions.get(id);

      if (!existing) {
        return;
      }

      sessions.set(id, {
        ...existing,
        lastSeenAt: new Date().toISOString(),
      });
    },
    upsertUser(input) {
      const existing = usersByAddress.get(input.walletAddress);
      const now = new Date().toISOString();

      if (existing) {
        const updated: UserRecord = {
          ...existing,
          walletAccountType: input.walletAccountType,
          walletChainId: input.walletChainId,
          updatedAt: now,
        };
        users.set(updated.id, updated);
        usersByAddress.set(updated.walletAddress, updated);
        return updated;
      }

      const created: UserRecord = {
        id: ++userId,
        walletAddress: input.walletAddress,
        walletAccountType: input.walletAccountType,
        walletChainId: input.walletChainId,
        createdAt: now,
        updatedAt: now,
      };
      users.set(created.id, created);
      usersByAddress.set(created.walletAddress, created);
      return created;
    },
  };
}

function createMemoryMediaStorage(): MediaStorage {
  const objects = new Map<string, Buffer>();

  return {
    provider: "local",
    async put(input) {
      objects.set(input.objectKey, input.body);

      return {
        objectKey: input.objectKey,
        publicUrl: null,
      };
    },
    async get(objectKey) {
      const body = objects.get(objectKey);

      if (!body) {
        return null;
      }

      return {
        body,
        mimeType: "application/octet-stream",
        contentLength: body.length,
      };
    },
  };
}

function createAuthenticatedUser(
  backend: BackendApp,
  walletAddress: `0x${string}` = "0x1111111111111111111111111111111111111111",
) {
  const user = backend.services.database.upsertUser({
    walletAddress,
    walletAccountType: "EOA",
    walletChainId: 8453,
  });
  const session = backend.services.database.createSession({
    userId: user.id,
    walletAddress: user.walletAddress,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const token = createSessionToken({
    secret: backend.services.config.sessionSecret,
    userId: user.id,
    sessionId: session.id,
    address: user.walletAddress,
    expiresAt: new Date(session.expiresAt),
  });

  return { user, session, token };
}

function createStubXmtpManager(): XmtpClientManagerLike {
  const conversations: SerializedConversation[] = [
    {
      id: "conversation-1",
      kind: "dm",
      title: "Test Conversation",
      peerInboxId: "peer-inbox-id",
      memberCount: null,
      lastActivityAt: null,
      createdAt: null,
    },
  ];
  const message: SerializedMessage = {
    id: "message-1",
    conversationId: "conversation-1",
    senderInboxId: "sender-inbox-id",
    sentAt: new Date(0).toISOString(),
    content: "Hello",
    fallback: null,
    deliveryStatus: "published",
    replyTo: null,
    threadCreate: null,
  };

  return {
    bootstrapUserClient: vi.fn(async () => ({
      info: {
        network: "dev" as const,
        inboxId: "inbox-id",
        identity: "0x1111111111111111111111111111111111111111",
        installationId: "installation-id",
        identityCount: 1,
        installationCount: 1,
        conversationCount: conversations.length,
        dmCount: conversations.length,
        groupCount: 0,
      },
      conversations,
    })),
    removeXmtpAccount: vi.fn(async (input) => ({
      identifier: input.identifier.toLowerCase(),
      identifierKind: input.identifierKind,
      inboxId: "inbox-id",
    })),
    listConversations: vi.fn(async () => conversations),
    createWorldIdRequest: vi.fn(async () => ({
      appId: "app_test" as const,
      action: "identity" as const,
      environment: "staging" as const,
      signal: "inbox-id",
      rpContext: {
        rp_id: "rp_test",
        nonce: "nonce",
        created_at: 1,
        expires_at: 2,
        signature: "0xsig",
      },
    })),
    getKharismaWalletStatus: vi.fn(async () => ({
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "UNKNOWN" as const,
      verificationLevel: "none" as const,
      humanId: null,
      agentId: null,
      handle: null,
    })),
    getKharismaSyncWalletStatus: vi.fn(async () => ({
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "UNKNOWN" as const,
      verificationLevel: "none" as const,
      humanId: null,
      agentId: null,
      handle: null,
    })),
    submitKharismaIdentityVerification: vi.fn(async () => ({
      action: "identity" as const,
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "ok" as const,
      resolvedStatus: "UNKNOWN" as const,
      verificationLevel: "identity" as const,
      humanId: null,
      agentId: null,
      handle: null,
    })),
    submitKharismaHumanVerification: vi.fn(async () => ({
      action: "human" as const,
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "ok" as const,
      resolvedStatus: "H" as const,
      verificationLevel: "human" as const,
      humanId: "human-1",
      agentId: null,
      handle: "alice",
    })),
    submitKharismaSyncIdentityVerification: vi.fn(async () => ({
      action: "identity" as const,
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "ok" as const,
      resolvedStatus: "UNKNOWN" as const,
      verificationLevel: "identity" as const,
      humanId: null,
      agentId: null,
      handle: null,
    })),
    submitKharismaSyncHumanVerification: vi.fn(async () => ({
      action: "human" as const,
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "ok" as const,
      resolvedStatus: "H" as const,
      verificationLevel: "human" as const,
      humanId: "human-1",
      agentId: null,
      handle: "alice",
    })),
    submitKharismaSyncHumanAgentVerification: vi.fn(async () => ({
      action: "human-agent" as const,
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "ok" as const,
      resolvedStatus: "HA" as const,
      verificationLevel: "human-agent" as const,
      humanId: "human-1",
      agentId: "agent-1",
      handle: "agent1",
    })),
    listKharismaGroups: vi.fn(async () => []),
    createKharismaGroup: vi.fn(async () => ({
      groupId: "group-1",
      title: "Example",
      description: "This is a test group description",
      mediaUrl: "https://example.com/media/test.jpg",
      thumbnailUrl: "https://example.com/media/thumb.jpg",
      languages: ["en"] as GroupLanguageCode[],
      syncInboxId: "sync-inbox-1",
      memberCount: 1,
      maxMembers: 12,
      availableSeats: 11,
      joinPolicy: "H_ONLY" as const,
      isMember: true,
      conversationId: "xmtp-group-1",
      senders: [],
    })),
    joinKharismaGroup: vi.fn(async () => ({
      groupId: "group-1",
      syncInboxId: "sync-inbox-1",
      name: "alice",
      conversationId: "xmtp-group-1",
    })),
    getInvestmentConfig: vi.fn(async () => ({
      status: "ok" as const,
      groupId: "group-1",
      destinationAddress: "0x2222222222222222222222222222222222222222",
      chains: [],
    })),
    submitInvestment: vi.fn(async () => ({
      status: "recorded" as const,
      groupId: "group-1",
      investment: {
        investmentId: "investment-1",
        groupId: "group-1",
        investorInboxId: "inbox-id",
        investorWalletAddress: "0x1111111111111111111111111111111111111111",
        token: "USDC" as const,
        tokenAddress: "0x3333333333333333333333333333333333333333",
        amount: "25000000",
        decimals: 6,
        destinationAddress: "0x2222222222222222222222222222222222222222",
        chainId: 8453,
        txHash:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        logIndex: 0,
        recordedAt: new Date(0).toISOString(),
        announcedAt: null,
      },
    })),
    listLoadedClients: vi.fn(() => []),
    listMessages: vi.fn(async () => ({
      messages: [],
      nextCursor: null,
    })),
    markConversationRead: vi.fn(async () => undefined),
    sendMessage: vi.fn(async () => message),
    sendRemoteAttachment: vi.fn(async () => ({
      ...message,
      attachment: {
        url: "http://localhost/media/test",
        mimeType: "video/webm",
        filename: "test.webm",
        contentLength: 1024,
        thumbnailUrl: null,
      },
    })),
    listThreads: vi.fn(async () => []),
    listThreadMessages: vi.fn(async () => ({ messages: [] })),
    createThread: vi.fn(async () => ({
      thread: {
        threadId: message.id,
        conversationId: message.conversationId,
        title: "stub",
        createdAt: message.sentAt,
        createdBy: message.senderInboxId,
        lastActivityAt: message.sentAt,
        lastMessageId: message.id,
        lastMessagePreview: null,
        lastMessageSenderInboxId: message.senderInboxId,
        replyCount: 0,
      },
      rootMessage: message,
    })),
    sendThreadMessage: vi.fn(async () => message),
    sendThreadAttachment: vi.fn(async () => ({
      ...message,
      attachment: {
        url: "http://localhost/media/test",
        mimeType: "video/webm",
        filename: "test.webm",
        contentLength: 1024,
        thumbnailUrl: null,
      },
    })),
    listLatestThreads: vi.fn(async () => []),
  };
}

describe("buildBackendApp", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "clients-service-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns healthz", async () => {
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
      },
      x402Middleware: createStubX402Middleware(),
    });

    const response = await backend.app.request("http://backend.test/healthz");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it("logs request summaries with status-based levels", async () => {
    const entries: LoggedEntry[] = [];
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      logger: createSpyLogger({}, entries),
      serviceOverrides: {
        database: createFakeDatabase(),
      },
      x402Middleware: createStubX402Middleware(),
    });

    const success = await backend.app.request("http://backend.test/healthz");
    expect(success.status).toBe(200);

    const failure = await backend.app.request("http://backend.test/auth/challenge", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify([]),
    });
    expect(failure.status).toBe(400);

    const healthzLog = entries.find(
      (entry) =>
        entry.level === "info" &&
        entry.bindings.component === "http" &&
        entry.args[1] === "Request completed" &&
        (entry.args[0] as Record<string, unknown>).path === "/healthz",
    );
    expect(healthzLog).toBeDefined();
    expect(healthzLog?.args[0]).toMatchObject({
      method: "GET",
      path: "/healthz",
      status: 200,
    });

    const badRequestLog = entries.find(
      (entry) =>
        entry.level === "warn" &&
        entry.bindings.component === "http" &&
        entry.args[1] === "Request completed" &&
        (entry.args[0] as Record<string, unknown>).path === "/auth/challenge",
    );
    expect(badRequestLog).toBeDefined();
    expect(badRequestLog?.args[0]).toMatchObject({
      method: "POST",
      path: "/auth/challenge",
      status: 400,
    });
  });

  it("logs uncaught request errors at error level", async () => {
    const entries: LoggedEntry[] = [];
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      logger: createSpyLogger({}, entries),
      serviceOverrides: {
        database: createFakeDatabase(),
      },
      x402Middleware: createStubX402Middleware(),
    });

    backend.app.get("/boom", () => {
      throw new Error("boom");
    });

    const response = await backend.app.request("http://backend.test/boom");
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: "Internal server error",
    });

    const unhandledErrorLog = entries.find(
      (entry) =>
        entry.level === "error" &&
        entry.bindings.component === "http" &&
        entry.args[1] === "Unhandled request error",
    );
    expect(unhandledErrorLog).toBeDefined();
    expect(unhandledErrorLog?.args[0]).toMatchObject({
      method: "GET",
      path: "/boom",
    });
  });

  it("handles auth preflight requests and reflects the allowed origin", async () => {
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
      },
      x402Middleware: createStubX402Middleware(),
    });

    const response = await backend.app.request("http://backend.test/auth/challenge", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.ok).toBe(true);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "Content-Type",
    );
  });

  it("creates a challenge and rejects invalid auth challenge bodies", async () => {
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
      },
      x402Middleware: createStubX402Middleware(),
    });

    const invalidResponse = await backend.app.request(
      "http://backend.test/auth/challenge",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([]),
      },
    );
    expect(invalidResponse.status).toBe(400);

    const response = await backend.app.request("http://backend.test/auth/challenge", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        walletAddress: "0x1111111111111111111111111111111111111111",
        loginMethod: "metamask",
        chainId: 8453,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(await response.json()).toMatchObject({
      challengeId: expect.any(String),
      message: expect.stringContaining("Kharisma wants you to sign in"),
      expiresAt: expect.any(String),
    });
  });

  it("verifies a challenge and issues a session", async () => {
    const verification: VerificationResult = {
      accountType: "EOA",
      chainId: 8453,
    };
    const signatureVerifier: SignatureVerifierLike = {
      verify: vi.fn(async () => verification),
    };
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
        signatureVerifier,
      },
      x402Middleware: createStubX402Middleware(),
    });

    const challengeResponse = await backend.app.request(
      "http://backend.test/auth/challenge",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: "0x1111111111111111111111111111111111111111",
          loginMethod: "metamask",
          chainId: 8453,
        }),
      },
    );
    const challenge = (await challengeResponse.json()) as { challengeId: string };

    const response = await backend.app.request("http://backend.test/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        signature: "0x1234",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      token: expect.any(String),
      session: {
        walletAddress: "0x1111111111111111111111111111111111111111",
        walletAccountType: "EOA",
        walletChainId: 8453,
      },
    });
  });

  it("returns correct auth verify failures", async () => {
    const signatureVerifier: SignatureVerifierLike = {
      verify: vi.fn(async () => {
        throw new Error("Signature mismatch");
      }),
    };
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
        signatureVerifier,
      },
      x402Middleware: createStubX402Middleware(),
    });

    const challengeId = backend.services.database.createAuthNonce({
      id: "expired-challenge",
      walletAddress: "0x1111111111111111111111111111111111111111",
      chainId: 8453,
      loginMethod: "metamask",
      nonce: "nonce",
      message: "message",
      expiresAt: new Date(Date.now() - 5_000).toISOString(),
    });

    const expired = await backend.app.request("http://backend.test/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId,
        signature: "0x1234",
      }),
    });
    expect(expired.status).toBe(410);

    backend.services.database.createAuthNonce({
      id: "consumed-challenge",
      walletAddress: "0x1111111111111111111111111111111111111111",
      chainId: 8453,
      loginMethod: "metamask",
      nonce: "nonce",
      message: "message",
      expiresAt: new Date(Date.now() + 5_000).toISOString(),
    });
    backend.services.database.consumeAuthNonce("consumed-challenge");

    const consumed = await backend.app.request("http://backend.test/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: "consumed-challenge",
        signature: "0x1234",
      }),
    });
    expect(consumed.status).toBe(409);

    const invalid = await backend.app.request("http://backend.test/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: "missing-challenge",
        signature: "0x1234",
      }),
    });
    expect(invalid.status).toBe(404);

    backend.services.database.createAuthNonce({
      id: "bad-signature",
      walletAddress: "0x1111111111111111111111111111111111111111",
      chainId: 8453,
      loginMethod: "metamask",
      nonce: "nonce",
      message: "message",
      expiresAt: new Date(Date.now() + 5_000).toISOString(),
    });

    const unauthorized = await backend.app.request("http://backend.test/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: "bad-signature",
        signature: "0x1234",
      }),
    });
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toMatchObject({
      error: "Signature mismatch",
    });
  });

  it("enforces session auth before x402 and allows paid XMTP requests", async () => {
    const xmtpClientManager = createStubXmtpManager();
    const backend = await buildBackendApp(
      createTestConfig(tempDir, { x402Enabled: true }),
      {
        serviceOverrides: {
          database: createFakeDatabase(),
          xmtpClientManager,
        },
        x402Middleware: createStubX402Middleware(),
      },
    );
    const user = backend.services.database.upsertUser({
      walletAddress: "0x1111111111111111111111111111111111111111",
      walletAccountType: "EOA",
      walletChainId: 8453,
    });
    const session = backend.services.database.createSession({
      userId: user.id,
      walletAddress: user.walletAddress,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const token = createSessionToken({
      secret: backend.services.config.sessionSecret,
      userId: user.id,
      sessionId: session.id,
      address: user.walletAddress,
      expiresAt: new Date(session.expiresAt),
    });

    const unauthorized = await backend.app.request("http://backend.test/conversations");
    expect(unauthorized.status).toBe(401);

    const paymentRequired = await backend.app.request(
      "http://backend.test/conversations",
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(paymentRequired.status).toBe(402);
    expect(paymentRequired.headers.get("PAYMENT-REQUIRED")).toBe(
      "stub-payment-required",
    );
    expect(await paymentRequired.json()).toMatchObject({
      error: "Payment required",
    });

    const paid = await backend.app.request("http://backend.test/conversations", {
      headers: {
        authorization: `Bearer ${token}`,
        "payment-signature": "paid",
      },
    });
    expect(paid.status).toBe(200);
    expect(await paid.json()).toMatchObject({
      conversations: [{ id: "conversation-1" }],
    });
  });

  it("allows authenticated XMTP requests without payment when x402 is disabled", async () => {
    const xmtpClientManager = createStubXmtpManager();
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
        xmtpClientManager,
      },
    });
    const user = backend.services.database.upsertUser({
      walletAddress: "0x1111111111111111111111111111111111111111",
      walletAccountType: "EOA",
      walletChainId: 8453,
    });
    const session = backend.services.database.createSession({
      userId: user.id,
      walletAddress: user.walletAddress,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const token = createSessionToken({
      secret: backend.services.config.sessionSecret,
      userId: user.id,
      sessionId: session.id,
      address: user.walletAddress,
      expiresAt: new Date(session.expiresAt),
    });

    const unauthorized = await backend.app.request("http://backend.test/conversations");
    expect(unauthorized.status).toBe(401);

    const response = await backend.app.request("http://backend.test/conversations", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      conversations: [{ id: "conversation-1" }],
    });
  });

  it("removes an XMTP account through an authenticated route", async () => {
    const xmtpClientManager = createStubXmtpManager();
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
        xmtpClientManager,
      },
    });
    const { user, token } = createAuthenticatedUser(backend);

    const response = await backend.app.request(
      "http://backend.test/xmtp/accounts/remove",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          identifier: "0x2222222222222222222222222222222222222222",
          identifierKind: "Ethereum",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      removed: {
        identifier: "0x2222222222222222222222222222222222222222",
        identifierKind: "Ethereum",
        inboxId: "inbox-id",
      },
    });
    expect(xmtpClientManager.removeXmtpAccount).toHaveBeenCalledWith({
      user,
      identifier: "0x2222222222222222222222222222222222222222",
      identifierKind: "Ethereum",
    });
  });

  it("validates media upload bodies", async () => {
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
        mediaStorage: createMemoryMediaStorage(),
      },
    });
    const { token } = createAuthenticatedUser(backend);

    const missingFile = await backend.app.request("http://backend.test/media/upload", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: new FormData(),
    });
    expect(missingFile.status).toBe(400);
    expect(await missingFile.json()).toMatchObject({
      error: "file field is required",
    });

    const textForm = new FormData();
    textForm.append("file", new File(["hello"], "hello.txt", { type: "text/plain" }));
    const nonVideo = await backend.app.request("http://backend.test/media/upload", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: textForm,
    });
    expect(nonVideo.status).toBe(400);
    expect(await nonVideo.json()).toMatchObject({
      error: "Only image and video files are accepted",
    });

    const largeForm = new FormData();
    largeForm.append(
      "file",
      new File([new Uint8Array(50 * 1024 * 1024 + 1)], "large.webm", {
        type: "video/webm",
      }),
    );
    const tooLarge = await backend.app.request("http://backend.test/media/upload", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: largeForm,
    });
    expect(tooLarge.status).toBe(400);
    expect(await tooLarge.json()).toMatchObject({
      error: "File too large (max 50 MB)",
    });
  });

  it("persists local media metadata and serves uploaded videos", async () => {
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
        mediaStorage: createMemoryMediaStorage(),
      },
    });
    const { token, user } = createAuthenticatedUser(backend);
    const form = new FormData();
    form.append(
      "file",
      new File(["video-data"], "clip.webm", { type: "video/webm" }),
    );

    const response = await backend.app.request("http://backend.test/media/upload", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: form,
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      url: string;
      mimeType: string;
      contentLength: number;
      contentDigest: string;
    };
    expect(payload).toMatchObject({
      id: expect.any(String),
      url: `http://backend.test/media/${payload.id}`,
      mimeType: "video/webm",
      contentLength: "video-data".length,
      contentDigest: expect.any(String),
    });

    const record = backend.services.database.getMediaUploadById(payload.id);
    expect(record).toMatchObject({
      id: payload.id,
      userId: user.id,
      filename: `${payload.id}.webm`,
      mimeType: "video/webm",
      contentLength: "video-data".length,
      contentDigest: payload.contentDigest,
      storageProvider: "local",
      objectKey: `uploads/${user.id}/${payload.id}.webm`,
      publicUrl: payload.url,
    });

    const media = await backend.app.request(payload.url);
    expect(media.status).toBe(200);
    expect(media.headers.get("content-type")).toBe("video/webm");
    expect(media.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(await media.text()).toBe("video-data");
  });

  it("only sends attachments uploaded by the authenticated user", async () => {
    const xmtpClientManager = createStubXmtpManager();
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
        mediaStorage: createMemoryMediaStorage(),
        xmtpClientManager,
      },
    });
    const first = createAuthenticatedUser(
      backend,
      "0x1111111111111111111111111111111111111111",
    );
    const second = createAuthenticatedUser(
      backend,
      "0x2222222222222222222222222222222222222222",
    );
    const form = new FormData();
    form.append(
      "file",
      new File(["video-data"], "clip.webm", { type: "video/webm" }),
    );
    const uploadResponse = await backend.app.request(
      "http://backend.test/media/upload",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${first.token}`,
        },
        body: form,
      },
    );
    const upload = (await uploadResponse.json()) as { id: string };

    const forbidden = await backend.app.request(
      "http://backend.test/messages/send-attachment",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${second.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          conversationId: "conversation-1",
          mediaId: upload.id,
        }),
      },
    );

    expect(forbidden.status).toBe(404);
    expect(await forbidden.json()).toMatchObject({
      error: "Media not found",
    });
    expect(xmtpClientManager.sendRemoteAttachment).not.toHaveBeenCalled();

    const allowed = await backend.app.request(
      "http://backend.test/messages/send-attachment",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${first.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          conversationId: "conversation-1",
          mediaId: upload.id,
        }),
      },
    );
    expect(allowed.status).toBe(200);
    expect(xmtpClientManager.sendRemoteAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        user: first.user,
        conversationId: "conversation-1",
        url: `http://backend.test/media/${upload.id}`,
        mimeType: "video/webm",
        filename: `${upload.id}.webm`,
        contentLength: "video-data".length,
        contentDigest: expect.any(String),
      }),
    );
  });

  it("creates World ID request context for authenticated Kharisma users", async () => {
    const xmtpClientManager = createStubXmtpManager();
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
        xmtpClientManager,
      },
    });
    const user = backend.services.database.upsertUser({
      walletAddress: "0x1111111111111111111111111111111111111111",
      walletAccountType: "EOA",
      walletChainId: 8453,
    });
    const session = backend.services.database.createSession({
      userId: user.id,
      walletAddress: user.walletAddress,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const token = createSessionToken({
      secret: backend.services.config.sessionSecret,
      userId: user.id,
      sessionId: session.id,
      address: user.walletAddress,
      expiresAt: new Date(session.expiresAt),
    });

    const unauthorized = await backend.app.request(
      "http://backend.test/kharisma/world-id/request",
      { method: "POST" },
    );
    expect(unauthorized.status).toBe(401);

    const response = await backend.app.request(
      "http://backend.test/kharisma/world-id/request",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      appId: "app_test",
      action: "identity",
      environment: "staging",
      signal: "inbox-id",
      rpContext: {
        rp_id: "rp_test",
      },
    });
    expect(xmtpClientManager.createWorldIdRequest).toHaveBeenCalledWith(
      user,
      "identity",
    );
  });

  it("maps Kharisma configuration errors to a clear service response", async () => {
    const xmtpClientManager = {
      ...createStubXmtpManager(),
      createWorldIdRequest: vi.fn(async () => {
        throw new Error("World ID is not configured");
      }),
    };
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
        xmtpClientManager,
      },
    });
    const user = backend.services.database.upsertUser({
      walletAddress: "0x1111111111111111111111111111111111111111",
      walletAccountType: "EOA",
      walletChainId: 8453,
    });
    const session = backend.services.database.createSession({
      userId: user.id,
      walletAddress: user.walletAddress,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const token = createSessionToken({
      secret: backend.services.config.sessionSecret,
      userId: user.id,
      sessionId: session.id,
      address: user.walletAddress,
      expiresAt: new Date(session.expiresAt),
    });

    const response = await backend.app.request(
      "http://backend.test/kharisma/world-id/request",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "World ID is not configured",
    });
  });

  it("forwards sync-channel verification routes to the requested group sync inbox", async () => {
    const xmtpClientManager = createStubXmtpManager();
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
        xmtpClientManager,
      },
    });
    const { user, token } = createAuthenticatedUser(backend);
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };

    const missingSyncInbox = await backend.app.request(
      "http://backend.test/kharisma/groups/verify/identity",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ proof: { action: "identity" } }),
      },
    );
    expect(missingSyncInbox.status).toBe(400);

    const status = await backend.app.request(
      "http://backend.test/kharisma/groups/verify/status",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ syncInboxId: " sync-inbox-1 " }),
      },
    );
    expect(status.status).toBe(200);
    expect(xmtpClientManager.getKharismaSyncWalletStatus).toHaveBeenCalledWith({
      user,
      syncInboxId: "sync-inbox-1",
    });

    const identity = await backend.app.request(
      "http://backend.test/kharisma/groups/verify/identity",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          syncInboxId: "sync-inbox-1",
          proof: { action: "identity" },
        }),
      },
    );
    expect(identity.status).toBe(200);
    expect(xmtpClientManager.submitKharismaSyncIdentityVerification).toHaveBeenCalledWith({
      user,
      syncInboxId: "sync-inbox-1",
      proof: { action: "identity" },
    });

    const human = await backend.app.request(
      "http://backend.test/kharisma/groups/verify/human",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          syncInboxId: "sync-inbox-1",
          handle: " alice ",
          proof: { action: "human" },
        }),
      },
    );
    expect(human.status).toBe(200);
    expect(xmtpClientManager.submitKharismaSyncHumanVerification).toHaveBeenCalledWith({
      user,
      syncInboxId: "sync-inbox-1",
      handle: "alice",
      proof: { action: "human" },
    });

    const humanAgent = await backend.app.request(
      "http://backend.test/kharisma/groups/verify/human-agent",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          syncInboxId: "sync-inbox-1",
          ownerHumanId: " human-1 ",
          handle: " agent1 ",
          proof: { action: "human-agent" },
        }),
      },
    );
    expect(humanAgent.status).toBe(200);
    expect(
      xmtpClientManager.submitKharismaSyncHumanAgentVerification,
    ).toHaveBeenCalledWith({
      user,
      syncInboxId: "sync-inbox-1",
      ownerHumanId: "human-1",
      handle: "agent1",
      proof: { action: "human-agent" },
    });
  });

  it("maps sync-channel verification protocol errors to conflict responses", async () => {
    const xmtpClientManager = {
      ...createStubXmtpManager(),
      submitKharismaSyncHumanVerification: vi.fn(async () => {
        throw new Error(
          "Kharisma protocol error (verification-required): proof failed",
        );
      }),
    };
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
        xmtpClientManager,
      },
    });
    const { token } = createAuthenticatedUser(backend);

    const response = await backend.app.request(
      "http://backend.test/kharisma/groups/verify/human",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          syncInboxId: "sync-inbox-1",
          handle: "alice",
          proof: { action: "human" },
        }),
      },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "Kharisma protocol error (verification-required): proof failed",
    });
  });

  it("protects Kharisma group routes with x402 and forwards valid group payloads", async () => {
    const xmtpClientManager = createStubXmtpManager();
    const backend = await buildBackendApp(
      createTestConfig(tempDir, { x402Enabled: true }),
      {
        serviceOverrides: {
          database: createFakeDatabase(),
          xmtpClientManager,
        },
        x402Middleware: createStubX402Middleware(),
      },
    );
    const user = backend.services.database.upsertUser({
      walletAddress: "0x1111111111111111111111111111111111111111",
      walletAccountType: "EOA",
      walletChainId: 8453,
    });
    const session = backend.services.database.createSession({
      userId: user.id,
      walletAddress: user.walletAddress,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const token = createSessionToken({
      secret: backend.services.config.sessionSecret,
      userId: user.id,
      sessionId: session.id,
      address: user.walletAddress,
      expiresAt: new Date(session.expiresAt),
    });

    backend.services.database.createMediaUpload({
      id: "media-1",
      userId: user.id,
      filename: "media-1.jpg",
      mimeType: "image/jpeg",
      contentLength: 1024,
      contentDigest: "abc123",
      storageProvider: "local",
      objectKey: "uploads/1/media-1.jpg",
      publicUrl: "",
    });

    const unpaid = await backend.app.request(
      "http://backend.test/kharisma/groups/list",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(unpaid.status).toBe(402);

    const paidEmptyList = await backend.app.request(
      "http://backend.test/kharisma/groups/list",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "payment-signature": "paid",
        },
      },
    );
    expect(paidEmptyList.status).toBe(200);
    expect(xmtpClientManager.listKharismaGroups).toHaveBeenCalledWith({
      user,
      languages: undefined,
    });

    const paidList = await backend.app.request(
      "http://backend.test/kharisma/groups/list",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "payment-signature": "paid",
        },
        body: JSON.stringify({ languages: ["EN", "ko"] }),
      },
    );
    expect(paidList.status).toBe(200);
    expect(xmtpClientManager.listKharismaGroups).toHaveBeenCalledWith({
      user,
      languages: ["en", "ko"],
    });

    const paid = await backend.app.request(
      "http://backend.test/kharisma/groups",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "payment-signature": "paid",
        },
        body: JSON.stringify({
          title: "Example",
          description: "This is a test group description",
          mediaId: "media-1",
          thumbnailId: "media-1",
          languages: ["en", "ko"],
          joinPolicy: "H_HA_AND_A",
          maxMembers: 25,
        }),
      },
    );

    expect(paid.status).toBe(200);
    expect(await paid.json()).toMatchObject({
      group: {
        groupId: "group-1",
        title: "Example",
        languages: ["en"],
        memberCount: 1,
        maxMembers: 12,
        availableSeats: 11,
        joinPolicy: "H_ONLY",
        isMember: true,
        conversationId: "xmtp-group-1",
        senders: [],
      },
    });
    expect(xmtpClientManager.createKharismaGroup).toHaveBeenCalledWith({
      user,
      title: "Example",
      description: "This is a test group description",
      mediaUrl: expect.stringContaining("/media/media-1"),
      thumbnailUrl: expect.stringContaining("/media/media-1"),
      languages: ["en", "ko"],
      joinPolicy: "H_HA_AND_A",
      maxMembers: 25,
    });

    const join = await backend.app.request(
      "http://backend.test/kharisma/groups/join",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "payment-signature": "paid",
        },
        body: JSON.stringify({
          groupId: "group-1",
          syncInboxId: "sync-inbox-1",
          name: "alice",
        }),
      },
    );

    expect(join.status).toBe(200);
    expect(await join.json()).toMatchObject({
      join: {
        groupId: "group-1",
        syncInboxId: "sync-inbox-1",
        name: "alice",
        conversationId: "xmtp-group-1",
      },
    });
    expect(xmtpClientManager.joinKharismaGroup).toHaveBeenCalledWith({
      user,
      groupId: "group-1",
      syncInboxId: "sync-inbox-1",
      name: "alice",
    });
  });

  it("submits investments over the Kharisma XMTP manager", async () => {
    const xmtpClientManager = createStubXmtpManager();
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
        xmtpClientManager,
      },
      x402Middleware: createPassThroughX402Middleware(),
    });
    const { token } = createAuthenticatedUser(backend);

    const configResponse = await backend.app.request(
      "http://backend.test/kharisma/investments/config",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          groupId: "group-1",
          syncInboxId: "sync-inbox-1",
        }),
      },
    );
    expect(configResponse.status).toBe(200);

    const verifyResponse = await backend.app.request(
      "http://backend.test/kharisma/groups/group-1/investments/verify",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          txHash:
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          chainId: 8453,
          token: "USDC",
          amount: "25000000",
          syncInboxId: "sync-inbox-1",
        }),
      },
    );

    expect(verifyResponse.status).toBe(200);
    expect(xmtpClientManager.getInvestmentConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group-1",
        syncInboxId: "sync-inbox-1",
      }),
    );
    expect(xmtpClientManager.submitInvestment).toHaveBeenCalledWith({
      user: expect.objectContaining({
        walletAddress: "0x1111111111111111111111111111111111111111",
      }),
      groupId: "group-1",
      syncInboxId: "sync-inbox-1",
      txHash:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      chainId: 8453,
      token: "USDC",
      amount: "25000000",
    });
  });

  it("omits payment headers from protected-route preflight when x402 is disabled", async () => {
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
      },
    });

    const preflight = await backend.app.request("http://backend.test/conversations", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
        "access-control-request-headers":
          "authorization,payment-signature,agentkit",
      },
    });

    expect(preflight.ok).toBe(true);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(preflight.headers.get("access-control-allow-headers")).toContain(
      "Authorization",
    );
    expect(preflight.headers.get("access-control-allow-headers")).not.toContain(
      "Payment-Signature",
    );
    expect(preflight.headers.get("access-control-allow-headers")).not.toContain(
      "Agentkit",
    );
    expect(
      preflight.headers.get("access-control-expose-headers") ?? "",
    ).not.toContain("PAYMENT-REQUIRED");
  });

  it("allows preflight and exposes payment headers on protected routes when x402 is enabled", async () => {
    const backend = await buildBackendApp(
      createTestConfig(tempDir, { x402Enabled: true }),
      {
        serviceOverrides: {
          database: createFakeDatabase(),
        },
        x402Middleware: createStubX402Middleware(),
      },
    );
    const user = backend.services.database.upsertUser({
      walletAddress: "0x1111111111111111111111111111111111111111",
      walletAccountType: "EOA",
      walletChainId: 8453,
    });
    const session = backend.services.database.createSession({
      userId: user.id,
      walletAddress: user.walletAddress,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const token = createSessionToken({
      secret: backend.services.config.sessionSecret,
      userId: user.id,
      sessionId: session.id,
      address: user.walletAddress,
      expiresAt: new Date(session.expiresAt),
    });

    const preflight = await backend.app.request("http://backend.test/conversations", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
        "access-control-request-headers":
          "authorization,payment-signature,agentkit",
      },
    });

    expect(preflight.ok).toBe(true);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(preflight.headers.get("access-control-allow-headers")).toContain(
      "Authorization",
    );
    expect(preflight.headers.get("access-control-allow-headers")).toContain(
      "Payment-Signature",
    );
    expect(preflight.headers.get("access-control-allow-headers")).toContain(
      "Agentkit",
    );

    const response = await backend.app.request("http://backend.test/conversations", {
      headers: {
        origin: "http://localhost:3000",
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(402);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBe("stub-payment-required");
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(response.headers.get("access-control-expose-headers")).toContain(
      "PAYMENT-REQUIRED",
    );
  });

  it("does not initialize x402 when disabled", async () => {
    const createX402Middleware = vi
      .spyOn(x402Module, "createX402Middleware")
      .mockRejectedValue(new Error("x402 should not initialize"));

    await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
      },
    });

    expect(createX402Middleware).not.toHaveBeenCalled();
  });

  it("initializes x402 when enabled", async () => {
    const createX402Middleware = vi
      .spyOn(x402Module, "createX402Middleware")
      .mockResolvedValue(createPassThroughX402Middleware());

    await buildBackendApp(createTestConfig(tempDir, { x402Enabled: true }), {
      serviceOverrides: {
        database: createFakeDatabase(),
      },
    });

    expect(createX402Middleware).toHaveBeenCalledOnce();
    expect(createX402Middleware).toHaveBeenCalledWith(
      expect.objectContaining({ x402Enabled: true }),
    );
  });

  it("preserves admin token behavior", async () => {
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
        xmtpClientManager: createStubXmtpManager(),
      },
      x402Middleware: createStubX402Middleware(),
    });

    const unauthorized = await backend.app.request(
      "http://backend.test/admin/xmtp/clients",
    );
    expect(unauthorized.status).toBe(401);

    const authorized = await backend.app.request(
      "http://backend.test/admin/xmtp/clients",
      {
        headers: {
          authorization: `Bearer ${backend.services.config.adminToken}`,
        },
      },
    );
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toMatchObject({
      loadedClients: [],
      persistedAccounts: [],
    });
  });

  it("authenticates websocket clients on /ws", async () => {
    const backend = await buildBackendApp(createTestConfig(tempDir), {
      serviceOverrides: {
        database: createFakeDatabase(),
      },
      x402Middleware: createStubX402Middleware(),
    });
    const server = createAdaptorServer({
      fetch: backend.app.fetch,
    });
    backend.injectWebSocket(server);

    await new Promise<void>((resolve, reject) => {
      server.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EPERM") {
          server.close(() => resolve());
          return;
        }

        reject(error);
      });

      server.listen(0, "127.0.0.1", async () => {
        try {
          const address = server.address();

          if (!address || typeof address === "string") {
            throw new Error("Server address is unavailable");
          }

          const user = backend.services.database.upsertUser({
            walletAddress: "0x1111111111111111111111111111111111111111",
            walletAccountType: "EOA",
            walletChainId: 8453,
          });
          const session = backend.services.database.createSession({
            userId: user.id,
            walletAddress: user.walletAddress,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          });
          const token = createSessionToken({
            secret: backend.services.config.sessionSecret,
            userId: user.id,
            sessionId: session.id,
            address: user.walletAddress,
            expiresAt: new Date(session.expiresAt),
          });

          const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
          socket.on("open", () => {
            socket.send(
              JSON.stringify({
                type: "auth.authenticate",
                token,
              }),
            );
          });
          socket.on("message", (data: WebSocket.RawData) => {
            const message = JSON.parse(String(data)) as { type: string; userId?: number };

            if (message.type === "auth.authenticated") {
              expect(message.userId).toBe(user.id);
              socket.close();
              server.close(() => resolve());
            }
          });
          socket.on("error", (error: Error) => {
            server.close(() => reject(error));
          });
        } catch (error) {
          server.close(() => reject(error));
        }
      });
    });
  });
});
