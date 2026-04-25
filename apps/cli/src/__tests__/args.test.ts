import { describe, expect, test } from "vitest";
import { parseArgs } from "../args.js";
import { CliError } from "../errors.js";

const VALID_TARGET = "0x1111111111111111111111111111111111111111";
const VALID_KEY =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("parseArgs", () => {
  test("parses the required target and defaults", () => {
    const options = parseArgs({
      argv: ["skill", "--target", VALID_TARGET],
      env: {},
      cwd: "/tmp/kharisma-cli",
    });

    expect(options).toMatchObject({
      command: "skill",
      target: "0x1111111111111111111111111111111111111111",
      privateKey: null,
      storageDir: "/tmp/kharisma-cli/.data",
      xmtpEnv: "production",
      timeoutMs: 60_000,
      pollMs: 500,
      appVersion: "kharisma-cli/0.1.0",
      verbose: false,
    });
  });

  test("parses verbose as an opt-in boolean flag", () => {
    const options = parseArgs({
      argv: ["skill", "--target", VALID_TARGET, "--verbose"],
      env: {},
      cwd: "/tmp/kharisma-cli",
    });

    expect(options.verbose).toBe(true);
  });

  test("rejects verbose values", () => {
    expect(() =>
      parseArgs({
        argv: ["skill", "--target", VALID_TARGET, "--verbose=true"],
        env: {},
        cwd: "/tmp/kharisma-cli",
      }),
    ).toThrow("--verbose does not take a value");
  });

  test("private key flag wins over environment", () => {
    const options = parseArgs({
      argv: [
        "skill",
        "--target",
        VALID_TARGET,
        "--private-key",
        VALID_KEY,
      ],
      env: {
        KHARISMA_CLI_PRIVATE_KEY:
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
      cwd: "/tmp/kharisma-cli",
    });

    expect(options.privateKey).toBe(VALID_KEY);
  });

  test("reads private key from environment", () => {
    const options = parseArgs({
      argv: ["skill", "--target", VALID_TARGET],
      env: { KHARISMA_CLI_PRIVATE_KEY: VALID_KEY },
      cwd: "/tmp/kharisma-cli",
    });

    expect(options.privateKey).toBe(VALID_KEY);
  });

  test("rejects missing target", () => {
    expect(() =>
      parseArgs({ argv: ["skill"], env: {}, cwd: "/tmp/kharisma-cli" }),
    ).toThrow(CliError);
  });

  test("rejects invalid address", () => {
    expect(() =>
      parseArgs({
        argv: ["skill", "--target", "not-an-address"],
        env: {},
        cwd: "/tmp/kharisma-cli",
      }),
    ).toThrow("--target must be an EVM address");
  });

  test("rejects invalid private key", () => {
    expect(() =>
      parseArgs({
        argv: ["skill", "--target", VALID_TARGET, "--private-key", "0x1234"],
        env: {},
        cwd: "/tmp/kharisma-cli",
      }),
    ).toThrow("private key must be a 32-byte hex string");
  });

  test("rejects invalid env and timeout bounds", () => {
    expect(() =>
      parseArgs({
        argv: ["skill", "--target", VALID_TARGET, "--xmtp-env", "staging"],
        env: {},
        cwd: "/tmp/kharisma-cli",
      }),
    ).toThrow("--xmtp-env must be one of");

    expect(() =>
      parseArgs({
        argv: ["skill", "--target", VALID_TARGET, "--timeout-ms", "0"],
        env: {},
        cwd: "/tmp/kharisma-cli",
      }),
    ).toThrow("--timeout-ms must be a positive integer");
  });

  test("allows command-level help", () => {
    try {
      parseArgs({
        argv: ["skill", "--help"],
        env: {},
        cwd: "/tmp/kharisma-cli",
      });
      throw new Error("Expected parseArgs to throw help");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).exitCode).toBe(0);
      expect((error as Error).message).toContain("Usage:");
    }
  });
});
