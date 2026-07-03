// Locale routing (redirects + cookie), SEO head output (canonical / hreflang /
// OG / JSON-LD), sitemap.xml, robots.txt and llms.txt.

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { addImage, createStyle } from "../src/db";
import app from "../src/index";
import { putImage } from "../src/images";
import { makeUser } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function uniq(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

async function approvedStyle(overrides: { slug?: string; name?: string; snippet?: string } = {}) {
  const owner = await makeUser({ display_name: "Seed Author" });
  const style = await createStyle(env.DB, {
    slug: overrides.slug ?? uniq("seo-style"),
    name: overrides.name ?? "SEO Style",
    owner_user_id: owner.id,
    kind: "style",
    category: "report",
    status: "approved",
    snippet: overrides.snippet ?? "seo snippet",
  });
  return { owner, style };
}

async function addExample(styleId: number) {
  const stored = await putImage(env.ASSETS, PNG);
  await addImage(env.DB, {
    style_id: styleId,
    r2_key: stored.r2_key,
    role: "example",
    content_type: stored.content_type,
  });
  return stored;
}

function extractJsonLd(html: string): Array<Record<string, unknown>> {
  const blocks = [
    ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
  ];
  return blocks.map((match) => JSON.parse(match[1]) as Record<string, unknown>);
}

describe("locale routing", () => {
  it("302s / to /en/ for English Accept-Language", async () => {
    const res = await app.request(
      "/",
      { headers: { "Accept-Language": "en-US,en;q=0.9" } },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/en/");
  });

  it("302s / to /zh/ for Chinese Accept-Language", async () => {
    const res = await app.request(
      "/",
      { headers: { "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5" } },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/zh/");
  });

  it("302s / to /zh/ when there is no language signal", async () => {
    const res = await app.request("/", {}, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/zh/");
  });

  it("lets the lang cookie override the Accept-Language header", async () => {
    const res = await app.request(
      "/",
      {
        headers: {
          "Accept-Language": "zh-CN,zh;q=0.9",
          Cookie: "lang=en",
        },
      },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/en/");
  });

  it("301s old unprefixed URLs to the locale-prefixed equivalent", async () => {
    const { style } = await approvedStyle();

    const detail = await app.request(`/s/${style.slug}`, {}, env);
    expect(detail.status).toBe(301);
    expect(detail.headers.get("Location")).toBe(`/zh/s/${style.slug}`);

    const detailEn = await app.request(
      `/s/${style.slug}`,
      { headers: { "Accept-Language": "en-US" } },
      env,
    );
    expect(detailEn.status).toBe(301);
    expect(detailEn.headers.get("Location")).toBe(`/en/s/${style.slug}`);

    const submit = await app.request("/submit?fork=abc", {}, env);
    expect(submit.status).toBe(301);
    expect(submit.headers.get("Location")).toBe("/zh/submit?fork=abc");

    for (const path of ["/me", "/admin"]) {
      const res = await app.request(path, {}, env);
      expect(res.status).toBe(301);
      expect(res.headers.get("Location")).toBe(`/zh${path}`);
    }
  });

  it("sets the lang cookie and bounces back via /lang/:locale", async () => {
    const res = await app.request("/lang/en?to=%2Fen%2Fs%2Ffoo", {}, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/en/s/foo");
    expect(res.headers.get("Set-Cookie")).toContain("lang=en");
  });

  it("rejects offsite ?to targets on the /lang route", async () => {
    const res = await app.request("/lang/en?to=//evil.example", {}, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/en/");
  });
});

describe("SEO head", () => {
  it("renders /en/ with English chrome, canonical and hreflang alternates", async () => {
    const res = await app.request("/en/", {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(">Submit</a>");
    expect(html).toContain(">Sign in</a>");
    expect(html).toContain(
      '<link rel="canonical" href="https://drawstyle.leeguoo.com/en/">',
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="zh" href="https://drawstyle.leeguoo.com/zh/">',
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="en" href="https://drawstyle.leeguoo.com/en/">',
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://drawstyle.leeguoo.com/zh/">',
    );
    expect(html).toContain('<meta property="og:locale" content="en_US">');
    expect(html).toContain('<meta name="twitter:site" content="@leeguooooo">');
  });

  it("renders /zh/ with Chinese chrome and zh canonical", async () => {
    const res = await app.request("/zh/", {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain(">投稿</a>");
    expect(html).toContain(
      '<link rel="canonical" href="https://drawstyle.leeguoo.com/zh/">',
    );
    expect(html).toContain('<meta property="og:locale" content="zh_CN">');
    expect(html).toContain('<meta name="description"');
  });

  it("puts og:image + valid JSON-LD on a detail page with an example image", async () => {
    const { style } = await approvedStyle({ name: "OG Style" });
    const stored = await addExample(style.id);

    const res = await app.request(`/en/s/${style.slug}`, {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();

    const imageUrl = `https://drawstyle.leeguoo.com/img/${encodeURIComponent(stored.r2_key)}`;
    expect(html).toContain(`<meta property="og:image" content="${imageUrl}">`);
    expect(html).toContain(
      '<meta name="twitter:card" content="summary_large_image">',
    );
    expect(html).toContain(
      `<link rel="canonical" href="https://drawstyle.leeguoo.com/en/s/${style.slug}">`,
    );

    const nodes = extractJsonLd(html);
    const website = nodes.find((node) => node["@type"] === "WebSite");
    expect(website).toBeDefined();
    expect(website?.["@id"]).toBe("https://drawstyle.leeguoo.com/#website");
    expect((website?.publisher as Record<string, unknown>)["@id"]).toBe(
      "https://leeguoo.com/#org",
    );
    const detail = nodes.find((node) => node["@type"] === "ImageObject");
    expect(detail).toBeDefined();
    expect(detail?.name).toBe("OG Style");
    expect((detail?.author as Record<string, unknown>).name).toBe("Seed Author");
    expect(detail?.url).toBe(`https://drawstyle.leeguoo.com/en/s/${style.slug}`);
    expect(detail?.contentUrl).toBe(imageUrl);
  });

  it("uses a summary twitter card and no og:image on pages without one", async () => {
    const res = await app.request("/zh/", {}, env);
    const html = await res.text();
    expect(html).not.toContain('property="og:image"');
    expect(html).toContain('<meta name="twitter:card" content="summary">');
  });
});

describe("sitemap / robots / llms", () => {
  it("lists approved styles in both locales with hreflang alternates", async () => {
    const { style } = await approvedStyle();

    const res = await app.request("/sitemap.xml", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("xml");
    const xml = await res.text();
    expect(xml).toContain(
      `<loc>https://drawstyle.leeguoo.com/zh/s/${style.slug}</loc>`,
    );
    expect(xml).toContain(
      `<loc>https://drawstyle.leeguoo.com/en/s/${style.slug}</loc>`,
    );
    expect(xml).toContain("<loc>https://drawstyle.leeguoo.com/zh/</loc>");
    expect(xml).toContain("<loc>https://drawstyle.leeguoo.com/en/</loc>");
    expect(xml).toContain(
      `hreflang="en" href="https://drawstyle.leeguoo.com/en/s/${style.slug}"`,
    );
    expect(xml).toContain(`<lastmod>${style.updated_at}</lastmod>`);
  });

  it("serves robots.txt with the sitemap and admin/api disallows", async () => {
    const res = await app.request("/robots.txt", {}, env);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Sitemap: https://drawstyle.leeguoo.com/sitemap.xml");
    expect(text).toContain("Disallow: /admin");
    expect(text).toContain("Disallow: /api/");
    expect(text).toContain("Disallow: /auth/");
  });

  it("serves llms.txt describing the API and the CLI pull command", async () => {
    const res = await app.request("/llms.txt", {}, env);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("style pull");
    expect(text).toContain("/api/styles");
    expect(text).toContain("github.com/leeguooooo/chatgpt-imagegen");
    expect(text).toContain("sitemap.xml");
  });
});
