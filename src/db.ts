// Typed D1 query helpers. One function per query; callers never build SQL
// with string interpolation — everything goes through `.bind()`.
//
// Cloudflare only allows 10 D1 databases on this account, so drawstyle shares
// the account-level public-db with other projects. Keep every table/index name
// prefixed with drawstyle_ to avoid cross-project collisions in that shared DB.
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
      `INSERT INTO drawstyle_users (oidc_sub, email, display_name, created_at)
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
      `INSERT INTO drawstyle_users (oidc_sub, email, display_name, created_at)
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
       FROM drawstyle_users
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
      `INSERT INTO drawstyle_styles
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
      `INSERT INTO drawstyle_style_images (style_id, r2_key, role, content_type, pending, sort)
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
        `INSERT OR IGNORE INTO drawstyle_style_tags (style_id, tag)
         VALUES (?, ?)`,
      )
      .bind(styleId, tag),
  );
  await db.batch(statements);
}

export async function replaceTags(
  db: D1Database,
  styleId: number,
  tags: string[],
): Promise<void> {
  const statements = [
    db
      .prepare(
        `DELETE FROM drawstyle_style_tags
         WHERE style_id = ?`,
      )
      .bind(styleId),
    ...tags.map((tag) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO drawstyle_style_tags (style_id, tag)
           VALUES (?, ?)`,
        )
        .bind(styleId, tag),
    ),
  ];
  await db.batch(statements);
}

export async function getImagesByKey(
  db: D1Database,
  r2_key: string,
): Promise<ImageAccessRow[]> {
  const result = await db
    .prepare(
      `SELECT
         drawstyle_style_images.id, drawstyle_style_images.style_id, drawstyle_style_images.r2_key,
         drawstyle_style_images.role, drawstyle_style_images.content_type, drawstyle_style_images.pending, drawstyle_style_images.sort,
         drawstyle_styles.status AS style_status, drawstyle_styles.owner_user_id
       FROM drawstyle_style_images
       JOIN drawstyle_styles ON drawstyle_styles.id = drawstyle_style_images.style_id
       WHERE drawstyle_style_images.r2_key = ?`,
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
       FROM drawstyle_styles
       WHERE slug = ?`,
    )
    .bind(slug)
    .first<StyleRow>();
  return row ?? null;
}

export async function getStyleById(
  db: D1Database,
  id: number,
): Promise<StyleRow | null> {
  const row = await db
    .prepare(
      `SELECT id, slug, name, owner_user_id, kind, snippet, category, status, version,
              review_note, pending_revision, forked_from, likes_count, pulls_count, created_at, updated_at
       FROM drawstyle_styles
       WHERE id = ?`,
    )
    .bind(id)
    .first<StyleRow>();
  return row ?? null;
}

export async function listPendingReviewStyles(db: D1Database): Promise<StyleRow[]> {
  const result = await db
    .prepare(
      `SELECT id, slug, name, owner_user_id, kind, snippet, category, status, version,
              review_note, pending_revision, forked_from, likes_count, pulls_count, created_at, updated_at
       FROM drawstyle_styles
       WHERE status = 'pending' OR pending_revision IS NOT NULL
       ORDER BY updated_at ASC, created_at ASC`,
    )
    .all<StyleRow>();
  return result.results;
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
         SELECT 1 FROM drawstyle_style_tags
         WHERE drawstyle_style_tags.style_id = drawstyle_styles.id AND drawstyle_style_tags.tag = ?
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
       FROM drawstyle_styles
       WHERE ${where.join(" AND ")}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds)
    .all<StyleRow>();
  return result.results;
}

export async function listStylesByOwner(
  db: D1Database,
  ownerUserId: number,
): Promise<StyleRow[]> {
  const result = await db
    .prepare(
      `SELECT id, slug, name, owner_user_id, kind, snippet, category, status, version,
              review_note, pending_revision, forked_from, likes_count, pulls_count, created_at, updated_at
       FROM drawstyle_styles
       WHERE owner_user_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
    )
    .bind(ownerUserId)
    .all<StyleRow>();
  return result.results;
}

export async function listLikedStyles(
  db: D1Database,
  userId: number,
): Promise<StyleRow[]> {
  const result = await db
    .prepare(
      `SELECT drawstyle_styles.id, drawstyle_styles.slug, drawstyle_styles.name,
              drawstyle_styles.owner_user_id, drawstyle_styles.kind, drawstyle_styles.snippet,
              drawstyle_styles.category, drawstyle_styles.status, drawstyle_styles.version,
              drawstyle_styles.review_note, drawstyle_styles.pending_revision,
              drawstyle_styles.forked_from, drawstyle_styles.likes_count,
              drawstyle_styles.pulls_count, drawstyle_styles.created_at,
              drawstyle_styles.updated_at
       FROM drawstyle_likes
       JOIN drawstyle_styles ON drawstyle_styles.id = drawstyle_likes.style_id
       WHERE drawstyle_likes.user_id = ? AND drawstyle_styles.status = 'approved'
       ORDER BY drawstyle_likes.created_at DESC`,
    )
    .bind(userId)
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
       FROM drawstyle_styles
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
       FROM drawstyle_style_tags
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
       FROM drawstyle_style_images
       WHERE ${where.join(" AND ")}
       ORDER BY sort ASC, id ASC`,
    )
    .bind(...binds)
    .all<ImageRow>();
  return result.results;
}

export interface UpdateStyleFieldsInput {
  name: string;
  snippet: string;
  category: string;
  status?: StyleStatus;
  pending_revision?: string | null;
  review_note?: string | null;
}

export async function updateStyleFields(
  db: D1Database,
  styleId: number,
  input: UpdateStyleFieldsInput,
): Promise<StyleRow> {
  const current = await db
    .prepare(
      `SELECT status, pending_revision, review_note
       FROM drawstyle_styles
       WHERE id = ?`,
    )
    .bind(styleId)
    .first<Pick<StyleRow, "status" | "pending_revision" | "review_note">>();
  if (!current) {
    throw new Error("updateStyleFields: style not found");
  }

  const row = await db
    .prepare(
      `UPDATE drawstyle_styles
       SET name = ?,
           snippet = ?,
           category = ?,
           status = ?,
           pending_revision = ?,
           review_note = ?,
           updated_at = ?
       WHERE id = ?
       RETURNING id, slug, name, owner_user_id, kind, snippet, category, status, version,
                 review_note, pending_revision, forked_from, likes_count, pulls_count, created_at, updated_at`,
    )
    .bind(
      input.name,
      input.snippet,
      input.category,
      input.status ?? current.status,
      input.pending_revision === undefined
        ? current.pending_revision
        : input.pending_revision,
      input.review_note === undefined ? current.review_note : input.review_note,
      new Date().toISOString(),
      styleId,
    )
    .first<StyleRow>();
  if (!row) {
    throw new Error("updateStyleFields: UPDATE ... RETURNING produced no row");
  }
  return row;
}

export async function setPendingRevision(
  db: D1Database,
  styleId: number,
  pendingRevision: string | null,
): Promise<StyleRow> {
  const row = await db
    .prepare(
      `UPDATE drawstyle_styles
       SET pending_revision = ?,
           updated_at = ?
       WHERE id = ?
       RETURNING id, slug, name, owner_user_id, kind, snippet, category, status, version,
                 review_note, pending_revision, forked_from, likes_count, pulls_count, created_at, updated_at`,
    )
    .bind(pendingRevision, new Date().toISOString(), styleId)
    .first<StyleRow>();
  if (!row) {
    throw new Error("setPendingRevision: UPDATE ... RETURNING produced no row");
  }
  return row;
}

export async function deleteImagesByIds(
  db: D1Database,
  imageIds: number[],
): Promise<void> {
  if (imageIds.length === 0) {
    return;
  }
  await db.batch(
    imageIds.map((id) =>
      db
        .prepare(
          `DELETE FROM drawstyle_style_images
           WHERE id = ?`,
        )
        .bind(id),
    ),
  );
}

export async function setImagesPending(
  db: D1Database,
  imageIds: number[],
  pending: number,
): Promise<void> {
  if (imageIds.length === 0) {
    return;
  }
  await db.batch(
    imageIds.map((id) =>
      db
        .prepare(
          `UPDATE drawstyle_style_images
           SET pending = ?
           WHERE id = ?`,
        )
        .bind(pending, id),
    ),
  );
}

export async function approveNewStyle(
  db: D1Database,
  styleId: number,
): Promise<StyleRow> {
  const row = await db
    .prepare(
      `UPDATE drawstyle_styles
       SET status = 'approved',
           review_note = NULL,
           updated_at = ?
       WHERE id = ?
       RETURNING id, slug, name, owner_user_id, kind, snippet, category, status, version,
                 review_note, pending_revision, forked_from, likes_count, pulls_count, created_at, updated_at`,
    )
    .bind(new Date().toISOString(), styleId)
    .first<StyleRow>();
  if (!row) {
    throw new Error("approveNewStyle: UPDATE ... RETURNING produced no row");
  }
  return row;
}

export async function rejectNewStyle(
  db: D1Database,
  styleId: number,
  note: string,
): Promise<StyleRow> {
  const row = await db
    .prepare(
      `UPDATE drawstyle_styles
       SET status = 'rejected',
           review_note = ?,
           updated_at = ?
       WHERE id = ?
       RETURNING id, slug, name, owner_user_id, kind, snippet, category, status, version,
                 review_note, pending_revision, forked_from, likes_count, pulls_count, created_at, updated_at`,
    )
    .bind(note, new Date().toISOString(), styleId)
    .first<StyleRow>();
  if (!row) {
    throw new Error("rejectNewStyle: UPDATE ... RETURNING produced no row");
  }
  return row;
}

export async function approveStyleRevision(
  db: D1Database,
  styleId: number,
  input: { name: string; snippet: string; category: string },
): Promise<StyleRow> {
  const row = await db
    .prepare(
      `UPDATE drawstyle_styles
       SET name = ?,
           snippet = ?,
           category = ?,
           version = version + 1,
           pending_revision = NULL,
           review_note = NULL,
           updated_at = ?
       WHERE id = ?
       RETURNING id, slug, name, owner_user_id, kind, snippet, category, status, version,
                 review_note, pending_revision, forked_from, likes_count, pulls_count, created_at, updated_at`,
    )
    .bind(input.name, input.snippet, input.category, new Date().toISOString(), styleId)
    .first<StyleRow>();
  if (!row) {
    throw new Error("approveStyleRevision: UPDATE ... RETURNING produced no row");
  }
  return row;
}

export async function rejectStyleRevision(
  db: D1Database,
  styleId: number,
  note: string,
): Promise<StyleRow> {
  const row = await db
    .prepare(
      `UPDATE drawstyle_styles
       SET pending_revision = NULL,
           review_note = ?,
           updated_at = ?
       WHERE id = ?
       RETURNING id, slug, name, owner_user_id, kind, snippet, category, status, version,
                 review_note, pending_revision, forked_from, likes_count, pulls_count, created_at, updated_at`,
    )
    .bind(note, new Date().toISOString(), styleId)
    .first<StyleRow>();
  if (!row) {
    throw new Error("rejectStyleRevision: UPDATE ... RETURNING produced no row");
  }
  return row;
}

export async function delistStyle(
  db: D1Database,
  styleId: number,
): Promise<StyleRow> {
  const row = await db
    .prepare(
      `UPDATE drawstyle_styles
       SET status = 'delisted',
           updated_at = ?
       WHERE id = ?
       RETURNING id, slug, name, owner_user_id, kind, snippet, category, status, version,
                 review_note, pending_revision, forked_from, likes_count, pulls_count, created_at, updated_at`,
    )
    .bind(new Date().toISOString(), styleId)
    .first<StyleRow>();
  if (!row) {
    throw new Error("delistStyle: UPDATE ... RETURNING produced no row");
  }
  return row;
}

export async function incrementPullsCount(
  db: D1Database,
  styleId: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE drawstyle_styles
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
       FROM drawstyle_styles
       WHERE owner_user_id = ? AND created_at >= ?`,
    )
    .bind(userId, sinceIso)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function likeStyle(
  db: D1Database,
  userId: number,
  styleId: number,
): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO drawstyle_likes (user_id, style_id, created_at)
         VALUES (?, ?, ?)`,
      )
      .bind(userId, styleId, now),
    db
      .prepare(
        `UPDATE drawstyle_styles
         SET likes_count = (
           SELECT COUNT(*) FROM drawstyle_likes WHERE style_id = ?
         ),
         updated_at = ?
         WHERE id = ?`,
      )
      .bind(styleId, now, styleId),
  ]);
}

export async function unlikeStyle(
  db: D1Database,
  userId: number,
  styleId: number,
): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `DELETE FROM drawstyle_likes
         WHERE user_id = ? AND style_id = ?`,
      )
      .bind(userId, styleId),
    db
      .prepare(
        `UPDATE drawstyle_styles
         SET likes_count = (
           SELECT COUNT(*) FROM drawstyle_likes WHERE style_id = ?
         ),
         updated_at = ?
         WHERE id = ?`,
      )
      .bind(styleId, now, styleId),
  ]);
}

export interface SitemapEntry {
  slug: string;
  updated_at: string;
}

// All approved styles for sitemap.xml — slug + lastmod only, no pagination.
export async function listApprovedSlugsForSitemap(
  db: D1Database,
): Promise<SitemapEntry[]> {
  const result = await db
    .prepare(
      `SELECT slug, updated_at
       FROM drawstyle_styles
       WHERE status = 'approved'
       ORDER BY created_at DESC`,
    )
    .all<SitemapEntry>();
  return result.results;
}

export async function listCuratedTags(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT drawstyle_style_tags.tag AS tag
       FROM drawstyle_style_tags
       JOIN drawstyle_styles ON drawstyle_styles.id = drawstyle_style_tags.style_id
       WHERE drawstyle_styles.status = 'approved'
       GROUP BY drawstyle_style_tags.tag
       ORDER BY COUNT(*) DESC, drawstyle_style_tags.tag ASC
       LIMIT 50`,
    )
    .all<{ tag: string }>();
  return result.results.map((row) => row.tag);
}
