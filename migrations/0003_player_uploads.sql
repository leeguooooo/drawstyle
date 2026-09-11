CREATE TABLE drawstyle_player_uploads (
  id INTEGER PRIMARY KEY,
  machine_hash TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_drawstyle_player_uploads_machine_created ON drawstyle_player_uploads(machine_hash, created_at);
CREATE INDEX idx_drawstyle_player_uploads_key ON drawstyle_player_uploads(r2_key);
