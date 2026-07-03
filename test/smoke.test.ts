import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("smoke", () => {
  it("GET /healthz returns 200 and {ok:true}", async () => {
    const res = await app.request("/healthz", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
