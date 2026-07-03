import { CATEGORIES } from "../api/styles-read";
import { getApprovedStyleBySlug, getStyleBySlug, type UserRow } from "../db";
import { escapeHtml, page } from "./layout";

export async function submitPage(
  db: D1Database,
  params: { fork?: string; edit?: string },
  user: UserRow,
): Promise<string> {
  const fork = params.fork ? await getApprovedStyleBySlug(db, params.fork) : null;
  const edit = params.edit ? await getStyleBySlug(db, params.edit) : null;
  const source = edit && edit.owner_user_id === user.id ? edit : fork;
  const action = edit && edit.owner_user_id === user.id ? `/api/styles/${edit.slug}` : "/api/styles";
  const method = edit && edit.owner_user_id === user.id ? "PUT" : "POST";
  const category = source?.category ?? "report";
  return page(
    "投稿",
    `<h1>${edit ? "编辑风格" : "投稿风格"}</h1>
    <form action="${action}" method="post" enctype="multipart/form-data" data-fetch="1" data-method="${method}" data-done="/me">
      ${fork ? `<input type="hidden" name="forked_from_slug" value="${escapeHtml(fork.slug)}">` : ""}
      <label>Slug</label><input name="slug" value="${edit ? escapeHtml(edit.slug) : ""}" ${edit ? "disabled" : "required"}>
      <label>Name</label><input name="name" value="${escapeHtml(source?.name ?? "")}" required>
      <label>Kind</label><select name="kind" ${edit ? "disabled" : ""}><option value="style">style</option><option value="character">character</option></select>
      <label>Category</label><select name="category">${CATEGORIES.map((cat) => `<option value="${cat.key}" ${cat.key === category ? "selected" : ""}>${escapeHtml(cat.label_zh)}</option>`).join("")}</select>
      <label>Tags</label><input name="tag" placeholder="watercolor">
      <label>Snippet</label><textarea name="snippet">${escapeHtml(source?.snippet ?? "")}</textarea>
      ${edit ? "" : `<label>Examples</label><input name="example[]" type="file" multiple required>`}
      <label>References</label><input name="ref[]" type="file" multiple>
      <p><button>提交</button></p>
    </form>`,
    user,
  );
}
