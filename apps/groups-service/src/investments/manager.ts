import { InvestmentRecordedCodec } from "@kharisma/protocol";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import type { GroupsConfig } from "../config.js";
import type { AppLogger } from "../logging.js";
import type { GroupManager } from "../groups/manager.js";
import type { InvestmentRecord } from "../storage/schema.js";
import type { GroupStore } from "../storage/store.js";
import type { KharismaClient } from "../xmtp/client.js";
import {
  InvestmentVerifier,
  type InvestmentVerificationRequest,
} from "./verifier.js";

export type SubmitInvestmentInput = {
  groupId: string;
  txHash?: string;
  userOpHash?: string;
  chainId: number;
  token: "WLD" | "USDC";
  amount: string;
  investorWalletAddress: string;
};

export type SubmitInvestmentResult =
  | {
      status: "recorded";
      investment: InvestmentRecord;
    }
  | {
      status: "already-recorded";
      investment: InvestmentRecord;
    };

export class InvestmentManager {
  constructor(
    private readonly config: GroupsConfig,
    private readonly store: GroupStore,
    private readonly groupManager: GroupManager,
    private readonly verifier: InvestmentVerifier,
    private readonly logger: AppLogger,
  ) {}

  getInvestmentConfig(groupId: string) {
    if (!this.groupManager.get(groupId)) {
      throw new Error(`No such group: ${groupId}`);
    }
    return {
      groupId,
      destinationAddress: this.config.investmentDestinationAddress,
      chains: this.config.investmentChains.map((chain) => ({
        chainId: chain.chainId,
        name: chain.name,
        tokens: Object.values(chain.tokens)
          .filter((token) => !!token)
          .map((token) => ({
            token: token.token,
            address: token.address,
            decimals: token.decimals,
          })),
      })),
    };
  }

  async submitInvestment(
    input: SubmitInvestmentInput,
  ): Promise<SubmitInvestmentResult> {
    const destinationAddress = this.config.investmentDestinationAddress;
    if (!destinationAddress) {
      throw new Error("GROUPS_INVESTMENT_DESTINATION_ADDRESS is not configured");
    }

    const managed = this.groupManager.get(input.groupId);
    if (!managed) {
      throw new Error(`No such group: ${input.groupId}`);
    }

    const investorWalletAddress = parseAddress(
      input.investorWalletAddress,
      "investorWalletAddress",
    );
    const member = Object.values(managed.record.members).find(
      (candidate) =>
        candidate.walletAddress &&
        getAddress(candidate.walletAddress) === investorWalletAddress,
    );
    if (!member) {
      throw new Error("investor is not a member of this group");
    }

    const txHash =
      typeof input.txHash === "string"
        ? parseTxHash(input.txHash)
        : await this.verifier.resolveUserOperationTransactionHash({
            chainId: input.chainId,
            userOpHash: parseUserOpHash(input.userOpHash ?? ""),
          });

    const verified = await this.verifier.verify({
      groupId: input.groupId,
      txHash,
      chainId: input.chainId,
      token: input.token,
      amount: input.amount,
      investorWalletAddress,
      destinationAddress,
    } satisfies InvestmentVerificationRequest);

    const recordedAt = new Date().toISOString();
    const result = this.store.recordInvestment({
      groupId: input.groupId,
      investorInboxId: member.inboxId,
      investorWalletAddress,
      token: verified.token,
      tokenAddress: verified.tokenAddress,
      amount: verified.amount,
      decimals: verified.decimals,
      destinationAddress,
      chainId: verified.chainId,
      txHash: verified.txHash,
      logIndex: verified.logIndex,
      recordedAt,
    });

    if (result.status === "already-recorded") {
      return result;
    }

    await announceInvestmentRecorded(
      managed.client,
      managed.record.xmtpGroupId,
      result.investment,
    );
    const announcedAt = new Date().toISOString();
    this.store.markInvestmentAnnounced(result.investment.investmentId, announcedAt);
    result.investment.announcedAt = announcedAt;

    this.logger.info(
      {
        groupId: input.groupId,
        investmentId: result.investment.investmentId,
        txHash: result.investment.txHash,
        logIndex: result.investment.logIndex,
      },
      "Recorded investment",
    );

    return result;
  }
}

export async function announceInvestmentRecorded(
  client: KharismaClient,
  xmtpGroupId: string,
  investment: InvestmentRecord,
): Promise<void> {
  const mlsGroup = await client.conversations.getConversationById(xmtpGroupId);
  if (!mlsGroup) {
    throw new Error(
      `Cannot announce investment: group ${xmtpGroupId} is missing`,
    );
  }
  await mlsGroup.send(
    InvestmentRecordedCodec.encode({
      groupId: investment.groupId,
      investorInboxId: investment.investorInboxId,
      investorWalletAddress: investment.investorWalletAddress,
      token: investment.token,
      tokenAddress: investment.tokenAddress,
      amount: investment.amount,
      decimals: investment.decimals,
      destinationAddress: investment.destinationAddress,
      chainId: investment.chainId,
      txHash: investment.txHash,
      recordedAt: investment.recordedAt,
    }),
  );
}

function parseAddress(value: string, field: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${field} must be an EVM address`);
  }
  return getAddress(value);
}

function parseTxHash(value: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("txHash must be a 32-byte hex string");
  }
  return value.toLowerCase() as Hex;
}

function parseUserOpHash(value: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("userOpHash must be a 32-byte hex string");
  }
  return value.toLowerCase() as Hex;
}
