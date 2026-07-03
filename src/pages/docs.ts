// Documentation site at /docs — a standalone hand-drawn doc area (zh-CN) in the
// leeguoo.com / chrome-use docs visual system (see src/docs/docs.css). Covers
// both the chatgpt-imagegen CLI tool and the drawstyle platform.
import { DOCS_CSS } from "../docs/assets";
import { escapeHtml } from "./layout";

const SITE = "https://drawstyle.leeguoo.com";

interface NavItem {
  slug: string; // "" is the overview at /docs
  title: string;
  ico: string;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: "开始",
    items: [{ slug: "", title: "概览", ico: "◆" }],
  },
  {
    label: "命令行工具",
    items: [
      { slug: "install", title: "安装", ico: "⤓" },
      { slug: "generate", title: "生成图片", ico: "✦" },
      { slug: "styles", title: "风格系统", ico: "✎" },
      { slug: "community", title: "用画廊的风格", ico: "☁" },
      { slug: "backends", title: "后端与排错", ico: "⚙" },
    ],
  },
  {
    label: "drawstyle 平台",
    items: [
      { slug: "platform", title: "平台是什么", ico: "❖" },
      { slug: "submit", title: "投稿与审核", ico: "✉" },
      { slug: "api", title: "面向 AI 的接口", ico: "⌁" },
    ],
  },
];

// ── du- component helpers ───────────────────────────────────────────────────

function eyebrow(text: string): string {
  return `<p class="du-eyebrow">${escapeHtml(text)}</p>`;
}

function lede(html: string): string {
  return `<p class="du-lede">${html}</p>`;
}

/** A terminal-style code block. Lines beginning with `# ` render as comments,
 *  lines beginning with `$ ` render with a green prompt. */
function code(name: string, lines: string[]): string {
  const body = lines
    .map((line) => {
      if (line.startsWith("# ")) {
        return `<span class="du-cmt">${escapeHtml(line)}</span>`;
      }
      if (line.startsWith("$ ")) {
        return `<span class="du-prompt">$</span> ${escapeHtml(line.slice(2))}`;
      }
      return escapeHtml(line);
    })
    .join("\n");
  return `<div class="du-code"><div class="du-code-head"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="du-code-name">${escapeHtml(name)}</span></div><pre><code>${body}</code></pre></div>`;
}

function callout(kind: "tip" | "note" | "warn", title: string, html: string): string {
  return `<div class="du-callout ${kind}"><div class="du-callout-title">${escapeHtml(title)}</div><div>${html}</div></div>`;
}

function cards(items: { href: string; title: string; ico: string; body: string }[]): string {
  const cols = items.length % 3 === 0 ? " cols-3" : "";
  const inner = items
    .map(
      (it) =>
        `<a class="du-card" href="${escapeHtml(it.href)}"><div class="du-card-title"><span class="du-card-ico">${it.ico}</span>${escapeHtml(it.title)}</div><p>${it.body}</p></a>`,
    )
    .join("");
  return `<div class="du-cards${cols}">${inner}</div>`;
}

const divider = `<hr class="du-divider" />`;
const mark = (s: string) => `<span class="mark">${escapeHtml(s)}</span>`;
const cmd = (s: string) => `<code>${escapeHtml(s)}</code>`;

// ── page content ────────────────────────────────────────────────────────────

interface DocPage {
  title: string;
  eyebrow: string;
  body: string;
}

const PAGES: Record<string, DocPage> = {
  "": {
    title: "概览",
    eyebrow: "drawstyle 文档",
    body:
      lede(
        `一个工具 + 一个社区,让 AI 绘图的<b>画风</b>可复用、可分享。${mark(
          "chatgpt-imagegen",
        )} 是本地命令行生图工具,${mark("drawstyle.leeguoo.com")} 是大家共享画风的画廊。`,
      ) +
      code("terminal", [
        "# 在画廊看到喜欢的风格,一条命令直接生图(不落盘)",
        '$ chatgpt-imagegen "一只在敲代码的猫" --style-online xiaohei',
      ]) +
      callout(
        "tip",
        "两句话说清",
        `<b>工具</b>用你的 ChatGPT 订阅生图,不需要 API key;<b>平台</b>让你把调好的画风投稿出去,别人(和未来的你)一条 <code>style pull</code> 就能复用。`,
      ) +
      divider +
      `<h2>从这里开始</h2>` +
      cards([
        { href: "/docs/install", title: "安装工具", ico: "⤓", body: "一行命令装好 chatgpt-imagegen。" },
        { href: "/docs/generate", title: "生成第一张图", ico: "✦", body: "基本用法、尺寸、参考图。" },
        { href: "/docs/community", title: "用画廊的风格", ico: "☁", body: `${cmd("--style-online")} 直接生图。` },
        { href: "/docs/platform", title: "了解平台", ico: "❖", body: "drawstyle 是什么、怎么逛。" },
        { href: "/docs/submit", title: "投稿画风", ico: "✉", body: "把好风格分享到画廊。" },
        { href: "/docs/api", title: "给 AI 的接口", ico: "⌁", body: "公开只读 API 与 llms.txt。" },
      ]),
  },

  install: {
    title: "安装",
    eyebrow: "命令行工具",
    body:
      lede(
        `${mark("chatgpt-imagegen")} 是一个单文件 Python 命令行工具,用你已登录的 ChatGPT 生图,<b>不需要 OPENAI_API_KEY</b>。`,
      ) +
      `<h2>安装</h2>` +
      code("terminal", [
        "# 从 GitHub 一行装好(推荐)",
        "$ curl -fsSL https://raw.githubusercontent.com/leeguooooo/chatgpt-imagegen/main/install.sh | sh",
        "",
        "# 或作为 agent skill 安装",
        "$ npx skills add leeguooooo/chatgpt-imagegen -g",
      ]) +
      callout(
        "note",
        "两个后端",
        `默认 <b>web</b> 后端驱动你登录着的 ChatGPT 浏览器,不消耗 Codex 用量;<b>codex</b> 是无浏览器兜底,会走 Codex 用量。装好后 <code>chatgpt-imagegen doctor</code> 自检。`,
      ) +
      divider +
      cards([
        { href: "/docs/generate", title: "生成图片", ico: "✦", body: "开始生图。" },
        { href: "/docs/styles", title: "风格系统", ico: "✎", body: "复用你的画风。" },
      ]),
  },

  generate: {
    title: "生成图片",
    eyebrow: "命令行工具",
    body:
      lede(`把提示词交给工具,得到一张位图。尺寸、格式、参考图都可选。`) +
      code("terminal", [
        "# 最简单",
        '$ chatgpt-imagegen "一只坐在窗台的橘猫,水彩风"',
        "",
        "# 指定尺寸与格式,并指定输出路径",
        '$ chatgpt-imagegen "科技海报,极简" --size 1536x1024 --format png -o poster.png',
        "",
        "# 用参考图(角色/构图)",
        '$ chatgpt-imagegen "让这只狐狸在喝咖啡" --ref fox.png',
      ]) +
      callout(
        "tip",
        "尺寸",
        `常用 <code>1024x1024</code>(方)、<code>1536x1024</code>(横)、<code>1024x1536</code>(竖)。一次最多附 4 张参考图。`,
      ) +
      `<h2>图生图(改图)</h2>` +
      `<p>用 <code>-i</code> / <code>--ref</code> 传一张参考图,就变成<b>改图</b>而不是从文字生成——等同于把图拖进 ChatGPT 对话框让它改风格。两个后端都支持,参考图可以是本地路径或 <code>http(s)</code> URL,重复 <code>-i</code> 传多张。</p>` +
      code("terminal", [
        '$ chatgpt-imagegen "改成暖调黄昏、电影感 35mm" -i photo.jpg -o out.png',
      ]) +
      `<h2>常用参数</h2>` +
      `<p><code>--backend auto|web|codex</code> · <code>-o PATH</code> 输出路径 · <code>--size</code> · <code>--format png|jpeg|webp</code> · <code>-i/--ref</code> 参考图 · <code>--style NAME</code> 套用风格 · <code>--quiet</code> 只打印路径(便于管道)。完整列表:<code>chatgpt-imagegen --help</code>。</p>` +
      divider +
      `<h2>接下来</h2>` +
      cards([
        { href: "/docs/styles", title: "风格系统", ico: "✎", body: "把画风钉一次,反复用。" },
        { href: "/docs/community", title: "用画廊的风格", ico: "☁", body: "直接用别人调好的画风。" },
        { href: "/docs/backends", title: "后端与排错", ico: "⚙", body: "web/codex 与常见问题。" },
      ]),
  },

  styles: {
    title: "风格系统",
    eyebrow: "命令行工具",
    body:
      lede(
        `<b>风格(资产)</b>是可复用的「外观」,用 <code>--style NAME</code> 套用——一段文字片段<b>和/或</b>钉住的参考图。钉一次,以后无需每次再传 <code>--ref</code>。`,
      ) +
      code("terminal", [
        "# 定义一个纯文字风格",
        '$ chatgpt-imagegen style add brand "扁平矢量,大色块,青色点缀,白底"',
        "",
        "# 钉一个固定角色(几张不同角度更稳)",
        "$ chatgpt-imagegen style add pip \"一只圆滚滚的橘色狐狸\" --kind character --ref a.png --ref b.png",
        "",
        "# 叠加:同一只狐狸 + 品牌画风",
        '$ chatgpt-imagegen "Pip 在点咖啡" --style pip --style brand',
        "",
        "# 把刚生成、很满意的那张钉成角色参考",
        "$ chatgpt-imagegen style add pip --from-last --kind character",
      ]) +
      callout(
        "note",
        "两种 kind",
        `<code>--kind style</code> 学画风、不抄内容;<code>--kind character</code> 还原一个固定主体(你的吉祥物/角色)。<code>--style</code> 可重复,于是角色和画风能叠加。`,
      ) +
      `<p>内置三个风格:<code>doodle</code>、<code>xiaohei</code>(小黑手绘讲解)、<code>snoopy</code>(Peanuts 报纸漫画)。用 <code>style list / show / rm / use / reset</code> 管理,存在 <code>~/.config/chatgpt-imagegen/styles.json</code>。</p>` +
      divider +
      cards([
        { href: "/docs/community", title: "用画廊的风格", ico: "☁", body: "从社区拉更多风格。" },
        { href: "/docs/submit", title: "投稿画风", ico: "✉", body: "把你的风格分享出去。" },
      ]),
  },

  community: {
    title: "用画廊的风格",
    eyebrow: "命令行工具",
    body:
      lede(
        `画廊在 ${mark(
          "drawstyle.leeguoo.com",
        )},里面是大家共享的画风。不用改脚本、不用等更新,命令行直接搜、直接用。`,
      ) +
      code("terminal", [
        "# 搜索画廊",
        '$ chatgpt-imagegen style search "水彩 吉祥物" --category avatar-ip',
        "",
        "# 最快:直接用画廊风格生图,本地不落盘",
        '$ chatgpt-imagegen "一只狐狸咖啡师" --style-online pip',
        "",
        "# 或拉到本地,之后离线反复用",
        "$ chatgpt-imagegen style pull pip --as pip2",
        '$ chatgpt-imagegen "Pip 在点咖啡" --style pip2',
      ]) +
      callout(
        "tip",
        "--style-online 是最快的路",
        `它按需拉取那个风格的文字片段和参考图,只用于这一次生成,什么都不写进本地库。适合「看到就想用」的场景。`,
      ) +
      callout(
        "note",
        "要不要登录?",
        `<b>不用</b>——<code>style search</code>、<code>style pull</code>、<code>--style-online</code> 都无需登录。只有<b>投稿</b>(<code>style publish</code>)需要一次浏览器登录。`,
      ) +
      divider +
      cards([
        { href: "/docs/submit", title: "投稿画风", ico: "✉", body: "把好风格分享到画廊。" },
        { href: "/docs/platform", title: "平台是什么", ico: "❖", body: "了解 drawstyle。" },
      ]),
  },

  backends: {
    title: "后端与排错",
    eyebrow: "命令行工具",
    body:
      lede(
        `同一个订阅有两个计量桶,生图走哪个取决于图<b>在哪生成</b>。默认 <code>auto</code> 优先省 Codex 用量。`,
      ) +
      `<h2>两个后端</h2>` +
      `<ul>` +
      `<li><b>web</b>(默认,不花 Codex 用量)——驱动你登录着的 ChatGPT 浏览器,像普通对话一样生图、事后删除。需要一个登录态 Chrome + <a href="https://github.com/leeguooooo/chrome-use">chrome-use</a>。</li>` +
      `<li><b>codex</b>(兜底,计 Codex 用量)——无浏览器,直接 POST 到 Codex 接口。需要 <code>codex login</code>。</li>` +
      `</ul>` +
      `<p><code>auto</code> 有登录浏览器就用 web、否则回落 codex——笔记本开着 Chrome 走 web,无头服务器走 codex,自动切换。也可 <code>--backend web/codex</code> 强制。</p>` +
      callout(
        "warn",
        "「已登录却说没有可用浏览器」",
        `先跑 <code>chatgpt-imagegen doctor</code> 看哪个后端就绪。web 够到浏览器有两条路:<b>relay</b>(你已开着的 Chrome,需装 chrome-use 扩展并连接)和<b>profile 启动</b>(复制登录态另开窗口)。修法:①<code>chrome-use extension install</code> 装扩展连 relay(最佳,不花 Codex 用量);②完全退出 Chrome 再重跑;③<code>--backend codex</code> 无头兜底。`,
      ) +
      `<h2>并发</h2>` +
      `<p>web <b>串行</b>(1 张,共享同一个 Chrome、页面限流严);codex 最多 <b>4</b> 并行。多发安全——超出的排队,<code>--timeout</code> 从拿到槽位才开始算。配额和 ChatGPT app 共享,别持续 &gt;10 张/分钟。</p>` +
      `<h2>什么时候别用这个工具</h2>` +
      `<p>需要真正的 <code>quality=high</code>、原生透明背景、可传给客户的<b>按次计费</b>、对外<b>公开服务</b>(用个人订阅供公开服务违反 OpenAI ToS)、或持续高频批量时——请改用官方 <code>/v1/images/generations</code> API(带 <code>OPENAI_API_KEY</code>)。</p>` +
      divider +
      cards([
        { href: "/docs/install", title: "安装", ico: "⤓", body: "装好两个后端之一。" },
        { href: "https://blog.leeguoo.com/zh/posts/chatgpt-imagegen/", title: "原理深入(博客)", ico: "✦", body: "web/codex 流程、Turnstile 门。" },
      ]),
  },

  platform: {
    title: "平台是什么",
    eyebrow: "drawstyle 平台",
    body:
      lede(
        `${mark(
          "drawstyle",
        )} 是面向 AI 绘图的社区画风画廊。每个「风格」打包了 prompt 片段、示例图、可选参考图,一条命令就能被命令行工具消费。`,
      ) +
      `<h2>怎么逛</h2>` +
      `<p>首页按<b>用途分类</b>(领导汇报 / 技术图解 / 可爱治愈 / 复古漫画 …)和<b>美学标签</b>筛选。每张卡片直接给出可复制的一行生图命令;点进详情能看大图、复制命令、点赞、复刻、评论。</p>` +
      callout(
        "tip",
        "登录",
        `通过 account.leeguoo.com 一键登录(支持 Google / GitHub)。登录后才能投稿、点赞、评论;浏览与拉取无需登录。`,
      ) +
      `<h2>一个风格的生命周期</h2>` +
      `<p>投稿 → 进<b>审核队列</b> → 管理员通过后<b>上架</b>到公开画廊 → 大家 <code>pull</code> / <code>--style-online</code> 使用 → 点赞、评论、复刻。</p>` +
      divider +
      cards([
        { href: "/docs/submit", title: "投稿与审核", ico: "✉", body: "怎么把风格投上去。" },
        { href: "/docs/api", title: "面向 AI 的接口", ico: "⌁", body: "公开只读 API。" },
      ]),
  },

  submit: {
    title: "投稿与审核",
    eyebrow: "drawstyle 平台",
    body:
      lede(`调好一个不错的风格?分享到画廊,别人(和未来的你)就能一键复用。`) +
      `<h2>从命令行投稿(最方便)</h2>` +
      code("terminal", [
        "# 一条命令:自动把最近生成的图当示例图",
        "$ chatgpt-imagegen style publish mystyle --category cute --from-last",
      ]) +
      `<p>它会在投稿前打印一份摘要,并在需要时打开浏览器登录(登录一次、令牌本地缓存)。成功后给出一个链接,可跟踪审核状态。</p>` +
      `<h2>从网页投稿</h2>` +
      `<p>登录后到 <code>/submit</code>:填标识符、名称、分类、标签、prompt 片段,把示例图<b>拖到手绘风拖拽区</b>(1–3 张,可预览可删)。参考图可选(≤4 张)。</p>` +
      callout(
        "note",
        "审核",
        `所有投稿先进<b>待审队列</b>,管理员通过后才公开。这也是第一道防滥用闸门。你能在「我的」里看到自己每条投稿的状态(待审核 / 已上架 / 已驳回)。`,
      ) +
      callout(
        "warn",
        "示例图必填",
        `画廊靠示例图展示效果,所以投稿至少要 1 张示例图。命令行缺图时会提示你用 <code>--from-last</code> 或 <code>--example</code>。`,
      ) +
      divider +
      cards([
        { href: "/docs/community", title: "用画廊的风格", ico: "☁", body: "反过来:怎么用别人的。" },
        { href: "/docs/api", title: "面向 AI 的接口", ico: "⌁", body: "程序化访问。" },
      ]),
  },

  api: {
    title: "面向 AI 的接口",
    eyebrow: "drawstyle 平台",
    body:
      lede(`drawstyle 对 AI agent 友好:公开只读 API + 一份 <code>llms.txt</code>,让工具和搜索引擎都能理解、消费。`) +
      `<h2>公开只读接口(无需登录)</h2>` +
      code("http", [
        "# 列表 / 搜索(支持 category、tag、q、sort)",
        "$ curl https://drawstyle.leeguoo.com/api/styles",
        "",
        "# 单个风格详情",
        "$ curl https://drawstyle.leeguoo.com/api/styles/xiaohei",
        "",
        "# 拉取包(命令行 pull 用的就是它):片段 + 版本 + 参考图 URL",
        "$ curl https://drawstyle.leeguoo.com/api/styles/xiaohei/package",
      ]) +
      callout(
        "tip",
        "GEO",
        `<code>https://drawstyle.leeguoo.com/llms.txt</code> 用自然语言说明了平台是什么、有哪些接口、以及怎么用命令行拉取——面向生成式搜索引擎优化。`,
      ) +
      `<h2>命令行如何对接</h2>` +
      `<p><code>style search</code> 打 <code>/api/styles</code>;<code>pull</code> 和 <code>--style-online</code> 打 <code>/package</code> 拿到片段和参考图。全部只读、无需鉴权。</p>` +
      divider +
      cards([
        { href: "/docs/community", title: "用画廊的风格", ico: "☁", body: "命令行侧的用法。" },
        { href: "", title: "回到概览", ico: "◆", body: "文档首页。" },
      ]),
  },
};

// ── shell + render ──────────────────────────────────────────────────────────

function sidebar(activeSlug: string): string {
  const groups = NAV.map((g) => {
    const items = g.items
      .map((it) => {
        const href = it.slug ? `/docs/${it.slug}` : "/docs";
        const active = it.slug === activeSlug ? " active" : "";
        return `<a class="du-nav-item${active}" href="${href}"><span class="du-nav-ico">${it.ico}</span><span class="du-nav-text">${escapeHtml(it.title)}</span></a>`;
      })
      .join("");
    return `<div class="du-nav-group"><div class="du-nav-label">${escapeHtml(g.label)}</div>${items}</div>`;
  }).join("");
  return `<nav class="du-sidebar" id="du-sidebar">${groups}</nav>`;
}

function shell(slug: string, page: DocPage): string {
  const canonical = slug ? `${SITE}/docs/${slug}` : `${SITE}/docs`;
  const pageTitle = `${page.title} · drawstyle 文档`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(page.title)} —— drawstyle 与 chatgpt-imagegen 的文档。">
  <link rel="canonical" href="${canonical}">
  <meta name="theme-color" content="#fcfbf4">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&family=Permanent+Marker&family=Noto+Sans+SC:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap">
  <link rel="stylesheet" href="/docs/docs.css">
  <script src="https://blog.leeguoo.com/scripts/visitor-beacon.js" defer></script>
</head>
<body>
  <header class="du-topbar">
    <a class="du-brand" href="/docs">drawstyle <span class="du-brand-sub">文档</span></a>
    <div class="du-topbar-right"><a class="du-nav-item" href="/zh/">← 回画廊</a></div>
  </header>
  <div class="du-shell">
    ${sidebar(slug)}
    <main class="du-main">
      ${eyebrow(page.eyebrow)}
      <div class="du-title-row"><h1>${escapeHtml(page.title)}</h1></div>
      ${page.body}
    </main>
  </div>
</body>
</html>`;
}

/** Render the docs page for a slug ("" = overview), or null if unknown. */
export function renderDocsPage(slug: string): string | null {
  const page = PAGES[slug];
  if (!page) return null;
  return shell(slug, page);
}

export function docsCss(): string {
  return DOCS_CSS;
}
