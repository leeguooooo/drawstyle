import { categoryLabel, CATEGORIES } from "../api/styles-read";
import {
  getImagesForStyle,
  listApprovedStyles,
  type ListApprovedStylesOptions,
  type StyleRow,
  type UserRow,
} from "../db";
import { t, type Locale } from "../i18n";
import { escapeHtml, page } from "./layout";

function imageUrl(origin: string, key: string): string {
  return `${origin}/img/${encodeURIComponent(key)}`;
}

export async function galleryPage(
  db: D1Database,
  origin: string,
  locale: Locale,
  user?: UserRow,
  options: ListApprovedStylesOptions = {},
): Promise<string> {
  const d = t(locale);
  const styles = await listApprovedStyles(db, options);
  const cards = await Promise.all(
    styles.map((style) => styleCard(db, origin, locale, style)),
  );
  const cats = CATEGORIES.map(
    (cat) =>
      `<a class="badge" href="/${locale}/?category=${escapeHtml(cat.key)}">${escapeHtml(categoryLabel(cat.key, locale))}</a>`,
  ).join(" ");
  return page({
    locale,
    path: `/${locale}/`,
    title: d.galleryTitle,
    description: d.galleryDesc,
    body: `<p class="eyebrow"><span class="dot"></span>${escapeHtml(d.brand)}</p><h1>${escapeHtml(d.galleryHeading)}</h1><p class="muted">${cats}</p><section class="grid">${cards.join("")}</section>`,
    user,
  });
}

async function styleCard(
  db: D1Database,
  origin: string,
  locale: Locale,
  style: StyleRow,
): Promise<string> {
  // Cover = first example if any, else the first available (reference) image —
  // a style with only reference images (e.g. a pinned character) still gets a
  // card cover, matching the detail-page hero selection.
  const images = await getImagesForStyle(db, style.id, { pending: 0 });
  const cover = images.find((image) => image.role === "example") ?? images[0];
  return `<article class="card">
    ${cover ? `<img class="card-img" src="${imageUrl(origin, cover.r2_key)}" alt="">` : ""}
    <h2><a href="/${locale}/s/${escapeHtml(style.slug)}">${escapeHtml(style.name)}</a></h2>
    <p><span class="badge">${escapeHtml(style.kind)}</span> <span class="badge">${escapeHtml(categoryLabel(style.category, locale))}</span></p>
    <p class="muted">♥${style.likes_count} · ⇩${style.pulls_count}</p>
    <pre>chatgpt-imagegen style pull ${escapeHtml(style.slug)}</pre>
  </article>`;
}
