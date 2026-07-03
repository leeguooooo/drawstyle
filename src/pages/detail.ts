import {
  getApprovedStyleBySlug,
  getImagesForStyle,
  getTagsForStyle,
  type UserRow,
} from "../db";
import { escapeHtml, page } from "./layout";

export async function detailPage(
  db: D1Database,
  origin: string,
  slug: string,
  user?: UserRow,
): Promise<string | null> {
  const style = await getApprovedStyleBySlug(db, slug);
  if (!style) {
    return null;
  }
  const [images, tags] = await Promise.all([
    getImagesForStyle(db, style.id, { pending: 0 }),
    getTagsForStyle(db, style.id),
  ]);
  const imgs = images
    .map((image) => `<img src="${origin}/img/${encodeURIComponent(image.r2_key)}" alt="${escapeHtml(image.role)}">`)
    .join("");
  const ownerTools = user?.id === style.owner_user_id
    ? `<p><a class="button secondary" href="/submit?edit=${escapeHtml(style.slug)}">编辑</a></p>`
    : "";
  return page(
    style.name,
    `<h1>${escapeHtml(style.name)}</h1>
    <p>${tags.map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join(" ")}</p>
    <div class="grid">${imgs}</div>
    <h2>Snippet</h2><pre>${escapeHtml(style.snippet)}</pre>
    <h2>CLI</h2><pre>chatgpt-imagegen style pull ${escapeHtml(style.slug)}</pre>
    <p>
      <button data-action="/api/styles/${escapeHtml(style.slug)}/like">Like</button>
      <a class="button secondary" href="/submit?fork=${escapeHtml(style.slug)}">Fork</a>
    </p>
    <p class="muted">version ${style.version} · ♥${style.likes_count} · ⇩${style.pulls_count}</p>
    ${ownerTools}`,
    user,
  );
}
