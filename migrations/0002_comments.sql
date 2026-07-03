-- Comments on approved styles. Posted by logged-in users, shown immediately;
-- the comment author or an admin can delete. Prefixed table on the shared
-- public-db (see 0001_init.sql for why the drawstyle_ prefix).
CREATE TABLE drawstyle_comments (
  id INTEGER PRIMARY KEY,
  style_id INTEGER NOT NULL REFERENCES drawstyle_styles(id),
  user_id INTEGER NOT NULL REFERENCES drawstyle_users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_drawstyle_comments_style ON drawstyle_comments(style_id, created_at);
