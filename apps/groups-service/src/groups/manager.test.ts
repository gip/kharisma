import { describe, expect, test, vi } from "vitest";
import type { GroupsConfig } from "../config.js";
import type { AppLogger } from "../logging.js";
import type { GroupStore } from "../storage/store.js";
import type { GroupRecord, MemberRecord } from "../storage/schema.js";
import { GroupManager } from "./manager.js";

const addMembersMock = vi.fn();
const createGroupOptimisticMock = vi.fn();
const createLocalClientMock = vi.fn();

vi.mock("../xmtp/client.js", () => ({
  createLocalClient: (...args: unknown[]) => createLocalClientMock(...args),
  groupDbPath: (_config: unknown, groupId: string) => `/tmp/${groupId}.db3`,
}));

const silentLogger: AppLogger = {
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

const config = {
  groupsXmtpDir: "/tmp/groups",
} as GroupsConfig;

describe("GroupManager", () => {
  const activeRecord: GroupRecord = {
    groupId: "active",
    status: "active",
    title: "Active",
    description: "This is an active test group",
    mediaUrl: "https://example.com/media/test.jpg",
    thumbnailUrl: "https://example.com/media/thumb.jpg",
    languages: ["en"],
    joinPolicy: "H_ONLY",
    joinApproval: "NONE",
    maxMembers: 10,
    encryptedPrivateKey: "v1.active",
    syncInboxId: "sync-active",
    xmtpGroupId: "xmtp-active",
    members: {},
    createdAt: new Date(0).toISOString(),
  };
  const deletedRecord: GroupRecord = {
    ...activeRecord,
    groupId: "deleted",
    status: "deleted",
    title: "Deleted",
    encryptedPrivateKey: "v1.deleted",
    syncInboxId: "sync-deleted",
    xmtpGroupId: "xmtp-deleted",
  };

  test("createGroup persists the creator and adds them to the MLS group", async () => {
    const putGroup = vi.fn();
    const store = {
      sealPrivateKey: vi.fn(() => "v1.sealed"),
      putGroup,
    } as unknown as GroupStore;
    const creator: MemberRecord = {
      inboxId: "inbox-alice",
      name: "creator",
      role: "H",
      joinedAt: new Date(0).toISOString(),
      nullifierHash: "0xnull",
    };

    addMembersMock.mockReset();
    createGroupOptimisticMock.mockReset();
    createLocalClientMock.mockReset();
    createGroupOptimisticMock.mockReturnValue({
      id: "xmtp-group-1",
      addMembers: addMembersMock,
    });
    createLocalClientMock.mockResolvedValue({
      client: {
        inboxId: "sync-inbox-1",
        conversations: {
          createGroupOptimistic: createGroupOptimisticMock,
        },
      },
    });

    const manager = new GroupManager(config, store, silentLogger);
    const managed = await manager.createGroup({
      title: "Example",
      description: "This is a test group description",
      mediaUrl: "https://example.com/media/test.jpg",
      thumbnailUrl: "https://example.com/media/thumb.jpg",
      languages: ["en", "ko"],
      joinPolicy: "H_ONLY",
      joinApproval: "NONE",
      maxMembers: 10,
      creator,
    });

    expect(addMembersMock).toHaveBeenCalledWith(["inbox-alice"]);
    expect(managed.record.members).toEqual({
      "inbox-alice": creator,
    });
    expect(putGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Example",
        status: "active",
        languages: ["en", "ko"],
        syncInboxId: "sync-inbox-1",
        xmtpGroupId: "xmtp-group-1",
        members: {
          "inbox-alice": creator,
        },
      }),
    );
  });

  test("rehydrate only starts active groups", async () => {
    const store = {
      listGroups: vi.fn(() => [activeRecord]),
      openPrivateKey: vi.fn(() => "0x1111111111111111111111111111111111111111111111111111111111111111"),
    } as unknown as GroupStore;
    createLocalClientMock.mockReset();
    createLocalClientMock.mockResolvedValue({
      client: {
        inboxId: "sync-active",
      },
      address: "0x9999999999999999999999999999999999999999",
    });

    const manager = new GroupManager(config, store, silentLogger);
    await manager.rehydrate();

    expect(createLocalClientMock).toHaveBeenCalledTimes(1);
    expect(manager.get("active")?.record.groupId).toBe("active");
    expect(manager.get("deleted")).toBeUndefined();
  });

  test("accessors hide deleted managed groups", async () => {
    const store = {
      listGroups: vi.fn(() => [activeRecord, deletedRecord]),
      openPrivateKey: vi.fn(() => "0x1111111111111111111111111111111111111111111111111111111111111111"),
    } as unknown as GroupStore;
    createLocalClientMock.mockReset();
    createLocalClientMock
      .mockResolvedValueOnce({
        client: { inboxId: "sync-active" },
        address: "0x9999999999999999999999999999999999999999",
      })
      .mockResolvedValueOnce({
        client: { inboxId: "sync-deleted" },
        address: "0x9999999999999999999999999999999999999999",
      });

    const manager = new GroupManager(config, store, silentLogger);
    await manager.rehydrate();

    expect(manager.all().map((managed) => managed.record.groupId)).toEqual([
      "active",
    ]);
    expect(manager.get("deleted")).toBeUndefined();
    expect(manager.getBySyncInboxId("sync-deleted")).toBeUndefined();
  });
});
