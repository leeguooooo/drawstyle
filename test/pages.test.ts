import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME, signSession } from "../src/auth";
import { addImage, createStyle, likeStyle } from "../src/db";
import app from "../src/index";
import { putImage } from "../src/images";
import { makeUser } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const ANIMATED_WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
  0x41, 0x4e, 0x49, 0x4d,
]);

function uniq(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

async function cookieFor(email?: string) {
  const user = await makeUser(email ? { email } : {});
  return {
    user,
    cookie: `${SESSION_COOKIE_NAME}=${await signSession(user.id, env)}`,
  };
}

async function approvedStyle(ownerId: number, overrides: { slug?: string; name?: string } = {}) {
  return createStyle(env.DB, {
    slug: overrides.slug ?? uniq("page-style"),
    name: overrides.name ?? "Page Style",
    owner_user_id: ownerId,
    kind: "style",
    category: "report",
    status: "approved",
    snippet: "page snippet",
  });
}

async function addExample(styleId: number) {
  const stored = await putImage(env.ASSETS, PNG);
  await addImage(env.DB, {
    style_id: styleId,
    r2_key: stored.r2_key,
    role: "example",
    content_type: stored.content_type,
  });
}

async function addReference(styleId: number) {
  const stored = await putImage(env.ASSETS, PNG);
  await addImage(env.DB, {
    style_id: styleId,
    r2_key: stored.r2_key,
    role: "reference",
    content_type: stored.content_type,
  });
  return stored.r2_key;
}

describe("SSR pages", () => {
  it("gallery card falls back to a reference image when no example exists", async () => {
    const owner = await makeUser();
    const style = await approvedStyle(owner.id, { name: "RefOnly Style" });
    const refKey = await addReference(style.id); // no example at all

    const res = await app.request("/zh/", {}, env);
    const html = await res.text();
    // the reference-only style still gets a card cover image
    expect(html).toContain(`class="card-img"`);
    expect(html).toContain(encodeURIComponent(refKey));
  });

  it("gallery prefers a still poster while detail marks the animation", async () => {
    const owner = await makeUser();
    const style = await approvedStyle(owner.id, { name: "Animated Style" });
    const animation = await putImage(env.ASSETS, ANIMATED_WEBP);
    await addImage(env.DB, {
      style_id: style.id,
      r2_key: animation.r2_key,
      role: "example",
      content_type: animation.content_type,
      sort: 0,
    });
    const poster = await putImage(env.ASSETS, new Uint8Array([...PNG, 7]));
    await addImage(env.DB, {
      style_id: style.id,
      r2_key: poster.r2_key,
      role: "example",
      content_type: poster.content_type,
      sort: 1,
    });

    const gallery = await (await app.request("/en/", {}, env)).text();
    const card = gallery.split('class="card"').find((part) => part.includes("Animated Style")) ?? "";
    expect(card).toContain(encodeURIComponent(poster.r2_key));
    expect(card).not.toContain(encodeURIComponent(animation.r2_key));

    const detail = await (await app.request(`/en/s/${style.slug}`, {}, env)).text();
    expect(detail).toContain(encodeURIComponent(animation.r2_key));
    expect(detail).toContain('data-animated="true"');
  });

  it("gallery card prefers the example image over a reference when both exist", async () => {
    const owner = await makeUser();
    const style = await approvedStyle(owner.id, { name: "BothImages Style" });
    const refKey = await addReference(style.id);
    // add an example AFTER the reference; example must win as the cover
    const stored = await putImage(env.ASSETS, new Uint8Array([...PNG, 2, 3]));
    await addImage(env.DB, {
      style_id: style.id,
      r2_key: stored.r2_key,
      role: "example",
      content_type: stored.content_type,
    });

    const res = await app.request("/zh/", {}, env);
    const html = await res.text();
    // find this style's card and assert its cover is the example key, not the ref
    expect(html).toContain(encodeURIComponent(stored.r2_key));
    // the card-img for THIS style should not be the reference key
    const card = html.split('class="card"').find((c) => c.includes("BothImages Style")) ?? "";
    expect(card).toContain(encodeURIComponent(stored.r2_key));
    expect(card).not.toContain(encodeURIComponent(refKey));
  });

  it("renders the gallery with approved cards, category nav, and beacon script", async () => {
    const owner = await makeUser();
    const style = await approvedStyle(owner.id, { name: "Gallery Style" });
    await addExample(style.id);

    const res = await app.request("/zh/", {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Gallery Style");
    expect(html).toContain("领导汇报"); // the seeded style's category (report) is active
    // categories with no approved styles are NOT shown as chips (no fake PPT etc.)
    expect(html).not.toContain("专业PPT");
    // the card offers a copyable one-shot online-generate command
    expect(html).toContain("--style-online");
    expect(html).toContain("data-copy=");
    expect(html).toContain("blog.leeguoo.com/scripts/visitor-beacon.js");
    expect(html).toContain(`--style-online ${style.slug}`);
  });

  it("renders style detail with snippet, pull command, and like/fork controls", async () => {
    const owner = await makeUser();
    const style = await approvedStyle(owner.id, { name: "Detail Style" });
    const { cookie } = await cookieFor();

    const res = await app.request(`/zh/s/${style.slug}`, { headers: { Cookie: cookie } }, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Detail Style");
    expect(html).toContain("page snippet");
    expect(html).toContain(`chatgpt-imagegen style pull ${style.slug}`);
    expect(html).toContain(`/api/styles/${style.slug}/like`);
    expect(html).toContain(`/zh/submit?fork=${style.slug}`);
  });

  it("like button toggles: POST when not liked, DELETE when already liked; anonymous gets a login link", async () => {
    const owner = await makeUser();
    const style = await approvedStyle(owner.id, { name: "Toggle Style" });
    const { user, cookie } = await cookieFor();

    // not liked yet → POST (default method, no data-method=DELETE)
    let html = await (await app.request(`/zh/s/${style.slug}`, { headers: { Cookie: cookie } }, env)).text();
    expect(html).toContain(`data-action="/api/styles/${style.slug}/like"`);
    expect(html).not.toContain('data-method="DELETE"');
    expect(html).toContain("喜欢");

    // after liking → the button becomes a DELETE (unlike) control
    await likeStyle(env.DB, user.id, style.id);
    html = await (await app.request(`/zh/s/${style.slug}`, { headers: { Cookie: cookie } }, env)).text();
    expect(html).toContain('data-method="DELETE"');
    expect(html).toContain("取消喜欢");

    // anonymous → a sign-in link, not a like action
    html = await (await app.request(`/zh/s/${style.slug}`, {}, env)).text();
    expect(html).not.toContain(`data-action="/api/styles/${style.slug}/like"`);
    expect(html).toContain(`/auth/login?return_to=${encodeURIComponent(`/zh/s/${style.slug}`)}`);
  });

  it("shows anonymous submit users a friendly sign-in card (not a bare redirect)", async () => {
    const res = await app.request("/zh/submit", {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("登录后即可投稿");
    // login button carries a same-site return_to back to the submit page
    expect(html).toContain(`/auth/login?return_to=${encodeURIComponent("/zh/submit")}`);
  });

  it("submit form wraps file inputs in dropzones while keeping the real inputs", async () => {
    const { cookie } = await cookieFor();
    const res = await app.request("/zh/submit", { headers: { Cookie: cookie } }, env);
    const html = await res.text();
    // real inputs preserved (FormData reads them) AND wrapped for enhancement
    expect(html).toContain('name="example[]" type="file"');
    expect(html).toContain('name="ref[]" type="file"');
    expect(html).toContain("image/gif");
    expect(html).toContain("data-dropzone");
    expect(html).toContain('class="dropzone__previews"');
    // the examples zone is client-validated required (native required on a
    // hidden input would silently block submit)
    expect(html).toContain("data-required");
    expect(html).toContain("data-required-msg");
  });

  it("renders fork submit form with hidden provenance and prefilled text fields", async () => {
    const owner = await makeUser();
    const source = await approvedStyle(owner.id, { name: "Fork Source" });
    const { cookie } = await cookieFor();

    const res = await app.request(
      `/zh/submit?fork=${source.slug}`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`name="forked_from_slug" value="${source.slug}"`);
    expect(html).toContain("Fork Source");
    expect(html).toContain("page snippet");
  });

  it("renders /me with own styles and liked styles", async () => {
    const { user, cookie } = await cookieFor();
    const mine = await createStyle(env.DB, {
      slug: uniq("mine"),
      name: "Mine Pending",
      owner_user_id: user.id,
      kind: "style",
      category: "report",
      status: "pending",
    });
    const otherOwner = await makeUser();
    const liked = await approvedStyle(otherOwner.id, { name: "Liked Style" });
    await likeStyle(env.DB, user.id, liked.id);

    const res = await app.request("/zh/me", { headers: { Cookie: cookie } }, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Mine Pending");
    expect(html).toContain(mine.slug);
    expect(html).toContain("待审核");
    expect(html).toContain("Liked Style");
  });

  it("protects /admin and renders pending review cards for admins", async () => {
    const plain = await cookieFor("plain@test.dev");
    const forbidden = await app.request("/zh/admin", { headers: { Cookie: plain.cookie } }, env);
    expect(forbidden.status).toBe(403);

    const owner = await makeUser();
    const pending = await createStyle(env.DB, {
      slug: uniq("admin-pending"),
      name: "Admin Pending",
      owner_user_id: owner.id,
      kind: "style",
      category: "report",
      status: "pending",
    });
    const admin = await cookieFor("admin@test.dev");
    const res = await app.request("/zh/admin", { headers: { Cookie: admin.cookie } }, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Admin Pending");
    expect(html).toContain(`/api/admin/styles/${pending.id}/approve`);
    expect(html).toContain(`/api/admin/styles/${pending.id}/reject`);
    // the approve/reject forms must carry method="post" — the client fetch
    // helper reads form.method (DOM-defaults to "get" without it), which would
    // otherwise fire a GET at the POST-only route and silently fail.
    expect(html).toMatch(/action="\/api\/admin\/styles\/\d+\/approve" method="post"/);
    expect(html).toMatch(/action="\/api\/admin\/styles\/\d+\/reject" method="post"/);
  });

  it("comments: post → shows on detail → author can delete; anonymous sees a sign-in link", async () => {
    const owner = await makeUser();
    const style = await approvedStyle(owner.id, { name: "Commented Style" });
    const { cookie } = await cookieFor("commenter@test.dev");
    const csrf = { Cookie: cookie, "X-Requested-With": "drawstyle" };

    // empty comment rejected
    const empty = await app.request(`/api/styles/${style.slug}/comments`,
      { method: "POST", headers: csrf, body: new URLSearchParams({ body: "  " }) }, env);
    expect(empty.status).toBe(400);

    // post a real comment
    const post = await app.request(`/api/styles/${style.slug}/comments`,
      { method: "POST", headers: csrf, body: new URLSearchParams({ body: "love this style!" }) }, env);
    expect(post.status).toBe(200);

    // it renders on the detail page with a delete control for the author
    let html = await (await app.request(`/zh/s/${style.slug}`, { headers: { Cookie: cookie } }, env)).text();
    expect(html).toContain("love this style!");
    expect(html).toContain("评论 (1)");
    expect(html).toMatch(/data-action="\/api\/comments\/\d+" data-method="DELETE"/);
    // the post form must use data-fetch="1" (bare data-fetch is falsy → the
    // client handler skips it → native POST without the CSRF header fails)
    expect(html).toContain('data-fetch="1"');

    // anonymous sees the comment but a sign-in link instead of a post form
    html = await (await app.request(`/zh/s/${style.slug}`, {}, env)).text();
    expect(html).toContain("love this style!");
    expect(html).toContain("登录后即可评论");
    expect(html).not.toContain('name="body"');

    // author deletes it
    const idMatch = html.match(/\/api\/comments\/(\d+)/);
    // (re-fetch as author to get the delete control id)
    const authed = await (await app.request(`/zh/s/${style.slug}`, { headers: { Cookie: cookie } }, env)).text();
    const id = authed.match(/\/api\/comments\/(\d+)/)?.[1];
    expect(id).toBeTruthy();
    const del = await app.request(`/api/comments/${id}`, { method: "DELETE", headers: csrf }, env);
    expect(del.status).toBe(200);
    html = await (await app.request(`/zh/s/${style.slug}`, { headers: { Cookie: cookie } }, env)).text();
    expect(html).not.toContain("love this style!");
    expect(html).toContain("评论 (0)");
    void idMatch;
  });

  it("comments: a non-author non-admin cannot delete someone else's comment", async () => {
    const owner = await makeUser();
    const style = await approvedStyle(owner.id, { name: "Guarded Comments" });
    const author = await cookieFor("author@test.dev");
    const other = await cookieFor("other@test.dev");
    await app.request(`/api/styles/${style.slug}/comments`,
      { method: "POST", headers: { Cookie: author.cookie, "X-Requested-With": "drawstyle" },
        body: new URLSearchParams({ body: "mine" }) }, env);
    const authed = await (await app.request(`/zh/s/${style.slug}`, { headers: { Cookie: author.cookie } }, env)).text();
    const id = authed.match(/\/api\/comments\/(\d+)/)?.[1];
    const del = await app.request(`/api/comments/${id}`,
      { method: "DELETE", headers: { Cookie: other.cookie, "X-Requested-With": "drawstyle" } }, env);
    expect(del.status).toBe(403);
  });
});
