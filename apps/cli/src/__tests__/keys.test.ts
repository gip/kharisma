import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { isAddress } from "viem";
import { resolveDbEncryptionKey, resolvePrivateKey, xmtpDbPath } from "../keys.js";

const VALID_KEY =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "kharisma-cli-test-"));
}

describe("keys", () => {
  test("resolves provided private key", () => {
    const dir = tempDir();
    try {
      const resolved = resolvePrivateKey({
        privateKey: VALID_KEY,
        storageDir: dir,
      });

      expect(resolved.privateKey).toBe(VALID_KEY);
      expect(resolved.source).toBe("provided");
      expect(isAddress(resolved.address)).toBe(true);
      expect(readFileSync(path.join(dir, "sender-wallet-key.hex"), "utf8").trim()).toBe(
        VALID_KEY,
      );
      expect(statSync(path.join(dir, "sender-wallet-key.hex")).mode & 0o777).toBe(
        0o600,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("generates and stores a private key when omitted", () => {
    const dir = tempDir();
    try {
      const resolved = resolvePrivateKey({ privateKey: null, storageDir: dir });

      expect(resolved.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
      expect(resolved.source).toBe("generated");
      expect(isAddress(resolved.address)).toBe(true);
      expect(readFileSync(path.join(dir, "sender-wallet-key.hex"), "utf8").trim()).toBe(
        resolved.privateKey,
      );
      expect(statSync(path.join(dir, "sender-wallet-key.hex")).mode & 0o777).toBe(
        0o600,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reuses stored private key when omitted", () => {
    const dir = tempDir();
    try {
      const first = resolvePrivateKey({ privateKey: VALID_KEY, storageDir: dir });
      const second = resolvePrivateKey({ privateKey: null, storageDir: dir });

      expect(first.source).toBe("provided");
      expect(second.privateKey).toBe(VALID_KEY);
      expect(second.source).toBe("stored");
      expect(second.address).toBe(first.address);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("provided private key replaces stored private key", () => {
    const dir = tempDir();
    const replacement =
      "0x1111111111111111111111111111111111111111111111111111111111111111";
    try {
      resolvePrivateKey({ privateKey: VALID_KEY, storageDir: dir });
      const resolved = resolvePrivateKey({
        privateKey: replacement,
        storageDir: dir,
      });

      expect(resolved.source).toBe("provided");
      expect(readFileSync(path.join(dir, "sender-wallet-key.hex"), "utf8").trim()).toBe(
        replacement,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("uses DB encryption key from env", () => {
    const dir = tempDir();
    try {
      expect(
        resolveDbEncryptionKey({
          storageDir: dir,
          env: { XMTP_DB_ENCRYPTION_KEY_HEX: VALID_KEY },
        }),
      ).toBe(VALID_KEY);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("creates and reuses DB encryption key file", () => {
    const dir = tempDir();
    try {
      const first = resolveDbEncryptionKey({ storageDir: dir, env: {} });
      const second = resolveDbEncryptionKey({ storageDir: dir, env: {} });
      const keyPath = path.join(dir, "xmtp-db-key.hex");

      expect(first).toMatch(/^0x[0-9a-f]{64}$/);
      expect(second).toBe(first);
      expect(readFileSync(keyPath, "utf8").trim()).toBe(first);
      expect(statSync(keyPath).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("creates the sender XMTP DB directory path", () => {
    const dir = tempDir();
    try {
      const dbPath = xmtpDbPath({
        storageDir: dir,
        address: "0x1111111111111111111111111111111111111111",
      });

      expect(dbPath).toBe(
        path.join(
          dir,
          "xmtp",
          "0x1111111111111111111111111111111111111111",
          "client.db3",
        ),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
