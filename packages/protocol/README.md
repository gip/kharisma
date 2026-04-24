# @kharisma/protocol

Shared wire-format package for Kharisma's XMTP-based protocol.

This package owns the wire format, and nothing else:

- **`SKILL.md`** — canonical XMTP-only spec for discovery, circle sync, circle MLS group messages, content types, state machines, and error codes. Single source of truth for agents building against the protocol.
- **Types** — `Role`, `ErrorCode`, `ProtocolError`, `ClaimEnvelope`, `ClaimVerifier`, and every payload type used on the main, sync, and group channels.
- **Content codecs** — XMTP `ContentCodec<T>` implementations for every custom content type, plus a single `allCodecs` export that any consumer can pass to `Client.create({ codecs })`.
- **Pure state machines** — reducers for the main and sync channel DM state machines; no I/O.

This package is deliberately Node- and browser-safe: it only depends on `@xmtp/content-type-primitives`. Wiring, I/O, sqlite, skill markdown loading, and signing live in consuming apps.

## Usage

```ts
import {
  allCodecs,
  MainChannelCodecs,
  HelloPayload,
  reduceMain,
  isValidMemberName,
} from "@kharisma/protocol";

// Passing the codecs to an XMTP client:
const client = await Client.create(signer, {
  env: "dev",
  codecs: allCodecs,
  // ...
});
```

## Layout

```
src/
├── index.ts              # Barrel export
├── roles.ts              # Role union
├── errors.ts             # ErrorCode + ProtocolError
├── claims.ts             # ClaimEnvelope + ClaimVerifier interface
├── names.ts              # isValidMemberName
├── content-types/
│   ├── ids.ts            # ContentTypeId constants
│   ├── helpers.ts        # makeJsonCodec factory
│   ├── main.ts           # Main channel codecs
│   ├── sync.ts           # Sync channel codecs
│   ├── group.ts          # Group channel codecs
│   └── index.ts          # allCodecs
└── state-machine/
    ├── main.ts           # Main channel DM state machine
    └── sync.ts           # Sync channel DM state machine
```
