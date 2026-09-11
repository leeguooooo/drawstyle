import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  countPlayerUploadsSince,
  createPlayerUpload,
} from "../db";
import {
  ImageValidationError,
  deleteUnreferencedObjects,
  putImage,
  validateImageBytes,
} from "../images";

const DAILY_MACHINE_UPLOAD_LIMIT = 10;
const MAX_MACHINE_ID_LENGTH = 512;

export const uploadRoutes = new Hono<{ Bindings: Env }>();

function errorJson(
  code: string,
  message: string,
  status: ContentfulStatusCode,
): Response {
  return Response.json({ error: { code, message } }, { status });
}

function utcDayStartIso(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function machineHash(env: Env, machineId: string): Promise<string> {
  const material = new TextEncoder().encode(`${env.SESSION_SECRET}:${machineId}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return hex(new Uint8Array(digest));
}

async function parseBody(c: { req: { parseBody: (options?: { all?: boolean }) => Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  try {
    return (await c.req.parseBody({ all: true })) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function value(body: Record<string, unknown>, key: string): unknown {
  const found = body[key];
  return Array.isArray(found) ? found[0] : found;
}

function imageFile(body: Record<string, unknown>): File | null {
  const candidate = value(body, "image") ?? value(body, "file");
  return candidate instanceof File && candidate.size > 0 ? candidate : null;
}

function machineIdFromRequest(
  body: Record<string, unknown>,
  header: string | undefined,
): string {
  const formValue = value(body, "machine_id");
  return (typeof formValue === "string" ? formValue : header ?? "").trim();
}

uploadRoutes.post("/uploads", async (c) => {
  const body = await parseBody(c);
  if (!body) {
    return errorJson("bad_multipart", "invalid multipart form data", 400);
  }

  const machineId = machineIdFromRequest(body, c.req.header("X-Drawstyle-Machine-Id"));
  if (!machineId || machineId.length > MAX_MACHINE_ID_LENGTH) {
    return errorJson(
      "bad_machine_id",
      "X-Drawstyle-Machine-Id header or machine_id field is required",
      400,
    );
  }

  const file = imageFile(body);
  if (!file) {
    return errorJson("bad_image", "image file is required", 400);
  }

  const maybeStyleSlug = value(body, "style_slug");
  const styleSlug = typeof maybeStyleSlug === "string" ? maybeStyleSlug.trim() : null;

  const hash = await machineHash(c.env, machineId);
  const usedToday = await countPlayerUploadsSince(c.env.DB, hash, utcDayStartIso());
  if (usedToday >= DAILY_MACHINE_UPLOAD_LIMIT) {
    return errorJson("rate_limited", "daily machine upload limit reached", 429);
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
    validateImageBytes(bytes);
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return errorJson("bad_image", error.message, 400);
    }
    throw error;
  }

  const stored = await putImage(c.env.ASSETS, bytes);
  try {
    await createPlayerUpload(c.env.DB, {
      machine_hash: hash,
      r2_key: stored.r2_key,
      content_type: stored.content_type,
      size: stored.size,
      style_slug: styleSlug,
    });
  } catch (error) {
    await deleteUnreferencedObjects(c.env, [stored.r2_key]);
    throw error;
  }

  const origin = new URL(c.req.url).origin;
  return c.json(
    {
      upload: {
        url: `${origin}/img/${encodeURIComponent(stored.r2_key)}`,
        key: stored.r2_key,
        content_type: stored.content_type,
        size: stored.size,
        style_slug: styleSlug,
        remaining_today: Math.max(0, DAILY_MACHINE_UPLOAD_LIMIT - usedToday - 1),
      },
    },
    201,
  );
});
