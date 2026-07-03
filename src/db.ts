// Typed D1 query helpers. One function per query; callers never build SQL
// with string interpolation — everything goes through `.bind()`.
//
// Row interfaces mirror migrations/0001_init.sql verbatim. Keep them in sync
// if the schema changes.

export interface UserRow {
  id: number;
  oidc_sub: string;
  email: string;
  display_name: string;
  created_at: string;
}

export type StyleKind = "character" | "style";
export type StyleStatus = "pending" | "approved" | "rejected" | "delisted";

export interface StyleRow {
  id: number;
  slug: string;
  name: string;
  owner_user_id: number;
  kind: StyleKind;
  snippet: string;
  category: string;
  status: StyleStatus;
  version: number;
  review_note: string | null;
  pending_revision: string | null;
  forked_from: number | null;
  likes_count: number;
  pulls_count: number;
  created_at: string;
  updated_at: string;
}

export type ImageRole = "example" | "reference" | "official_example";

export interface ImageRow {
  id: number;
  style_id: number;
  r2_key: string;
  role: ImageRole;
  content_type: string;
  pending: number;
  sort: number;
}

export interface CreateUserInput {
  oidc_sub: string;
  email: string;
  display_name: string;
}

export async function createUser(
  db: D1Database,
  input: CreateUserInput,
): Promise<UserRow> {
  const created_at = new Date().toISOString();
  const row = await db
    .prepare(
      `INSERT INTO users (oidc_sub, email, display_name, created_at)
       VALUES (?, ?, ?, ?)
       RETURNING id, oidc_sub, email, display_name, created_at`,
    )
    .bind(input.oidc_sub, input.email, input.display_name, created_at)
    .first<UserRow>();
  if (!row) {
    throw new Error("createUser: INSERT ... RETURNING produced no row");
  }
  return row;
}

export async function upsertUser(
  db: D1Database,
  input: CreateUserInput,
): Promise<UserRow> {
  const created_at = new Date().toISOString();
  const row = await db
    .prepare(
      `INSERT INTO users (oidc_sub, email, display_name, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(oidc_sub) DO UPDATE SET
         email = excluded.email,
         display_name = excluded.display_name
       RETURNING id, oidc_sub, email, display_name, created_at`,
    )
    .bind(input.oidc_sub, input.email, input.display_name, created_at)
    .first<UserRow>();
  if (!row) {
    throw new Error("upsertUser: INSERT ... RETURNING produced no row");
  }
  return row;
}

export async function getUserById(
  db: D1Database,
  id: number,
): Promise<UserRow | null> {
  const row = await db
    .prepare(
      `SELECT id, oidc_sub, email, display_name, created_at
       FROM users
       WHERE id = ?`,
    )
    .bind(id)
    .first<UserRow>();
  return row ?? null;
}

export interface CreateStyleInput {
  slug: string;
  name: string;
  owner_user_id: number;
  kind: StyleKind;
  category: string;
  status: StyleStatus;
  snippet?: string;
}

export async function createStyle(
  db: D1Database,
  input: CreateStyleInput,
): Promise<StyleRow> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `INSERT INTO styles
        (slug, name, owner_user_id, kind, snippet, category, status, version, likes_count, pulls_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?)
       RETURNING id, slug, name, owner_user_id, kind, snippet, category, status, version,
                 review_note, pending_revision, forked_from, likes_count, pulls_count, created_at, updated_at`,
    )
    .bind(
      input.slug,
      input.name,
      input.owner_user_id,
      input.kind,
      input.snippet ?? "",
      input.category,
      input.status,
      now,
      now,
    )
    .first<StyleRow>();
  if (!row) {
    throw new Error("createStyle: INSERT ... RETURNING produced no row");
  }
  return row;
}

export interface AddImageInput {
  style_id: number;
  r2_key: string;
  role: ImageRole;
  content_type: string;
  pending?: number;
  sort?: number;
}

export async function addImage(
  db: D1Database,
  input: AddImageInput,
): Promise<ImageRow> {
  const row = await db
    .prepare(
      `INSERT INTO style_images (style_id, r2_key, role, content_type, pending, sort)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, style_id, r2_key, role, content_type, pending, sort`,
    )
    .bind(
      input.style_id,
      input.r2_key,
      input.role,
      input.content_type,
      input.pending ?? 0,
      input.sort ?? 0,
    )
    .first<ImageRow>();
  if (!row) {
    throw new Error("addImage: INSERT ... RETURNING produced no row");
  }
  return row;
}

export async function getStyleBySlug(
  db: D1Database,
  slug: string,
): Promise<StyleRow | null> {
  const row = await db
    .prepare(
      `SELECT id, slug, name, owner_user_id, kind, snippet, category, status, version,
              review_note, pending_revision, forked_from, likes_count, pulls_count, created_at, updated_at
       FROM styles
       WHERE slug = ?`,
    )
    .bind(slug)
    .first<StyleRow>();
  return row ?? null;
}
