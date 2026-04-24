import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import type { NodeWebSocket } from "@hono/node-ws";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type {
  AppServices,
  BackendAppEnv,
  BuildBackendAppOptions,
} from "./backend-types.js";
import type { BackendConfig } from "./config.js";
import { createLogger } from "./logging.js";
import { registerAdminRoutes } from "./http/routes/admin.js";
import { registerKharismaRoutes } from "./http/routes/kharisma.js";
import { registerPublicRoutes } from "./http/routes/public.js";
import { registerMediaRoutes } from "./http/routes/media.js";
import { registerXmtpRoutes } from "./http/routes/xmtp.js";
import { registerWebSocketRoute } from "./http/ws.js";
import { createX402Middleware } from "./http/x402.js";
import { createAppServices } from "./services.js";

const passthroughMiddleware: MiddlewareHandler<BackendAppEnv> = async (_c, next) => {
  await next();
};

export type BackendApp = {
  app: Hono<BackendAppEnv>;
  services: AppServices;
  injectWebSocket: NodeWebSocket["injectWebSocket"];
};

export async function buildBackendApp(
  config: BackendConfig,
  options: BuildBackendAppOptions = {},
): Promise<BackendApp> {
  const allowHeaders = ["Content-Type", "Authorization"];

  if (config.x402Enabled) {
    allowHeaders.push("Payment-Signature", "Agentkit");
  }

  const logger =
    options.logger ?? createLogger({ level: config.logLevel, name: "clients-service" });
  const httpLogger = logger.child({ component: "http" });
  const services = createAppServices(config, options.serviceOverrides, {
    ws: logger.child({ component: "ws" }),
    xmtp: logger.child({ component: "xmtp" }),
  });
  const app = new Hono<BackendAppEnv>();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
  const x402Middleware = config.x402Enabled
    ? (options.x402Middleware ?? (await createX402Middleware(config)))
    : passthroughMiddleware;

  app.onError((error, c) => {
    httpLogger.error(
      {
        err: error,
        method: c.req.method,
        origin: c.req.header("origin") ?? undefined,
        path: c.req.path,
      },
      "Unhandled request error",
    );
    return c.json({ error: "Internal server error" }, 500);
  });

  app.use("*", async (c, next) => {
    const startedAt = Date.now();
    let caughtError: unknown = null;

    try {
      await next();
    } catch (error) {
      caughtError = error;
      throw error;
    } finally {
      const status = caughtError ? 500 : c.res.status;
      const fields = {
        durationMs: Date.now() - startedAt,
        method: c.req.method,
        origin: c.req.header("origin") ?? undefined,
        path: c.req.path,
        status,
      };

      if (status >= 500) {
        httpLogger.error(fields, "Request completed");
      } else if (status >= 400) {
        httpLogger.warn(fields, "Request completed");
      } else {
        httpLogger.info(fields, "Request completed");
      }
    }
  });

  app.use(
    "*",
    cors({
      origin: config.corsAllowedOrigins,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders,
      exposeHeaders: config.x402Enabled ? ["PAYMENT-REQUIRED"] : undefined,
      maxAge: 86400,
    }),
  );

  registerPublicRoutes(app, services);
  registerXmtpRoutes(app, services, x402Middleware);
  registerMediaRoutes(app, services, x402Middleware);
  registerKharismaRoutes(app, services, x402Middleware);
  registerAdminRoutes(app, services);
  registerWebSocketRoute(app, services, upgradeWebSocket);

  return {
    app,
    services,
    injectWebSocket,
  };
}
