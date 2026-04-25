import { describe, expect, it } from "vitest";
import {
  CreateGroupRequestCodec,
  CreateGroupResponseCodec,
  ErrorCodec,
  HelloCodec,
  HumanAgentSubmitCodec,
  HumanSubmitCodec,
  IdentitySubmitCodec,
  InvestmentRecordedCodec,
  JoinRequestCodec,
  JoinResponseCodec,
  ListGroupsRequestCodec,
  ListGroupsResponseCodec,
  MemberJoinedCodec,
  SkillRequestCodec,
  SkillResponseCodec,
  ThreadCatalogRequestCodec,
  ThreadCatalogResponseCodec,
  ThreadCreateCodec,
  VerificationAckCodec,
  WalletStatusRequestCodec,
  WalletStatusResponseCodec,
  allCodecs,
} from "./index.js";
import {
  KHARISMA_AUTHORITY,
  ContentTypeHello,
  ContentTypeInvestmentRecorded,
  ContentTypeMemberJoined,
  ContentTypeThreadCreate,
} from "./ids.js";
import { contentTypeEquals } from "./helpers.js";
import type { HelloPayload } from "./main.js";
import type {
  CreateGroupRequestPayload,
  GroupSummary,
  ListGroupsRequestPayload,
  VerificationAckPayload,
} from "./main.js";
import type { JoinRequestPayload, ThreadCatalogResponsePayload } from "./sync.js";
import type {
  InvestmentRecordedPayload,
  MemberJoinedPayload,
  ThreadCreatePayload,
} from "./group.js";

describe("content type IDs", () => {
  it("all use the kharisma.xyz authority and v1.0", () => {
    for (const codec of allCodecs) {
      expect(codec.contentType.authorityId).toBe(KHARISMA_AUTHORITY);
      expect(codec.contentType.versionMinor).toBe(0);
    }
  });

  it("match the names declared in SKILL.md", () => {
    const typeIds = allCodecs.map((c) => c.contentType.typeId).sort();
    expect(typeIds).toEqual(
      [
        "wallet-status-request",
        "wallet-status-response",
        "identity-submit",
        "human-submit",
        "human-agent-submit",
        "verification-ack",
        "hello",
        "skill-request",
        "skill-response",
        "list-groups-request",
        "list-groups-response",
        "create-group-request",
        "create-group-response",
        "error",
        "join-request",
        "join-response",
        "investment-config-request",
        "investment-config-response",
        "investment-submit",
        "investment-submit-response",
        "thread-catalog-request",
        "thread-catalog-response",
        "member-joined",
        "thread-create",
        "investment-recorded",
      ].sort(),
    );
  });
});

describe("codec round-trips", () => {
  it("HelloCodec preserves the payload", () => {
    const payload: HelloPayload = {
      role: "H",
      walletAddress: "0x1111111111111111111111111111111111111111",
    };
    const encoded = HelloCodec.encode(payload);
    expect(contentTypeEquals(encoded.type!, ContentTypeHello)).toBe(true);
    expect(HelloCodec.decode(encoded)).toEqual(payload);
  });

  it("JoinRequestCodec preserves the payload", () => {
    const payload: JoinRequestPayload = {
      groupId: "g1",
      walletAddress: "0x1111111111111111111111111111111111111111",
      name: "alice",
    };
    expect(JoinRequestCodec.decode(JoinRequestCodec.encode(payload))).toEqual(
      payload,
    );
  });

  it("ThreadCatalog codecs preserve the payload", () => {
    expect(
      ThreadCatalogRequestCodec.decode(
        ThreadCatalogRequestCodec.encode({ groupId: "g1" }),
      ),
    ).toEqual({ groupId: "g1" });

    const payload: ThreadCatalogResponsePayload = {
      status: "ok",
      groupId: "g1",
      conversationId: "conv-1",
      threads: [
        {
          threadId: "root-1",
          title: "Q2 deals",
          createdAt: "2026-04-22T09:00:00.000Z",
          createdBy: "alice",
          updatedAt: "2026-04-22T10:00:00.000Z",
        },
      ],
    };

    expect(
      ThreadCatalogResponseCodec.decode(
        ThreadCatalogResponseCodec.encode(payload),
      ),
    ).toEqual(payload);
  });

  it("Skill codecs preserve the payload", () => {
    expect(
      SkillRequestCodec.decode(SkillRequestCodec.encode({})),
    ).toEqual({});

    const payload = {
      status: "ok" as const,
      file: "SKILL.md" as const,
      mediaType: "text/markdown" as const,
      channel: {
        kind: "circle-sync" as const,
        groupId: "g1",
        title: "Example",
        syncInboxId: "sync-1",
        conversationId: "xmtp-1",
        joinPolicy: "H_AND_HA" as const,
        memberCount: 2,
        maxMembers: 10,
        availableSeats: 8,
        languages: ["en"],
        protocolVersion: "0.3.0",
      },
      content: "# Kharisma Protocol\n\n## Channel Context\n",
    };

    expect(
      SkillResponseCodec.decode(
        SkillResponseCodec.encode(payload),
      ),
    ).toEqual(payload);
  });

  it("round-trips the verification codecs", () => {
    expect(
      WalletStatusRequestCodec.decode(
        WalletStatusRequestCodec.encode({
          walletAddress: "0x1111111111111111111111111111111111111111",
        }),
      ),
    ).toEqual({
      walletAddress: "0x1111111111111111111111111111111111111111",
    });

    expect(
      WalletStatusResponseCodec.decode(
        WalletStatusResponseCodec.encode({
          walletAddress: "0x1111111111111111111111111111111111111111",
          status: "UNKNOWN",
          verificationLevel: "none",
          humanId: null,
          agentId: null,
          handle: null,
        }),
      ),
    ).toEqual({
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "UNKNOWN",
      verificationLevel: "none",
      humanId: null,
      agentId: null,
      handle: null,
    });

    expect(
      IdentitySubmitCodec.decode(
        IdentitySubmitCodec.encode({
          walletAddress: "0x1111111111111111111111111111111111111111",
          proof: { action: "identity" },
        }),
      ),
    ).toEqual({
      walletAddress: "0x1111111111111111111111111111111111111111",
      proof: { action: "identity" },
    });

    expect(
      HumanSubmitCodec.decode(
        HumanSubmitCodec.encode({
          walletAddress: "0x1111111111111111111111111111111111111111",
          handle: "alice",
          proof: { action: "human" },
        }),
      ),
    ).toEqual({
      walletAddress: "0x1111111111111111111111111111111111111111",
      handle: "alice",
      proof: { action: "human" },
    });

    expect(
      HumanAgentSubmitCodec.decode(
        HumanAgentSubmitCodec.encode({
          walletAddress: "0x1111111111111111111111111111111111111111",
          ownerHumanId: "human-1",
          handle: "agent1",
          proof: { action: "human-agent" },
        }),
      ),
    ).toEqual({
      walletAddress: "0x1111111111111111111111111111111111111111",
      ownerHumanId: "human-1",
      handle: "agent1",
      proof: { action: "human-agent" },
    });

    const ack: VerificationAckPayload = {
      action: "human",
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "ok",
      resolvedStatus: "H",
      verificationLevel: "human",
      humanId: "human-1",
      agentId: null,
      handle: "alice",
    };
    expect(VerificationAckCodec.decode(VerificationAckCodec.encode(ack))).toEqual(
      ack,
    );
  });

  it("ListGroupsRequestCodec preserves language filters", () => {
    const payload: ListGroupsRequestPayload = {
      languages: ["en", "ko"],
    };
    expect(
      ListGroupsRequestCodec.decode(ListGroupsRequestCodec.encode(payload)),
    ).toEqual(payload);
  });

  it("CreateGroupRequestCodec preserves group languages", () => {
    const payload: CreateGroupRequestPayload = {
      title: "Example",
      description: "This is a test group description",
      mediaUrl: "https://example.com/media/test.jpg",
      thumbnailUrl: "https://example.com/media/thumb.jpg",
      languages: ["en", "es"],
      joinPolicy: "H_ONLY",
      maxMembers: 25,
    };
    expect(
      CreateGroupRequestCodec.decode(CreateGroupRequestCodec.encode(payload)),
    ).toEqual(payload);
  });

  it("ListGroupsResponseCodec preserves group languages", () => {
    const group: GroupSummary = {
      groupId: "group-1",
      title: "Example",
      description: "This is a test group description",
      mediaUrl: "https://example.com/media/test.jpg",
      thumbnailUrl: "https://example.com/media/thumb.jpg",
      languages: ["en", "pt"],
      syncInboxId: "sync-1",
      memberCount: 1,
      maxMembers: 25,
      availableSeats: 24,
      joinPolicy: "H_ONLY",
      isMember: true,
      conversationId: "xmtp-group-1",
      senders: [],
    };
    expect(
      ListGroupsResponseCodec.decode(
        ListGroupsResponseCodec.encode({ groups: [group] }),
      ),
    ).toEqual({ groups: [group] });
  });

  it("MemberJoinedCodec preserves the payload", () => {
    const payload: MemberJoinedPayload = {
      name: "alice",
      inboxId: "inbox-1",
      joinedAt: "2026-04-10T12:00:00.000Z",
    };
    expect(
      MemberJoinedCodec.decode(MemberJoinedCodec.encode(payload)),
    ).toEqual(payload);
  });

  it("ThreadCreateCodec preserves the payload", () => {
    const payload: ThreadCreatePayload = {
      title: "Q2 deal review",
      createdAt: "2026-04-22T09:30:00.000Z",
    };
    const encoded = ThreadCreateCodec.encode(payload);
    expect(contentTypeEquals(encoded.type!, ContentTypeThreadCreate)).toBe(
      true,
    );
    expect(ThreadCreateCodec.decode(encoded)).toEqual(payload);
  });

  it("InvestmentRecordedCodec preserves the payload", () => {
    const payload: InvestmentRecordedPayload = {
      groupId: "group-1",
      investorInboxId: "inbox-1",
      investorWalletAddress: "0x1111111111111111111111111111111111111111",
      token: "USDC",
      tokenAddress: "0x2222222222222222222222222222222222222222",
      amount: "25000000",
      decimals: 6,
      destinationAddress: "0x3333333333333333333333333333333333333333",
      chainId: 480,
      txHash:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      recordedAt: "2026-04-23T12:00:00.000Z",
    };
    const encoded = InvestmentRecordedCodec.encode(payload);
    expect(
      contentTypeEquals(encoded.type!, ContentTypeInvestmentRecorded),
    ).toBe(true);
    expect(InvestmentRecordedCodec.decode(encoded)).toEqual(payload);
  });

  it("covers the simple control codecs", () => {
    expect(
      ListGroupsRequestCodec.decode(ListGroupsRequestCodec.encode({})),
    ).toEqual({});

    const listResp = ListGroupsResponseCodec.encode({
      groups: [
        {
          groupId: "g1",
          title: "example",
          description: "This is a test group for codec testing",
          mediaUrl: "https://example.com/media/test.jpg",
          thumbnailUrl: "https://example.com/media/thumb.jpg",
          languages: ["en"],
          syncInboxId: "inbox-g1",
          memberCount: 2,
          maxMembers: 25,
          availableSeats: 23,
          joinPolicy: "H_AND_HA",
          isMember: true,
          conversationId: "xmtp-g1",
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
          ],
        },
      ],
    });
    expect(ListGroupsResponseCodec.decode(listResp).groups).toHaveLength(1);

    const createReq = CreateGroupRequestCodec.encode({
      title: "example",
      description: "This is a test group description",
      mediaUrl: "https://example.com/media/test.jpg",
      thumbnailUrl: "https://example.com/media/thumb.jpg",
      languages: ["en"],
      joinPolicy: "H_ONLY",
      maxMembers: 25,
    });
    expect(CreateGroupRequestCodec.decode(createReq).title).toBe("example");

    const createResp = CreateGroupResponseCodec.encode({
      status: "ok",
      groupId: "g1",
      syncInboxId: "inbox-g1",
      conversationId: "xmtp-g1",
    });
    const decodedResp = CreateGroupResponseCodec.decode(createResp);
    expect(decodedResp.status).toBe("ok");

    const err = ErrorCodec.encode({ code: "malformed", message: "bad" });
    expect(ErrorCodec.decode(err)).toEqual({
      code: "malformed",
      message: "bad",
    });

    expect(
      JoinResponseCodec.decode(
        JoinResponseCodec.encode({
          status: "ok",
          groupId: "g1",
          name: "alice",
          conversationId: "xmtp-g1",
        }),
      ),
    ).toEqual({
      status: "ok",
      groupId: "g1",
      name: "alice",
      conversationId: "xmtp-g1",
    });
  });
});

describe("fallbacks and shouldPush", () => {
  it("MemberJoinedCodec returns a human-readable text fallback", () => {
    expect(
      MemberJoinedCodec.fallback({
        name: "alice",
        inboxId: "inbox-1",
        joinedAt: "2026-04-10T12:00:00.000Z",
      }),
    ).toBe("alice joined the group");
  });

  it("MemberJoinedCodec pushes notifications", () => {
    expect(
      MemberJoinedCodec.shouldPush({
        name: "alice",
        inboxId: "inbox-1",
        joinedAt: "2026-04-10T12:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("control codecs do not push and have no fallback", () => {
    expect(HelloCodec.shouldPush({} as HelloPayload)).toBe(false);
    expect(HelloCodec.fallback({} as HelloPayload)).toBeUndefined();
    expect(ErrorCodec.shouldPush({ code: "malformed", message: "x" })).toBe(
      false,
    );
  });

  it("ThreadCreateCodec returns a human-readable text fallback", () => {
    expect(
      ThreadCreateCodec.fallback({
        title: "Q2 deal review",
        createdAt: "2026-04-22T09:30:00.000Z",
      }),
    ).toBe("Thread: Q2 deal review");
  });

  it("ThreadCreateCodec pushes notifications", () => {
    expect(
      ThreadCreateCodec.shouldPush({
        title: "Q2 deal review",
        createdAt: "2026-04-22T09:30:00.000Z",
      }),
    ).toBe(true);
  });

  it("InvestmentRecordedCodec returns a human-readable text fallback", () => {
    expect(
      InvestmentRecordedCodec.fallback({
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
      }),
    ).toBe("0x1111111111111111111111111111111111111111 invested 1 WLD");
  });

  it("InvestmentRecordedCodec formats fractional base-unit amounts in fallback text", () => {
    expect(
      InvestmentRecordedCodec.fallback({
        groupId: "group-1",
        investorInboxId: "inbox-1",
        investorWalletAddress: "0x1111111111111111111111111111111111111111",
        token: "USDC",
        tokenAddress: "0x2222222222222222222222222222222222222222",
        amount: "25000000",
        decimals: 6,
        destinationAddress: "0x3333333333333333333333333333333333333333",
        chainId: 480,
        txHash:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        recordedAt: "2026-04-23T12:00:00.000Z",
      }),
    ).toBe("0x1111111111111111111111111111111111111111 invested 25 USDC");
  });

  it("InvestmentRecordedCodec pushes notifications", () => {
    expect(
      InvestmentRecordedCodec.shouldPush({
        groupId: "group-1",
        investorInboxId: "inbox-1",
        investorWalletAddress: "0x1111111111111111111111111111111111111111",
        token: "USDC",
        tokenAddress: "0x2222222222222222222222222222222222222222",
        amount: "25000000",
        decimals: 6,
        destinationAddress: "0x3333333333333333333333333333333333333333",
        chainId: 480,
        txHash:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        recordedAt: "2026-04-23T12:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("encoded MemberJoined carries the fallback string on the wire", () => {
    const encoded = MemberJoinedCodec.encode({
      name: "alice",
      inboxId: "inbox-1",
      joinedAt: "2026-04-10T12:00:00.000Z",
    });
    expect(encoded.fallback).toBe("alice joined the group");
    expect(contentTypeEquals(encoded.type!, ContentTypeMemberJoined)).toBe(
      true,
    );
  });
});
