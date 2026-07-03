import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME, signSession } from "../src/auth";
import {
  addImage,
  addTags,
  createStyle,
  getImagesForStyle,
  getStyleBySlug,
  getTagsForStyle,
  setPendingRevision,
  type StyleRow,
} from "../src/db";
import app from "../src/index";
import { putImage } from "../src/images";
import { makeUser } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function uniq(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function imageFile(name = "image.png", bytes = PNG): File {
  return new File([bytes], name, { type: "image/png" });
}

async function cookieFor(email: string): Promise<string> {
  const user = await makeUser({ email });
  return `${SESSION_COOKIE_NAME}=${await signSession(user.id, env)}`;
}

async function adminCookie(): Promise<string> {
  return cookieFor("admin@test.dev");
}

async function adminRequest(
  path: string,
  method = "POST",
  cookie?: string,
  body?: BodyInit,
  contentType?: string,
) {
  const headers: Record<string, string> = {
    Cookie: cookie ?? (await adminCookie()),
    "X-Requested-With": "drawstyle",
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  return app.request(path, { method, body, headers }, env);
}

async function makeStyleForReview(
  status: "pending" | "approved" | "rejected" = "pending",
): Promise<StyleRow> {
  const owner = await makeUser();
  return createStyle(env.DB, {
    slug: uniq("review"),
    name: "Review",
    owner_user_id: owner.id,
    kind: "style",
    category: "report",
    status,
    snippet: "live",
  });
}

async function addRef(styleId: number, pending: number) {
  const bytes = new Uint8Array(PNG);
  bytes[8] = crypto.getRandomValues(new Uint8Array(1))[0];
  const stored = await putImage(env.ASSETS, bytes);
  return addImage(env.DB, {
    style_id: styleId,
    r2_key: stored.r2_key,
    role: "reference",
    content_type: stored.content_type,
    pending,
  });
}

async function stageRevision(style: StyleRow) {
  const staged = await addRef(style.id, 1);
  await setPendingRevision(
    env.DB,
    style.id,
    JSON.stringify({
      name: "Revision Name",
      snippet: "revision snippet",
      category: "slides",
      tags: ["revision"],
      ref_image_ids: [staged.id],
    }),
  );
  return staged;
}

describe("admin API", () => {
  it("returns 403 for non-admin users", async () => {
    const cookie = await cookieFor("plain@test.dev");
    const res = await adminRequest("/api/admin/pending", "GET", cookie);
    expect(res.status).toBe(403);
  });

  it("lists new submissions and pending revisions", async () => {
    const pending = await makeStyleForReview("pending");
    const approved = await makeStyleForReview("approved");
    await stageRevision(approved);

    const res = await adminRequest("/api/admin/pending", "GET");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ id: number; slug: string; type: string }>;
    };
    expect(body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: pending.id, slug: pending.slug, type: "new" }),
        expect.objectContaining({
          id: approved.id,
          slug: approved.slug,
          type: "revision",
        }),
      ]),
    );
  });

  it("approves a new submission without bumping version", async () => {
    const style = await makeStyleForReview("pending");
    const res = await adminRequest(`/api/admin/styles/${style.id}/approve`);
    expect(res.status).toBe(200);
    const fetched = await getStyleBySlug(env.DB, style.slug);
    expect(fetched?.status).toBe("approved");
    expect(fetched?.version).toBe(1);
  });

  it("rejects a new submission with a review note", async () => {
    const style = await makeStyleForReview("pending");
    const res = await adminRequest(
      `/api/admin/styles/${style.id}/reject`,
      "POST",
      undefined,
      JSON.stringify({ review_note: "needs work" }),
      "application/json",
    );
    expect(res.status).toBe(200);
    const fetched = await getStyleBySlug(env.DB, style.slug);
    expect(fetched?.status).toBe("rejected");
    expect(fetched?.review_note).toBe("needs work");
  });

  it("approves a revision by applying fields, tags, refs, and bumping version", async () => {
    const style = await makeStyleForReview("approved");
    await addTags(env.DB, style.id, ["old"]);
    const oldRef = await addRef(style.id, 0);
    const staged = await stageRevision(style);

    const res = await adminRequest(`/api/admin/styles/${style.id}/approve`);
    expect(res.status).toBe(200);

    const fetched = await getStyleBySlug(env.DB, style.slug);
    expect(fetched?.name).toBe("Revision Name");
    expect(fetched?.snippet).toBe("revision snippet");
    expect(fetched?.category).toBe("slides");
    expect(fetched?.version).toBe(2);
    expect(fetched?.pending_revision).toBeNull();
    expect(await getTagsForStyle(env.DB, style.id)).toEqual(["revision"]);
    expect(await env.ASSETS.get(oldRef.r2_key)).toBeNull();
    const liveRefs = await getImagesForStyle(env.DB, style.id, {
      role: "reference",
      pending: 0,
    });
    expect(liveRefs.map((image) => image.id)).toEqual([staged.id]);
  });

  it("rejects a revision by discarding staged refs and keeping live content", async () => {
    const style = await makeStyleForReview("approved");
    const staged = await stageRevision(style);
    const res = await adminRequest(
      `/api/admin/styles/${style.id}/reject`,
      "POST",
      undefined,
      JSON.stringify({ review_note: "nope" }),
      "application/json",
    );
    expect(res.status).toBe(200);

    const fetched = await getStyleBySlug(env.DB, style.slug);
    expect(fetched?.status).toBe("approved");
    expect(fetched?.name).toBe("Review");
    expect(fetched?.version).toBe(1);
    expect(fetched?.pending_revision).toBeNull();
    expect(fetched?.review_note).toBe("nope");
    expect(await env.ASSETS.get(staged.r2_key)).toBeNull();
    expect(await getImagesForStyle(env.DB, style.id, { pending: 1 })).toEqual([]);
  });

  it("delists an approved style", async () => {
    const style = await makeStyleForReview("approved");
    const res = await adminRequest(`/api/admin/styles/${style.id}/delist`);
    expect(res.status).toBe(200);
    const fetched = await getStyleBySlug(env.DB, style.slug);
    expect(fetched?.status).toBe("delisted");

    const detail = await app.request(`/api/styles/${style.slug}`, {}, env);
    expect(detail.status).toBe(404);
  });

  it("attaches an official example to an approved style", async () => {
    const style = await makeStyleForReview("approved");
    const form = new FormData();
    form.set("file", imageFile("official.png"));

    const res = await adminRequest(
      `/api/admin/styles/${style.id}/official-example`,
      "POST",
      undefined,
      form,
    );
    expect(res.status).toBe(200);
    const images = await getImagesForStyle(env.DB, style.id, {
      role: "official_example",
    });
    expect(images).toHaveLength(1);
    expect(images[0].content_type).toBe("image/png");
  });
});
