import type { AppServices } from "./backend-types.js";
import type { BackendConfig } from "./config.js";
import type { AppLogger } from "./logging.js";
import { SecretBox } from "./crypto/encryption.js";
import { AppDatabase } from "./storage/database.js";
import { WalletSignatureVerifier } from "./auth/signature-verifier.js";
import { WorldAppSiweVerifier } from "./auth/siwe-verifier.js";
import { createMediaStorage } from "./media/storage.js";
import { WebSocketHub } from "./ws/hub.js";
import { SignatureRequestBroker } from "./xmtp/signature-broker.js";
import { XmtpClientManager } from "./xmtp/client-manager.js";

export function createAppServices(
  config: BackendConfig,
  overrides: Partial<AppServices> = {},
  loggers: {
    ws: AppLogger;
    xmtp: AppLogger;
  },
): AppServices {
  const secretBox = new SecretBox(config.masterKeyHex);
  const database = overrides.database ?? new AppDatabase(config.metadataDbPath, secretBox);
  const mediaStorage = overrides.mediaStorage ?? createMediaStorage(config);
  const signatureVerifier =
    overrides.signatureVerifier ?? new WalletSignatureVerifier(config.rpcUrls);
  const siweVerifier =
    overrides.siweVerifier ?? new WorldAppSiweVerifier(config.rpcUrls[480]);

  const signatureBroker = new SignatureRequestBroker(
    database as AppDatabase,
    signatureVerifier as WalletSignatureVerifier,
    config.signatureRequestTimeoutMs,
    loggers.xmtp.child({ subsystem: "signature-broker" }),
  );

  const websocketHub =
    overrides.websocketHub ??
    new WebSocketHub(
      database as AppDatabase,
      config.sessionSecret,
      signatureBroker,
      loggers.ws,
    );
  signatureBroker.attachHub(websocketHub as WebSocketHub);

  const xmtpClientManager =
    overrides.xmtpClientManager ??
    new XmtpClientManager(
      config,
      database as AppDatabase,
      signatureBroker,
      websocketHub as WebSocketHub,
      loggers.xmtp,
    );

  return {
    config,
    database,
    mediaStorage,
    signatureVerifier,
    siweVerifier,
    websocketHub,
    xmtpClientManager,
  };
}
