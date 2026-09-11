import { Hono, type Context } from "hono";
import { requireAdmin, type AuthVariables } from "../auth";
import {
  addImage,
  approveNewStyle,
  approveStyleRevision,
  delistStyle,
  deletePlayerUploadById,
  getImagesForStyle,
  getPlayerUploadById,
  getStyleById,
  getStyleBySlug,
  listPendingReviewStyles,
  rejectNewStyle,
  rejectStyleRevision,
  replaceTags,
  setImagesPending,
} from "../db";
import {
  ImageValidationError,
  deleteImageRowsAndObjects,
  deleteUnreferencedObjects,
  putImage,
} from "../images";

export const adminRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

function errorJson(code: string, message: string, status: 400 | 403 | 404): Response {
  return Response.json({ error: { code, message } }, { status });
}

async function parseBody(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
): Promise<Record<string, unknown>> {
  const contentType = c.req.header("Content-Type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return (await c.req.parseBody({ all: true })) as Record<string, unknown>;
  }
  if (contentType.includes("application/json")) {
    return (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  }
  return {};
}

function noteFrom(body: Record<string, unknown>): string {
  return typeof body.review_note === "string" ? body.review_note.trim() : "";
}

function fileFrom(body: Record<string, unknown>, key: string): File | null {
  const value = body[key];
  if (Array.isArray(value)) {
    const first = value.find((item) => item instanceof File && item.size > 0);
    return first instanceof File ? first : null;
  }
  return value instanceof File && value.size > 0 ? value : null;
}

// tags / ref_image_ids may be null: revisions produced by an edit that never
// touched those fields store null, meaning "leave the live value unchanged".
// Returns null (never throws) on a corrupt blob so one bad row can't 500 the
// whole review queue.
function parseRevision(raw: string | null): {
  name: string;
  snippet: string;
  category: string;
  tags: string[] | null;
  ref_image_ids: number[] | null;
} | null {
  if (!raw) {
    return null;
  }
  let parsed: {
    name?: unknown;
    snippet?: unknown;
    category?: unknown;
    tags?: unknown;
    ref_image_ids?: unknown;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  return {
    name: typeof parsed.name === "string" ? parsed.name : "",
    snippet: typeof parsed.snippet === "string" ? parsed.snippet : "",
    category: typeof parsed.category === "string" ? parsed.category : "",
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((tag): tag is string => typeof tag === "string")
      : null,
    ref_image_ids: Array.isArray(parsed.ref_image_ids)
      ? parsed.ref_image_ids.filter(
          (id): id is number => Number.isSafeInteger(id) && id > 0,
        )
      : null,
  };
}

// :id params come off the URL as strings; production D1 rejects NaN binds
// with a 500, so validate here and let callers return a clean 404.
function styleIdParam(c: Context<{ Bindings: Env; Variables: AuthVariables }>):
  | number
  | null {
  const id = Number(c.req.param("id"));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

adminRoutes.use("/admin/*", requireAdmin);

adminRoutes.get("/admin/pending", async (c) => {
  const styles = await listPendingReviewStyles(c.env.DB);
  return c.json({
    items: styles.map((style) => ({
      id: style.id,
      slug: style.slug,
      name: style.name,
      status: style.status,
      type: style.pending_revision ? "revision" : "new",
      pending_revision: style.pending_revision
        ? parseRevision(style.pending_revision)
        : null,
    })),
  });
});

adminRoutes.post("/admin/styles/:id/approve", async (c) => {
  const id = styleIdParam(c);
  const style = id === null ? null : await getStyleById(c.env.DB, id);
  if (!style) {
    return errorJson("not_found", "style not found", 404);
  }
  if (style.pending_revision) {
    const revision = parseRevision(style.pending_revision);
    if (!revision) {
      return errorJson("bad_revision", "pending revision is invalid", 400);
    }
    // null ref_image_ids = the edit never supplied refs; keep the live ones.
    if (revision.ref_image_ids) {
      const oldRefs = await getImagesForStyle(c.env.DB, style.id, {
        role: "reference",
        pending: 0,
      });
      // Promote staged rows BEFORE deleting the old ones: if a staged ref
      // shares its content-addressed key with an old ref, the surviving row
      // keeps the R2 object alive.
      await setImagesPending(c.env.DB, revision.ref_image_ids, 0);
      await deleteImageRowsAndObjects(c.env, oldRefs);
    }
    // null tags = the edit never supplied tags; keep the live ones.
    if (revision.tags) {
      await replaceTags(c.env.DB, style.id, revision.tags);
    }
    const updated = await approveStyleRevision(c.env.DB, style.id, revision);
    return c.json({ style: { id: updated.id, status: updated.status, version: updated.version } });
  }
  if (style.status !== "pending") {
    return errorJson("not_pending", "style is not pending review", 400);
  }
  const updated = await approveNewStyle(c.env.DB, style.id);
  return c.json({ style: { id: updated.id, status: updated.status, version: updated.version } });
});

adminRoutes.post("/admin/styles/:id/reject", async (c) => {
  const id = styleIdParam(c);
  const style = id === null ? null : await getStyleById(c.env.DB, id);
  if (!style) {
    return errorJson("not_found", "style not found", 404);
  }
  const body = await parseBody(c);
  const note = noteFrom(body);
  if (style.pending_revision) {
    const staged = await getImagesForStyle(c.env.DB, style.id, {
      role: "reference",
      pending: 1,
    });
    await deleteImageRowsAndObjects(c.env, staged);
    const updated = await rejectStyleRevision(c.env.DB, style.id, note);
    return c.json({ style: { id: updated.id, status: updated.status, version: updated.version } });
  }
  if (style.status !== "pending") {
    return errorJson("not_pending", "style is not pending review", 400);
  }
  const updated = await rejectNewStyle(c.env.DB, style.id, note);
  return c.json({ style: { id: updated.id, status: updated.status, version: updated.version } });
});

adminRoutes.post("/admin/styles/:id/delist", async (c) => {
  const id = styleIdParam(c);
  const style = id === null ? null : await getStyleById(c.env.DB, id);
  if (!style) {
    return errorJson("not_found", "style not found", 404);
  }
  const updated = await delistStyle(c.env.DB, style.id);
  return c.json({ style: { id: updated.id, status: updated.status, version: updated.version } });
});

adminRoutes.post("/admin/styles/:id/official-example", async (c) => {
  const id = styleIdParam(c);
  const style = id === null ? null : await getStyleById(c.env.DB, id);
  if (!style || style.status !== "approved") {
    return errorJson("not_found", "style not found", 404);
  }
  const body = await parseBody(c);
  const file = fileFrom(body, "file");
  if (!file) {
    return errorJson("bad_image", "file is required", 400);
  }
  try {
    const stored = await putImage(c.env.ASSETS, await file.arrayBuffer());
    const row = await addImage(c.env.DB, {
      style_id: style.id,
      r2_key: stored.r2_key,
      role: "official_example",
      content_type: stored.content_type,
    });
    return c.json({ image: { id: row.id, role: row.role, url: `/img/${row.r2_key}` } });
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return errorJson("bad_image", error.message, 400);
    }
    throw error;
  }
});

// Admin: hard-delete a player upload (DB row + R2 object if unreferenced).
adminRoutes.delete("/admin/uploads/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id < 1) {
    return errorJson("not_found", "upload not found", 404);
  }
  const upload = await getPlayerUploadById(c.env.DB, id);
  if (!upload) {
    return errorJson("not_found", "upload not found", 404);
  }
  // Delete row first
  await deletePlayerUploadById(c.env.DB, id);
  // Then drop the R2 object if no surviving row references it
  await deleteUnreferencedObjects(c.env, [upload.r2_key]);
  return c.json({ ok: true });
});

// Admin: promote a player upload to the style's official example (reuses the
// existing R2 object — no re-upload needed). The resulting official_example
// row is attached to the upload's style_slug style and can serve as cover.
adminRoutes.post("/admin/uploads/:id/promote", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id < 1) {
    return errorJson("not_found", "upload not found", 404);
  }
  const upload = await getPlayerUploadById(c.env.DB, id);
  if (!upload) {
    return errorJson("not_found", "upload not found", 404);
  }
  if (!upload.style_slug) {
    return errorJson("no_style", "upload has no associated style", 400);
  }
  const style = await getStyleBySlug(c.env.DB, upload.style_slug);
  if (!style || style.status !== "approved") {
    return errorJson("bad_style", "style not found or not approved", 404);
  }
  const row = await addImage(c.env.DB, {
    style_id: style.id,
    r2_key: upload.r2_key,
    role: "official_example",
    content_type: upload.content_type,
  });
  return c.json({ image: { id: row.id, role: row.role, url: `/img/${encodeURIComponent(row.r2_key)}` } });
});
