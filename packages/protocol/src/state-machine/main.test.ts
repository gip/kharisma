import { describe, expect, it } from "vitest";
import {
  ContentTypeHumanAgentSubmit,
  ContentTypeHumanSubmit,
  ContentTypeCreateGroupRequest,
  ContentTypeIdentitySubmit,
  ContentTypeHello,
  ContentTypeJoinRequest,
  ContentTypeListGroupsRequest,
  ContentTypeSkillRequest,
  ContentTypeWalletStatusRequest,
} from "../content-types/ids.js";
import { initialMainState, reduceMain } from "./main.js";

describe("reduceMain", () => {
  it("allows public group listing in NEW", () => {
    const result = reduceMain(initialMainState, ContentTypeListGroupsRequest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextState.kind).toBe("NEW");
      expect(result.command.kind).toBe("list-groups");
    }
  });

  it("allows skill requests in NEW and authenticated states", () => {
    const inNew = reduceMain(initialMainState, ContentTypeSkillRequest);
    expect(inNew.ok).toBe(true);
    if (inNew.ok) {
      expect(inNew.nextState.kind).toBe("NEW");
      expect(inNew.command.kind).toBe("skill");
    }

    const auth = reduceMain(initialMainState, ContentTypeHello, "H");
    if (!auth.ok) throw new Error("auth failed");
    const inAuth = reduceMain(auth.nextState, ContentTypeSkillRequest);
    expect(inAuth.ok).toBe(true);
    if (inAuth.ok) {
      expect(inAuth.nextState).toEqual(auth.nextState);
      expect(inAuth.command.kind).toBe("skill");
    }
  });

  it("allows wallet status and verification submits in NEW", () => {
    for (const type of [
      ContentTypeWalletStatusRequest,
      ContentTypeIdentitySubmit,
      ContentTypeHumanSubmit,
      ContentTypeHumanAgentSubmit,
    ]) {
      const result = reduceMain(initialMainState, type);
      expect(result.ok).toBe(true);
    }
  });

  it("rejects create in NEW", () => {
    const result = reduceMain(initialMainState, ContentTypeCreateGroupRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("malformed");
      expect(result.nextState.kind).toBe("NEW");
    }
  });

  it("advances to AUTHENTICATED(H) on hello with role H", () => {
    const result = reduceMain(initialMainState, ContentTypeHello, "H");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextState).toEqual({ kind: "AUTHENTICATED", role: "H" });
      expect(result.command).toEqual({ kind: "authenticate", role: "H" });
    }
  });

  it("rejects hello without a role", () => {
    const result = reduceMain(initialMainState, ContentTypeHello);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("malformed");
    }
  });

  it("allows HA and H to list groups", () => {
    for (const role of ["H", "HA"] as const) {
      const auth = reduceMain(initialMainState, ContentTypeHello, role);
      expect(auth.ok).toBe(true);
      if (!auth.ok) return;
      const list = reduceMain(auth.nextState, ContentTypeListGroupsRequest);
      expect(list.ok).toBe(true);
      if (list.ok) {
        expect(list.command.kind).toBe("list-groups");
      }
    }
  });

  it("allows H to create a group but blocks HA with unauthorized-role", () => {
    const authH = reduceMain(initialMainState, ContentTypeHello, "H");
    if (!authH.ok) throw new Error("auth H failed");
    const createH = reduceMain(authH.nextState, ContentTypeCreateGroupRequest);
    expect(createH.ok).toBe(true);
    if (createH.ok) {
      expect(createH.command.kind).toBe("create-group");
    }

    const authHA = reduceMain(initialMainState, ContentTypeHello, "HA");
    if (!authHA.ok) throw new Error("auth HA failed");
    const createHA = reduceMain(
      authHA.nextState,
      ContentTypeCreateGroupRequest,
    );
    expect(createHA.ok).toBe(false);
    if (!createHA.ok) {
      expect(createHA.error.code).toBe("unauthorized-role");
    }
  });

  it("rejects unknown types in authenticated state", () => {
    const auth = reduceMain(initialMainState, ContentTypeHello, "H");
    if (!auth.ok) throw new Error("auth failed");
    // Using a sync-channel type on the main channel is an "unknown-type"
    // from the main reducer's perspective.
    const result = reduceMain(auth.nextState, ContentTypeJoinRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown-type");
    }
  });

  it("re-authenticates when hello is sent again with a different role", () => {
    const authH = reduceMain(initialMainState, ContentTypeHello, "H");
    if (!authH.ok) throw new Error("auth H failed");
    const authHA = reduceMain(authH.nextState, ContentTypeHello, "HA");
    expect(authHA.ok).toBe(true);
    if (authHA.ok) {
      expect(authHA.nextState).toEqual({ kind: "AUTHENTICATED", role: "HA" });
    }
  });
});
