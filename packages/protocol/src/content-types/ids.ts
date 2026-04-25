import type { ContentTypeId } from "@xmtp/content-type-primitives";

export const KHARISMA_AUTHORITY = "kharisma.xyz";

function id(typeId: string, versionMajor = 1): ContentTypeId {
  return {
    authorityId: KHARISMA_AUTHORITY,
    typeId,
    versionMajor,
    versionMinor: 0,
  };
}

/** Main channel content type IDs. */
export const ContentTypeWalletStatusRequest = id("wallet-status-request", 2);
export const ContentTypeWalletStatusResponse = id("wallet-status-response", 2);
export const ContentTypeIdentitySubmit = id("identity-submit", 2);
export const ContentTypeHumanSubmit = id("human-submit", 2);
export const ContentTypeHumanAgentSubmit = id("human-agent-submit", 2);
export const ContentTypeVerificationAck = id("verification-ack", 2);
export const ContentTypeHello = id("hello", 2);
export const ContentTypeSkillRequest = id("skill-request");
export const ContentTypeSkillResponse = id("skill-response");
export const ContentTypeListGroupsRequest = id("list-groups-request");
export const ContentTypeListGroupsResponse = id("list-groups-response", 2);
export const ContentTypeCreateGroupRequest = id("create-group-request", 2);
export const ContentTypeCreateGroupResponse = id("create-group-response");

/** Shared on main and sync channels. */
export const ContentTypeError = id("error");

/** Sync channel content type IDs. */
export const ContentTypeJoinRequest = id("join-request", 2);
export const ContentTypeJoinResponse = id("join-response");
export const ContentTypeInvestmentConfigRequest = id("investment-config-request");
export const ContentTypeInvestmentConfigResponse = id("investment-config-response");
export const ContentTypeInvestmentSubmit = id("investment-submit");
export const ContentTypeInvestmentSubmitResponse = id("investment-submit-response");
export const ContentTypeThreadCatalogRequest = id("thread-catalog-request");
export const ContentTypeThreadCatalogResponse = id("thread-catalog-response");

/** Group channel content type IDs (custom types only — text uses xmtp.org/text). */
export const ContentTypeMemberJoined = id("member-joined");
export const ContentTypeThreadCreate = id("thread-create");
export const ContentTypeInvestmentRecorded = id("investment-recorded");
export const ContentTypeJoinApprovalRequest = id("join-approval-request");
export const ContentTypeJoinApprovalVote = id("join-approval-vote");
export const ContentTypeJoinApprovalResolved = id("join-approval-resolved");

/**
 * Every content type ID defined by the protocol, in one place. Convenient
 * for exhaustiveness tests and diagnostics.
 */
export const ALL_CONTENT_TYPE_IDS: readonly ContentTypeId[] = [
  ContentTypeWalletStatusRequest,
  ContentTypeWalletStatusResponse,
  ContentTypeIdentitySubmit,
  ContentTypeHumanSubmit,
  ContentTypeHumanAgentSubmit,
  ContentTypeVerificationAck,
  ContentTypeHello,
  ContentTypeSkillRequest,
  ContentTypeSkillResponse,
  ContentTypeListGroupsRequest,
  ContentTypeListGroupsResponse,
  ContentTypeCreateGroupRequest,
  ContentTypeCreateGroupResponse,
  ContentTypeError,
  ContentTypeJoinRequest,
  ContentTypeJoinResponse,
  ContentTypeInvestmentConfigRequest,
  ContentTypeInvestmentConfigResponse,
  ContentTypeInvestmentSubmit,
  ContentTypeInvestmentSubmitResponse,
  ContentTypeThreadCatalogRequest,
  ContentTypeThreadCatalogResponse,
  ContentTypeMemberJoined,
  ContentTypeThreadCreate,
  ContentTypeInvestmentRecorded,
  ContentTypeJoinApprovalRequest,
  ContentTypeJoinApprovalVote,
  ContentTypeJoinApprovalResolved,
];
