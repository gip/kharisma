import { describe, expect, it, vi } from "vitest";
import { createSessionToken } from "../auth/session.js";
import type { AppLogger } from "../logging.js";
import type { SessionRecord } from "../storage/database.js";
import { WebSocketHub, type WebSocketLike } from "./hub.js";

type LoggedEntry = {
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  bindings: Record<string, unknown>;
  args: unknown[];
};

class FakeSocket implements WebSocketLike {
  readyState = 1;
  readonly sentMessages: string[] = [];
  private readonly listeners = new Map<string, (value?: unknown) => void>();

  send(data: string) {
    this.sentMessages.push(data);
  }

  on(event: "message" | "close", listener: (value?: unknown) => void) {
    this.listeners.set(event, listener);
  }

  async emitMessage(value: unknown) {
    await this.listeners.get("message")?.(value);
  }

  emitClose() {
    this.listeners.get("close")?.();
  }
}

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

describe("WebSocketHub logging", () => {
  it("logs invalid websocket payloads without leaking the payload", async () => {
    const entries: LoggedEntry[] = [];
    const hub = new WebSocketHub(
      {
        getSessionById: vi.fn(),
        touchSession: vi.fn(),
      } as never,
      "test-session-secret",
      {
        rejectSignature: vi.fn(),
        submitSignature: vi.fn(),
      } as never,
      createSpyLogger({}, entries),
    );
    const socket = new FakeSocket();

    hub.attachConnection(socket);
    await socket.emitMessage("not-json");

    expect(JSON.parse(socket.sentMessages[0] ?? "{}")).toMatchObject({
      type: "sync:required",
    });

    const warnLog = entries.find(
      (entry) =>
        entry.level === "warn" && entry.args[1] === "WebSocket message rejected",
    );
    expect(warnLog).toBeDefined();
    expect(JSON.stringify(warnLog)).not.toContain("not-json");
  });

  it("logs failed websocket authentication without leaking the bearer token", async () => {
    const entries: LoggedEntry[] = [];
    const session: SessionRecord = {
      id: "00000000-0000-0000-0000-000000000001",
      userId: 1,
      walletAddress: "0x1111111111111111111111111111111111111111",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    const token = createSessionToken({
      secret: "test-session-secret",
      userId: session.userId,
      sessionId: session.id,
      address: session.walletAddress,
      expiresAt: new Date(session.expiresAt),
    });
    const invalidToken = `${token}broken`;
    const hub = new WebSocketHub(
      {
        getSessionById: vi.fn(() => session),
        touchSession: vi.fn(),
      } as never,
      "test-session-secret",
      {
        rejectSignature: vi.fn(),
        submitSignature: vi.fn(),
      } as never,
      createSpyLogger({}, entries),
    );
    const socket = new FakeSocket();

    hub.attachConnection(socket);
    await socket.emitMessage(
      JSON.stringify({
        type: "auth.authenticate",
        token: invalidToken,
      }),
    );

    expect(JSON.parse(socket.sentMessages[0] ?? "{}")).toMatchObject({
      type: "sync:required",
    });

    const warnLog = entries.find(
      (entry) =>
        entry.level === "warn" && entry.args[1] === "WebSocket message rejected",
    );
    expect(warnLog).toBeDefined();
    expect(JSON.stringify(warnLog)).not.toContain(invalidToken);
  });
});
