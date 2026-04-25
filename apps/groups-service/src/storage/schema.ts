import type {
  GroupJoinPolicy,
  GroupLanguageCode,
  InvestmentToken,
  RegistrationStatus,
  Role,
  ThreadCatalogEntry,
  VerificationLevel,
} from "@kharisma/protocol";

export type WalletStatusRecord = {
  walletAddress: string;
  inboxId: string | null;
  status: RegistrationStatus;
  verificationLevel: VerificationLevel;
  humanId: string | null;
  agentId: string | null;
  handle: string | null;
  identityKey: string | null;
};

export type HumanRecord = {
  humanId: string;
  identityKey: string;
  handle: string;
  verifiedAt: string;
  walletAddresses: string[];
  inboxIds: string[];
};

export type HumanAgentRecord = {
  agentId: string;
  humanId: string;
  identityKey: string;
  handle: string;
  walletAddress: string;
  inboxId: string;
  verifiedAt: string;
};

export type MemberRecord = {
  inboxId: string;
  walletAddress: string | null;
  name: string;
  role: Role;
  verificationLevel: VerificationLevel;
  humanId?: string;
  agentId?: string;
  joinedAt: string;
};

export type GroupRecord = {
  groupId: string;
  status: "active" | "deleted";
  title: string;
  description: string;
  /** Public URL of the group cover media (image or video). */
  mediaUrl: string;
  /** Public URL of the first-frame thumbnail (JPEG). */
  thumbnailUrl: string;
  /** ISO 639-1 language codes supported by the group. */
  languages: GroupLanguageCode[];
  joinPolicy: GroupJoinPolicy;
  maxMembers: number;
  /** AES-256-GCM wrapped hex private key for the per-group XMTP identity. */
  encryptedPrivateKey: string;
  /** Persisted for convenience so we can reply without starting the client. */
  syncInboxId: string;
  /** MLS conversation id for the group channel. */
  xmtpGroupId: string;
  /** Keyed by inbox ID. */
  members: Record<string, MemberRecord>;
  createdAt: string;
};

export type GroupThreadRecord = ThreadCatalogEntry & {
  groupId: string;
};

export type InvestmentRecord = {
  investmentId: string;
  groupId: string;
  investorInboxId: string;
  investorWalletAddress: string;
  token: InvestmentToken;
  tokenAddress: string;
  amount: string;
  decimals: number;
  destinationAddress: string;
  chainId: number;
  txHash: string;
  logIndex: number;
  recordedAt: string;
  announcedAt: string | null;
};

export type InvestmentBalanceRecord = {
  groupId: string;
  investorInboxId: string;
  investorWalletAddress: string;
  token: InvestmentToken;
  tokenAddress: string;
  chainId: number;
  amount: string;
  updatedAt: string;
};

export type InvestmentTotalRecord = {
  groupId: string;
  token: InvestmentToken;
  tokenAddress: string;
  chainId: number;
  amount: string;
};
