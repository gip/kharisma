# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kharisma — a pnpm monorepo for XMTP-based investment coordination on World Chain. Verified humans (via World ID) lead groups; human agents participate with limited roles. See `README.md` for product thesis and `AGENTS.md` for architecture boundaries.

## Workspaces

- `apps/web` — Next.js browser app. Wallet login (MetaMask, Coinbase Wallet, Privy, World App) normalized behind `UniversalSigner`, session UX, backend-managed XMTP chat UI.
- `apps/clients-service` — Hono/Node backend for the web app. Owns bearer-session auth, signature-challenge verification, backend-owned XMTP clients, per-user SQLite storage, conversation HTTP APIs, websocket event fanout, and optional x402 payment protection on XMTP routes.
- `apps/groups-service` — Server-owned XMTP service implementing the Kharisma group protocol. Runs one main Kharisma XMTP identity plus one generated identity per group; verifies World ID Human claims; stubs World AgentKit verification.
- `packages/protocol` — Shared `@kharisma/protocol` package: XMTP content types, codecs, roles, claim envelopes, errors, pure state machines for main and sync channels. Consumed via built `dist/` output.

## Commands

```sh
pnpm install

pnpm dev                 # same as pnpm dev:web
pnpm dev:web             # apps/web
pnpm dev:backend         # apps/clients-service
pnpm dev:groups          # builds protocol first, then apps/groups-service

pnpm build               # builds protocol → web → clients-service → groups-service
pnpm build:protocol | build:web | build:backend | build:groups

pnpm typecheck           # builds protocol, then typechecks all workspaces
pnpm typecheck:protocol | typecheck:web | typecheck:backend | typecheck:groups

pnpm test                # runs all workspace test suites (vitest)
pnpm test:protocol | test:web | test:backend | test:groups

# run a single test file
pnpm --filter web vitest run src/wallet/worldapp-signer.test.ts
```

`groups-service` imports `@kharisma/protocol` from its built `dist/`. Rebuild the protocol package after edits, or run `pnpm --filter @kharisma/protocol build:watch` during active protocol work.

## Architecture Notes

### Wallet abstraction (`apps/web/src/wallet/`)

`UniversalSigner` (`universal-signer.ts`) is a minimal `{ getAddress, signMessage }` interface. Three backends:

- `Eip1193Signer` — any EIP-1193 provider (MetaMask, Coinbase Wallet via wagmi, Privy embedded wallets)
- `LocalAccountSigner` — viem `LocalAccount` from a raw private key
- `WorldAppSigner` — `@worldcoin/minikit-js` signing inside World App

`signer-factory.ts` builds signers from Privy wallets or private keys. Connection logic (wagmi connectors, MetaMask mobile SDK, MiniKit init) lives alongside.

### Web runtime (`apps/web/src/`)

- `components/session-provider.tsx` — `SessionProvider` context orchestrates wallet connection, session recovery, challenge signing, and logout. Exposes `useSession()`.
- `components/app-providers.tsx` — provider stack: `QueryClientProvider` > `WagmiProvider` > `KharismaPrivyProvider` > `SessionProvider`.
- `auth/login-method.ts` — persists the last-used login method in localStorage for reload recovery.
- `backend/` — typed client for `clients-service` HTTP + `/ws` websocket.
- `xmtp/` — browser-side handlers for `xmtp.signature_requested` flows.
- Pages: `/` (login), `/session` (post-login UX).

### clients-service (`apps/clients-service/src/`)

- `auth/` — SIWE-style challenge + bearer session issuance. Verifies EOA signatures locally and SCW (ERC-1271) signatures via configured RPC (`RPC_URL_WORLDCHAIN` for World App / MiniKit).
- `xmtp/` — `RemoteWalletSigner` that proxies XMTP client signature requests to the connected browser over the websocket.
- `ws/hub.ts` — authenticated `/ws` fanout for `xmtp.signature_requested`, conversation/message events.
- `http/routes/` — conversation, kharisma, media, xmtp, public, and session routes.
- `http/x402.ts` — x402 payment middleware (see Payments below).
- Persists `<DATA_ROOT>/app/backend.sqlite` plus per-user XMTP DBs at `<DATA_ROOT>/xmtp/<wallet-address>/client.db3`.

### groups-service (`apps/groups-service/src/`)

- `channels/` — main-channel (status/verification/discovery/creation) and sync-channel (join) handlers.
- `verification/` — `VerificationService`: handles `wallet-status`, `identity-submit`, `human-submit`, `human-agent-submit`. Calls World ID `/api/v4/verify/{rpId}` and binds proofs to `senderInboxId` via `signal_hash`. Persists wallet→identity, human, and human-agent records in the group store.
- `groups/` — group creation + join logic (with `joinPolicy` and `maxMembers` enforcement), encrypted metadata persistence.
- `storage/` — group registry and crypto helpers.
- Persists `<GROUPS_DATA_ROOT>/groups.db` plus per-group XMTP DBs under `<GROUPS_DATA_ROOT>/xmtp/`.

### protocol (`packages/protocol/src/`)

- `content-types/` — XMTP codecs for `wallet-status-*/2`, `identity-submit/2`, `human-submit/2`, `human-agent-submit/2`, `verification-ack/2`, `hello/2`, `list-groups-*`, `create-group-*`, `join-*`, `member-joined/1`, `error/1`, `sync`.
- `state-machine/` — pure state transitions for main and sync channels.
- `roles.ts` (`Role`, `RegistrationStatus`, `VerificationLevel`), `names.ts`, `languages.ts`, `errors.ts` — shared domain types.
- See `packages/protocol/SKILL.md` for the wire spec.

## Runtime Flow (login + XMTP bootstrap)

1. Browser picks a wallet, wraps it as `UniversalSigner`.
2. `POST /auth/challenge` → user signs → `POST /auth/verify` → JWT session.
3. Browser opens `/ws` with the session token.
4. `POST /xmtp/bootstrap` loads or creates the user's backend-owned XMTP client.
5. When XMTP needs a wallet signature, backend emits `xmtp.signature_requested`; browser signs and replies with `xmtp.signature_submit`.
6. Backend streams conversation/message events over the websocket.

Group protocol runs separately over XMTP. Identity is staged: `wallet-status` → `identity-submit` → `human-submit` (or `human-agent-submit`) → `hello/2` authenticates against the previously-registered status. Then `list/create` → per-group sync DM → `join` → `member-joined/1`. Groups carry `joinPolicy` (`H_ONLY` | `H_AND_HA` | `H_HA_AND_A`) and `maxMembers`.

## Payments (x402)

XMTP HTTP routes in `clients-service` can be gated by **x402** (`src/http/x402.ts`) using `@x402/core`, `@x402/evm` (`exact` + `upto` schemes), and `@x402/hono`.

- Gated only when `X402_ENABLED=true`. Default `false`: config loads but facilitator is never contacted and no payment is required.
- Protected routes: `POST /xmtp/bootstrap`, `GET /conversations`, `GET /conversations/:id/messages`, `POST /messages/send`, `POST /kharisma/groups/list|groups|groups/join`, `POST /conversations/:id/read`.
- Always unprotected: `/healthz`, auth, `/ws`, `/admin/xmtp/clients`.
- Config: `X402_FACILITATOR_URL` (default `https://x402.org/facilitator`), `X402_NETWORK` (default Base Sepolia `eip155:84532`), `X402_PAY_TO`, `X402_PRICE_USD` (default `$0.01`).
- Requests with a non-empty `Agentkit` header bypass payment — placeholder for future AgentKit discount/bypass logic.
- `packages/protocol` has **no** payment primitives; payments are strictly an HTTP-boundary concern.

## Environment

Copy the three `.env.example` files:

```sh
cp apps/web/.env.example apps/web/.env.local
cp apps/clients-service/.env.example apps/clients-service/.env.local
cp apps/groups-service/.env.example apps/groups-service/.env.local
```

Service-specific READMEs list required values. Web features gate on `NEXT_PUBLIC_PRIVY_APP_ID` and `NEXT_PUBLIC_WORLD_APP_ID`. `clients-service` needs `RPC_URL_WORLDCHAIN` (chain 480) for World App / MiniKit ERC-1271 verification.

Never commit `.env.local`, `.data`, `dist`, `.next`, or `node_modules`.

## Testing

Vitest across all workspaces. `apps/web` uses jsdom; `@` alias resolves to `apps/web/src`. Test files are co-located as `*.test.ts` / `*.test.tsx`.

## Working Notes

- Keep wallet/browser UX in `apps/web`; web-user auth + backend XMTP hosting in `apps/clients-service`; group-domain logic in `apps/groups-service`; wire formats + pure state machines in `packages/protocol`. Do not duplicate content-type IDs or payload shapes in app code.
- Protocol changes must stay in sync across `packages/protocol`, `apps/groups-service`, and any client consumers. Rebuild the protocol package after edits.
- Preserve unrelated changes in a dirty worktree.
- For docs-only changes, `pnpm typecheck` (or a targeted variant) is usually sufficient verification.
