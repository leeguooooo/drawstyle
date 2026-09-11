import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function uniquePng(): Uint8Array {
  return new Uint8Array([...PNG, ...new TextEncoder().encode(crypto.randomUUID())]);
}

function form(bytes = uniquePng()): FormData {
  const data = new FormData();
  data.set("image", new File([bytes], "player.png", { type: "image/png" }));
  return data;
}

async function upload(machineId: string, body = form()) {
  return app.request(
    "/api/uploads",
    {
      method: "POST",
      body,
      headers: { "X-Drawstyle-Machine-Id": machineId },
    },
    env,
  );
}

describe("player uploads API", () => {
  it("accepts an anonymous skill upload and serves the returned image URL", async () => {
    const bytes = uniquePng();
    const res = await upload(`machine-${crypto.randomUUID()}`, form(bytes));
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      upload: { url: string; key: string; content_type: string; size: number; remaining_today: number };
    };
    expect(body.upload.key).toMatch(/^[a-f0-9]{64}\.png$/);
    expect(body.upload.content_type).toBe("image/png");
    expect(body.upload.size).toBe(bytes.byteLength);
    expect(body.upload.remaining_today).toBe(9);

    const served = await app.request(new URL(body.upload.url).pathname, {}, env);
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);
  });

  it("requires a stable machine id from the CLI", async () => {
    const res = await app.request(
      "/api/uploads",
      { method: "POST", body: form() },
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: "bad_machine_id",
        message: "X-Drawstyle-Machine-Id header or machine_id field is required",
      },
    });
  });

  it("rate-limits the 11th anonymous upload by the same machine in one UTC day", async () => {
    const machineId = `limited-${crypto.randomUUID()}`;
    for (let i = 0; i < 10; i += 1) {
      const res = await upload(machineId);
      expect(res.status, `upload ${i}`).toBe(201);
    }

    const res = await upload(machineId);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: { code: "rate_limited", message: "daily machine upload limit reached" },
    });
  });
});
