-- Cloudflare accounts are limited to 10 D1 databases, so drawstyle uses the
-- shared public-db database. Every table and index in this migration keeps a
-- drawstyle_ prefix to avoid collisions with other projects in that database.

CREATE TABLE drawstyle_users (
  id INTEGER PRIMARY KEY,
  oidc_sub TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE drawstyle_styles (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL REFERENCES drawstyle_users(id),
  kind TEXT NOT NULL CHECK (kind IN ('character','style')),
  snippet TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','delisted')),
  version INTEGER NOT NULL DEFAULT 1,
  review_note TEXT,
  pending_revision TEXT,
  forked_from INTEGER REFERENCES drawstyle_styles(id),
  likes_count INTEGER NOT NULL DEFAULT 0,
  pulls_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE drawstyle_style_tags (
  style_id INTEGER NOT NULL REFERENCES drawstyle_styles(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (style_id, tag)
);

CREATE TABLE drawstyle_style_images (
  id INTEGER PRIMARY KEY,
  style_id INTEGER NOT NULL REFERENCES drawstyle_styles(id),
  r2_key TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('example','reference','official_example')),
  content_type TEXT NOT NULL,
  pending INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE drawstyle_likes (
  user_id INTEGER NOT NULL REFERENCES drawstyle_users(id),
  style_id INTEGER NOT NULL REFERENCES drawstyle_styles(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, style_id)
);

CREATE INDEX idx_drawstyle_styles_status ON drawstyle_styles(status);
CREATE INDEX idx_drawstyle_styles_category ON drawstyle_styles(category);
CREATE INDEX idx_drawstyle_styles_owner ON drawstyle_styles(owner_user_id);
CREATE INDEX idx_drawstyle_style_images_style ON drawstyle_style_images(style_id);
CREATE INDEX idx_drawstyle_style_tags_tag ON drawstyle_style_tags(tag);
