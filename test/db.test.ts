import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { addImage, createStyle, createUser, getStyleBySlug } from "../src/db";
import { makeStyle, makeUser } from "./helpers";

describe("db", () => {
  it("round-trips a user, style and image through the typed helpers", async () => {
    const user = await createUser(env.DB, {
      oidc_sub: "oidc|round-trip",
      email: "round-trip@example.com",
      display_name: "Round Trip",
    });
    expect(user.id).toBeTypeOf("number");
    expect(user.oidc_sub).toBe("oidc|round-trip");
    expect(user.created_at).toBeTypeOf("string");

    const style = await createStyle(env.DB, {
      slug: "round-trip-style",
      name: "Round Trip Style",
      owner_user_id: user.id,
      kind: "style",
      category: "report",
      status: "approved",
    });
    expect(style.id).toBeTypeOf("number");
    expect(style.slug).toBe("round-trip-style");
    expect(style.name).toBe("Round Trip Style");
    expect(style.owner_user_id).toBe(user.id);
    expect(style.kind).toBe("style");
    expect(style.snippet).toBe("");
    expect(style.category).toBe("report");
    expect(style.status).toBe("approved");
    expect(style.version).toBe(1);
    expect(style.likes_count).toBe(0);
    expect(style.pulls_count).toBe(0);
    expect(style.created_at).toBeTypeOf("string");
    expect(style.updated_at).toBeTypeOf("string");

    const image = await addImage(env.DB, {
      style_id: style.id,
      r2_key: "styles/round-trip-style/example-1.png",
      role: "example",
      content_type: "image/png",
    });
    expect(image.id).toBeTypeOf("number");
    expect(image.style_id).toBe(style.id);
    expect(image.r2_key).toBe("styles/round-trip-style/example-1.png");
    expect(image.role).toBe("example");
    expect(image.content_type).toBe("image/png");
    expect(image.pending).toBe(0);
    expect(image.sort).toBe(0);

    const fetched = await getStyleBySlug(env.DB, "round-trip-style");
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(style.id);
    expect(fetched?.name).toBe("Round Trip Style");
    expect(fetched?.owner_user_id).toBe(user.id);
  });

  it("returns null from getStyleBySlug for an unknown slug", async () => {
    const fetched = await getStyleBySlug(env.DB, "does-not-exist");
    expect(fetched).toBeNull();
  });

  it("rejects an insert with an invalid status (CHECK constraint)", async () => {
    const user = await createUser(env.DB, {
      oidc_sub: "oidc|check-status",
      email: "check-status@example.com",
      display_name: "Check Status",
    });
    const now = new Date().toISOString();
    await expect(
      env.DB.prepare(
        `INSERT INTO styles
          (slug, name, owner_user_id, kind, snippet, category, status, version, likes_count, pulls_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          "bogus-status-style",
          "Bogus Status Style",
          user.id,
          "style",
          "",
          "report",
          "bogus",
          1,
          0,
          0,
          now,
          now,
        )
        .run(),
    ).rejects.toThrow();
  });

  it("rejects a duplicate slug (UNIQUE constraint)", async () => {
    const user = await createUser(env.DB, {
      oidc_sub: "oidc|dup-slug",
      email: "dup-slug@example.com",
      display_name: "Dup Slug",
    });
    await createStyle(env.DB, {
      slug: "dup-slug-style",
      name: "First",
      owner_user_id: user.id,
      kind: "style",
      category: "report",
      status: "approved",
    });

    const now = new Date().toISOString();
    await expect(
      env.DB.prepare(
        `INSERT INTO styles
          (slug, name, owner_user_id, kind, snippet, category, status, version, likes_count, pulls_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          "dup-slug-style",
          "Second",
          user.id,
          "style",
          "",
          "report",
          "approved",
          1,
          0,
          0,
          now,
          now,
        )
        .run(),
    ).rejects.toThrow();
  });

  it("seeds distinct records via the test/helpers.ts fixtures", async () => {
    const owner = await makeUser();
    const style = await makeStyle(owner.id);
    expect(style.owner_user_id).toBe(owner.id);
    expect(style.status).toBe("approved");

    const secondOwner = await makeUser();
    const pendingStyle = await makeStyle(secondOwner.id, {
      status: "pending",
    });
    expect(pendingStyle.status).toBe("pending");
    expect(pendingStyle.slug).not.toBe(style.slug);
  });
});
