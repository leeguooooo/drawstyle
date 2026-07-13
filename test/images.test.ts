import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME, signSession } from "../src/auth";
import { addImage, createStyle, createUser, getImagesForStyle } from "../src/db";
import app from "../src/index";
import {
  ImageValidationError,
  MAX_IMAGE_BYTES,
  deleteImageRowsAndObjects,
  isAnimatedR2Key,
  putImage,
  sniffMime,
  validateImageBytes,
} from "../src/images";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const ANIMATED_WEBP = new Uint8Array([...WEBP, 0x41, 0x4e, 0x49, 0x4d]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1]);

function uniquePng(): Uint8Array {
  const bytes = new Uint8Array(PNG);
  bytes[8] = crypto.getRandomValues(new Uint8Array(1))[0];
  return bytes;
}

async function seedImage(status: "approved" | "pending", pending = 0) {
  const user = await createUser(env.DB, {
    oidc_sub: `image-owner-${crypto.randomUUID()}`,
    email: `owner-${crypto.randomUUID()}@test.dev`,
    display_name: "Image Owner",
  });
  const style = await createStyle(env.DB, {
    slug: `image-style-${crypto.randomUUID()}`,
    name: "Image Style",
    owner_user_id: user.id,
    kind: "style",
    category: "report",
    status,
  });
  const bytes = uniquePng();
  const stored = await putImage(env.ASSETS, bytes);
  await addImage(env.DB, {
    style_id: style.id,
    r2_key: stored.r2_key,
    role: "example",
    content_type: stored.content_type,
    pending,
  });
  return { user, stored, bytes };
}

describe("images", () => {
  it("sniffs png, jpeg, static/animated webp, and gif magic bytes", () => {
    expect(sniffMime(PNG)?.content_type).toBe("image/png");
    expect(sniffMime(JPEG)?.content_type).toBe("image/jpeg");
    expect(sniffMime(WEBP)?.content_type).toBe("image/webp");
    expect(sniffMime(WEBP)?.animated).toBe(false);
    expect(sniffMime(ANIMATED_WEBP)).toMatchObject({
      content_type: "image/webp",
      ext: "anim.webp",
      animated: true,
    });
    expect(sniffMime(GIF)).toMatchObject({
      content_type: "image/gif",
      ext: "gif",
      animated: true,
    });
    expect(sniffMime(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("stores animation markers in content-addressed object keys", async () => {
    const webp = await putImage(env.ASSETS, ANIMATED_WEBP);
    const gif = await putImage(env.ASSETS, GIF);
    expect(webp.r2_key).toMatch(/\.anim\.webp$/);
    expect(gif.r2_key).toMatch(/\.gif$/);
    expect(isAnimatedR2Key(webp.r2_key)).toBe(true);
    expect(isAnimatedR2Key(gif.r2_key)).toBe(true);
    expect(isAnimatedR2Key("abc.webp")).toBe(false);
  });

  it("rejects unsupported or oversized images", () => {
    expect(() => validateImageBytes(new Uint8Array([1, 2, 3]))).toThrow(
      ImageValidationError,
    );
    const oversized = new Uint8Array(MAX_IMAGE_BYTES + 1);
    oversized.set(PNG);
    expect(() => validateImageBytes(oversized)).toThrow(ImageValidationError);
  });

  it("stores images in R2 under a sha256 content-addressed key", async () => {
    const stored = await putImage(env.ASSETS, PNG);
    expect(stored.r2_key).toMatch(/^[a-f0-9]{64}\.png$/);
    expect(stored.content_type).toBe("image/png");
    expect(await env.ASSETS.get(stored.r2_key)).not.toBeNull();
  });

  it("streams approved images with cache headers", async () => {
    const { stored, bytes } = await seedImage("approved");
    const res = await app.request(`/img/${stored.r2_key}`, {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it("returns 404 for unknown keys", async () => {
    const res = await app.request(`/img/${"0".repeat(64)}.png`, {}, env);
    expect(res.status).toBe(404);
  });

  it("hides non-approved images unless the requester owns them", async () => {
    const { user, stored } = await seedImage("pending");
    const anonymous = await app.request(`/img/${stored.r2_key}`, {}, env);
    expect(anonymous.status).toBe(404);

    const session = await signSession(user.id, env);
    const owner = await app.request(
      `/img/${stored.r2_key}`,
      { headers: { Cookie: `${SESSION_COOKIE_NAME}=${session}` } },
      env,
    );
    expect(owner.status).toBe(200);
  });

  it("hides pending image revisions on approved styles from anonymous users", async () => {
    const { stored } = await seedImage("approved", 1);
    const res = await app.request(`/img/${stored.r2_key}`, {}, env);
    expect(res.status).toBe(404);
  });

  it("deletes a shared R2 object only after the last referencing row is gone", async () => {
    const user = await createUser(env.DB, {
      oidc_sub: `refcount-${crypto.randomUUID()}`,
      email: `refcount-${crypto.randomUUID()}@test.dev`,
      display_name: "Refcount Owner",
    });
    const makeRefStyle = () =>
      createStyle(env.DB, {
        slug: `refcount-${crypto.randomUUID()}`,
        name: "Refcount",
        owner_user_id: user.id,
        kind: "style",
        category: "report",
        status: "approved",
      });
    const styleA = await makeRefStyle();
    const styleB = await makeRefStyle();
    // Identical bytes → identical content-addressed r2_key shared by both rows.
    const bytes = new Uint8Array([
      ...PNG,
      ...new TextEncoder().encode(crypto.randomUUID()),
    ]);
    const stored = await putImage(env.ASSETS, bytes);
    const rowA = await addImage(env.DB, {
      style_id: styleA.id,
      r2_key: stored.r2_key,
      role: "reference",
      content_type: stored.content_type,
    });
    const rowB = await addImage(env.DB, {
      style_id: styleB.id,
      r2_key: stored.r2_key,
      role: "reference",
      content_type: stored.content_type,
    });

    await deleteImageRowsAndObjects(env, [rowA]);
    expect(await env.ASSETS.get(stored.r2_key)).not.toBeNull();
    const survivors = await getImagesForStyle(env.DB, styleB.id);
    expect(survivors.map((row) => row.id)).toEqual([rowB.id]);

    await deleteImageRowsAndObjects(env, [rowB]);
    expect(await env.ASSETS.get(stored.r2_key)).toBeNull();
  });
});
