import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME, signSession } from "../src/auth";
import {
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
});
