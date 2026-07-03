CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  oidc_sub TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE styles (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('character','style')),
  snippet TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','delisted')),
  version INTEGER NOT NULL DEFAULT 1,
  review_note TEXT,
  pending_revision TEXT,
  forked_from INTEGER REFERENCES styles(id),
  likes_count INTEGER NOT NULL DEFAULT 0,
  pulls_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE style_tags (
  style_id INTEGER NOT NULL REFERENCES styles(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (style_id, tag)
);

CREATE TABLE style_images (
  id INTEGER PRIMARY KEY,
  style_id INTEGER NOT NULL REFERENCES styles(id),
  r2_key TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('example','reference','official_example')),
  content_type TEXT NOT NULL,
  pending INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE likes (
  user_id INTEGER NOT NULL REFERENCES users(id),
  style_id INTEGER NOT NULL REFERENCES styles(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, style_id)
);

CREATE INDEX idx_styles_status ON styles(status);
CREATE INDEX idx_styles_category ON styles(category);
CREATE INDEX idx_styles_owner ON styles(owner_user_id);
CREATE INDEX idx_style_images_style ON style_images(style_id);
CREATE INDEX idx_style_tags_tag ON style_tags(tag);
