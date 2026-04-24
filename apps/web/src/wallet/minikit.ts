import { MiniKit } from "@worldcoin/minikit-js";
import { setLastLoginMethod } from "@/auth/login-method";
import type { BackendApiClient } from "@/backend/client";
import type { AuthVerifyResponse } from "@/backend/types";
import { WorldAppSigner } from "./worldapp-signer";

// World App wallets are smart contract wallets deployed on World Chain.
// ERC-1271 verification requires this chain id.
export const WORLD_APP_CHAIN_ID = 480;

// Statement shown inside the World App SIWE consent screen.
// Must match the constant the backend hands to `verifySiweMessage`.
// See apps/clients-service/src/auth/siwe-verifier.ts.
export const WORLD_APP_SIWE_STATEMENT = "Sign in to Kharisma";

// Validity window for the SIWE message. Mirrors the value used in the
// canonical example at https://docs.world.org/mini-apps/commands/wallet-auth.
const WORLD_APP_SIWE_EXPIRATION_MS = 60 * 60 * 1000;

/**
 * Synchronous check — `window.WorldApp` is injected by the native
 * container before any JS executes, so this returns the correct
 * answer on the very first frame.
 */
export function isWorldApp(): boolean {
  return MiniKit.isInWorldApp();
}

export function initializeMiniKit(appId: string) {
  if (typeof window === "undefined") {
    return {
      enabled: false,
      reason: "Checking World App environment",
    };
  }

  if (!isWorldApp()) {
    return {
      enabled: false,
      reason: "Wallet Auth only works inside World App",
    };
  }

  const result = MiniKit.install(appId);
  if (!result.success) {
    return {
      enabled: false,
      reason: result.errorMessage,
    };
  }

  return { enabled: true as const };
}

export type WorldAppAuthResult = {
  address: `0x${string}`;
  signer: WorldAppSigner;
  token: string;
  session: AuthVerifyResponse["session"];
};

/**
 * Run the full World App login flow end-to-end:
 *   1. Initialize MiniKit.
 *   2. Fetch a backend-issued nonce.
 *   3. Have World App build + sign a SIWE message via `walletAuth`.
 *   4. Post the SIWE message + signature to the backend for ERC-1271
 *      verification and session issuance.
 *
 * The backend does NOT ask the client to sign a separate challenge — World
 * App's `signMessage` rejects SIWE payloads with `generic_error`. Using the
 * SIWE message produced by `walletAuth` directly avoids a second prompt and
 * the associated failure.
 */
export async function authenticateWithWorldApp(
  worldAppId: string,
  api: BackendApiClient,
): Promise<WorldAppAuthResult> {
  const availability = initializeMiniKit(worldAppId);
  if (!availability.enabled) {
    throw new Error(availability.reason);
  }

  const challenge = await api.requestSiweNonce({
    loginMethod: "world-miniapp",
  });

  const walletAuthResult = (await MiniKit.walletAuth({
    nonce: challenge.nonce,
    statement: WORLD_APP_SIWE_STATEMENT,
    expirationTime: new Date(Date.now() + WORLD_APP_SIWE_EXPIRATION_MS),
  })) as {
    data:
      | { status: "success"; address: string; message: string; signature: string }
      | { status: "error"; error_code: string; details?: string };
  };

  if (walletAuthResult.data.status === "error") {
    throw new Error(
      `World App wallet auth failed: ${walletAuthResult.data.error_code}`,
    );
  }

  const address = walletAuthResult.data.address as `0x${string}`;

  const verified = await api.verifySiwe({
    challengeId: challenge.challengeId,
    address,
    message: walletAuthResult.data.message,
    signature: walletAuthResult.data.signature as `0x${string}`,
  });

  setLastLoginMethod("world-miniapp");

  return {
    address,
    signer: new WorldAppSigner(address),
    token: verified.token,
    session: verified.session,
  };
}
