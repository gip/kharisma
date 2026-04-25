import {
  isVisibleMessageFromSenders,
  visibleMessageText,
  visibleMessageTextWithSenders,
} from "./thread-screen";
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

  it("renders investment-recorded messages with a sender handle when available", () => {
    expect(
      visibleMessageTextWithSenders(
        message({
          content:
            "0x1111111111111111111111111111111111111111 invested 0.1 WLD",
          investmentRecorded: {
            investorInboxId: "inbox-alice",
            investorWalletAddress: "0x1111111111111111111111111111111111111111",
            token: "WLD",
            amount: "100000000000000000",
            decimals: 18,
            displayAmount: "0.1",
          },
        }),
        [
          {
            inboxId: "inbox-alice",
            name: "alice",
            role: "H",
            walletAddress: "0x1111111111111111111111111111111111111111",
            humanId: null,
            agentId: null,
            verificationLevel: "human",
          },
        ],
      ),
    ).toBe("alice invested 0.1 WLD");
  });
});

describe("isVisibleMessageFromSenders", () => {
  const senders = [
    {
      inboxId: "inbox-human",
      name: "human",
      role: "H" as const,
      walletAddress: null,
      humanId: "human-1",
      agentId: null,
      verificationLevel: "human" as const,
    },
    {
      inboxId: "inbox-human-agent",
      name: "human-agent",
      role: "HA" as const,
      walletAddress: null,
      humanId: "human-1",
      agentId: "agent-1",
      verificationLevel: "human-agent" as const,
    },
    {
      inboxId: "inbox-agent",
      name: "agent",
      role: "A" as const,
      walletAddress: null,
      humanId: null,
      agentId: null,
      verificationLevel: "none" as const,
    },
  ];

  it("shows every sender in all mode", () => {
    expect(
      isVisibleMessageFromSenders(
        message({ senderInboxId: "inbox-human-agent" }),
        senders,
        "all",
      ),
    ).toBe(true);
    expect(
      isVisibleMessageFromSenders(
        message({ senderInboxId: "unknown" }),
        senders,
        "all",
      ),
    ).toBe(true);
  });

  it("shows only role-H senders in human mode", () => {
    expect(
      isVisibleMessageFromSenders(
        message({ senderInboxId: "inbox-human" }),
        senders,
        "human",
      ),
    ).toBe(true);
    expect(
      isVisibleMessageFromSenders(
        message({ senderInboxId: "inbox-human-agent" }),
        senders,
        "human",
      ),
    ).toBe(false);
    expect(
      isVisibleMessageFromSenders(
        message({ senderInboxId: "inbox-agent" }),
        senders,
        "human",
      ),
    ).toBe(false);
    expect(
      isVisibleMessageFromSenders(
        message({ senderInboxId: "unknown" }),
        senders,
        "human",
      ),
    ).toBe(false);
  });
});
