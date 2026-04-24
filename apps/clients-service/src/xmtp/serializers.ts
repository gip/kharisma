import {
  contentTypeEquals,
  ContentTypeThreadCreate,
  type ThreadCreatePayload,
} from "@kharisma/protocol";
import {
  contentTypeReply,
  isReply,
  type Conversation,
  type DecodedMessage,
  type Dm,
  type EnrichedReply,
  type Group,
} from "@xmtp/node-sdk";

export type SerializedConversation = {
  id: string;
  kind: "dm" | "group";
  title: string;
  peerInboxId: string | null;
  memberCount: number | null;
  lastActivityAt: string | null;
  createdAt: string | null;
};

export type SerializedMessageAttachment = {
  url: string;
  mimeType: string;
  filename: string | null;
  contentLength: number;
  thumbnailUrl: string | null;
};

export const VIDEO_MESSAGE_PREFIX = "[video] ";

export function encodeVideoMessagePayload(payload: {
  url: string;
  thumbnailUrl?: string | null;
  mimeType?: string | null;
}): string {
  // Legacy clients only understand "[video] <url>" so we keep that form
  // whenever there's no extra metadata to carry.
  if (!payload.thumbnailUrl && !payload.mimeType) {
    return `${VIDEO_MESSAGE_PREFIX}${payload.url}`;
  }
  const envelope: Record<string, string> = { url: payload.url };
  if (payload.thumbnailUrl) envelope.thumbnailUrl = payload.thumbnailUrl;
  if (payload.mimeType) envelope.mimeType = payload.mimeType;
  return `${VIDEO_MESSAGE_PREFIX}${JSON.stringify(envelope)}`;
}

function parseVideoMessagePayload(content: string) {
  if (!content.startsWith(VIDEO_MESSAGE_PREFIX)) return null;
  const rest = content.slice(VIDEO_MESSAGE_PREFIX.length).trim();
  if (!rest) return null;
  if (rest.startsWith("{")) {
    try {
      const parsed = JSON.parse(rest) as Record<string, unknown>;
      const url = typeof parsed.url === "string" ? parsed.url : null;
      if (!url) return null;
      return {
        url,
        thumbnailUrl:
          typeof parsed.thumbnailUrl === "string" ? parsed.thumbnailUrl : null,
        mimeType:
          typeof parsed.mimeType === "string" ? parsed.mimeType : "video/webm",
      };
    } catch {
      return null;
    }
  }
  return { url: rest, thumbnailUrl: null, mimeType: "video/webm" };
}

export type SerializedThreadCreate = {
  title: string;
  createdAt: string;
};

export type SerializedMessage = {
  id: string;
  conversationId: string;
  senderInboxId: string;
  sentAt: string;
  content: string | null;
  fallback: string | null;
  deliveryStatus: string;
  attachment?: SerializedMessageAttachment | null;
  /**
   * For `xmtp.org/reply:1.0` messages, the message id of the message
   * being replied to. The Kharisma protocol uses this to identify
   * threads — see SKILL.md §6.2.
   */
  replyTo: string | null;
  /**
   * For `kharisma.xyz/thread-create/1` messages, the thread metadata.
   * The thread's id is this message's `id`.
   */
  threadCreate: SerializedThreadCreate | null;
};

function isDmConversation(
  conversation: Conversation | Dm | Group,
): conversation is Dm {
  return "peerInboxId" in conversation;
}

function isGroupConversation(
  conversation: Conversation | Dm | Group,
): conversation is Group {
  return "permissions" in conversation;
}

export async function serializeConversation(
  conversation: Conversation | Dm | Group,
): Promise<SerializedConversation> {
  const lastMessage = await conversation.lastMessage();

  if (isDmConversation(conversation)) {
    return {
      id: conversation.id,
      kind: "dm",
      title: `DM with ${conversation.peerInboxId}`,
      peerInboxId: conversation.peerInboxId,
      memberCount: null,
      lastActivityAt: lastMessage?.sentAt?.toISOString() ?? null,
      createdAt: conversation.createdAt?.toISOString() ?? null,
    };
  }

  const members = await conversation.members();
  const title = isGroupConversation(conversation)
    ? conversation.name || `Group ${conversation.id.slice(0, 8)}`
    : `Conversation ${conversation.id.slice(0, 8)}`;

  return {
    id: conversation.id,
    kind: "group",
    title,
    peerInboxId: null,
    memberCount: members.length,
    lastActivityAt: lastMessage?.sentAt?.toISOString() ?? null,
    createdAt: conversation.createdAt?.toISOString() ?? null,
  };
}

function asReplyContent(
  message: DecodedMessage,
): EnrichedReply | null {
  if (!isReply(message)) return null;
  return message.content as EnrichedReply;
}

function asThreadCreate(
  message: DecodedMessage,
): ThreadCreatePayload | null {
  if (!message.contentType) return null;
  if (!contentTypeEquals(message.contentType, ContentTypeThreadCreate)) {
    return null;
  }
  return message.content as ThreadCreatePayload;
}

export function serializeMessage(
  message: DecodedMessage,
): SerializedMessage {
  const reply = asReplyContent(message);
  const replyTo = reply?.referenceId ?? null;

  // The visible content of a reply is its inner content; for plain messages
  // it's the decoded content directly.
  const innerContent: unknown = reply ? reply.content : message.content;
  const content = typeof innerContent === "string" ? innerContent : null;

  // Video messages are sent as "[video] <url>" or "[video] <json>" where the
  // JSON form carries additional metadata such as thumbnailUrl.
  let attachment: SerializedMessageAttachment | null = null;
  if (content) {
    const parsed = parseVideoMessagePayload(content);
    if (parsed) {
      attachment = {
        url: parsed.url,
        mimeType: parsed.mimeType,
        filename: null,
        contentLength: 0,
        thumbnailUrl: parsed.thumbnailUrl,
      };
    }
  }

  const threadCreatePayload = asThreadCreate(message);
  const threadCreate: SerializedThreadCreate | null = threadCreatePayload
    ? {
        title: threadCreatePayload.title,
        createdAt: threadCreatePayload.createdAt,
      }
    : null;

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderInboxId: message.senderInboxId,
    sentAt: message.sentAt.toISOString(),
    content: attachment ? null : content,
    fallback: message.fallback ?? null,
    deliveryStatus: String(message.deliveryStatus),
    attachment,
    replyTo,
    threadCreate,
  };
}

/**
 * Re-export so callers building `Reply` payloads have one source of truth
 * for the content-type id.
 */
export { contentTypeReply };
