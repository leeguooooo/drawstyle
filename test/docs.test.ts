import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("docs site", () => {
  it("serves the overview at /docs with the du- shell and both projects in the nav", async () => {
    const res = await app.request("/docs", {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('class="du-shell"');
    expect(html).toContain('class="du-sidebar"');
    expect(html).toContain("命令行工具");
    expect(html).toContain("drawstyle 平台");
    expect(html).toContain("--style-online");
  });

  it("serves individual pages and marks the active nav item", async () => {
    const res = await app.request("/docs/install", {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("安装");
    expect(html).toContain("du-nav-item active");
  });

  it("serves the stylesheet with a css content-type", async () => {
    const res = await app.request("/docs/docs.css", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/css");
    expect(await res.text()).toContain("--paper");
  });

  it("404s an unknown docs page", async () => {
    const res = await app.request("/docs/nope", {}, env);
    expect(res.status).toBe(404);
  });
});
