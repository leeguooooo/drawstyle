import type { StyleStatus } from "./db";

// Auto internationalization for drawstyle's SSR pages.
//
// URL scheme: every HTML page lives under a locale prefix (/zh/ or /en/).
// API (/api/*), images (/img/*), auth (/auth/*) and healthz stay unprefixed.
// User-generated content (style names, snippets, tags) is NEVER translated —
// only the surrounding UI chrome (nav, buttons, labels, headings, meta copy).

// Adding a locale (e.g. "ja")? Touch ALL of these, in this file:
//   1. LOCALES below (drives isLocale, swapLocale and route registration),
//   2. the HTML_LANG / OG_LOCALE / DICTS maps (Record<Locale, …> makes tsc
//      flag any that were missed),
//   3. localeFromAcceptLanguage's preference branches.
export const LOCALES = ["zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh";

const LOCALE_PREFIX_RE = new RegExp(`^/(${LOCALES.join("|")})(/.*|$)`);

export function isLocale(value: string | undefined): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? "");
}

// <html lang> value per locale.
const HTML_LANG: Record<Locale, string> = { zh: "zh-CN", en: "en" };
export function htmlLang(locale: Locale): string {
  return HTML_LANG[locale];
}

// og:locale value per locale.
const OG_LOCALE: Record<Locale, string> = { zh: "zh_CN", en: "en_US" };
export function ogLocale(locale: Locale): string {
  return OG_LOCALE[locale];
}

// Pick a locale from an Accept-Language header: whichever of an en* / zh*
// variant appears first in the ordered list wins; default zh.
export function localeFromAcceptLanguage(header: string | undefined | null): Locale {
  if (!header) {
    return DEFAULT_LOCALE;
  }
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    if (tag.startsWith("en")) {
      return "en";
    }
    if (tag.startsWith("zh")) {
      return "zh";
    }
  }
  return DEFAULT_LOCALE;
}

// Cookie (explicit user choice) beats the Accept-Language header.
export function pickLocale(
  cookie: string | undefined,
  acceptLanguage: string | undefined | null,
): Locale {
  if (isLocale(cookie)) {
    return cookie;
  }
  return localeFromAcceptLanguage(acceptLanguage);
}

// Replace the locale segment of a localized path (/zh/... -> /en/...). Given a
// non-prefixed path it prepends the locale.
export function swapLocale(path: string, locale: Locale): string {
  const match = path.match(LOCALE_PREFIX_RE);
  if (match) {
    return `/${locale}${match[2] || "/"}`;
  }
  return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface Dict {
  brand: string;
  navSubmit: string;
  navMe: string;
  navAdmin: string;
  navLogin: string;
  navLogout: string;
  langSwitch: string;

  galleryTitle: string;
  galleryHeading: string;
  galleryDesc: string;

  detailDesc: (name: string) => string;
  snippetHeading: string;
  cliHeading: string;
  like: string;
  fork: string;
  edit: string;
  versionLabel: (n: number) => string;

  submitTitle: string;
  submitHeadingNew: string;
  submitHeadingEdit: string;
  submitDesc: string;
  fieldSlug: string;
  fieldName: string;
  fieldKind: string;
  fieldCategory: string;
  fieldTags: string;
  fieldSnippet: string;
  fieldExamples: string;
  fieldReferences: string;
  refsKeepHint: string;
  dropzonePrompt: string;
  dropzoneExamplesHint: string;
  dropzoneRefsHint: string;
  dropzoneRemove: string;
  submitSignInTitle: string;
  submitSignInBody: string;
  submitSignInButton: string;
  submitButton: string;

  meTitle: string;
  meHeadingMine: string;
  meHeadingLiked: string;
  meDesc: string;

  adminTitle: string;
  adminHeading: string;
  adminDesc: string;
  adminNote: string;
  adminApprove: string;
  adminReject: string;
  badgeRevision: string;
  badgeNew: string;

  statusLabels: Record<StyleStatus, string>;
}

const zh: Dict = {
  brand: "drawstyle",
  navSubmit: "投稿",
  navMe: "我的",
  navAdmin: "审核",
  navLogin: "登录",
  navLogout: "退出",
  langSwitch: "EN",

  galleryTitle: "画廊",
  galleryHeading: "风格画廊",
  galleryDesc:
    "drawstyle 是面向 AI 绘图的社区风格预设库,一键复用他人的画风与角色 prompt。",

  detailDesc: (name) =>
    `${name} —— drawstyle 上的 AI 绘图风格预设,含示例图、prompt 片段与一键 CLI 拉取命令。`,
  snippetHeading: "Prompt 片段",
  cliHeading: "命令行",
  like: "喜欢",
  fork: "复刻",
  edit: "编辑",
  versionLabel: (n) => `版本 ${n}`,

  submitTitle: "投稿",
  submitHeadingNew: "投稿风格",
  submitHeadingEdit: "编辑风格",
  submitDesc: "向 drawstyle 社区投稿你的 AI 绘图风格预设。",
  fieldSlug: "标识符",
  fieldName: "名称",
  fieldKind: "类型",
  fieldCategory: "分类",
  fieldTags: "标签",
  fieldSnippet: "Prompt 片段",
  fieldExamples: "示例图",
  fieldReferences: "参考图",
  refsKeepHint: "留空表示保留现有参考图",
  dropzonePrompt: "拖图到这里，或点击选择",
  dropzoneExamplesHint: "PNG / JPEG / WebP，1–3 张",
  dropzoneRefsHint: "PNG / JPEG / WebP，最多 4 张",
  dropzoneRemove: "移除",
  submitSignInTitle: "登录后即可投稿",
  submitSignInBody: "投稿风格需要先登录。登录后会回到投稿页，你填的内容不会丢。",
  submitSignInButton: "登录以投稿",
  submitButton: "提交",

  meTitle: "我的",
  meHeadingMine: "我的风格",
  meHeadingLiked: "我的喜欢",
  meDesc: "管理我投稿的风格与我喜欢的风格。",

  adminTitle: "审核",
  adminHeading: "审核队列",
  adminDesc: "drawstyle 风格投稿审核队列。",
  adminNote: "备注",
  adminApprove: "通过",
  adminReject: "驳回",
  badgeRevision: "改稿",
  badgeNew: "新投稿",

  statusLabels: {
    pending: "待审核",
    approved: "已上架",
    rejected: "已驳回",
    delisted: "已下架",
  },
};

const en: Dict = {
  brand: "drawstyle",
  navSubmit: "Submit",
  navMe: "Mine",
  navAdmin: "Review",
  navLogin: "Sign in",
  navLogout: "Sign out",
  langSwitch: "中文",

  galleryTitle: "Gallery",
  galleryHeading: "Style gallery",
  galleryDesc:
    "drawstyle is a community gallery of style presets for AI image generation — reuse other people's art styles and character prompts in one command.",

  detailDesc: (name) =>
    `${name} — an AI image-generation style preset on drawstyle, with example images, a prompt snippet, and a one-line CLI pull command.`,
  snippetHeading: "Prompt snippet",
  cliHeading: "CLI",
  like: "Like",
  fork: "Fork",
  edit: "Edit",
  versionLabel: (n) => `version ${n}`,

  submitTitle: "Submit",
  submitHeadingNew: "Submit a style",
  submitHeadingEdit: "Edit style",
  submitDesc: "Share your AI image-generation style preset with the drawstyle community.",
  fieldSlug: "Slug",
  fieldName: "Name",
  fieldKind: "Kind",
  fieldCategory: "Category",
  fieldTags: "Tags",
  fieldSnippet: "Snippet",
  fieldExamples: "Examples",
  fieldReferences: "References",
  refsKeepHint: "Leave empty to keep the existing reference images",
  dropzonePrompt: "Drop images here, or click to choose",
  dropzoneExamplesHint: "PNG / JPEG / WebP, 1–3 images",
  dropzoneRefsHint: "PNG / JPEG / WebP, up to 4",
  dropzoneRemove: "Remove",
  submitSignInTitle: "Sign in to share a style",
  submitSignInBody: "Submitting a style needs a quick sign-in. You'll land back on the submit page afterwards.",
  submitSignInButton: "Sign in to submit",
  submitButton: "Submit",

  meTitle: "Mine",
  meHeadingMine: "My styles",
  meHeadingLiked: "Styles I like",
  meDesc: "Manage the styles you submitted and the ones you liked.",

  adminTitle: "Review",
  adminHeading: "Review queue",
  adminDesc: "drawstyle style submission review queue.",
  adminNote: "Note",
  adminApprove: "Approve",
  adminReject: "Reject",
  badgeRevision: "revision",
  badgeNew: "new",

  statusLabels: {
    pending: "Pending review",
    approved: "Approved",
    rejected: "Rejected",
    delisted: "Delisted",
  },
};

const DICTS: Record<Locale, Dict> = { zh, en };

export function t(locale: Locale): Dict {
  return DICTS[locale];
}

export function statusLabel(status: StyleStatus, locale: Locale): string {
  return t(locale).statusLabels[status] ?? status;
}
