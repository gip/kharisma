import { visibleMessageText } from "./thread-screen";
import type { XmtpMessage } from "@/xmtp/types";

function message(overrides: Partial<XmtpMessage>): XmtpMessage {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    senderInboxId: "inbox-1",
    sentAt: new Date("2026-04-23T10:00:00.000Z"),
    content: null,
    fallback: null,
    deliveryStatus: "delivered",
    attachment: null,
    replyTo: null,
    threadCreate: null,
    ...overrides,
  };
}

describe("visibleMessageText", () => {
  it("prefers decoded reply content over XMTP fallback copy", () => {
    expect(
      visibleMessageText(
        message({
          content: "A cool thread",
          fallback: 'Replied with "A cool thread" to an earlier message',
          replyTo: "thread-root",
        }),
      ),
    ).toBe("A cool thread");
  });

  it("does not render thread-create metadata as a chat message", () => {
    expect(
      visibleMessageText(
        message({
          fallback: "Thread: THREAD Z",
          threadCreate: {
            title: "THREAD Z",
            createdAt: "2026-04-23T10:00:00.000Z",
          },
        }),
      ),
    ).toBeNull();
  });
});
