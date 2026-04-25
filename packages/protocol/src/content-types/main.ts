import type { ProtocolError } from "../errors.js";
import type { GroupLanguageCode } from "../languages.js";
import type {
  AuthenticatedRole,
  RegistrationStatus,
  Role,
  VerificationLevel,
} from "../roles.js";
import { makeJsonCodec } from "./helpers.js";
import {
  ContentTypeWalletStatusRequest,
  ContentTypeWalletStatusResponse,
  ContentTypeIdentitySubmit,
  ContentTypeHumanSubmit,
  ContentTypeHumanAgentSubmit,
  ContentTypeVerificationAck,
  ContentTypeCreateGroupRequest,
  ContentTypeCreateGroupResponse,
  ContentTypeError,
  ContentTypeHello,
  ContentTypeListGroupsRequest,
  ContentTypeListGroupsResponse,
  ContentTypeSkillRequest,
  ContentTypeSkillResponse,
} from "./ids.js";

export const GROUP_JOIN_POLICIES = [
  "H_ONLY",
  "H_AND_HA",
  "H_HA_AND_A",
] as const;

export type GroupJoinPolicy = (typeof GROUP_JOIN_POLICIES)[number];

export const GROUP_JOIN_APPROVALS = ["NONE", "ONE_MEMBER"] as const;

export type GroupJoinApproval = (typeof GROUP_JOIN_APPROVALS)[number];

export function isGroupJoinPolicy(value: unknown): value is GroupJoinPolicy {
  return (
    typeof value === "string" &&
    (GROUP_JOIN_POLICIES as readonly string[]).includes(value)
  );
}

export function isGroupJoinApproval(value: unknown): value is GroupJoinApproval {
  return (
    typeof value === "string" &&
    (GROUP_JOIN_APPROVALS as readonly string[]).includes(value)
  );
}

export type WalletStatusRequestPayload = {
  walletAddress: string;
};

export type WalletStatusResponsePayload = {
  walletAddress: string;
  status: RegistrationStatus;
  verificationLevel: VerificationLevel;
  humanId: string | null;
  agentId: string | null;
  handle: string | null;
};

export type IdentitySubmitPayload = {
  walletAddress: string;
  proof: unknown;
};

export type HumanSubmitPayload = {
  walletAddress: string;
  handle: string;
  proof: unknown;
};

export type HumanAgentSubmitPayload = {
  walletAddress: string;
  ownerHumanId: string;
  handle: string;
  proof: unknown;
};

export type VerificationAckPayload = {
  action: "identity" | "human" | "human-agent";
  walletAddress: string;
  status: "ok" | "error";
  resolvedStatus: RegistrationStatus;
  verificationLevel: VerificationLevel;
  humanId: string | null;
  agentId: string | null;
  handle: string | null;
  error?: ProtocolError;
};

export type HelloPayload = {
  role: AuthenticatedRole;
  walletAddress: string;
};

export type SkillRequestPayload = Record<string, never>;

export type SkillChannelContext =
  | {
      kind: "discovery";
      serviceInboxId: string;
      protocolVersion: string;
    }
  | {
      kind: "circle-sync";
      groupId: string;
      title: string;
      syncInboxId: string;
      conversationId: string | null;
      joinPolicy: GroupJoinPolicy;
      joinApproval: GroupJoinApproval;
      memberCount: number;
      maxMembers: number;
      availableSeats: number;
      languages: string[];
      protocolVersion: string;
    };

export type SkillResponsePayload =
  | {
      status: "ok";
      file: "SKILL.md";
      mediaType: "text/markdown";
      channel: SkillChannelContext;
      content: string;
    }
  | {
      status: "error";
      error: ProtocolError;
    };

export type ListGroupsRequestPayload = {
  languages?: GroupLanguageCode[];
};

export type GroupSenderSummary = {
  inboxId: string;
  name: string;
  role: Role;
  walletAddress: string | null;
  humanId: string | null;
  agentId: string | null;
  verificationLevel: VerificationLevel;
};

export type GroupSummary = {
  groupId: string;
  title: string;
  description: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  languages: GroupLanguageCode[];
  syncInboxId: string;
  memberCount: number;
  maxMembers: number;
  availableSeats: number;
  joinPolicy: GroupJoinPolicy;
  joinApproval: GroupJoinApproval;
  isMember: boolean;
  conversationId: string | null;
  senders: GroupSenderSummary[];
};

export type ListGroupsResponsePayload = {
  groups: GroupSummary[];
};

export type CreateGroupRequestPayload = {
  title: string;
  description: string;
  mediaUrl: string;
  thumbnailUrl: string;
  languages: GroupLanguageCode[];
  joinPolicy: GroupJoinPolicy;
  joinApproval: GroupJoinApproval;
  maxMembers: number;
};

export type CreateGroupResponsePayload =
  | {
      status: "ok";
      groupId: string;
      syncInboxId: string;
      conversationId: string;
    }
  | {
      status: "error";
      error: ProtocolError;
    };

export type ErrorPayload = ProtocolError;

export const WalletStatusRequestCodec =
  makeJsonCodec<WalletStatusRequestPayload>(ContentTypeWalletStatusRequest);

export const WalletStatusResponseCodec =
  makeJsonCodec<WalletStatusResponsePayload>(ContentTypeWalletStatusResponse);

export const IdentitySubmitCodec =
  makeJsonCodec<IdentitySubmitPayload>(ContentTypeIdentitySubmit);

export const HumanSubmitCodec =
  makeJsonCodec<HumanSubmitPayload>(ContentTypeHumanSubmit);

export const HumanAgentSubmitCodec =
  makeJsonCodec<HumanAgentSubmitPayload>(ContentTypeHumanAgentSubmit);

export const VerificationAckCodec =
  makeJsonCodec<VerificationAckPayload>(ContentTypeVerificationAck);

export const HelloCodec = makeJsonCodec<HelloPayload>(ContentTypeHello);

export const SkillRequestCodec =
  makeJsonCodec<SkillRequestPayload>(ContentTypeSkillRequest);

export const SkillResponseCodec =
  makeJsonCodec<SkillResponsePayload>(ContentTypeSkillResponse);

export const ListGroupsRequestCodec = makeJsonCodec<ListGroupsRequestPayload>(
  ContentTypeListGroupsRequest,
);

export const ListGroupsResponseCodec =
  makeJsonCodec<ListGroupsResponsePayload>(ContentTypeListGroupsResponse);

export const CreateGroupRequestCodec = makeJsonCodec<CreateGroupRequestPayload>(
  ContentTypeCreateGroupRequest,
);

export const CreateGroupResponseCodec =
  makeJsonCodec<CreateGroupResponsePayload>(ContentTypeCreateGroupResponse);

export const ErrorCodec = makeJsonCodec<ErrorPayload>(ContentTypeError);

export const MainChannelCodecs = [
  WalletStatusRequestCodec,
  WalletStatusResponseCodec,
  IdentitySubmitCodec,
  HumanSubmitCodec,
  HumanAgentSubmitCodec,
  VerificationAckCodec,
  HelloCodec,
  SkillRequestCodec,
  SkillResponseCodec,
  ListGroupsRequestCodec,
  ListGroupsResponseCodec,
  CreateGroupRequestCodec,
  CreateGroupResponseCodec,
  ErrorCodec,
] as const;
