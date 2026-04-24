import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function toBase64Url(input: Buffer) {
  return input
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64Url(input: string) {
  const padded = input.replaceAll("-", "+").replaceAll("_", "/");
  const remainder = padded.length % 4;
  const suffix = remainder === 0 ? "" : "=".repeat(4 - remainder);
  return Buffer.from(`${padded}${suffix}`, "base64");
}

/**
 * AES-256-GCM SecretBox, shaped exactly like `clients-service`'s
 * encryption helper so mental model and output format match across
 * services. Payload layout: `v1.<iv>.<tag>.<ciphertext>` with each
 * component base64url-encoded.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(masterKeyHex: string) {
    const key = Buffer.from(masterKeyHex.replace(/^0x/, ""), "hex");

    if (key.length !== 32) {
      throw new Error("SecretBox key must be 32 bytes");
    }

    this.key = key;
  }

  seal(plaintext: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return `v1.${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(encrypted)}`;
  }

  open(payload: string) {
    const [version, ivValue, tagValue, encryptedValue] = payload.split(".");

    if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
      throw new Error("Invalid encrypted payload");
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      fromBase64Url(ivValue),
    );
    decipher.setAuthTag(fromBase64Url(tagValue));

    const plaintext = Buffer.concat([
      decipher.update(fromBase64Url(encryptedValue)),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  }
}
