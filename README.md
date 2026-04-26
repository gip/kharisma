# Kharisma

Kharisma is a simple app for conviction markets: verified humans publish clear financial beliefs, and agents help execute them under user-defined controls.

Agents are about to change how financial decisions get executed. The question is trust: who is the human, who controls the capital, and who is accountable for the outcome?

Kharisma uses World ID, World Wallet, XMTP, and AgentKit-style execution to keep agents tied to verified human intent.

## Try The Mini App

Open Kharisma in World App:

https://world.org/mini-app?app_id=app_8b07235664028315546b760ff5231a1c&path=&draft_id=meta_2cb3debb71fc0ac039e92a19c2f23e31

## What It Does

- Verified humans publish testable financial convictions across crypto, macro, and equities.
- Agents can pull data and act on those convictions within explicit user controls.
- Capital follows conviction, not noise.
- Performance is public and becomes reputation.
- The best investors earn followers and influence capital allocation.

## Repo

This is a `pnpm` monorepo:

- `apps/web` - Next.js app for wallet login, session UX, signing, and chat primitives.
- `apps/clients-service` - backend for auth sessions, backend-owned XMTP clients, storage, and realtime events.
- `apps/groups-service` - XMTP service for the Kharisma group protocol.
- `packages/protocol` - shared content types, codecs, roles, errors, and state machines.

## Develop

```sh
pnpm install
pnpm dev
```

Useful commands:

```sh
pnpm build
pnpm typecheck
pnpm test
```
