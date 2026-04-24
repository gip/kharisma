import { mkdirSync } from "node:fs";
import path from "node:path";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { parseLogLevel, type LogLevel } from "./logging.js";
import type { InvestmentToken } from "@kharisma/protocol";

export type XmtpEnv = "local" | "dev" | "production";

export type GroupsConfig = {
  logLevel: LogLevel;
  dataRoot: string;
  mainXmtpDir: string;
  groupsXmtpDir: string;
  groupsDbPath: string;
  kharismaPrivateKey: Hex;
  storageEncryptionKeyHex: string;
  xmtpDbEncryptionKey: Hex;
  xmtpEnv: XmtpEnv;
  xmtpAppVersion: string;
  worldIdRpId: string;
  investmentConfirmations: bigint;
  investmentDestinationAddress: Address | null;
  investmentChains: InvestmentChainConfig[];
};

export type InvestmentChainConfig = {
  chainId: number;
  name: "world" | "base";
  rpcUrl: string;
  bundlerRpcUrl: string | null;
  tokens: Partial<Record<InvestmentToken, InvestmentTokenConfig>>;
};

export type InvestmentTokenConfig = {
  token: InvestmentToken;
  address: Address;
  decimals: number;
};

function parseRequired(name: string): string {
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

function parseXmtpEnv(value: string | undefined): XmtpEnv {
  if (value === "local" || value === "dev" || value === "production") {
    return value;
  }
  return "dev";
}

function parseOptionalAddress(name: string): Address | null {
  const value = process.env[name];
  if (!value) return null;
  if (!isAddress(value)) {
    throw new Error(`${name} must be an EVM address`);
  }
  return getAddress(value);
}

function parseOptionalChainId(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const chainId = Number(value);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return chainId;
}

function parseConfirmations(): bigint {
  const value = process.env.GROUPS_INVESTMENT_CONFIRMATIONS;
  if (!value) return 1n;
  const confirmations = BigInt(value);
  if (confirmations < 0n) {
    throw new Error("GROUPS_INVESTMENT_CONFIRMATIONS must be non-negative");
  }
  return confirmations;
}

function tokenConfig(
  token: InvestmentToken,
  address: Address | null,
): InvestmentTokenConfig | undefined {
  if (!address) return undefined;
  return {
    token,
    address,
    decimals: token === "USDC" ? 6 : 18,
  };
}

function parseInvestmentChains(): InvestmentChainConfig[] {
  const worldRpcUrl = process.env.GROUPS_WORLD_RPC_URL;
  const baseRpcUrl = process.env.GROUPS_BASE_RPC_URL;
  const chains: InvestmentChainConfig[] = [];

  if (worldRpcUrl) {
    const wld = tokenConfig(
      "WLD",
      parseOptionalAddress("GROUPS_WORLD_WLD_ADDRESS"),
    );
    const usdc = tokenConfig(
      "USDC",
      parseOptionalAddress("GROUPS_WORLD_USDC_ADDRESS"),
    );
    chains.push({
      name: "world",
      chainId: parseOptionalChainId("GROUPS_WORLD_CHAIN_ID", 480),
      rpcUrl: worldRpcUrl,
      bundlerRpcUrl: process.env.GROUPS_WORLD_BUNDLER_RPC_URL ?? null,
      tokens: {
        ...(wld ? { WLD: wld } : {}),
        ...(usdc ? { USDC: usdc } : {}),
      },
    });
  }

  if (baseRpcUrl) {
    const wld = tokenConfig(
      "WLD",
      parseOptionalAddress("GROUPS_BASE_WLD_ADDRESS"),
    );
    const usdc = tokenConfig(
      "USDC",
      parseOptionalAddress("GROUPS_BASE_USDC_ADDRESS"),
    );
    chains.push({
      name: "base",
      chainId: parseOptionalChainId("GROUPS_BASE_CHAIN_ID", 8453),
      rpcUrl: baseRpcUrl,
      bundlerRpcUrl: process.env.GROUPS_BASE_BUNDLER_RPC_URL ?? null,
      tokens: {
        ...(wld ? { WLD: wld } : {}),
        ...(usdc ? { USDC: usdc } : {}),
      },
    });
  }

  return chains;
}

export function loadConfig(): GroupsConfig {
  const dataRoot = path.resolve(
    process.cwd(),
    process.env.GROUPS_DATA_ROOT ?? ".data",
  );
  const mainXmtpDir = path.join(dataRoot, "xmtp", "main");
  const groupsXmtpDir = path.join(dataRoot, "xmtp", "groups");

  mkdirSync(mainXmtpDir, { recursive: true });
  mkdirSync(groupsXmtpDir, { recursive: true });

  return {
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
    dataRoot,
    mainXmtpDir,
    groupsXmtpDir,
    groupsDbPath: path.join(dataRoot, "groups.db"),
    kharismaPrivateKey: parseRequiredHex32("GROUPS_KHARISMA_PRIVATE_KEY"),
    storageEncryptionKeyHex: parseRequiredHex32(
      "GROUPS_STORAGE_ENCRYPTION_KEY_HEX",
    ),
    xmtpDbEncryptionKey: parseRequiredHex32("XMTP_DB_ENCRYPTION_KEY_HEX"),
    xmtpEnv: parseXmtpEnv(process.env.XMTP_ENV),
    xmtpAppVersion: process.env.XMTP_APP_VERSION ?? "groups-service/0.1.0",
    worldIdRpId: process.env.WORLD_ID_RP_ID ?? "",
    investmentConfirmations: parseConfirmations(),
    investmentDestinationAddress: parseOptionalAddress(
      "GROUPS_INVESTMENT_DESTINATION_ADDRESS",
    ),
    investmentChains: parseInvestmentChains(),
  };
}
