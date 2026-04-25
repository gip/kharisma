import {
  ErrorCodec,
  SkillRequestCodec,
  SkillResponseCodec,
  allCodecs,
  contentTypeEquals,
  type ProtocolError,
  type SkillResponsePayload,
} from "@kharisma/protocol";
import { Client, IdentifierKind, type DecodedMessage, type Dm } from "@xmtp/node-sdk";
import type { Address, Hex } from "viem";
import { CliError } from "./errors.js";
import { resolveDbEncryptionKey, xmtpDbPath } from "./keys.js";
import { localSignerFromHex } from "./local-signer.js";
import type { XmtpEnv } from "./args.js";

type Sleep = (ms: number) => Promise<void>;

export type FetchSkillInput = {
  target: Address;
  privateKey: Hex;
  storageDir: string;
  xmtpEnv: XmtpEnv;
  timeoutMs: number;
  pollMs: number;
  appVersion: string;
};

export type DmLike = {
  id?: string;
  peerInboxId?: string;
  sync(): Promise<unknown>;
  messages(): Promise<DecodedMessageLike[]>;
  send(content: unknown): Promise<unknown>;
};

export type DecodedMessageLike = {
  senderInboxId: string;
  contentType: DecodedMessage["contentType"];
  content: unknown;
  sentAt: Date;
};

export async function fetchSkillMarkdown(input: FetchSkillInput): Promise<string> {
  const { signer, address } = localSignerFromHex(input.privateKey);
  const dbEncryptionKey = resolveDbEncryptionKey({ storageDir: input.storageDir });
  const dbPath = xmtpDbPath({ storageDir: input.storageDir, address });

  let client: Client<unknown>;
  try {
    client = (await Client.create(signer, {
      env: input.xmtpEnv,
      appVersion: input.appVersion,
      dbPath,
      dbEncryptionKey,
      codecs: [...allCodecs],
    } as Parameters<typeof Client.create>[1])) as unknown as Client<unknown>;
  } catch (error) {
    throw new CliError(`Failed to create XMTP client: ${messageOf(error)}`);
  }

  const identifier = {
    identifier: input.target.toLowerCase(),
    identifierKind: IdentifierKind.Ethereum,
  };

  let dm: Dm<unknown>;
  try {
    const existing = await client.conversations.fetchDmByIdentifier(identifier);
    dm = (existing ??
      (await client.conversations.createDmWithIdentifier(identifier))) as Dm<unknown>;
  } catch (error) {
    throw new CliError(`Failed to open XMTP DM with ${input.target}: ${messageOf(error)}`);
  }

  const startedAt = new Date();
  try {
    await dm.send(SkillRequestCodec.encode({}));
  } catch (error) {
    throw new CliError(`Failed to send skill-request/1: ${messageOf(error)}`);
  }

  return waitForSkillResponse({
    dm,
    target: input.target,
    peerInboxId: dm.peerInboxId,
    selfInboxId: client.inboxId,
    startedAt,
    timeoutMs: input.timeoutMs,
    pollMs: input.pollMs,
    xmtpEnv: input.xmtpEnv,
  });
}

export async function waitForSkillResponse(input: {
  dm: DmLike;
  target: Address | string;
  peerInboxId?: string;
  selfInboxId?: string;
  startedAt: Date;
  timeoutMs: number;
  pollMs: number;
  xmtpEnv: XmtpEnv;
  sleep?: Sleep;
  now?: () => number;
}): Promise<string> {
  const sleep = input.sleep ?? delay;
  const now = input.now ?? Date.now;
  const deadline = now() + input.timeoutMs;
  let lastSyncError: string | null = null;

  while (now() <= deadline) {
    try {
      await input.dm.sync();
    } catch (error) {
      lastSyncError = messageOf(error);
    }

    const messages = await input.dm.messages();
    const sorted = [...messages].sort(
      (left, right) => left.sentAt.getTime() - right.sentAt.getTime(),
    );

    for (const message of sorted) {
      const decoded = decodeSkillResponse({
        message,
        peerInboxId: input.peerInboxId,
        selfInboxId: input.selfInboxId,
        startedAt: input.startedAt,
      });
      if (!decoded) {
        continue;
      }
      if (decoded instanceof Error) {
        throw decoded;
      }
      return decoded;
    }

    await sleep(input.pollMs);
  }

  const syncDetail = lastSyncError ? ` Last sync error: ${lastSyncError}` : "";
  throw new CliError(
    `Timed out waiting for skill-response/1 from ${input.target} ` +
      `(peer inbox: ${input.peerInboxId ?? "unknown"}, timeout: ${input.timeoutMs}ms, env: ${input.xmtpEnv}).${syncDetail}`,
  );
}

export function decodeSkillResponse(input: {
  message: DecodedMessageLike;
  peerInboxId?: string;
  selfInboxId?: string;
  startedAt: Date;
}): string | Error | null {
  const { message } = input;

  if (input.selfInboxId && message.senderInboxId === input.selfInboxId) {
    return null;
  }
  if (input.peerInboxId && message.senderInboxId !== input.peerInboxId) {
    return null;
  }
  if (message.sentAt.getTime() < input.startedAt.getTime()) {
    return null;
  }

  if (contentTypeEquals(message.contentType, ErrorCodec.contentType)) {
    const error = message.content as ProtocolError;
    return new CliError(
      `Kharisma protocol error (${error.code ?? "unknown"}): ${error.message ?? "Unknown protocol error"}`,
    );
  }

  if (!contentTypeEquals(message.contentType, SkillResponseCodec.contentType)) {
    return null;
  }

  return readSkillResponsePayload(message.content);
}

function readSkillResponsePayload(content: unknown): string | Error {
  if (!isObject(content)) {
    return new CliError("Malformed skill-response/1: payload is not an object");
  }

  const payload = content as SkillResponsePayload;
  if (payload.status === "error") {
    return new CliError(
      `Kharisma skill error (${payload.error.code}): ${payload.error.message}`,
    );
  }

  if (payload.status !== "ok") {
    return new CliError("Malformed skill-response/1: missing status");
  }
  if (payload.file !== "SKILL.md") {
    return new CliError("Malformed skill-response/1: expected file SKILL.md");
  }
  if (payload.mediaType !== "text/markdown") {
    return new CliError(
      "Malformed skill-response/1: expected mediaType text/markdown",
    );
  }
  if (typeof payload.content !== "string" || !payload.content.trim()) {
    return new CliError("Malformed skill-response/1: missing markdown content");
  }

  return payload.content;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
