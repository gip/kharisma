import {
  isGroupJoinApproval,
  isGroupJoinPolicy,
  normalizeGroupLanguages,
  type GroupLanguageCode,
} from "@kharisma/protocol";
import type { MiddlewareHandler } from "hono";
import type { AppServices, BackendAppEnv } from "../../backend-types.js";
import { isRecord, readJsonRecord } from "../request.js";
import { createSessionMiddleware } from "../session.js";
import type { Context, Hono } from "hono";

function statusForError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (
    message.includes("not configured") ||
    message.includes("missing KHARISMA_MAIN_INBOX_ID")
  ) {
    return 503;
  }

  if (message.includes("protocol error") || message.includes("Timed out")) {
    return 409;
  }

  return 400;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Kharisma request failed";
}

async function readOptionalJsonRecord(c: Context<BackendAppEnv>) {
  if (!c.req.header("content-type")?.includes("application/json")) {
    return { body: {}, response: null };
  }

  const text = await c.req.text();
  if (!text.trim()) {
    return { body: {}, response: null };
  }

  try {
    const body = JSON.parse(text) as unknown;
    if (!isRecord(body)) {
      return {
        body: null,
        response: c.json({ error: "Invalid JSON body" }, 400),
      };
    }
    return { body, response: null };
  } catch {
    return {
      body: null,
      response: c.json({ error: "Invalid JSON body" }, 400),
    };
  }
}

export function registerKharismaRoutes(
  app: Hono<BackendAppEnv>,
  services: AppServices,
  x402Middleware: MiddlewareHandler<BackendAppEnv>,
) {
  const sessionMiddleware = createSessionMiddleware(services);

  app.post("/kharisma/investments/config", sessionMiddleware, async (c) => {
    const parsed = await readJsonRecord(c);
    if (parsed.response) {
      return parsed.response;
    }
    const groupId = parsed.body.groupId;
    const syncInboxId = parsed.body.syncInboxId;
    if (typeof groupId !== "string" || !groupId.trim()) {
      return c.json({ error: "groupId is required" }, 400);
    }
    if (typeof syncInboxId !== "string" || !syncInboxId.trim()) {
      return c.json({ error: "syncInboxId is required" }, 400);
    }
    try {
      const { user } = c.get("session");
      return c.json(
        await services.xmtpClientManager.getInvestmentConfig({
          user,
          groupId: groupId.trim(),
          syncInboxId: syncInboxId.trim(),
        }),
      );
    } catch (error) {
      return c.json({ error: errorMessage(error) }, statusForError(error));
    }
  });

  app.post(
    "/kharisma/groups/:groupId/investments/verify",
    sessionMiddleware,
    async (c) => {
      const parsed = await readJsonRecord(c);
      if (parsed.response) {
        return parsed.response;
      }
      const groupId = c.req.param("groupId");
      const syncInboxId = parsed.body.syncInboxId;
      const chainId = Number(parsed.body.chainId);
      const token = parsed.body.token;
      const amount = parsed.body.amount;
      const txHash = parsed.body.txHash;
      const userOpHash = parsed.body.userOpHash;
      if (typeof syncInboxId !== "string" || !syncInboxId.trim()) {
        return c.json({ error: "syncInboxId is required" }, 400);
      }
      if (!Number.isInteger(chainId) || chainId <= 0) {
        return c.json({ error: "chainId must be a positive integer" }, 400);
      }
      if (token !== "WLD" && token !== "USDC") {
        return c.json({ error: "token must be WLD or USDC" }, 400);
      }
      if (typeof amount !== "string" || !/^[0-9]+$/.test(amount)) {
        return c.json({ error: "amount must be a base-unit integer string" }, 400);
      }
      const hasTxHash = typeof txHash === "string" && !!txHash.trim();
      const hasUserOpHash = typeof userOpHash === "string" && !!userOpHash.trim();
      if (hasTxHash === hasUserOpHash) {
        return c.json({ error: "exactly one of txHash or userOpHash is required" }, 400);
      }
      const { user } = c.get("session");
      try {
        return c.json(
          await services.xmtpClientManager.submitInvestment({
            user,
            groupId,
            syncInboxId: syncInboxId.trim(),
            chainId,
            token,
            amount,
            ...(hasTxHash ? { txHash: txHash.trim() } : {}),
            ...(hasUserOpHash ? { userOpHash: userOpHash.trim() } : {}),
          }),
        );
      } catch (error) {
        return c.json({ error: errorMessage(error) }, statusForError(error));
      }
    },
  );

  app.post(
    "/kharisma/groups/:groupId/thread-catalog",
    sessionMiddleware,
    async (c) => {
      const parsed = await readJsonRecord(c);
      if (parsed.response) {
        return parsed.response;
      }
      const groupId = c.req.param("groupId");
      const syncInboxId = parsed.body.syncInboxId;
      if (typeof syncInboxId !== "string" || !syncInboxId.trim()) {
        return c.json({ error: "syncInboxId is required" }, 400);
      }
      try {
        const { user } = c.get("session");
        return c.json(
          await services.xmtpClientManager.getKharismaThreadCatalog({
            user,
            groupId,
            syncInboxId: syncInboxId.trim(),
          }),
        );
      } catch (error) {
        return c.json({ error: errorMessage(error) }, statusForError(error));
      }
    },
  );

  app.post("/kharisma/world-id/request", sessionMiddleware, async (c) => {
    const parsed = await readOptionalJsonRecord(c);
    if (parsed.response) {
      return parsed.response;
    }
    const action =
      parsed.body.action === "human" ||
      parsed.body.action === "human-agent" ||
      parsed.body.action === "identity"
        ? parsed.body.action
        : "identity";
    try {
      const { user } = c.get("session");
      return c.json(
        await services.xmtpClientManager.createWorldIdRequest(user, action),
      );
    } catch (error) {
      return c.json({ error: errorMessage(error) }, statusForError(error));
    }
  });

  app.post("/kharisma/status", sessionMiddleware, async (c) => {
    try {
      const { user } = c.get("session");
      return c.json({
        profile: await services.xmtpClientManager.getKharismaWalletStatus({
          user,
        }),
      });
    } catch (error) {
      return c.json({ error: errorMessage(error) }, statusForError(error));
    }
  });

  app.post("/kharisma/verify/identity", sessionMiddleware, async (c) => {
    const parsed = await readJsonRecord(c);
    if (parsed.response) {
      return parsed.response;
    }
    if (!("proof" in parsed.body)) {
      return c.json({ error: "proof is required" }, 400);
    }
    try {
      const { user } = c.get("session");
      return c.json({
        profile: await services.xmtpClientManager.submitKharismaIdentityVerification({
          user,
          proof: parsed.body.proof,
        }),
      });
    } catch (error) {
      return c.json({ error: errorMessage(error) }, statusForError(error));
    }
  });

  app.post("/kharisma/verify/human", sessionMiddleware, async (c) => {
    const parsed = await readJsonRecord(c);
    if (parsed.response) {
      return parsed.response;
    }
    const handle = parsed.body.handle;
    if (typeof handle !== "string" || !handle.trim()) {
      return c.json({ error: "handle is required" }, 400);
    }
    if (!("proof" in parsed.body)) {
      return c.json({ error: "proof is required" }, 400);
    }
    try {
      const { user } = c.get("session");
      return c.json({
        profile: await services.xmtpClientManager.submitKharismaHumanVerification({
          user,
          handle: handle.trim(),
          proof: parsed.body.proof,
        }),
      });
    } catch (error) {
      return c.json({ error: errorMessage(error) }, statusForError(error));
    }
  });

  app.post("/kharisma/groups/verify/status", sessionMiddleware, async (c) => {
    const parsed = await readJsonRecord(c);
    if (parsed.response) {
      return parsed.response;
    }
    const syncInboxId = parsed.body.syncInboxId;
    if (typeof syncInboxId !== "string" || !syncInboxId.trim()) {
      return c.json({ error: "syncInboxId is required" }, 400);
    }
    try {
      const { user } = c.get("session");
      return c.json({
        profile: await services.xmtpClientManager.getKharismaSyncWalletStatus({
          user,
          syncInboxId: syncInboxId.trim(),
        }),
      });
    } catch (error) {
      return c.json({ error: errorMessage(error) }, statusForError(error));
    }
  });

  app.post("/kharisma/groups/verify/identity", sessionMiddleware, async (c) => {
    const parsed = await readJsonRecord(c);
    if (parsed.response) {
      return parsed.response;
    }
    const syncInboxId = parsed.body.syncInboxId;
    if (typeof syncInboxId !== "string" || !syncInboxId.trim()) {
      return c.json({ error: "syncInboxId is required" }, 400);
    }
    if (!("proof" in parsed.body)) {
      return c.json({ error: "proof is required" }, 400);
    }
    try {
      const { user } = c.get("session");
      return c.json({
        profile:
          await services.xmtpClientManager.submitKharismaSyncIdentityVerification({
            user,
            syncInboxId: syncInboxId.trim(),
            proof: parsed.body.proof,
          }),
      });
    } catch (error) {
      return c.json({ error: errorMessage(error) }, statusForError(error));
    }
  });

  app.post("/kharisma/groups/verify/human", sessionMiddleware, async (c) => {
    const parsed = await readJsonRecord(c);
    if (parsed.response) {
      return parsed.response;
    }
    const syncInboxId = parsed.body.syncInboxId;
    const handle = parsed.body.handle;
    if (typeof syncInboxId !== "string" || !syncInboxId.trim()) {
      return c.json({ error: "syncInboxId is required" }, 400);
    }
    if (typeof handle !== "string" || !handle.trim()) {
      return c.json({ error: "handle is required" }, 400);
    }
    if (!("proof" in parsed.body)) {
      return c.json({ error: "proof is required" }, 400);
    }
    try {
      const { user } = c.get("session");
      return c.json({
        profile:
          await services.xmtpClientManager.submitKharismaSyncHumanVerification({
            user,
            syncInboxId: syncInboxId.trim(),
            handle: handle.trim(),
            proof: parsed.body.proof,
          }),
      });
    } catch (error) {
      return c.json({ error: errorMessage(error) }, statusForError(error));
    }
  });

  app.post(
    "/kharisma/groups/verify/human-agent",
    sessionMiddleware,
    async (c) => {
      const parsed = await readJsonRecord(c);
      if (parsed.response) {
        return parsed.response;
      }
      const syncInboxId = parsed.body.syncInboxId;
      const ownerHumanId = parsed.body.ownerHumanId;
      const handle = parsed.body.handle;
      if (typeof syncInboxId !== "string" || !syncInboxId.trim()) {
        return c.json({ error: "syncInboxId is required" }, 400);
      }
      if (typeof ownerHumanId !== "string" || !ownerHumanId.trim()) {
        return c.json({ error: "ownerHumanId is required" }, 400);
      }
      if (typeof handle !== "string" || !handle.trim()) {
        return c.json({ error: "handle is required" }, 400);
      }
      if (!("proof" in parsed.body)) {
        return c.json({ error: "proof is required" }, 400);
      }
      try {
        const { user } = c.get("session");
        return c.json({
          profile:
            await services.xmtpClientManager.submitKharismaSyncHumanAgentVerification({
              user,
              syncInboxId: syncInboxId.trim(),
              ownerHumanId: ownerHumanId.trim(),
              handle: handle.trim(),
              proof: parsed.body.proof,
            }),
        });
      } catch (error) {
        return c.json({ error: errorMessage(error) }, statusForError(error));
      }
    },
  );

  app.post(
    "/kharisma/groups/list",
    sessionMiddleware,
    x402Middleware,
    async (c) => {
      try {
        const { user } = c.get("session");
        let languages: GroupLanguageCode[] | undefined;
        const parsed = await readOptionalJsonRecord(c);
        if (parsed.response) {
          return parsed.response;
        }
        if ("languages" in parsed.body) {
          const normalized = normalizeGroupLanguages(parsed.body.languages);
          if (!normalized) {
            return c.json(
              { error: "languages must be ISO 639-1 codes" },
              400,
            );
          }
          languages = normalized;
        }
        return c.json({
          groups: await services.xmtpClientManager.listKharismaGroups({
            user,
            languages,
          }),
        });
      } catch (error) {
        return c.json({ error: errorMessage(error) }, statusForError(error));
      }
    },
  );

  app.post(
    "/kharisma/groups",
    sessionMiddleware,
    x402Middleware,
    async (c) => {
      const parsed = await readJsonRecord(c);

      if (parsed.response) {
        return parsed.response;
      }

      const title = parsed.body.title;
      const description = parsed.body.description;
      const mediaId = parsed.body.mediaId;
      const thumbnailId = parsed.body.thumbnailId;
      const languages = normalizeGroupLanguages(parsed.body.languages);
      const joinPolicy = parsed.body.joinPolicy;
      const joinApproval = parsed.body.joinApproval ?? "NONE";
      const maxMembers = Number(parsed.body.maxMembers);
      if (!isGroupJoinPolicy(joinPolicy)) {
        return c.json({ error: "joinPolicy is required" }, 400);
      }
      if (!isGroupJoinApproval(joinApproval)) {
        return c.json({ error: "joinApproval is invalid" }, 400);
      }
      if (typeof title !== "string" || !title.trim()) {
        return c.json({ error: "title is required" }, 400);
      }
      if (
        typeof description !== "string" ||
        description.trim().length < 20
      ) {
        return c.json(
          { error: "description must be at least 20 characters" },
          400,
        );
      }
      if (typeof mediaId !== "string" || !mediaId.trim()) {
        return c.json({ error: "mediaId is required" }, 400);
      }
      if (typeof thumbnailId !== "string" || !thumbnailId.trim()) {
        return c.json({ error: "thumbnailId is required" }, 400);
      }
      if (!languages || languages.length === 0) {
        return c.json(
          { error: "languages must include at least one ISO 639-1 code" },
          400,
        );
      }
      if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 200) {
        return c.json(
          { error: "maxMembers must be an integer between 2 and 200" },
          400,
        );
      }

      const mediaRecord = services.database.getMediaUploadById(mediaId);
      if (!mediaRecord) {
        return c.json({ error: "media not found" }, 404);
      }
      const thumbnailRecord = services.database.getMediaUploadById(thumbnailId);
      if (!thumbnailRecord) {
        return c.json({ error: "thumbnail not found" }, 404);
      }
      const origin = new URL(c.req.url).origin;
      const mediaUrl =
        mediaRecord.publicUrl || `${origin}/media/${encodeURIComponent(mediaId)}`;
      const thumbnailUrl =
        thumbnailRecord.publicUrl || `${origin}/media/${encodeURIComponent(thumbnailId)}`;

      try {
        const { user } = c.get("session");
        return c.json({
          group: await services.xmtpClientManager.createKharismaGroup({
            user,
            title: title.trim(),
            description: description.trim(),
            mediaUrl,
            thumbnailUrl,
            languages,
            joinPolicy,
            joinApproval,
            maxMembers,
          }),
        });
      } catch (error) {
        return c.json({ error: errorMessage(error) }, statusForError(error));
      }
    },
  );

  app.post(
    "/kharisma/groups/join",
    sessionMiddleware,
    x402Middleware,
    async (c) => {
      const parsed = await readJsonRecord(c);

      if (parsed.response) {
        return parsed.response;
      }

      const groupId = parsed.body.groupId;
      const syncInboxId = parsed.body.syncInboxId;
      const name = parsed.body.name;
      if (typeof groupId !== "string" || !groupId.trim()) {
        return c.json({ error: "groupId is required" }, 400);
      }
      if (typeof syncInboxId !== "string" || !syncInboxId.trim()) {
        return c.json({ error: "syncInboxId is required" }, 400);
      }
      if (
        typeof name !== "undefined" &&
        (typeof name !== "string" || !name.trim())
      ) {
        return c.json({ error: "name must be a non-empty string" }, 400);
      }

      try {
        const { user } = c.get("session");
        return c.json({
          join: await services.xmtpClientManager.joinKharismaGroup({
            user,
            groupId: groupId.trim(),
            syncInboxId: syncInboxId.trim(),
            name: typeof name === "string" ? name.trim() : undefined,
          }),
        });
      } catch (error) {
        return c.json({ error: errorMessage(error) }, statusForError(error));
      }
    },
  );

  app.post(
    "/kharisma/groups/:groupId/join-approvals/:pendingJoinId/approve",
    sessionMiddleware,
    async (c) => {
      const parsed = await readJsonRecord(c);
      if (parsed.response) {
        return parsed.response;
      }

      const groupId = c.req.param("groupId");
      const pendingJoinId = c.req.param("pendingJoinId");
      const conversationId = parsed.body.conversationId;
      if (typeof conversationId !== "string" || !conversationId.trim()) {
        return c.json({ error: "conversationId is required" }, 400);
      }

      try {
        const { user } = c.get("session");
        return c.json(
          await services.xmtpClientManager.approveKharismaJoin({
            user,
            groupId,
            pendingJoinId,
            conversationId: conversationId.trim(),
          }),
        );
      } catch (error) {
        return c.json({ error: errorMessage(error) }, statusForError(error));
      }
    },
  );
}
