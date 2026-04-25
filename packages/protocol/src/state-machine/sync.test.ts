import { describe, expect, it } from "vitest";
import {
  ContentTypeHello,
  ContentTypeHumanAgentSubmit,
  ContentTypeHumanSubmit,
  ContentTypeIdentitySubmit,
  ContentTypeJoinRequest,
  ContentTypeListGroupsRequest,
  ContentTypeSkillRequest,
  ContentTypeThreadCatalogRequest,
  ContentTypeWalletStatusRequest,
} from "../content-types/ids.js";
import {
  applySyncJoinResult,
  initialSyncState,
  reduceSync,
} from "./sync.js";

describe("reduceSync", () => {
  it("allows join-request in NEW", () => {
    const result = reduceSync(initialSyncState, ContentTypeJoinRequest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.kind).toBe("attempt-join");
    }
  });

  it("allows wallet-status-request in every state without changing state", () => {
    for (const state of [
      initialSyncState,
      { kind: "REJECTED" } as const,
      { kind: "PENDING" } as const,
      { kind: "JOINED" } as const,
    ]) {
      const result = reduceSync(state, ContentTypeWalletStatusRequest);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.command.kind).toBe("wallet-status");
        expect(result.nextState).toEqual(state);
      }
    }
  });

  it("allows skill-request in every state without changing state", () => {
    for (const state of [
      initialSyncState,
      { kind: "REJECTED" } as const,
      { kind: "PENDING" } as const,
      { kind: "JOINED" } as const,
    ]) {
      const result = reduceSync(state, ContentTypeSkillRequest);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.command.kind).toBe("skill");
        expect(result.nextState).toEqual(state);
      }
    }
  });

  it("allows verification submissions before join without changing state", () => {
    const cases = [
      [ContentTypeIdentitySubmit, "submit-identity"],
      [ContentTypeHumanSubmit, "submit-human"],
      [ContentTypeHumanAgentSubmit, "submit-human-agent"],
    ] as const;

    for (const state of [
      initialSyncState,
      { kind: "REJECTED" } as const,
      { kind: "PENDING" } as const,
    ]) {
      for (const [contentType, command] of cases) {
        const result = reduceSync(state, contentType);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.command.kind).toBe(command);
          expect(result.nextState).toEqual(state);
        }
      }
    }
  });

  it("rejects verification submissions in JOINED as already-member", () => {
    for (const contentType of [
      ContentTypeIdentitySubmit,
      ContentTypeHumanSubmit,
      ContentTypeHumanAgentSubmit,
    ]) {
      const result = reduceSync({ kind: "JOINED" }, contentType);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("already-member");
      }
    }
  });

  it("rejects unsupported types with unknown-type", () => {
    const result = reduceSync(initialSyncState, ContentTypeHello);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown-type");
    }
  });

  it("keeps list-groups on the main channel only", () => {
    const result = reduceSync(initialSyncState, ContentTypeListGroupsRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown-type");
    }
  });

  it("rejects join-request in JOINED as already-member", () => {
    const result = reduceSync({ kind: "JOINED" }, ContentTypeJoinRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("already-member");
    }
  });

  it("rejects thread-catalog-request before join", () => {
    for (const state of [
      initialSyncState,
      { kind: "REJECTED" } as const,
      { kind: "PENDING" } as const,
    ]) {
      const result = reduceSync(state, ContentTypeThreadCatalogRequest);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("verification-required");
      }
    }
  });

  it("allows thread-catalog-request after join", () => {
    const result = reduceSync({ kind: "JOINED" }, ContentTypeThreadCatalogRequest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.kind).toBe("thread-catalog");
      expect(result.nextState).toEqual({ kind: "JOINED" });
    }
  });

  it("allows retry from REJECTED", () => {
    const result = reduceSync({ kind: "REJECTED" }, ContentTypeJoinRequest);
    expect(result.ok).toBe(true);
  });

  it("allows retry from PENDING without treating the sender as joined", () => {
    const result = reduceSync({ kind: "PENDING" }, ContentTypeJoinRequest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.kind).toBe("attempt-join");
    }
  });
});

describe("applySyncJoinResult", () => {
  it("advances NEW -> JOINED on success", () => {
    expect(applySyncJoinResult(initialSyncState, true)).toEqual({
      kind: "JOINED",
    });
  });

  it("advances NEW -> REJECTED on failure", () => {
    expect(applySyncJoinResult(initialSyncState, false)).toEqual({
      kind: "REJECTED",
    });
  });

  it("advances NEW -> PENDING for approval-required joins", () => {
    expect(applySyncJoinResult(initialSyncState, "pending")).toEqual({
      kind: "PENDING",
    });
  });

  it("keeps JOINED sticky on a failed retry", () => {
    expect(applySyncJoinResult({ kind: "JOINED" }, false)).toEqual({
      kind: "JOINED",
    });
  });
});
