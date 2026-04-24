import {
  summarizeConversations,
  summarizeDms,
  summarizeGroups,
} from "./conversation-summary";

describe("conversation summaries", () => {
  it("maps EOA-style DMs with peer inbox identifiers", async () => {
    const chats = await summarizeDms([
      {
        id: "dm-1",
        createdAtNs: "1700000000000000000",
        peerInboxId: vi.fn().mockResolvedValue("peer-inbox"),
      },
    ]);

    expect(chats).toEqual([
      {
        id: "dm-1",
        kind: "dm",
        title: "DM with peer-inbox",
        peerInboxId: "peer-inbox",
        memberCount: null,
        lastActivityAt: new Date("2023-11-14T22:13:20.000Z"),
        createdAt: new Date("2023-11-14T22:13:20.000Z"),
      },
    ]);
  });

  it("falls back cleanly for untitled groups and missing activity", async () => {
    const chats = await summarizeGroups([
      {
        id: "group-1",
        name: "",
      },
    ]);

    expect(chats).toEqual([
      {
        id: "group-1",
        kind: "group",
        title: "Untitled group",
        peerInboxId: null,
        memberCount: null,
        lastActivityAt: null,
        createdAt: null,
      },
    ]);
  });

  it("merges and sorts groups and DMs by last activity", async () => {
    const chats = await summarizeConversations({
      dms: [
        {
          id: "dm-1",
          createdAtNs: "1700000000000000000",
          peerInboxId: vi.fn().mockResolvedValue("peer-inbox"),
        },
      ],
      groups: [
        {
          id: "group-1",
          name: "Group",
          createdAtNs: "1800000000000000000",
          members: vi.fn().mockResolvedValue(["a", "b", "c"]),
        },
      ],
    });

    expect(chats.map((chat) => chat.id)).toEqual(["group-1", "dm-1"]);
    expect(chats[0]?.memberCount).toBe(3);
  });
});
