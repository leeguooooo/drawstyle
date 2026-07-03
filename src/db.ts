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

export interface ImageAccessRow extends ImageRow {
  style_status: StyleStatus;
  owner_user_id: number;
}

export interface StyleTagRow {
  style_id: number;
  tag: string;
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
  forked_from?: number | null;
}

export async function createStyle(
  db: D1Database,
  input: CreateStyleInput,
): Promise<StyleRow> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `INSERT INTO styles
        (slug, name, owner_user_id, kind, snippet, category, status, version, forked_from, likes_count, pulls_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 0, 0, ?, ?)
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
      input.forked_from ?? null,
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

export async function addTags(
  db: D1Database,
  styleId: number,
  tags: string[],
): Promise<void> {
  if (tags.length === 0) {
    return;
  }
  const statements = tags.map((tag) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO style_tags (style_id, tag)
         VALUES (?, ?)`,
      )
      .bind(styleId, tag),
  );
  await db.batch(statements);
}

export async function getImagesByKey(
  db: D1Database,
  r2_key: string,
): Promise<ImageAccessRow[]> {
  const result = await db
    .prepare(
      `SELECT
         style_images.id, style_images.style_id, style_images.r2_key,
         style_images.role, style_images.content_type, style_images.pending, style_images.sort,
         styles.status AS style_status, styles.owner_user_id
       FROM style_images
       JOIN styles ON styles.id = style_images.style_id
       WHERE style_images.r2_key = ?`,
    )
    .bind(r2_key)
    .all<ImageAccessRow>();
  return result.results;
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

export interface ListApprovedStylesOptions {
  q?: string;
  category?: string;
  tags?: string[];
  sort?: "likes" | "new" | "pulls";
  page?: number;
}

export async function listApprovedStyles(
  db: D1Database,
  options: ListApprovedStylesOptions = {},
): Promise<StyleRow[]> {
  const where = ["status = 'approved'"];
  const binds: (string | number)[] = [];
  const q = options.q?.trim();
  if (q) {
    where.push("(slug LIKE ? OR name LIKE ? OR snippet LIKE ?)");
    const like = `%${q}%`;
    binds.push(like, like, like);
  }
  if (options.category) {
    where.push("category = ?");
    binds.push(options.category);
  }
  for (const tag of options.tags ?? []) {
    where.push(
      `EXISTS (
         SELECT 1 FROM style_tags
         WHERE style_tags.style_id = styles.id AND style_tags.tag = ?
       )`,
    );
    binds.push(tag);
  }

  const sort = options.sort ?? "new";
  const orderBy =
    sort === "likes"
      ? "likes_count DESC, created_at DESC"
      : sort === "pulls"
        ? "pulls_count DESC, created_at DESC"
        : "created_at DESC";
  const page = Math.max(1, options.page ?? 1);
  binds.push(20, (page - 1) * 20);

  const result = await db
    .prepare(
      `SELECT id, slug, name, owner_user_id, kind, snippet, category, status, version,
              review_note, pending_revision, forked_from, likes_count, pulls_count, created_at, updated_at
       FROM styles
       WHERE ${where.join(" AND ")}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds)
    .all<StyleRow>();
  return result.results;
}

export async function getApprovedStyleBySlug(
  db: D1Database,
  slug: string,
): Promise<StyleRow | null> {
  const row = await db
    .prepare(
      `SELECT id, slug, name, owner_user_id, kind, snippet, category, status, version,
              review_note, pending_revision, forked_from, likes_count, pulls_count, created_at, updated_at
       FROM styles
       WHERE slug = ? AND status = 'approved'`,
    )
    .bind(slug)
    .first<StyleRow>();
  return row ?? null;
}

export async function getTagsForStyle(
  db: D1Database,
  styleId: number,
): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT style_id, tag
       FROM style_tags
       WHERE style_id = ?
       ORDER BY tag ASC`,
    )
    .bind(styleId)
    .all<StyleTagRow>();
  return result.results.map((row) => row.tag);
}

export async function getImagesForStyle(
  db: D1Database,
  styleId: number,
  options: { role?: ImageRole; pending?: number } = {},
): Promise<ImageRow[]> {
  const where = ["style_id = ?"];
  const binds: (string | number)[] = [styleId];
  if (options.role) {
    where.push("role = ?");
    binds.push(options.role);
  }
  if (options.pending !== undefined) {
    where.push("pending = ?");
    binds.push(options.pending);
  }
  const result = await db
    .prepare(
      `SELECT id, style_id, r2_key, role, content_type, pending, sort
       FROM style_images
       WHERE ${where.join(" AND ")}
       ORDER BY sort ASC, id ASC`,
    )
    .bind(...binds)
    .all<ImageRow>();
  return result.results;
}

export async function incrementPullsCount(
  db: D1Database,
  styleId: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE styles
       SET pulls_count = pulls_count + 1,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(new Date().toISOString(), styleId)
    .run();
}

export async function countUserStylesSince(
  db: D1Database,
  userId: number,
  sinceIso: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM styles
       WHERE owner_user_id = ? AND created_at >= ?`,
    )
    .bind(userId, sinceIso)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function listCuratedTags(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT style_tags.tag AS tag
       FROM style_tags
       JOIN styles ON styles.id = style_tags.style_id
       WHERE styles.status = 'approved'
       GROUP BY style_tags.tag
       ORDER BY COUNT(*) DESC, style_tags.tag ASC
       LIMIT 50`,
    )
    .all<{ tag: string }>();
  return result.results.map((row) => row.tag);
}
