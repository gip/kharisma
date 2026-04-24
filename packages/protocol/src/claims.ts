import type { AuthenticatedRole } from "./roles.js";

/**
 * A single entry inside the IDKit result's `responses` array.
 *
 * Supports both v3.0 legacy proofs (single proof string + `merkle_root`)
 * and v4.0 uniqueness/session proofs (proof array + `issuer_schema_id`).
 */
export type WorldIdResponseEntry = {
  identifier: string;
  signal_hash: string;
  proof: string | string[];
  /** Uniqueness nullifier (v3.0 and v4.0 uniqueness). */
  nullifier?: string;
  /** Session nullifiers (v4.0 session only). */
  session_nullifier?: string[];
  /** Merkle root (v3.0 legacy only). */
  merkle_root?: string;
  issuer_schema_id?: number;
  expires_at_min?: number;
};

/**
 * The full IDKit result payload, forwarded as-is to the World ID v4
 * verify endpoint. See https://docs.world.org/world-id/idkit/integrate.
 */
export type WorldIdIdKitResult = {
  protocol_version: string;
  nonce: string;
  action: string;
  environment: string;
  /** Present only for v4.0 session proofs. */
  session_id?: string;
  responses: WorldIdResponseEntry[];
};

export type WorldIdHumanClaim = {
  kind: "world-id-human";
  /** The complete IDKit result, forwarded to the verify API as-is. */
  idkitResult: WorldIdIdKitResult;
};

export type WorldAgentKitClaim = {
  kind: "world-agent-kit";
  /**
   * Opaque credential payload produced per
   * docs.world.org/agents/agent-kit/integrate.md. The protocol does not
   * interpret this field; it is handed to the agent-kit verifier as-is.
   */
  credential: unknown;
};

export type ClaimEnvelope = WorldIdHumanClaim | WorldAgentKitClaim;

export function isClaimEnvelope(value: unknown): value is ClaimEnvelope {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "world-id-human") {
    const claim = value as Partial<WorldIdHumanClaim>;
    return (
      !!claim.idkitResult &&
      typeof claim.idkitResult === "object" &&
      Array.isArray(claim.idkitResult.responses)
    );
  }
  if (kind === "world-agent-kit") {
    return "credential" in (value as object);
  }
  return false;
}

export type ClaimVerificationContext = {
  /** The XMTP inbox ID of the sender whose claim is being verified. */
  senderInboxId: string;
  /**
   * Optional group ID when the claim is being verified for a join on a
   * specific group. `undefined` on main-channel `hello/1` where no
   * group is involved yet.
   */
  groupId?: string;
};

export type ClaimVerificationResult =
  | { ok: true; role: AuthenticatedRole; nullifierHash?: string }
  | { ok: false; reason: string };

/**
 * An application-supplied verifier. Concrete implementations live in the
 * consuming apps because they depend on app config (API keys, network).
 */
export type ClaimVerifier = {
  verify(
    claim: ClaimEnvelope,
    declaredRole: AuthenticatedRole,
    context: ClaimVerificationContext,
  ): Promise<ClaimVerificationResult>;
};
