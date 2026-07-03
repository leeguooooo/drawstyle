import { categoryLabel, CATEGORIES } from "../api/styles-read";
import {
  getApprovedStyleBySlug,
  getStyleBySlug,
  getTagsForStyle,
  type UserRow,
} from "../db";
import { t, type Locale } from "../i18n";
import { escapeHtml, page } from "./layout";

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
      ${isEdit ? "" : `<label>${escapeHtml(d.fieldExamples)}</label><input name="example[]" type="file" multiple required>`}
      <label>${escapeHtml(d.fieldReferences)}</label><input name="ref[]" type="file" multiple>
      ${isEdit ? `<p class="muted">${escapeHtml(d.refsKeepHint)}</p>` : ""}
      <p><button>${escapeHtml(d.submitButton)}</button></p>
    </form>`,
  });
}
