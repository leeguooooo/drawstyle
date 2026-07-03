import type { Context } from "hono";
import { isAdminEmail, type AuthVariables } from "./auth";
import { getImagesByKey, type ImageAccessRow } from "./db";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageContentType = "image/png" | "image/jpeg" | "image/webp";

export interface SniffedImage {
  content_type: ImageContentType;
  ext: "png" | "jpg" | "webp";
}

export interface StoredImage {
  r2_key: string;
  content_type: ImageContentType;
  size: number;
}

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

export function sniffMime(input: ArrayBuffer | Uint8Array): SniffedImage | null {
  const bytes = toBytes(input);
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { content_type: "image/png", ext: "png" };
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { content_type: "image/jpeg", ext: "jpg" };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { content_type: "image/webp", ext: "webp" };
  }
  return null;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function validateImageBytes(input: ArrayBuffer | Uint8Array): SniffedImage {
  const bytes = toBytes(input);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ImageValidationError("image exceeds 5 MB limit");
  }
  const sniffed = sniffMime(bytes);
  if (!sniffed) {
    throw new ImageValidationError("unsupported image type");
  }
  return sniffed;
}

export async function putImage(
  bucket: R2Bucket,
  input: ArrayBuffer | Uint8Array,
): Promise<StoredImage> {
  const bytes = toBytes(input);
  const sniffed = validateImageBytes(bytes);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const r2_key = `${hex(new Uint8Array(digest))}.${sniffed.ext}`;
  await bucket.put(r2_key, bytes, {
    httpMetadata: { contentType: sniffed.content_type },
  });
  return {
    r2_key,
    content_type: sniffed.content_type,
    size: bytes.byteLength,
  };
}

function canViewImage(
  rows: ImageAccessRow[],
  env: Env,
  user: AuthVariables["user"] | undefined,
): boolean {
  if (rows.length === 0) {
    return false;
  }
  if (rows.some((row) => row.style_status === "approved" && row.pending === 0)) {
    return true;
  }
  if (!user) {
    return false;
  }
  return rows.some((row) => row.owner_user_id === user.id) ||
    isAdminEmail(user.email, env);
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

export async function imageProxy(
  c: Context<{ Bindings: Env; Variables: Partial<AuthVariables> }>,
): Promise<Response> {
  const key = c.req.param("key");
  if (!key) {
    return notFound();
  }
  const rows = await getImagesByKey(c.env.DB, key);
  if (!canViewImage(rows, c.env, c.var.user)) {
    return notFound();
  }

  const object = await c.env.ASSETS.get(key);
  if (!object?.body) {
    return notFound();
  }
  const contentType = rows[0]?.content_type;
  if (!contentType) {
    return notFound();
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
