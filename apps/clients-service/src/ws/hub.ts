import type { AppLogger } from "../logging.js";
import { verifySessionToken } from "../auth/session.js";
import type { AppDatabase } from "../storage/database.js";
import type { SignatureRequestBroker } from "../xmtp/signature-broker.js";
import type { ClientToServerMessage, ServerToClientMessage } from "./protocol.js";

export type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  on(event: "message", listener: (value: unknown) => void): void;
  on(event: "close", listener: () => void): void;
};

type ConnectionState = {
  socket: WebSocketLike;
  userId: number | null;
  address: string | null;
};

export class WebSocketHub {
  private readonly connections = new Set<ConnectionState>();
  private readonly userConnections = new Map<number, Set<ConnectionState>>();

  constructor(
    private readonly database: AppDatabase,
    private readonly sessionSecret: string,
    private readonly signatureBroker: SignatureRequestBroker,
    private readonly logger: AppLogger,
  ) {}

  attachConnection(socket: WebSocketLike) {
    const state: ConnectionState = {
      socket,
      userId: null,
      address: null,
    };

    this.connections.add(state);
    this.logger.debug(
      { activeConnections: this.connections.size },
      "WebSocket connection attached",
    );

    socket.on("message", async (value: unknown) => {
      let messageType = "unknown";

      try {
        const message = JSON.parse(String(value)) as ClientToServerMessage;
        messageType = message.type;
        await this.handleMessage(state, message);
      } catch (error) {
        this.logger.warn(
          {
            err: error,
            messageType,
            userId: state.userId ?? undefined,
          },
          "WebSocket message rejected",
        );
        this.send(state, {
          type: "sync:required",
          reason: error instanceof Error ? error.message : "Invalid websocket message",
        });
      }
    });

    socket.on("close", () => {
      this.detachConnection(state);
    });
  }

  hasUserConnection(userId: number) {
    return (this.userConnections.get(userId)?.size ?? 0) > 0;
  }

  sendToUser(userId: number, message: ServerToClientMessage) {
    const connections = this.userConnections.get(userId);

    if (!connections) {
      return;
    }

    for (const connection of connections) {
      this.send(connection, message);
    }
  }

  private send(connection: ConnectionState, message: ServerToClientMessage) {
    if (connection.socket.readyState !== 1) {
      return;
    }

    connection.socket.send(JSON.stringify(message));
  }

  private detachConnection(state: ConnectionState) {
    this.connections.delete(state);

    if (typeof state.userId === "number") {
      const userConnections = this.userConnections.get(state.userId);

      if (userConnections) {
        userConnections.delete(state);
        if (userConnections.size === 0) {
          this.userConnections.delete(state.userId);
        }
      }
    }

    this.logger.debug(
      {
        activeConnections: this.connections.size,
        userId: state.userId ?? undefined,
      },
      "WebSocket connection detached",
    );
  }

  private async authenticate(state: ConnectionState, token: string) {
    const payload = verifySessionToken(this.sessionSecret, token);
    const session = this.database.getSessionById(payload.sid);

    if (!session) {
      throw new Error("Session not found");
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new Error("Session expired");
    }

    this.database.touchSession(session.id);

    state.userId = session.userId;
    state.address = session.walletAddress;

    const connections = this.userConnections.get(session.userId) ?? new Set<ConnectionState>();
    connections.add(state);
    this.userConnections.set(session.userId, connections);
    this.logger.info(
      {
        address: session.walletAddress,
        userId: session.userId,
        userConnectionCount: connections.size,
      },
      "WebSocket authenticated",
    );

    this.send(state, {
      type: "auth.authenticated",
      userId: session.userId,
      address: session.walletAddress,
    });
  }

  private async handleMessage(state: ConnectionState, message: ClientToServerMessage) {
    if (message.type === "auth.authenticate") {
      await this.authenticate(state, message.token);
      return;
    }

    if (typeof state.userId !== "number") {
      throw new Error("WebSocket session is not authenticated");
    }

    if (message.type === "xmtp.signature_submit") {
      await this.signatureBroker.submitSignature({
        userId: state.userId,
        requestId: message.requestId,
        signature: message.signature,
      });
      return;
    }

    if (message.type === "xmtp.signature_rejected") {
      await this.signatureBroker.rejectSignature({
        userId: state.userId,
        requestId: message.requestId,
        error: message.error,
      });
    }
  }
}
