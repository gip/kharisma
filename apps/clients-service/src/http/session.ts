import type { MiddlewareHandler } from "hono";
import { verifySessionToken } from "../auth/session.js";
import type { AppServices, BackendAppEnv, ResolvedSession } from "../backend-types.js";

function readBearerToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    throw new Error("Missing bearer token");
  }

  return authorizationHeader.slice("Bearer ".length);
}

export function resolveSession(
  services: AppServices,
  authorizationHeader: string | undefined,
): ResolvedSession {
  const token = readBearerToken(authorizationHeader);
  const payload = verifySessionToken(services.config.sessionSecret, token);
  const session = services.database.getSessionById(payload.sid);

  if (!session) {
    throw new Error("Session not found");
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new Error("Session expired");
  }

  const user = services.database.getUserById(session.userId);

  if (!user) {
    throw new Error("User not found");
  }

  services.database.touchSession(session.id);

  return {
    token,
    session,
    user,
  };
}

export function createSessionMiddleware(
  services: AppServices,
): MiddlewareHandler<BackendAppEnv> {
  return async (c, next) => {
    try {
      const session = resolveSession(services, c.req.header("authorization"));
      c.set("session", session);
      await next();
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Unauthorized",
        },
        401,
      );
    }
  };
}
