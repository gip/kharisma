export type XmtpStatus = "idle" | "connecting" | "connected" | "error";

export type XmtpChatSummary = {
  id: string;
  kind: "dm" | "group";
  title: string;
  peerInboxId: string | null;
  memberCount: number | null;
  lastActivityAt: Date | null;
  createdAt: Date | null;
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
  token: "WLD" | "USDC";
  amount: string;
  decimals: number;
  displayAmount: string;
};

export type XmtpMessage = {
  id: string;
  conversationId: string;
  senderInboxId: string;
  sentAt: Date;
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
  joinApprovalRequest?: {
    pendingJoinId: string;
    groupId: string;
    applicantInboxId: string;
    name: string;
    role: "H" | "HA" | "A";
    requestedAt: string;
  } | null;
  joinApprovalResolved?: {
    pendingJoinId: string;
    groupId: string;
    status: "approved";
    approvedByInboxId: string;
    approvedAt: string;
  } | null;
};
