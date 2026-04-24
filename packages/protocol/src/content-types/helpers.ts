import type {
  ContentCodec,
  ContentTypeId,
  EncodedContent,
} from "@xmtp/content-type-primitives";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type JsonCodecOptions<T> = {
  /** Optional plain-text fallback for clients that don't know the codec. */
  fallback?: (content: T) => string | undefined;
  /** Whether to push-notify on receipt. Defaults to `false`. */
  shouldPush?: (content: T) => boolean;
};

/**
 * Build a `ContentCodec<T>` that JSON-encodes a payload as UTF-8 bytes.
 *
 * This is the single JSON (en|de)coder path used by every custom Kharisma
 * content type, so drift between codecs is impossible.
 */
export function makeJsonCodec<T>(
  contentType: ContentTypeId,
  options: JsonCodecOptions<T> = {},
): ContentCodec<T> {
  const fallback = options.fallback ?? (() => undefined);
  const shouldPush = options.shouldPush ?? (() => false);

  return {
    contentType,
    encode(content: T): EncodedContent {
      const json = JSON.stringify(content);
      return {
        type: contentType,
        parameters: { encoding: "UTF-8" },
        fallback: fallback(content),
        content: encoder.encode(json),
      };
    },
    decode(encoded: EncodedContent): T {
      const text = decoder.decode(encoded.content);
      return JSON.parse(text) as T;
    },
    fallback(content: T): string | undefined {
      return fallback(content);
    },
    shouldPush(content: T): boolean {
      return shouldPush(content);
    },
  };
}

export function contentTypeEquals(
  a: ContentTypeId,
  b: ContentTypeId,
): boolean {
  return (
    a.authorityId === b.authorityId &&
    a.typeId === b.typeId &&
    a.versionMajor === b.versionMajor
  );
}

export function contentTypeToKey(id: ContentTypeId): string {
  return `${id.authorityId}/${id.typeId}:${id.versionMajor}.${id.versionMinor}`;
}
