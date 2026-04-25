import { mkdirSync } from "node:fs";
import path from "node:path";
import { getAddress, type Hex } from "viem";
import type { Network } from "@x402/core/types";
import { parseLogLevel, type LogLevel } from "./logging.js";

export type BackendConfig = {
  port: number;
  host: string;
  logLevel: LogLevel;
  dataRoot: string;
  appDataDir: string;
  xmtpDataDir: string;
  mediaUploadsDir: string;
  metadataDbPath: string;
  mediaStorageProvider: "local" | "r2";
  mediaPublicBaseUrl: string;
  r2AccountId: string;
  r2Bucket: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  appOrigin: string;
  corsAllowedOrigins: string[];
  sessionSecret: string;
  masterKeyHex: string;
  xmtpDbEncryptionKey: Hex;
  adminToken: string;
  xmtpEnv: "local" | "dev" | "production";
  xmtpAppVersion: string;
  rpcUrls: Partial<Record<number, string>>;
  signatureRequestTimeoutMs: number;
  sessionTtlMs: number;
  authChallengeTtlMs: number;
  idleClientTtlMs: number;
  x402Enabled: boolean;
  x402FacilitatorUrl: string;
  x402Network: Network;
  x402PayTo: `0x${string}`;
  x402PriceUsd: string;
  kharismaMainAddress: `0x${string}` | "";
  kharismaMainInboxId: string;
  kharismaRequestTimeoutMs: number;
  worldIdAppId: `app_${string}` | "";
  worldIdRpId: string;
  worldIdRpSigningKeyHex: string;
  worldIdAction: string;
  worldIdEnvironment: "production" | "staging";
  worldIdRequestTtlSeconds: number;
};

function parseRequired(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseRequiredHex32(name: string): Hex {
  const value = parseRequired(name).replace(/^0x/, "");

  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 32-byte hex string`);
  }

  return `0x${value.toLowerCase()}` as Hex;
}

function normalizeOrigin(value: string) {
  return new URL(value).origin;
}

function parseOriginList(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map(normalizeOrigin);
}

function parseWorldIdEnvironment(
  value: string | undefined,
): "production" | "staging" {
  return value === "staging" ? "staging" : "production";
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseMediaStorageProvider(
  value: string | undefined,
): "local" | "r2" {
  if (!value || value === "local") {
    return "local";
  }

  if (value === "r2") {
    return "r2";
  }

  throw new Error(
    `Invalid MEDIA_STORAGE_PROVIDER "${value}". Expected one of: local, r2`,
  );
}

function normalizeOptionalPublicBaseUrl(value: string | undefined) {
  if (!value) {
    return "";
  }

  const url = new URL(value);
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/+$/, "");
}

function isEthereumAddress(value: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function parseKharismaMainIdentity() {
  const rawAddress = process.env.KHARISMA_MAIN_ADDRESS?.trim();
  const rawInboxId = process.env.KHARISMA_MAIN_INBOX_ID?.trim() ?? "";

  if (rawAddress) {
    return {
      kharismaMainAddress: getAddress(rawAddress) as `0x${string}`,
      kharismaMainInboxId: rawInboxId,
    };
  }

  if (isEthereumAddress(rawInboxId)) {
    return {
      kharismaMainAddress: getAddress(rawInboxId) as `0x${string}`,
      kharismaMainInboxId: "",
    };
  }

  return {
    kharismaMainAddress: "" as const,
    kharismaMainInboxId: rawInboxId,
  };
}

function withLocalLoopbackAliases(origin: string) {
  const url = new URL(origin);
  const origins = new Set([url.origin]);

  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    return [...origins];
  }

  for (const hostname of ["localhost", "127.0.0.1"]) {
    url.hostname = hostname;
    origins.add(url.origin);
  }

  return [...origins];
}

export function loadConfig(): BackendConfig {
  const dataRoot = path.resolve(process.cwd(), process.env.DATA_ROOT ?? ".data");
  const appDataDir = path.join(dataRoot, "app");
  const xmtpDataDir = path.join(dataRoot, "xmtp");
  const mediaUploadsDir = path.resolve(
    process.cwd(),
    process.env.MEDIA_UPLOADS_DIR ?? "uploads",
  );
  const mediaStorageProvider = parseMediaStorageProvider(
    process.env.MEDIA_STORAGE_PROVIDER,
  );
  const mediaPublicBaseUrl = normalizeOptionalPublicBaseUrl(
    process.env.MEDIA_PUBLIC_BASE_URL,
  );
  const appOrigin = normalizeOrigin(process.env.APP_ORIGIN ?? "http://localhost:3000");
  const configuredCorsOrigins = parseOriginList(process.env.CORS_ALLOWED_ORIGINS);
  const kharismaMainIdentity = parseKharismaMainIdentity();

  mkdirSync(appDataDir, { recursive: true });
  mkdirSync(xmtpDataDir, { recursive: true });

  if (mediaStorageProvider === "r2") {
    for (const name of [
      "MEDIA_PUBLIC_BASE_URL",
      "R2_ACCOUNT_ID",
      "R2_BUCKET",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
    ]) {
      parseRequired(name);
    }
  }

  return {
    port: Number.parseInt(process.env.PORT ?? "4000", 10),
    host: process.env.HOST ?? "0.0.0.0",
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
    dataRoot,
    appDataDir,
    xmtpDataDir,
    mediaUploadsDir,
    metadataDbPath: path.join(appDataDir, "backend.sqlite"),
    mediaStorageProvider,
    mediaPublicBaseUrl,
    r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
    r2Bucket: process.env.R2_BUCKET ?? "",
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    appOrigin,
    corsAllowedOrigins:
      configuredCorsOrigins.length > 0
        ? configuredCorsOrigins
        : withLocalLoopbackAliases(appOrigin),
    sessionSecret: parseRequired("SESSION_SECRET"),
    masterKeyHex: parseRequired("MASTER_KEY_HEX"),
    xmtpDbEncryptionKey: parseRequiredHex32("XMTP_DB_ENCRYPTION_KEY_HEX"),
    adminToken: parseRequired("ADMIN_TOKEN"),
    xmtpEnv:
      process.env.XMTP_ENV === "local" ||
      process.env.XMTP_ENV === "dev" ||
      process.env.XMTP_ENV === "production"
        ? process.env.XMTP_ENV
        : "production",
    xmtpAppVersion: "kharisma-backend/0.1.0",
    rpcUrls: {
      1: process.env.RPC_URL_MAINNET,
      10: process.env.RPC_URL_OPTIMISM,
      8453: process.env.RPC_URL_BASE,
      480: process.env.RPC_URL_WORLDCHAIN,
    },
    signatureRequestTimeoutMs: 90_000,
    sessionTtlMs: 1000 * 60 * 60 * 24 * 7,
    authChallengeTtlMs: 1000 * 60 * 5,
    idleClientTtlMs: 1000 * 60 * 15,
    x402Enabled: process.env.X402_ENABLED === "true",
    x402FacilitatorUrl:
      process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
    x402Network: (process.env.X402_NETWORK ?? "eip155:84532") as Network,
    x402PayTo: getAddress(parseRequired("X402_PAY_TO")) as `0x${string}`,
    x402PriceUsd: process.env.X402_PRICE_USD ?? "$0.01",
    kharismaMainAddress: kharismaMainIdentity.kharismaMainAddress,
    kharismaMainInboxId: kharismaMainIdentity.kharismaMainInboxId,
    kharismaRequestTimeoutMs: Number.parseInt(
      process.env.KHARISMA_REQUEST_TIMEOUT_MS ?? "30000",
      10,
    ),
    worldIdAppId: (process.env.WORLD_ID_APP_ID ?? "") as `app_${string}` | "",
    worldIdRpId: process.env.WORLD_ID_RP_ID ?? "",
    worldIdRpSigningKeyHex: process.env.WORLD_ID_RP_SIGNING_KEY_HEX ?? "",
    worldIdAction: process.env.WORLD_ID_ACTION ?? "human",
    worldIdEnvironment: parseWorldIdEnvironment(process.env.WORLD_ID_ENVIRONMENT),
    worldIdRequestTtlSeconds: parsePositiveInteger(
      process.env.WORLD_ID_REQUEST_TTL_SECONDS,
      900,
    ),
  };
}
