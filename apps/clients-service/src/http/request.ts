import type { Context } from "hono";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function readJsonRecord(c: Context) {
  try {
    const body = await c.req.json();

    if (!isRecord(body)) {
      return {
        body: null,
        response: c.json({ error: "Invalid JSON body" }, 400),
      };
    }

    return {
      body,
      response: null,
    };
  } catch {
    return {
      body: null,
      response: c.json({ error: "Invalid JSON body" }, 400),
    };
  }
}
