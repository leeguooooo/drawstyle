import { CATEGORIES } from "../api/styles-read";
import {
  getImagesForStyle,
  listApprovedStyles,
  type StyleRow,
  type UserRow,
} from "../db";
import { escapeHtml, page } from "./layout";

function imageUrl(origin: string, key: string): string {
  return `${origin}/img/${encodeURIComponent(key)}`;
}

export async function galleryPage(db: D1Database, origin: string, user?: UserRow): Promise<string> {
  const styles = await listApprovedStyles(db);
  const cards = await Promise.all(styles.map((style) => styleCard(db, origin, style)));
  const cats = CATEGORIES.map(
    (cat) => `<a class="badge" href="/?category=${escapeHtml(cat.key)}">${escapeHtml(cat.label_zh)}</a>`,
  ).join(" ");
  return page(
    "画廊",
    `<h1>风格画廊</h1><p class="muted">${cats}</p><section class="grid">${cards.join("")}</section>`,
    user,
  );
}

async function styleCard(db: D1Database, origin: string, style: StyleRow): Promise<string> {
  const [image] = await getImagesForStyle(db, style.id, { role: "example", pending: 0 });
  return `<article class="card">
    ${image ? `<img src="${imageUrl(origin, image.r2_key)}" alt="">` : ""}
    <h2><a href="/s/${escapeHtml(style.slug)}">${escapeHtml(style.name)}</a></h2>
    <p><span class="badge">${escapeHtml(style.kind)}</span> <span class="badge">${escapeHtml(style.category)}</span></p>
    <p class="muted">♥${style.likes_count} · ⇩${style.pulls_count}</p>
    <pre>chatgpt-imagegen style pull ${escapeHtml(style.slug)}</pre>
  </article>`;
}
