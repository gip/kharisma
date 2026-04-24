import { describe, expect, it, vi } from "vitest";
import type { AppLogger } from "../logging.js";
import { SignatureRequestBroker } from "./signature-broker.js";

type LoggedEntry = {
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  bindings: Record<string, unknown>;
  args: unknown[];
};

function createSpyLogger(
  bindings: Record<string, unknown> = {},
  entries: LoggedEntry[] = [],
): AppLogger {
  return {
    child(childBindings) {
      return createSpyLogger({ ...bindings, ...childBindings }, entries);
    },
    trace(...args) {
      entries.push({ level: "trace", bindings, args });
    },
    debug(...args) {
      entries.push({ level: "debug", bindings, args });
    },
    info(...args) {
      entries.push({ level: "info", bindings, args });
    },
    warn(...args) {
      entries.push({ level: "warn", bindings, args });
    },
    error(...args) {
      entries.push({ level: "error", bindings, args });
    },
    fatal(...args) {
      entries.push({ level: "fatal", bindings, args });
    },
  };
}

function createBroker(entries: LoggedEntry[] = []) {
  return new SignatureRequestBroker(
    {
      createSignatureRequest: vi.fn(),
      rejectSignatureRequest: vi.fn(),
      resolveSignatureRequest: vi.fn(),
    } as never,
    {
      verify: vi.fn(),
    } as never,
    1_000,
    createSpyLogger({}, entries),
  );
}

describe("SignatureRequestBroker", () => {
  it("ignores stale signature rejections for unknown requests", async () => {
    const entries: LoggedEntry[] = [];
    const broker = createBroker(entries);

    await expect(
      broker.rejectSignature({
        userId: 1,
        requestId: "missing-request",
        error: "User rejected",
      }),
    ).resolves.toBeUndefined();

    expect(
      entries.some(
        (entry) =>
          entry.level === "debug" &&
          entry.args[1] ===
            "Ignored stale XMTP signature rejection for an unknown request",
      ),
    ).toBe(true);
  });

  it("ignores stale signature submissions for unknown requests", async () => {
    const entries: LoggedEntry[] = [];
    const broker = createBroker(entries);

    await expect(
      broker.submitSignature({
        userId: 1,
        requestId: "missing-request",
        signature: "0x1234",
      }),
    ).resolves.toBeUndefined();

    expect(
      entries.some(
        (entry) =>
          entry.level === "debug" &&
          entry.args[1] ===
            "Ignored stale XMTP signature submission for an unknown request",
      ),
    ).toBe(true);
  });
});
