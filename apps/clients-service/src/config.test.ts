import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const REQUIRED_ENV = {
  ADMIN_TOKEN: "test-admin-token",
  MASTER_KEY_HEX:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  SESSION_SECRET: "test-session-secret",
  XMTP_DB_ENCRYPTION_KEY_HEX:
    "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  X402_PAY_TO: "0x1111111111111111111111111111111111111111",
} as const;

describe("loadConfig", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "clients-service-config-"));
    process.env = {
      ...originalEnv,
      ...REQUIRED_ENV,
      DATA_ROOT: tempDir,
    };
    delete process.env.LOG_LEVEL;
    delete process.env.MEDIA_STORAGE_PROVIDER;
    delete process.env.MEDIA_UPLOADS_DIR;
    delete process.env.MEDIA_PUBLIC_BASE_URL;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_BUCKET;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("defaults LOG_LEVEL to info", () => {
    const config = loadConfig();
    expect(config.logLevel).toBe("info");
  });

  it("defaults X402_ENABLED to false", () => {
    const config = loadConfig();
    expect(config.x402Enabled).toBe(false);
  });

  it("defaults media storage to local uploads", () => {
    const config = loadConfig();
    expect(config.mediaStorageProvider).toBe("local");
    expect(config.mediaPublicBaseUrl).toBe("");
    expect(config.mediaUploadsDir).toBe(path.resolve(process.cwd(), "uploads"));
  });

  it("loads R2 media storage configuration", () => {
    process.env.MEDIA_STORAGE_PROVIDER = "r2";
    process.env.MEDIA_PUBLIC_BASE_URL = "https://media.kharisma.example/";
    process.env.R2_ACCOUNT_ID = "account-id";
    process.env.R2_BUCKET = "kharisma-media";
    process.env.R2_ACCESS_KEY_ID = "access-key-id";
    process.env.R2_SECRET_ACCESS_KEY = "secret-access-key";

    const config = loadConfig();
    expect(config.mediaStorageProvider).toBe("r2");
    expect(config.mediaPublicBaseUrl).toBe("https://media.kharisma.example");
    expect(config.r2AccountId).toBe("account-id");
    expect(config.r2Bucket).toBe("kharisma-media");
    expect(config.r2AccessKeyId).toBe("access-key-id");
    expect(config.r2SecretAccessKey).toBe("secret-access-key");
  });

  it("requires R2 settings when R2 media storage is enabled", () => {
    process.env.MEDIA_STORAGE_PROVIDER = "r2";
    expect(() => loadConfig()).toThrow(
      "Missing required environment variable: MEDIA_PUBLIC_BASE_URL",
    );
  });

  it("rejects invalid media storage providers", () => {
    process.env.MEDIA_STORAGE_PROVIDER = "s3";
    expect(() => loadConfig()).toThrow(
      'Invalid MEDIA_STORAGE_PROVIDER "s3". Expected one of: local, r2',
    );
  });

  it("enables x402 when X402_ENABLED is true", () => {
    process.env.X402_ENABLED = "true";
    const config = loadConfig();
    expect(config.x402Enabled).toBe(true);
  });

  it("accepts valid LOG_LEVEL values", () => {
    process.env.LOG_LEVEL = "debug";
    const config = loadConfig();
    expect(config.logLevel).toBe("debug");
  });

  it("rejects invalid LOG_LEVEL values", () => {
    process.env.LOG_LEVEL = "loud";
    expect(() => loadConfig()).toThrow(
      'Invalid LOG_LEVEL "loud". Expected one of: trace, debug, info, warn, error, fatal, silent',
    );
  });

  it("still requires X402_PAY_TO when x402 is disabled", () => {
    delete process.env.X402_PAY_TO;
    expect(() => loadConfig()).toThrow(
      "Missing required environment variable: X402_PAY_TO",
    );
  });

  it("requires a valid XMTP_DB_ENCRYPTION_KEY_HEX", () => {
    process.env.XMTP_DB_ENCRYPTION_KEY_HEX = "not-hex";
    expect(() => loadConfig()).toThrow(
      "XMTP_DB_ENCRYPTION_KEY_HEX must be a 32-byte hex string",
    );
  });

  it("accepts a Kharisma main Ethereum address", () => {
    process.env.KHARISMA_MAIN_ADDRESS =
      "0xdc61e88b41f404f2f3e053459d0d771d1a753082";
    const config = loadConfig();
    expect(config.kharismaMainAddress).toBe(
      "0xdc61e88b41F404F2F3E053459d0D771d1a753082",
    );
    expect(config.kharismaMainInboxId).toBe("");
  });

  it("treats a wallet-shaped Kharisma inbox id as an address for compatibility", () => {
    process.env.KHARISMA_MAIN_INBOX_ID =
      "0xdc61e88b41f404f2f3e053459d0d771d1a753082";
    const config = loadConfig();
    expect(config.kharismaMainAddress).toBe(
      "0xdc61e88b41F404F2F3E053459d0D771d1a753082",
    );
    expect(config.kharismaMainInboxId).toBe("");
  });
});
