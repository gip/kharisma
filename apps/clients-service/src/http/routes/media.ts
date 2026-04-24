import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { MiddlewareHandler } from "hono";
import type { Context, Hono } from "hono";
import type { AppServices, BackendAppEnv } from "../../backend-types.js";
import type { MediaUploadRecord } from "../../storage/database.js";
import { createSessionMiddleware } from "../session.js";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function mediaExtension(filename: string) {
  const extension = path.extname(filename).replace(/^\./, "").toLowerCase();

  if (/^[a-z0-9]{1,12}$/.test(extension)) {
    return extension;
  }

  return "webm";
}

function localMediaUrl(c: Context<BackendAppEnv>, mediaId: string) {
  const requestUrl = new URL(c.req.url);
  const host =
    c.req.header("x-forwarded-host") ??
    c.req.header("host") ??
    requestUrl.host ??
    "localhost:3001";
  const protocol =
    c.req.header("x-forwarded-proto") ??
    requestUrl.protocol.replace(/:$/, "") ??
    "http";

  return `${protocol}://${host}/media/${encodeURIComponent(mediaId)}`;
}

function mediaUrl(c: Context<BackendAppEnv>, record: MediaUploadRecord) {
  return record.publicUrl || localMediaUrl(c, record.id);
}

export function registerMediaRoutes(
  app: Hono<BackendAppEnv>,
  services: AppServices,
  x402Middleware: MiddlewareHandler<BackendAppEnv>,
) {
  const sessionMiddleware = createSessionMiddleware(services);

  app.post("/media/upload", sessionMiddleware, x402Middleware, async (c) => {
    try {
      const { user } = c.get("session");
      const body = await c.req.parseBody();
      const file = body.file;

      if (!(file instanceof File)) {
        return c.json({ error: "file field is required" }, 400);
      }

      if (!file.type.startsWith("video/") && !file.type.startsWith("image/")) {
        return c.json({ error: "Only image and video files are accepted" }, 400);
      }

      if (file.size > MAX_FILE_SIZE) {
        return c.json({ error: "File too large (max 50 MB)" }, 400);
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const id = randomUUID();
      const filename = `${id}.${mediaExtension(file.name)}`;
      const objectKey = `uploads/${user.id}/${filename}`;
      const contentDigest = createHash("sha256").update(buffer).digest("hex");
      const stored = await services.mediaStorage.put({
        objectKey,
        body: buffer,
        mimeType: file.type,
        contentLength: buffer.length,
      });
      const publicUrl = stored.publicUrl ?? localMediaUrl(c, id);
      const record = services.database.createMediaUpload({
        id,
        userId: user.id,
        filename,
        mimeType: file.type,
        contentLength: buffer.length,
        contentDigest,
        storageProvider: services.mediaStorage.provider,
        objectKey,
        publicUrl,
      });

      return c.json({
        id,
        url: mediaUrl(c, record),
        mimeType: record.mimeType,
        contentLength: record.contentLength,
        contentDigest: record.contentDigest,
      });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Upload failed",
        },
        500,
      );
    }
  });

  app.get("/media/:id", async (c) => {
    const id = c.req.param("id");
    const record = services.database.getMediaUploadById(id);

    if (!record) {
      return c.json({ error: "Not found" }, 404);
    }

    if (record.storageProvider === "r2") {
      return c.redirect(mediaUrl(c, record), 302);
    }

    const object = await services.mediaStorage.get?.(record.objectKey);

    if (!object) {
      return c.json({ error: "Not found" }, 404);
    }

    return new Response(object.body, {
      headers: {
        "content-type": record.mimeType,
        "content-length": String(record.contentLength),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  });

  app.post(
    "/messages/send-attachment",
    sessionMiddleware,
    x402Middleware,
    async (c) => {
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const { user } = c.get("session");
        const conversationId = body.conversationId;
        const mediaId = body.mediaId;
        const thumbnailMediaId =
          typeof body.thumbnailMediaId === "string"
            ? body.thumbnailMediaId
            : null;

        if (typeof conversationId !== "string" || typeof mediaId !== "string") {
          return c.json(
            { error: "conversationId and mediaId are required" },
            400,
          );
        }

        const record = services.database.getMediaUploadById(mediaId);

        if (!record || record.userId !== user.id) {
          return c.json({ error: "Media not found" }, 404);
        }

        let thumbnailUrl: string | null = null;
        if (thumbnailMediaId) {
          const thumbnailRecord =
            services.database.getMediaUploadById(thumbnailMediaId);
          if (!thumbnailRecord || thumbnailRecord.userId !== user.id) {
            return c.json({ error: "Thumbnail not found" }, 404);
          }
          thumbnailUrl = mediaUrl(c, thumbnailRecord);
        }

        const message =
          await services.xmtpClientManager.sendRemoteAttachment({
            user,
            conversationId,
            url: mediaUrl(c, record),
            mimeType: record.mimeType,
            filename: record.filename,
            contentLength: record.contentLength,
            contentDigest: record.contentDigest,
            thumbnailUrl,
          });

        return c.json({ message });
      } catch (error) {
        return c.json(
          {
            error:
              error instanceof Error ? error.message : "Failed to send attachment",
          },
          500,
        );
      }
    },
  );

  app.post(
    "/conversations/:conversationId/threads/:threadId/attachments",
    sessionMiddleware,
    x402Middleware,
    async (c) => {
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const { user } = c.get("session");
        const conversationId = c.req.param("conversationId");
        const threadId = c.req.param("threadId");
        const mediaId = body.mediaId;
        const thumbnailMediaId =
          typeof body.thumbnailMediaId === "string"
            ? body.thumbnailMediaId
            : null;

        if (typeof mediaId !== "string") {
          return c.json({ error: "mediaId is required" }, 400);
        }

        const record = services.database.getMediaUploadById(mediaId);
        if (!record || record.userId !== user.id) {
          return c.json({ error: "Media not found" }, 404);
        }

        let thumbnailUrl: string | null = null;
        if (thumbnailMediaId) {
          const thumbnailRecord =
            services.database.getMediaUploadById(thumbnailMediaId);
          if (!thumbnailRecord || thumbnailRecord.userId !== user.id) {
            return c.json({ error: "Thumbnail not found" }, 404);
          }
          thumbnailUrl = mediaUrl(c, thumbnailRecord);
        }

        const message =
          await services.xmtpClientManager.sendThreadAttachment({
            user,
            conversationId,
            threadId,
            url: mediaUrl(c, record),
            mimeType: record.mimeType,
            filename: record.filename,
            contentLength: record.contentLength,
            contentDigest: record.contentDigest,
            thumbnailUrl,
          });

        return c.json({ message });
      } catch (error) {
        return c.json(
          {
            error:
              error instanceof Error ? error.message : "Failed to send attachment",
          },
          500,
        );
      }
    },
  );
}
