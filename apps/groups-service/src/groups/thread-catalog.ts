import {
  ContentTypeThreadCreate,
  contentTypeEquals,
  protocolError,
  type ThreadCatalogEntry,
  type ThreadCreatePayload,
} from "@kharisma/protocol";
import { isReply, type DecodedMessage, type EnrichedReply } from "@xmtp/node-sdk";
import type { AppLogger } from "../logging.js";
import type { GroupStore } from "../storage/store.js";
import type { GroupThreadRecord } from "../storage/schema.js";
import type { ManagedGroup } from "./manager.js";

function threadCreatePayload(message: DecodedMessage): ThreadCreatePayload | null {
  if (!message.contentType) return null;
  if (!contentTypeEquals(message.contentType, ContentTypeThreadCreate)) {
    return null;
  }
  const content = message.content as ThreadCreatePayload | undefined;
  if (!content || typeof content.title !== "string") return null;
  return content;
}

function replyReference(message: DecodedMessage): string | null {
  if (!isReply(message)) return null;
  const reply = message.content as EnrichedReply | undefined;
  return typeof reply?.referenceId === "string" ? reply.referenceId : null;
}

export async function refreshThreadCatalog(input: {
  managed: ManagedGroup;
  store: GroupStore;
  logger: AppLogger;
}): Promise<ThreadCatalogEntry[]> {
  const { managed, store, logger } = input;
  const conversation = await managed.client.conversations.getConversationById(
    managed.record.xmtpGroupId,
  );

  if (!conversation) {
    throw protocolError("internal", "group conversation is missing");
  }

  await conversation.sync().catch((err) => {
    logger.warn(
      { err, groupId: managed.record.groupId },
      "Thread catalog conversation sync failed",
    );
  });

  const messages = await conversation.messages();
  const threads = new Map<string, GroupThreadRecord>();

  for (const message of [...messages].sort(
    (left, right) => left.sentAt.getTime() - right.sentAt.getTime(),
  )) {
    const payload = threadCreatePayload(message);
    if (payload) {
      const createdAt = payload.createdAt || message.sentAt.toISOString();
      threads.set(message.id, {
        groupId: managed.record.groupId,
        threadId: message.id,
        title: payload.title,
        createdAt,
        createdBy: message.senderInboxId,
        updatedAt: message.sentAt.toISOString(),
      });
      continue;
    }

    const reference = replyReference(message);
    if (reference && threads.has(reference)) {
      const thread = threads.get(reference)!;
      if (message.sentAt.getTime() > new Date(thread.updatedAt).getTime()) {
        threads.set(reference, {
          ...thread,
          updatedAt: message.sentAt.toISOString(),
        });
      }
    }
  }

  const sorted = [...threads.values()].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  store.replaceGroupThreads(managed.record.groupId, sorted);
  return sorted.map(({ groupId: _groupId, ...thread }) => thread);
}

export async function getThreadCatalog(input: {
  managed: ManagedGroup;
  store: GroupStore;
  logger: AppLogger;
}): Promise<ThreadCatalogEntry[]> {
  try {
    return await refreshThreadCatalog(input);
  } catch (error) {
    const persisted = input.store.listGroupThreads(input.managed.record.groupId);
    if (persisted.length > 0) {
      input.logger.warn(
        { err: error, groupId: input.managed.record.groupId },
        "Serving persisted thread catalog after refresh failed",
      );
      return persisted.map(({ groupId: _groupId, ...thread }) => thread);
    }
    throw error;
  }
}
