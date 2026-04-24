import { hashSignal } from "@worldcoin/idkit-core/hashing";
import type {
  AuthenticatedRole,
  HumanAgentSubmitPayload,
  HumanSubmitPayload,
  IdentitySubmitPayload,
  VerificationAckPayload,
  WalletStatusResponsePayload,
} from "@kharisma/protocol";
import type { AppLogger } from "../logging.js";
import type { GroupStore } from "../storage/store.js";

type WorldIdResponseEntry = {
  signal_hash?: string;
  nullifier?: string;
  session_nullifier?: string[];
};

type WorldIdIdKitResultLike = {
  action?: string;
  responses?: WorldIdResponseEntry[];
};

function isWorldIdIdKitResultLike(
  proof: unknown,
): proof is WorldIdIdKitResultLike {
  return (
    !!proof &&
    typeof proof === "object" &&
    "responses" in proof &&
    Array.isArray((proof as { responses?: unknown }).responses)
  );
}

function extractIdkitResult(proof: unknown): WorldIdIdKitResultLike | null {
  if (isWorldIdIdKitResultLike(proof)) {
    return proof;
  }
  if (
    proof &&
    typeof proof === "object" &&
    "idkitResult" in proof &&
    isWorldIdIdKitResultLike((proof as { idkitResult?: unknown }).idkitResult)
  ) {
    return (proof as { idkitResult: WorldIdIdKitResultLike }).idkitResult;
  }
  return null;
}

export class VerificationService {
  constructor(
    private readonly store: GroupStore,
    private readonly rpId: string,
    private readonly logger: AppLogger,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly verifyUrlBase = "https://developer.world.org/api/v4/verify",
  ) {}

  getWalletStatus(walletAddress: string): WalletStatusResponsePayload {
    const status = this.store.resolveWalletStatus(walletAddress);
    return {
      walletAddress: status.walletAddress,
      status: status.status,
      verificationLevel: status.verificationLevel,
      humanId: status.humanId,
      agentId: status.agentId,
      handle: status.handle,
    };
  }

  resolveSenderStatus(walletAddress: string, inboxId: string) {
    return this.store.resolveSenderStatus(walletAddress, inboxId);
  }

  async submitIdentity(
    input: IdentitySubmitPayload & { senderInboxId: string },
  ): Promise<VerificationAckPayload> {
    try {
      const identityKey = await this.verifyProof(
        input.proof,
        "identity",
        input.senderInboxId,
      );
      const status = this.store.putWalletIdentity({
        walletAddress: input.walletAddress,
        inboxId: input.senderInboxId,
        identityKey,
        verifiedAt: new Date().toISOString(),
      });
      return this.okAck("identity", status.walletAddress, status);
    } catch (error) {
      return this.errorAck("identity", input.walletAddress, error);
    }
  }

  async submitHuman(
    input: HumanSubmitPayload & { senderInboxId: string },
  ): Promise<VerificationAckPayload> {
    try {
      const current = this.store.resolveSenderStatus(
        input.walletAddress,
        input.senderInboxId,
      );
      if (current.verificationLevel === "none") {
        throw new Error("identity verification must succeed before human");
      }
      const identityKey = await this.verifyProof(
        input.proof,
        "human",
        input.senderInboxId,
      );
      const status = this.store.registerHuman({
        walletAddress: input.walletAddress,
        inboxId: input.senderInboxId,
        identityKey,
        handle: input.handle,
        verifiedAt: new Date().toISOString(),
      });
      return this.okAck("human", status.walletAddress, status);
    } catch (error) {
      return this.errorAck("human", input.walletAddress, error);
    }
  }

  async submitHumanAgent(
    input: HumanAgentSubmitPayload & { senderInboxId: string },
  ): Promise<VerificationAckPayload> {
    try {
      const current = this.store.resolveSenderStatus(
        input.walletAddress,
        input.senderInboxId,
      );
      if (current.verificationLevel === "none") {
        throw new Error(
          "identity verification must succeed before human-agent",
        );
      }
      const identityKey = await this.verifyProof(
        input.proof,
        "human-agent",
        input.senderInboxId,
      );
      const status = this.store.registerHumanAgent({
        walletAddress: input.walletAddress,
        inboxId: input.senderInboxId,
        identityKey,
        ownerHumanId: input.ownerHumanId,
        handle: input.handle,
        verifiedAt: new Date().toISOString(),
      });
      return this.okAck("human-agent", status.walletAddress, status);
    } catch (error) {
      return this.errorAck("human-agent", input.walletAddress, error);
    }
  }

  authenticateHello(
    walletAddress: string,
    senderInboxId: string,
    role: AuthenticatedRole,
  ) {
    const status = this.store.resolveSenderStatus(walletAddress, senderInboxId);
    if (status.status !== role) {
      return {
        ok: false as const,
        reason:
          status.status === "UNKNOWN"
            ? "wallet is not registered for this role"
            : `wallet resolves to ${status.status}, not ${role}`,
      };
    }
    return { ok: true as const, status };
  }

  private okAck(
    action: VerificationAckPayload["action"],
    walletAddress: string,
    status: ReturnType<GroupStore["resolveWalletStatus"]>,
  ): VerificationAckPayload {
    return {
      action,
      walletAddress,
      status: "ok",
      resolvedStatus: status.status,
      verificationLevel: status.verificationLevel,
      humanId: status.humanId,
      agentId: status.agentId,
      handle: status.handle,
    };
  }

  private errorAck(
    action: VerificationAckPayload["action"],
    walletAddress: string,
    error: unknown,
  ): VerificationAckPayload {
    const message =
      error instanceof Error ? error.message : "verification failed";
    const code = message.includes("before")
      ? "verification-order"
      : "verification-required";
    return {
      action,
      walletAddress,
      status: "error",
      resolvedStatus: "UNKNOWN",
      verificationLevel: "none",
      humanId: null,
      agentId: null,
      handle: null,
      error: {
        code,
        message,
      },
    };
  }

  private async verifyProof(
    proof: unknown,
    expectedAction: VerificationAckPayload["action"],
    senderInboxId: string,
  ): Promise<string> {
    const idkitResult = extractIdkitResult(proof);
    if (!idkitResult) {
      throw new Error("proof payload is missing an IDKit result");
    }
    if (idkitResult.action !== expectedAction) {
      throw new Error(`expected ${expectedAction} proof`);
    }
    if (!this.rpId) {
      throw new Error("WORLD_ID_RP_ID is not configured; cannot verify proof");
    }
    if (!Array.isArray(idkitResult.responses) || idkitResult.responses.length === 0) {
      throw new Error("IDKit result has no responses");
    }

    const expectedSignalHash = hashSignal(senderInboxId).toLowerCase();
    const signalHash = idkitResult.responses[0].signal_hash?.toLowerCase();
    if (!signalHash || signalHash !== expectedSignalHash) {
      throw new Error("world-id signal does not match sender inbox");
    }

    const response = await this.fetchImpl(`${this.verifyUrlBase}/${this.rpId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(idkitResult),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.warn(
        { action: expectedAction, status: response.status, body: text },
        "World ID verification rejected",
      );
      throw new Error(`world-id verify ${response.status}`);
    }

    const identityKey =
      idkitResult.responses[0].nullifier ??
      idkitResult.responses[0].session_nullifier?.[0];
    if (!identityKey) {
      throw new Error("proof response did not include an identity key");
    }
    return identityKey;
  }
}
