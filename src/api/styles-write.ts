import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { CATEGORIES } from "./styles-read";
import { requireUser, type AuthVariables } from "../auth";
import {
  addImage,
  addTags,
  countUserStylesSince,
  createStyle,
  getApprovedStyleBySlug,
  getImagesForStyle,
  getStyleBySlug,
  likeStyle,
  replaceTags,
  setPendingRevision,
  type ImageRole,
  type StyleKind,
  type StyleRow,
  unlikeStyle,
  updateStyleFields,
} from "../db";
import {
  ImageValidationError,
  deleteImageRowsAndObjects,
  deleteUnreferencedObjects,
  putImage,
} from "../images";

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;
const TAG_RE = /^[a-z0-9][a-z0-9_-]*$/;
const CATEGORY_KEYS = new Set<string>(CATEGORIES.map((category) => category.key));
const STYLE_KINDS = new Set(["style", "character"]);
const DAILY_SUBMISSION_LIMIT = 10;
const MAX_NAME_LENGTH = 120;
const MAX_SNIPPET_LENGTH = 4000;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 40;
const MAX_REFS = 4;

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
    // Each tag field may carry several tags separated by whitespace/commas,
    // so the single web-form input can hold (and prefill) a full tag list.
    for (const part of value.split(/[\s,]+/)) {
      const tag = part.trim().toLowerCase();
      if (tag && TAG_RE.test(tag)) {
        seen.add(tag);
      }
    }
  }
  return [...seen];
}

// Field caps shared by submit and edit. Tags over MAX_TAG_LENGTH still match
// TAG_RE (its length is unbounded), so they reach this check instead of being
// silently dropped.
function textCapsError(
  name: string,
  snippet: string,
  tags: string[],
): Response | null {
  if (name.length > MAX_NAME_LENGTH) {
    return errorJson(
      "bad_name",
      `name must be at most ${MAX_NAME_LENGTH} characters`,
      400,
    );
  }
  if (snippet.length > MAX_SNIPPET_LENGTH) {
    return errorJson(
      "bad_snippet",
      `snippet must be at most ${MAX_SNIPPET_LENGTH} characters`,
      400,
    );
  }
  if (tags.length > MAX_TAGS) {
    return errorJson("bad_tags", `submit at most ${MAX_TAGS} tags`, 400);
  }
  if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    return errorJson(
      "bad_tags",
      `each tag must be at most ${MAX_TAG_LENGTH} characters`,
      400,
    );
  }
  return null;
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
  const capsError = textCapsError(name, snippet, tags);
  if (capsError) {
    return capsError;
  }
  if (examples.length < 1 || examples.length > 3) {
    return errorJson("bad_examples", "submit 1 to 3 example images", 400);
  }
  if (refs.length > MAX_REFS) {
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

  let style: StyleRow;
  try {
    style = await createStyle(c.env.DB, {
      slug,
      name,
      owner_user_id: c.var.user.id,
      kind,
      category,
      status: "pending",
      snippet,
      forked_from: forkedFrom?.id ?? null,
    });
  } catch (error) {
    // The slug pre-check above is racy against the UNIQUE constraint; if the
    // insert loses, don't strand the objects uploaded a moment ago (skipping
    // any key another style's rows still reference).
    await deleteUnreferencedObjects(
      c.env,
      images.map((image) => image.r2_key),
    );
    if (error instanceof Error && /UNIQUE/i.test(error.message)) {
      return errorJson("slug_taken", "slug is already taken", 400);
    }
    throw error;
  }
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
  // Absent means unchanged: the web edit form can't re-attach binary refs the
  // user never re-uploaded, so an edit that omits tag/ref[] must not wipe the
  // live tags/refs when it is approved.
  const tagsProvided = hasField(body, "tag");
  if (!edit.name) {
    return errorJson("bad_name", "name is required", 400);
  }
  if (!CATEGORY_KEYS.has(edit.category)) {
    return errorJson("bad_category", "unknown category", 400);
  }
  if (edit.refs.length > MAX_REFS) {
    return errorJson("bad_refs", "submit at most 4 reference images", 400);
  }
  const capsError = textCapsError(
    edit.name,
    edit.snippet,
    tagsProvided ? edit.tags : [],
  );
  if (capsError) {
    return capsError;
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
    // null = "keep the live refs" for the admin approve step.
    let stagedIds: number[] | null = null;
    if (refs.length > 0) {
      stagedIds = [];
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
    }
    // Insert the new staged rows BEFORE deleting the superseded ones: R2 keys
    // are content-addressed, so re-uploading identical bytes reuses the key
    // and the surviving new row must keep the object alive.
    await deleteImageRowsAndObjects(c.env, oldPending);
    const updated = await setPendingRevision(
      c.env.DB,
      style.id,
      JSON.stringify({
        name: edit.name,
        snippet: edit.snippet,
        category: edit.category,
        tags: tagsProvided ? edit.tags : null,
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
    // Snapshot the refs to replace BEFORE inserting the new ones, so a
    // re-upload of identical bytes (same r2_key) isn't swept up in the delete.
    const oldRefs =
      refs.length > 0
        ? await getImagesForStyle(c.env.DB, style.id, { role: "reference" })
        : [];
    const updated = await updateStyleFields(c.env.DB, style.id, {
      name: edit.name,
      snippet: edit.snippet,
      category: edit.category,
      status: "pending",
      pending_revision: null,
      review_note: null,
    });
    if (tagsProvided) {
      await replaceTags(c.env.DB, style.id, edit.tags);
    }
    if (refs.length > 0) {
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
      // Replace, don't append: keeps the TOTAL ref count within MAX_REFS no
      // matter how many times the submission is edited and resubmitted.
      await deleteImageRowsAndObjects(c.env, oldRefs);
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
