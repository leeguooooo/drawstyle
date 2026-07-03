import { listPendingReviewStyles, type UserRow } from "../db";
import { t, type Locale } from "../i18n";
import { escapeHtml, page } from "./layout";

export async function adminPage(
  db: D1Database,
  locale: Locale,
  user: UserRow,
): Promise<string> {
  const d = t(locale);
  const items = await listPendingReviewStyles(db);
  return page({
    locale,
    path: `/${locale}/admin`,
    title: d.adminTitle,
    description: d.adminDesc,
    user,
    body: `<h1>${escapeHtml(d.adminHeading)}</h1>
    <section class="grid">${items.map((style) => `<article class="card">
      <h2>${escapeHtml(style.name)}</h2>
      <p><span class="badge">${style.pending_revision ? escapeHtml(d.badgeRevision) : escapeHtml(d.badgeNew)}</span> <span class="badge">${escapeHtml(style.status)}</span></p>
      <form action="/api/admin/styles/${style.id}/approve" data-fetch="1" data-done="/${locale}/admin"><button>${escapeHtml(d.adminApprove)}</button></form>
      <form action="/api/admin/styles/${style.id}/reject" data-fetch="1" data-done="/${locale}/admin"><label>${escapeHtml(d.adminNote)}</label><input name="review_note"><button class="danger">${escapeHtml(d.adminReject)}</button></form>
    </article>`).join("")}</section>`,
  });
}
