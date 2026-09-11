ALTER TABLE drawstyle_player_uploads ADD COLUMN style_slug TEXT;

CREATE INDEX idx_drawstyle_player_uploads_style ON drawstyle_player_uploads(style_slug, created_at);