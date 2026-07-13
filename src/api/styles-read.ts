import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  getApprovedStyleBySlug,
  getImagesForStyle,
  getTagsForStyle,
  incrementPullsCount,
  listApprovedStyles,
  listCuratedTags,
  type ImageRow,
  type StyleRow,
} from "../db";
import { isAnimatedR2Key } from "../images";

export const CATEGORIES = [
  { key: "report", label_zh: "领导汇报", label_en: "Executive Report" },
  { key: "slides", label_zh: "专业PPT", label_en: "Professional Slides" },
  { key: "tech-explainer", label_zh: "技术图解", label_en: "Tech Explainer" },
  { key: "social-cover", label_zh: "社交媒体封面", label_en: "Social Cover" },
  { key: "avatar-ip", label_zh: "头像/IP形象", label_en: "Avatar / IP" },
  { key: "cute", label_zh: "可爱治愈", label_en: "Cute & Cozy" },
  { key: "retro-comic", label_zh: "复古漫画", label_en: "Retro Comic" },
  { key: "photo-real", label_zh: "写实摄影", label_en: "Photorealistic" },
] as const;

export function categoryLabel(key: string, locale: "zh" | "en"): string {
  const cat = CATEGORIES.find((c) => c.key === key);
  if (!cat) {
    return key;
  }
  return locale === "en" ? cat.label_en : cat.label_zh;
}

const VALID_SORTS = new Set(["likes", "new", "pulls"]);

export const stylesReadRoutes = new Hono<{ Bindings: Env }>();

function errorJson(
  code: string,
  message: string,
  status: ContentfulStatusCode,
): Response {
  return Response.json({ error: { code, message } }, { status });
}

function parsePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function sortParam(value: string | undefined): "likes" | "new" | "pulls" {
  return VALID_SORTS.has(value ?? "") ? (value as "likes" | "new" | "pulls") : "new";
}

function imageUrl(origin: string, image: ImageRow): string {
  return `${origin}/img/${encodeURIComponent(image.r2_key)}`;
}

function listItem(style: StyleRow): Record<string, unknown> {
  return {
    slug: style.slug,
    name: style.name,
    kind: style.kind,
    snippet: style.snippet,
    category: style.category,
    version: style.version,
    likes_count: style.likes_count,
    pulls_count: style.pulls_count,
    created_at: style.created_at,
    updated_at: style.updated_at,
  };
}

async function detailPayload(
  db: D1Database,
  origin: string,
  style: StyleRow,
): Promise<Record<string, unknown>> {
  const [tags, images] = await Promise.all([
    getTagsForStyle(db, style.id),
    getImagesForStyle(db, style.id, { pending: 0 }),
  ]);
  return {
    ...listItem(style),
    tags,
    images: images.map((image) => ({
      role: image.role,
      url: imageUrl(origin, image),
      content_type: image.content_type,
      animated: isAnimatedR2Key(image.r2_key),
      sort: image.sort,
    })),
  };
}

stylesReadRoutes.get("/styles", async (c) => {
  const sort = sortParam(c.req.query("sort"));
  const styles = await listApprovedStyles(c.env.DB, {
    q: c.req.query("q"),
    category: c.req.query("category"),
    tags: c.req.queries("tag") ?? [],
    sort,
    page: parsePage(c.req.query("page")),
  });
  return c.json({
    styles: styles.map(listItem),
    page: parsePage(c.req.query("page")),
    page_size: 20,
    sort,
  });
});

stylesReadRoutes.get("/styles/:slug/package", async (c) => {
  const style = await getApprovedStyleBySlug(c.env.DB, c.req.param("slug"));
  if (!style) {
    return errorJson("not_found", "style not found", 404);
  }
  const refs = await getImagesForStyle(c.env.DB, style.id, {
    role: "reference",
    pending: 0,
  });
  await incrementPullsCount(c.env.DB, style.id);
  const origin = new URL(c.req.url).origin;
  return c.json({
    slug: style.slug,
    name: style.name,
    kind: style.kind,
    snippet: style.snippet,
    version: style.version,
    refs: refs.map((ref) => ({
      url: imageUrl(origin, ref),
      content_type: ref.content_type,
    })),
  });
});

stylesReadRoutes.get("/styles/:slug", async (c) => {
  const style = await getApprovedStyleBySlug(c.env.DB, c.req.param("slug"));
  if (!style) {
    return errorJson("not_found", "style not found", 404);
  }
  return c.json(await detailPayload(c.env.DB, new URL(c.req.url).origin, style));
});

stylesReadRoutes.get("/meta", async (c) => {
  return c.json({
    categories: CATEGORIES,
    tags: await listCuratedTags(c.env.DB),
  });
});
