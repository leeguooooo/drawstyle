import { listPendingReviewStyles, type UserRow } from "../db";
import { escapeHtml, page } from "./layout";

export async function adminPage(db: D1Database, user: UserRow): Promise<string> {
  const items = await listPendingReviewStyles(db);
  return page(
    "审核",
    `<h1>审核队列</h1>
    <section class="grid">${items.map((style) => `<article class="card">
      <h2>${escapeHtml(style.name)}</h2>
      <p><span class="badge">${style.pending_revision ? "revision" : "new"}</span> <span class="badge">${escapeHtml(style.status)}</span></p>
      <form action="/api/admin/styles/${style.id}/approve" data-fetch="1" data-done="/admin"><button>通过</button></form>
      <form action="/api/admin/styles/${style.id}/reject" data-fetch="1" data-done="/admin"><label>Note</label><input name="review_note"><button class="danger">驳回</button></form>
    </article>`).join("")}</section>`,
    user,
  );
}
