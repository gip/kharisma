import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  isGroupJoinPolicy,
  isGroupJoinApproval,
  isRole,
  isVerificationLevel,
  normalizeGroupLanguageCode,
  type GroupLanguageCode,
} from "@kharisma/protocol";
import { getAddress, type Hex } from "viem";
import { SecretBox } from "./crypto.js";
import type {
  GroupRecord,
  InvestmentBalanceRecord,
  InvestmentRecord,
  InvestmentTotalRecord,
  HumanAgentRecord,
  HumanRecord,
  MemberRecord,
  GroupThreadRecord,
  PendingJoinRecord,
  WalletStatusRecord,
} from "./schema.js";

const TARGET_SCHEMA_VERSION = 6;

function normalizeWalletAddress(address: string): string {
  return getAddress(address).toLowerCase();
}

function rowToWalletStatus(row: Record<string, unknown>): WalletStatusRecord {
  return {
    walletAddress: normalizeWalletAddress(String(row.wallet_address)),
    inboxId: row.inbox_id ? String(row.inbox_id) : null,
    status: String(row.status) as WalletStatusRecord["status"],
    verificationLevel: String(
      row.verification_level,
    ) as WalletStatusRecord["verificationLevel"],
    humanId: row.human_id ? String(row.human_id) : null,
    agentId: row.agent_id ? String(row.agent_id) : null,
    handle: row.handle ? String(row.handle) : null,
    identityKey: row.identity_key ? String(row.identity_key) : null,
  };
}

function rowToHumanRecord(
  row: Record<string, unknown>,
  walletAddresses: string[],
  inboxIds: string[],
): HumanRecord {
  return {
    humanId: String(row.human_id),
    identityKey: String(row.identity_key),
    handle: String(row.handle),
    verifiedAt: String(row.verified_at),
    walletAddresses,
    inboxIds,
  };
}

function rowToHumanAgentRecord(row: Record<string, unknown>): HumanAgentRecord {
  return {
    agentId: String(row.agent_id),
    humanId: String(row.human_id),
    identityKey: String(row.identity_key),
    handle: String(row.handle),
    walletAddress: normalizeWalletAddress(String(row.wallet_address)),
    inboxId: String(row.inbox_id),
    verifiedAt: String(row.verified_at),
  };
}

function rowToMemberRecord(row: Record<string, unknown>): MemberRecord {
  return {
    inboxId: String(row.inbox_id),
    walletAddress: row.wallet_address ? String(row.wallet_address) : null,
    name: String(row.name),
    role: isRole(row.role) ? row.role : "A",
    verificationLevel: isVerificationLevel(row.verification_level)
      ? row.verification_level
      : "none",
    humanId: row.human_id ? String(row.human_id) : undefined,
    agentId: row.agent_id ? String(row.agent_id) : undefined,
    joinedAt: String(row.joined_at),
  };
}

function rowToGroupRecord(
  row: Record<string, unknown>,
  members: Record<string, MemberRecord>,
  languages: GroupLanguageCode[],
): GroupRecord {
  const status = row.status === "deleted" ? "deleted" : "active";
  return {
    groupId: String(row.group_id),
    status,
    title: String(row.title),
    description: String(row.description ?? ""),
    mediaUrl: String(row.media_url ?? ""),
    thumbnailUrl: String(row.thumbnail_url ?? ""),
    languages: languages.length > 0 ? languages : ["en"],
    joinPolicy: isGroupJoinPolicy(row.join_policy)
      ? row.join_policy
      : "H_ONLY",
    joinApproval: isGroupJoinApproval(row.join_approval)
      ? row.join_approval
      : "NONE",
    maxMembers:
      typeof row.max_members === "number"
        ? row.max_members
        : Number(row.max_members ?? 2),
    encryptedPrivateKey: String(row.encrypted_private_key),
    syncInboxId: String(row.sync_inbox_id),
    xmtpGroupId: String(row.xmtp_group_id),
    members,
    createdAt: String(row.created_at),
  };
}

function rowToPendingJoinRecord(row: Record<string, unknown>): PendingJoinRecord {
  return {
    pendingJoinId: String(row.pending_join_id),
    groupId: String(row.group_id),
    syncDmId: String(row.sync_dm_id),
    applicant: {
      inboxId: String(row.applicant_inbox_id),
      walletAddress: row.wallet_address ? String(row.wallet_address) : null,
      name: String(row.name),
      role: isRole(row.role) ? row.role : "A",
      verificationLevel: isVerificationLevel(row.verification_level)
        ? row.verification_level
        : "none",
      humanId: row.human_id ? String(row.human_id) : undefined,
      agentId: row.agent_id ? String(row.agent_id) : undefined,
      joinedAt: String(row.joined_at),
    },
    status: row.status === "approved" ? "approved" : "pending",
    requestedAt: String(row.requested_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    approvedByInboxId: row.approved_by_inbox_id
      ? String(row.approved_by_inbox_id)
      : null,
  };
}

function rowToInvestmentRecord(row: Record<string, unknown>): InvestmentRecord {
  return {
    investmentId: String(row.investment_id),
    groupId: String(row.group_id),
    investorInboxId: String(row.investor_inbox_id),
    investorWalletAddress: normalizeWalletAddress(
      String(row.investor_wallet_address),
    ),
    token: String(row.token) as InvestmentRecord["token"],
    tokenAddress: normalizeWalletAddress(String(row.token_address)),
    amount: String(row.amount),
    decimals: Number(row.decimals),
    destinationAddress: normalizeWalletAddress(String(row.destination_address)),
    chainId: Number(row.chain_id),
    txHash: String(row.tx_hash).toLowerCase(),
    logIndex: Number(row.log_index),
    recordedAt: String(row.recorded_at),
    announcedAt: row.announced_at ? String(row.announced_at) : null,
  };
}

function rowToGroupThreadRecord(row: Record<string, unknown>): GroupThreadRecord {
  return {
    groupId: String(row.group_id),
    threadId: String(row.thread_id),
    title: String(row.title),
    createdAt: String(row.created_at),
    createdBy: String(row.created_by),
    updatedAt: String(row.updated_at),
  };
}

function rowToInvestmentBalanceRecord(
  row: Record<string, unknown>,
): InvestmentBalanceRecord {
  return {
    groupId: String(row.group_id),
    investorInboxId: String(row.investor_inbox_id),
    investorWalletAddress: normalizeWalletAddress(
      String(row.investor_wallet_address),
    ),
    token: String(row.token) as InvestmentBalanceRecord["token"],
    tokenAddress: normalizeWalletAddress(String(row.token_address)),
    chainId: Number(row.chain_id),
    amount: String(row.amount),
    updatedAt: String(row.updated_at),
  };
}

export class GroupStore {
  private readonly db: Database.Database;
  private readonly secretBox: SecretBox;

  constructor(dbPath: string, keyHex: string) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.secretBox = new SecretBox(keyHex);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const versionRow = this.db
      .prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'")
      .get() as { value?: string } | undefined;
    const currentVersion = Number(versionRow?.value ?? "0");

    if (currentVersion < 2 || currentVersion > TARGET_SCHEMA_VERSION) {
      this.db.exec(`
        DROP TABLE IF EXISTS investment_balances;
        DROP TABLE IF EXISTS investments;
        DROP TABLE IF EXISTS pending_joins;
        DROP TABLE IF EXISTS members;
        DROP TABLE IF EXISTS group_languages;
        DROP TABLE IF EXISTS groups;
        DROP TABLE IF EXISTS human_agents;
        DROP TABLE IF EXISTS human_inboxes;
        DROP TABLE IF EXISTS human_wallets;
        DROP TABLE IF EXISTS humans;
        DROP TABLE IF EXISTS wallet_identities;
      `);
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS groups (
        group_id              TEXT PRIMARY KEY,
        title                 TEXT NOT NULL,
        description           TEXT NOT NULL DEFAULT '',
        media_url             TEXT NOT NULL DEFAULT '',
        thumbnail_url         TEXT NOT NULL DEFAULT '',
        status                TEXT NOT NULL DEFAULT 'active',
        join_policy           TEXT NOT NULL,
        join_approval         TEXT NOT NULL DEFAULT 'NONE',
        max_members           INTEGER NOT NULL,
        encrypted_private_key TEXT NOT NULL,
        sync_inbox_id         TEXT NOT NULL,
        xmtp_group_id         TEXT NOT NULL,
        created_at            TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_sync_inbox_id
        ON groups(sync_inbox_id);

      CREATE TABLE IF NOT EXISTS group_languages (
        group_id      TEXT NOT NULL,
        language_code TEXT NOT NULL,
        PRIMARY KEY (group_id, language_code),
        FOREIGN KEY (group_id) REFERENCES groups(group_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS members (
        group_id            TEXT NOT NULL,
        inbox_id            TEXT NOT NULL,
        wallet_address      TEXT,
        name                TEXT NOT NULL,
        role                TEXT NOT NULL,
        verification_level  TEXT NOT NULL,
        human_id            TEXT,
        agent_id            TEXT,
        joined_at           TEXT NOT NULL,
        PRIMARY KEY (group_id, inbox_id),
        FOREIGN KEY (group_id) REFERENCES groups(group_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS wallet_identities (
        wallet_address TEXT PRIMARY KEY,
        inbox_id       TEXT NOT NULL,
        identity_key   TEXT NOT NULL,
        verified_at    TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_identities_inbox_id
        ON wallet_identities(inbox_id);

      CREATE TABLE IF NOT EXISTS humans (
        human_id             TEXT PRIMARY KEY,
        identity_key         TEXT NOT NULL UNIQUE,
        handle               TEXT NOT NULL,
        handle_normalized    TEXT NOT NULL UNIQUE,
        verified_at          TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS human_wallets (
        human_id       TEXT NOT NULL,
        wallet_address TEXT NOT NULL UNIQUE,
        PRIMARY KEY (human_id, wallet_address),
        FOREIGN KEY (human_id) REFERENCES humans(human_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS human_inboxes (
        human_id TEXT NOT NULL,
        inbox_id TEXT NOT NULL UNIQUE,
        PRIMARY KEY (human_id, inbox_id),
        FOREIGN KEY (human_id) REFERENCES humans(human_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS human_agents (
        agent_id           TEXT PRIMARY KEY,
        human_id           TEXT NOT NULL,
        identity_key       TEXT NOT NULL UNIQUE,
        handle             TEXT NOT NULL,
        handle_normalized  TEXT NOT NULL UNIQUE,
        wallet_address     TEXT NOT NULL UNIQUE,
        inbox_id           TEXT NOT NULL UNIQUE,
        verified_at        TEXT NOT NULL,
        FOREIGN KEY (human_id) REFERENCES humans(human_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS investments (
        investment_id             TEXT PRIMARY KEY,
        group_id                  TEXT NOT NULL,
        investor_inbox_id         TEXT NOT NULL,
        investor_wallet_address   TEXT NOT NULL,
        token                     TEXT NOT NULL,
        token_address             TEXT NOT NULL,
        amount                    TEXT NOT NULL,
        decimals                  INTEGER NOT NULL,
        destination_address       TEXT NOT NULL,
        chain_id                  INTEGER NOT NULL,
        tx_hash                   TEXT NOT NULL,
        log_index                 INTEGER NOT NULL,
        recorded_at               TEXT NOT NULL,
        announced_at              TEXT,
        UNIQUE (chain_id, tx_hash, log_index),
        FOREIGN KEY (group_id) REFERENCES groups(group_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_investments_group_id_recorded_at
        ON investments(group_id, recorded_at);

      CREATE TABLE IF NOT EXISTS investment_balances (
        group_id                  TEXT NOT NULL,
        investor_inbox_id         TEXT NOT NULL,
        investor_wallet_address   TEXT NOT NULL,
        token                     TEXT NOT NULL,
        token_address             TEXT NOT NULL,
        chain_id                  INTEGER NOT NULL,
        amount                    TEXT NOT NULL,
        updated_at                TEXT NOT NULL,
        PRIMARY KEY (group_id, investor_inbox_id, investor_wallet_address, chain_id, token_address),
        FOREIGN KEY (group_id) REFERENCES groups(group_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS group_threads (
        group_id    TEXT NOT NULL,
        thread_id   TEXT NOT NULL,
        title       TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        created_by  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (group_id, thread_id),
        FOREIGN KEY (group_id) REFERENCES groups(group_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_group_threads_group_updated_at
        ON group_threads(group_id, updated_at);

      CREATE TABLE IF NOT EXISTS pending_joins (
        pending_join_id       TEXT PRIMARY KEY,
        group_id              TEXT NOT NULL,
        sync_dm_id            TEXT NOT NULL,
        applicant_inbox_id    TEXT NOT NULL,
        wallet_address        TEXT,
        name                  TEXT NOT NULL,
        role                  TEXT NOT NULL,
        verification_level    TEXT NOT NULL,
        human_id              TEXT,
        agent_id              TEXT,
        joined_at             TEXT NOT NULL,
        status                TEXT NOT NULL,
        requested_at          TEXT NOT NULL,
        resolved_at           TEXT,
        approved_by_inbox_id  TEXT,
        FOREIGN KEY (group_id) REFERENCES groups(group_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_pending_joins_group_status
        ON pending_joins(group_id, status);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_joins_open_applicant
        ON pending_joins(group_id, applicant_inbox_id)
        WHERE status = 'pending';
    `);

    if (!this.hasColumn("groups", "status")) {
      this.db.exec(
        "ALTER TABLE groups ADD COLUMN status TEXT NOT NULL DEFAULT 'active';",
      );
    }

    if (!this.hasColumn("groups", "join_approval")) {
      this.db.exec(
        "ALTER TABLE groups ADD COLUMN join_approval TEXT NOT NULL DEFAULT 'NONE';",
      );
    }

    this.db
      .prepare(`
        INSERT INTO schema_meta (key, value)
        VALUES ('schema_version', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `)
      .run(String(TARGET_SCHEMA_VERSION));
  }

  close(): void {
    this.db.close();
  }

  private hasColumn(tableName: string, columnName: string): boolean {
    const rows = this.db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name?: string }>;
    return rows.some((row) => row.name === columnName);
  }

  private normalizeHandle(handle: string): string {
    return handle.trim().toLowerCase();
  }

  private fetchMembers(groupId: string): Record<string, MemberRecord> {
    const rows = this.db
      .prepare("SELECT * FROM members WHERE group_id = ?")
      .all(groupId) as Array<Record<string, unknown>>;

    const members: Record<string, MemberRecord> = {};
    for (const row of rows) {
      const member = rowToMemberRecord(row);
      members[member.inboxId] = member;
    }
    return members;
  }

  private fetchLanguages(groupId: string): GroupLanguageCode[] {
    const rows = this.db
      .prepare(
        "SELECT language_code FROM group_languages WHERE group_id = ? ORDER BY language_code",
      )
      .all(groupId) as Array<Record<string, unknown>>;

    const languages: GroupLanguageCode[] = [];
    for (const row of rows) {
      const language = normalizeGroupLanguageCode(row.language_code);
      if (language) {
        languages.push(language);
      }
    }
    return languages;
  }

  private fetchHumanWallets(humanId: string): string[] {
    const rows = this.db
      .prepare(
        "SELECT wallet_address FROM human_wallets WHERE human_id = ? ORDER BY wallet_address",
      )
      .all(humanId) as Array<Record<string, unknown>>;
    return rows.map((row) => normalizeWalletAddress(String(row.wallet_address)));
  }

  private fetchHumanInboxes(humanId: string): string[] {
    const rows = this.db
      .prepare(
        "SELECT inbox_id FROM human_inboxes WHERE human_id = ? ORDER BY inbox_id",
      )
      .all(humanId) as Array<Record<string, unknown>>;
    return rows.map((row) => String(row.inbox_id));
  }

  listGroups(): GroupRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM groups WHERE status = 'active'")
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const groupId = String(row.group_id);
      return rowToGroupRecord(
        row,
        this.fetchMembers(groupId),
        this.fetchLanguages(groupId),
      );
    });
  }

  getGroup(groupId: string): GroupRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM groups WHERE group_id = ?")
      .get(groupId) as Record<string, unknown> | undefined;

    if (!row) return undefined;
    return rowToGroupRecord(
      row,
      this.fetchMembers(groupId),
      this.fetchLanguages(groupId),
    );
  }

  getGroupBySyncInboxId(inboxId: string): GroupRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM groups WHERE sync_inbox_id = ?")
      .get(inboxId) as Record<string, unknown> | undefined;

    if (!row) return undefined;
    const groupId = String(row.group_id);
    return rowToGroupRecord(
      row,
      this.fetchMembers(groupId),
      this.fetchLanguages(groupId),
    );
  }

  putGroup(group: GroupRecord): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO groups
           (group_id, status, title, description, media_url, thumbnail_url, join_policy, join_approval, max_members, encrypted_private_key, sync_inbox_id, xmtp_group_id, created_at)
           VALUES (@group_id, @status, @title, @description, @media_url, @thumbnail_url, @join_policy, @join_approval, @max_members, @encrypted_private_key, @sync_inbox_id, @xmtp_group_id, @created_at)`,
        )
        .run({
          group_id: group.groupId,
          status: group.status,
          title: group.title,
          description: group.description,
          media_url: group.mediaUrl,
          thumbnail_url: group.thumbnailUrl,
          join_policy: group.joinPolicy,
          join_approval: group.joinApproval,
          max_members: group.maxMembers,
          encrypted_private_key: group.encryptedPrivateKey,
          sync_inbox_id: group.syncInboxId,
          xmtp_group_id: group.xmtpGroupId,
          created_at: group.createdAt,
        });

      this.db.prepare("DELETE FROM members WHERE group_id = ?").run(group.groupId);
      this.db
        .prepare("DELETE FROM group_languages WHERE group_id = ?")
        .run(group.groupId);

      const insertLanguage = this.db.prepare(
        `INSERT INTO group_languages (group_id, language_code)
         VALUES (@group_id, @language_code)`,
      );

      for (const language of group.languages) {
        insertLanguage.run({
          group_id: group.groupId,
          language_code: language,
        });
      }

      const insertMember = this.db.prepare(
        `INSERT INTO members
         (group_id, inbox_id, wallet_address, name, role, verification_level, human_id, agent_id, joined_at)
         VALUES (@group_id, @inbox_id, @wallet_address, @name, @role, @verification_level, @human_id, @agent_id, @joined_at)`,
      );

      for (const member of Object.values(group.members)) {
        insertMember.run({
          group_id: group.groupId,
          inbox_id: member.inboxId,
          wallet_address: member.walletAddress,
          name: member.name,
          role: member.role,
          verification_level: member.verificationLevel,
          human_id: member.humanId ?? null,
          agent_id: member.agentId ?? null,
          joined_at: member.joinedAt,
        });
      }
    })();
  }

  updateGroup(
    groupId: string,
    mutator: (group: GroupRecord) => GroupRecord,
  ): GroupRecord {
    const existing = this.getGroup(groupId);
    if (!existing) {
      throw new Error(`No such group: ${groupId}`);
    }
    const next = mutator(existing);
    this.putGroup(next);
    return next;
  }

  listPendingJoins(groupId: string): PendingJoinRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM pending_joins
         WHERE group_id = ? AND status = 'pending'
         ORDER BY requested_at ASC`,
      )
      .all(groupId) as Array<Record<string, unknown>>;
    return rows.map(rowToPendingJoinRecord);
  }

  getPendingJoin(pendingJoinId: string): PendingJoinRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM pending_joins WHERE pending_join_id = ?")
      .get(pendingJoinId) as Record<string, unknown> | undefined;
    return row ? rowToPendingJoinRecord(row) : undefined;
  }

  getOpenPendingJoinByApplicant(
    groupId: string,
    applicantInboxId: string,
  ): PendingJoinRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM pending_joins
         WHERE group_id = ? AND applicant_inbox_id = ? AND status = 'pending'`,
      )
      .get(groupId, applicantInboxId) as Record<string, unknown> | undefined;
    return row ? rowToPendingJoinRecord(row) : undefined;
  }

  putPendingJoin(record: PendingJoinRecord): void {
    this.db
      .prepare(
        `INSERT INTO pending_joins
         (pending_join_id, group_id, sync_dm_id, applicant_inbox_id, wallet_address, name, role, verification_level, human_id, agent_id, joined_at, status, requested_at, resolved_at, approved_by_inbox_id)
         VALUES (@pending_join_id, @group_id, @sync_dm_id, @applicant_inbox_id, @wallet_address, @name, @role, @verification_level, @human_id, @agent_id, @joined_at, @status, @requested_at, @resolved_at, @approved_by_inbox_id)
         ON CONFLICT(pending_join_id) DO UPDATE SET
           sync_dm_id = excluded.sync_dm_id,
           applicant_inbox_id = excluded.applicant_inbox_id,
           wallet_address = excluded.wallet_address,
           name = excluded.name,
           role = excluded.role,
           verification_level = excluded.verification_level,
           human_id = excluded.human_id,
           agent_id = excluded.agent_id,
           joined_at = excluded.joined_at,
           status = excluded.status,
           requested_at = excluded.requested_at,
           resolved_at = excluded.resolved_at,
           approved_by_inbox_id = excluded.approved_by_inbox_id`,
      )
      .run({
        pending_join_id: record.pendingJoinId,
        group_id: record.groupId,
        sync_dm_id: record.syncDmId,
        applicant_inbox_id: record.applicant.inboxId,
        wallet_address: record.applicant.walletAddress,
        name: record.applicant.name,
        role: record.applicant.role,
        verification_level: record.applicant.verificationLevel,
        human_id: record.applicant.humanId ?? null,
        agent_id: record.applicant.agentId ?? null,
        joined_at: record.applicant.joinedAt,
        status: record.status,
        requested_at: record.requestedAt,
        resolved_at: record.resolvedAt,
        approved_by_inbox_id: record.approvedByInboxId,
      });
  }

  approvePendingJoin(input: {
    pendingJoinId: string;
    approvedByInboxId: string;
    approvedAt: string;
  }): PendingJoinRecord | undefined {
    const existing = this.getPendingJoin(input.pendingJoinId);
    if (!existing || existing.status !== "pending") return existing;
    const next: PendingJoinRecord = {
      ...existing,
      status: "approved",
      resolvedAt: input.approvedAt,
      approvedByInboxId: input.approvedByInboxId,
    };
    this.putPendingJoin(next);
    return next;
  }

  listGroupThreads(groupId: string): GroupThreadRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM group_threads
         WHERE group_id = ?
         ORDER BY updated_at DESC, created_at DESC`,
      )
      .all(groupId) as Array<Record<string, unknown>>;

    return rows.map(rowToGroupThreadRecord);
  }

  replaceGroupThreads(groupId: string, threads: GroupThreadRecord[]): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM group_threads WHERE group_id = ?").run(groupId);
      const insert = this.db.prepare(
        `INSERT INTO group_threads
         (group_id, thread_id, title, created_at, created_by, updated_at)
         VALUES (@group_id, @thread_id, @title, @created_at, @created_by, @updated_at)`,
      );
      for (const thread of threads) {
        insert.run({
          group_id: groupId,
          thread_id: thread.threadId,
          title: thread.title,
          created_at: thread.createdAt,
          created_by: thread.createdBy,
          updated_at: thread.updatedAt,
        });
      }
    })();
  }

  listHumans(): HumanRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM humans ORDER BY handle_normalized")
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) =>
      rowToHumanRecord(
        row,
        this.fetchHumanWallets(String(row.human_id)),
        this.fetchHumanInboxes(String(row.human_id)),
      ),
    );
  }

  getHumanById(humanId: string): HumanRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM humans WHERE human_id = ?")
      .get(humanId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return rowToHumanRecord(
      row,
      this.fetchHumanWallets(humanId),
      this.fetchHumanInboxes(humanId),
    );
  }

  getHumanByIdentityKey(identityKey: string): HumanRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM humans WHERE identity_key = ?")
      .get(identityKey) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const humanId = String(row.human_id);
    return rowToHumanRecord(
      row,
      this.fetchHumanWallets(humanId),
      this.fetchHumanInboxes(humanId),
    );
  }

  getHumanByWallet(walletAddress: string): HumanRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT h.*
         FROM humans h
         JOIN human_wallets hw ON hw.human_id = h.human_id
         WHERE hw.wallet_address = ?`,
      )
      .get(normalizeWalletAddress(walletAddress)) as
      | Record<string, unknown>
      | undefined;
    if (!row) return undefined;
    const humanId = String(row.human_id);
    return rowToHumanRecord(
      row,
      this.fetchHumanWallets(humanId),
      this.fetchHumanInboxes(humanId),
    );
  }

  getHumanByInbox(inboxId: string): HumanRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT h.*
         FROM humans h
         JOIN human_inboxes hi ON hi.human_id = h.human_id
         WHERE hi.inbox_id = ?`,
      )
      .get(inboxId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const humanId = String(row.human_id);
    return rowToHumanRecord(
      row,
      this.fetchHumanWallets(humanId),
      this.fetchHumanInboxes(humanId),
    );
  }

  getHumanAgentByWallet(walletAddress: string): HumanAgentRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM human_agents WHERE wallet_address = ?")
      .get(normalizeWalletAddress(walletAddress)) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToHumanAgentRecord(row) : undefined;
  }

  getHumanAgentByInbox(inboxId: string): HumanAgentRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM human_agents WHERE inbox_id = ?")
      .get(inboxId) as Record<string, unknown> | undefined;
    return row ? rowToHumanAgentRecord(row) : undefined;
  }

  getWalletIdentity(walletAddress: string): {
    walletAddress: string;
    inboxId: string;
    identityKey: string;
    verifiedAt: string;
  } | undefined {
    const row = this.db
      .prepare("SELECT * FROM wallet_identities WHERE wallet_address = ?")
      .get(normalizeWalletAddress(walletAddress)) as
      | Record<string, unknown>
      | undefined;
    if (!row) return undefined;
    return {
      walletAddress: normalizeWalletAddress(String(row.wallet_address)),
      inboxId: String(row.inbox_id),
      identityKey: String(row.identity_key),
      verifiedAt: String(row.verified_at),
    };
  }

  resolveWalletStatus(walletAddress: string): WalletStatusRecord {
    const normalized = normalizeWalletAddress(walletAddress);
    const agent = this.getHumanAgentByWallet(normalized);
    if (agent) {
      return {
        walletAddress: normalized,
        inboxId: agent.inboxId,
        status: "HA",
        verificationLevel: "human-agent",
        humanId: agent.humanId,
        agentId: agent.agentId,
        handle: agent.handle,
        identityKey: agent.identityKey,
      };
    }

    const human = this.getHumanByWallet(normalized);
    if (human) {
      return {
        walletAddress: normalized,
        inboxId: human.inboxIds[0] ?? null,
        status: "H",
        verificationLevel: "human",
        humanId: human.humanId,
        agentId: null,
        handle: human.handle,
        identityKey: human.identityKey,
      };
    }

    const identity = this.getWalletIdentity(normalized);
    if (identity) {
      return {
        walletAddress: normalized,
        inboxId: identity.inboxId,
        status: "UNKNOWN",
        verificationLevel: "identity",
        humanId: null,
        agentId: null,
        handle: null,
        identityKey: identity.identityKey,
      };
    }

    return {
      walletAddress: normalized,
      inboxId: null,
      status: "UNKNOWN",
      verificationLevel: "none",
      humanId: null,
      agentId: null,
      handle: null,
      identityKey: null,
    };
  }

  resolveSenderStatus(
    walletAddress: string,
    inboxId: string,
  ): WalletStatusRecord {
    const normalized = normalizeWalletAddress(walletAddress);
    const agent = this.getHumanAgentByWallet(normalized);
    if (agent && agent.inboxId === inboxId) {
      return {
        walletAddress: normalized,
        inboxId,
        status: "HA",
        verificationLevel: "human-agent",
        humanId: agent.humanId,
        agentId: agent.agentId,
        handle: agent.handle,
        identityKey: agent.identityKey,
      };
    }

    const human = this.getHumanByWallet(normalized);
    if (human && human.inboxIds.includes(inboxId)) {
      return {
        walletAddress: normalized,
        inboxId,
        status: "H",
        verificationLevel: "human",
        humanId: human.humanId,
        agentId: null,
        handle: human.handle,
        identityKey: human.identityKey,
      };
    }

    const identity = this.getWalletIdentity(normalized);
    if (identity && identity.inboxId === inboxId) {
      return {
        walletAddress: normalized,
        inboxId,
        status: "UNKNOWN",
        verificationLevel: "identity",
        humanId: null,
        agentId: null,
        handle: null,
        identityKey: identity.identityKey,
      };
    }

    return {
      walletAddress: normalized,
      inboxId,
      status: "UNKNOWN",
      verificationLevel: "none",
      humanId: null,
      agentId: null,
      handle: null,
      identityKey: null,
    };
  }

  putWalletIdentity(input: {
    walletAddress: string;
    inboxId: string;
    identityKey: string;
    verifiedAt: string;
  }): WalletStatusRecord {
    const walletAddress = normalizeWalletAddress(input.walletAddress);
    this.db
      .prepare(
        `INSERT INTO wallet_identities (wallet_address, inbox_id, identity_key, verified_at)
         VALUES (@wallet_address, @inbox_id, @identity_key, @verified_at)
         ON CONFLICT(wallet_address) DO UPDATE SET
           inbox_id = excluded.inbox_id,
           identity_key = excluded.identity_key,
           verified_at = excluded.verified_at`,
      )
      .run({
        wallet_address: walletAddress,
        inbox_id: input.inboxId,
        identity_key: input.identityKey,
        verified_at: input.verifiedAt,
      });
    return this.resolveSenderStatus(walletAddress, input.inboxId);
  }

  private assertHandleAvailable(
    handle: string,
    allowHumanId?: string,
    allowAgentId?: string,
  ): void {
    const normalized = this.normalizeHandle(handle);
    const human = this.db
      .prepare(
        "SELECT human_id FROM humans WHERE handle_normalized = ?",
      )
      .get(normalized) as { human_id?: string } | undefined;
    if (human?.human_id && human.human_id !== allowHumanId) {
      throw new Error(`handle "${handle}" is already in use`);
    }

    const agent = this.db
      .prepare(
        "SELECT agent_id FROM human_agents WHERE handle_normalized = ?",
      )
      .get(normalized) as { agent_id?: string } | undefined;
    if (agent?.agent_id && agent.agent_id !== allowAgentId) {
      throw new Error(`handle "${handle}" is already in use`);
    }
  }

  registerHuman(input: {
    walletAddress: string;
    inboxId: string;
    identityKey: string;
    handle: string;
    verifiedAt: string;
  }): WalletStatusRecord {
    const walletAddress = normalizeWalletAddress(input.walletAddress);
    const existingHuman = this.getHumanByIdentityKey(input.identityKey);
    const requestedNormalized = this.normalizeHandle(input.handle);
    if (
      existingHuman &&
      this.normalizeHandle(existingHuman.handle) !== requestedNormalized
    ) {
      throw new Error("human handle cannot be changed");
    }
    const lockedHandle = existingHuman?.handle ?? input.handle;
    this.assertHandleAvailable(lockedHandle, existingHuman?.humanId);

    this.db.transaction(() => {
      let humanId = existingHuman?.humanId ?? randomUUID();

      this.db
        .prepare(
          `INSERT INTO humans (human_id, identity_key, handle, handle_normalized, verified_at)
           VALUES (@human_id, @identity_key, @handle, @handle_normalized, @verified_at)
           ON CONFLICT(identity_key) DO UPDATE SET
             verified_at = excluded.verified_at`,
        )
        .run({
          human_id: humanId,
          identity_key: input.identityKey,
          handle: lockedHandle,
          handle_normalized: this.normalizeHandle(lockedHandle),
          verified_at: input.verifiedAt,
        });

      const resolved = this.getHumanByIdentityKey(input.identityKey);
      humanId = resolved?.humanId ?? humanId;

      this.db
        .prepare(
          `INSERT INTO human_wallets (human_id, wallet_address)
           VALUES (?, ?)
           ON CONFLICT(wallet_address) DO UPDATE SET human_id = excluded.human_id`,
        )
        .run(humanId, walletAddress);

      this.db
        .prepare(
          `INSERT INTO human_inboxes (human_id, inbox_id)
           VALUES (?, ?)
           ON CONFLICT(inbox_id) DO UPDATE SET human_id = excluded.human_id`,
        )
        .run(humanId, input.inboxId);

      this.db
        .prepare(
          `INSERT INTO wallet_identities (wallet_address, inbox_id, identity_key, verified_at)
           VALUES (@wallet_address, @inbox_id, @identity_key, @verified_at)
           ON CONFLICT(wallet_address) DO UPDATE SET
             inbox_id = excluded.inbox_id,
             identity_key = excluded.identity_key,
             verified_at = excluded.verified_at`,
        )
        .run({
          wallet_address: walletAddress,
          inbox_id: input.inboxId,
          identity_key: input.identityKey,
          verified_at: input.verifiedAt,
        });
    })();

    return this.resolveSenderStatus(walletAddress, input.inboxId);
  }

  registerHumanAgent(input: {
    walletAddress: string;
    inboxId: string;
    identityKey: string;
    ownerHumanId: string;
    handle: string;
    verifiedAt: string;
  }): WalletStatusRecord {
    const walletAddress = normalizeWalletAddress(input.walletAddress);
    const existingAgent = this.getHumanAgentByWallet(walletAddress);
    this.assertHandleAvailable(
      input.handle,
      undefined,
      existingAgent?.agentId,
    );
    if (!this.getHumanById(input.ownerHumanId)) {
      throw new Error(`owner human ${input.ownerHumanId} was not found`);
    }

    this.db.transaction(() => {
      const agentId = existingAgent?.agentId ?? randomUUID();
      this.db
        .prepare(
          `INSERT INTO human_agents
           (agent_id, human_id, identity_key, handle, handle_normalized, wallet_address, inbox_id, verified_at)
           VALUES (@agent_id, @human_id, @identity_key, @handle, @handle_normalized, @wallet_address, @inbox_id, @verified_at)
           ON CONFLICT(agent_id) DO UPDATE SET
             human_id = excluded.human_id,
             identity_key = excluded.identity_key,
             handle = excluded.handle,
             handle_normalized = excluded.handle_normalized,
             wallet_address = excluded.wallet_address,
             inbox_id = excluded.inbox_id,
             verified_at = excluded.verified_at`,
        )
        .run({
          agent_id: agentId,
          human_id: input.ownerHumanId,
          identity_key: input.identityKey,
          handle: input.handle,
          handle_normalized: this.normalizeHandle(input.handle),
          wallet_address: walletAddress,
          inbox_id: input.inboxId,
          verified_at: input.verifiedAt,
        });

      this.db
        .prepare(
          `INSERT INTO wallet_identities (wallet_address, inbox_id, identity_key, verified_at)
           VALUES (@wallet_address, @inbox_id, @identity_key, @verified_at)
           ON CONFLICT(wallet_address) DO UPDATE SET
             inbox_id = excluded.inbox_id,
             identity_key = excluded.identity_key,
             verified_at = excluded.verified_at`,
        )
        .run({
          wallet_address: walletAddress,
          inbox_id: input.inboxId,
          identity_key: input.identityKey,
          verified_at: input.verifiedAt,
        });
    })();

    return this.resolveSenderStatus(walletAddress, input.inboxId);
  }

  recordInvestment(input: Omit<InvestmentRecord, "investmentId" | "announcedAt">):
    | { status: "recorded"; investment: InvestmentRecord }
    | { status: "already-recorded"; investment: InvestmentRecord } {
    const txHash = input.txHash.toLowerCase();
    const tokenAddress = normalizeWalletAddress(input.tokenAddress);
    const investorWalletAddress = normalizeWalletAddress(
      input.investorWalletAddress,
    );
    const destinationAddress = normalizeWalletAddress(input.destinationAddress);

    const existing = this.db
      .prepare(
        `SELECT * FROM investments
         WHERE chain_id = ? AND tx_hash = ? AND log_index = ?`,
      )
      .get(input.chainId, txHash, input.logIndex) as
      | Record<string, unknown>
      | undefined;
    if (existing) {
      return {
        status: "already-recorded",
        investment: rowToInvestmentRecord(existing),
      };
    }

    const investment: InvestmentRecord = {
      ...input,
      investmentId: randomUUID(),
      investorWalletAddress,
      tokenAddress,
      destinationAddress,
      txHash,
      announcedAt: null,
    };

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO investments
           (investment_id, group_id, investor_inbox_id, investor_wallet_address, token, token_address, amount, decimals, destination_address, chain_id, tx_hash, log_index, recorded_at, announced_at)
           VALUES (@investment_id, @group_id, @investor_inbox_id, @investor_wallet_address, @token, @token_address, @amount, @decimals, @destination_address, @chain_id, @tx_hash, @log_index, @recorded_at, @announced_at)`,
        )
        .run({
          investment_id: investment.investmentId,
          group_id: investment.groupId,
          investor_inbox_id: investment.investorInboxId,
          investor_wallet_address: investment.investorWalletAddress,
          token: investment.token,
          token_address: investment.tokenAddress,
          amount: investment.amount,
          decimals: investment.decimals,
          destination_address: investment.destinationAddress,
          chain_id: investment.chainId,
          tx_hash: investment.txHash,
          log_index: investment.logIndex,
          recorded_at: investment.recordedAt,
          announced_at: investment.announcedAt,
        });

      const current = this.db
        .prepare(
          `SELECT amount FROM investment_balances
           WHERE group_id = ? AND investor_inbox_id = ? AND investor_wallet_address = ?
             AND chain_id = ? AND token_address = ?`,
        )
        .get(
          investment.groupId,
          investment.investorInboxId,
          investment.investorWalletAddress,
          investment.chainId,
          investment.tokenAddress,
        ) as { amount?: string } | undefined;
      const nextAmount = (
        BigInt(current?.amount ?? "0") + BigInt(investment.amount)
      ).toString();

      this.db
        .prepare(
          `INSERT INTO investment_balances
           (group_id, investor_inbox_id, investor_wallet_address, token, token_address, chain_id, amount, updated_at)
           VALUES (@group_id, @investor_inbox_id, @investor_wallet_address, @token, @token_address, @chain_id, @amount, @updated_at)
           ON CONFLICT(group_id, investor_inbox_id, investor_wallet_address, chain_id, token_address)
           DO UPDATE SET
             amount = excluded.amount,
             token = excluded.token,
             updated_at = excluded.updated_at`,
        )
        .run({
          group_id: investment.groupId,
          investor_inbox_id: investment.investorInboxId,
          investor_wallet_address: investment.investorWalletAddress,
          token: investment.token,
          token_address: investment.tokenAddress,
          chain_id: investment.chainId,
          amount: nextAmount,
          updated_at: investment.recordedAt,
        });
    })();

    return { status: "recorded", investment };
  }

  markInvestmentAnnounced(investmentId: string, announcedAt: string): void {
    this.db
      .prepare(
        `UPDATE investments
         SET announced_at = ?
         WHERE investment_id = ? AND announced_at IS NULL`,
      )
      .run(announcedAt, investmentId);
  }

  listInvestments(groupId: string): InvestmentRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM investments
         WHERE group_id = ?
         ORDER BY recorded_at, investment_id`,
      )
      .all(groupId) as Array<Record<string, unknown>>;
    return rows.map(rowToInvestmentRecord);
  }

  listInvestmentBalances(groupId: string): InvestmentBalanceRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM investment_balances
         WHERE group_id = ?
         ORDER BY investor_inbox_id, chain_id, token_address`,
      )
      .all(groupId) as Array<Record<string, unknown>>;
    return rows.map(rowToInvestmentBalanceRecord);
  }

  listInvestmentBalancesForInvestor(
    groupId: string,
    investorInboxId: string,
  ): InvestmentBalanceRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM investment_balances
         WHERE group_id = ? AND investor_inbox_id = ?
         ORDER BY chain_id, token_address`,
      )
      .all(groupId, investorInboxId) as Array<Record<string, unknown>>;
    return rows.map(rowToInvestmentBalanceRecord);
  }

  listInvestmentTotals(groupId: string): InvestmentTotalRecord[] {
    const rows = this.db
      .prepare(
        `SELECT group_id, token, token_address, chain_id, amount
         FROM investment_balances
         WHERE group_id = ?
         ORDER BY chain_id, token_address`,
      )
      .all(groupId) as Array<Record<string, unknown>>;

    const totals = new Map<string, InvestmentTotalRecord>();
    for (const row of rows) {
      const key = `${row.chain_id}:${row.token_address}`;
      const existing = totals.get(key);
      const amount = String(row.amount);
      if (!existing) {
        totals.set(key, {
          groupId: String(row.group_id),
          token: String(row.token) as InvestmentTotalRecord["token"],
          tokenAddress: normalizeWalletAddress(String(row.token_address)),
          chainId: Number(row.chain_id),
          amount,
        });
      } else {
        existing.amount = (BigInt(existing.amount) + BigInt(amount)).toString();
      }
    }
    return [...totals.values()];
  }

  sealPrivateKey(privateKeyHex: Hex): string {
    return this.secretBox.seal(privateKeyHex);
  }

  openPrivateKey(encrypted: string): Hex {
    return this.secretBox.open(encrypted) as Hex;
  }
}
