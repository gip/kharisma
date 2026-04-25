import { describe, expect, it } from "vitest";
import {
  GENERAL_THREAD_ID,
  deriveThreadsFromMessages,
  filterMessagesForThread,
} from "./threads.js";
import type { SerializedMessage } from "./serializers.js";

function msg(input: Partial<SerializedMessage> & { id: string }): SerializedMessage {
  return {
    id: input.id,
    conversationId: input.conversationId ?? "conv-1",
    senderInboxId: input.senderInboxId ?? "alice",
    sentAt: input.sentAt ?? new Date(0).toISOString(),
    content: input.content ?? null,
    fallback: input.fallback ?? null,
    deliveryStatus: input.deliveryStatus ?? "published",
    attachment: input.attachment ?? null,
    replyTo: input.replyTo ?? null,
    threadCreate: input.threadCreate ?? null,
  };
}

describe("deriveThreadsFromMessages", () => {
  it("buckets messages without a reply or thread-create into the General thread", () => {
    const messages = [
      msg({ id: "a", content: "hi", sentAt: "2026-04-22T09:00:00.000Z" }),
      msg({ id: "b", content: "hello", sentAt: "2026-04-22T09:01:00.000Z" }),
    ];
    const threads = deriveThreadsFromMessages({
      conversationId: "conv-1",
      messages,
    });
    expect(threads).toHaveLength(1);
    expect(threads[0].threadId).toBe(GENERAL_THREAD_ID);
    expect(threads[0].title).toBe("General");
    expect(threads[0].lastMessageId).toBe("b");
  });

  it("creates an explicit thread from a thread-create and groups its replies", () => {
    const messages = [
      msg({
        id: "root",
        threadCreate: { title: "Q2 deals", createdAt: "2026-04-22T09:00:00.000Z" },
        sentAt: "2026-04-22T09:00:00.000Z",
        senderInboxId: "alice",
      }),
      msg({
        id: "r1",
        replyTo: "root",
        content: "first reply",
        sentAt: "2026-04-22T09:05:00.000Z",
        senderInboxId: "bob",
      }),
      msg({
        id: "r2",
        replyTo: "root",
        content: "second reply",
        sentAt: "2026-04-22T09:10:00.000Z",
        senderInboxId: "carol",
      }),
    ];
    const threads = deriveThreadsFromMessages({
      conversationId: "conv-1",
      messages,
    });
    expect(threads).toHaveLength(1);
    const [thread] = threads;
    expect(thread.threadId).toBe("root");
    expect(thread.title).toBe("Q2 deals");
    expect(thread.createdBy).toBe("alice");
    expect(thread.replyCount).toBe(2);
    expect(thread.lastMessageId).toBe("r2");
    expect(thread.lastActivityAt).toBe("2026-04-22T09:10:00.000Z");
  });

  it("sorts threads by latest activity descending", () => {
    const messages = [
      msg({
        id: "old-root",
        threadCreate: { title: "old", createdAt: "2026-04-20T00:00:00.000Z" },
        sentAt: "2026-04-20T00:00:00.000Z",
      }),
      msg({
        id: "new-root",
        threadCreate: { title: "new", createdAt: "2026-04-22T00:00:00.000Z" },
        sentAt: "2026-04-22T00:00:00.000Z",
      }),
    ];
    const threads = deriveThreadsFromMessages({
      conversationId: "conv-1",
      messages,
    });
    expect(threads.map((t) => t.title)).toEqual(["new", "old"]);
  });

  it("creates an untitled thread when a reply references an unknown root", () => {
    const messages = [
      msg({
        id: "r",
        replyTo: "missing-root",
        content: "orphan",
        sentAt: "2026-04-22T09:00:00.000Z",
      }),
    ];
    const threads = deriveThreadsFromMessages({
      conversationId: "conv-1",
      messages,
    });
    expect(threads).toHaveLength(1);
    expect(threads[0].threadId).toBe("missing-root");
    expect(threads[0].title).toBe("Untitled thread");
  });

  it("uses catalog metadata when a reply references a hidden root", () => {
    const messages = [
      msg({
        id: "r",
        replyTo: "hidden-root",
        content: "new member can see this reply",
        sentAt: "2026-04-22T10:00:00.000Z",
      }),
    ];
    const threads = deriveThreadsFromMessages({
      conversationId: "conv-1",
      messages,
      catalog: [
        {
          threadId: "hidden-root",
          title: "Pre-join deal",
          createdAt: "2026-04-21T09:00:00.000Z",
          createdBy: "alice",
          updatedAt: "2026-04-21T09:00:00.000Z",
        },
      ],
    });

    expect(threads).toHaveLength(1);
    expect(threads[0].threadId).toBe("hidden-root");
    expect(threads[0].title).toBe("Pre-join deal");
    expect(threads[0].lastMessageId).toBe("r");
  });
});

describe("filterMessagesForThread", () => {
  const messages = [
    msg({ id: "g1", content: "general one", sentAt: "2026-04-22T09:00:00.000Z" }),
    msg({
      id: "root",
      threadCreate: { title: "T", createdAt: "2026-04-22T10:00:00.000Z" },
      sentAt: "2026-04-22T10:00:00.000Z",
    }),
    msg({
      id: "r1",
      replyTo: "root",
      content: "reply one",
      sentAt: "2026-04-22T10:05:00.000Z",
    }),
    msg({ id: "g2", content: "general two", sentAt: "2026-04-22T11:00:00.000Z" }),
  ];

  it("returns root + replies in chronological order for explicit threads", () => {
    const out = filterMessagesForThread({ threadId: "root", messages });
    expect(out.map((m) => m.id)).toEqual(["root", "r1"]);
  });

  it("returns only un-threaded messages for the General thread", () => {
    const out = filterMessagesForThread({
      threadId: GENERAL_THREAD_ID,
      messages,
    });
    expect(out.map((m) => m.id)).toEqual(["g1", "g2"]);
  });
});
