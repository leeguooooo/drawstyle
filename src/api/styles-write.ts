import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { CATEGORIES } from "./styles-read";
import { requireUser, type AuthVariables } from "../auth";
import {
  addImage,
  addTags,
  countUserStylesSince,
  createStyle,
  deleteImagesByIds,
  getApprovedStyleBySlug,
  getImagesForStyle,
  getStyleBySlug,
  likeStyle,
  replaceTags,
  setPendingRevision,
  type ImageRole,
  type StyleKind,
  unlikeStyle,
  updateStyleFields,
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

async function parseBody(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
): Promise<Record<string, unknown> | null> {
  try {
    return (await c.req.parseBody({ all: true })) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasField(body: Record<string, unknown>, key: string): boolean {
  return body[key] !== undefined;
}

function editPayload(body: Record<string, unknown>) {
  return {
    name: stringField(body, "name"),
    snippet: stringField(body, "snippet"),
    category: stringField(body, "category"),
    tags: normalizeTags(body),
    refs: fileList(body, "ref[]"),
  };
}

stylesWriteRoutes.post("/styles", requireUser, async (c) => {
  const body = await parseBody(c);
  if (!body) {
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

stylesWriteRoutes.put("/styles/:slug", requireUser, async (c) => {
  const body = await parseBody(c);
  if (!body) {
    return errorJson("bad_multipart", "invalid multipart form data", 400);
  }
  if (hasField(body, "slug") || hasField(body, "kind")) {
    return errorJson("immutable_field", "slug and kind are immutable", 400);
  }

  const style = await getStyleBySlug(c.env.DB, c.req.param("slug"));
  if (!style) {
    return errorJson("not_found", "style not found", 404);
  }
  if (style.owner_user_id !== c.var.user.id) {
    return errorJson("forbidden", "not your style", 403);
  }

  const edit = editPayload(body);
  if (!edit.name) {
    return errorJson("bad_name", "name is required", 400);
  }
  if (!CATEGORY_KEYS.has(edit.category)) {
    return errorJson("bad_category", "unknown category", 400);
  }
  if (edit.refs.length > 4) {
    return errorJson("bad_refs", "submit at most 4 reference images", 400);
  }

  let refs: Array<{
    role: ImageRole;
    r2_key: string;
    content_type: string;
    sort: number;
  }>;
  try {
    refs = await storeFiles(c.env, edit.refs, "reference");
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return errorJson("bad_image", error.message, 400);
    }
    throw error;
  }

  if (style.status === "approved") {
    const oldPending = await getImagesForStyle(c.env.DB, style.id, {
      role: "reference",
      pending: 1,
    });
    await deleteImagesByIds(
      c.env.DB,
      oldPending.map((image) => image.id),
    );
    await Promise.all(oldPending.map((image) => c.env.ASSETS.delete(image.r2_key)));

    const stagedIds: number[] = [];
    for (const image of refs) {
      const row = await addImage(c.env.DB, {
        style_id: style.id,
        r2_key: image.r2_key,
        role: image.role,
        content_type: image.content_type,
        pending: 1,
        sort: image.sort,
      });
      stagedIds.push(row.id);
    }
    const updated = await setPendingRevision(
      c.env.DB,
      style.id,
      JSON.stringify({
        name: edit.name,
        snippet: edit.snippet,
        category: edit.category,
        tags: edit.tags,
        ref_image_ids: stagedIds,
      }),
    );
    return c.json({
      style: {
        slug: updated.slug,
        status: updated.status,
        pending_revision: true,
        version: updated.version,
      },
    });
  }

  if (style.status === "pending" || style.status === "rejected") {
    const updated = await updateStyleFields(c.env.DB, style.id, {
      name: edit.name,
      snippet: edit.snippet,
      category: edit.category,
      status: "pending",
      pending_revision: null,
      review_note: null,
    });
    await replaceTags(c.env.DB, style.id, edit.tags);
    for (const image of refs) {
      await addImage(c.env.DB, {
        style_id: style.id,
        r2_key: image.r2_key,
        role: image.role,
        content_type: image.content_type,
        pending: 0,
        sort: image.sort,
      });
    }
    return c.json({
      style: {
        slug: updated.slug,
        status: updated.status,
        pending_revision: false,
        version: updated.version,
      },
    });
  }

  return errorJson("not_editable", "style is not editable", 400);
});

stylesWriteRoutes.post("/styles/:slug/like", requireUser, async (c) => {
  const style = await getApprovedStyleBySlug(c.env.DB, c.req.param("slug"));
  if (!style) {
    return errorJson("not_found", "style not found", 404);
  }
  await likeStyle(c.env.DB, c.var.user.id, style.id);
  const updated = await getApprovedStyleBySlug(c.env.DB, style.slug);
  return c.json({ likes_count: updated?.likes_count ?? style.likes_count });
});

stylesWriteRoutes.delete("/styles/:slug/like", requireUser, async (c) => {
  const style = await getApprovedStyleBySlug(c.env.DB, c.req.param("slug"));
  if (!style) {
    return errorJson("not_found", "style not found", 404);
  }
  await unlikeStyle(c.env.DB, c.var.user.id, style.id);
  const updated = await getApprovedStyleBySlug(c.env.DB, style.slug);
  return c.json({ likes_count: updated?.likes_count ?? 0 });
});
