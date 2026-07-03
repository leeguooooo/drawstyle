import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("docs site", () => {
  it("serves /en/docs with the du- shell and both projects in the English nav", async () => {
    const res = await app.request("/en/docs", {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('class="du-shell"');
    expect(html).toContain('class="du-sidebar"');
    expect(html).toContain("CLI tool");
    expect(html).toContain("drawstyle platform");
    expect(html).toContain("--style-online");
    expect(html).toContain('<html lang="en">');
    // brand/author byline for SEO
    expect(html).toContain("leeguoo");
  });

  it("serves /zh/docs with the Chinese nav", async () => {
    const res = await app.request("/zh/docs", {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("命令行工具");
    expect(html).toContain("drawstyle 平台");
    expect(html).toContain('<html lang="zh-CN">');
  });

  it("serves individual pages and marks the active nav item", async () => {
    const res = await app.request("/en/docs/install", {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Install");
    expect(html).toContain("du-nav-item active");
  });

  it("redirects unprefixed /docs to the negotiated locale (default en)", async () => {
    const res = await app.request("/docs", {}, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/en/docs");
    const zh = await app.request("/docs", { headers: { "Accept-Language": "zh-CN" } }, env);
    expect(zh.headers.get("Location")).toBe("/zh/docs");
    const slug = await app.request("/docs/install", {}, env);
    expect(slug.headers.get("Location")).toBe("/en/docs/install");
  });

  it("serves the shared stylesheet with a css content-type", async () => {
    const res = await app.request("/docs/docs.css", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/css");
    expect(await res.text()).toContain("--paper");
  });

  it("404s an unknown docs page", async () => {
    const res = await app.request("/en/docs/nope", {}, env);
    expect(res.status).toBe(404);
  });
});
