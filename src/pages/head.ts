// SEO head builder. Every page renders its <head> SEO block through buildHead:
// title, meta description, canonical, hreflang alternates, Open Graph, Twitter
// card and JSON-LD. Mirrors the conventions used on blog.leeguoo.com so the
// whole leeguoo family shares one entity graph (Organization / Person @ids).

import { SITE_URL } from "../config";
import { DEFAULT_LOCALE, htmlLang, ogLocale, swapLocale, type Locale } from "../i18n";
import { escapeHtml } from "./layout";

export const SITE_NAME = "drawstyle";
export const TWITTER_HANDLE = "@leeguooooo";
// Human-readable author byline reused in <meta name="author"> and footers.
export const AUTHOR_BYLINE = "郭立 (Guo Li / Leo / leeguoo)";

// Reused across the leeguoo family so search engines merge ONE entity graph
// with blog.leeguoo.com and leeguoo.com — same @ids for the person & org.
const PERSON = {
  "@type": "Person",
  "@id": "https://leeguoo.com/about#person",
  name: "郭立",
  alternateName: ["Guo Li", "Li Guo", "Leo", "leeguoo"],
  url: "https://leeguoo.com/about",
  sameAs: [
    "https://github.com/leeguooooo",
    "https://www.linkedin.com/in/li-guo-372ba1365/",
    "https://x.com/leeguooooo",
    "https://blog.leeguoo.com/",
  ],
};

const PUBLISHER = {
  "@type": "Organization",
  "@id": "https://leeguoo.com/#org",
  name: "leeguoo",
  url: "https://leeguoo.com/",
  founder: { "@id": PERSON["@id"] },
  logo: {
    "@type": "ImageObject",
    url: "https://avatars.githubusercontent.com/u/9278645?v=4",
  },
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
    alternateName: "drawstyle · 画风画廊",
    url: `${SITE_URL}/`,
    inLanguage: htmlLang(locale),
    publisher: PUBLISHER,
    creator: { "@id": PERSON["@id"] },
    author: { "@id": PERSON["@id"] },
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
  const defaultUrl = abs(swapLocale(path, DEFAULT_LOCALE));
  const canonical = abs(path);
  const fullTitle = `${title} · ${SITE_NAME}`;

  const parts: string[] = [
    `<title>${escapeHtml(fullTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta name="robots" content="index,follow,max-image-preview:large">`,
    `<meta name="author" content="${escapeHtml(AUTHOR_BYLINE)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<link rel="me" href="https://leeguoo.com/">`,
    `<link rel="alternate" hreflang="zh" href="${escapeHtml(zhUrl)}">`,
    `<link rel="alternate" hreflang="en" href="${escapeHtml(enUrl)}">`,
    // x-default -> the site default locale (en).
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(defaultUrl)}">`,
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
  // The person/brand node (郭立 / Guo Li / Leo / leeguoo) on every page, so the
  // whole site attributes to the same author entity as blog.leeguoo.com.
  parts.push(jsonLdScript({ "@context": "https://schema.org", ...PERSON }));
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
