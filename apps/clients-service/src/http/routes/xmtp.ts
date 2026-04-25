import type { MiddlewareHandler } from "hono";
import type { AppServices, BackendAppEnv } from "../../backend-types.js";
import { readJsonRecord } from "../request.js";
import { createSessionMiddleware } from "../session.js";
import type { Context, Hono } from "hono";

function unauthorizedMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unauthorized";
}

function visibleSenderInboxIds(c: Context<BackendAppEnv>) {
  const values =
    c.req.queries("visibleSenderInboxIds") ??
    (c.req.query("visibleSenderInboxIds")
      ? [c.req.query("visibleSenderInboxIds") as string]
      : []);
  if (values.length === 0) return undefined;
  return values
    .join(",")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function registerXmtpRoutes(
  app: Hono<BackendAppEnv>,
  services: AppServices,
  x402Middleware: MiddlewareHandler<BackendAppEnv>,
) {
  const sessionMiddleware = createSessionMiddleware(services);

  app.post("/xmtp/bootstrap", sessionMiddleware, x402Middleware, async (c) => {
    try {
      const { user } = c.get("session");
      const result = await services.xmtpClientManager.bootstrapUserClient(user);

      return c.json({
        status: "ready",
        info: result.info,
        conversations: result.conversations,
      });
    } catch (error) {
      return c.json(
        {
          status: "error",
          error: error instanceof Error ? error.message : "Failed to bootstrap XMTP",
        },
        409,
      );
    }
  });

  app.get("/conversations", sessionMiddleware, x402Middleware, async (c) => {
    try {
      const { user } = c.get("session");

      return c.json({
        conversations: await services.xmtpClientManager.listConversations(user),
      });
    } catch (error) {
      return c.json({ error: unauthorizedMessage(error) }, 401);
    }
  });

  app.get(
    "/conversations/:conversationId/messages",
    sessionMiddleware,
    x402Middleware,
    async (c) => {
      try {
        const { user } = c.get("session");
        const result = await services.xmtpClientManager.listMessages({
          user,
          conversationId: c.req.param("conversationId"),
          cursor: c.req.query("cursor") ?? null,
          limit: c.req.query("limit")
            ? Number.parseInt(c.req.query("limit") ?? "", 10)
            : undefined,
        });

        return c.json(result);
      } catch (error) {
        return c.json({ error: unauthorizedMessage(error) }, 401);
      }
    },
  );

  app.post("/messages/send", sessionMiddleware, x402Middleware, async (c) => {
    const parsed = await readJsonRecord(c);

    if (parsed.response) {
      return parsed.response;
    }

    try {
      const { user } = c.get("session");
      const text = parsed.body.text;
      const conversationId = parsed.body.conversationId;
      const recipientInboxId = parsed.body.recipientInboxId;

      if (typeof text !== "string" || (!conversationId && !recipientInboxId)) {
        return c.json(
          {
            error: "text and either conversationId or recipientInboxId are required",
          },
          400,
        );
      }

      const message = await services.xmtpClientManager.sendMessage({
        user,
        conversationId: typeof conversationId === "string" ? conversationId : undefined,
        recipientInboxId:
          typeof recipientInboxId === "string" ? recipientInboxId : undefined,
        text,
      });

      return c.json({ message });
    } catch (error) {
      return c.json({ error: unauthorizedMessage(error) }, 401);
    }
  });

  app.get(
    "/conversations/:conversationId/threads",
    sessionMiddleware,
    x402Middleware,
    async (c) => {
      try {
        const { user } = c.get("session");
        const threads = await services.xmtpClientManager.listThreads({
          user,
          conversationId: c.req.param("conversationId"),
          visibleSenderInboxIds: visibleSenderInboxIds(c),
        });
        return c.json({ threads });
      } catch (error) {
        return c.json({ error: unauthorizedMessage(error) }, 401);
      }
    },
  );

  app.get(
    "/conversations/:conversationId/threads/:threadId/messages",
    sessionMiddleware,
    x402Middleware,
    async (c) => {
      try {
        const { user } = c.get("session");
        const result = await services.xmtpClientManager.listThreadMessages({
          user,
          conversationId: c.req.param("conversationId"),
          threadId: c.req.param("threadId"),
        });
        return c.json(result);
      } catch (error) {
        return c.json({ error: unauthorizedMessage(error) }, 401);
      }
    },
  );

  app.post(
    "/conversations/:conversationId/threads",
    sessionMiddleware,
    x402Middleware,
    async (c) => {
      const parsed = await readJsonRecord(c);
      if (parsed.response) return parsed.response;

      const title = parsed.body.title;
      const firstMessage = parsed.body.firstMessage;
      if (typeof title !== "string" || !title.trim()) {
        return c.json({ error: "title is required" }, 400);
      }

      try {
        const { user } = c.get("session");
        const conversationId = c.req.param("conversationId");
        const created = await services.xmtpClientManager.createThread({
          user,
          conversationId,
          title: title.trim(),
        });

        let firstReply = null;
        if (typeof firstMessage === "string" && firstMessage.trim()) {
          firstReply = await services.xmtpClientManager.sendThreadMessage({
            user,
            conversationId,
            threadId: created.thread.threadId,
            text: firstMessage.trim(),
          });
        }

        return c.json({
          thread: created.thread,
          rootMessage: created.rootMessage,
          firstMessage: firstReply,
        });
      } catch (error) {
        return c.json({ error: unauthorizedMessage(error) }, 401);
      }
    },
  );

  app.post(
    "/conversations/:conversationId/threads/:threadId/messages",
    sessionMiddleware,
    x402Middleware,
    async (c) => {
      const parsed = await readJsonRecord(c);
      if (parsed.response) return parsed.response;

      const text = parsed.body.text;
      if (typeof text !== "string" || !text.trim()) {
        return c.json({ error: "text is required" }, 400);
      }

      try {
        const { user } = c.get("session");
        const message = await services.xmtpClientManager.sendThreadMessage({
          user,
          conversationId: c.req.param("conversationId"),
          threadId: c.req.param("threadId"),
          text,
        });
        return c.json({ message });
      } catch (error) {
        return c.json({ error: unauthorizedMessage(error) }, 401);
      }
    },
  );

  app.get("/threads/latest", sessionMiddleware, x402Middleware, async (c) => {
    try {
      const { user } = c.get("session");
      const limitParam = c.req.query("limit");
      const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
      const threads = await services.xmtpClientManager.listLatestThreads({
        user,
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      return c.json({ threads });
    } catch (error) {
      return c.json({ error: unauthorizedMessage(error) }, 401);
    }
  });

  app.post(
    "/conversations/:conversationId/read",
    sessionMiddleware,
    x402Middleware,
    async (c) => {
      const parsed = await readJsonRecord(c);

      if (parsed.response) {
        return parsed.response;
      }

      try {
        const { user } = c.get("session");
        const lastReadMessageId = parsed.body.lastReadMessageId;

        await services.xmtpClientManager.markConversationRead({
          user,
          conversationId: c.req.param("conversationId"),
          lastReadMessageId:
            typeof lastReadMessageId === "string" ? lastReadMessageId : null,
        });

        return c.json({ ok: true });
      } catch (error) {
        return c.json({ error: unauthorizedMessage(error) }, 401);
      }
    },
  );
}
