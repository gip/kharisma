import { mkdirSync } from "node:fs";
import path from "node:path";
import { allCodecs } from "@kharisma/protocol";
import { Client } from "@xmtp/node-sdk";
import type { Hex } from "viem";
import type { GroupsConfig } from "../config.js";
import { localSignerFromHex } from "./local-signer.js";

/**
 * Any `Client` instance produced by this service. The concrete type
 * flowing out of `Client.create` is parameterized on the codec array, so
 * we widen to `Client<unknown>` at the boundary to keep the rest of the
 * service simple.
 */
export type KharismaClient = Client<unknown>;

/** Directory layout for the main kharisma identity's XMTP db. */
export function mainDbPath(config: GroupsConfig, address: string): string {
  const dir = path.join(config.mainXmtpDir, address.toLowerCase());
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "client.db3");
}

/** Directory layout for a per-group identity's XMTP db. */
export function groupDbPath(config: GroupsConfig, groupId: string): string {
  const dir = path.join(config.groupsXmtpDir, groupId);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "client.db3");
}

/**
 * Create an XMTP client backed by a local private key.
 *
 * Centralizes the `Client.create` options so every client (main and
 * per-group) is configured identically: same env, same app version, same
 * codec set, same sqlite encryption key.
 */
export async function createLocalClient(input: {
  config: GroupsConfig;
  privateKeyHex: Hex;
  dbPath: string;
}): Promise<{ client: KharismaClient; address: `0x${string}` }> {
  const { signer, address } = localSignerFromHex(input.privateKeyHex);

  const client = (await Client.create(signer, {
    env: input.config.xmtpEnv,
    appVersion: input.config.xmtpAppVersion,
    dbPath: input.dbPath,
    dbEncryptionKey: input.config.xmtpDbEncryptionKey,
    codecs: [...allCodecs],
  } as Parameters<typeof Client.create>[1])) as unknown as KharismaClient;

  return { client, address };
}
