import path from "node:path";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CliError } from "./errors.js";

export type XmtpEnv = "local" | "dev" | "production";

export type SkillCommandOptions = {
  command: "skill";
  target: Address;
  privateKey: Hex | null;
  storageDir: string;
  xmtpEnv: XmtpEnv;
  timeoutMs: number;
  pollMs: number;
  appVersion: string;
  verbose: boolean;
};

type ParseInput = {
  argv: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
};

const DEFAULT_STORAGE_DIR = "./.data";
const DEFAULT_XMTP_ENV: XmtpEnv = "production";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_MS = 500;
const DEFAULT_APP_VERSION = "kharisma-cli/0.1.0";

export function parseArgs(input: ParseInput): SkillCommandOptions {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
  const [command, ...rest] = input.argv;

  if (!command || command === "--help" || command === "-h") {
    throw new CliError(usage(), 0);
  }

  if (command !== "skill") {
    throw new CliError(`Unknown command: ${command}\n\n${usage()}`, 2);
  }
  if (rest.includes("--help") || rest.includes("-h")) {
    throw new CliError(usage(), 0);
  }

  const flags = parseFlags(rest);
  const target = requireAddress(flags, "target");
  const privateKey = parseOptionalPrivateKey(
    flags.get("private-key") ?? env.KHARISMA_CLI_PRIVATE_KEY,
    "private key",
  );
  const storageDir = path.resolve(cwd, flags.get("storage-dir") ?? DEFAULT_STORAGE_DIR);
  const xmtpEnv = parseXmtpEnv(flags.get("xmtp-env") ?? DEFAULT_XMTP_ENV);
  const timeoutMs = parsePositiveInteger(
    flags.get("timeout-ms"),
    DEFAULT_TIMEOUT_MS,
    "timeout-ms",
  );
  const pollMs = parsePositiveInteger(flags.get("poll-ms"), DEFAULT_POLL_MS, "poll-ms");
  const appVersion = flags.get("app-version") ?? DEFAULT_APP_VERSION;
  const verbose = flags.has("verbose");

  return {
    command: "skill",
    target,
    privateKey,
    storageDir,
    xmtpEnv,
    timeoutMs,
    pollMs,
    appVersion,
    verbose,
  };
}

function parseFlags(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new CliError(`Unexpected argument: ${token}`, 2);
    }

    const [rawName, inlineValue] = token.slice(2).split("=", 2);
    if (!rawName) {
      throw new CliError(`Invalid flag: ${token}`, 2);
    }

    if (rawName === "verbose") {
      if (inlineValue !== undefined) {
        throw new CliError("--verbose does not take a value", 2);
      }
      flags.set(rawName, "true");
      continue;
    }

    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new CliError(`Missing value for --${rawName}`, 2);
    }

    if (inlineValue === undefined) {
      index += 1;
    }
    flags.set(rawName, value);
  }

  return flags;
}

function requireAddress(flags: Map<string, string>, name: string): Address {
  const value = flags.get(name);
  if (!value) {
    throw new CliError(`Missing required option --${name}`, 2);
  }
  if (!isAddress(value)) {
    throw new CliError(`--${name} must be an EVM address`, 2);
  }
  return getAddress(value);
}

export function parseOptionalPrivateKey(
  value: string | undefined,
  label: string,
): Hex | null {
  if (!value) {
    return null;
  }

  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new CliError(`${label} must be a 32-byte hex string`, 2);
  }

  try {
    privateKeyToAccount(normalized as Hex);
  } catch (error) {
    throw new CliError(`${label} is not a valid EOA private key`, 2);
  }

  return normalized.toLowerCase() as Hex;
}

function parseXmtpEnv(value: string): XmtpEnv {
  if (value === "local" || value === "dev" || value === "production") {
    return value;
  }
  throw new CliError("--xmtp-env must be one of: local, dev, production", 2);
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError(`--${name} must be a positive integer`, 2);
  }
  return parsed;
}

export function usage(): string {
  return [
    "Usage:",
    "  kharisma-cli skill --target <wallet> [options]",
    "",
    "Options:",
    "  --private-key <hex>       Sender EOA private key. Falls back to KHARISMA_CLI_PRIVATE_KEY.",
    "  --storage-dir <path>      Storage directory. Default: ./.data",
    "  --xmtp-env <env>          local, dev, or production. Default: production",
    "  --timeout-ms <ms>         Response timeout. Default: 60000",
    "  --poll-ms <ms>            Poll interval. Default: 500",
    "  --app-version <version>   XMTP app version. Default: kharisma-cli/0.1.0",
    "  --verbose                 Print wallet generation details to stderr. Default: off",
  ].join("\n");
}
