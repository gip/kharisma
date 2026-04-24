import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { getAddress, type Hex } from "viem";
import type { SecretBox } from "../crypto/encryption.js";

export type UserRecord = {
  id: number;
  walletAddress: `0x${string}`;
  walletAccountType: "EOA" | "SCW" | null;
  walletChainId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionRecord = {
  id: string;
  userId: number;
  walletAddress: `0x${string}`;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
};

export type XmtpAccountRecord = {
  userId: number;
  walletAddress: `0x${string}`;
  inboxId: string | null;
  installationId: string | null;
  dbPath: string;
  encryptedDbEncryptionKey: string;
  lastInitializedAt: string | null;
  lastSeenAt: string | null;
};

export type AuthNonceRecord = {
  id: string;
  walletAddress: `0x${string}`;
  chainId: number | null;
  loginMethod: string;
  nonce: string;
  message: string;
  expiresAt: string;
  createdAt: string;
  consumedAt: string | null;
};

export type SiweNonceRecord = {
  id: string;
  nonce: string;
  loginMethod: string;
  expiresAt: string;
  createdAt: string;
  consumedAt: string | null;
};

export type SignatureRequestRecord = {
  id: string;
  userId: number;
  walletAddress: `0x${string}`;
  purpose: string;
  message: string;
  chainId: number | null;
  requestState: "pending" | "resolved" | "rejected" | "expired";
  expiresAt: string;
  createdAt: string;
  resolvedAt: string | null;
  signature: Hex | null;
  error: string | null;
};

export type MediaUploadRecord = {
  id: string;
  userId: number;
  filename: string;
  mimeType: string;
  contentLength: number;
  contentDigest: string;
  storageProvider: "local" | "r2";
  objectKey: string;
  publicUrl: string;
  createdAt: string;
};

export type KharismaProfileRecord = {
  userId: number;
  walletAddress: `0x${string}`;
  status: "H" | "HA" | "A" | "UNKNOWN";
  verificationLevel: "none" | "identity" | "human" | "human-agent";
  humanId: string | null;
  agentId: string | null;
  handle: string | null;
  updatedAt: string;
};

function normalizeAddress(address: string) {
  return getAddress(address) as `0x${string}`;
}

function rowToUser(row: Record<string, unknown>): UserRecord {
  return {
    id: Number(row.id),
    walletAddress: normalizeAddress(String(row.wallet_address)),
    walletAccountType:
      row.wallet_account_type === "EOA" || row.wallet_account_type === "SCW"
        ? row.wallet_account_type
        : null,
    walletChainId:
      typeof row.wallet_chain_id === "number"
        ? row.wallet_chain_id
        : row.wallet_chain_id === null
          ? null
          : Number(row.wallet_chain_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToSession(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    userId: Number(row.user_id),
    walletAddress: normalizeAddress(String(row.wallet_address)),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    lastSeenAt: String(row.last_seen_at),
  };
}

function rowToXmtpAccount(row: Record<string, unknown>): XmtpAccountRecord {
  return {
    userId: Number(row.user_id),
    walletAddress: normalizeAddress(String(row.wallet_address)),
    inboxId: row.inbox_id ? String(row.inbox_id) : null,
    installationId: row.installation_id ? String(row.installation_id) : null,
    dbPath: String(row.db_path),
    encryptedDbEncryptionKey: String(row.encrypted_db_encryption_key),
    lastInitializedAt: row.last_initialized_at ? String(row.last_initialized_at) : null,
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
  };
}

function rowToAuthNonce(row: Record<string, unknown>): AuthNonceRecord {
  return {
    id: String(row.id),
    walletAddress: normalizeAddress(String(row.wallet_address)),
    chainId:
      row.chain_id === null || typeof row.chain_id === "undefined"
        ? null
        : Number(row.chain_id),
    loginMethod: String(row.login_method),
    nonce: String(row.nonce),
    message: String(row.message),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    consumedAt: row.consumed_at ? String(row.consumed_at) : null,
  };
}

function rowToSiweNonce(row: Record<string, unknown>): SiweNonceRecord {
  return {
    id: String(row.id),
    nonce: String(row.nonce),
    loginMethod: String(row.login_method),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    consumedAt: row.consumed_at ? String(row.consumed_at) : null,
  };
}

function rowToSignatureRequest(row: Record<string, unknown>): SignatureRequestRecord {
  return {
    id: String(row.id),
    userId: Number(row.user_id),
    walletAddress: normalizeAddress(String(row.wallet_address)),
    purpose: String(row.purpose),
    message: String(row.message),
    chainId:
      row.chain_id === null || typeof row.chain_id === "undefined"
        ? null
        : Number(row.chain_id),
    requestState:
      row.request_state === "resolved" ||
      row.request_state === "rejected" ||
      row.request_state === "expired"
        ? row.request_state
        : "pending",
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    signature: row.signature ? (String(row.signature) as Hex) : null,
    error: row.error ? String(row.error) : null,
  };
}

function rowToMediaUpload(row: Record<string, unknown>): MediaUploadRecord {
  return {
    id: String(row.id),
    userId: Number(row.user_id),
    filename: String(row.filename),
    mimeType: String(row.mime_type),
    contentLength: Number(row.content_length),
    contentDigest: String(row.content_digest),
    storageProvider: row.storage_provider === "r2" ? "r2" : "local",
    objectKey: String(row.object_key),
    publicUrl: String(row.public_url),
    createdAt: String(row.created_at),
  };
}

function rowToKharismaProfile(
  row: Record<string, unknown>,
): KharismaProfileRecord {
  return {
    userId: Number(row.user_id),
    walletAddress: normalizeAddress(String(row.wallet_address)),
    status:
      row.status === "H" ||
      row.status === "HA" ||
      row.status === "A" ||
      row.status === "UNKNOWN"
        ? row.status
        : "UNKNOWN",
    verificationLevel:
      row.verification_level === "identity" ||
      row.verification_level === "human" ||
      row.verification_level === "human-agent"
        ? row.verification_level
        : "none",
    humanId: row.human_id ? String(row.human_id) : null,
    agentId: row.agent_id ? String(row.agent_id) : null,
    handle: row.handle ? String(row.handle) : null,
    updatedAt: String(row.updated_at),
  };
}

export class AppDatabase {
  private readonly db: Database.Database;

  constructor(
    databasePath: string,
    private readonly secretBox: SecretBox,
  ) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address TEXT NOT NULL UNIQUE,
        wallet_account_type TEXT,
        wallet_chain_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_nonces (
        id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        chain_id INTEGER,
        login_method TEXT NOT NULL,
        nonce TEXT NOT NULL,
        message TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        consumed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS auth_siwe_nonces (
        id TEXT PRIMARY KEY,
        nonce TEXT NOT NULL,
        login_method TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        consumed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        wallet_address TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS xmtp_accounts (
        user_id INTEGER PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        inbox_id TEXT,
        installation_id TEXT,
        db_path TEXT NOT NULL,
        encrypted_db_encryption_key TEXT NOT NULL,
        last_initialized_at TEXT,
        last_seen_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS xmtp_signature_requests (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        wallet_address TEXT NOT NULL,
        purpose TEXT NOT NULL,
        message TEXT NOT NULL,
        chain_id INTEGER,
        request_state TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        signature TEXT,
        error TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS conversation_reads (
        user_id INTEGER NOT NULL,
        conversation_id TEXT NOT NULL,
        last_read_message_id TEXT,
        last_read_at TEXT NOT NULL,
        PRIMARY KEY(user_id, conversation_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS media_uploads (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        content_length INTEGER NOT NULL,
        content_digest TEXT NOT NULL,
        storage_provider TEXT NOT NULL,
        object_key TEXT NOT NULL,
        public_url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_media_uploads_user_id
        ON media_uploads(user_id);

      CREATE TABLE IF NOT EXISTS kharisma_profiles (
        user_id INTEGER PRIMARY KEY,
        wallet_address TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        verification_level TEXT NOT NULL,
        human_id TEXT,
        agent_id TEXT,
        handle TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  createAuthNonce(input: {
    id?: string;
    walletAddress: `0x${string}`;
    chainId: number | null;
    loginMethod: string;
    nonce: string;
    message: string;
    expiresAt: string;
  }) {
    const id = input.id ?? randomUUID();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO auth_nonces (
          id, wallet_address, chain_id, login_method, nonce, message, expires_at, created_at
        ) VALUES (
          @id, @wallet_address, @chain_id, @login_method, @nonce, @message, @expires_at, @created_at
        )
      `)
      .run({
        id,
        wallet_address: normalizeAddress(input.walletAddress),
        chain_id: input.chainId,
        login_method: input.loginMethod,
        nonce: input.nonce,
        message: input.message,
        expires_at: input.expiresAt,
        created_at: createdAt,
      });

    return id;
  }

  getAuthNonceById(id: string) {
    const row = this.db
      .prepare("SELECT * FROM auth_nonces WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;

    return row ? rowToAuthNonce(row) : null;
  }

  consumeAuthNonce(id: string) {
    this.db
      .prepare("UPDATE auth_nonces SET consumed_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  createSiweNonce(input: {
    id?: string;
    nonce: string;
    loginMethod: string;
    expiresAt: string;
  }) {
    const id = input.id ?? randomUUID();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO auth_siwe_nonces (
          id, nonce, login_method, expires_at, created_at
        ) VALUES (
          @id, @nonce, @login_method, @expires_at, @created_at
        )
      `)
      .run({
        id,
        nonce: input.nonce,
        login_method: input.loginMethod,
        expires_at: input.expiresAt,
        created_at: createdAt,
      });

    return id;
  }

  getSiweNonceById(id: string) {
    const row = this.db
      .prepare("SELECT * FROM auth_siwe_nonces WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;

    return row ? rowToSiweNonce(row) : null;
  }

  consumeSiweNonce(id: string) {
    this.db
      .prepare("UPDATE auth_siwe_nonces SET consumed_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  upsertUser(input: {
    walletAddress: `0x${string}`;
    walletAccountType: "EOA" | "SCW";
    walletChainId: number | null;
  }) {
    const walletAddress = normalizeAddress(input.walletAddress);
    const now = new Date().toISOString();
    const existing = this.db
      .prepare("SELECT * FROM users WHERE wallet_address = ?")
      .get(walletAddress) as Record<string, unknown> | undefined;

    if (existing) {
      this.db
        .prepare(`
          UPDATE users
          SET wallet_account_type = @wallet_account_type,
              wallet_chain_id = @wallet_chain_id,
              updated_at = @updated_at
          WHERE wallet_address = @wallet_address
        `)
        .run({
          wallet_account_type: input.walletAccountType,
          wallet_chain_id: input.walletChainId,
          updated_at: now,
          wallet_address: walletAddress,
        });

      const updated = this.db
        .prepare("SELECT * FROM users WHERE wallet_address = ?")
        .get(walletAddress) as Record<string, unknown>;
      return rowToUser(updated);
    }

    const result = this.db
      .prepare(`
        INSERT INTO users (
          wallet_address, wallet_account_type, wallet_chain_id, created_at, updated_at
        ) VALUES (
          @wallet_address, @wallet_account_type, @wallet_chain_id, @created_at, @updated_at
        )
      `)
      .run({
        wallet_address: walletAddress,
        wallet_account_type: input.walletAccountType,
        wallet_chain_id: input.walletChainId,
        created_at: now,
        updated_at: now,
      });

    return {
      id: Number(result.lastInsertRowid),
      walletAddress,
      walletAccountType: input.walletAccountType,
      walletChainId: input.walletChainId,
      createdAt: now,
      updatedAt: now,
    } satisfies UserRecord;
  }

  getUserById(userId: number) {
    const row = this.db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(userId) as Record<string, unknown> | undefined;

    return row ? rowToUser(row) : null;
  }

  createSession(input: {
    userId: number;
    walletAddress: `0x${string}`;
    expiresAt: string;
  }) {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO sessions (
          id, user_id, wallet_address, expires_at, created_at, last_seen_at
        ) VALUES (
          @id, @user_id, @wallet_address, @expires_at, @created_at, @last_seen_at
        )
      `)
      .run({
        id,
        user_id: input.userId,
        wallet_address: normalizeAddress(input.walletAddress),
        expires_at: input.expiresAt,
        created_at: now,
        last_seen_at: now,
      });

    return {
      id,
      userId: input.userId,
      walletAddress: normalizeAddress(input.walletAddress),
      expiresAt: input.expiresAt,
      createdAt: now,
      lastSeenAt: now,
    } satisfies SessionRecord;
  }

  getSessionById(sessionId: string) {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(sessionId) as Record<string, unknown> | undefined;

    return row ? rowToSession(row) : null;
  }

  touchSession(sessionId: string) {
    this.db
      .prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
      .run(new Date().toISOString(), sessionId);
  }

  upsertXmtpAccount(input: {
    userId: number;
    walletAddress: `0x${string}`;
    inboxId: string | null;
    installationId: string | null;
    dbPath: string;
    dbEncryptionKeyHex: string;
    lastInitializedAt: string;
  }) {
    const encryptedKey = this.secretBox.seal(input.dbEncryptionKeyHex);

    this.db
      .prepare(`
        INSERT INTO xmtp_accounts (
          user_id, wallet_address, inbox_id, installation_id, db_path, encrypted_db_encryption_key, last_initialized_at, last_seen_at
        ) VALUES (
          @user_id, @wallet_address, @inbox_id, @installation_id, @db_path, @encrypted_db_encryption_key, @last_initialized_at, @last_seen_at
        )
        ON CONFLICT(user_id) DO UPDATE SET
          wallet_address = excluded.wallet_address,
          inbox_id = excluded.inbox_id,
          installation_id = excluded.installation_id,
          db_path = excluded.db_path,
          encrypted_db_encryption_key = excluded.encrypted_db_encryption_key,
          last_initialized_at = excluded.last_initialized_at,
          last_seen_at = excluded.last_seen_at
      `)
      .run({
        user_id: input.userId,
        wallet_address: normalizeAddress(input.walletAddress),
        inbox_id: input.inboxId,
        installation_id: input.installationId,
        db_path: input.dbPath,
        encrypted_db_encryption_key: encryptedKey,
        last_initialized_at: input.lastInitializedAt,
        last_seen_at: input.lastInitializedAt,
      });
  }

  getXmtpAccountByUserId(userId: number) {
    const row = this.db
      .prepare("SELECT * FROM xmtp_accounts WHERE user_id = ?")
      .get(userId) as Record<string, unknown> | undefined;

    return row ? rowToXmtpAccount(row) : null;
  }

  touchXmtpAccount(userId: number) {
    this.db
      .prepare("UPDATE xmtp_accounts SET last_seen_at = ? WHERE user_id = ?")
      .run(new Date().toISOString(), userId);
  }

  deleteXmtpAccount(userId: number) {
    this.db.prepare("DELETE FROM xmtp_accounts WHERE user_id = ?").run(userId);
  }

  decryptDbEncryptionKey(record: XmtpAccountRecord) {
    return `0x${this.secretBox.open(record.encryptedDbEncryptionKey).replace(/^0x/, "")}` as Hex;
  }

  createSignatureRequest(input: {
    userId: number;
    walletAddress: `0x${string}`;
    purpose: string;
    message: string;
    chainId: number | null;
    expiresAt: string;
  }) {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO xmtp_signature_requests (
          id, user_id, wallet_address, purpose, message, chain_id, request_state, expires_at, created_at
        ) VALUES (
          @id, @user_id, @wallet_address, @purpose, @message, @chain_id, @request_state, @expires_at, @created_at
        )
      `)
      .run({
        id,
        user_id: input.userId,
        wallet_address: normalizeAddress(input.walletAddress),
        purpose: input.purpose,
        message: input.message,
        chain_id: input.chainId,
        request_state: "pending",
        expires_at: input.expiresAt,
        created_at: createdAt,
      });

    return {
      id,
      userId: input.userId,
      walletAddress: normalizeAddress(input.walletAddress),
      purpose: input.purpose,
      message: input.message,
      chainId: input.chainId,
      requestState: "pending",
      expiresAt: input.expiresAt,
      createdAt,
      resolvedAt: null,
      signature: null,
      error: null,
    } satisfies SignatureRequestRecord;
  }

  getSignatureRequestById(requestId: string) {
    const row = this.db
      .prepare("SELECT * FROM xmtp_signature_requests WHERE id = ?")
      .get(requestId) as Record<string, unknown> | undefined;

    return row ? rowToSignatureRequest(row) : null;
  }

  resolveSignatureRequest(requestId: string, signature: Hex) {
    this.db
      .prepare(`
        UPDATE xmtp_signature_requests
        SET request_state = 'resolved',
            resolved_at = @resolved_at,
            signature = @signature,
            error = NULL
        WHERE id = @id
      `)
      .run({
        id: requestId,
        resolved_at: new Date().toISOString(),
        signature,
      });
  }

  rejectSignatureRequest(requestId: string, state: "rejected" | "expired", error: string) {
    this.db
      .prepare(`
        UPDATE xmtp_signature_requests
        SET request_state = @request_state,
            resolved_at = @resolved_at,
            error = @error
        WHERE id = @id
      `)
      .run({
        id: requestId,
        request_state: state,
        resolved_at: new Date().toISOString(),
        error,
      });
  }

  upsertConversationRead(input: {
    userId: number;
    conversationId: string;
    lastReadMessageId: string | null;
    lastReadAt: string;
  }) {
    this.db
      .prepare(`
        INSERT INTO conversation_reads (
          user_id, conversation_id, last_read_message_id, last_read_at
        ) VALUES (
          @user_id, @conversation_id, @last_read_message_id, @last_read_at
        )
        ON CONFLICT(user_id, conversation_id) DO UPDATE SET
          last_read_message_id = excluded.last_read_message_id,
          last_read_at = excluded.last_read_at
      `)
      .run({
        user_id: input.userId,
        conversation_id: input.conversationId,
        last_read_message_id: input.lastReadMessageId,
        last_read_at: input.lastReadAt,
      });
  }

  listXmtpAccounts() {
    const rows = this.db
      .prepare("SELECT * FROM xmtp_accounts ORDER BY user_id ASC")
      .all() as Array<Record<string, unknown>>;

    return rows.map(rowToXmtpAccount);
  }

  createMediaUpload(input: {
    id: string;
    userId: number;
    filename: string;
    mimeType: string;
    contentLength: number;
    contentDigest: string;
    storageProvider: "local" | "r2";
    objectKey: string;
    publicUrl: string;
  }) {
    const createdAt = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO media_uploads (
          id, user_id, filename, mime_type, content_length, content_digest,
          storage_provider, object_key, public_url, created_at
        ) VALUES (
          @id, @user_id, @filename, @mime_type, @content_length, @content_digest,
          @storage_provider, @object_key, @public_url, @created_at
        )
      `)
      .run({
        id: input.id,
        user_id: input.userId,
        filename: input.filename,
        mime_type: input.mimeType,
        content_length: input.contentLength,
        content_digest: input.contentDigest,
        storage_provider: input.storageProvider,
        object_key: input.objectKey,
        public_url: input.publicUrl,
        created_at: createdAt,
      });

    return {
      ...input,
      createdAt,
    } satisfies MediaUploadRecord;
  }

  getMediaUploadById(id: string) {
    const row = this.db
      .prepare("SELECT * FROM media_uploads WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;

    return row ? rowToMediaUpload(row) : null;
  }

  upsertKharismaProfile(input: {
    userId: number;
    walletAddress: `0x${string}`;
    status: KharismaProfileRecord["status"];
    verificationLevel: KharismaProfileRecord["verificationLevel"];
    humanId: string | null;
    agentId: string | null;
    handle: string | null;
  }) {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO kharisma_profiles
         (user_id, wallet_address, status, verification_level, human_id, agent_id, handle, updated_at)
         VALUES
         (@user_id, @wallet_address, @status, @verification_level, @human_id, @agent_id, @handle, @updated_at)
         ON CONFLICT(user_id) DO UPDATE SET
           wallet_address = excluded.wallet_address,
           status = excluded.status,
           verification_level = excluded.verification_level,
           human_id = excluded.human_id,
           agent_id = excluded.agent_id,
           handle = excluded.handle,
           updated_at = excluded.updated_at`,
      )
      .run({
        user_id: input.userId,
        wallet_address: normalizeAddress(input.walletAddress),
        status: input.status,
        verification_level: input.verificationLevel,
        human_id: input.humanId,
        agent_id: input.agentId,
        handle: input.handle,
        updated_at: updatedAt,
      });

    const row = this.db
      .prepare("SELECT * FROM kharisma_profiles WHERE user_id = ?")
      .get(input.userId) as Record<string, unknown>;
    return rowToKharismaProfile(row);
  }

  getKharismaProfileByUserId(userId: number) {
    const row = this.db
      .prepare("SELECT * FROM kharisma_profiles WHERE user_id = ?")
      .get(userId) as Record<string, unknown> | undefined;
    return row ? rowToKharismaProfile(row) : null;
  }
}
