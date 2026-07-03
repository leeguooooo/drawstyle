// SEO head builder. Every page renders its <head> SEO block through buildHead:
// title, meta description, canonical, hreflang alternates, Open Graph, Twitter
// card and JSON-LD. Mirrors the conventions used on blog.leeguoo.com so the
// whole leeguoo family shares one entity graph (Organization / Person @ids).

import { htmlLang, ogLocale, swapLocale, type Locale } from "../i18n";
import { escapeHtml } from "./layout";

export const SITE_URL = "https://drawstyle.leeguoo.com";
export const SITE_NAME = "drawstyle";
export const TWITTER_HANDLE = "@leeguooooo";

// Reused across the leeguoo family so search engines merge the entity graph.
const PUBLISHER = {
  "@type": "Organization",
  "@id": "https://leeguoo.com/#org",
  name: "leeguoo",
  url: "https://leeguoo.com/",
};

export interface HeadOptions {
  locale: Locale;
  // Localized path of THIS page, always beginning with /zh or /en (e.g. "/en/s/foo").
  path: string;
  // Bare page title (localized); " · drawstyle" is appended here.
  title: string;
  description: string;
  // Absolute og:image URL. Omit rather than point at an unrelated card.
  ogImage?: string;
  // Extra JSON-LD nodes (e.g. an ImageObject on a detail page). The WebSite
  // node is always emitted.
  jsonLd?: unknown[];
}

function abs(path: string): string {
  return `${SITE_URL}${path}`;
}

function metaTag(property: string, content: string, attr: "name" | "property" = "property"): string {
  return `<meta ${attr}="${property}" content="${escapeHtml(content)}">`;
}

function websiteNode(locale: Locale): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    inLanguage: htmlLang(locale),
    publisher: PUBLISHER,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/${locale}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

function jsonLdScript(node: unknown): string {
  // JSON.stringify already escapes quotes; guard the </script> break-out.
  const json = JSON.stringify(node).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

export function buildHead(opts: HeadOptions): string {
  const { locale, path, title, description, ogImage } = opts;
  const zhUrl = abs(swapLocale(path, "zh"));
  const enUrl = abs(swapLocale(path, "en"));
  const canonical = abs(path);
  const fullTitle = `${title} · ${SITE_NAME}`;

  const parts: string[] = [
    `<title>${escapeHtml(fullTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<link rel="alternate" hreflang="zh" href="${escapeHtml(zhUrl)}">`,
    `<link rel="alternate" hreflang="en" href="${escapeHtml(enUrl)}">`,
    // x-default -> zh, matching blog.leeguoo.com's convention.
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(zhUrl)}">`,
    metaTag("og:type", "website"),
    metaTag("og:site_name", SITE_NAME),
    metaTag("og:title", fullTitle),
    metaTag("og:description", description),
    metaTag("og:url", canonical),
    metaTag("og:locale", ogLocale(locale)),
    metaTag("og:locale:alternate", ogLocale(locale === "zh" ? "en" : "zh")),
  ];

  if (ogImage) {
    parts.push(metaTag("og:image", ogImage));
    parts.push(metaTag("twitter:card", "summary_large_image", "name"));
    parts.push(metaTag("twitter:image", ogImage, "name"));
  } else {
    parts.push(metaTag("twitter:card", "summary", "name"));
  }
  parts.push(metaTag("twitter:site", TWITTER_HANDLE, "name"));
  parts.push(metaTag("twitter:creator", TWITTER_HANDLE, "name"));
  parts.push(metaTag("twitter:title", fullTitle, "name"));
  parts.push(metaTag("twitter:description", description, "name"));

  parts.push(jsonLdScript(websiteNode(locale)));
  for (const node of opts.jsonLd ?? []) {
    parts.push(jsonLdScript(node));
  }

  return parts.join("\n  ");
}

// JSON-LD node for a style detail page (schema.org ImageObject / CreativeWork).
export interface StyleLdInput {
  name: string;
  snippet: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  canonicalPath: string;
  contentUrl?: string;
}

export function styleLdNode(input: StyleLdInput): Record<string, unknown> {
  const description =
    input.snippet.length > 200 ? `${input.snippet.slice(0, 200)}…` : input.snippet;
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    name: input.name,
    description,
    author: { "@type": "Person", name: input.authorName },
    dateCreated: input.createdAt,
    dateModified: input.updatedAt,
    url: abs(input.canonicalPath),
  };
  if (input.contentUrl) {
    node.contentUrl = input.contentUrl;
  }
  return node;
}
