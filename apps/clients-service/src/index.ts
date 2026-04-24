import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { buildBackendApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createLogger, parseLogLevel, type AppLogger } from "./logging.js";

for (const envFile of [".env", ".env.local"]) {
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

try {
  const bootstrapLogLevel = parseLogLevel(process.env.LOG_LEVEL);
  let logger: AppLogger = createLogger({
    level: bootstrapLogLevel,
    name: "clients-service",
  });
  const config = loadConfig();
  logger = createLogger({
    level: config.logLevel,
    name: "clients-service",
  });
  const serverLogger = logger.child({ component: "server" });
  const backend = await buildBackendApp(config, { logger });
  const server = serve(
    {
      fetch: backend.app.fetch,
      hostname: config.host,
      port: config.port,
    },
    (info) => {
      serverLogger.info(
        {
          host: config.host,
          logLevel: config.logLevel,
          port: info.port,
        },
        "Backend listening",
      );
    },
  );
  backend.injectWebSocket(server);
  server.on("error", (error) => {
    serverLogger.fatal({ err: error }, "Backend server error");
    process.exit(1);
  });
} catch (error) {
  createLogger({
    level: "info",
    name: "clients-service",
  }).fatal({ err: error }, "Backend startup failed");
  process.exit(1);
}
