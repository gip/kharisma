import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  isAddress,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";
import type { InvestmentToken } from "@kharisma/protocol";
import type {
  GroupsConfig,
  InvestmentChainConfig,
  InvestmentTokenConfig,
} from "../config.js";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

export type InvestmentVerificationRequest = {
  groupId: string;
  txHash: Hex;
  chainId: number;
  token: InvestmentToken;
  amount: string;
  investorWalletAddress: Address;
  destinationAddress: Address;
};

export type VerifiedInvestment = InvestmentVerificationRequest & {
  tokenAddress: Address;
  decimals: number;
  logIndex: number;
};

export type InvestmentPublicClient = {
  getTransactionReceipt(input: { hash: Hex }): Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
    logs: Array<{
      address: Address;
      data: Hex;
      topics: [] | [Hex, ...Hex[]];
      logIndex: number;
    }>;
  }>;
  getBlockNumber(): Promise<bigint>;
};

export type InvestmentBundlerClient = {
  getUserOperationTransactionHash(input: { userOpHash: Hex }): Promise<Hex>;
};

export class InvestmentVerifier {
  private readonly chains = new Map<
    number,
    {
      config: InvestmentChainConfig;
      client: InvestmentPublicClient;
      bundlerClient: InvestmentBundlerClient;
    }
  >();

  constructor(
    config: GroupsConfig,
    clients?: Map<number, InvestmentPublicClient>,
    bundlerClients?: Map<number, InvestmentBundlerClient>,
  ) {
    for (const chain of config.investmentChains) {
      const client =
        clients?.get(chain.chainId) ??
        createPublicClient({
          transport: http(chain.rpcUrl),
        });
      const bundlerClient =
        bundlerClients?.get(chain.chainId) ??
        new JsonRpcBundlerClient(chain.bundlerRpcUrl ?? chain.rpcUrl);
      this.chains.set(chain.chainId, { config: chain, client, bundlerClient });
    }
    this.confirmations = config.investmentConfirmations;
  }

  private readonly confirmations: bigint;

  async resolveUserOperationTransactionHash(input: {
    chainId: number;
    userOpHash: Hex;
  }): Promise<Hex> {
    const chain = this.chains.get(input.chainId);
    if (!chain) {
      throw new Error(`unsupported investment chain: ${input.chainId}`);
    }
    return chain.bundlerClient.getUserOperationTransactionHash({
      userOpHash: input.userOpHash,
    });
  }

  async verify(
    request: InvestmentVerificationRequest,
  ): Promise<VerifiedInvestment> {
    const chain = this.chains.get(request.chainId);
    if (!chain) {
      throw new Error(`unsupported investment chain: ${request.chainId}`);
    }

    const tokenConfig = chain.config.tokens[request.token];
    if (!tokenConfig) {
      throw new Error(
        `${request.token} is not configured on chain ${request.chainId}`,
      );
    }

    if (!/^[0-9]+$/.test(request.amount) || BigInt(request.amount) <= 0n) {
      throw new Error("amount must be a positive base-unit integer string");
    }

    const receipt = await chain.client.getTransactionReceipt({
      hash: request.txHash,
    });
    if (receipt.status !== "success") {
      throw new Error("transaction did not succeed");
    }

    if (this.confirmations > 0n) {
      const latestBlock = await chain.client.getBlockNumber();
      const confirmations = latestBlock - receipt.blockNumber + 1n;
      if (confirmations < this.confirmations) {
        throw new Error("transaction has insufficient confirmations");
      }
    }

    const match = findMatchingTransferLog({
      logs: receipt.logs,
      token: tokenConfig,
      investorWalletAddress: request.investorWalletAddress,
      destinationAddress: request.destinationAddress,
      amount: request.amount,
    });
    if (!match) {
      throw new Error("transaction does not contain the expected transfer");
    }

    return {
      ...request,
      tokenAddress: tokenConfig.address,
      decimals: tokenConfig.decimals,
      logIndex: match.logIndex,
    };
  }
}

class JsonRpcBundlerClient implements InvestmentBundlerClient {
  constructor(private readonly rpcUrl: string) {}

  async getUserOperationTransactionHash(input: { userOpHash: Hex }): Promise<Hex> {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getUserOperationReceipt",
        params: [input.userOpHash],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `failed to resolve user operation receipt: HTTP ${response.status}`,
      );
    }

    const payload = (await response.json()) as {
      result?: unknown;
      error?: { message?: string };
    };
    if (payload.error) {
      throw new Error(
        payload.error.message ?? "failed to resolve user operation receipt",
      );
    }
    if (!payload.result || typeof payload.result !== "object") {
      throw new Error("user operation receipt was not found");
    }

    const result = payload.result as {
      receipt?: { transactionHash?: unknown };
      transactionHash?: unknown;
    };
    const txHash = result.receipt?.transactionHash ?? result.transactionHash;
    if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new Error("user operation receipt is missing transactionHash");
    }
    return txHash.toLowerCase() as Hex;
  }
}

function normalizeAddress(value: Address): Address {
  if (!isAddress(value)) {
    throw new Error(`invalid address: ${value}`);
  }
  return getAddress(value);
}

function findMatchingTransferLog(input: {
  logs: Awaited<
    ReturnType<InvestmentPublicClient["getTransactionReceipt"]>
  >["logs"];
  token: InvestmentTokenConfig;
  investorWalletAddress: Address;
  destinationAddress: Address;
  amount: string;
}): { logIndex: number } | null {
  const tokenAddress = normalizeAddress(input.token.address);
  const investorWalletAddress = normalizeAddress(input.investorWalletAddress);
  const destinationAddress = normalizeAddress(input.destinationAddress);
  const amount = BigInt(input.amount);

  for (const log of input.logs) {
    if (normalizeAddress(log.address) !== tokenAddress) {
      continue;
    }
    try {
      const decoded = decodeEventLog({
        abi: [transferEvent],
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "Transfer") {
        continue;
      }
      const { from, to, value } = decoded.args;
      if (
        normalizeAddress(from) === investorWalletAddress &&
        normalizeAddress(to) === destinationAddress &&
        value === amount
      ) {
        return { logIndex: log.logIndex };
      }
    } catch {
      continue;
    }
  }

  return null;
}
