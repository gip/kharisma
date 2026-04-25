import type { ProtocolError } from "../errors.js";
import { makeJsonCodec } from "./helpers.js";
import {
  ContentTypeInvestmentConfigRequest,
  ContentTypeInvestmentConfigResponse,
  ContentTypeInvestmentSubmit,
  ContentTypeInvestmentSubmitResponse,
  ContentTypeJoinRequest,
  ContentTypeJoinResponse,
  ContentTypeThreadCatalogRequest,
  ContentTypeThreadCatalogResponse,
} from "./ids.js";
import type { InvestmentRecordedPayload, InvestmentToken } from "./group.js";
import {
  HumanAgentSubmitCodec,
  HumanSubmitCodec,
  IdentitySubmitCodec,
  SkillRequestCodec,
  SkillResponseCodec,
  VerificationAckCodec,
  WalletStatusRequestCodec,
  WalletStatusResponseCodec,
} from "./main.js";

export type JoinRequestPayload = {
  groupId: string;
  walletAddress: string;
  name?: string;
};

export type JoinResponsePayload =
  | {
      status: "ok";
      groupId: string;
      name: string;
      conversationId: string;
    }
  | {
      status: "error";
      groupId: string;
      error: ProtocolError;
    };

export const JoinRequestCodec =
  makeJsonCodec<JoinRequestPayload>(ContentTypeJoinRequest);

export const JoinResponseCodec =
  makeJsonCodec<JoinResponsePayload>(ContentTypeJoinResponse);

export type ThreadCatalogEntry = {
  threadId: string;
  title: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
};

export type ThreadCatalogRequestPayload = {
  groupId: string;
};

export type ThreadCatalogResponsePayload =
  | {
      status: "ok";
      groupId: string;
      conversationId: string;
      threads: ThreadCatalogEntry[];
    }
  | {
      status: "error";
      groupId: string;
      error: ProtocolError;
    };

export const ThreadCatalogRequestCodec =
  makeJsonCodec<ThreadCatalogRequestPayload>(
    ContentTypeThreadCatalogRequest,
  );

export const ThreadCatalogResponseCodec =
  makeJsonCodec<ThreadCatalogResponsePayload>(
    ContentTypeThreadCatalogResponse,
  );

export type InvestmentConfigRequestPayload = {
  groupId: string;
};

export type InvestmentTokenConfigPayload = {
  token: InvestmentToken;
  address: string;
  decimals: number;
};

export type InvestmentChainConfigPayload = {
  chainId: number;
  name: "world" | "base";
  tokens: InvestmentTokenConfigPayload[];
};

export type InvestmentConfigResponsePayload =
  | {
      status: "ok";
      groupId: string;
      destinationAddress: string | null;
      chains: InvestmentChainConfigPayload[];
    }
  | {
      status: "error";
      groupId: string;
      error: ProtocolError;
    };

export type InvestmentSubmitPayload = {
  groupId: string;
  walletAddress: string;
  chainId: number;
  token: InvestmentToken;
  amount: string;
  txHash?: string;
  userOpHash?: string;
};

export type InvestmentSubmitResponsePayload =
  | {
      status: "recorded" | "already-recorded";
      groupId: string;
      investment: InvestmentRecordedPayload & {
        investmentId: string;
        logIndex: number;
        announcedAt: string | null;
      };
    }
  | {
      status: "error";
      groupId: string;
      error: ProtocolError;
    };

export const InvestmentConfigRequestCodec =
  makeJsonCodec<InvestmentConfigRequestPayload>(
    ContentTypeInvestmentConfigRequest,
  );

export const InvestmentConfigResponseCodec =
  makeJsonCodec<InvestmentConfigResponsePayload>(
    ContentTypeInvestmentConfigResponse,
  );

export const InvestmentSubmitCodec =
  makeJsonCodec<InvestmentSubmitPayload>(ContentTypeInvestmentSubmit);

export const InvestmentSubmitResponseCodec =
  makeJsonCodec<InvestmentSubmitResponsePayload>(
    ContentTypeInvestmentSubmitResponse,
  );

/**
 * Sync-channel codecs. The sync DM reuses the main-channel verification
 * codecs so clients that already know a group's sync inbox can verify
 * before joining without opening the main service inbox.
 *
 * `error/1` is re-used from the main channel codec list.
 */
export const SyncChannelCodecs = [
  WalletStatusRequestCodec,
  WalletStatusResponseCodec,
  IdentitySubmitCodec,
  HumanSubmitCodec,
  HumanAgentSubmitCodec,
  VerificationAckCodec,
  SkillRequestCodec,
  SkillResponseCodec,
  JoinRequestCodec,
  JoinResponseCodec,
  ThreadCatalogRequestCodec,
  ThreadCatalogResponseCodec,
  InvestmentConfigRequestCodec,
  InvestmentConfigResponseCodec,
  InvestmentSubmitCodec,
  InvestmentSubmitResponseCodec,
] as const;
