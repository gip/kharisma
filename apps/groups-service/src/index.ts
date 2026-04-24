import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { GroupManager } from "./groups/manager.js";
import { InvestmentManager } from "./investments/manager.js";
import { InvestmentVerifier } from "./investments/verifier.js";
import { createLogger } from "./logging.js";
import { GroupsService } from "./service.js";
import { GroupStore } from "./storage/store.js";
import { VerificationService } from "./verification/service.js";

for (const envFile of [".env", ".env.local"]) {
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({
    level: config.logLevel,
    name: "groups-service",
  });

  logger.info(
    {
      env: config.xmtpEnv,
      dataRoot: config.dataRoot,
    },
    "Starting groups-service",
  );

  const store = new GroupStore(
    config.groupsDbPath,
    config.storageEncryptionKeyHex,
  );
  const manager = new GroupManager(
    config,
    store,
    logger.child({ component: "group-manager" }),
  );
  const verification = new VerificationService(
    store,
    config.worldIdRpId,
    logger.child({ component: "verification" }),
  );
  const investmentVerifier = new InvestmentVerifier(config);
  const investmentManager = new InvestmentManager(
    config,
    store,
    manager,
    investmentVerifier,
    logger.child({ component: "investments" }),
  );

  const service = new GroupsService(
    config,
    logger,
    store,
    manager,
    verification,
    investmentManager,
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutdown signal received");
    try {
      await service.stop();
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
    }
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  try {
    await service.start();
  } catch (err) {
    logger.error({ err }, "Failed to start groups-service");
    process.exit(1);
  }
}

void main();
