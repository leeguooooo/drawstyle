// Unprefixed SEO/GEO endpoints: sitemap.xml, robots.txt, llms.txt.

import { Hono } from "hono";
import { SITE_URL } from "./config";
import { listApprovedSlugsForSitemap } from "./db";
import { DEFAULT_LOCALE, LOCALES } from "./i18n";
import { DOCS_SLUGS } from "./pages/docs";
import { escapeHtml } from "./pages/layout";

export const seoRoutes = new Hono<{ Bindings: Env }>();

// XML needs the HTML escape set plus single quotes (attribute values may be
// single-quoted in XML); extend the shared helper instead of re-implementing.
function escapeXml(value: string): string {
  return escapeHtml(value).replace(/'/g, "&apos;");
}

// One <url> entry with hreflang alternates for both locales + x-default.
function urlEntry(pathAfterLocale: string, lastmod?: string): string {
  const links = [
    ...LOCALES.map(
      (loc) =>
        `    <xhtml:link rel="alternate" hreflang="${loc}" href="${escapeXml(`${SITE_URL}/${loc}${pathAfterLocale}`)}"/>`,
    ),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(`${SITE_URL}/${DEFAULT_LOCALE}${pathAfterLocale}`)}"/>`,
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
    ...DOCS_SLUGS.map((slug) => urlEntry(slug ? `/docs/${slug}` : "/docs")),
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

Built and maintained by 郭立 (Guo Li / Leo / leeguoo) — https://leeguoo.com/ .
Part of the leeguoo family alongside the blog at https://blog.leeguoo.com/ .

## URL scheme

- HTML pages are localized under /en/ (default) and /zh/:
  - Gallery: ${SITE_URL}/en/ and ${SITE_URL}/zh/
  - Style detail: ${SITE_URL}/{en|zh}/s/{slug}
  - Documentation: ${SITE_URL}/en/docs and ${SITE_URL}/zh/docs
- JSON API, images and auth are unprefixed (/api/*, /img/*, /auth/*).

## For agents and LLMs

- List approved styles (public JSON): GET ${SITE_URL}/api/styles
  Supports ?q=, ?category=, ?tag=, ?sort=likes|new|pulls, ?page=.
- Fetch one style's full package (snippet + reference image URLs):
  GET ${SITE_URL}/api/styles/{slug}/package
- Generate directly with a gallery style (nothing saved locally):
  chatgpt-imagegen "<prompt>" --style-online {slug}
- Or pull a style into a local project:
  chatgpt-imagegen style pull {slug}
- CLI repository: https://github.com/leeguooooo/chatgpt-imagegen

## More

- Documentation: ${SITE_URL}/en/docs
- Blog (deep dives by 郭立 / leeguoo): https://blog.leeguoo.com/
- Sitemap: ${SITE_URL}/sitemap.xml
`,
  ),
);
