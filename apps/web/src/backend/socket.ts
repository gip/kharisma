import type { ClientEvent, ServerEvent } from "./types";

export class BackendSocket {
  private socket: WebSocket | null = null;

  constructor(private readonly url: string) {}

  async connect(input: {
    token: string;
    onEvent: (event: ServerEvent) => void;
  }) {
    await this.close();

    const socket = new WebSocket(this.url);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("message", handleMessage);
        socket.removeEventListener("error", handleError);
        socket.removeEventListener("close", handleClose);
      };

      const handleOpen = () => {
        socket.send(
          JSON.stringify({
            type: "auth.authenticate",
            token: input.token,
          } satisfies ClientEvent),
        );
      };

      const handleMessage = (event: MessageEvent<string>) => {
        const payload = JSON.parse(event.data) as ServerEvent;

        if (payload.type === "auth.authenticated") {
          input.onEvent(payload);
          cleanup();
          resolve();
          return;
        }

        if (payload.type === "sync:required") {
          cleanup();
          socket.close();
          reject(new Error(payload.reason));
          return;
        }
      };

      const handleError = () => {
        cleanup();
        reject(new Error("Failed to connect backend websocket"));
      };

      const handleClose = () => {
        cleanup();
        reject(new Error("Backend websocket closed before authentication"));
      };

      socket.addEventListener("open", handleOpen);
      socket.addEventListener("message", handleMessage);
      socket.addEventListener("error", handleError);
      socket.addEventListener("close", handleClose);
    });

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data) as ServerEvent;
      input.onEvent(payload);
    });
  }

  send(event: ClientEvent) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Backend websocket is not connected");
    }

    this.socket.send(JSON.stringify(event));
  }

  async close() {
    if (!this.socket) {
      return;
    }

    this.socket.close();
    this.socket = null;
  }
}
