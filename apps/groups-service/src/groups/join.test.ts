import { describe, expect, test, vi } from "vitest";
import type { AppLogger } from "../logging.js";
import type { GroupRecord, MemberRecord } from "../storage/schema.js";
import type { VerificationService } from "../verification/service.js";
import type { KharismaClient } from "../xmtp/client.js";
import type { GroupManager, ManagedGroup } from "./manager.js";
import { handleJoinRequest } from "./join.js";

const silentLogger: AppLogger = {
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

function makeRecord(override: Partial<GroupRecord> = {}): GroupRecord {
  return {
    groupId: "g-1",
    title: "Example",
    description: "This is a test group description",
    mediaUrl: "https://example.com/media/test.jpg",
    thumbnailUrl: "https://example.com/media/thumb.jpg",
    languages: ["en"],
    joinPolicy: "H_ONLY",
    maxMembers: 10,
    encryptedPrivateKey: "v1.x.x.x",
    syncInboxId: "per-group-inbox",
    xmtpGroupId: "xmtp-group-1",
    members: {},
    createdAt: new Date(0).toISOString(),
    ...override,
  };
}

function makeVerification(statusOverride: Partial<ReturnType<
  VerificationService["resolveSenderStatus"]
>> = {}): VerificationService {
  return {
    resolveSenderStatus: vi.fn(() => ({
      walletAddress: "0x1111111111111111111111111111111111111111",
      inboxId: "inbox-alice",
      status: "H",
      verificationLevel: "human",
      humanId: "human-1",
      agentId: null,
      handle: "alice",
      identityKey: "identity-1",
      ...statusOverride,
    })),
  } as unknown as VerificationService;
}

function setup(
  recordOverride: Partial<GroupRecord> = {},
  statusOverride: Partial<ReturnType<VerificationService["resolveSenderStatus"]>> = {},
) {
  let record = makeRecord(recordOverride);
  const addMembers = vi.fn(async (_ids: string[]) => {});

  const fakeGroup = {
    id: "xmtp-group-1",
    addMembers,
  };

  const client = {
    inboxId: "per-group-inbox",
    conversations: {
      async getConversationById(id: string) {
        return id === "xmtp-group-1" ? fakeGroup : undefined;
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

  return {
    managed,
    manager,
    addMembers,
    getRecord: () => record,
    verification: makeVerification(statusOverride),
  };
}

describe("handleJoinRequest", () => {
  test("adds a verified H member using the canonical stored handle", async () => {
    const { managed, manager, addMembers, getRecord, verification } = setup();

    const outcome = await handleJoinRequest({
      request: {
        groupId: "g-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
      },
      senderInboxId: "inbox-alice",
      managed,
      manager,
      verification,
      logger: silentLogger,
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.member).toMatchObject({
        inboxId: "inbox-alice",
        walletAddress: "0x1111111111111111111111111111111111111111",
        name: "alice",
        role: "H",
        verificationLevel: "human",
        humanId: "human-1",
      });
    }
    expect(addMembers).toHaveBeenCalledWith(["inbox-alice"]);
    expect(getRecord().members["inbox-alice"]?.name).toBe("alice");
  });

  test("rejects a guest join without a valid local name", async () => {
    const { managed, manager, verification } = setup(
      { joinPolicy: "H_HA_AND_A" },
      {
        status: "UNKNOWN",
        verificationLevel: "none",
        humanId: null,
        handle: null,
        identityKey: null,
      },
    );

    const outcome = await handleJoinRequest({
      request: {
        groupId: "g-1",
        walletAddress: "0x3333333333333333333333333333333333333333",
        name: "ab",
      },
      senderInboxId: "inbox-guest",
      managed,
      manager,
      verification,
      logger: silentLogger,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe("name-invalid");
    }
  });

  test("rejects a second wallet for the same human in one group", async () => {
    const existing: MemberRecord = {
      inboxId: "inbox-prior",
      walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      name: "prior",
      role: "H",
      verificationLevel: "human",
      humanId: "human-1",
      joinedAt: new Date(0).toISOString(),
    };
    const { managed, manager, addMembers, verification } = setup({
      members: { "inbox-prior": existing },
    });

    const outcome = await handleJoinRequest({
      request: {
        groupId: "g-1",
        walletAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
      senderInboxId: "inbox-alice-2",
      managed,
      manager,
      verification,
      logger: silentLogger,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe("already-member");
    }
    expect(addMembers).not.toHaveBeenCalled();
  });

  test("rejects unverified senders for restricted groups", async () => {
    const { managed, manager, verification } = setup(
      { joinPolicy: "H_AND_HA" },
      {
        status: "UNKNOWN",
        verificationLevel: "none",
        humanId: null,
        agentId: null,
        handle: null,
        identityKey: null,
      },
    );

    const outcome = await handleJoinRequest({
      request: {
        groupId: "g-1",
        walletAddress: "0x3333333333333333333333333333333333333333",
      },
      senderInboxId: "inbox-guest",
      managed,
      manager,
      verification,
      logger: silentLogger,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe("verification-required");
    }
  });

  test("returns group-full when the member cap has been reached", async () => {
    const existing: MemberRecord = {
      inboxId: "inbox-prior",
      walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      name: "alice",
      role: "H",
      verificationLevel: "human",
      humanId: "human-1",
      joinedAt: new Date(0).toISOString(),
    };
    const { managed, manager, verification } = setup({
      maxMembers: 1,
      members: { "inbox-prior": existing },
    });

    const outcome = await handleJoinRequest({
      request: {
        groupId: "g-1",
        walletAddress: "0x2222222222222222222222222222222222222222",
      },
      senderInboxId: "inbox-bob",
      managed,
      manager,
      verification,
      logger: silentLogger,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe("group-full");
    }
  });
});
