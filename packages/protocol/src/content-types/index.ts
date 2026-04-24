import type { ContentCodec } from "@xmtp/content-type-primitives";
import { contentTypeToKey } from "./helpers.js";
import { GroupChannelCodecs } from "./group.js";
import { MainChannelCodecs } from "./main.js";
import { SyncChannelCodecs } from "./sync.js";

export * from "./group.js";
export * from "./helpers.js";
export * from "./ids.js";
export * from "./main.js";
export * from "./sync.js";

/**
 * Every custom Kharisma content codec, in one array. Pass this to
 * `Client.create({ codecs })` on any XMTP client that participates in
 * the protocol.
 *
 * Deduplicated across channels so codecs shared by main and sync DMs are
 * registered once.
 */
export const allCodecs: readonly ContentCodec<unknown>[] = dedupeCodecs([
  ...MainChannelCodecs,
  ...SyncChannelCodecs,
  ...GroupChannelCodecs,
] as unknown as readonly ContentCodec<unknown>[]);

function dedupeCodecs(
  codecs: readonly ContentCodec<unknown>[],
): readonly ContentCodec<unknown>[] {
  const seen = new Set<string>();
  return codecs.filter((codec) => {
    const key = contentTypeToKey(codec.contentType);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
