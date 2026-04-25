import type { MiddlewareHandler } from "hono";
import type { BackendConfig } from "./config.js";
import type { WalletSignatureVerifier } from "./auth/signature-verifier.js";
import type { SiweVerifierLike } from "./auth/siwe-verifier.js";
import type { AppLogger } from "./logging.js";
import type {
  AppDatabase,
  SessionRecord,
  UserRecord,
} from "./storage/database.js";
import type { ServerToClientMessage } from "./ws/protocol.js";
import type { WebSocketLike } from "./ws/hub.js";
import type { XmtpClientManager } from "./xmtp/client-manager.js";
import type { MediaStorage } from "./media/storage.js";

export type DatabaseLike = Pick<
  AppDatabase,
  | "createAuthNonce"
  | "consumeAuthNonce"
  | "createSession"
  | "createSiweNonce"
  | "consumeSiweNonce"
  | "getAuthNonceById"
  | "getSiweNonceById"
  | "getSessionById"
  | "getUserById"
  | "createMediaUpload"
  | "getKharismaProfileByUserId"
  | "getMediaUploadById"
  | "listXmtpAccounts"
  | "touchSession"
  | "upsertKharismaProfile"
  | "upsertUser"
>;

export type SignatureVerifierLike = Pick<WalletSignatureVerifier, "verify">;

export type WebSocketHubLike = {
  attachConnection(socket: WebSocketLike): void;
  hasUserConnection(userId: number): boolean;
  sendToUser(userId: number, message: ServerToClientMessage): void;
};

export type XmtpClientManagerLike = Pick<
  XmtpClientManager,
  | "bootstrapUserClient"
  | "createKharismaGroup"
  | "createThread"
  | "createWorldIdRequest"
  | "getKharismaWalletStatus"
  | "getKharismaSyncWalletStatus"
  | "getInvestmentConfig"
  | "joinKharismaGroup"
  | "listKharismaGroups"
  | "listConversations"
  | "listLatestThreads"
  | "listLoadedClients"
  | "listMessages"
  | "listThreadMessages"
  | "listThreads"
  | "markConversationRead"
  | "removeXmtpAccount"
  | "sendMessage"
  | "sendRemoteAttachment"
  | "submitKharismaHumanVerification"
  | "submitKharismaIdentityVerification"
  | "submitKharismaSyncHumanAgentVerification"
  | "submitKharismaSyncHumanVerification"
  | "submitKharismaSyncIdentityVerification"
  | "sendThreadAttachment"
  | "sendThreadMessage"
  | "submitInvestment"
>;

export type AppServices = {
  config: BackendConfig;
  database: DatabaseLike;
  mediaStorage: MediaStorage;
  signatureVerifier: SignatureVerifierLike;
  siweVerifier: SiweVerifierLike;
  websocketHub: WebSocketHubLike;
  xmtpClientManager: XmtpClientManagerLike;
};

export type ResolvedSession = {
  token: string;
  session: SessionRecord;
  user: UserRecord;
};

export type BackendAppEnv = {
  Variables: {
    session: ResolvedSession;
  };
};

export type BuildBackendAppOptions = {
  serviceOverrides?: Partial<AppServices>;
  x402Middleware?: MiddlewareHandler<BackendAppEnv>;
  logger?: AppLogger;
};
