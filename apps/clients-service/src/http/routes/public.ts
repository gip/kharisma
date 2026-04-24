import { randomBytes } from "node:crypto";
import { getAddress, type Hex } from "viem";
import { buildChallengeMessage } from "../../auth/challenge.js";
import { createSessionToken } from "../../auth/session.js";
import { WORLD_APP_SIWE_STATEMENT } from "../../auth/siwe-verifier.js";
import type { AppServices, BackendAppEnv } from "../../backend-types.js";
import { readJsonRecord } from "../request.js";
import type { Hono } from "hono";

function normalizeAddress(address: string) {
  return getAddress(address) as `0x${string}`;
}

export function registerPublicRoutes(app: Hono<BackendAppEnv>, services: AppServices) {
  app.get("/healthz", (c) =>
    c.json({
      ok: true,
      now: new Date().toISOString(),
    }),
  );

  app.post("/auth/challenge", async (c) => {
    const parsed = await readJsonRecord(c);

    if (parsed.response) {
      return parsed.response;
    }

    const walletAddress = parsed.body.walletAddress;
    const loginMethod = parsed.body.loginMethod;
    const chainId = parsed.body.chainId;

    if (typeof walletAddress !== "string" || typeof loginMethod !== "string") {
      return c.json({ error: "walletAddress and loginMethod are required" }, 400);
    }

    try {
      const normalizedWalletAddress = normalizeAddress(walletAddress);
      const nonce = randomBytes(16).toString("hex");
      const issuedAt = new Date().toISOString();
      const expiresAt = new Date(
        Date.now() + services.config.authChallengeTtlMs,
      ).toISOString();

      const challengeId = randomBytes(12).toString("hex");
      const message = buildChallengeMessage({
        appOrigin: services.config.appOrigin,
        walletAddress: normalizedWalletAddress,
        chainId: typeof chainId === "number" ? chainId : null,
        loginMethod,
        nonce,
        challengeId,
        issuedAt,
        expiresAt,
      });

      const storedId = services.database.createAuthNonce({
        id: challengeId,
        walletAddress: normalizedWalletAddress,
        chainId: typeof chainId === "number" ? chainId : null,
        loginMethod,
        nonce,
        message,
        expiresAt,
      });

      return c.json({
        challengeId: storedId,
        message,
        expiresAt,
      });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Invalid wallet address",
        },
        400,
      );
    }
  });

  app.post("/auth/verify", async (c) => {
    const parsed = await readJsonRecord(c);

    if (parsed.response) {
      return parsed.response;
    }

    const challengeId = parsed.body.challengeId;
    const signature = parsed.body.signature;

    if (typeof challengeId !== "string" || typeof signature !== "string") {
      return c.json({ error: "challengeId and signature are required" }, 400);
    }

    const challenge = services.database.getAuthNonceById(challengeId);

    if (!challenge) {
      return c.json({ error: "Challenge not found" }, 404);
    }

    if (challenge.consumedAt) {
      return c.json({ error: "Challenge has already been consumed" }, 409);
    }

    if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
      return c.json({ error: "Challenge has expired" }, 410);
    }

    let verification;

    try {
      verification = await services.signatureVerifier.verify({
        address: challenge.walletAddress,
        message: challenge.message,
        signature: signature as Hex,
        chainId: challenge.chainId,
      });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Signature verification failed",
        },
        401,
      );
    }

    services.database.consumeAuthNonce(challenge.id);

    const user = services.database.upsertUser({
      walletAddress: challenge.walletAddress,
      walletAccountType: verification.accountType,
      walletChainId: verification.chainId,
    });

    const expiresAt = new Date(Date.now() + services.config.sessionTtlMs);
    const session = services.database.createSession({
      userId: user.id,
      walletAddress: user.walletAddress,
      expiresAt: expiresAt.toISOString(),
    });

    const token = createSessionToken({
      secret: services.config.sessionSecret,
      userId: user.id,
      sessionId: session.id,
      address: user.walletAddress,
      expiresAt,
    });

    return c.json({
      token,
      session: {
        userId: user.id,
        sessionId: session.id,
        walletAddress: user.walletAddress,
        walletAccountType: user.walletAccountType,
        walletChainId: user.walletChainId,
        expiresAt: session.expiresAt,
      },
    });
  });

  // Issue a raw nonce for SIWE-style flows (e.g. World App MiniKit walletAuth)
  // where the wallet builds the SIWE message itself. The client passes the
  // nonce into `walletAuth`, and returns the resulting {message, signature}
  // to /auth/siwe/verify.
  app.post("/auth/siwe/nonce", async (c) => {
    const parsed = await readJsonRecord(c);

    if (parsed.response) {
      return parsed.response;
    }

    const loginMethod = parsed.body.loginMethod;

    if (typeof loginMethod !== "string") {
      return c.json({ error: "loginMethod is required" }, 400);
    }

    const nonce = randomBytes(16).toString("hex");
    const challengeId = randomBytes(12).toString("hex");
    const expiresAt = new Date(
      Date.now() + services.config.authChallengeTtlMs,
    ).toISOString();

    const storedId = services.database.createSiweNonce({
      id: challengeId,
      nonce,
      loginMethod,
      expiresAt,
    });

    return c.json({
      challengeId: storedId,
      nonce,
      expiresAt,
    });
  });

  app.post("/auth/siwe/verify", async (c) => {
    const parsed = await readJsonRecord(c);

    if (parsed.response) {
      return parsed.response;
    }

    const challengeId = parsed.body.challengeId;
    const address = parsed.body.address;
    const message = parsed.body.message;
    const signature = parsed.body.signature;

    if (
      typeof challengeId !== "string" ||
      typeof address !== "string" ||
      typeof message !== "string" ||
      typeof signature !== "string"
    ) {
      return c.json(
        { error: "challengeId, address, message and signature are required" },
        400,
      );
    }

    const challenge = services.database.getSiweNonceById(challengeId);

    if (!challenge) {
      return c.json({ error: "Challenge not found" }, 404);
    }

    if (challenge.consumedAt) {
      return c.json({ error: "Challenge has already been consumed" }, 409);
    }

    if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
      return c.json({ error: "Challenge has expired" }, 410);
    }

    let normalizedAddress: `0x${string}`;
    try {
      normalizedAddress = normalizeAddress(address);
    } catch {
      return c.json({ error: "Invalid wallet address" }, 400);
    }

    // Delegate to @worldcoin/minikit-js' `verifySiweMessage` — the canonical
    // server-side verifier from the docs. It parses the SIWE payload,
    // validates that the message's embedded nonce + statement match what we
    // issued, attempts EOA recovery, and falls back to ERC-1271 on worldchain.
    let verification;

    try {
      verification = await services.siweVerifier.verify(
        {
          address: normalizedAddress,
          message,
          signature: signature as Hex,
        },
        challenge.nonce,
        WORLD_APP_SIWE_STATEMENT,
      );
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Signature verification failed",
        },
        401,
      );
    }

    services.database.consumeSiweNonce(challenge.id);

    const user = services.database.upsertUser({
      walletAddress: normalizedAddress,
      walletAccountType: "SCW",
      walletChainId: verification.chainId,
    });

    const expiresAt = new Date(Date.now() + services.config.sessionTtlMs);
    const session = services.database.createSession({
      userId: user.id,
      walletAddress: user.walletAddress,
      expiresAt: expiresAt.toISOString(),
    });

    const token = createSessionToken({
      secret: services.config.sessionSecret,
      userId: user.id,
      sessionId: session.id,
      address: user.walletAddress,
      expiresAt,
    });

    return c.json({
      token,
      session: {
        userId: user.id,
        sessionId: session.id,
        walletAddress: user.walletAddress,
        walletAccountType: user.walletAccountType,
        walletChainId: user.walletChainId,
        expiresAt: session.expiresAt,
      },
    });
  });
}
