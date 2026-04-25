import {
  chmodSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CliError } from "./errors.js";

export type ResolvedPrivateKey = {
  privateKey: Hex;
  address: `0x${string}`;
  source: "provided" | "stored" | "generated";
  keyPath: string;
};

export function resolvePrivateKey(input: {
  privateKey: Hex | null;
  storageDir: string;
}): ResolvedPrivateKey {
  mkdirSync(input.storageDir, { recursive: true });
  const keyPath = path.join(input.storageDir, "sender-wallet-key.hex");
  const stored = readOptionalHex32(keyPath);
  const source = input.privateKey ? "provided" : stored ? "stored" : "generated";
  const resolved = input.privateKey ?? stored ?? generatePrivateKey();
  const account = privateKeyToAccount(resolved);

  if (input.privateKey || !stored) {
    writeSecretHexFile(keyPath, resolved);
  }

  return {
    privateKey: resolved,
    address: account.address,
    source,
    keyPath,
  };
}

export function resolveDbEncryptionKey(input: {
  storageDir: string;
  env?: NodeJS.ProcessEnv;
}): Hex {
  const env = input.env ?? process.env;
  const envKey = env.XMTP_DB_ENCRYPTION_KEY_HEX;

  if (envKey) {
    return parseHex32(envKey, "XMTP_DB_ENCRYPTION_KEY_HEX");
  }

  mkdirSync(input.storageDir, { recursive: true });
  const keyPath = path.join(input.storageDir, "xmtp-db-key.hex");

  try {
    const existing = readFileSync(keyPath, "utf8").trim();
    return parseHex32(existing, keyPath);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }

  const key = `0x${randomBytes(32).toString("hex")}` as Hex;
  writeSecretHexFile(keyPath, key, "wx");
  return key;
}

export function xmtpDbPath(input: {
  storageDir: string;
  address: `0x${string}`;
}): string {
  const dir = path.join(input.storageDir, "xmtp", input.address.toLowerCase());
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "client.db3");
}

function readOptionalHex32(keyPath: string): Hex | null {
  try {
    const existing = readFileSync(keyPath, "utf8").trim();
    return parseHex32(existing, keyPath);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
    return null;
  }
}

function writeSecretHexFile(
  keyPath: string,
  key: Hex,
  flag: "w" | "wx" = "w",
): void {
  const fd = openSync(keyPath, flag, 0o600);
  try {
    writeFileSync(fd, `${key}\n`, "utf8");
    chmodSync(keyPath, 0o600);
  } finally {
    try {
      closeSync(fd);
    } catch {
      // Ignore close errors after a successful key write.
    }
  }
}

function parseHex32(value: string, label: string): Hex {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new CliError(`${label} must be a 32-byte hex string`, 2);
  }
  return normalized.toLowerCase() as Hex;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
