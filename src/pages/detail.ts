import { categoryLabel } from "../api/styles-read";
import {
  getApprovedStyleBySlug,
  getImagesForStyle,
  getTagsForStyle,
  getUserById,
  hasLiked,
  listComments,
  type UserRow,
} from "../db";
import { SITE_URL } from "../config";
import { t, type Locale } from "../i18n";
import { styleLdNode } from "./head";
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
  isAdmin = false,
): Promise<string | null> {
  const style = await getApprovedStyleBySlug(db, slug);
  if (!style) {
    return null;
  }
  const d = t(locale);
  const [images, tags, owner, comments] = await Promise.all([
    getImagesForStyle(db, style.id, { pending: 0 }),
    getTagsForStyle(db, style.id),
    getUserById(db, style.owner_user_id),
    listComments(db, style.id),
  ]);
  const imgs = images
    .map((image) => `<img class="zoomable" src="${origin}/img/${encodeURIComponent(image.r2_key)}" alt="${escapeHtml(image.role)}">`)
    .join("");
  const firstExample =
    images.find((image) => image.role === "example") ?? images[0];
  const ogImage = firstExample ? absImage(firstExample.r2_key) : undefined;
  const canonicalPath = `/${locale}/s/${style.slug}`;
  // Like button reflects the viewer's state and toggles: DELETE when already
  // liked, POST otherwise; anonymous viewers get a link to sign in.
  const liked = user ? await hasLiked(db, user.id, style.id) : false;
  const likeControl = !user
    ? `<a class="button" href="/auth/login?return_to=${encodeURIComponent(canonicalPath)}">${escapeHtml(d.like)}</a>`
    : liked
      ? `<button class="secondary" data-action="/api/styles/${escapeHtml(style.slug)}/like" data-method="DELETE">${escapeHtml(d.unlike)}</button>`
      : `<button data-action="/api/styles/${escapeHtml(style.slug)}/like">${escapeHtml(d.like)}</button>`;
  const ownerTools = user?.id === style.owner_user_id
    ? `<p><a class="button secondary" href="/${locale}/submit?edit=${escapeHtml(style.slug)}">${escapeHtml(d.edit)}</a></p>`
    : "";
  // Comments: list + a post form for logged-in users (sign-in link otherwise).
  // The author or an admin can delete a comment.
  const commentItems = comments.length
    ? comments
        .map((cm) => {
          const canDelete = isAdmin || (user && user.id === cm.user_id);
          const del = canDelete
            ? ` <button type="button" class="linkish" data-action="/api/comments/${cm.id}" data-method="DELETE">${escapeHtml(d.commentDelete)}</button>`
            : "";
          return `<li class="comment"><p class="comment__meta"><strong>${escapeHtml(cm.author_name)}</strong> <span class="muted">${escapeHtml(cm.created_at.slice(0, 10))}</span>${del}</p><p class="comment__body">${escapeHtml(cm.body)}</p></li>`;
        })
        .join("")
    : `<li class="muted">${escapeHtml(d.commentEmpty)}</li>`;
  const commentForm = user
    ? `<form action="/api/styles/${escapeHtml(style.slug)}/comments" method="post" data-fetch="1" data-method="POST" data-done="${canonicalPath}#comments">
        <textarea name="body" required maxlength="1000" placeholder="${escapeHtml(d.commentPlaceholder)}"></textarea>
        <p><button type="submit">${escapeHtml(d.commentSubmit)}</button></p>
      </form>`
    : `<p><a class="button" href="/auth/login?return_to=${encodeURIComponent(canonicalPath)}">${escapeHtml(d.commentSignIn)}</a></p>`;
  const commentsSection = `<h2 id="comments">${escapeHtml(d.commentsHeading)} (${comments.length})</h2>
    <ul class="comments">${commentItems}</ul>
    ${commentForm}`;
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
    <h2>${escapeHtml(d.cliHeading)}</h2>
    <p class="muted">${escapeHtml(d.cliOnlineHint)}</p>
    <div class="cmd"><pre>chatgpt-imagegen "…" --style-online ${escapeHtml(style.slug)}</pre><button type="button" class="secondary copy" data-copy='chatgpt-imagegen "…" --style-online ${escapeHtml(style.slug)}' data-copied="${escapeHtml(d.copied)}">${escapeHtml(d.copy)}</button></div>
    <p class="muted">${escapeHtml(d.cliPullHint)}</p>
    <div class="cmd"><pre>chatgpt-imagegen style pull ${escapeHtml(style.slug)}</pre><button type="button" class="secondary copy" data-copy="chatgpt-imagegen style pull ${escapeHtml(style.slug)}" data-copied="${escapeHtml(d.copied)}">${escapeHtml(d.copy)}</button></div>
    <p>
      ${likeControl}
      <a class="button secondary" href="/${locale}/submit?fork=${escapeHtml(style.slug)}">${escapeHtml(d.fork)}</a>
    </p>
    <p class="muted">${escapeHtml(d.versionLabel(style.version))} · ♥${style.likes_count} · ⇩${style.pulls_count}</p>
    ${ownerTools}
    ${commentsSection}`,
  });
}
