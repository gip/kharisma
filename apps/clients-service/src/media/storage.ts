import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import type { BackendConfig } from "../config.js";

export const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

export type MediaStoragePutInput = {
  objectKey: string;
  body: Buffer;
  mimeType: string;
  contentLength: number;
};

export type MediaStoragePutResult = {
  objectKey: string;
  publicUrl: string | null;
};

export type MediaStorageObject = {
  body: Buffer;
  mimeType: string;
  contentLength: number;
};

export type MediaStorage = {
  provider: "local" | "r2";
  put(input: MediaStoragePutInput): Promise<MediaStoragePutResult>;
  get?(objectKey: string): Promise<MediaStorageObject | null>;
};

type S3ClientLike = {
  send(command: PutObjectCommand): Promise<unknown>;
};

function joinPublicUrl(baseUrl: string, objectKey: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${objectKey
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export class LocalMediaStorage implements MediaStorage {
  readonly provider = "local" as const;

  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
  }

  async put(input: MediaStoragePutInput): Promise<MediaStoragePutResult> {
    const diskPath = this.resolveObjectPath(input.objectKey);

    mkdirSync(path.dirname(diskPath), { recursive: true });
    await writeFile(diskPath, input.body);

    return {
      objectKey: input.objectKey,
      publicUrl: null,
    };
  }

  async get(objectKey: string): Promise<MediaStorageObject | null> {
    try {
      const body = await readFile(this.resolveObjectPath(objectKey));

      return {
        body,
        mimeType: "application/octet-stream",
        contentLength: body.length,
      };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return null;
      }

      throw error;
    }
  }

  private resolveObjectPath(objectKey: string) {
    const diskPath = path.resolve(this.rootDir, objectKey);
    const root = path.resolve(this.rootDir);

    if (diskPath !== root && !diskPath.startsWith(`${root}${path.sep}`)) {
      throw new Error("Invalid media object key");
    }

    return diskPath;
  }
}

export class R2MediaStorage implements MediaStorage {
  readonly provider = "r2" as const;

  constructor(
    private readonly input: {
      bucket: string;
      publicBaseUrl: string;
    },
    private readonly client: S3ClientLike,
  ) {}

  async put(input: MediaStoragePutInput): Promise<MediaStoragePutResult> {
    const commandInput: PutObjectCommandInput = {
      Bucket: this.input.bucket,
      Key: input.objectKey,
      Body: input.body,
      ContentType: input.mimeType,
      ContentLength: input.contentLength,
      CacheControl: MEDIA_CACHE_CONTROL,
    };

    await this.client.send(new PutObjectCommand(commandInput));

    return {
      objectKey: input.objectKey,
      publicUrl: joinPublicUrl(this.input.publicBaseUrl, input.objectKey),
    };
  }
}

export function createMediaStorage(config: BackendConfig): MediaStorage {
  if (config.mediaStorageProvider === "local") {
    return new LocalMediaStorage(config.mediaUploadsDir);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
    },
  });

  return new R2MediaStorage(
    {
      bucket: config.r2Bucket,
      publicBaseUrl: config.mediaPublicBaseUrl,
    },
    client,
  );
}
