import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Hex } from "viem";
import type { GroupRecord } from "./schema.js";
import { GroupStore } from "./store.js";

const KEY_HEX =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

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
    maxMembers: 25,
    encryptedPrivateKey: "v1.x.x.x",
    syncInboxId: "inbox-sync-1",
    xmtpGroupId: "xmtp-group-1",
    members: {},
    createdAt: new Date(0).toISOString(),
    ...override,
  };
}

describe("GroupStore", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "groups-store-"));
    dbPath = path.join(dir, "groups.db");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("fresh database yields an empty group list", () => {
    const store = new GroupStore(dbPath, KEY_HEX);
    expect(store.listGroups()).toEqual([]);
    store.close();
  });

  test("putGroup persists and listGroups returns it", () => {
    const store = new GroupStore(dbPath, KEY_HEX);
    const record = makeRecord();
    store.putGroup(record);

    expect(store.listGroups()).toEqual([record]);
    store.close();

    // Reopen to verify persistence.
    const reopened = new GroupStore(dbPath, KEY_HEX);
    expect(reopened.listGroups()).toEqual([record]);
    reopened.close();
  });

  test("putGroup defaults new persisted groups to active status", () => {
    const store = new GroupStore(dbPath, KEY_HEX);
    const record = makeRecord();
    store.putGroup(record);

    expect(store.getGroup("g-1")?.status).toBe("active");
    expect(store.listGroups()).toEqual([record]);
    store.close();
  });

  test("putGroup persists multiple languages and reopens them", () => {
    const store = new GroupStore(dbPath, KEY_HEX);
    const record = makeRecord({ languages: ["en", "ko"] });
    store.putGroup(record);
    store.close();

    const reopened = new GroupStore(dbPath, KEY_HEX);
    expect(reopened.getGroup("g-1")?.languages).toEqual(["en", "ko"]);
    reopened.close();
  });

  test("schema reset drops incompatible old data", () => {
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      INSERT INTO schema_meta (key, value)
      VALUES ('schema_version', '1');

      CREATE TABLE groups (
        group_id              TEXT PRIMARY KEY,
        title                 TEXT NOT NULL,
        description           TEXT NOT NULL DEFAULT '',
        media_url             TEXT NOT NULL DEFAULT '',
        thumbnail_url         TEXT NOT NULL DEFAULT '',
        encrypted_private_key TEXT NOT NULL,
        sync_inbox_id         TEXT NOT NULL,
        xmtp_group_id         TEXT NOT NULL,
        created_at            TEXT NOT NULL
      );

      INSERT INTO groups
        (group_id, title, description, media_url, thumbnail_url, encrypted_private_key, sync_inbox_id, xmtp_group_id, created_at)
      VALUES
        ('g-old', 'Old', 'Old group description', '', '', 'v1.x.x.x', 'sync-old', 'xmtp-old', '1970-01-01T00:00:00.000Z');
    `);
    db.close();

    const store = new GroupStore(dbPath, KEY_HEX);
    expect(store.listGroups()).toEqual([]);
    store.close();
  });

  test("v4 database migration adds active status without dropping groups", () => {
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      INSERT INTO schema_meta (key, value)
      VALUES ('schema_version', '4');

      CREATE TABLE groups (
        group_id              TEXT PRIMARY KEY,
        title                 TEXT NOT NULL,
        description           TEXT NOT NULL DEFAULT '',
        media_url             TEXT NOT NULL DEFAULT '',
        thumbnail_url         TEXT NOT NULL DEFAULT '',
        join_policy           TEXT NOT NULL,
        max_members           INTEGER NOT NULL,
        encrypted_private_key TEXT NOT NULL,
        sync_inbox_id         TEXT NOT NULL,
        xmtp_group_id         TEXT NOT NULL,
        created_at            TEXT NOT NULL
      );

      INSERT INTO groups
        (group_id, title, description, media_url, thumbnail_url, join_policy, max_members, encrypted_private_key, sync_inbox_id, xmtp_group_id, created_at)
      VALUES
        ('g-old', 'Old', 'Old group description', '', '', 'H_ONLY', 10, 'v1.x.x.x', 'sync-old', 'xmtp-old', '1970-01-01T00:00:00.000Z');
    `);
    db.close();

    const store = new GroupStore(dbPath, KEY_HEX);
    expect(store.getGroup("g-old")).toMatchObject({
      groupId: "g-old",
      status: "active",
    });
    expect(store.listGroups().map((group) => group.groupId)).toEqual(["g-old"]);
    store.close();
  });

  test("listGroups excludes deleted groups while getGroup maps status", () => {
    const store = new GroupStore(dbPath, KEY_HEX);
    store.putGroup(makeRecord({ groupId: "active", syncInboxId: "sync-active" }));
    store.putGroup(
      makeRecord({
        groupId: "deleted",
        status: "deleted",
        syncInboxId: "sync-deleted",
      }),
    );

    expect(store.listGroups().map((group) => group.groupId)).toEqual(["active"]);
    expect(store.getGroup("deleted")?.status).toBe("deleted");
    store.close();
  });

  test("updateGroup mutates and persists", () => {
    const store = new GroupStore(dbPath, KEY_HEX);
    store.putGroup(makeRecord());

    const next = store.updateGroup("g-1", (current) => ({
      ...current,
      members: {
        "inbox-member-1": {
          inboxId: "inbox-member-1",
          walletAddress: "0x1111111111111111111111111111111111111111",
          name: "alice",
          role: "H",
          verificationLevel: "human",
          humanId: "human-1",
          joinedAt: new Date(0).toISOString(),
        },
      },
    }));

    expect(Object.keys(next.members)).toEqual(["inbox-member-1"]);

    // Reopen to verify persistence.
    const reopened = new GroupStore(dbPath, KEY_HEX);
    expect(reopened.getGroup("g-1")?.members["inbox-member-1"]?.name).toBe(
      "alice",
    );
    reopened.close();
    store.close();
  });

  test("updateGroup on unknown groupId throws", () => {
    const store = new GroupStore(dbPath, KEY_HEX);
    expect(() =>
      store.updateGroup("ghost", (current) => current),
    ).toThrow(/No such group/);
    store.close();
  });

  test("getGroupBySyncInboxId finds the right record", () => {
    const store = new GroupStore(dbPath, KEY_HEX);
    store.putGroup(makeRecord({ groupId: "a", syncInboxId: "alpha" }));
    store.putGroup(makeRecord({ groupId: "b", syncInboxId: "beta" }));

    expect(store.getGroupBySyncInboxId("beta")?.groupId).toBe("b");
    expect(store.getGroupBySyncInboxId("missing")).toBeUndefined();
    store.close();
  });

  test("sealPrivateKey / openPrivateKey round-trip", () => {
    const store = new GroupStore(dbPath, KEY_HEX);
    const plaintext: Hex =
      "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const sealed = store.sealPrivateKey(plaintext);
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain(plaintext.slice(2));
    expect(store.openPrivateKey(sealed)).toBe(plaintext);
    store.close();
  });

  test("openPrivateKey with wrong key fails", () => {
    const a = new GroupStore(dbPath, KEY_HEX);
    const sealed = a.sealPrivateKey(
      "0xabababababababababababababababababababababababababababababababab",
    );
    a.close();

    const badKey =
      "0x2222222222222222222222222222222222222222222222222222222222222222";
    const b = new GroupStore(dbPath, badKey);
    expect(() => b.openPrivateKey(sealed)).toThrow();
    b.close();
  });

  test("putGroup replaces existing members atomically", () => {
    const store = new GroupStore(dbPath, KEY_HEX);
    store.putGroup(
      makeRecord({
        members: {
          "inbox-a": {
            inboxId: "inbox-a",
            walletAddress: "0x1111111111111111111111111111111111111111",
            name: "alice",
            role: "H",
            verificationLevel: "human",
            humanId: "human-1",
            joinedAt: new Date(0).toISOString(),
          },
        },
      }),
    );

    // Replace with a different member set.
    store.putGroup(
      makeRecord({
        members: {
          "inbox-b": {
            inboxId: "inbox-b",
            walletAddress: "0x2222222222222222222222222222222222222222",
            name: "bob",
            role: "HA",
            verificationLevel: "human-agent",
            humanId: "human-1",
            agentId: "agent-1",
            joinedAt: new Date(1000).toISOString(),
          },
        },
      }),
    );

    const group = store.getGroup("g-1");
    expect(group).toBeDefined();
    expect(Object.keys(group!.members)).toEqual(["inbox-b"]);
    expect(group!.members["inbox-b"]?.name).toBe("bob");
    store.close();
  });

  test("recordInvestment records once and rejects duplicate credit", () => {
    const store = new GroupStore(dbPath, KEY_HEX);
    store.putGroup(
      makeRecord({
        members: {
          "inbox-a": {
            inboxId: "inbox-a",
            walletAddress: "0x1111111111111111111111111111111111111111",
            name: "alice",
            role: "H",
            verificationLevel: "human",
            humanId: "human-1",
            joinedAt: new Date(0).toISOString(),
          },
        },
      }),
    );

    const first = store.recordInvestment({
      groupId: "g-1",
      investorInboxId: "inbox-a",
      investorWalletAddress: "0x1111111111111111111111111111111111111111",
      token: "USDC",
      tokenAddress: "0x2222222222222222222222222222222222222222",
      amount: "25000000",
      decimals: 6,
      destinationAddress: "0x3333333333333333333333333333333333333333",
      chainId: 480,
      txHash:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      logIndex: 7,
      recordedAt: "2026-04-23T12:00:00.000Z",
    });
    expect(first.status).toBe("recorded");

    const duplicate = store.recordInvestment({
      groupId: "g-1",
      investorInboxId: "inbox-a",
      investorWalletAddress: "0x1111111111111111111111111111111111111111",
      token: "USDC",
      tokenAddress: "0x2222222222222222222222222222222222222222",
      amount: "25000000",
      decimals: 6,
      destinationAddress: "0x3333333333333333333333333333333333333333",
      chainId: 480,
      txHash:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      logIndex: 7,
      recordedAt: "2026-04-23T12:01:00.000Z",
    });

    expect(duplicate.status).toBe("already-recorded");
    expect(store.listInvestments("g-1")).toHaveLength(1);
    expect(store.listInvestmentBalances("g-1")).toMatchObject([
      {
        groupId: "g-1",
        investorInboxId: "inbox-a",
        token: "USDC",
        amount: "25000000",
      },
    ]);
    store.close();
  });

  test("recordInvestment aggregates balances by group, user, chain, and token", () => {
    const store = new GroupStore(dbPath, KEY_HEX);
    store.putGroup(
      makeRecord({
        members: {
          "inbox-a": {
            inboxId: "inbox-a",
            walletAddress: "0x1111111111111111111111111111111111111111",
            name: "alice",
            role: "H",
            verificationLevel: "human",
            humanId: "human-1",
            joinedAt: new Date(0).toISOString(),
          },
        },
      }),
    );

    for (const [txHash, amount] of [
      [
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "10",
      ],
      [
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "15",
      ],
    ] as const) {
      store.recordInvestment({
        groupId: "g-1",
        investorInboxId: "inbox-a",
        investorWalletAddress: "0x1111111111111111111111111111111111111111",
        token: "WLD",
        tokenAddress: "0x2222222222222222222222222222222222222222",
        amount,
        decimals: 18,
        destinationAddress: "0x3333333333333333333333333333333333333333",
        chainId: 480,
        txHash,
        logIndex: 0,
        recordedAt: "2026-04-23T12:00:00.000Z",
      });
    }

    expect(store.listInvestmentBalancesForInvestor("g-1", "inbox-a")).toMatchObject([
      {
        groupId: "g-1",
        investorInboxId: "inbox-a",
        token: "WLD",
        amount: "25",
      },
    ]);
    expect(store.listInvestmentTotals("g-1")).toMatchObject([
      {
        groupId: "g-1",
        token: "WLD",
        amount: "25",
      },
    ]);
    store.close();
  });
});
