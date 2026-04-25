import { describe, expect, it } from "vitest";
import {
  ContentTypeInvestmentRecorded,
  type InvestmentRecordedPayload,
} from "@kharisma/protocol";
import type { DecodedMessage } from "@xmtp/node-sdk";
import { serializeMessage } from "./serializers.js";

function decodedMessage(input: {
  content: unknown;
  fallback?: string | null;
  contentType?: DecodedMessage["contentType"];
}): DecodedMessage {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    senderInboxId: "inbox-1",
    sentAt: new Date("2026-04-23T12:00:00.000Z"),
    content: input.content,
    contentType: input.contentType,
    fallback: input.fallback ?? null,
    deliveryStatus: "published",
  } as unknown as DecodedMessage;
}

describe("serializeMessage", () => {
  it("formats decoded investment-recorded amounts using token decimals", () => {
    const payload: InvestmentRecordedPayload = {
      groupId: "group-1",
      investorInboxId: "inbox-1",
      investorWalletAddress: "0x1111111111111111111111111111111111111111",
      token: "WLD",
      tokenAddress: "0x2222222222222222222222222222222222222222",
      amount: "1000000000000000000",
      decimals: 18,
      destinationAddress: "0x3333333333333333333333333333333333333333",
      chainId: 480,
      txHash:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      recordedAt: "2026-04-23T12:00:00.000Z",
    };

    const message = serializeMessage(
      decodedMessage({
        content: payload,
        contentType: ContentTypeInvestmentRecorded,
        fallback:
          "0x1111111111111111111111111111111111111111 invested 1000000000000000000 WLD",
      }),
    );

    expect(message.content).toBe(
      "0x1111111111111111111111111111111111111111 invested 1 WLD",
    );
    expect(message.investmentRecorded).toMatchObject({
      investorInboxId: "inbox-1",
      investorWalletAddress: "0x1111111111111111111111111111111111111111",
      token: "WLD",
      amount: "1000000000000000000",
      decimals: 18,
      displayAmount: "1",
    });
    expect(message.fallback).toBe(
      "0x1111111111111111111111111111111111111111 invested 1000000000000000000 WLD",
    );
  });
});
