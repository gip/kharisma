# Clients Service

Node backend that owns XMTP clients and durable per-user storage.

## Requirements

- Node.js 22+
- Persistent volume for:
  - metadata SQLite DB
  - per-user XMTP SQLite DB directories
- `@xmtp/node-sdk` runtime requirements for your deployment target

## Env

- `PORT`
- `HOST`
- `LOG_LEVEL`
- `DATA_ROOT`
- `MEDIA_STORAGE_PROVIDER`
- `MEDIA_UPLOADS_DIR`
- `MEDIA_PUBLIC_BASE_URL`
- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `APP_ORIGIN`
- `CORS_ALLOWED_ORIGINS`
- `SESSION_SECRET`
- `MASTER_KEY_HEX`
- `XMTP_DB_ENCRYPTION_KEY_HEX`
- `ADMIN_TOKEN`
- `XMTP_ENV`
- `RPC_URL_MAINNET`
- `RPC_URL_OPTIMISM`
- `RPC_URL_BASE`
- `RPC_URL_WORLDCHAIN` (chain 480 — required for verifying World App / MiniKit signatures via ERC-1271)
- `X402_ENABLED`
- `X402_FACILITATOR_URL`
- `X402_NETWORK`
- `X402_PAY_TO`
- `X402_PRICE_USD`
- `KHARISMA_MAIN_ADDRESS`
- `KHARISMA_MAIN_INBOX_ID`
- `KHARISMA_REQUEST_TIMEOUT_MS`

## Local development

1. Copy `.env.example` to `.env.local` (or `.env` if you prefer).
2. Fill in the secrets and RPC URLs you need.
3. Run `pnpm install` at the repo root.
4. Start the backend with `pnpm --filter clients-service dev`.

The backend loads `.env` first and `.env.local` second, so `.env.local` can override shared local defaults.

`DATA_ROOT` must persist across restarts if you want durable XMTP installations.

`MEDIA_STORAGE_PROVIDER` defaults to `local`, which stores uploaded media under
`MEDIA_UPLOADS_DIR` or `uploads` in the backend process working directory. Set
`MEDIA_STORAGE_PROVIDER=r2` to store media in Cloudflare R2 instead. R2 mode
requires `MEDIA_PUBLIC_BASE_URL`, `R2_ACCOUNT_ID`, `R2_BUCKET`,
`R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Use a public custom domain for
`MEDIA_PUBLIC_BASE_URL`, such as `https://media.example.com`; the backend stores
objects under `uploads/<user-id>/<media-id>.<ext>` and publishes those URLs in
XMTP attachment messages.

`APP_ORIGIN` is used in the sign-in challenge message. `CORS_ALLOWED_ORIGINS`
controls which browser origins may call the backend and accepts a comma-separated
list. If omitted, the backend allows `APP_ORIGIN`, plus the matching
`localhost`/`127.0.0.1` alias for local development.

`LOG_LEVEL` controls backend log verbosity and accepts `trace`, `debug`, `info`,
`warn`, `error`, `fatal`, or `silent`. The backend defaults to `info`, emits
pretty logs on a local TTY, and emits JSON when stdout is not a TTY.

`KHARISMA_MAIN_ADDRESS` can point at the groups-service main wallet address;
the backend resolves it to an XMTP inbox ID before opening the protocol DM.
`KHARISMA_MAIN_INBOX_ID` remains supported when you already have the XMTP
inbox ID from the groups-service startup log.

The canonical Kharisma wire protocol is `packages/protocol/SKILL.md`.
It is XMTP-only; this backend's HTTP routes are convenience facades over the
XMTP messages defined there.

## x402

XMTP HTTP endpoints are always protected by bearer-session auth:

- `POST /xmtp/bootstrap`
- `GET /conversations`
- `GET /conversations/:conversationId/messages`
- `POST /messages/send`
- `POST /media/upload`
- `POST /messages/send-attachment`
- `POST /conversations/:conversationId/read`

Set `X402_ENABLED=true` to additionally protect those XMTP routes with x402.
When `X402_ENABLED=false` (the default), the backend still loads the x402
configuration but does not contact the facilitator or require payment.

`/healthz`, auth routes, `/ws`, and `/admin/xmtp/clients` remain outside x402
in either mode.

For local development, `https://x402.org/facilitator` currently supports Base
Sepolia (`eip155:84532`) rather than Base mainnet (`eip155:8453`). If you want
to run against Base mainnet, configure `X402_FACILITATOR_URL` to a facilitator
that advertises support for `eip155:8453`.

## Persistence model

- Shared metadata DB: `<DATA_ROOT>/app/backend.sqlite`
- Per-user XMTP directories: `<DATA_ROOT>/xmtp/<wallet-address>/client.db3`
- Local media uploads: `MEDIA_UPLOADS_DIR` or `./uploads`

Each wallet address gets its own XMTP DB directory. The SQLite encryption key is shared across wallets and comes from `XMTP_DB_ENCRYPTION_KEY_HEX`.
