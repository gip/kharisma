export type AuthAuthenticateMessage = {
  type: "auth.authenticate";
  token: string;
};

export type AuthAuthenticatedMessage = {
  type: "auth.authenticated";
  userId: number;
  address: string;
};

export type XmtpSignatureRequestedMessage = {
  type: "xmtp.signature_requested";
  requestId: string;
  purpose: string;
  message: string;
};

export type XmtpSignatureSubmitMessage = {
  type: "xmtp.signature_submit";
  requestId: string;
  signature: `0x${string}`;
};

export type XmtpSignatureRejectedMessage = {
  type: "xmtp.signature_rejected";
  requestId: string;
  error: string;
};

export type XmtpReadyMessage = {
  type: "xmtp.ready";
  inboxId: string | null;
  installationId: string | null;
};

export type ConversationEventMessage = {
  type: "conversation:new";
  conversation: unknown;
};

export type MessageEventMessage = {
  type: "message:new" | "message:sent";
  message: unknown;
  conversationId: string;
};

export type SyncRequiredMessage = {
  type: "sync:required";
  reason: string;
};

export type ServerToClientMessage =
  | AuthAuthenticatedMessage
  | XmtpSignatureRequestedMessage
  | XmtpReadyMessage
  | ConversationEventMessage
  | MessageEventMessage
  | SyncRequiredMessage;

export type ClientToServerMessage =
  | AuthAuthenticateMessage
  | XmtpSignatureSubmitMessage
  | XmtpSignatureRejectedMessage;
