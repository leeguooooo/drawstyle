import { getApprovedStyleBySlug, listPlayerUploadsByStyle, type UserRow } from "../db";
import { t, type Locale } from "../i18n";
import { escapeHtml, page } from "./layout";

export async function generationsPage(
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
  const uploads = await listPlayerUploadsByStyle(db, slug);
  const detailPath = `/${locale}/s/${escapeHtml(slug)}`;

  const imgs = uploads.length
    ? uploads
        .map(
          (u) =>
            `<img class="zoomable" loading="lazy" src="${origin}/img/${encodeURIComponent(u.r2_key)}" alt="">`,
        )
        .join("")
    : `<p class="muted">${escapeHtml(d.generationsEmpty)}</p>`;

  const countInfo = uploads.length > 0
    ? `<p class="muted">${escapeHtml(d.generationsCount(uploads.length))}</p>`
    : "";

  return page({
    locale,
    path: `/${locale}/s/${slug}/generations`,
    title: `${style.name} - ${d.generationsTitle}`,
    description: d.generationsDesc(style.name),
    body: `<p class="eyebrow"><a class="badge" href="${detailPath}">← ${escapeHtml(style.name)}</a></p>
    <h1>${escapeHtml(d.generationsHeading)}</h1>
    ${countInfo}
    <section class="grid">${imgs}</section>`,
    user,
  });
}