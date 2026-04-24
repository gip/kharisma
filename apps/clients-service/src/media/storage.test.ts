import { PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { MEDIA_CACHE_CONTROL, R2MediaStorage } from "./storage.js";

describe("R2MediaStorage", () => {
  it("uploads objects with CDN-friendly metadata and returns the public URL", async () => {
    const sentCommands: PutObjectCommand[] = [];
    const storage = new R2MediaStorage(
      {
        bucket: "kharisma-media",
        publicBaseUrl: "https://media.kharisma.example",
      },
      {
        async send(command) {
          sentCommands.push(command);
          return {};
        },
      },
    );
    const body = Buffer.from("video-data");

    const result = await storage.put({
      objectKey: "uploads/1/video.webm",
      body,
      mimeType: "video/webm",
      contentLength: body.length,
    });

    expect(result).toEqual({
      objectKey: "uploads/1/video.webm",
      publicUrl: "https://media.kharisma.example/uploads/1/video.webm",
    });
    expect(sentCommands).toHaveLength(1);

    const command = sentCommands[0]!;
    expect(command.input).toMatchObject({
      Bucket: "kharisma-media",
      Key: "uploads/1/video.webm",
      Body: body,
      ContentType: "video/webm",
      ContentLength: body.length,
      CacheControl: MEDIA_CACHE_CONTROL,
    });
  });
});
