import type { UserRow } from "../db";
import { htmlLang, swapLocale, t, type Locale } from "../i18n";
import { buildHead } from "./head";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface PageOptions {
  locale: Locale;
  // Localized path of this page (begins with /zh or /en); drives canonical,
  // hreflang and the language switcher.
  path: string;
  title: string;
  description: string;
  body: string;
  user?: UserRow;
  ogImage?: string;
  jsonLd?: unknown[];
}

export function page(opts: PageOptions): string {
  const { locale, path, title, description, body, user, ogImage, jsonLd } = opts;
  const d = t(locale);
  const other: Locale = locale === "zh" ? "en" : "zh";
  const switchHref = `/lang/${other}?to=${encodeURIComponent(swapLocale(path, other))}`;
  const home = `/${locale}/`;
  return `<!doctype html>
<html lang="${htmlLang(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${buildHead({ locale, path, title, description, ogImage, jsonLd })}
  <style>
    :root { --fg:#17202a; --muted:#667085; --bg:#f7f8fa; --panel:#ffffff; --border:#d9dee7; --accent:#2563eb; --danger:#b42318; }
    @media (prefers-color-scheme: dark) { :root { --fg:#edf2f7; --muted:#aab4c2; --bg:#111418; --panel:#181d24; --border:#303846; --accent:#6ea8ff; --danger:#ff8a80; } }
    * { box-sizing: border-box; }
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif; background:var(--bg); color:var(--fg); }
    header { border-bottom:1px solid var(--border); background:var(--panel); }
    nav { max-width:1120px; margin:0 auto; padding:14px 20px; display:flex; gap:18px; align-items:center; justify-content:space-between; }
    nav a { color:var(--fg); text-decoration:none; font-weight:600; }
    nav .links { display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
    main { max-width:1120px; margin:0 auto; padding:24px 20px 56px; }
    h1 { font-size:28px; line-height:1.2; margin:0 0 18px; }
    h2 { font-size:18px; margin:28px 0 12px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:14px; }
    .card { border:1px solid var(--border); background:var(--panel); border-radius:8px; padding:14px; }
    .muted { color:var(--muted); }
    .badge { display:inline-block; border:1px solid var(--border); border-radius:999px; padding:2px 8px; color:var(--muted); font-size:12px; }
    img { max-width:100%; border-radius:6px; border:1px solid var(--border); }
    pre { overflow:auto; background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:12px; }
    label { display:block; font-weight:600; margin:12px 0 6px; }
    input, textarea, select { width:100%; border:1px solid var(--border); border-radius:6px; padding:9px 10px; background:var(--panel); color:var(--fg); }
    textarea { min-height:120px; }
    button, .button { display:inline-flex; align-items:center; justify-content:center; gap:6px; border:1px solid var(--accent); color:white; background:var(--accent); border-radius:6px; padding:8px 12px; cursor:pointer; text-decoration:none; font-weight:600; }
    button.secondary, .button.secondary { color:var(--fg); background:transparent; border-color:var(--border); }
    button.danger { background:var(--danger); border-color:var(--danger); }
    form { margin:0; }
  </style>
  <script src="https://blog.leeguoo.com/scripts/visitor-beacon.js" defer></script>
</head>
<body>
  <header>
    <nav>
      <a href="${home}">${escapeHtml(d.brand)}</a>
      <div class="links">
        <a href="/${locale}/submit">${escapeHtml(d.navSubmit)}</a>
        <a href="/${locale}/me">${escapeHtml(d.navMe)}</a>
        <a href="/${locale}/admin">${escapeHtml(d.navAdmin)}</a>
        <a href="${switchHref}">${escapeHtml(d.langSwitch)}</a>
        ${user ? `<span class="muted">${escapeHtml(user.display_name)}</span><a href="/auth/logout">${escapeHtml(d.navLogout)}</a>` : `<a href="/auth/login">${escapeHtml(d.navLogin)}</a>`}
      </div>
    </nav>
  </header>
  <main>${body}</main>
  <script>
    document.addEventListener('submit', async (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.dataset.fetch) return;
      event.preventDefault();
      const res = await fetch(form.action, {
        method: form.dataset.method || form.method || 'POST',
        body: new FormData(form),
        headers: {'X-Requested-With': 'drawstyle'}
      });
      if (res.ok) location.href = form.dataset.done || location.href;
      else alert((await res.text()).slice(0, 500));
    });
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const res = await fetch(button.dataset.action, {method: button.dataset.method || 'POST', headers:{'X-Requested-With':'drawstyle'}});
      if (res.ok) location.reload();
      else alert((await res.text()).slice(0, 500));
    });
  </script>
</body>
</html>`;
}
