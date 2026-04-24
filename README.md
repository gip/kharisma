# Kharisma

Kharisma is a social investment coordination layer on World Chain. Verified human leads use Proof of Human to launch trusted investment groups, publish kharisma-driven content, and coordinate collective positions. Verified Human Agents can participate in discussion and voting with limited roles, but they do not lead groups.

The product is built around a simple trust assumption: group investing fails when the people coordinating capital are anonymous, duplicated, or unaccountable. Kharisma uses World ID to anchor group leadership in real, unique humans, XMTP to power private coordination between leads, members, and agents, and value-distribution mechanics such as gated access and aligned incentives to make participation economically coherent.

## Product Thesis

Kharisma combines three ideas into one product:

- Human curation: trusted humans publish signals, theses, and kharisma-driven content that communities can evaluate and act on.
- Human and agent coordination: XMTP provides the messaging layer for group discussion, lead-to-community communication, and agent participation.
- Value distribution: access, incentives, and participation can be gated or aligned through onchain primitives from the start.

The social layer exists to serve investment coordination, not the other way around.

## Architecture

This repo is a `pnpm` monorepo with separate packages for web UX, web-specific XMTP client hosting, group-domain protocol automation, and shared XMTP wire formats.

- `apps/web`
  Next.js browser app for wallet login, session UX, message signing, and backend-managed XMTP chat primitives. It wraps MetaMask, Coinbase Wallet, Privy, and World App login paths behind a shared `UniversalSigner`.
- `apps/clients-service`
  Hono/Node backend for the web app. It owns web users' XMTP node clients, bearer sessions, signature challenge verification, per-user XMTP SQLite storage, conversation APIs, websocket events, and optional x402 protection for XMTP HTTP routes.
- `apps/groups-service`
  Server-owned XMTP service that implements the Kharisma group protocol. It owns one main Kharisma identity plus one generated XMTP identity per group, verifies World ID Human claims, stubs future World AgentKit verification safely, and coordinates group creation and joining over XMTP.
- `packages/protocol`
  Shared `@kharisma/protocol` package. It defines Kharisma XMTP content types, codecs, roles, claim envelopes, protocol errors, and pure state machines for main and sync channels.

Planned but not implemented:

- `apps/mobile`
  Future native or React Native client. Mobile is expected to own XMTP clients in-app rather than routing through `clients-service`.

The current split is intentional:

- Web relies on `clients-service` because browser users need a backend-owned XMTP node runtime and durable server-side storage.
- Mobile should eventually own XMTP locally and therefore should not depend on the web-specific `clients-service` in the same way.
- Group-domain behavior belongs in `groups-service`, while raw web-user XMTP client hosting belongs in `clients-service`.

## Runtime Flow

The main web login and XMTP bootstrap flow works like this:

1. The user opens `apps/web` and chooses MetaMask, Coinbase Wallet, Privy, or World App.
2. The web app wraps the selected wallet as a `UniversalSigner`.
3. The web app requests `POST /auth/challenge` from `clients-service`.
4. The user signs the challenge, and the web app submits it to `POST /auth/verify`.
5. `clients-service` verifies EOA signatures locally or Smart Contract Wallet signatures through the configured RPC URL, then returns a JWT-backed session.
6. The web app stores the backend session token and opens an authenticated websocket at `/ws`.
7. The web app calls `POST /xmtp/bootstrap` to load or create the user's backend-owned XMTP client.
8. When XMTP needs a wallet signature, `clients-service` uses `RemoteWalletSigner` and sends `xmtp.signature_requested` over the websocket.
9. The browser signs with the active wallet and replies with `xmtp.signature_submit`; `clients-service` verifies the signature and completes XMTP client creation.
10. `clients-service` streams new conversations and messages back to the browser as websocket events.

`clients-service` persists its shared metadata at `<DATA_ROOT>/app/backend.sqlite` and stores per-user XMTP DBs under `<DATA_ROOT>/xmtp/<wallet-address>/client.db3`.

The group protocol runs separately over XMTP, not over HTTP:

1. `groups-service` boots a configured main Kharisma XMTP identity.
2. Clients open a DM to that main inbox and send `hello/1` with a role claim.
3. Authenticated humans and human agents can send `list-groups-request/1`.
4. Authenticated humans can send `create-group-request/1`; the service creates a new per-group XMTP identity, creates an MLS group, persists encrypted group metadata, and returns a `syncInboxId`.
5. A user joins a group by opening a sync DM to the per-group inbox and sending `join-request/1` with a member name and claim.
6. On success, `groups-service` adds the sender to the shared MLS group, stores the member record, replies with `join-response/1`, and publishes `member-joined/1` to the group channel.

Today the web app can authenticate and use backend-managed XMTP chat primitives, but it does not yet implement the full group protocol UI/client flows against `groups-service`.

## Local Development

Install dependencies from the repo root:

```sh
pnpm install
```

Create local env files:

```sh
cp apps/web/.env.example apps/web/.env.local
cp apps/clients-service/.env.example apps/clients-service/.env.local
cp apps/groups-service/.env.example apps/groups-service/.env.local
```

Fill in the required values in each file. The service-specific READMEs list the relevant settings and persistence details:

- `apps/clients-service/README.md`
- `apps/groups-service/README.md`
- `packages/protocol/README.md`
- `packages/protocol/SKILL.md`

Start the main development processes:

```sh
pnpm dev:web
pnpm dev:backend
pnpm dev:groups
```

`pnpm dev:groups` builds `@kharisma/protocol` before starting `groups-service`. During active protocol development, run this in a separate terminal:

```sh
pnpm --filter @kharisma/protocol build:watch
```

## Commands

```sh
pnpm dev                 # same as pnpm dev:web
pnpm dev:web             # start apps/web
pnpm dev:backend         # start apps/clients-service
pnpm dev:groups          # build protocol, then start apps/groups-service

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

## Current Scope

Implemented today:

- wallet-authenticated web access
- backend-issued sign-in challenges and authenticated sessions
- backend-owned XMTP clients for web users
- durable per-user XMTP storage
- realtime websocket transport for XMTP signature requests, conversations, and messages
- shared Kharisma protocol codecs and state machines
- server-owned group discovery, creation, joining, membership persistence, and `member-joined/1` announcements over XMTP

Not implemented yet:

- native/mobile app
- full web UI for the `groups-service` protocol
- production World AgentKit claim verification for `HA` role claims
- voting/proposals and onchain value-distribution flows
