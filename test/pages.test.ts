import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME, signSession } from "../src/auth";
import { addImage, createStyle, likeStyle } from "../src/db";
import app from "../src/index";
import { putImage } from "../src/images";
import { makeUser } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

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
    expect(html).toContain(`class="card-img" src="`);
    expect(html).toContain(encodeURIComponent(refKey));
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
    expect(html).toContain("领导汇报");
    expect(html).toContain("blog.leeguoo.com/scripts/visitor-beacon.js");
    expect(html).toContain(`chatgpt-imagegen style pull ${style.slug}`);
  });

  it("renders style detail with snippet, pull command, and like/fork controls", async () => {
    const owner = await makeUser();
    const style = await approvedStyle(owner.id, { name: "Detail Style" });

    const res = await app.request(`/zh/s/${style.slug}`, {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Detail Style");
    expect(html).toContain("page snippet");
    expect(html).toContain(`chatgpt-imagegen style pull ${style.slug}`);
    expect(html).toContain(`/api/styles/${style.slug}/like`);
    expect(html).toContain(`/zh/submit?fork=${style.slug}`);
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
    expect(html).toContain("data-dropzone");
    expect(html).toContain('class="dropzone__previews"');
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
});
