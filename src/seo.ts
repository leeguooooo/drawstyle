// Unprefixed SEO/GEO endpoints: sitemap.xml, robots.txt, llms.txt.

import { Hono } from "hono";
import { listApprovedSlugsForSitemap } from "./db";
import { LOCALES } from "./i18n";
import { SITE_URL } from "./pages/head";

export const seoRoutes = new Hono<{ Bindings: Env }>();

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// One <url> entry with hreflang alternates for both locales + x-default.
function urlEntry(pathAfterLocale: string, lastmod?: string): string {
  const links = [
    ...LOCALES.map(
      (loc) =>
        `    <xhtml:link rel="alternate" hreflang="${loc}" href="${escapeXml(`${SITE_URL}/${loc}${pathAfterLocale}`)}"/>`,
    ),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(`${SITE_URL}/zh${pathAfterLocale}`)}"/>`,
  ].join("\n");
  return LOCALES.map((loc) =>
    [
      "  <url>",
      `    <loc>${escapeXml(`${SITE_URL}/${loc}${pathAfterLocale}`)}</loc>`,
      links,
      lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : null,
      "  </url>",
    ]
      .filter(Boolean)
      .join("\n"),
  ).join("\n");
}

seoRoutes.get("/sitemap.xml", async (c) => {
  const styles = await listApprovedSlugsForSitemap(c.env.DB);
  const entries = [
    urlEntry("/"),
    ...styles.map((style) => urlEntry(`/s/${style.slug}`, style.updated_at)),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>
`;
  return c.body(xml, 200, {
    "Content-Type": "application/xml; charset=UTF-8",
  });
});

seoRoutes.get("/robots.txt", (c) =>
  c.text(
    `User-agent: *
Allow: /
Disallow: /admin
Disallow: /zh/admin
Disallow: /en/admin
Disallow: /me
Disallow: /zh/me
Disallow: /en/me
Disallow: /api/
Disallow: /auth/

Sitemap: ${SITE_URL}/sitemap.xml
`,
  ),
);

seoRoutes.get("/llms.txt", (c) =>
  c.text(
    `# drawstyle

> drawstyle (${SITE_URL}) is a community gallery of style presets for AI image
> generation. Each preset (a "style") bundles a prompt snippet, example images,
> and optional reference images, and can be pulled into a local workflow with
> one CLI command.

drawstyle(画风广场)是面向 AI 绘图的社区风格预设库。每个风格包含 prompt 片段、
示例图和可选参考图,可以用一条命令拉取到本地使用。

## URL scheme

- HTML pages are localized under /zh/ and /en/:
  - Gallery: ${SITE_URL}/zh/ and ${SITE_URL}/en/
  - Style detail: ${SITE_URL}/{zh|en}/s/{slug}
- JSON API, images and auth are unprefixed (/api/*, /img/*, /auth/*).

## For agents and LLMs

- List approved styles (public JSON): GET ${SITE_URL}/api/styles
  Supports ?q=, ?category=, ?tag=, ?sort=likes|new|pulls, ?page=.
- Fetch one style's full package (snippet + reference image URLs):
  GET ${SITE_URL}/api/styles/{slug}/package
- Pull a style into a local project with the CLI:
  chatgpt-imagegen style pull {slug}
- CLI repository: https://github.com/leeguooooo/chatgpt-imagegen

## More

- Sitemap: ${SITE_URL}/sitemap.xml
`,
  ),
);
