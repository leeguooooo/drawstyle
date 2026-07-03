import { listLikedStyles, listStylesByOwner, type UserRow } from "../db";
import { escapeHtml, page } from "./layout";

export async function mePage(db: D1Database, user: UserRow): Promise<string> {
  const [mine, liked] = await Promise.all([
    listStylesByOwner(db, user.id),
    listLikedStyles(db, user.id),
  ]);
  return page(
    "我的",
    `<h1>我的风格</h1>
    <section class="grid">${mine.map((style) => `<article class="card"><h2>${escapeHtml(style.name)}</h2><p><span class="badge">${escapeHtml(style.status)}</span></p><p class="muted">${escapeHtml(style.slug)}</p></article>`).join("")}</section>
    <h1>我的喜欢</h1>
    <section class="grid">${liked.map((style) => `<article class="card"><h2><a href="/s/${escapeHtml(style.slug)}">${escapeHtml(style.name)}</a></h2><p class="muted">${escapeHtml(style.slug)}</p></article>`).join("")}</section>`,
    user,
  );
}
