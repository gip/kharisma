import type { AppServices, BackendAppEnv } from "../../backend-types.js";
import type { Hono } from "hono";

export function registerAdminRoutes(app: Hono<BackendAppEnv>, services: AppServices) {
  app.get("/admin/xmtp/clients", (c) => {
    if (c.req.header("authorization") !== `Bearer ${services.config.adminToken}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    return c.json({
      loadedClients: services.xmtpClientManager.listLoadedClients(),
      persistedAccounts: services.database.listXmtpAccounts().map((account) => ({
        userId: account.userId,
        walletAddress: account.walletAddress,
        inboxId: account.inboxId,
        installationId: account.installationId,
        dbPath: account.dbPath,
        lastInitializedAt: account.lastInitializedAt,
        lastSeenAt: account.lastSeenAt,
      })),
    });
  });
}
