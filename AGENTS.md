# AGENTS.md

This file guides coding agents working in this repository.

## Project Overview

Kharisma is a `pnpm` monorepo for XMTP-based investment coordination on World Chain.

The repo is no longer a frontend-only wallet example. It currently contains:

- `apps/web`
  Next.js browser app for wallet login, session UX, message signing, and backend-managed XMTP chat primitives. Wallet integrations are normalized behind `src/wallet/universal-signer.ts`.
- `apps/clients-service`
  Hono/Node backend used by the web app. It owns web users' XMTP node clients, durable per-user XMTP SQLite storage, auth sessions, realtime websocket events, and optional x402 protection for XMTP HTTP routes.
- `apps/groups-service`
  Server-owned XMTP service that implements the Kharisma group protocol. It runs one main Kharisma identity and one generated XMTP identity per group.
- `packages/protocol`
  Shared `@kharisma/protocol` package with XMTP content types, codecs, roles, claim types, errors, and pure state machines.

## Commands

Run commands from the repo root unless a task explicitly says otherwise.

```sh
pnpm install

pnpm dev                 # same as pnpm dev:web
pnpm dev:web             # apps/web
pnpm dev:backend         # apps/clients-service
pnpm dev:groups          # build protocol, then apps/groups-service

pnpm build               # build protocol, web, clients-service, groups-service
pnpm build:protocol
pnpm build:web
pnpm build:backend
pnpm build:groups

pnpm typecheck
pnpm typecheck:protocol
pnpm typecheck:web
pnpm typecheck:backend
pnpm typecheck:groups

pnpm test
pnpm test:protocol
pnpm test:web
pnpm test:backend
pnpm test:groups
```

`groups-service` imports `@kharisma/protocol` from its built `dist/` output, so build the protocol package before running or building `groups-service`. For active protocol work, use:

```sh
pnpm --filter @kharisma/protocol build:watch
```

## Architecture Boundaries

- Keep web UX, wallet selection, wallet-specific signing adapters, and browser session orchestration in `apps/web`.
- Keep web-user authentication, bearer sessions, `RemoteWalletSigner`, backend-owned XMTP clients, per-user XMTP DBs, conversation HTTP APIs, and websocket event fanout in `apps/clients-service`.
- Keep group lifecycle, main/sync/group channel handling, claim verification, member persistence, and server-owned group XMTP identities in `apps/groups-service`.
- Keep shared wire formats and pure protocol state transitions in `packages/protocol`. Do not duplicate content type IDs, payload shapes, or state machine rules in app code when they belong in this package.

## Runtime Model

The web app signs into `clients-service` first:

1. The browser creates a `UniversalSigner` from MetaMask, Coinbase Wallet, Privy, or World App.
2. The browser requests `/auth/challenge`, signs the message, and submits `/auth/verify`.
3. `clients-service` verifies EOA signatures locally or SCW signatures through configured RPC, then returns a JWT-backed session.
4. The browser authenticates `/ws` with that session token.
5. When backend XMTP client creation needs a wallet signature, `clients-service` sends `xmtp.signature_requested` over the websocket.
6. The browser signs with the active wallet and returns `xmtp.signature_submit`.

The group protocol is XMTP-native:

1. `groups-service` exposes a main Kharisma XMTP inbox.
2. Clients authenticate on a main-channel DM with `hello/1`.
3. Authenticated clients list groups; role `H` can create groups.
4. Joining happens on a per-group sync DM with `join-request/1`.
5. Successful joins add the sender to the MLS group and publish `member-joined/1`.

The current web UI does not yet implement the full `groups-service` protocol flow.

## Environment And State

Local env files are expected at:

```sh
apps/web/.env.local
apps/clients-service/.env.local
apps/groups-service/.env.local
```

Do not commit local secrets or generated runtime state. In particular, avoid committing:

- `.env.local`
- `.data`
- `dist`
- `.next`
- `node_modules`

`clients-service` stores metadata in `<DATA_ROOT>/app/backend.sqlite` and per-user XMTP DBs under `<DATA_ROOT>/xmtp/<wallet-address>/client.db3`.

`groups-service` stores group metadata in `<GROUPS_DATA_ROOT>/groups.db` and XMTP DBs under `<GROUPS_DATA_ROOT>/xmtp/`.

## Working Notes

- Preserve user changes in a dirty worktree. Do not revert unrelated edits.
- Prefer repo-local patterns over new abstractions.
- Keep protocol changes synchronized across `packages/protocol`, `apps/groups-service`, and any client code that consumes the content types.
- For docs-only changes, verification can usually be limited to review plus `pnpm typecheck` or targeted typechecks when needed.
