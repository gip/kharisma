import { describe, expect, test, vi } from "vitest";
import {
  ContentTypeCreateGroupRequest,
  ContentTypeCreateGroupResponse,
  ContentTypeError,
  ContentTypeHello,
  ContentTypeHumanSubmit,
  ContentTypeListGroupsRequest,
  ContentTypeListGroupsResponse,
  ContentTypeSkillRequest,
  ContentTypeSkillResponse,
  ContentTypeVerificationAck,
  ContentTypeWalletStatusRequest,
  ContentTypeWalletStatusResponse,
  CreateGroupResponseCodec,
  ErrorCodec,
  ListGroupsResponseCodec,
  SkillResponseCodec,
  VerificationAckCodec,
  WalletStatusResponseCodec,
  contentTypeEquals,
  type CreateGroupResponsePayload,
  type ErrorPayload,
  type ListGroupsResponsePayload,
  type SkillResponsePayload,
  type ProtocolError,
  type VerificationAckPayload,
  type WalletStatusResponsePayload,
} from "@kharisma/protocol";
import type { DecodedMessage } from "@xmtp/node-sdk";
import type { AppLogger } from "../logging.js";
import type { GroupManager, ManagedGroup } from "../groups/manager.js";
import type { GroupRecord } from "../storage/schema.js";
import type { VerificationService } from "../verification/service.js";
import type { KharismaClient } from "../xmtp/client.js";
import { MainChannel } from "./main-channel.js";

const silentLogger: AppLogger = {
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

type SentMessage = { type: string; payload: unknown };

function makeManagedGroup(
  override: Partial<GroupRecord> = {},
  wallets: Record<string, string> = {},
): ManagedGroup {
  const record: GroupRecord = {
    groupId: "g-1",
    status: "active",
    title: "Example",
    description: "This is a test group description",
    mediaUrl: "https://example.com/media/test.jpg",
    thumbnailUrl: "https://example.com/media/thumb.jpg",
    languages: ["en", "ko"],
    joinPolicy: "H_ONLY",
    maxMembers: 10,
    encryptedPrivateKey: "v1.x.x.x",
    syncInboxId: "sync-1",
    xmtpGroupId: "xmtp-1",
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
    createdAt: new Date(0).toISOString(),
    ...override,
  };

  const client = {
    inboxId: record.syncInboxId,
    accountIdentifier: {
      identifier: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      identifierKind: "Ethereum",
    },
    conversations: {
      async getConversationById(id: string) {
        if (id !== record.xmtpGroupId) {
          return undefined;
        }
        return {
          async members() {
            return Object.entries(wallets).map(([inboxId, wallet]) => ({
              inboxId,
              accountIdentifiers: [
                {
                  identifier: wallet,
                  identifierKind: "Ethereum",
                },
              ],
            }));
          },
        };
      },
    },
  } as unknown as KharismaClient;

  return {
    record,
    client,
    walletAddress: "0x9999999999999999999999999999999999999999",
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
      handle: "creator",
    })),
    submitHumanAgent: vi.fn(async () => ({
      action: "human-agent",
      walletAddress: "0x2222222222222222222222222222222222222222",
      status: "ok",
      resolvedStatus: "HA",
      verificationLevel: "human-agent",
      humanId: "human-1",
      agentId: "agent-1",
      handle: "bot-1",
    })),
    authenticateHello: vi.fn(() => ({
      ok: true as const,
      status: {
        walletAddress: "0x1111111111111111111111111111111111111111",
        inboxId: "inbox-alice",
        status: "H",
        verificationLevel: "human",
        humanId: "human-1",
        agentId: null,
        handle: "creator",
        identityKey: "identity-1",
      },
    })),
    ...override,
  } as unknown as VerificationService;
}

function setupChannel(options: {
  groups?: ManagedGroup[];
  verification?: VerificationService;
  createGroup?: GroupManager["createGroup"];
} = {}) {
  const sent: SentMessage[] = [];
  const send = vi.fn(async (encoded: { type: unknown }) => {
    sent.push({ type: describeType(encoded.type), payload: encoded });
    return "msg-id";
  });

  const dm = {
    id: "conv-1",
    send,
  };

  const client = {
    inboxId: "main-inbox",
    conversations: {
      async getConversationById(id: string) {
        return id === "conv-1" ? dm : undefined;
      },
    },
  } as unknown as KharismaClient;

  const manager = {
    all: () => options.groups ?? [],
    createGroup:
      options.createGroup ??
      (async ({ title, description, mediaUrl, thumbnailUrl, languages, joinPolicy, maxMembers, creator }) => ({
        record: {
          groupId: "new-g",
          status: "active",
          title,
          description,
          mediaUrl,
          thumbnailUrl,
          languages,
          joinPolicy,
          maxMembers,
          encryptedPrivateKey: "v1.x.x.x",
          syncInboxId: "new-sync-inbox",
          xmtpGroupId: "xmtp-new",
          members: creator ? { [creator.inboxId]: creator } : {},
          createdAt: new Date(0).toISOString(),
        },
        client,
      })) as GroupManager["createGroup"],
  } as unknown as GroupManager;

  const verification = options.verification ?? makeVerificationService();
  const channel = new MainChannel(client, manager, verification, silentLogger);
  return { channel, sent, verification };
}

function decodeSent(sent: SentMessage[]): Array<{ type: string; content: unknown }> {
  return sent.map((entry) => {
    const encoded = entry.payload as {
      type: { authorityId: string; typeId: string };
      content: Uint8Array;
    };
    let content: unknown = encoded;
    if (contentTypeEquals(encoded.type, ContentTypeError)) {
      content = ErrorCodec.decode(encoded as never) as ErrorPayload;
    } else if (contentTypeEquals(encoded.type, ContentTypeListGroupsResponse)) {
      content = ListGroupsResponseCodec.decode(encoded as never) as
        | ListGroupsResponsePayload
        | undefined;
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
    } else if (contentTypeEquals(encoded.type, ContentTypeCreateGroupResponse)) {
      content = CreateGroupResponseCodec.decode(encoded as never) as
        | CreateGroupResponsePayload
        | undefined;
    }
    return { type: describeType(encoded.type), content };
  });
}

function describeType(t: unknown): string {
  const id = t as { authorityId?: string; typeId?: string };
  return `${id.authorityId ?? "?"}/${id.typeId ?? "?"}`;
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
  conversationId?: string;
}): DecodedMessage {
  return {
    id: "m1",
    kind: 0,
    senderInboxId: input.senderInboxId ?? "inbox-alice",
    conversationId: input.conversationId ?? "conv-1",
    contentType: input.contentType,
    content: input.content,
    sentAt: new Date(0),
    sentAtNs: 0n,
    deliveryStatus: "published",
    numReplies: 0,
    reactions: [],
  } as unknown as DecodedMessage;
}

describe("MainChannel", () => {
  test("skill-request/1 returns generated discovery skill markdown", async () => {
    const { channel, sent } = setupChannel();

    await channel.handleMessage(
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
        kind: "discovery",
        serviceInboxId: "main-inbox",
      },
    });
    const response = decoded[0].content as SkillResponsePayload;
    expect(response.status).toBe("ok");
    if (response.status === "ok") {
      expect(response.content).toMatch(/^---\nname: kharisma-protocol\n/);
      expect(response.content).toContain("## Channel Context");
      expect(response.content).toContain("- Channel kind: discovery");
      expect(response.content).toContain("- Service inbox id: main-inbox");
      expect(response.content).toContain("The Kharisma protocol is **XMTP-only**");
    }
  });

  test("rejects create-group-request/1 before hello/1", async () => {
    const { channel, sent } = setupChannel();

    await channel.handleMessage(
      makeMessage({
        contentType: ContentTypeCreateGroupRequest,
        content: {
          title: "example",
          description: "This is a test group description",
          mediaUrl: "https://example.com/media/test.jpg",
          thumbnailUrl: "https://example.com/media/thumb.jpg",
          languages: ["en"],
          joinPolicy: "H_ONLY",
          maxMembers: 10,
        },
      }),
    );

    const decoded = decodeSent(sent);
    expect(decoded).toHaveLength(1);
    expect((decoded[0].content as ProtocolError).code).toBe("malformed");
  });

  test("wallet-status-request/1 returns the stored wallet status", async () => {
    const verification = makeVerificationService({
      getWalletStatus: vi.fn(() => ({
        walletAddress: "0x1111111111111111111111111111111111111111",
        status: "H",
        verificationLevel: "human",
        humanId: "human-1",
        agentId: null,
        handle: "creator",
      })),
    });
    const { channel, sent } = setupChannel({ verification });

    await channel.handleMessage(
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
    expect(decoded[0].content).toEqual({
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "H",
      verificationLevel: "human",
      humanId: "human-1",
      agentId: null,
      handle: "creator",
    });
  });

  test("human-submit/1 emits verification-ack/1", async () => {
    const verification = makeVerificationService({
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
    });
    const { channel, sent } = setupChannel({ verification });

    await channel.handleMessage(
      makeMessage({
        contentType: ContentTypeHumanSubmit,
        content: {
          walletAddress: "0x1111111111111111111111111111111111111111",
          handle: "creator",
          proof: {},
        },
      }),
    );

    const decoded = decodeSent(sent);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].type).toBe("kharisma.xyz/verification-ack");
    expect(decoded[0].content).toEqual({
      action: "human",
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "ok",
      resolvedStatus: "H",
      verificationLevel: "human",
      humanId: "human-1",
      agentId: null,
      handle: "creator",
    });
  });

  test("hello/1 rejects wallets that are not registered for the declared role", async () => {
    const verification = makeVerificationService({
      authenticateHello: vi.fn(() => ({
        ok: false as const,
        reason: "wallet is not registered for this role",
      })),
    });
    const { channel, sent } = setupChannel({ verification });

    await channel.handleMessage(
      makeMessage({
        contentType: ContentTypeHello,
        content: {
          role: "H",
          walletAddress: "0x1111111111111111111111111111111111111111",
        },
      }),
    );

    const decoded = decodeSent(sent);
    expect(decoded).toHaveLength(1);
    expect((decoded[0].content as ProtocolError).code).toBe("not-registered");
  });

  test("list-groups-request/1 is public and returns group metadata with capacity", async () => {
    const groups = [
      makeManagedGroup(
        {},
        {
          "inbox-alice": "0x1111111111111111111111111111111111111111",
          "sync-1": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ),
      makeManagedGroup(
        {
          groupId: "g-2",
          title: "Other",
          description: "Another test group for testing",
          mediaUrl: "https://example.com/media/test2.jpg",
          thumbnailUrl: "https://example.com/media/thumb2.jpg",
          languages: ["fr"],
          joinPolicy: "H_HA_AND_A",
          maxMembers: 20,
          syncInboxId: "sync-2",
          xmtpGroupId: "xmtp-2",
          members: {},
        },
        {},
      ),
      makeManagedGroup(
        {
          groupId: "g-deleted",
          status: "deleted",
          title: "Deleted",
          syncInboxId: "sync-deleted",
          xmtpGroupId: "xmtp-deleted",
        },
        {},
      ),
    ];
    const { channel, sent } = setupChannel({ groups });

    await channel.handleMessage(
      makeMessage({
        contentType: ContentTypeListGroupsRequest,
        content: {},
      }),
    );

    const decoded = decodeSent(sent);
    const payload = decoded[0].content as ListGroupsResponsePayload;
    expect(payload.groups).toEqual([
      {
        groupId: "g-1",
        title: "Example",
        description: "This is a test group description",
        mediaUrl: "https://example.com/media/test.jpg",
        thumbnailUrl: "https://example.com/media/thumb.jpg",
        languages: ["en", "ko"],
        syncInboxId: "sync-1",
        memberCount: 1,
        maxMembers: 10,
        availableSeats: 9,
        joinPolicy: "H_ONLY",
        isMember: true,
        conversationId: "xmtp-1",
        senders: [
          {
            inboxId: "inbox-alice",
            name: "alice",
            role: "H",
            walletAddress: "0x1111111111111111111111111111111111111111",
            humanId: "human-1",
            agentId: null,
            verificationLevel: "human",
          },
          {
            inboxId: "sync-1",
            name: "Kharisma",
            role: "A",
            walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            humanId: null,
            agentId: null,
            verificationLevel: "none",
          },
        ],
      },
      {
        groupId: "g-2",
        title: "Other",
        description: "Another test group for testing",
        mediaUrl: "https://example.com/media/test2.jpg",
        thumbnailUrl: "https://example.com/media/thumb2.jpg",
        languages: ["fr"],
        syncInboxId: "sync-2",
        memberCount: 0,
        maxMembers: 20,
        availableSeats: 20,
        joinPolicy: "H_HA_AND_A",
        isMember: false,
        conversationId: null,
        senders: [],
      },
    ]);
  });

  test("HA cannot create a group", async () => {
    const verification = makeVerificationService({
      authenticateHello: vi.fn(() => ({
        ok: true as const,
        status: {
          walletAddress: "0x2222222222222222222222222222222222222222",
          inboxId: "inbox-bot",
          status: "HA",
          verificationLevel: "human-agent",
          humanId: "human-1",
          agentId: "agent-1",
          handle: "bot-1",
          identityKey: "identity-2",
        },
      })),
    });
    const createGroup = vi.fn();
    const { channel, sent } = setupChannel({
      verification,
      createGroup: createGroup as unknown as GroupManager["createGroup"],
    });

    await channel.handleMessage(
      makeMessage({
        contentType: ContentTypeHello,
        content: {
          role: "HA",
          walletAddress: "0x2222222222222222222222222222222222222222",
        },
        senderInboxId: "inbox-bot",
      }),
    );
    await channel.handleMessage(
      makeMessage({
        contentType: ContentTypeCreateGroupRequest,
        content: {
          title: "example",
          description: "This is a test group description",
          mediaUrl: "https://example.com/media/test.jpg",
          thumbnailUrl: "https://example.com/media/thumb.jpg",
          languages: ["en"],
          joinPolicy: "H_AND_HA",
          maxMembers: 10,
        },
        senderInboxId: "inbox-bot",
      }),
    );

    const decoded = decodeSent(sent);
    expect(decoded).toHaveLength(1);
    expect((decoded[0].content as ProtocolError).code).toBe("unauthorized-role");
    expect(createGroup).not.toHaveBeenCalled();
  });

  test("H can create a group with join policy and member cap", async () => {
    const createGroup = vi.fn(
      async (input: Parameters<GroupManager["createGroup"]>[0]) => ({
      record: {
        groupId: "g-new",
        status: "active",
        title: input.title,
        description: input.description,
        mediaUrl: input.mediaUrl,
        thumbnailUrl: input.thumbnailUrl,
        languages: input.languages,
        joinPolicy: input.joinPolicy,
        maxMembers: input.maxMembers,
        encryptedPrivateKey: "v1.x.x.x",
        syncInboxId: "sync-new",
        xmtpGroupId: "xmtp-new",
        members: input.creator ? { [input.creator.inboxId]: input.creator } : {},
        createdAt: new Date(0).toISOString(),
      },
      client: {} as KharismaClient,
      }),
    );
    const { channel, sent } = setupChannel({
      createGroup: createGroup as unknown as GroupManager["createGroup"],
    });

    await channel.handleMessage(
      makeMessage({
        contentType: ContentTypeHello,
        content: {
          role: "H",
          walletAddress: "0x1111111111111111111111111111111111111111",
        },
      }),
    );
    await channel.handleMessage(
      makeMessage({
        contentType: ContentTypeCreateGroupRequest,
        content: {
          title: "example",
          description: "This is a test group description",
          mediaUrl: "https://example.com/media/test.jpg",
          thumbnailUrl: "https://example.com/media/thumb.jpg",
          languages: ["EN", "ko", "en"],
          joinPolicy: "H_AND_HA",
          maxMembers: 42,
        },
      }),
    );

    expect(createGroup).toHaveBeenCalledWith({
      title: "example",
      description: "This is a test group description",
      mediaUrl: "https://example.com/media/test.jpg",
      thumbnailUrl: "https://example.com/media/thumb.jpg",
      languages: ["en", "ko"],
      joinPolicy: "H_AND_HA",
      maxMembers: 42,
      creator: expect.objectContaining({
        inboxId: "inbox-alice",
        walletAddress: "0x1111111111111111111111111111111111111111",
        name: "creator",
        role: "H",
        verificationLevel: "human",
        humanId: "human-1",
      }),
    });

    const decoded = decodeSent(sent);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].type).toBe("kharisma.xyz/create-group-response");
    expect(decoded[0].content).toEqual({
      status: "ok",
      groupId: "g-new",
      syncInboxId: "sync-new",
      conversationId: "xmtp-new",
    });
  });
});
