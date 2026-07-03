import { categoryLabel } from "../api/styles-read";
import {
  getApprovedStyleBySlug,
  getImagesForStyle,
  getTagsForStyle,
  getUserById,
  type UserRow,
} from "../db";
import { t, type Locale } from "../i18n";
import { SITE_URL, styleLdNode } from "./head";
import { escapeHtml, page } from "./layout";

function absImage(r2Key: string): string {
  return `${SITE_URL}/img/${encodeURIComponent(r2Key)}`;
}

export async function detailPage(
  db: D1Database,
  origin: string,
  locale: Locale,
  slug: string,
  user?: UserRow,
): Promise<string | null> {
  const style = await getApprovedStyleBySlug(db, slug);
  if (!style) {
    return null;
  }
  const d = t(locale);
  const [images, tags, owner] = await Promise.all([
    getImagesForStyle(db, style.id, { pending: 0 }),
    getTagsForStyle(db, style.id),
    getUserById(db, style.owner_user_id),
  ]);
  const imgs = images
    .map((image) => `<img src="${origin}/img/${encodeURIComponent(image.r2_key)}" alt="${escapeHtml(image.role)}">`)
    .join("");
  const firstExample =
    images.find((image) => image.role === "example") ?? images[0];
  const ogImage = firstExample ? absImage(firstExample.r2_key) : undefined;
  const canonicalPath = `/${locale}/s/${style.slug}`;
  const ownerTools = user?.id === style.owner_user_id
    ? `<p><a class="button secondary" href="/${locale}/submit?edit=${escapeHtml(style.slug)}">${escapeHtml(d.edit)}</a></p>`
    : "";
  const jsonLd = [
    styleLdNode({
      name: style.name,
      snippet: style.snippet,
      authorName: owner?.display_name ?? "drawstyle",
      createdAt: style.created_at,
      updatedAt: style.updated_at,
      canonicalPath,
      contentUrl: ogImage,
    }),
  ];
  return page({
    locale,
    path: canonicalPath,
    title: style.name,
    description: d.detailDesc(style.name),
    ogImage,
    jsonLd,
    user,
    body: `<h1>${escapeHtml(style.name)}</h1>
    <p><span class="badge">${escapeHtml(style.kind)}</span> <span class="badge">${escapeHtml(categoryLabel(style.category, locale))}</span> ${tags.map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join(" ")}</p>
    <div class="grid">${imgs}</div>
    <h2>${escapeHtml(d.snippetHeading)}</h2><pre>${escapeHtml(style.snippet)}</pre>
    <h2>${escapeHtml(d.cliHeading)}</h2><pre>chatgpt-imagegen style pull ${escapeHtml(style.slug)}</pre>
    <p>
      <button data-action="/api/styles/${escapeHtml(style.slug)}/like">${escapeHtml(d.like)}</button>
      <a class="button secondary" href="/${locale}/submit?fork=${escapeHtml(style.slug)}">${escapeHtml(d.fork)}</a>
    </p>
    <p class="muted">${escapeHtml(d.versionLabel(style.version))} · ♥${style.likes_count} · ⇩${style.pulls_count}</p>
    ${ownerTools}`,
  });
}
