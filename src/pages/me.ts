import { listLikedStyles, listStylesByOwner, type UserRow } from "../db";
import { t, type Locale } from "../i18n";
import { escapeHtml, page } from "./layout";

export async function mePage(
  db: D1Database,
  locale: Locale,
  user: UserRow,
): Promise<string> {
  const d = t(locale);
  const [mine, liked] = await Promise.all([
    listStylesByOwner(db, user.id),
    listLikedStyles(db, user.id),
  ]);
  return page({
    locale,
    path: `/${locale}/me`,
    title: d.meTitle,
    description: d.meDesc,
    user,
    body: `<h1>${escapeHtml(d.meHeadingMine)}</h1>
    <section class="grid">${mine.map((style) => `<article class="card"><h2>${escapeHtml(style.name)}</h2><p><span class="badge">${escapeHtml(style.status)}</span></p><p class="muted">${escapeHtml(style.slug)}</p></article>`).join("")}</section>
    <h1>${escapeHtml(d.meHeadingLiked)}</h1>
    <section class="grid">${liked.map((style) => `<article class="card"><h2><a href="/${locale}/s/${escapeHtml(style.slug)}">${escapeHtml(style.name)}</a></h2><p class="muted">${escapeHtml(style.slug)}</p></article>`).join("")}</section>`,
  });
}
