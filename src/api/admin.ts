import { Hono, type Context } from "hono";
import { requireAdmin, type AuthVariables } from "../auth";
import {
  addImage,
  approveNewStyle,
  approveStyleRevision,
  delistStyle,
  getImagesForStyle,
  getStyleById,
  listPendingReviewStyles,
  rejectNewStyle,
  rejectStyleRevision,
  replaceTags,
  setImagesPending,
} from "../db";
import {
  ImageValidationError,
  deleteImageRowsAndObjects,
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

function parseRevision(raw: string | null): {
  name: string;
  snippet: string;
  category: string;
  tags: string[];
  ref_image_ids: number[];
} | null {
  if (!raw) {
    return null;
  }
  const parsed = JSON.parse(raw) as {
    name?: unknown;
    snippet?: unknown;
    category?: unknown;
    tags?: unknown;
    ref_image_ids?: unknown;
  };
  return {
    name: typeof parsed.name === "string" ? parsed.name : "",
    snippet: typeof parsed.snippet === "string" ? parsed.snippet : "",
    category: typeof parsed.category === "string" ? parsed.category : "",
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    ref_image_ids: Array.isArray(parsed.ref_image_ids)
      ? parsed.ref_image_ids.filter(
          (id): id is number => Number.isSafeInteger(id) && id > 0,
        )
      : [],
  };
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
  const style = await getStyleById(c.env.DB, Number(c.req.param("id")));
  if (!style) {
    return errorJson("not_found", "style not found", 404);
  }
  if (style.pending_revision) {
    const revision = parseRevision(style.pending_revision);
    if (!revision) {
      return errorJson("bad_revision", "pending revision is invalid", 400);
    }
    const oldRefs = await getImagesForStyle(c.env.DB, style.id, {
      role: "reference",
      pending: 0,
    });
    // Promote staged rows BEFORE deleting the old ones: if a staged ref
    // shares its content-addressed key with an old ref, the surviving row
    // keeps the R2 object alive.
    await setImagesPending(c.env.DB, revision.ref_image_ids, 0);
    await deleteImageRowsAndObjects(c.env, oldRefs);
    await replaceTags(c.env.DB, style.id, revision.tags);
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
  const style = await getStyleById(c.env.DB, Number(c.req.param("id")));
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
  const style = await getStyleById(c.env.DB, Number(c.req.param("id")));
  if (!style) {
    return errorJson("not_found", "style not found", 404);
  }
  const updated = await delistStyle(c.env.DB, style.id);
  return c.json({ style: { id: updated.id, status: updated.status, version: updated.version } });
});

adminRoutes.post("/admin/styles/:id/official-example", async (c) => {
  const style = await getStyleById(c.env.DB, Number(c.req.param("id")));
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
