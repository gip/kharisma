import type { SerializedMessage } from "./serializers.js";
import type { ThreadCatalogEntry } from "@kharisma/protocol";

/**
 * Sentinel id for the implicit "General" thread that every Kharisma
 * group has by default. Messages without an explicit thread (i.e. plain
 * text/attachments not wrapped in `xmtp.org/reply:1.0`, and not a
 * `thread-create/1`) are bucketed here.
 */
export const GENERAL_THREAD_ID = "general";

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

type ThreadAccumulator = {
  threadId: string;
  conversationId: string;
  title: string;
  createdAt: string | null;
  createdBy: string | null;
  lastMessage: SerializedMessage;
  visibleLastMessage: SerializedMessage | null;
  replyCount: number;
  visibleReplyCount: number;
};

function previewFor(message: SerializedMessage): string | null {
  if (message.content) return message.content.slice(0, 140);
  if (message.attachment?.mimeType?.startsWith("video/")) return "[video]";
  if (message.attachment) return "[attachment]";
  if (message.fallback) return message.fallback.slice(0, 140);
  return null;
}

function summarize(acc: ThreadAccumulator, filtered: boolean): ThreadSummary {
  if (filtered) {
    const fallbackActivityAt = acc.createdAt ?? acc.lastMessage.sentAt;
    return {
      threadId: acc.threadId,
      conversationId: acc.conversationId,
      title: acc.title,
      createdAt: acc.createdAt,
      createdBy: acc.createdBy,
      lastActivityAt: acc.visibleLastMessage?.sentAt ?? fallbackActivityAt,
      lastMessageId: acc.visibleLastMessage?.id ?? "",
      lastMessagePreview: acc.visibleLastMessage
        ? previewFor(acc.visibleLastMessage)
        : null,
      lastMessageSenderInboxId: acc.visibleLastMessage?.senderInboxId ?? "",
      replyCount: acc.visibleReplyCount,
    };
  }

  return {
    threadId: acc.threadId,
    conversationId: acc.conversationId,
    title: acc.title,
    createdAt: acc.createdAt,
    createdBy: acc.createdBy,
    lastActivityAt: acc.lastMessage.sentAt,
    lastMessageId: acc.lastMessage.id,
    lastMessagePreview: previewFor(acc.lastMessage),
    lastMessageSenderInboxId: acc.lastMessage.senderInboxId,
    replyCount: acc.replyCount,
  };
}

/**
 * Group a conversation's messages into threads.
 *
 * - A `thread-create/1` message starts a new explicit thread; its id is
 *   the thread id, its title comes from the payload.
 * - Reply messages (`replyTo` set) attach to the thread whose root id
 *   equals `replyTo`. If we haven't seen that root yet we still surface
 *   the thread as "untitled" pinned to the reply's reference id.
 * - All other messages bucket into the implicit "General" thread.
 *
 * Input ordering is irrelevant; output is sorted by `lastActivityAt` desc.
 */
export function deriveThreadsFromMessages(input: {
  conversationId: string;
  messages: readonly SerializedMessage[];
  defaultGeneralTitle?: string;
  catalog?: readonly ThreadCatalogEntry[];
  visibleSenderInboxIds?: readonly string[];
}): ThreadSummary[] {
  const generalTitle = input.defaultGeneralTitle ?? "General";
  const visibleSenders = input.visibleSenderInboxIds
    ? new Set(input.visibleSenderInboxIds)
    : null;
  const chronological = [...input.messages].sort(
    (left, right) =>
      new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime(),
  );

  const threads = new Map<string, ThreadAccumulator>();

  for (const entry of input.catalog ?? []) {
    threads.set(entry.threadId, {
      threadId: entry.threadId,
      conversationId: input.conversationId,
      title: entry.title,
      createdAt: entry.createdAt,
      createdBy: entry.createdBy,
      lastMessage: {
        id: entry.threadId,
        conversationId: input.conversationId,
        senderInboxId: entry.createdBy,
        sentAt: entry.updatedAt,
        content: null,
        fallback: `Thread: ${entry.title}`,
        deliveryStatus: "published",
        attachment: null,
        replyTo: null,
        threadCreate: {
          title: entry.title,
          createdAt: entry.createdAt,
        },
      },
      visibleLastMessage: null,
      replyCount: 0,
      visibleReplyCount: 0,
    });
  }

  function bumpActivity(threadId: string, message: SerializedMessage) {
    const acc = threads.get(threadId);
    if (!acc) return;
    if (
      new Date(message.sentAt).getTime() >
      new Date(acc.lastMessage.sentAt).getTime()
    ) {
      acc.lastMessage = message;
    }
  }

  function isVisible(message: SerializedMessage) {
    return !visibleSenders || visibleSenders.has(message.senderInboxId);
  }

  function bumpVisibleActivity(threadId: string, message: SerializedMessage) {
    if (!isVisible(message)) return;
    const acc = threads.get(threadId);
    if (!acc) return;
    if (
      !acc.visibleLastMessage ||
      new Date(message.sentAt).getTime() >
        new Date(acc.visibleLastMessage.sentAt).getTime()
    ) {
      acc.visibleLastMessage = message;
    }
  }

  for (const message of chronological) {
    if (message.threadCreate) {
      const existing = threads.get(message.id);
      threads.set(message.id, {
        threadId: message.id,
        conversationId: input.conversationId,
        title: message.threadCreate.title,
        createdAt: message.threadCreate.createdAt,
        createdBy: message.senderInboxId,
        lastMessage:
          existing &&
          new Date(existing.lastMessage.sentAt).getTime() >
            new Date(message.sentAt).getTime()
            ? existing.lastMessage
            : message,
        visibleLastMessage: existing?.visibleLastMessage ?? null,
        replyCount: existing?.replyCount ?? 0,
        visibleReplyCount: existing?.visibleReplyCount ?? 0,
      });
      continue;
    }

    if (message.replyTo) {
      let acc = threads.get(message.replyTo);
      if (!acc) {
        acc = {
          threadId: message.replyTo,
          conversationId: input.conversationId,
          title: "Untitled thread",
          createdAt: null,
          createdBy: null,
          lastMessage: message,
          visibleLastMessage: null,
          replyCount: 0,
          visibleReplyCount: 0,
        };
        threads.set(message.replyTo, acc);
      }
      acc.replyCount += 1;
      if (isVisible(message)) {
        acc.visibleReplyCount += 1;
      }
      bumpActivity(message.replyTo, message);
      bumpVisibleActivity(message.replyTo, message);
      continue;
    }

    let general = threads.get(GENERAL_THREAD_ID);
    if (!general) {
      general = {
        threadId: GENERAL_THREAD_ID,
        conversationId: input.conversationId,
        title: generalTitle,
        createdAt: null,
        createdBy: null,
        lastMessage: message,
        visibleLastMessage: isVisible(message) ? message : null,
        replyCount: 0,
        visibleReplyCount: 0,
      };
      threads.set(GENERAL_THREAD_ID, general);
    } else {
      general.replyCount += 1;
      if (isVisible(message)) {
        if (general.visibleLastMessage) {
          general.visibleReplyCount += 1;
        }
      }
      bumpActivity(GENERAL_THREAD_ID, message);
      bumpVisibleActivity(GENERAL_THREAD_ID, message);
    }
  }

  return [...threads.values()]
    .map((thread) => summarize(thread, Boolean(visibleSenders)))
    .sort(
      (left, right) =>
        new Date(right.lastActivityAt).getTime() -
        new Date(left.lastActivityAt).getTime(),
    );
}

/**
 * Filter a conversation's messages down to those that belong to the
 * given thread. The thread root (`thread-create/1` for explicit threads)
 * is included as the first element.
 */
export function filterMessagesForThread(input: {
  threadId: string;
  messages: readonly SerializedMessage[];
}): SerializedMessage[] {
  if (input.threadId === GENERAL_THREAD_ID) {
    return [...input.messages]
      .filter((m) => !m.replyTo && !m.threadCreate)
      .sort(
        (left, right) =>
          new Date(left.sentAt).getTime() -
          new Date(right.sentAt).getTime(),
      );
  }

  const out: SerializedMessage[] = [];
  for (const message of input.messages) {
    if (message.id === input.threadId) {
      out.push(message);
      continue;
    }
    if (message.replyTo === input.threadId) {
      out.push(message);
    }
  }
  return out.sort(
    (left, right) =>
      new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime(),
  );
}
