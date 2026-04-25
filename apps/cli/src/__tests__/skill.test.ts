import {
  ContentTypeError,
  ContentTypeSkillResponse,
  type SkillResponsePayload,
} from "@kharisma/protocol";
import { describe, expect, test } from "vitest";
import { CliError } from "../errors.js";
import {
  decodeSkillResponse,
  waitForSkillResponse,
  type DecodedMessageLike,
  type DmLike,
} from "../skill.js";

const startedAt = new Date("2026-01-01T00:00:00.000Z");
const peerInboxId = "peer-inbox";
const selfInboxId = "self-inbox";

const unrelatedType = {
  authorityId: "xmtp.org",
  typeId: "text",
  versionMajor: 1,
  versionMinor: 0,
};

function skillPayload(overrides: Partial<SkillResponsePayload> = {}): SkillResponsePayload {
  return {
    status: "ok",
    file: "SKILL.md",
    mediaType: "text/markdown",
    channel: {
      kind: "discovery",
      serviceInboxId: peerInboxId,
      protocolVersion: "0.3.0",
    },
    content: "# Kharisma Protocol\n",
    ...overrides,
  } as SkillResponsePayload;
}

function message(input: Partial<DecodedMessageLike>): DecodedMessageLike {
  return {
    senderInboxId: peerInboxId,
    contentType: ContentTypeSkillResponse,
    content: skillPayload(),
    sentAt: new Date("2026-01-01T00:00:01.000Z"),
    ...input,
  };
}

describe("decodeSkillResponse", () => {
  test("returns markdown for a valid skill-response/1", () => {
    expect(
      decodeSkillResponse({
        message: message({}),
        peerInboxId,
        selfInboxId,
        startedAt,
      }),
    ).toBe("# Kharisma Protocol\n");
  });

  test("maps protocol error/1 to an error", () => {
    const decoded = decodeSkillResponse({
      message: message({
        contentType: ContentTypeError,
        content: { code: "malformed", message: "bad request" },
      }),
      peerInboxId,
      selfInboxId,
      startedAt,
    });

    expect(decoded).toBeInstanceOf(CliError);
    expect((decoded as Error).message).toContain(
      "Kharisma protocol error (malformed): bad request",
    );
  });

  test("maps skill-response status error to an error", () => {
    const decoded = decodeSkillResponse({
      message: message({
        content: {
          status: "error",
          error: { code: "internal", message: "failed" },
        },
      }),
      peerInboxId,
      selfInboxId,
      startedAt,
    });

    expect(decoded).toBeInstanceOf(CliError);
    expect((decoded as Error).message).toContain(
      "Kharisma skill error (internal): failed",
    );
  });

  test("ignores stale, self, unrelated, and wrong-sender messages", () => {
    for (const candidate of [
      message({ sentAt: new Date("2025-12-31T23:59:59.000Z") }),
      message({ senderInboxId: selfInboxId }),
      message({ contentType: unrelatedType }),
      message({ senderInboxId: "other-inbox" }),
    ]) {
      expect(
        decodeSkillResponse({
          message: candidate,
          peerInboxId,
          selfInboxId,
          startedAt,
        }),
      ).toBeNull();
    }
  });

  test("rejects malformed successful payloads", () => {
    const decoded = decodeSkillResponse({
      message: message({
        content: skillPayload({ mediaType: "application/json" as "text/markdown" }),
      }),
      peerInboxId,
      selfInboxId,
      startedAt,
    });

    expect(decoded).toBeInstanceOf(CliError);
    expect((decoded as Error).message).toContain("expected mediaType");
  });
});

describe("waitForSkillResponse", () => {
  test("polls until a valid response is available", async () => {
    let calls = 0;
    const dm: DmLike = {
      async sync() {},
      async send() {},
      async messages() {
        calls += 1;
        return calls === 1 ? [] : [message({})];
      },
    };

    await expect(
      waitForSkillResponse({
        dm,
        target: "0x1111111111111111111111111111111111111111",
        peerInboxId,
        selfInboxId,
        startedAt,
        timeoutMs: 1000,
        pollMs: 1,
        xmtpEnv: "production",
        sleep: async () => {},
      }),
    ).resolves.toBe("# Kharisma Protocol\n");
  });

  test("times out with target context", async () => {
    let time = 0;
    const dm: DmLike = {
      async sync() {
        throw new Error("temporary sync failure");
      },
      async send() {},
      async messages() {
        return [];
      },
    };

    await expect(
      waitForSkillResponse({
        dm,
        target: "0x1111111111111111111111111111111111111111",
        peerInboxId,
        selfInboxId,
        startedAt,
        timeoutMs: 10,
        pollMs: 5,
        xmtpEnv: "production",
        now: () => time,
        sleep: async (ms) => {
          time += ms;
        },
      }),
    ).rejects.toThrow(
      "Timed out waiting for skill-response/1 from 0x1111111111111111111111111111111111111111",
    );
  });
});
