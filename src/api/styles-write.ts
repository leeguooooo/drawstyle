import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { CATEGORIES } from "./styles-read";
import { requireUser, type AuthVariables } from "../auth";
import {
  addImage,
  addTags,
  countUserStylesSince,
  createStyle,
  getApprovedStyleBySlug,
  getStyleBySlug,
  type ImageRole,
  type StyleKind,
} from "../db";
import { ImageValidationError, putImage } from "../images";

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;
const TAG_RE = /^[a-z0-9][a-z0-9_-]*$/;
const CATEGORY_KEYS = new Set<string>(CATEGORIES.map((category) => category.key));
const STYLE_KINDS = new Set(["style", "character"]);
const DAILY_SUBMISSION_LIMIT = 10;

export const stylesWriteRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

function errorJson(
  code: string,
  message: string,
  status: ContentfulStatusCode,
): Response {
  return Response.json({ error: { code, message } }, { status });
}

function values(body: Record<string, unknown>, key: string): unknown[] {
  const value = body[key];
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function stringField(
  body: Record<string, unknown>,
  key: string,
  defaultValue = "",
): string {
  const value = values(body, key)[0];
  return typeof value === "string" ? value.trim() : defaultValue;
}

function fileList(body: Record<string, unknown>, key: string): File[] {
  return values(body, key).filter(
    (value): value is File => value instanceof File && value.size > 0,
  );
}

function normalizeTags(body: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  for (const value of values(body, "tag")) {
    if (typeof value !== "string") {
      continue;
    }
    const tag = value.trim().toLowerCase();
    if (tag && TAG_RE.test(tag)) {
      seen.add(tag);
    }
  }
  return [...seen];
}

function utcDayStartIso(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

async function storeFiles(
  env: Env,
  files: File[],
  role: ImageRole,
): Promise<Array<{ role: ImageRole; r2_key: string; content_type: string; sort: number }>> {
  const rows = [];
  for (let index = 0; index < files.length; index += 1) {
    const stored = await putImage(env.ASSETS, await files[index].arrayBuffer());
    rows.push({
      role,
      r2_key: stored.r2_key,
      content_type: stored.content_type,
      sort: index,
    });
  }
  return rows;
}

stylesWriteRoutes.post("/styles", requireUser, async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.parseBody({ all: true })) as Record<string, unknown>;
  } catch {
    return errorJson("bad_multipart", "invalid multipart form data", 400);
  }

  const slug = stringField(body, "slug");
  const name = stringField(body, "name");
  const kind = stringField(body, "kind") as StyleKind;
  const snippet = stringField(body, "snippet");
  const category = stringField(body, "category");
  const forkedFromSlug = stringField(body, "forked_from_slug");
  const examples = fileList(body, "example[]");
  const refs = fileList(body, "ref[]");
  const tags = normalizeTags(body);

  if (!SLUG_RE.test(slug)) {
    return errorJson("bad_slug", "slug must match ^[a-z0-9][a-z0-9_-]*$", 400);
  }
  if (!name) {
    return errorJson("bad_name", "name is required", 400);
  }
  if (!STYLE_KINDS.has(kind)) {
    return errorJson("bad_kind", "kind must be style or character", 400);
  }
  if (!CATEGORY_KEYS.has(category)) {
    return errorJson("bad_category", "unknown category", 400);
  }
  if (examples.length < 1 || examples.length > 3) {
    return errorJson("bad_examples", "submit 1 to 3 example images", 400);
  }
  if (refs.length > 4) {
    return errorJson("bad_refs", "submit at most 4 reference images", 400);
  }
  if (await getStyleBySlug(c.env.DB, slug)) {
    return errorJson("slug_taken", "slug is already taken", 400);
  }

  const submissionsToday = await countUserStylesSince(
    c.env.DB,
    c.var.user.id,
    utcDayStartIso(),
  );
  if (submissionsToday >= DAILY_SUBMISSION_LIMIT) {
    return errorJson("rate_limited", "daily submission limit reached", 429);
  }

  const forkedFrom = forkedFromSlug
    ? await getApprovedStyleBySlug(c.env.DB, forkedFromSlug)
    : null;
  if (forkedFromSlug && !forkedFrom) {
    return errorJson("bad_fork", "forked_from_slug does not exist", 400);
  }

  let images: Array<{
    role: ImageRole;
    r2_key: string;
    content_type: string;
    sort: number;
  }>;
  try {
    images = [
      ...(await storeFiles(c.env, examples, "example")),
      ...(await storeFiles(c.env, refs, "reference")),
    ];
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return errorJson("bad_image", error.message, 400);
    }
    throw error;
  }

  const style = await createStyle(c.env.DB, {
    slug,
    name,
    owner_user_id: c.var.user.id,
    kind,
    category,
    status: "pending",
    snippet,
    forked_from: forkedFrom?.id ?? null,
  });
  await addTags(c.env.DB, style.id, tags);
  for (const image of images) {
    await addImage(c.env.DB, {
      style_id: style.id,
      r2_key: image.r2_key,
      role: image.role,
      content_type: image.content_type,
      sort: image.sort,
    });
  }

  return c.json(
    {
      style: {
        slug: style.slug,
        status: style.status,
        version: style.version,
      },
    },
    201,
  );
});
