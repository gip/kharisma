import type { ContentTypeId } from "@xmtp/content-type-primitives";
import { contentTypeEquals } from "../content-types/helpers.js";
import {
  ContentTypeHumanAgentSubmit,
  ContentTypeHumanSubmit,
  ContentTypeIdentitySubmit,
  ContentTypeInvestmentConfigRequest,
  ContentTypeInvestmentSubmit,
  ContentTypeJoinRequest,
  ContentTypeSkillRequest,
  ContentTypeThreadCatalogRequest,
  ContentTypeWalletStatusRequest,
} from "../content-types/ids.js";
import { protocolError, type ProtocolError } from "../errors.js";

export type SyncChannelState =
  | { kind: "NEW" }
  | { kind: "JOINED" }
  | { kind: "REJECTED" };

export const initialSyncState: SyncChannelState = { kind: "NEW" };

export type SyncChannelCommand =
  | { kind: "wallet-status" }
  | { kind: "skill" }
  | { kind: "submit-identity" }
  | { kind: "submit-human" }
  | { kind: "submit-human-agent" }
  | { kind: "investment-config" }
  | { kind: "investment-submit" }
  | { kind: "thread-catalog" }
  | { kind: "attempt-join" };

export type SyncChannelTransition =
  | {
      ok: true;
      nextState: SyncChannelState;
      command: SyncChannelCommand;
    }
  | {
      ok: false;
      nextState: SyncChannelState;
      error: ProtocolError;
    };

/**
 * Pure reducer for the sync-channel DM state machine.
 *
 * The sync DM is a single-shot join handshake with pre-join verification.
 * `NEW` and `REJECTED` accept status queries, verification submissions,
 * and `join-request/1`. A successful join moves the DM to `JOINED`;
 * after that, status queries still work but verification and join attempts
 * return `already-member` to avoid stale group member roles.
 */
export function reduceSync(
  state: SyncChannelState,
  contentType: ContentTypeId,
): SyncChannelTransition {
  if (contentTypeEquals(contentType, ContentTypeWalletStatusRequest)) {
    return {
      ok: true,
      nextState: state,
      command: { kind: "wallet-status" },
    };
  }

  if (contentTypeEquals(contentType, ContentTypeSkillRequest)) {
    return {
      ok: true,
      nextState: state,
      command: { kind: "skill" },
    };
  }

  if (contentTypeEquals(contentType, ContentTypeInvestmentConfigRequest)) {
    return {
      ok: true,
      nextState: state,
      command: { kind: "investment-config" },
    };
  }

  if (contentTypeEquals(contentType, ContentTypeInvestmentSubmit)) {
    return {
      ok: true,
      nextState: state,
      command: { kind: "investment-submit" },
    };
  }

  if (contentTypeEquals(contentType, ContentTypeThreadCatalogRequest)) {
    if (state.kind !== "JOINED") {
      return {
        ok: false,
        nextState: state,
        error: protocolError(
          "verification-required",
          "join this group before requesting its thread catalog",
        ),
      };
    }
    return {
      ok: true,
      nextState: state,
      command: { kind: "thread-catalog" },
    };
  }

  if (contentTypeEquals(contentType, ContentTypeIdentitySubmit)) {
    return reducePreJoinVerification(state, { kind: "submit-identity" });
  }

  if (contentTypeEquals(contentType, ContentTypeHumanSubmit)) {
    return reducePreJoinVerification(state, { kind: "submit-human" });
  }

  if (contentTypeEquals(contentType, ContentTypeHumanAgentSubmit)) {
    return reducePreJoinVerification(state, { kind: "submit-human-agent" });
  }

  if (contentTypeEquals(contentType, ContentTypeJoinRequest)) {
    if (state.kind === "JOINED") {
      return {
        ok: false,
        nextState: state,
        error: protocolError(
          "already-member",
          "sender is already a member of this group",
        ),
      };
    }

    // `NEW` or `REJECTED` — allow a fresh attempt.
    return {
      ok: true,
      nextState: state,
      command: { kind: "attempt-join" },
    };
  }

  return {
    ok: false,
    nextState: state,
    error: protocolError(
      "unknown-type",
      `unsupported content type on sync channel: ${contentType.authorityId}/${contentType.typeId}`,
    ),
  };
}

function reducePreJoinVerification(
  state: SyncChannelState,
  command: Extract<
    SyncChannelCommand,
    | { kind: "submit-identity" }
    | { kind: "submit-human" }
    | { kind: "submit-human-agent" }
  >,
): SyncChannelTransition {
  if (state.kind === "JOINED") {
    return {
      ok: false,
      nextState: state,
      error: protocolError(
        "already-member",
        "sender is already a member of this group",
      ),
    };
  }

  return {
    ok: true,
    nextState: state,
    command,
  };
}

/**
 * Advance a sync-channel DM after the caller has resolved an
 * `attempt-join` command. The caller is expected to pass the join's
 * success or failure.
 */
export function applySyncJoinResult(
  state: SyncChannelState,
  ok: boolean,
): SyncChannelState {
  if (ok) return { kind: "JOINED" };
  // Keep REJECTED sticky-but-retryable: stays NEW-ish so the same DM can
  // try again with a corrected claim or name.
  return state.kind === "JOINED" ? state : { kind: "REJECTED" };
}
