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
} from "../src/db";
import app from "../src/index";
import { MAX_IMAGE_BYTES } from "../src/images";
import { makeUser } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function uniq(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function imageFile(name = "example.png", bytes = PNG): File {
  return new File([bytes], name, { type: "image/png" });
}

async function sessionCookie() {
  const user = await makeUser();
  return {
    user,
    cookie: `${SESSION_COOKIE_NAME}=${await signSession(user.id, env)}`,
  };
}

function validForm(slug = uniq("submit")): FormData {
  const form = new FormData();
  form.set("slug", slug);
  form.set("name", `Style ${slug}`);
  form.set("kind", "style");
  form.set("snippet", `snippet ${slug}`);
  form.set("category", "report");
  form.append("tag", "Ink");
  form.append("example[]", imageFile());
  return form;
}

async function postForm(form: FormData, cookie?: string) {
  return app.request(
    "/api/styles",
    {
      method: "POST",
      body: form,
      headers: cookie
        ? { Cookie: cookie, "X-Requested-With": "drawstyle" }
        : undefined,
    },
    env,
  );
}

async function requestWithSession(
  path: string,
  method: "PUT" | "POST" | "DELETE",
  cookie: string,
  body?: BodyInit,
) {
  return app.request(
    path,
    {
      method,
      body,
      headers: { Cookie: cookie, "X-Requested-With": "drawstyle" },
    },
    env,
  );
}

function editForm(): FormData {
  const form = new FormData();
  form.set("name", "Edited Name");
  form.set("snippet", "edited snippet");
  form.set("category", "slides");
  form.append("tag", "edited");
  return form;
}

describe("styles write API", () => {
  it("returns 401 for anonymous submissions", async () => {
    const res = await postForm(validForm());
    expect(res.status).toBe(401);
  });

  it("creates a pending style from multipart plain fields and image files", async () => {
    const { cookie } = await sessionCookie();
    const slug = uniq("submit-ok");
    const form = validForm(slug);
    form.append("tag", "flat");
    form.append("ref[]", imageFile("ref.png"));

    const res = await postForm(form, cookie);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      style: { slug, status: "pending", version: 1 },
    });

    const style = await getStyleBySlug(env.DB, slug);
    expect(style?.status).toBe("pending");
    expect(style?.snippet).toBe(`snippet ${slug}`);
    expect(await getTagsForStyle(env.DB, style?.id ?? 0)).toEqual(["flat", "ink"]);
    const images = await getImagesForStyle(env.DB, style?.id ?? 0);
    expect(images.map((image) => image.role).sort()).toEqual(["example", "reference"]);
    expect(images.every((image) => image.content_type === "image/png")).toBe(true);
  });

  it("records fork provenance from an approved source slug", async () => {
    const sourceOwner = await makeUser();
    const source = await createStyle(env.DB, {
      slug: uniq("source"),
      name: "Source",
      owner_user_id: sourceOwner.id,
      kind: "style",
      category: "report",
      status: "approved",
      snippet: "source",
    });
    const { cookie } = await sessionCookie();
    const slug = uniq("fork");
    const form = validForm(slug);
    form.set("forked_from_slug", source.slug);

    const res = await postForm(form, cookie);
    expect(res.status).toBe(201);
    const fork = await getStyleBySlug(env.DB, slug);
    expect(fork?.forked_from).toBe(source.id);
  });

  it("accepts snippet-less submissions when references are present", async () => {
    const { cookie } = await sessionCookie();
    const slug = uniq("refs-only");
    const form = validForm(slug);
    form.set("snippet", "");
    form.append("ref[]", imageFile("ref.png"));

    const res = await postForm(form, cookie);
    expect(res.status).toBe(201);
    const style = await getStyleBySlug(env.DB, slug);
    expect(style?.snippet).toBe("");
  });

  it("rejects invalid fields and cardinality violations", async () => {
    const { cookie } = await sessionCookie();

    const cases: Array<[string, (form: FormData) => void, string]> = [
      ["bad slug", (form) => form.set("slug", "Bad Slug"), "bad_slug"],
      ["bad category", (form) => form.set("category", "nope"), "bad_category"],
      ["bad kind", (form) => form.set("kind", "nope"), "bad_kind"],
      ["no examples", (form) => form.delete("example[]"), "bad_examples"],
      [
        "four examples",
        (form) => {
          form.append("example[]", imageFile("2.png"));
          form.append("example[]", imageFile("3.png"));
          form.append("example[]", imageFile("4.png"));
        },
        "bad_examples",
      ],
      [
        "five refs",
        (form) => {
          for (let i = 0; i < 5; i += 1) {
            form.append("ref[]", imageFile(`ref-${i}.png`));
          }
        },
        "bad_refs",
      ],
      ["unknown fork", (form) => form.set("forked_from_slug", "missing"), "bad_fork"],
    ];

    for (const [label, mutate, code] of cases) {
      const form = validForm(uniq("invalid"));
      mutate(form);
      const res = await postForm(form, cookie);
      expect(res.status, label).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code, label).toBe(code);
    }
  });

  it("rejects duplicate slugs", async () => {
    const { user, cookie } = await sessionCookie();
    const slug = uniq("taken");
    await createStyle(env.DB, {
      slug,
      name: "Taken",
      owner_user_id: user.id,
      kind: "style",
      category: "report",
      status: "pending",
    });

    const res = await postForm(validForm(slug), cookie);
    expect(res.status).toBe(400);
    expect((await res.json()) as unknown).toEqual({
      error: { code: "slug_taken", message: "slug is already taken" },
    });
  });

  it("rejects oversized and non-image files", async () => {
    const { cookie } = await sessionCookie();
    const oversized = new Uint8Array(MAX_IMAGE_BYTES + 1);
    oversized.set(PNG);
    const oversizedForm = validForm(uniq("oversized"));
    oversizedForm.set("example[]", imageFile("big.png", oversized));
    const oversizedRes = await postForm(oversizedForm, cookie);
    expect(oversizedRes.status).toBe(400);
    expect(((await oversizedRes.json()) as { error: { code: string } }).error.code).toBe(
      "bad_image",
    );

    const nonImageForm = validForm(uniq("non-image"));
    nonImageForm.set(
      "example[]",
      new File([new Uint8Array([1, 2, 3])], "not.png", { type: "image/png" }),
    );
    const nonImageRes = await postForm(nonImageForm, cookie);
    expect(nonImageRes.status).toBe(400);
    expect(((await nonImageRes.json()) as { error: { code: string } }).error.code).toBe(
      "bad_image",
    );
  });

  it("rate-limits the 11th submission by the same user in one UTC day", async () => {
    const { user, cookie } = await sessionCookie();
    for (let i = 0; i < 10; i += 1) {
      await createStyle(env.DB, {
        slug: uniq(`limit-${i}`),
        name: `Limit ${i}`,
        owner_user_id: user.id,
        kind: "style",
        category: "report",
        status: "pending",
      });
    }

    const res = await postForm(validForm(uniq("limit")), cookie);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "rate_limited",
    );
  });

  it("stores approved owner edits as a pending revision without changing live fields", async () => {
    const { user, cookie } = await sessionCookie();
    const style = await createStyle(env.DB, {
      slug: uniq("approved-edit"),
      name: "Live Name",
      owner_user_id: user.id,
      kind: "style",
      category: "report",
      status: "approved",
      snippet: "live snippet",
    });
    await addTags(env.DB, style.id, ["live"]);
    const form = editForm();
    form.append("ref[]", imageFile("ref.png"));

    const res = await requestWithSession(
      `/api/styles/${style.slug}`,
      "PUT",
      cookie,
      form,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      style: {
        slug: style.slug,
        status: "approved",
        pending_revision: true,
        version: 1,
      },
    });

    const fetched = await getStyleBySlug(env.DB, style.slug);
    expect(fetched?.name).toBe("Live Name");
    expect(fetched?.snippet).toBe("live snippet");
    expect(fetched?.category).toBe("report");
    expect(await getTagsForStyle(env.DB, style.id)).toEqual(["live"]);
    const revision = JSON.parse(fetched?.pending_revision ?? "{}") as {
      name: string;
      snippet: string;
      category: string;
      tags: string[];
      ref_image_ids: number[];
    };
    expect(revision).toMatchObject({
      name: "Edited Name",
      snippet: "edited snippet",
      category: "slides",
      tags: ["edited"],
    });
    expect(revision.ref_image_ids).toHaveLength(1);
    const staged = await getImagesForStyle(env.DB, style.id, {
      role: "reference",
      pending: 1,
    });
    expect(staged.map((image) => image.id)).toEqual(revision.ref_image_ids);
  });

  it("overwrites the existing approved pending revision", async () => {
    const { user, cookie } = await sessionCookie();
    const style = await createStyle(env.DB, {
      slug: uniq("approved-overwrite"),
      name: "Live",
      owner_user_id: user.id,
      kind: "style",
      category: "report",
      status: "approved",
    });
    const first = editForm();
    first.set("name", "First");
    first.append("ref[]", imageFile("first.png"));
    expect(
      (await requestWithSession(`/api/styles/${style.slug}`, "PUT", cookie, first))
        .status,
    ).toBe(200);

    const second = editForm();
    second.set("name", "Second");
    second.append("ref[]", imageFile("second.png", new Uint8Array([...PNG, 2])));
    const res = await requestWithSession(
      `/api/styles/${style.slug}`,
      "PUT",
      cookie,
      second,
    );
    expect(res.status).toBe(200);

    const fetched = await getStyleBySlug(env.DB, style.slug);
    const revision = JSON.parse(fetched?.pending_revision ?? "{}") as {
      name: string;
      ref_image_ids: number[];
    };
    expect(revision.name).toBe("Second");
    const staged = await getImagesForStyle(env.DB, style.id, {
      role: "reference",
      pending: 1,
    });
    expect(staged).toHaveLength(1);
    expect(staged[0].id).toBe(revision.ref_image_ids[0]);
  });

  it("edits pending submissions in place", async () => {
    const { user, cookie } = await sessionCookie();
    const style = await createStyle(env.DB, {
      slug: uniq("pending-edit"),
      name: "Pending",
      owner_user_id: user.id,
      kind: "style",
      category: "report",
      status: "pending",
      snippet: "old",
    });
    await addTags(env.DB, style.id, ["old"]);

    const res = await requestWithSession(
      `/api/styles/${style.slug}`,
      "PUT",
      cookie,
      editForm(),
    );
    expect(res.status).toBe(200);
    const fetched = await getStyleBySlug(env.DB, style.slug);
    expect(fetched?.status).toBe("pending");
    expect(fetched?.name).toBe("Edited Name");
    expect(fetched?.snippet).toBe("edited snippet");
    expect(fetched?.category).toBe("slides");
    expect(fetched?.pending_revision).toBeNull();
    expect(await getTagsForStyle(env.DB, style.id)).toEqual(["edited"]);
  });

  it("resubmits rejected owner styles as pending", async () => {
    const { user, cookie } = await sessionCookie();
    const style = await createStyle(env.DB, {
      slug: uniq("rejected-edit"),
      name: "Rejected",
      owner_user_id: user.id,
      kind: "style",
      category: "report",
      status: "rejected",
      snippet: "old",
    });
    await env.DB.prepare(
      `UPDATE drawstyle_styles
       SET review_note = ?
       WHERE id = ?`,
    )
      .bind("needs work", style.id)
      .run();

    const res = await requestWithSession(
      `/api/styles/${style.slug}`,
      "PUT",
      cookie,
      editForm(),
    );
    expect(res.status).toBe(200);
    const fetched = await getStyleBySlug(env.DB, style.slug);
    expect(fetched?.status).toBe("pending");
    expect(fetched?.review_note).toBeNull();
    expect(fetched?.name).toBe("Edited Name");
  });

  it("rejects owner edits with immutable slug or kind fields", async () => {
    const { user, cookie } = await sessionCookie();
    const style = await createStyle(env.DB, {
      slug: uniq("immutable"),
      name: "Immutable",
      owner_user_id: user.id,
      kind: "style",
      category: "report",
      status: "pending",
    });
    for (const field of ["slug", "kind"]) {
      const form = editForm();
      form.set(field, "nope");
      const res = await requestWithSession(
        `/api/styles/${style.slug}`,
        "PUT",
        cookie,
        form,
      );
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        "immutable_field",
      );
    }
  });

  it("forbids edits by another user", async () => {
    const owner = await makeUser();
    const { cookie } = await sessionCookie();
    const style = await createStyle(env.DB, {
      slug: uniq("not-owner"),
      name: "Not Owner",
      owner_user_id: owner.id,
      kind: "style",
      category: "report",
      status: "approved",
    });

    const res = await requestWithSession(
      `/api/styles/${style.slug}`,
      "PUT",
      cookie,
      editForm(),
    );
    expect(res.status).toBe(403);
  });

  it("keeps the R2 object when an edit re-submits the identical ref file", async () => {
    const { user, cookie } = await sessionCookie();
    const style = await createStyle(env.DB, {
      slug: uniq("reupload"),
      name: "Reupload",
      owner_user_id: user.id,
      kind: "style",
      category: "report",
      status: "approved",
    });
    const bytes = new Uint8Array([
      ...PNG,
      ...new TextEncoder().encode(crypto.randomUUID()),
    ]);

    const first = editForm();
    first.append("ref[]", imageFile("ref.png", bytes));
    expect(
      (await requestWithSession(`/api/styles/${style.slug}`, "PUT", cookie, first))
        .status,
    ).toBe(200);
    const stagedBefore = await getImagesForStyle(env.DB, style.id, {
      role: "reference",
      pending: 1,
    });
    expect(stagedBefore).toHaveLength(1);
    const key = stagedBefore[0].r2_key;

    // Same bytes again: content-addressed key collides with the row we replace.
    const second = editForm();
    second.append("ref[]", imageFile("ref.png", bytes));
    expect(
      (await requestWithSession(`/api/styles/${style.slug}`, "PUT", cookie, second))
        .status,
    ).toBe(200);

    const stagedAfter = await getImagesForStyle(env.DB, style.id, {
      role: "reference",
      pending: 1,
    });
    expect(stagedAfter).toHaveLength(1);
    expect(stagedAfter[0].r2_key).toBe(key);
    expect(await env.ASSETS.get(key)).not.toBeNull();
  });

  it("likes and unlikes approved styles idempotently", async () => {
    const owner = await makeUser();
    const style = await createStyle(env.DB, {
      slug: uniq("like"),
      name: "Like",
      owner_user_id: owner.id,
      kind: "style",
      category: "report",
      status: "approved",
    });
    const { cookie } = await sessionCookie();

    const first = await requestWithSession(
      `/api/styles/${style.slug}/like`,
      "POST",
      cookie,
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ likes_count: 1 });

    const duplicate = await requestWithSession(
      `/api/styles/${style.slug}/like`,
      "POST",
      cookie,
    );
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual({ likes_count: 1 });

    const unlike = await requestWithSession(
      `/api/styles/${style.slug}/like`,
      "DELETE",
      cookie,
    );
    expect(unlike.status).toBe(200);
    expect(await unlike.json()).toEqual({ likes_count: 0 });
    expect((await getStyleBySlug(env.DB, style.slug))?.likes_count).toBe(0);
  });

  it("returns 404 when liking non-approved styles", async () => {
    const owner = await makeUser();
    const pending = await createStyle(env.DB, {
      slug: uniq("like-pending"),
      name: "Pending",
      owner_user_id: owner.id,
      kind: "style",
      category: "report",
      status: "pending",
    });
    const { cookie } = await sessionCookie();

    const res = await requestWithSession(
      `/api/styles/${pending.slug}/like`,
      "POST",
      cookie,
    );
    expect(res.status).toBe(404);
  });
});
