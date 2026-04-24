import type { ContentTypeId } from "@xmtp/content-type-primitives";
import { contentTypeEquals } from "../content-types/helpers.js";
import {
  ContentTypeHumanAgentSubmit,
  ContentTypeHumanSubmit,
  ContentTypeCreateGroupRequest,
  ContentTypeIdentitySubmit,
  ContentTypeHello,
  ContentTypeListGroupsRequest,
  ContentTypeSkillRequest,
  ContentTypeWalletStatusRequest,
} from "../content-types/ids.js";
import { protocolError, type ProtocolError } from "../errors.js";
import type { AuthenticatedRole } from "../roles.js";

export type MainChannelState =
  | { kind: "NEW" }
  | { kind: "AUTHENTICATED"; role: AuthenticatedRole };

export const initialMainState: MainChannelState = { kind: "NEW" };

export type MainChannelCommand =
  | { kind: "wallet-status" }
  | { kind: "submit-identity" }
  | { kind: "submit-human" }
  | { kind: "submit-human-agent" }
  | { kind: "authenticate"; role: AuthenticatedRole }
  | { kind: "skill" }
  | { kind: "list-groups" }
  | { kind: "create-group" };

export type MainChannelTransition =
  | {
      ok: true;
      nextState: MainChannelState;
      command: MainChannelCommand;
    }
  | {
      ok: false;
      nextState: MainChannelState;
      error: ProtocolError;
    };

/**
 * Pure reducer for the main-channel DM state machine.
 *
 * Given the current state, the inbound message's content type, and
 * (for `hello/1`) the role declared in the payload, returns the next
 * state plus either the abstract command the caller should execute or
 * a `ProtocolError` describing why the message was rejected.
 *
 * The reducer has no I/O: claim verification, group listing, etc. all
 * happen in the caller after this reducer decides the message is
 * allowed in the current state.
 */
export function reduceMain(
  state: MainChannelState,
  contentType: ContentTypeId,
  /** Role declared inside a `hello/1` payload. Ignored for other types. */
  helloRole?: AuthenticatedRole,
): MainChannelTransition {
  if (contentTypeEquals(contentType, ContentTypeHello)) {
    if (!helloRole) {
      return {
        ok: false,
        nextState: state,
        error: protocolError("malformed", "hello/1 missing role"),
      };
    }
    return {
      ok: true,
      nextState: { kind: "AUTHENTICATED", role: helloRole },
      command: { kind: "authenticate", role: helloRole },
    };
  }

  if (contentTypeEquals(contentType, ContentTypeListGroupsRequest)) {
    return {
      ok: true,
      nextState: state,
      command: { kind: "list-groups" },
    };
  }

  if (contentTypeEquals(contentType, ContentTypeSkillRequest)) {
    return {
      ok: true,
      nextState: state,
      command: { kind: "skill" },
    };
  }

  if (contentTypeEquals(contentType, ContentTypeWalletStatusRequest)) {
    return {
      ok: true,
      nextState: state,
      command: { kind: "wallet-status" },
    };
  }

  if (contentTypeEquals(contentType, ContentTypeIdentitySubmit)) {
    return {
      ok: true,
      nextState: state,
      command: { kind: "submit-identity" },
    };
  }

  if (contentTypeEquals(contentType, ContentTypeHumanSubmit)) {
    return {
      ok: true,
      nextState: state,
      command: { kind: "submit-human" },
    };
  }

  if (contentTypeEquals(contentType, ContentTypeHumanAgentSubmit)) {
    return {
      ok: true,
      nextState: state,
      command: { kind: "submit-human-agent" },
    };
  }

  if (state.kind === "NEW") {
    return {
      ok: false,
      nextState: state,
      error: protocolError(
        "malformed",
        "first message on this DM must be hello/1",
      ),
    };
  }

  if (contentTypeEquals(contentType, ContentTypeCreateGroupRequest)) {
    if (state.role !== "H") {
      return {
        ok: false,
        nextState: state,
        error: protocolError(
          "unauthorized-role",
          "only role H may create groups",
        ),
      };
    }
    return {
      ok: true,
      nextState: state,
      command: { kind: "create-group" },
    };
  }

  return {
    ok: false,
    nextState: state,
    error: protocolError(
      "unknown-type",
      `unsupported content type on main channel: ${contentType.authorityId}/${contentType.typeId}`,
    ),
  };
}
