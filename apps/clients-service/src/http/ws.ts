import type { NodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import type { AppServices, BackendAppEnv } from "../backend-types.js";
import type { WebSocketLike } from "../ws/hub.js";

export function registerWebSocketRoute(
  app: Hono<BackendAppEnv>,
  services: AppServices,
  upgradeWebSocket: NodeWebSocket["upgradeWebSocket"],
) {
  app.get(
    "/ws",
    upgradeWebSocket(() => ({
      onOpen: (_event, ws) => {
        if (!ws.raw) {
          ws.close(1011, "WebSocket upgrade failed");
          return;
        }

        services.websocketHub.attachConnection(ws.raw as WebSocketLike);
      },
    })),
  );
}
