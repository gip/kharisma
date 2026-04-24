import { describe, expect, test, vi } from "vitest";
import type { GroupsConfig } from "../config.js";
import type { AppLogger } from "../logging.js";
import type { GroupStore } from "../storage/store.js";
import type { MemberRecord } from "../storage/schema.js";
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
      creator,
    });

    expect(addMembersMock).toHaveBeenCalledWith(["inbox-alice"]);
    expect(managed.record.members).toEqual({
      "inbox-alice": creator,
    });
    expect(putGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Example",
        languages: ["en", "ko"],
        syncInboxId: "sync-inbox-1",
        xmtpGroupId: "xmtp-group-1",
        members: {
          "inbox-alice": creator,
        },
      }),
    );
  });
});
