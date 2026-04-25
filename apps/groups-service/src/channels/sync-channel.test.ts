import { describe, expect, test, vi } from "vitest";
import {
  ContentTypeError,
  ContentTypeHumanAgentSubmit,
  ContentTypeHumanSubmit,
  ContentTypeIdentitySubmit,
  ContentTypeJoinRequest,
  ContentTypeJoinResponse,
  ContentTypeListGroupsRequest,
  ContentTypeSkillRequest,
  ContentTypeSkillResponse,
  ContentTypeThreadCatalogRequest,
  ContentTypeThreadCatalogResponse,
  ContentTypeVerificationAck,
  ContentTypeWalletStatusRequest,
  ContentTypeWalletStatusResponse,
  ErrorCodec,
  JoinResponseCodec,
  SkillResponseCodec,
  ThreadCatalogResponseCodec,
  VerificationAckCodec,
  WalletStatusResponseCodec,
  contentTypeEquals,
  type ErrorPayload,
  type JoinResponsePayload,
  type SkillResponsePayload,
  type VerificationAckPayload,
  type WalletStatusResponsePayload,
} from "@kharisma/protocol";
import { GroupMessageKind, type DecodedMessage } from "@xmtp/node-sdk";
import type { AppLogger } from "../logging.js";
import type { GroupManager, ManagedGroup } from "../groups/manager.js";
import type { GroupRecord } from "../storage/schema.js";
import type { VerificationService } from "../verification/service.js";
import type { KharismaClient } from "../xmtp/client.js";
import { SyncChannel } from "./sync-channel.js";

const silentLogger: AppLogger = {
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

type SentMessage = { payload: unknown };

function makeRecord(override: Partial<GroupRecord> = {}): GroupRecord {
  return {
    groupId: "g-1",
    status: "active",
    title: "Example",
    description: "This is a test group description",
    mediaUrl: "https://example.com/media/test.jpg",
    thumbnailUrl: "https://example.com/media/thumb.jpg",
    languages: ["en"],
    joinPolicy: "H_ONLY",
    joinApproval: "NONE",
    maxMembers: 10,
    encryptedPrivateKey: "v1.x.x.x",
    syncInboxId: "sync-inbox",
    xmtpGroupId: "xmtp-group-1",
    members: {},
    createdAt: new Date(0).toISOString(),
    ...override,
  };
}

function makeVerificationService(
  override: Partial<VerificationService> = {},
): VerificationService {
  return {
    getWalletStatus: vi.fn(() => ({
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "UNKNOWN",
      verificationLevel: "none",
      humanId: null,
      agentId: null,
      handle: null,
    })),
    submitIdentity: vi.fn(async () => ({
      action: "identity",
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "ok",
      resolvedStatus: "UNKNOWN",
      verificationLevel: "identity",
      humanId: null,
      agentId: null,
      handle: null,
    })),
    submitHuman: vi.fn(async () => ({
      action: "human",
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "ok",
      resolvedStatus: "H",
      verificationLevel: "human",
      humanId: "human-1",
      agentId: null,
      handle: "alice",
    })),
    submitHumanAgent: vi.fn(async () => ({
      action: "human-agent",
      walletAddress: "0x2222222222222222222222222222222222222222",
      status: "ok",
      resolvedStatus: "HA",
      verificationLevel: "human-agent",
      humanId: "human-1",
      agentId: "agent-1",
      handle: "agent1",
    })),
    resolveSenderStatus: vi.fn(() => ({
      walletAddress: "0x1111111111111111111111111111111111111111",
      inboxId: "inbox-alice",
      status: "H",
      verificationLevel: "human",
      humanId: "human-1",
      agentId: null,
      handle: "alice",
      identityKey: "identity-1",
    })),
    ...override,
  } as unknown as VerificationService;
}

function setup(options: {
  record?: Partial<GroupRecord>;
  verification?: VerificationService;
} = {}) {
  let record = makeRecord(options.record);
  const sent: SentMessage[] = [];
  const send = vi.fn(async (encoded: unknown) => {
    sent.push({ payload: encoded });
    return "msg-id";
  });
  const dm = { id: "sync-dm", send };
  const addMembers = vi.fn(async (_ids: string[]) => {});
  const groupSend = vi.fn(async (_encoded: unknown) => "group-msg-id");
  const mlsGroup = {
    id: "xmtp-group-1",
    addMembers,
    send: groupSend,
    sync: vi.fn(async () => {}),
    messages: vi.fn(async () => []),
  };

  const client = {
    inboxId: "sync-inbox",
    conversations: {
      async getConversationById(id: string) {
        if (id === "sync-dm") return dm;
        if (id === "xmtp-group-1") return mlsGroup;
        return undefined;
      },
    },
  } as unknown as KharismaClient;

  const managed: ManagedGroup = {
    record,
    client,
    walletAddress: "0x9999999999999999999999999999999999999999",
  };
  const manager = {
    updateRecord: vi.fn(
      (groupId: string, mutator: (current: GroupRecord) => GroupRecord) => {
        expect(groupId).toBe(record.groupId);
        record = mutator(record);
        managed.record = record;
        return record;
      },
    ),
  } as unknown as GroupManager;

  const verification = options.verification ?? makeVerificationService();
  const investments = {
    getInvestmentConfig: vi.fn(),
    submitInvestment: vi.fn(),
  };
  const store = {
    listPendingJoins: vi.fn(() => []),
    getOpenPendingJoinByApplicant: vi.fn(() => undefined),
    putPendingJoin: vi.fn(),
    listGroupThreads: vi.fn(() => []),
    replaceGroupThreads: vi.fn(),
  };
  const channel = new SyncChannel(
    manager,
    store as never,
    verification,
    investments as never,
    silentLogger.child({ component: "sync-channel" }),
  );

  return {
    addMembers,
    channel,
    getRecord: () => record,
    managed,
    mlsGroup,
    sent,
    verification,
    store,
  };
}

function makeMessage(input: {
  contentType: {
    authorityId: string;
    typeId: string;
    versionMajor: number;
    versionMinor: number;
  };
  content: unknown;
  senderInboxId?: string;
}): DecodedMessage {
  return {
    id: "m1",
    kind: GroupMessageKind.Application,
    senderInboxId: input.senderInboxId ?? "inbox-alice",
    conversationId: "sync-dm",
    contentType: input.contentType,
    content: input.content,
    sentAt: new Date(0),
    sentAtNs: 0n,
    deliveryStatus: "published",
    numReplies: 0,
    reactions: [],
  } as unknown as DecodedMessage;
}

function decodeSent(sent: SentMessage[]) {
  return sent.map((entry) => {
    const encoded = entry.payload as {
      type: { authorityId: string; typeId: string; versionMajor: number };
      content: Uint8Array;
    };
    let content: unknown = encoded;
    if (contentTypeEquals(encoded.type, ContentTypeError)) {
      content = ErrorCodec.decode(encoded as never) as ErrorPayload;
    } else if (contentTypeEquals(encoded.type, ContentTypeWalletStatusResponse)) {
      content = WalletStatusResponseCodec.decode(encoded as never) as
        | WalletStatusResponsePayload
        | undefined;
    } else if (contentTypeEquals(encoded.type, ContentTypeVerificationAck)) {
      content = VerificationAckCodec.decode(encoded as never) as
        | VerificationAckPayload
        | undefined;
    } else if (contentTypeEquals(encoded.type, ContentTypeSkillResponse)) {
      content = SkillResponseCodec.decode(encoded as never) as
        | SkillResponsePayload
        | undefined;
    } else if (contentTypeEquals(encoded.type, ContentTypeJoinResponse)) {
      content = JoinResponseCodec.decode(encoded as never) as
        | JoinResponsePayload
        | undefined;
    } else if (contentTypeEquals(encoded.type, ContentTypeThreadCatalogResponse)) {
      content = ThreadCatalogResponseCodec.decode(encoded as never);
    }
    return {
      type: `${encoded.type.authorityId}/${encoded.type.typeId}`,
      content,
    };
  });
}

describe("SyncChannel", () => {
  test("deleted groups are fully ignored", async () => {
    const { channel, managed, sent, verification } = setup({
      record: { status: "deleted" },
    });

    await channel.handleMessage(
      managed,
      makeMessage({
        contentType: ContentTypeWalletStatusRequest,
        content: {
          walletAddress: "0x1111111111111111111111111111111111111111",
        },
      }),
    );

    expect(sent).toEqual([]);
    expect(verification.getWalletStatus).not.toHaveBeenCalled();
  });

  test("skill-request/1 returns generated circle sync skill markdown", async () => {
    const { channel, managed, sent } = setup({
      record: {
        groupId: "circle-1",
        title: "Invest with Giles",
        languages: ["en", "fr"],
        maxMembers: 12,
      },
    });

    await channel.handleMessage(
      managed,
      makeMessage({
        contentType: ContentTypeSkillRequest,
        content: {},
      }),
    );

    const decoded = decodeSent(sent);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].type).toBe("kharisma.xyz/skill-response");
    expect(decoded[0].content).toMatchObject({
      status: "ok",
      file: "SKILL.md",
      mediaType: "text/markdown",
      channel: {
        kind: "circle-sync",
        groupId: "circle-1",
        title: "Invest with Giles",
        syncInboxId: "sync-inbox",
        conversationId: "xmtp-group-1",
        memberCount: 0,
        maxMembers: 12,
        availableSeats: 12,
        languages: ["en", "fr"],
      },
    });
    const response = decoded[0].content as SkillResponsePayload;
    expect(response.status).toBe("ok");
    if (response.status === "ok") {
      expect(response.content).toMatch(/^---\nname: kharisma-protocol\n/);
      expect(response.content).toContain("## Channel Context");
      expect(response.content).toContain("- Channel kind: circle-sync");
      expect(response.content).toContain("- Circle title: Invest with Giles");
      expect(response.content).toContain("- Members: 0/12");
      expect(response.content).toContain("The Kharisma protocol is **XMTP-only**");
    }
  });

  test("wallet-status-request/2 returns the stored wallet status", async () => {
    const verification = makeVerificationService({
      getWalletStatus: vi.fn(() => ({
        walletAddress: "0x1111111111111111111111111111111111111111",
        status: "H",
        verificationLevel: "human",
        humanId: "human-1",
        agentId: null,
        handle: "alice",
      })),
    });
    const { channel, managed, sent } = setup({ verification });

    await channel.handleMessage(
      managed,
      makeMessage({
        contentType: ContentTypeWalletStatusRequest,
        content: {
          walletAddress: "0x1111111111111111111111111111111111111111",
        },
      }),
    );

    const decoded = decodeSent(sent);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].type).toBe("kharisma.xyz/wallet-status-response");
    expect(decoded[0].content).toMatchObject({
      status: "H",
      verificationLevel: "human",
      handle: "alice",
    });
  });

  test("verification submissions emit verification-ack/2 on the sync DM", async () => {
    const verification = makeVerificationService();
    const { channel, managed, sent } = setup({ verification });

    await channel.handleMessage(
      managed,
      makeMessage({
        contentType: ContentTypeIdentitySubmit,
        content: {
          walletAddress: "0x1111111111111111111111111111111111111111",
          proof: { action: "identity" },
        },
      }),
    );
    await channel.handleMessage(
      managed,
      makeMessage({
        contentType: ContentTypeHumanSubmit,
        content: {
          walletAddress: "0x1111111111111111111111111111111111111111",
          handle: " alice ",
          proof: { action: "human" },
        },
      }),
    );
    await channel.handleMessage(
      managed,
      makeMessage({
        contentType: ContentTypeHumanAgentSubmit,
        content: {
          walletAddress: "0x2222222222222222222222222222222222222222",
          ownerHumanId: "human-1",
          handle: " agent1 ",
          proof: { action: "human-agent" },
        },
      }),
    );

    expect(verification.submitIdentity).toHaveBeenCalledWith({
      walletAddress: "0x1111111111111111111111111111111111111111",
      proof: { action: "identity" },
      senderInboxId: "inbox-alice",
    });
    expect(verification.submitHuman).toHaveBeenCalledWith({
      walletAddress: "0x1111111111111111111111111111111111111111",
      handle: "alice",
      proof: { action: "human" },
      senderInboxId: "inbox-alice",
    });
    expect(verification.submitHumanAgent).toHaveBeenCalledWith({
      walletAddress: "0x2222222222222222222222222222222222222222",
      ownerHumanId: "human-1",
      handle: "agent1",
      proof: { action: "human-agent" },
      senderInboxId: "inbox-alice",
    });
    expect(decodeSent(sent).map((entry) => entry.type)).toEqual([
      "kharisma.xyz/verification-ack",
      "kharisma.xyz/verification-ack",
      "kharisma.xyz/verification-ack",
    ]);
  });

  test("sync verification can establish status before an H_ONLY join", async () => {
    let status: ReturnType<VerificationService["resolveSenderStatus"]> = {
      walletAddress: "0x1111111111111111111111111111111111111111",
      inboxId: "inbox-alice",
      status: "UNKNOWN",
      verificationLevel: "none",
      humanId: null,
      agentId: null,
      handle: null,
      identityKey: null,
    };
    const verification = makeVerificationService({
      submitHuman: vi.fn(async () => {
        status = {
          walletAddress: "0x1111111111111111111111111111111111111111",
          inboxId: "inbox-alice",
          status: "H",
          verificationLevel: "human",
          humanId: "human-1",
          agentId: null,
          handle: "alice",
          identityKey: "identity-1",
        };
        return {
          action: "human",
          walletAddress: status.walletAddress,
          status: "ok",
          resolvedStatus: "H",
          verificationLevel: "human",
          humanId: "human-1",
          agentId: null,
          handle: "alice",
        };
      }),
      resolveSenderStatus: vi.fn(() => status),
    });
    const { addMembers, channel, getRecord, managed, sent } = setup({
      verification,
    });

    await channel.handleMessage(
      managed,
      makeMessage({
        contentType: ContentTypeHumanSubmit,
        content: {
          walletAddress: "0x1111111111111111111111111111111111111111",
          handle: "alice",
          proof: { action: "human" },
        },
      }),
    );
    await channel.handleMessage(
      managed,
      makeMessage({
        contentType: ContentTypeJoinRequest,
        content: {
          groupId: "g-1",
          walletAddress: "0x1111111111111111111111111111111111111111",
        },
      }),
    );

    expect(addMembers).toHaveBeenCalledWith(["inbox-alice"]);
    expect(getRecord().members["inbox-alice"]?.role).toBe("H");
    expect(decodeSent(sent).at(-1)?.content).toMatchObject({
      status: "ok",
      groupId: "g-1",
      conversationId: "xmtp-group-1",
    });
  });

  test("verification submissions after join return already-member", async () => {
    const { channel, managed, sent } = setup();

    await channel.handleMessage(
      managed,
      makeMessage({
        contentType: ContentTypeJoinRequest,
        content: {
          groupId: "g-1",
          walletAddress: "0x1111111111111111111111111111111111111111",
        },
      }),
    );
    await channel.handleMessage(
      managed,
      makeMessage({
        contentType: ContentTypeIdentitySubmit,
        content: {
          walletAddress: "0x1111111111111111111111111111111111111111",
          proof: { action: "identity" },
        },
      }),
    );

    expect(decodeSent(sent).at(-1)?.content).toMatchObject({
      code: "already-member",
    });
  });

  test("thread-catalog-request/1 is rejected before join", async () => {
    const { channel, managed, sent } = setup();

    await channel.handleMessage(
      managed,
      makeMessage({
        contentType: ContentTypeThreadCatalogRequest,
        content: { groupId: "g-1" },
      }),
    );

    expect(decodeSent(sent)).toEqual([
      {
        type: "kharisma.xyz/error",
        content: expect.objectContaining({ code: "verification-required" }),
      },
    ]);
  });

  test("thread-catalog-request/1 returns catalog after join", async () => {
    const { channel, managed, mlsGroup, sent, store } = setup({
      record: {
        members: {
          "inbox-alice": {
            inboxId: "inbox-alice",
            walletAddress: "0x1111111111111111111111111111111111111111",
            name: "alice",
            role: "H",
            verificationLevel: "human",
            humanId: "human-1",
            joinedAt: new Date(0).toISOString(),
          },
        },
      },
    });
    store.listGroupThreads.mockReturnValue([
      {
        groupId: "g-1",
        threadId: "root-1",
        title: "Q2 deals",
        createdAt: "2026-04-22T09:00:00.000Z",
        createdBy: "inbox-bob",
        updatedAt: "2026-04-22T10:00:00.000Z",
      },
    ]);
    mlsGroup.messages.mockRejectedValue(new Error("history unavailable"));

    await channel.handleMessage(
      managed,
      makeMessage({
        contentType: ContentTypeThreadCatalogRequest,
        content: { groupId: "g-1" },
      }),
    );

    expect(decodeSent(sent)).toEqual([
      {
        type: "kharisma.xyz/thread-catalog-response",
        content: expect.objectContaining({
          status: "ok",
          groupId: "g-1",
          conversationId: "xmtp-group-1",
          threads: [
            expect.objectContaining({
              threadId: "root-1",
              title: "Q2 deals",
            }),
          ],
        }),
      },
    ]);
  });

  test("list-groups-request/1 remains rejected on the sync DM", async () => {
    const { channel, managed, sent } = setup();

    await channel.handleMessage(
      managed,
      makeMessage({
        contentType: ContentTypeListGroupsRequest,
        content: {},
      }),
    );

    expect(decodeSent(sent)).toEqual([
      {
        type: "kharisma.xyz/error",
        content: expect.objectContaining({ code: "unknown-type" }),
      },
    ]);
  });
});
