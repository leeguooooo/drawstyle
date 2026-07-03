import { setCookie } from "hono/cookie";
import { Hono } from "hono";
import { adminRoutes } from "./api/admin";
import { stylesReadRoutes } from "./api/styles-read";
import { stylesWriteRoutes } from "./api/styles-write";
import { authOptional, isAdminEmail, type AuthVariables } from "./auth";
import { imageProxy } from "./images";
import { DEFAULT_LOCALE, isLocale, LOCALES, pickLocale, type Locale } from "./i18n";
import { oidcRoutes } from "./oidc";
import { adminPage } from "./pages/admin";
import { detailPage } from "./pages/detail";
import { galleryPage } from "./pages/gallery";
import { mePage } from "./pages/me";
import { submitPage, submitSignInGate } from "./pages/submit";
import { seoRoutes } from "./seo";

export const LANG_COOKIE_NAME = "lang";
const LANG_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

const app = new Hono<{ Bindings: Env; Variables: Partial<AuthVariables> }>();

interface LocaleRequestContext {
  req: { header: (name: string) => string | undefined; raw: Request };
}

function requestLocale(c: LocaleRequestContext): Locale {
  // Parse the one cookie by hand so this helper only needs a Request-shaped
  // object, not a full Hono context.
  return pickLocale(
    getCookieValue(c.req.header("Cookie"), LANG_COOKIE_NAME),
    c.req.header("Accept-Language"),
  );
}

function getCookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=");
    }
  }
  return undefined;
}

// Permanently redirect an old unprefixed content URL to its /zh (x-default)
// equivalent, preserving the query string. Deliberately DETERMINISTIC — never
// vary on cookie or Accept-Language: 301s are cached per-URL (browsers cache
// them indefinitely, Googlebot binds the target permanently), so a per-visitor
// target would freeze one visitor's locale into everyone's cache. hreflang on
// the /zh page routes users to /en where appropriate.
function legacyRedirect(
  c: LocaleRequestContext & {
    redirect: (url: string, status?: 301 | 302) => Response;
  },
  pathAfterLocale: string,
): Response {
  const search = new URL(c.req.raw.url).search;
  return c.redirect(`/${DEFAULT_LOCALE}${pathAfterLocale}${search}`, 301);
}

// --- infrastructure (unprefixed) ---
app.get("/healthz", (c) => c.json({ ok: true }));
app.route("/auth", oidcRoutes);
app.get("/img/:key", authOptional, imageProxy);
app.route("/", seoRoutes);
app.route("/api", stylesReadRoutes);
app.route("/api", stylesWriteRoutes);
app.route("/api", adminRoutes);

// --- language switcher: set the lang cookie, then bounce back ---
app.get("/lang/:locale", (c) => {
  const locale = c.req.param("locale");
  if (!isLocale(locale)) {
    return c.notFound();
  }
  setCookie(c, LANG_COOKIE_NAME, locale, {
    path: "/",
    maxAge: LANG_COOKIE_MAX_AGE,
    sameSite: "Lax",
  });
  const to = c.req.query("to") ?? "";
  // Only same-site absolute paths; anything else falls back to the locale home.
  const target = to.startsWith("/") && !to.startsWith("//") ? to : `/${locale}/`;
  return c.redirect(target, 302);
});

// --- root: per-visitor locale pick, 302 (never cached as permanent) ---
app.get("/", (c) => {
  const locale = requestLocale(c);
  // Defensive: the target depends on the cookie and Accept-Language, so any
  // intermediary cache must key on both.
  c.header("Vary", "Accept-Language, Cookie");
  return c.redirect(`/${locale}/`, 302);
});

// --- legacy unprefixed page URLs: fixed 301 to /zh (see legacyRedirect) ---
app.get("/s/:slug", (c) =>
  legacyRedirect(c, `/s/${encodeURIComponent(c.req.param("slug"))}`),
);
app.get("/submit", (c) => legacyRedirect(c, "/submit"));
app.get("/me", (c) => legacyRedirect(c, "/me"));
app.get("/admin", (c) => legacyRedirect(c, "/admin"));

// --- localized HTML pages ---
// Registered as literal /zh/... and /en/... routes (no regex params: Hono's
// RegExpRouter inlines `{zh|en}` alternations unwrapped, which mis-matches).
for (const locale of LOCALES) {
  app.get(`/${locale}`, (c) => c.redirect(`/${locale}/`, 301));

  app.get(`/${locale}/`, authOptional, async (c) =>
    c.html(
      await galleryPage(c.env.DB, new URL(c.req.url).origin, locale, c.var.user, {
        q: c.req.query("q"),
        category: c.req.query("category"),
        tags: c.req.queries("tag") ?? [],
      }),
    ),
  );

  app.get(`/${locale}/s/:slug`, authOptional, async (c) => {
    const html = await detailPage(
      c.env.DB,
      new URL(c.req.url).origin,
      locale,
      c.req.param("slug"),
      c.var.user,
      c.var.user ? isAdminEmail(c.var.user.email, c.env) : false,
    );
    return html ? c.html(html) : c.notFound();
  });

  app.get(`/${locale}/submit`, authOptional, async (c) => {
    if (!c.var.user) {
      return c.html(submitSignInGate(locale));
    }
    return c.html(
      await submitPage(
        c.env.DB,
        locale,
        { fork: c.req.query("fork"), edit: c.req.query("edit") },
        c.var.user,
      ),
    );
  });

  app.get(`/${locale}/me`, authOptional, async (c) => {
    if (!c.var.user) {
      return c.redirect("/auth/login");
    }
    return c.html(await mePage(c.env.DB, locale, c.var.user));
  });

  app.get(`/${locale}/admin`, authOptional, async (c) => {
    if (!c.var.user || !isAdminEmail(c.var.user.email, c.env)) {
      return c.text("forbidden", 403);
    }
    return c.html(await adminPage(c.env.DB, locale, c.var.user));
  });
}

export default app;
