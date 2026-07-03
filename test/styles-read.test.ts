import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  addImage,
  addTags,
  createStyle,
  getStyleBySlug,
  type StyleStatus,
} from "../src/db";
import app from "../src/index";
import { putImage } from "../src/images";
import { makeUser } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function uniq(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

async function makeReadStyle(
  overrides: {
    slug?: string;
    name?: string;
    snippet?: string;
    category?: string;
    status?: StyleStatus;
    tags?: string[];
    likes_count?: number;
    pulls_count?: number;
  } = {},
) {
  const user = await makeUser();
  const slug = overrides.slug ?? uniq("read-style");
  const style = await createStyle(env.DB, {
    slug,
    name: overrides.name ?? `Read ${slug}`,
    owner_user_id: user.id,
    kind: "style",
    category: overrides.category ?? "report",
    status: overrides.status ?? "approved",
    snippet: overrides.snippet ?? `snippet ${slug}`,
  });
  if (overrides.likes_count || overrides.pulls_count) {
    await env.DB.prepare(
      `UPDATE styles
       SET likes_count = ?, pulls_count = ?
       WHERE id = ?`,
    )
      .bind(overrides.likes_count ?? 0, overrides.pulls_count ?? 0, style.id)
      .run();
  }
  await addTags(env.DB, style.id, overrides.tags ?? []);
  return (await getStyleBySlug(env.DB, slug)) ?? style;
}

async function addStoredImage(
  styleId: number,
  role: "example" | "reference",
  pending = 0,
) {
  const bytes = new Uint8Array(PNG);
  bytes[8] = crypto.getRandomValues(new Uint8Array(1))[0];
  const stored = await putImage(env.ASSETS, bytes);
  await addImage(env.DB, {
    style_id: styleId,
    r2_key: stored.r2_key,
    role,
    content_type: stored.content_type,
    pending,
  });
  return stored;
}

describe("public styles read API", () => {
  it("lists approved styles with q, category, tag, sort, and pagination", async () => {
    const needle = uniq("watercolor");
    const wanted = await makeReadStyle({
      slug: needle,
      snippet: `soft ${needle} mascot`,
      category: "avatar-ip",
      tags: ["watercolor"],
      likes_count: 9,
    });
    await makeReadStyle({
      slug: uniq("pending"),
      snippet: needle,
      category: "avatar-ip",
      status: "pending",
      tags: ["watercolor"],
    });
    await makeReadStyle({
      slug: uniq("wrong-category"),
      snippet: needle,
      category: "report",
      tags: ["watercolor"],
    });

    const res = await app.request(
      `/api/styles?q=${needle}&category=avatar-ip&tag=watercolor&sort=likes&page=1`,
      {},
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      styles: Array<{ slug: string; likes_count: number }>;
      page: number;
      page_size: number;
      sort: string;
    };
    expect(body.page).toBe(1);
    expect(body.page_size).toBe(20);
    expect(body.sort).toBe("likes");
    expect(body.styles.map((style) => style.slug)).toContain(wanted.slug);
    expect(body.styles.every((style) => style.slug.includes(needle))).toBe(true);
  });

  it("returns approved style detail with tags and live images only", async () => {
    const style = await makeReadStyle({ tags: ["ink", "flat"] });
    const example = await addStoredImage(style.id, "example");
    await addStoredImage(style.id, "reference", 1);

    const res = await app.request(`/api/styles/${style.slug}`, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      slug: string;
      tags: string[];
      images: Array<{ role: string; url: string; content_type: string }>;
    };
    expect(body.slug).toBe(style.slug);
    expect(body.tags).toEqual(["flat", "ink"]);
    expect(body.images).toHaveLength(1);
    expect(body.images[0].role).toBe("example");
    expect(body.images[0].url).toContain(`/img/${example.r2_key}`);
    expect(body.images[0].content_type).toBe("image/png");
  });

  it("404s for pending, rejected, or unknown detail requests with API error shape", async () => {
    const pending = await makeReadStyle({ status: "pending" });
    const rejected = await makeReadStyle({ status: "rejected" });

    for (const slug of [pending.slug, rejected.slug, "does-not-exist"]) {
      const res = await app.request(`/api/styles/${slug}`, {}, env);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: { code: "not_found", message: "style not found" },
      });
    }
  });

  it("returns a package with live refs only and increments pulls_count", async () => {
    const style = await makeReadStyle();
    const liveRef = await addStoredImage(style.id, "reference");
    await addStoredImage(style.id, "reference", 1);
    await addStoredImage(style.id, "example");

    const before = await getStyleBySlug(env.DB, style.slug);
    const res = await app.request(`/api/styles/${style.slug}/package`, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      slug: string;
      kind: string;
      snippet: string;
      version: number;
      refs: Array<{ url: string; content_type: string }>;
    };
    expect(body.slug).toBe(style.slug);
    expect(body.kind).toBe("style");
    expect(body.snippet).toBe(style.snippet);
    expect(body.version).toBe(style.version);
    expect(body.refs).toEqual([
      {
        url: `http://localhost/img/${liveRef.r2_key}`,
        content_type: "image/png",
      },
    ]);
    const after = await getStyleBySlug(env.DB, style.slug);
    expect(after?.pulls_count).toBe((before?.pulls_count ?? 0) + 1);
  });

  it("returns metadata categories and approved curated tags", async () => {
    const tag = uniq("tag");
    await makeReadStyle({ tags: [tag] });
    await makeReadStyle({ status: "pending", tags: ["hidden-tag"] });

    const res = await app.request("/api/meta", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      categories: Array<{ key: string; label_zh: string }>;
      tags: string[];
    };
    expect(body.categories.map((category) => category.key)).toEqual([
      "report",
      "slides",
      "tech-explainer",
      "social-cover",
      "avatar-ip",
      "cute",
      "retro-comic",
      "photo-real",
    ]);
    expect(body.tags).toContain(tag);
    expect(body.tags).not.toContain("hidden-tag");
  });
});
