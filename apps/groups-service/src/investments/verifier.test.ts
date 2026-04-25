import { describe, expect, test, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";
import type { GroupsConfig } from "../config.js";
import {
  InvestmentVerifier,
  type InvestmentPublicClient,
} from "./verifier.js";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const investor = getAddress("0x1111111111111111111111111111111111111111");
const destination = getAddress("0x2222222222222222222222222222222222222222");
const worldUsdc = getAddress("0x3333333333333333333333333333333333333333");
const worldWld = getAddress("0x4444444444444444444444444444444444444444");
const baseUsdc = getAddress("0x5555555555555555555555555555555555555555");
const txHash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;

function config(): GroupsConfig {
  return {
    logLevel: "silent",
    dataRoot: ".data",
    mainXmtpDir: ".data/xmtp/main",
    groupsXmtpDir: ".data/xmtp/groups",
    groupsDbPath: ".data/groups.db",
    kharismaPrivateKey:
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    storageEncryptionKeyHex:
      "0x2222222222222222222222222222222222222222222222222222222222222222",
    xmtpDbEncryptionKey:
      "0x3333333333333333333333333333333333333333333333333333333333333333",
    xmtpEnv: "dev",
    xmtpAppVersion: "test",
    worldIdRpId: "",
    investmentConfirmations: 2n,
    investmentChains: [
      {
        name: "world",
        chainId: 480,
        rpcUrl: "https://world.example",
        bundlerRpcUrl: "https://world-bundler.example",
        tokens: {
          USDC: { token: "USDC", address: worldUsdc, decimals: 6 },
          WLD: { token: "WLD", address: worldWld, decimals: 18 },
        },
      },
      {
        name: "base",
        chainId: 8453,
        rpcUrl: "https://base.example",
        bundlerRpcUrl: null,
        tokens: {
          USDC: { token: "USDC", address: baseUsdc, decimals: 6 },
        },
      },
    ],
  };
}

function transferLog(input: {
  tokenAddress: Address;
  from: Address;
  to: Address;
  value: bigint;
  logIndex?: number;
}) {
  const topics = encodeEventTopics({
    abi: [transferEvent],
    eventName: "Transfer",
    args: {
      from: input.from,
      to: input.to,
    },
  });
  return {
    address: input.tokenAddress,
    data: encodeAbiParameters([{ type: "uint256" }], [input.value]),
    topics,
    logIndex: input.logIndex ?? 0,
  };
}

function verifierWithLog(log: ReturnType<typeof transferLog>, overrides: {
  status?: "success" | "reverted";
  latestBlock?: bigint;
  receiptBlock?: bigint;
} = {}) {
  const client: InvestmentPublicClient = {
    async getTransactionReceipt() {
      return {
        status: overrides.status ?? "success",
        blockNumber: overrides.receiptBlock ?? 10n,
        logs: [log],
      };
    },
    async getBlockNumber() {
      return overrides.latestBlock ?? 11n;
    },
  };
  return new InvestmentVerifier(config(), new Map([[480, client], [8453, client]]));
}

async function verify(verifier: InvestmentVerifier, input = {}) {
  return verifier.verify({
    groupId: "g-1",
    txHash,
    chainId: 480,
    token: "USDC",
    amount: "25",
    investorWalletAddress: investor,
    destinationAddress: destination,
    ...input,
  });
}

describe("InvestmentVerifier", () => {
  test("accepts a valid World USDC transfer", async () => {
    const result = await verify(
      verifierWithLog(
        transferLog({
          tokenAddress: worldUsdc,
          from: investor,
          to: destination,
          value: 25n,
          logIndex: 3,
        }),
      ),
    );
    expect(result).toMatchObject({
      tokenAddress: worldUsdc,
      decimals: 6,
      logIndex: 3,
    });
  });

  test("accepts a valid World WLD transfer", async () => {
    const result = await verify(
      verifierWithLog(
        transferLog({
          tokenAddress: worldWld,
          from: investor,
          to: destination,
          value: 10n,
        }),
      ),
      {
        token: "WLD",
        amount: "10",
      },
    );
    expect(result).toMatchObject({
      tokenAddress: worldWld,
      decimals: 18,
    });
  });

  test("accepts a valid Base USDC transfer", async () => {
    const result = await verify(
      verifierWithLog(
        transferLog({
          tokenAddress: baseUsdc,
          from: investor,
          to: destination,
          value: 25n,
        }),
      ),
      {
        chainId: 8453,
      },
    );
    expect(result.tokenAddress).toBe(baseUsdc);
  });

  test("rejects wrong chain, token, sender, recipient, amount, failed receipt, missing log, and insufficient confirmations", async () => {
    const validLog = transferLog({
      tokenAddress: worldUsdc,
      from: investor,
      to: destination,
      value: 25n,
    });

    await expect(
      verify(verifierWithLog(validLog), { chainId: 1 }),
    ).rejects.toThrow(/unsupported investment chain/);
    await expect(
      verify(verifierWithLog(validLog), { token: "WLD" }),
    ).rejects.toThrow(/expected transfer/);
    await expect(
      verify(
        verifierWithLog(
          transferLog({
            tokenAddress: worldUsdc,
            from: getAddress("0x6666666666666666666666666666666666666666"),
            to: destination,
            value: 25n,
          }),
        ),
      ),
    ).rejects.toThrow(/expected transfer/);
    await expect(
      verify(
        verifierWithLog(
          transferLog({
            tokenAddress: worldUsdc,
            from: investor,
            to: getAddress("0x7777777777777777777777777777777777777777"),
            value: 25n,
          }),
        ),
      ),
    ).rejects.toThrow(/expected transfer/);
    await expect(
      verify(verifierWithLog(validLog), { amount: "26" }),
    ).rejects.toThrow(/expected transfer/);
    await expect(
      verify(verifierWithLog(validLog, { status: "reverted" })),
    ).rejects.toThrow(/did not succeed/);
    await expect(
      verify(
        verifierWithLog({
          address: worldUsdc,
          data: "0x",
          topics: [],
          logIndex: 0,
        }),
      ),
    ).rejects.toThrow(/expected transfer/);
    await expect(
      verify(verifierWithLog(validLog, { latestBlock: 10n })),
    ).rejects.toThrow(/insufficient confirmations/);
  });

  test("resolves a user operation hash to its transaction hash", async () => {
    const userOpHash =
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;
    const bundlerClient = {
      getUserOperationTransactionHash: vi.fn().mockResolvedValue(txHash),
    };
    const verifier = new InvestmentVerifier(
      config(),
      new Map(),
      new Map([[480, bundlerClient]]),
    );

    await expect(
      verifier.resolveUserOperationTransactionHash({
        chainId: 480,
        userOpHash,
      }),
    ).resolves.toBe(txHash);
    expect(bundlerClient.getUserOperationTransactionHash).toHaveBeenCalledWith({
      userOpHash,
    });
  });
});
