-- Idempotently seed drawstyle's official built-in styles.
--
-- Cloudflare only allows 10 D1 databases on this account, so this script is
-- intended for the shared public-db database. Every table touched here keeps the
-- drawstyle_ prefix to avoid collisions with other projects in that shared DB.

INSERT INTO drawstyle_users (oidc_sub, email, display_name, created_at)
VALUES (
  'drawstyle-seed:official',
  'leeguooooo@gmail.com',
  'Drawstyle Official',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(oidc_sub) DO UPDATE SET
  email = excluded.email,
  display_name = excluded.display_name;

INSERT INTO drawstyle_styles (
  slug, name, owner_user_id, kind, snippet, category, status, version,
  likes_count, pulls_count, created_at, updated_at
)
VALUES (
  'doodle',
  'Doodle',
  (SELECT id FROM drawstyle_users WHERE oidc_sub = 'drawstyle-seed:official'),
  'style',
  'drawn as a deliberately crude doodle using the biggest possible blocks ' ||
  'of color, leaning hard into a scribbly, pathetically bad look. White ' ||
  'background, as if drawn with a mouse in an old-school computer paint ' ||
  'program. It should be faintly recognizable yet not quite right - like ' ||
  'it almost matches but everything is subtly off, awkward and confusing. ' ||
  'Low-res, smeared together pixel by pixel, showing off just how absurdly ' ||
  'bad it is. Honestly, draw it however you want - but the content must ' ||
  'still be readable.',
  'cute',
  'approved',
  1,
  0,
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  owner_user_id = excluded.owner_user_id,
  kind = excluded.kind,
  snippet = excluded.snippet,
  category = excluded.category,
  status = excluded.status,
  version = max(drawstyle_styles.version, excluded.version),
  updated_at = excluded.updated_at;

INSERT INTO drawstyle_styles (
  slug, name, owner_user_id, kind, snippet, category, status, version,
  likes_count, pulls_count, created_at, updated_at
)
VALUES (
  'xiaohei',
  '小黑手绘讲解',
  (SELECT id FROM drawstyle_users WHERE oidc_sub = 'drawstyle-seed:official'),
  'character',
  'Ian ''Xiaohei'' (小黑) hand-drawn explainer style. Pure white background - ' ||
  'NO paper texture, beige, shadows, or gradients. Thin hand-drawn black ' ||
  'ink linework with a slight hand-wobble, and lots of whitespace (the ' ||
  'subject fills only ~40-60% of the frame). Express ONE single idea: an ' ||
  'absurd machine, contraption, or metaphor. The protagonist is 小黑 - a ' ||
  'solid matte-black blob figure with two small white dot eyes, thin stick ' ||
  'legs, and a blank expression - actively operating the contraption, never ' ||
  'a decorative mascot in a corner. Add a few sparse handwritten Chinese ' ||
  'annotation labels in red, orange, and blue with thin hand-drawn arrows ' ||
  'pointing at parts of the scene. Weird, witty, and clean, but never cute ' ||
  'or childish. 16:9 landscape. (For the strongest match, pin a few example ' ||
  'images as references: `style add-ref xiaohei <img>`.)',
  'tech-explainer',
  'approved',
  1,
  0,
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  owner_user_id = excluded.owner_user_id,
  kind = excluded.kind,
  snippet = excluded.snippet,
  category = excluded.category,
  status = excluded.status,
  version = max(drawstyle_styles.version, excluded.version),
  updated_at = excluded.updated_at;

INSERT INTO drawstyle_styles (
  slug, name, owner_user_id, kind, snippet, category, status, version,
  likes_count, pulls_count, created_at, updated_at
)
VALUES (
  'snoopy',
  'Snoopy Comic',
  (SELECT id FROM drawstyle_users WHERE oidc_sub = 'drawstyle-seed:official'),
  'style',
  'Classic mid-20th-century American newspaper comic-strip look, in the ' ||
  'gentle spirit of the Peanuts / Snoopy Sunday funnies. Simple, clean, ' ||
  'slightly wobbly thin black pen-ink outlines, as if hand-inked with a ' ||
  'nib. Characters are round-headed and minimalist - big heads, small ' ||
  'squat bodies, tiny dot eyes, and simple curved-line mouths and ' ||
  'eyebrows that carry all the expression. Flat cel-style fills in a ' ||
  'limited, slightly muted retro palette - no gradients, no rendering, no ' ||
  'shadows. Lots of clean white space and sparse, minimal backgrounds (a ' ||
  'single horizon line, a few simple props). Warm, wholesome, a touch ' ||
  'wistful and funny. Hand-lettered feel for any text. Keep it charming ' ||
  'and simple, never detailed or photorealistic.',
  'retro-comic',
  'approved',
  1,
  0,
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  owner_user_id = excluded.owner_user_id,
  kind = excluded.kind,
  snippet = excluded.snippet,
  category = excluded.category,
  status = excluded.status,
  version = max(drawstyle_styles.version, excluded.version),
  updated_at = excluded.updated_at;

DELETE FROM drawstyle_style_tags
WHERE style_id IN (
  SELECT id FROM drawstyle_styles WHERE slug IN ('doodle', 'xiaohei', 'snoopy')
);

INSERT OR IGNORE INTO drawstyle_style_tags (style_id, tag)
VALUES
  ((SELECT id FROM drawstyle_styles WHERE slug = 'doodle'), 'doodle'),
  ((SELECT id FROM drawstyle_styles WHERE slug = 'doodle'), 'fun'),
  ((SELECT id FROM drawstyle_styles WHERE slug = 'xiaohei'), 'xiaohei'),
  ((SELECT id FROM drawstyle_styles WHERE slug = 'xiaohei'), 'explainer'),
  ((SELECT id FROM drawstyle_styles WHERE slug = 'xiaohei'), 'chinese'),
  ((SELECT id FROM drawstyle_styles WHERE slug = 'snoopy'), 'snoopy'),
  ((SELECT id FROM drawstyle_styles WHERE slug = 'snoopy'), 'comic');

DELETE FROM drawstyle_style_images
WHERE style_id IN (
  SELECT id FROM drawstyle_styles WHERE slug IN ('doodle', 'xiaohei', 'snoopy')
)
AND role IN ('official_example', 'reference');

INSERT INTO drawstyle_style_images (style_id, r2_key, role, content_type, pending, sort)
VALUES
  (
    (SELECT id FROM drawstyle_styles WHERE slug = 'doodle'),
    'e105198f2239e35fe3c505c3f9a184cc82fe3e12d9e21f45e2cc0d3dcbc012b1.png',
    'reference',
    'image/png',
    0,
    0
  ),
  (
    (SELECT id FROM drawstyle_styles WHERE slug = 'xiaohei'),
    '35de94fd5754d2a022f5fe945ecdb7dfd91dc34e8d4cb6ac07669a8f466d8be8.png',
    'reference',
    'image/png',
    0,
    0
  ),
  (
    (SELECT id FROM drawstyle_styles WHERE slug = 'snoopy'),
    'aa5c321e94128ae2d4a68f37a0de55f390d09edd61ec10788282de2c950b98d9.png',
    'reference',
    'image/png',
    0,
    0
  );
