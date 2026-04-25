import type {
  GroupJoinPolicy,
  GroupLanguageCode,
  RegistrationStatus,
  VerificationLevel,
} from "@kharisma/protocol";

export type BackendSession = {
  userId: number;
  sessionId: string;
  walletAddress: `0x${string}`;
  walletAccountType: "EOA" | "SCW" | null;
  walletChainId: number | null;
  expiresAt: string;
};

export type AuthChallengeResponse = {
  challengeId: string;
  message: string;
  expiresAt: string;
};

export type AuthVerifyResponse = {
  token: string;
  session: BackendSession;
};

export type SiweNonceResponse = {
  challengeId: string;
  nonce: string;
  expiresAt: string;
};

export type XmtpChatSummary = {
  id: string;
  kind: "dm" | "group";
  title: string;
  peerInboxId: string | null;
  memberCount: number | null;
  lastActivityAt: string | null;
  createdAt: string | null;
};

export type XmtpClientInfo = {
  network: "local" | "dev" | "production";
  inboxId: string | null;
  identity: string | null;
  installationId: string | null;
  identityCount: number;
  installationCount: number;
  conversationCount: number;
  dmCount: number;
  groupCount: number;
};

export type XmtpBootstrapResponse = {
  status: "ready";
  info: XmtpClientInfo;
  conversations: XmtpChatSummary[];
};

export type KharismaSenderSummary = {
  inboxId: string;
  name: string;
  role: "H" | "HA" | "A";
  walletAddress: string | null;
  humanId: string | null;
  agentId: string | null;
  verificationLevel: VerificationLevel;
};

export type KharismaProfile = {
  walletAddress: string;
  status: RegistrationStatus;
  verificationLevel: VerificationLevel;
  humanId: string | null;
  agentId: string | null;
  handle: string | null;
};

export type KharismaGroupSummary = {
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
  isMember: boolean;
  conversationId: string | null;
  senders: KharismaSenderSummary[];
};

export type KharismaJoinResult = {
  groupId: string;
  syncInboxId: string;
  name: string;
  conversationId: string;
};

export type ThreadCatalogEntry = {
  threadId: string;
  title: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
};

export type ThreadCatalogResponse = {
  status: "ok";
  groupId: string;
  conversationId: string;
  threads: ThreadCatalogEntry[];
};

export type InvestmentToken = "WLD" | "USDC";

export type InvestmentChainConfig = {
  chainId: number;
  name: "world" | "base";
  tokens: Array<{
    token: InvestmentToken;
    address: `0x${string}`;
    decimals: number;
  }>;
};

export type InvestmentConfig = {
  destinationAddress: `0x${string}` | null;
  chains: InvestmentChainConfig[];
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

export type InvestmentSubmitResult = {
  status: "recorded" | "already-recorded";
  investment: InvestmentRecord;
};

export type KharismaWorldIdRequest = {
  appId: `app_${string}`;
  action: string;
  environment: "production" | "staging";
  signal: string;
  rpContext: {
    rp_id: string;
    nonce: string;
    created_at: number;
    expires_at: number;
    signature: string;
  };
};

export type { GroupJoinPolicy, GroupLanguageCode };

export type XmtpMessageAttachment = {
  url: string;
  mimeType: string;
  filename: string | null;
  contentLength: number;
  thumbnailUrl?: string | null;
};

export type XmtpInvestmentRecorded = {
  investorInboxId: string;
  investorWalletAddress: string;
  token: InvestmentToken;
  amount: string;
  decimals: number;
  displayAmount: string;
};

export type XmtpMessage = {
  id: string;
  conversationId: string;
  senderInboxId: string;
  sentAt: string;
  content: string | null;
  fallback: string | null;
  deliveryStatus: string;
  attachment?: XmtpMessageAttachment | null;
  /** Message id of the parent message for `xmtp.org/reply:1.0` payloads. */
  replyTo?: string | null;
  /** Set when this message is a `kharisma.xyz/thread-create/1`. */
  threadCreate?: { title: string; createdAt: string } | null;
  /** Set when this message is a `kharisma.xyz/investment-recorded/1`. */
  investmentRecorded?: XmtpInvestmentRecorded | null;
};

export type ThreadSummary = {
  threadId: string;
  conversationId: string;
  title: string;
  createdAt: string | null;
  createdBy: string | null;
  lastActivityAt: string;
  lastMessageId: string;
  lastMessagePreview: string | null;
  lastMessageSenderInboxId: string;
  replyCount: number;
};

/**
 * Sentinel for the implicit "General" thread of every Kharisma group.
 */
export const GENERAL_THREAD_ID = "general";

export type ServerEvent =
  | {
      type: "auth.authenticated";
      userId: number;
      address: string;
    }
  | {
      type: "xmtp.ready";
      inboxId: string | null;
      installationId: string | null;
    }
  | {
      type: "xmtp.signature_requested";
      requestId: string;
      purpose: string;
      message: string;
    }
  | {
      type: "conversation:new";
      conversation: XmtpChatSummary;
    }
  | {
      type: "message:new" | "message:sent";
      conversationId: string;
      message: XmtpMessage;
    }
  | {
      type: "sync:required";
      reason: string;
    };

export type ClientEvent =
  | {
      type: "auth.authenticate";
      token: string;
    }
  | {
      type: "xmtp.signature_submit";
      requestId: string;
      signature: `0x${string}`;
    }
  | {
      type: "xmtp.signature_rejected";
      requestId: string;
      error: string;
    };
