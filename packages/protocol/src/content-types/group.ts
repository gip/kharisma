import { makeJsonCodec } from "./helpers.js";
import {
  ContentTypeInvestmentRecorded,
  ContentTypeJoinApprovalRequest,
  ContentTypeJoinApprovalResolved,
  ContentTypeJoinApprovalVote,
  ContentTypeMemberJoined,
  ContentTypeThreadCreate,
} from "./ids.js";
import type { Role } from "../roles.js";

export type MemberJoinedPayload = {
  name: string;
  inboxId: string;
  /** ISO-8601 UTC timestamp. */
  joinedAt: string;
};

/**
 * Group-channel custom codec announcing a new member.
 *
 * Carries a plain-text fallback so clients that do not know this custom
 * type still render a readable line in their default text view.
 */
export const MemberJoinedCodec = makeJsonCodec<MemberJoinedPayload>(
  ContentTypeMemberJoined,
  {
    fallback: (content) => `${content.name} joined the group`,
    shouldPush: () => true,
  },
);

export type ThreadCreatePayload = {
  /** Human-readable title chosen by the thread creator. */
  title: string;
  /** ISO-8601 UTC timestamp when the thread was created. */
  createdAt: string;
};

/**
 * Group-channel custom codec announcing the start of a new thread.
 *
 * The thread is identified by the message id of this `thread-create/1`
 * message. Subsequent messages that belong to the thread are sent using
 * the standard `xmtp.org/reply:1.0` codec with `reference` set to that
 * message id.
 */
export const ThreadCreateCodec = makeJsonCodec<ThreadCreatePayload>(
  ContentTypeThreadCreate,
  {
    fallback: (content) => `Thread: ${content.title}`,
    shouldPush: () => true,
  },
);

export type InvestmentToken = "WLD" | "USDC";

export type InvestmentRecordedPayload = {
  groupId: string;
  investorInboxId: string;
  investorWalletAddress: string;
  token: InvestmentToken;
  tokenAddress: string;
  /** Raw base-unit amount. */
  amount: string;
  decimals: number;
  destinationAddress: string;
  chainId: number;
  txHash: string;
  /** ISO-8601 UTC timestamp when the service recorded the investment. */
  recordedAt: string;
};

export function formatBaseUnitAmount(amount: string, decimals: number): string {
  if (!/^[0-9]+$/.test(amount) || !Number.isInteger(decimals) || decimals < 0) {
    return amount;
  }
  if (decimals === 0) return amount;

  const padded = amount.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole;
}

export const InvestmentRecordedCodec =
  makeJsonCodec<InvestmentRecordedPayload>(ContentTypeInvestmentRecorded, {
    fallback: (content) =>
      `${content.investorWalletAddress} invested ${formatBaseUnitAmount(content.amount, content.decimals)} ${content.token}`,
    shouldPush: () => true,
  });

export type JoinApprovalRequestPayload = {
  pendingJoinId: string;
  groupId: string;
  applicantInboxId: string;
  name: string;
  role: Role;
  /** ISO-8601 UTC timestamp. */
  requestedAt: string;
};

export const JoinApprovalRequestCodec =
  makeJsonCodec<JoinApprovalRequestPayload>(ContentTypeJoinApprovalRequest, {
    fallback: (content) => `${content.name} requested to join`,
    shouldPush: () => true,
  });

export type JoinApprovalVotePayload = {
  pendingJoinId: string;
  groupId: string;
  vote: "approve";
};

export const JoinApprovalVoteCodec =
  makeJsonCodec<JoinApprovalVotePayload>(ContentTypeJoinApprovalVote);

export type JoinApprovalResolvedPayload = {
  pendingJoinId: string;
  groupId: string;
  status: "approved";
  approvedByInboxId: string;
  /** ISO-8601 UTC timestamp. */
  approvedAt: string;
};

export const JoinApprovalResolvedCodec =
  makeJsonCodec<JoinApprovalResolvedPayload>(
    ContentTypeJoinApprovalResolved,
    {
      fallback: () => "Join request approved",
      shouldPush: () => true,
    },
  );

/**
 * Group-channel codecs. Per SKILL.md §6 the group channel prefers
 * standard types (`xmtp.org/text` via XMTP's built-in TextCodec, and
 * `xmtp.org/reply:1.0` for thread replies) and only introduces custom
 * types that carry a text fallback.
 */
export const GroupChannelCodecs = [
  MemberJoinedCodec,
  ThreadCreateCodec,
  InvestmentRecordedCodec,
  JoinApprovalRequestCodec,
  JoinApprovalVoteCodec,
  JoinApprovalResolvedCodec,
] as const;
