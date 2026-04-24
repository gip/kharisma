import { makeJsonCodec } from "./helpers.js";
import {
  ContentTypeInvestmentRecorded,
  ContentTypeMemberJoined,
  ContentTypeThreadCreate,
} from "./ids.js";

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

export const InvestmentRecordedCodec =
  makeJsonCodec<InvestmentRecordedPayload>(ContentTypeInvestmentRecorded, {
    fallback: (content) => `${content.investorWalletAddress} invested ${content.amount} ${content.token}`,
    shouldPush: () => true,
  });

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
] as const;
