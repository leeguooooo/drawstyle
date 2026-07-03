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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&family=Permanent+Marker&family=Noto+Sans+SC:wght@400;500;700&display=swap">
  <style>
    /* leeguoo.com hand-drawn design language: paper background, ink lines,
       wobbly borders, sketch shadows. Display fonts on headings only. */
    :root {
      --paper:#fcfbf4; --ink:#1a1a1a; --panel:#ffffff;
      /* --accent is the brand red for FILLS + large display text; --accent-text
         is a darkened red that passes WCAG AA for normal-size text on paper. */
      --accent:#ff5447; --accent-text:#d0372b; --accent-2:#3462d8; --ok:#36a85b; --danger:#c4321f;
      --muted:#6f6d62;
      --paper-tint:#f6f4e8; --shadow:rgba(26,26,26,.12); --card-pad:16px;
      --font-body:'Noto Sans SC',-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
      --font-display:'ZCOOL KuaiLe',"PingFang SC","Microsoft YaHei",cursive,sans-serif;
      --font-marker:'Permanent Marker','ZCOOL KuaiLe',"PingFang SC",cursive,sans-serif;
      --font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    }
    @media (prefers-color-scheme: dark) {
      /* Blackboard variant: same hand, chalk-colored lines. */
      :root {
        --paper:#161512; --ink:#f0eee6; --panel:#211f1a;
        --accent:#ff6a5e; --accent-text:#ff6a5e; --accent-2:#7b9ff0; --ok:#4cc177; --danger:#d0402e;
        --muted:#a09d90;
        --paper-tint:#1c1a16; --shadow:rgba(0,0,0,.45);
      }
    }
    * { box-sizing: border-box; }
    body { margin:0; font-family:var(--font-body); background:var(--paper); color:var(--ink); line-height:1.6; }
    header { border-bottom:2px solid var(--ink); background:var(--panel); }
    nav { max-width:1120px; margin:0 auto; padding:14px 20px; display:flex; gap:18px; align-items:center; justify-content:space-between; }
    nav a { color:var(--ink); text-decoration:none; font-weight:600; }
    nav a:hover { text-decoration:underline wavy var(--accent); text-underline-offset:4px; }
    nav .brand { font-family:var(--font-marker); font-weight:400; font-size:24px; color:var(--accent); letter-spacing:.5px; }
    nav .brand:hover { text-decoration:none; }
    nav .links { display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
    main { max-width:1120px; margin:0 auto; padding:28px 20px 64px; }
    h1 { font-family:var(--font-display); font-weight:400; font-size:32px; line-height:1.25; margin:0 0 18px; }
    h2 { font-family:var(--font-display); font-weight:400; font-size:22px; margin:28px 0 12px; }
    a { color:var(--accent-2); }
    .eyebrow { font-family:var(--font-marker); color:var(--accent-text); font-size:14px; letter-spacing:1px; text-transform:uppercase; margin:0 0 4px; display:flex; align-items:center; gap:8px; }
    .dot { display:inline-block; width:10px; height:10px; background:var(--ok); border-radius:55% 45% 60% 40%; filter:url(#rough); }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:18px; }
    .card { border:2px solid var(--ink); background:var(--panel); border-radius:14px 12px 15px 13px / 12px 15px 12px 14px; padding:var(--card-pad); box-shadow:3px 3px 0 var(--shadow); overflow:hidden; }
    .card:hover { box-shadow:4px 4px 0 var(--shadow); }
    .card h2 { margin:10px 0 8px; font-size:20px; }
    .card h2 a { color:var(--ink); text-decoration:none; }
    .card h2 a:hover { text-decoration:underline wavy var(--accent); text-underline-offset:4px; }
    .card p { margin:6px 0; }
    .card pre { font-size:12px; margin:10px 0 0; }
    /* Full-bleed to the card edges; .card's overflow:hidden clips the top corners. */
    .card-img { display:block; width:calc(100% + 2*var(--card-pad)); max-width:none; margin:calc(-1*var(--card-pad)) calc(-1*var(--card-pad)) 4px; border:0; border-bottom:2px solid var(--ink); border-radius:0; aspect-ratio:4/3; object-fit:cover; background:var(--paper-tint); }
    .muted { color:var(--muted); }
    .badge { display:inline-block; font-family:var(--font-marker); font-size:12px; letter-spacing:.5px; border:2px solid var(--ink); border-radius:10px 12px 11px 13px / 13px 10px 12px 11px; padding:1px 9px; color:var(--ink); background:var(--panel); text-decoration:none; }
    a.badge:hover { color:var(--accent-text); border-color:var(--accent); text-decoration:none; }
    img { max-width:100%; border:2px solid var(--ink); border-radius:13px 11px 14px 12px / 12px 14px 11px 13px; background:var(--panel); }
    pre { overflow:auto; font-family:var(--font-mono); font-size:13px; background:var(--paper-tint); border:2px solid var(--ink); border-radius:12px 14px 11px 13px / 14px 11px 13px 12px; padding:12px 14px; }
    code { font-family:var(--font-mono); }
    label { display:block; font-weight:600; margin:14px 0 6px; }
    input, textarea, select { width:100%; font-family:var(--font-body); font-size:15px; border:2px solid var(--ink); border-radius:11px 13px 12px 14px / 13px 11px 14px 12px; padding:9px 12px; background:var(--panel); color:var(--ink); }
    input:focus, textarea:focus, select:focus { border-color:var(--accent-2); outline:none; box-shadow:2px 2px 0 var(--shadow); }
    textarea { min-height:120px; }
    /* color deliberately NOT var(--ink): the red --accent fill stays warm in both themes,
       so the dark text is locked to keep AA contrast on it. Don't tokenize. */
    button, .button { display:inline-flex; align-items:center; justify-content:center; gap:6px; font-family:var(--font-body); font-size:15px; font-weight:700; border:2px solid var(--ink); color:#1a1a1a; background:var(--accent); border-radius:12px 14px 12px 15px / 14px 12px 15px 12px; padding:8px 16px; cursor:pointer; text-decoration:none; box-shadow:2px 2px 0 var(--shadow); }
    button:active, .button:active { transform:translate(2px,2px); box-shadow:none; }
    button.secondary, .button.secondary { color:var(--ink); background:var(--panel); }
    button.secondary:hover, .button.secondary:hover { background:var(--paper-tint); }
    /* #fff deliberately NOT var(--ink): --danger stays a deep red in both themes,
       so white text is locked to keep AA contrast on it. Don't tokenize. */
    button.danger { background:var(--danger); border-color:var(--ink); color:#fff; }
    a:focus-visible, button:focus-visible, .button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline:3px solid var(--accent-2); outline-offset:2px; }
    form { margin:0; }
  </style>
  <script src="https://blog.leeguoo.com/scripts/visitor-beacon.js" defer></script>
</head>
<body>
  <svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="2"/></filter></svg>
  <header>
    <nav>
      <a class="brand" href="${home}">${escapeHtml(d.brand)}</a>
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
