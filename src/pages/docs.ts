// Bilingual documentation site under /{locale}/docs — a hand-drawn doc area in
// the leeguoo.com / chrome-use docs visual system (see src/docs/docs.css).
// Covers both the chatgpt-imagegen CLI tool and the drawstyle platform.
import { DOCS_CSS } from "../docs/assets";
import { swapLocale, type Locale } from "../i18n";
import { escapeHtml } from "./layout";

const SITE = "https://drawstyle.leeguoo.com";

type L<T> = Record<Locale, T>;

interface NavItem {
  slug: string; // "" is the overview at /{locale}/docs
  title: L<string>;
  ico: string;
}
interface NavGroup {
  label: L<string>;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: { en: "Start", zh: "开始" },
    items: [{ slug: "", title: { en: "Overview", zh: "概览" }, ico: "◆" }],
  },
  {
    label: { en: "CLI tool", zh: "命令行工具" },
    items: [
      { slug: "install", title: { en: "Install", zh: "安装" }, ico: "⤓" },
      { slug: "generate", title: { en: "Generate images", zh: "生成图片" }, ico: "✦" },
      { slug: "styles", title: { en: "Style system", zh: "风格系统" }, ico: "✎" },
      { slug: "community", title: { en: "Using gallery styles", zh: "用画廊的风格" }, ico: "☁" },
      { slug: "backends", title: { en: "Backends & troubleshooting", zh: "后端与排错" }, ico: "⚙" },
    ],
  },
  {
    label: { en: "drawstyle platform", zh: "drawstyle 平台" },
    items: [
      { slug: "platform", title: { en: "What it is", zh: "平台是什么" }, ico: "❖" },
      { slug: "submit", title: { en: "Submit & review", zh: "投稿与审核" }, ico: "✉" },
      { slug: "api", title: { en: "API for AI", zh: "面向 AI 的接口" }, ico: "⌁" },
    ],
  },
];

const CHROME: L<{ docsLabel: string; back: string; madeBy: string; blog: string }> = {
  en: { docsLabel: "docs", back: "← Gallery", madeBy: "by", blog: "Blog" },
  zh: { docsLabel: "文档", back: "← 回画廊", madeBy: "由", blog: "博客" },
};

// ── du- component helpers ───────────────────────────────────────────────────

const eyebrow = (text: string) => `<p class="du-eyebrow">${escapeHtml(text)}</p>`;
const lede = (html: string) => `<p class="du-lede">${html}</p>`;
const divider = `<hr class="du-divider" />`;
const mark = (s: string) => `<span class="mark">${escapeHtml(s)}</span>`;
const cmd = (s: string) => `<code>${escapeHtml(s)}</code>`;

/** A terminal-style code block. `# ` → comment, `$ ` → green prompt. */
function code(name: string, lines: string[]): string {
  const body = lines
    .map((line) => {
      if (line.startsWith("# ")) return `<span class="du-cmt">${escapeHtml(line)}</span>`;
      if (line.startsWith("$ ")) return `<span class="du-prompt">$</span> ${escapeHtml(line.slice(2))}`;
      return escapeHtml(line);
    })
    .join("\n");
  return `<div class="du-code"><div class="du-code-head"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="du-code-name">${escapeHtml(name)}</span></div><pre><code>${body}</code></pre></div>`;
}

function callout(kind: "tip" | "note" | "warn", title: string, html: string): string {
  return `<div class="du-callout ${kind}"><div class="du-callout-title">${escapeHtml(title)}</div><div>${html}</div></div>`;
}

function cards(locale: Locale, items: { slug: string; title: string; ico: string; body: string; external?: string }[]): string {
  const cols = items.length % 3 === 0 ? " cols-3" : "";
  const inner = items
    .map((it) => {
      const href = it.external ?? (it.slug ? `/${locale}/docs/${it.slug}` : `/${locale}/docs`);
      return `<a class="du-card" href="${escapeHtml(href)}"><div class="du-card-title"><span class="du-card-ico">${it.ico}</span>${escapeHtml(it.title)}</div><p>${it.body}</p></a>`;
    })
    .join("");
  return `<div class="du-cards${cols}">${inner}</div>`;
}

// ── page content ────────────────────────────────────────────────────────────

interface DocPage {
  title: string;
  eyebrow: string;
  body: string;
}

function pages(locale: Locale): Record<string, DocPage> {
  const zh = locale === "zh";
  const c = (en: string, cn: string) => (zh ? cn : en);
  return {
    "": {
      title: c("Overview", "概览"),
      eyebrow: c("drawstyle docs", "drawstyle 文档"),
      body:
        lede(
          c(
            `One tool + one community that make AI image-generation <b>styles</b> reusable and shareable. ${mark(
              "chatgpt-imagegen",
            )} is a local image CLI; ${mark("drawstyle.leeguoo.com")} is a public gallery of shared art styles.`,
            `一个工具 + 一个社区,让 AI 绘图的<b>画风</b>可复用、可分享。${mark(
              "chatgpt-imagegen",
            )} 是本地命令行生图工具,${mark("drawstyle.leeguoo.com")} 是大家共享画风的画廊。`,
          ),
        ) +
        code("terminal", [
          c("# see a style you like? generate with it in one line (nothing saved)", "# 在画廊看到喜欢的风格,一条命令直接生图(不落盘)"),
          c('$ chatgpt-imagegen "a cat coding at a laptop" --style-online xiaohei', '$ chatgpt-imagegen "一只在敲代码的猫" --style-online xiaohei'),
        ]) +
        callout(
          "tip",
          c("In two lines", "两句话说清"),
          c(
            `The <b>tool</b> generates with your ChatGPT subscription — no API key. The <b>platform</b> lets you publish a style you tuned so others (and future you) can <code>style pull</code> it in one command.`,
            `<b>工具</b>用你的 ChatGPT 订阅生图,不需要 API key;<b>平台</b>让你把调好的画风投稿出去,别人(和未来的你)一条 <code>style pull</code> 就能复用。`,
          ),
        ) +
        divider +
        `<h2>${c("Start here", "从这里开始")}</h2>` +
        cards(locale, [
          { slug: "install", title: c("Install the tool", "安装工具"), ico: "⤓", body: c("Get chatgpt-imagegen in one line.", "一行命令装好 chatgpt-imagegen。") },
          { slug: "generate", title: c("Generate an image", "生成第一张图"), ico: "✦", body: c("Basics, sizes, reference images.", "基本用法、尺寸、参考图。") },
          { slug: "community", title: c("Use gallery styles", "用画廊的风格"), ico: "☁", body: c(`${cmd("--style-online")} to generate directly.`, `${cmd("--style-online")} 直接生图。`) },
          { slug: "platform", title: c("About the platform", "了解平台"), ico: "❖", body: c("What drawstyle is, how to browse.", "drawstyle 是什么、怎么逛。") },
          { slug: "submit", title: c("Submit a style", "投稿画风"), ico: "✉", body: c("Share a good style to the gallery.", "把好风格分享到画廊。") },
          { slug: "api", title: c("API for AI", "给 AI 的接口"), ico: "⌁", body: c("Public read API and llms.txt.", "公开只读 API 与 llms.txt。") },
        ]),
    },

    install: {
      title: c("Install", "安装"),
      eyebrow: c("CLI tool", "命令行工具"),
      body:
        lede(
          c(
            `${mark("chatgpt-imagegen")} is a single-file Python CLI that generates with your signed-in ChatGPT — <b>no OPENAI_API_KEY</b>.`,
            `${mark("chatgpt-imagegen")} 是一个单文件 Python 命令行工具,用你已登录的 ChatGPT 生图,<b>不需要 OPENAI_API_KEY</b>。`,
          ),
        ) +
        `<h2>${c("Install", "安装")}</h2>` +
        code("terminal", [
          c("# one line from GitHub (recommended)", "# 从 GitHub 一行装好(推荐)"),
          "$ curl -fsSL https://raw.githubusercontent.com/leeguooooo/chatgpt-imagegen/main/install.sh | sh",
          "",
          c("# or install as an agent skill", "# 或作为 agent skill 安装"),
          "$ npx skills add leeguooooo/chatgpt-imagegen -g",
        ]) +
        callout(
          "note",
          c("Two backends", "两个后端"),
          c(
            `The default <b>web</b> backend drives your logged-in ChatGPT browser and spends no Codex-usage; <b>codex</b> is a headless fallback that bills Codex-usage. Run <code>chatgpt-imagegen doctor</code> to check what's ready.`,
            `默认 <b>web</b> 后端驱动你登录着的 ChatGPT 浏览器,不消耗 Codex 用量;<b>codex</b> 是无浏览器兜底,会走 Codex 用量。装好后 <code>chatgpt-imagegen doctor</code> 自检。`,
          ),
        ) +
        divider +
        cards(locale, [
          { slug: "generate", title: c("Generate images", "生成图片"), ico: "✦", body: c("Start generating.", "开始生图。") },
          { slug: "backends", title: c("Backends & troubleshooting", "后端与排错"), ico: "⚙", body: c("web/codex and common issues.", "web/codex 与常见问题。") },
        ]),
    },

    generate: {
      title: c("Generate images", "生成图片"),
      eyebrow: c("CLI tool", "命令行工具"),
      body:
        lede(c(`Hand the tool a prompt, get a bitmap. Size, format and reference images are all optional.`, `把提示词交给工具,得到一张位图。尺寸、格式、参考图都可选。`)) +
        code("terminal", [
          c("# simplest", "# 最简单"),
          c('$ chatgpt-imagegen "an orange cat on a windowsill, watercolor"', '$ chatgpt-imagegen "一只坐在窗台的橘猫,水彩风"'),
          "",
          c("# size, format and output path", "# 指定尺寸与格式,并指定输出路径"),
          '$ chatgpt-imagegen "minimal tech poster" --size 1536x1024 --format png -o poster.png',
        ]) +
        callout("tip", c("Sizes", "尺寸"), c(`Common: <code>1024x1024</code> (square), <code>1536x1024</code> (landscape), <code>1024x1536</code> (portrait). Up to 4 reference images per run.`, `常用 <code>1024x1024</code>(方)、<code>1536x1024</code>(横)、<code>1024x1536</code>(竖)。一次最多附 4 张参考图。`)) +
        `<h2>${c("Image-to-image (editing)", "图生图(改图)")}</h2>` +
        `<p>${c(`Pass a reference with <code>-i</code> / <code>--ref</code> to <b>edit it</b> instead of generating from text — like dragging an image into the ChatGPT composer and asking for a restyle. Both backends support it; references are local paths or <code>http(s)</code> URLs, repeat <code>-i</code> for several.`, `用 <code>-i</code> / <code>--ref</code> 传一张参考图,就变成<b>改图</b>而不是从文字生成——等同于把图拖进 ChatGPT 对话框让它改风格。两个后端都支持,参考图可以是本地路径或 <code>http(s)</code> URL,重复 <code>-i</code> 传多张。`)}</p>` +
        code("terminal", [c('$ chatgpt-imagegen "warm golden-hour photo, cinematic 35mm" -i photo.jpg -o out.png', '$ chatgpt-imagegen "改成暖调黄昏、电影感 35mm" -i photo.jpg -o out.png')]) +
        `<h2>${c("Common flags", "常用参数")}</h2>` +
        `<p><code>--backend auto|web|codex</code> · <code>-o PATH</code> · <code>--size</code> · <code>--format png|jpeg|webp</code> · <code>-i/--ref</code> · <code>--style NAME</code> · <code>--quiet</code>. ${c("Full list:", "完整列表:")} <code>chatgpt-imagegen --help</code>.</p>` +
        divider +
        cards(locale, [
          { slug: "styles", title: c("Style system", "风格系统"), ico: "✎", body: c("Pin a look once, reuse it.", "把画风钉一次,反复用。") },
          { slug: "community", title: c("Use gallery styles", "用画廊的风格"), ico: "☁", body: c("Use styles others tuned.", "直接用别人调好的画风。") },
          { slug: "backends", title: c("Backends & troubleshooting", "后端与排错"), ico: "⚙", body: c("web/codex and issues.", "web/codex 与常见问题。") },
        ]),
    },

    styles: {
      title: c("Style system", "风格系统"),
      eyebrow: c("CLI tool", "命令行工具"),
      body:
        lede(c(`A <b>style (asset)</b> is a reusable look applied with <code>--style NAME</code> — a text snippet <b>and/or</b> pinned reference images. Pin once, and never re-pass <code>--ref</code> again.`, `<b>风格(资产)</b>是可复用的「外观」,用 <code>--style NAME</code> 套用——一段文字片段<b>和/或</b>钉住的参考图。钉一次,以后无需每次再传 <code>--ref</code>。`)) +
        code("terminal", [
          c("# a text-only style", "# 定义一个纯文字风格"),
          c('$ chatgpt-imagegen style add brand "flat vector, bold shapes, teal accent, white bg"', '$ chatgpt-imagegen style add brand "扁平矢量,大色块,青色点缀,白底"'),
          "",
          c("# pin a recurring character (a few angles = more consistent)", "# 钉一个固定角色(几张不同角度更稳)"),
          c('$ chatgpt-imagegen style add pip "a round orange fox" --kind character --ref a.png --ref b.png', '$ chatgpt-imagegen style add pip "一只圆滚滚的橘色狐狸" --kind character --ref a.png --ref b.png'),
          "",
          c("# stack: same fox, brand look", "# 叠加:同一只狐狸 + 品牌画风"),
          c('$ chatgpt-imagegen "Pip ordering coffee" --style pip --style brand', '$ chatgpt-imagegen "Pip 在点咖啡" --style pip --style brand'),
        ]) +
        callout("note", c("Two kinds", "两种 kind"), c(`<code>--kind style</code> matches an aesthetic without copying content; <code>--kind character</code> reproduces a fixed subject (your mascot). <code>--style</code> is repeatable, so a character and a look stack.`, `<code>--kind style</code> 学画风、不抄内容;<code>--kind character</code> 还原一个固定主体(你的吉祥物/角色)。<code>--style</code> 可重复,于是角色和画风能叠加。`)) +
        `<p>${c(`Three built-ins ship: <code>doodle</code>, <code>xiaohei</code> (Ian's hand-drawn explainer), <code>snoopy</code> (Peanuts comic). Manage with <code>style list / show / rm / use / reset</code>; stored in <code>~/.config/chatgpt-imagegen/styles.json</code>.`, `内置三个风格:<code>doodle</code>、<code>xiaohei</code>(小黑手绘讲解)、<code>snoopy</code>(Peanuts 报纸漫画)。用 <code>style list / show / rm / use / reset</code> 管理,存在 <code>~/.config/chatgpt-imagegen/styles.json</code>。`)}</p>` +
        divider +
        cards(locale, [
          { slug: "community", title: c("Use gallery styles", "用画廊的风格"), ico: "☁", body: c("Pull more from the community.", "从社区拉更多风格。") },
          { slug: "submit", title: c("Submit a style", "投稿画风"), ico: "✉", body: c("Share yours.", "把你的风格分享出去。") },
        ]),
    },

    community: {
      title: c("Using gallery styles", "用画廊的风格"),
      eyebrow: c("CLI tool", "命令行工具"),
      body:
        lede(c(`The gallery at ${mark("drawstyle.leeguoo.com")} holds styles everyone shares. No script update needed — search and use them straight from the CLI.`, `画廊在 ${mark("drawstyle.leeguoo.com")},里面是大家共享的画风。不用改脚本、不用等更新,命令行直接搜、直接用。`)) +
        code("terminal", [
          c("# search the gallery", "# 搜索画廊"),
          c('$ chatgpt-imagegen style search "watercolor mascot" --category avatar-ip', '$ chatgpt-imagegen style search "水彩 吉祥物" --category avatar-ip'),
          "",
          c("# fastest: generate with a gallery style, nothing saved locally", "# 最快:直接用画廊风格生图,本地不落盘"),
          c('$ chatgpt-imagegen "a fox barista" --style-online pip', '$ chatgpt-imagegen "一只狐狸咖啡师" --style-online pip'),
          "",
          c("# or pull it locally to reuse offline", "# 或拉到本地,之后离线反复用"),
          "$ chatgpt-imagegen style pull pip --as pip2",
        ]) +
        callout("tip", c("--style-online is the fastest path", "--style-online 是最快的路"), c(`It fetches that style's snippet and reference images on demand, uses them for this one generation, and writes nothing to your local library. Perfect for see-it-use-it.`, `它按需拉取那个风格的文字片段和参考图,只用于这一次生成,什么都不写进本地库。适合「看到就想用」的场景。`)) +
        callout("note", c("Do I need to log in?", "要不要登录?"), c(`<b>No</b> — <code>style search</code>, <code>style pull</code> and <code>--style-online</code> need no login. Only <b>publishing</b> (<code>style publish</code>) needs a one-time browser login.`, `<b>不用</b>——<code>style search</code>、<code>style pull</code>、<code>--style-online</code> 都无需登录。只有<b>投稿</b>(<code>style publish</code>)需要一次浏览器登录。`)) +
        divider +
        cards(locale, [
          { slug: "submit", title: c("Submit a style", "投稿画风"), ico: "✉", body: c("Share a good style.", "把好风格分享到画廊。") },
          { slug: "platform", title: c("About the platform", "平台是什么"), ico: "❖", body: c("Learn about drawstyle.", "了解 drawstyle。") },
        ]),
    },

    backends: {
      title: c("Backends & troubleshooting", "后端与排错"),
      eyebrow: c("CLI tool", "命令行工具"),
      body:
        lede(c(`One subscription meters two buckets; which you spend depends on <b>where</b> the image is made. The default <code>auto</code> prefers sparing Codex-usage.`, `同一个订阅有两个计量桶,生图走哪个取决于图<b>在哪生成</b>。默认 <code>auto</code> 优先省 Codex 用量。`)) +
        `<h2>${c("Two backends", "两个后端")}</h2>` +
        `<ul>` +
        `<li>${c(`<b>web</b> (default, no Codex-usage) — drives your logged-in ChatGPT browser like a normal chat, deleted afterwards. Needs a signed-in Chrome + <a href="https://github.com/leeguooooo/chrome-use">chrome-use</a>.`, `<b>web</b>(默认,不花 Codex 用量)——驱动你登录着的 ChatGPT 浏览器,像普通对话一样生图、事后删除。需要一个登录态 Chrome + <a href="https://github.com/leeguooooo/chrome-use">chrome-use</a>。`)}</li>` +
        `<li>${c(`<b>codex</b> (fallback, bills Codex-usage) — headless POST to the Codex endpoint. Needs <code>codex login</code>.`, `<b>codex</b>(兜底,计 Codex 用量)——无浏览器,直接 POST 到 Codex 接口。需要 <code>codex login</code>。`)}</li>` +
        `</ul>` +
        `<p>${c(`<code>auto</code> uses web when a logged-in browser is reachable, else falls back to codex — a laptop with Chrome open uses web, a headless server uses codex. Force with <code>--backend web/codex</code>.`, `<code>auto</code> 有登录浏览器就用 web、否则回落 codex——笔记本开着 Chrome 走 web,无头服务器走 codex,自动切换。也可 <code>--backend web/codex</code> 强制。`)}</p>` +
        callout("warn", c("“Signed in, but it says no browser available”", "「已登录却说没有可用浏览器」"), c(`Run <code>chatgpt-imagegen doctor</code> first to see which backend is ready. web reaches a browser two ways: <b>relay</b> (your already-open Chrome — needs the chrome-use extension connected) and <b>profile launch</b> (copies a logged-in profile into its own window). Fixes: ① <code>chrome-use extension install</code> and connect the relay (best, no Codex-usage); ② fully quit Chrome and rerun; ③ <code>--backend codex</code> as a headless fallback.`, `先跑 <code>chatgpt-imagegen doctor</code> 看哪个后端就绪。web 够到浏览器有两条路:<b>relay</b>(你已开着的 Chrome,需装 chrome-use 扩展并连接)和<b>profile 启动</b>(复制登录态另开窗口)。修法:①<code>chrome-use extension install</code> 装扩展连 relay(最佳,不花 Codex 用量);②完全退出 Chrome 再重跑;③<code>--backend codex</code> 无头兜底。`)) +
        `<h2>${c("Concurrency", "并发")}</h2>` +
        `<p>${c(`web runs <b>serialized</b> (1 at a time — shared Chrome, hard page rate-limit); codex runs up to <b>4</b> in parallel. Firing more is safe — excess queues. Quota is shared with the ChatGPT app; don't sustain &gt;10 images/min.`, `web <b>串行</b>(1 张,共享同一个 Chrome、页面限流严);codex 最多 <b>4</b> 并行。多发安全——超出的排队。配额和 ChatGPT app 共享,别持续 &gt;10 张/分钟。`)}</p>` +
        `<h2>${c("When NOT to use this", "什么时候别用这个工具")}</h2>` +
        `<p>${c(`For true <code>quality=high</code>, native transparent backgrounds, deterministic per-call billing, a <b>public-facing service</b> (powering one with a personal subscription violates OpenAI's ToS), or sustained high volume — use the official <code>/v1/images/generations</code> API with an <code>OPENAI_API_KEY</code>.`, `需要真正的 <code>quality=high</code>、原生透明背景、可传给客户的<b>按次计费</b>、对外<b>公开服务</b>(用个人订阅供公开服务违反 OpenAI ToS)、或持续高频批量时——请改用官方 <code>/v1/images/generations</code> API(带 <code>OPENAI_API_KEY</code>)。`)}</p>` +
        divider +
        cards(locale, [
          { slug: "install", title: c("Install", "安装"), ico: "⤓", body: c("Set up a backend.", "装好两个后端之一。") },
          { slug: "", external: c("https://blog.leeguoo.com/en/posts/chatgpt-imagegen/", "https://blog.leeguoo.com/zh/posts/chatgpt-imagegen/"), title: c("Deep dive (blog)", "原理深入(博客)"), ico: "✦", body: c("web/codex flow, the Turnstile gate.", "web/codex 流程、Turnstile 门。") },
        ]),
    },

    platform: {
      title: c("What it is", "平台是什么"),
      eyebrow: c("drawstyle platform", "drawstyle 平台"),
      body:
        lede(c(`${mark("drawstyle")} is a community gallery of art styles for AI image generation. Each "style" bundles a prompt snippet, example images and optional reference images — consumable from the CLI in one command.`, `${mark("drawstyle")} 是面向 AI 绘图的社区画风画廊。每个「风格」打包了 prompt 片段、示例图、可选参考图,一条命令就能被命令行工具消费。`)) +
        `<h2>${c("How to browse", "怎么逛")}</h2>` +
        `<p>${c(`The homepage filters by <b>use-case category</b> (business report / tech explainer / cute / retro comic …) and <b>aesthetic tags</b>. Each card gives a copy-paste one-line generate command; the detail page has a big image, copyable commands, likes, forks and comments.`, `首页按<b>用途分类</b>(领导汇报 / 技术图解 / 可爱治愈 / 复古漫画 …)和<b>美学标签</b>筛选。每张卡片直接给出可复制的一行生图命令;点进详情能看大图、复制命令、点赞、复刻、评论。`)}</p>` +
        callout("tip", c("Login", "登录"), c(`One-tap login via account.leeguoo.com (Google / GitHub). Login is needed to submit, like or comment; browsing and pulling need no login.`, `通过 account.leeguoo.com 一键登录(支持 Google / GitHub)。登录后才能投稿、点赞、评论;浏览与拉取无需登录。`)) +
        `<h2>${c("A style's lifecycle", "一个风格的生命周期")}</h2>` +
        `<p>${c(`Submit → enters the <b>review queue</b> → an admin approves → <b>published</b> to the public gallery → everyone <code>pull</code>s / <code>--style-online</code>s it → likes, comments, forks.`, `投稿 → 进<b>审核队列</b> → 管理员通过后<b>上架</b>到公开画廊 → 大家 <code>pull</code> / <code>--style-online</code> 使用 → 点赞、评论、复刻。`)}</p>` +
        divider +
        cards(locale, [
          { slug: "submit", title: c("Submit & review", "投稿与审核"), ico: "✉", body: c("How to get a style in.", "怎么把风格投上去。") },
          { slug: "api", title: c("API for AI", "面向 AI 的接口"), ico: "⌁", body: c("Public read API.", "公开只读 API。") },
        ]),
    },

    submit: {
      title: c("Submit & review", "投稿与审核"),
      eyebrow: c("drawstyle platform", "drawstyle 平台"),
      body:
        lede(c(`Tuned a nice style? Share it to the gallery so others (and future you) can reuse it in one command.`, `调好一个不错的风格?分享到画廊,别人(和未来的你)就能一键复用。`)) +
        `<h2>${c("From the CLI (easiest)", "从命令行投稿(最方便)")}</h2>` +
        code("terminal", [
          c("# one command: the most recent generation becomes the example image", "# 一条命令:自动把最近生成的图当示例图"),
          "$ chatgpt-imagegen style publish mystyle --category cute --from-last",
        ]) +
        `<p>${c(`It prints a summary before uploading and opens a browser login when needed (once — the token is cached). On success it gives a link to track approval.`, `它会在投稿前打印一份摘要,并在需要时打开浏览器登录(登录一次、令牌本地缓存)。成功后给出一个链接,可跟踪审核状态。`)}</p>` +
        `<h2>${c("From the web", "从网页投稿")}</h2>` +
        `<p>${c(`Logged in, go to <code>/submit</code>: fill slug, name, category, tags, prompt snippet, and <b>drag example images into the hand-drawn dropzone</b> (1–3, previewable, removable). Reference images optional (≤4).`, `登录后到 <code>/submit</code>:填标识符、名称、分类、标签、prompt 片段,把示例图<b>拖到手绘风拖拽区</b>(1–3 张,可预览可删)。参考图可选(≤4 张)。`)}</p>` +
        callout("note", c("Review", "审核"), c(`Every submission enters a <b>review queue</b>; it goes public only after an admin approves — the first anti-abuse gate. You can see each submission's status (pending / approved / rejected) in "Mine".`, `所有投稿先进<b>待审队列</b>,管理员通过后才公开。这也是第一道防滥用闸门。你能在「我的」里看到自己每条投稿的状态(待审核 / 已上架 / 已驳回)。`)) +
        callout("warn", c("Example image required", "示例图必填"), c(`The gallery shows a style by its example image, so a submission needs at least one. When the CLI is missing images it points you at <code>--from-last</code> or <code>--example</code>.`, `画廊靠示例图展示效果,所以投稿至少要 1 张示例图。命令行缺图时会提示你用 <code>--from-last</code> 或 <code>--example</code>。`)) +
        divider +
        cards(locale, [
          { slug: "community", title: c("Use gallery styles", "用画廊的风格"), ico: "☁", body: c("The other way round.", "反过来:怎么用别人的。") },
          { slug: "api", title: c("API for AI", "面向 AI 的接口"), ico: "⌁", body: c("Programmatic access.", "程序化访问。") },
        ]),
    },

    api: {
      title: c("API for AI", "面向 AI 的接口"),
      eyebrow: c("drawstyle platform", "drawstyle 平台"),
      body:
        lede(c(`drawstyle is AI-agent friendly: a public read API + an <code>llms.txt</code>, so tools and search engines can understand and consume it.`, `drawstyle 对 AI agent 友好:公开只读 API + 一份 <code>llms.txt</code>,让工具和搜索引擎都能理解、消费。`)) +
        `<h2>${c("Public read API (no login)", "公开只读接口(无需登录)")}</h2>` +
        code("http", [
          c("# list / search (category, tag, q, sort)", "# 列表 / 搜索(支持 category、tag、q、sort)"),
          "$ curl https://drawstyle.leeguoo.com/api/styles",
          "",
          c("# one style's detail", "# 单个风格详情"),
          "$ curl https://drawstyle.leeguoo.com/api/styles/xiaohei",
          "",
          c("# the pull package: snippet + version + reference image URLs", "# 拉取包(命令行 pull 用的就是它):片段 + 版本 + 参考图 URL"),
          "$ curl https://drawstyle.leeguoo.com/api/styles/xiaohei/package",
        ]) +
        callout("tip", "GEO", c(`<code>https://drawstyle.leeguoo.com/llms.txt</code> describes, in plain language, what the platform is, its endpoints, and how to pull from the CLI — generative-engine optimization.`, `<code>https://drawstyle.leeguoo.com/llms.txt</code> 用自然语言说明了平台是什么、有哪些接口、以及怎么用命令行拉取——面向生成式搜索引擎优化。`)) +
        `<h2>${c("How the CLI connects", "命令行如何对接")}</h2>` +
        `<p>${c(`<code>style search</code> hits <code>/api/styles</code>; <code>pull</code> and <code>--style-online</code> hit <code>/package</code> for the snippet and reference images. All read-only, no auth.`, `<code>style search</code> 打 <code>/api/styles</code>;<code>pull</code> 和 <code>--style-online</code> 打 <code>/package</code> 拿到片段和参考图。全部只读、无需鉴权。`)}</p>` +
        divider +
        cards(locale, [
          { slug: "community", title: c("Use gallery styles", "用画廊的风格"), ico: "☁", body: c("The CLI side.", "命令行侧的用法。") },
          { slug: "", title: c("Back to overview", "回到概览"), ico: "◆", body: c("Docs home.", "文档首页。") },
        ]),
    },
  };
}

// ── shell + render ──────────────────────────────────────────────────────────

function sidebar(locale: Locale, activeSlug: string): string {
  const groups = NAV.map((g) => {
    const items = g.items
      .map((it) => {
        const href = it.slug ? `/${locale}/docs/${it.slug}` : `/${locale}/docs`;
        const active = it.slug === activeSlug ? " active" : "";
        return `<a class="du-nav-item${active}" href="${href}"><span class="du-nav-ico">${it.ico}</span><span class="du-nav-text">${escapeHtml(it.title[locale])}</span></a>`;
      })
      .join("");
    return `<div class="du-nav-group"><div class="du-nav-label">${escapeHtml(g.label[locale])}</div>${items}</div>`;
  }).join("");
  return `<nav class="du-sidebar" id="du-sidebar">${groups}</nav>`;
}

function shell(locale: Locale, slug: string, page: DocPage): string {
  const chrome = CHROME[locale];
  const other: Locale = locale === "zh" ? "en" : "zh";
  const thisPath = slug ? `/${locale}/docs/${slug}` : `/${locale}/docs`;
  const switchHref = `/lang/${other}?to=${encodeURIComponent(swapLocale(thisPath, other))}`;
  const canonical = `${SITE}${thisPath}`;
  const zhUrl = `${SITE}${swapLocale(thisPath, "zh")}`;
  const enUrl = `${SITE}${swapLocale(thisPath, "en")}`;
  const pageTitle = `${page.title} · drawstyle ${chrome.docsLabel}`;
  const desc =
    locale === "zh"
      ? `${page.title} —— drawstyle 与 chatgpt-imagegen 的文档,由郭立 (leeguoo) 维护。`
      : `${page.title} — docs for drawstyle and chatgpt-imagegen, by 郭立 (Guo Li / leeguoo).`;
  return `<!doctype html>
<html lang="${locale === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta name="author" content="郭立 (Guo Li / Leo / leeguoo)">
  <link rel="canonical" href="${canonical}">
  <link rel="alternate" hreflang="zh" href="${zhUrl}">
  <link rel="alternate" hreflang="en" href="${enUrl}">
  <link rel="alternate" hreflang="x-default" href="${enUrl}">
  <meta name="theme-color" content="#fcfbf4">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="drawstyle">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:site" content="@leeguooooo">
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: page.title,
    inLanguage: locale === "zh" ? "zh-CN" : "en",
    url: canonical,
    isPartOf: { "@type": "WebSite", "@id": `${SITE}/#website`, name: "drawstyle" },
    author: {
      "@type": "Person",
      "@id": "https://leeguoo.com/about#person",
      name: "郭立",
      alternateName: ["Guo Li", "Leo", "leeguoo"],
      url: "https://leeguoo.com/about",
    },
    publisher: { "@type": "Organization", "@id": "https://leeguoo.com/#org", name: "leeguoo" },
  }).replace(/</g, "\\u003c")}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&family=Permanent+Marker&family=Noto+Sans+SC:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap">
  <link rel="stylesheet" href="/docs/docs.css">
  <script src="https://blog.leeguoo.com/scripts/visitor-beacon.js" defer></script>
  <script>(function(){if(window.__lgPH)return;window.__lgPH=1;function start(){if(window.posthog&&window.posthog.__loaded)return;var done=false;function init(api){if(done||!window.posthog||!window.posthog.init)return;done=true;window.posthog.init('phc_P763fJAjFo1FFvtWdCzg1v0jhOYyYe57SS9pJ1Q31SL',{api_host:api,ui_host:'https://us.posthog.com',defaults:'2026-05-30',person_profiles:'identified_only',disable_session_recording:true,capture_pageview:true});}function load(base,api,fail){var s=document.createElement('script');s.async=true;s.crossOrigin='anonymous';s.src=base+'/static/array.js';var t=setTimeout(function(){if(!done&&fail){s.onerror=s.onload=null;fail();}},6000);s.onload=function(){clearTimeout(t);init(api);};s.onerror=function(){clearTimeout(t);if(!done&&fail)fail();};document.head.appendChild(s);}load('https://us-assets.i.posthog.com','https://us.i.posthog.com',function(){load('https://ph.leeguoo.com','https://ph.leeguoo.com',null);});}if('requestIdleCallback' in window){requestIdleCallback(start,{timeout:3000});}else{setTimeout(start,1500);}})();</script>
</head>
<body>
  <header class="du-topbar">
    <a class="du-brand" href="/${locale}/docs">drawstyle <span class="du-brand-sub">${escapeHtml(chrome.docsLabel)}</span></a>
    <div class="du-topbar-right">
      <a class="du-nav-item" href="${switchHref}">${locale === "zh" ? "EN" : "中文"}</a>
      <a class="du-nav-item" href="/${locale}/">${escapeHtml(chrome.back)}</a>
    </div>
  </header>
  <div class="du-shell">
    ${sidebar(locale, slug)}
    <main class="du-main">
      ${eyebrow(page.eyebrow)}
      <div class="du-title-row"><h1>${escapeHtml(page.title)}</h1></div>
      ${page.body}
      <hr class="du-divider" />
      <p style="color:var(--ink-faint);font-size:14px">${escapeHtml(chrome.madeBy)} <a href="https://leeguoo.com/" style="color:var(--blue)">郭立 · Guo Li · leeguoo</a> · <a href="https://blog.leeguoo.com/" style="color:var(--blue)">${escapeHtml(chrome.blog)}</a> · <a href="https://github.com/leeguooooo/drawstyle" style="color:var(--blue)">GitHub</a></p>
    </main>
  </div>
</body>
</html>`;
}

/** All docs slugs (""=overview) — for the sitemap. */
export const DOCS_SLUGS: string[] = Object.keys(pages("en"));

/** Render a docs page for a locale + slug ("" = overview), or null if unknown. */
export function renderDocsPage(locale: Locale, slug: string): string | null {
  const page = pages(locale)[slug];
  if (!page) return null;
  return shell(locale, slug, page);
}

export function docsCss(): string {
  return DOCS_CSS;
}
