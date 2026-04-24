# groups-service

Server-owned XMTP service implementing the Kharisma group protocol.

The service runs one **main kharisma identity** loaded from configuration
plus one XMTP identity per group it has ever created (generated at
`create-group` time, persisted encrypted on disk). All of that plumbing is
internal; external clients interact with the service exclusively via the
content types defined in `@kharisma/protocol`
(see `packages/protocol/SKILL.md`).

`packages/protocol/SKILL.md` is the canonical XMTP-only protocol spec for
agents. The main discovery DM and each circle sync DM can also serve a generated
skill with channel-specific context via `skill-request/1`.

## What it does today

- Boot the main XMTP client from `GROUPS_KHARISMA_PRIVATE_KEY`.
- Rehydrate every persisted group's XMTP client.
- Listen to `streamAllMessages()` on every client, route inbound messages
  through the protocol state machines, and reply with the appropriate
  content type.
- Supported operations:
  - `skill-request/1` -> `skill-response/1`.
  - `hello/2` -> authenticate DM.
  - `list-groups-request/1` -> `list-groups-response/2`.
  - `create-group-request/2` -> mint a new per-group identity, start its
    XMTP client, create its MLS group, persist, reply with
    `create-group-response/1` (H only).
  - `join-request/2` on a sync DM -> verify status/name/uniqueness,
    add sender to the MLS group, reply with `join-response/1`, and
    publish `member-joined/1` to the shared group channel.
  - `investment-config-request/1` and `investment-submit/1` on a sync DM ->
    return configured payment rails, verify ERC-20 transfers onchain, record
    ledger rows, and publish `investment-recorded/1` to the shared group
    channel.

## Running

```sh
cp apps/groups-service/.env.example apps/groups-service/.env.local
# fill in values
pnpm --filter @kharisma/protocol build
pnpm --filter groups-service dev
```

`@kharisma/protocol` must be built before the service starts because
the service imports from its `dist/` output. During active development
of the protocol run `pnpm --filter @kharisma/protocol build:watch` in
a second terminal.

### Investment verification

Investment submissions arrive on the group sync DM using the
`investment-submit/1` content type. Verification uses these optional env vars:

```sh
GROUPS_INVESTMENT_DESTINATION_ADDRESS=0x...
GROUPS_INVESTMENT_CONFIRMATIONS=1

GROUPS_WORLD_RPC_URL=...
GROUPS_WORLD_BUNDLER_RPC_URL=...
GROUPS_WORLD_CHAIN_ID=480
GROUPS_WORLD_WLD_ADDRESS=0x...
GROUPS_WORLD_USDC_ADDRESS=0x...

GROUPS_BASE_RPC_URL=...
GROUPS_BASE_BUNDLER_RPC_URL=...
GROUPS_BASE_CHAIN_ID=8453
GROUPS_BASE_WLD_ADDRESS=0x...
GROUPS_BASE_USDC_ADDRESS=0x...
```

## Persistence layout

```
<GROUPS_DATA_ROOT>/
├── groups.db                 # group metadata, members, identities, investments
└── xmtp/
    ├── main/<address>/client.db3
    └── groups/<groupId>/client.db3
```

`groups.json` never contains raw key material: every per-group private
key is wrapped with AES-256-GCM using `GROUPS_STORAGE_ENCRYPTION_KEY_HEX`.
