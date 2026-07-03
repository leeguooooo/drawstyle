import { categoryLabel, CATEGORIES } from "../api/styles-read";
import {
  getApprovedStyleBySlug,
  getStyleBySlug,
  getTagsForStyle,
  type UserRow,
} from "../db";
import { t, type Locale } from "../i18n";
import { escapeHtml, page } from "./layout";

// Shown to anonymous visitors instead of a hard redirect to a bare login page.
// The login button carries return_to so they land back here after signing in.
export function submitSignInGate(locale: Locale): string {
  const d = t(locale);
  const loginHref = `/auth/login?return_to=${encodeURIComponent(`/${locale}/submit`)}`;
  return page({
    locale,
    path: `/${locale}/submit`,
    title: d.submitTitle,
    description: d.submitDesc,
    body: `<section class="card signin-gate">
      <h1>${escapeHtml(d.submitSignInTitle)}</h1>
      <p class="muted">${escapeHtml(d.submitSignInBody)}</p>
      <p><a class="button" href="${loginHref}">${escapeHtml(d.submitSignInButton)}</a></p>
    </section>`,
  });
}

export async function submitPage(
  db: D1Database,
  locale: Locale,
  params: { fork?: string; edit?: string },
  user: UserRow,
): Promise<string> {
  const d = t(locale);
  const fork = params.fork ? await getApprovedStyleBySlug(db, params.fork) : null;
  const edit = params.edit ? await getStyleBySlug(db, params.edit) : null;
  const source = edit && edit.owner_user_id === user.id ? edit : fork;
  const isEdit = Boolean(edit && edit.owner_user_id === user.id);
  const action = isEdit ? `/api/styles/${edit!.slug}` : "/api/styles";
  const method = isEdit ? "PUT" : "POST";
  const category = source?.category ?? "report";
  // Prefill existing tags so a snippet-only edit re-submits them unchanged
  // (the API additionally treats an absent tag field as "unchanged").
  const tags = source ? await getTagsForStyle(db, source.id) : [];
  // Hand-drawn dropzone wrapping a real <input type=file> (kept in the DOM so
  // FormData still reads it). layout.ts progressively enhances [data-dropzone]
  // into a drag area with thumbnail previews; with JS off the raw input works.
  // A `required` attr on a visually-hidden file input silently blocks submit
  // (Chrome can't focus the validation bubble). So mark the zone required and
  // let the client validate it with a visible message; the server also enforces
  // ≥1 example, so JS-off users still get a real error.
  const dropzone = (name: string, hint: string, required: boolean) =>
    `<div class="dropzone" data-dropzone data-remove="${escapeHtml(d.dropzoneRemove)}"${required ? ` data-required data-required-msg="${escapeHtml(d.dropzoneRequired)}"` : ""}>
      <input name="${name}" type="file" accept="image/png,image/jpeg,image/webp" multiple${required ? " required" : ""}>
      <div class="dropzone__prompt">
        <span class="dropzone__pick">${escapeHtml(d.dropzonePrompt)}</span>
        <span class="dropzone__hint muted">${escapeHtml(hint)}</span>
      </div>
      <div class="dropzone__previews" hidden></div>
    </div>`;
  return page({
    locale,
    path: `/${locale}/submit`,
    title: d.submitTitle,
    description: d.submitDesc,
    user,
    body: `<h1>${escapeHtml(isEdit ? d.submitHeadingEdit : d.submitHeadingNew)}</h1>
    <form action="${action}" method="post" enctype="multipart/form-data" data-fetch="1" data-method="${method}" data-done="/${locale}/me">
      ${fork ? `<input type="hidden" name="forked_from_slug" value="${escapeHtml(fork.slug)}">` : ""}
      <label>${escapeHtml(d.fieldSlug)}</label><input name="slug" value="${isEdit ? escapeHtml(edit!.slug) : ""}" ${isEdit ? "disabled" : "required"}>
      <label>${escapeHtml(d.fieldName)}</label><input name="name" value="${escapeHtml(source?.name ?? "")}" required>
      <label>${escapeHtml(d.fieldKind)}</label><select name="kind" ${isEdit ? "disabled" : ""}><option value="style">style</option><option value="character">character</option></select>
      <label>${escapeHtml(d.fieldCategory)}</label><select name="category">${CATEGORIES.map((cat) => `<option value="${cat.key}" ${cat.key === category ? "selected" : ""}>${escapeHtml(categoryLabel(cat.key, locale))}</option>`).join("")}</select>
      <label>${escapeHtml(d.fieldTags)}</label><input name="tag" value="${escapeHtml(tags.join(" "))}" placeholder="watercolor">
      <label>${escapeHtml(d.fieldSnippet)}</label><textarea name="snippet">${escapeHtml(source?.snippet ?? "")}</textarea>
      ${isEdit ? "" : `<label>${escapeHtml(d.fieldExamples)}</label>${dropzone("example[]", d.dropzoneExamplesHint, true)}`}
      <label>${escapeHtml(d.fieldReferences)}</label>${dropzone("ref[]", d.dropzoneRefsHint, false)}
      ${isEdit ? `<p class="muted">${escapeHtml(d.refsKeepHint)}</p>` : ""}
      <p><button>${escapeHtml(d.submitButton)}</button></p>
    </form>`,
  });
}
