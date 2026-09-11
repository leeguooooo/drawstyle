# drawstyle

## Deploy prerequisites

- D1 uses the shared `public-db` database because the Cloudflare account is limited to 10 D1 databases; all tables/indexes in this project are prefixed with `drawstyle_`.
- If `public-db` does not exist yet, create it with `wrangler-accounts d1 create public-db`, then paste the real `database_id` over `TBD-at-deploy` in `wrangler.jsonc`.
- `wrangler-accounts r2 bucket create drawstyle-assets`
- `SESSION_SECRET` is a secret, deliberately not in `vars`: set it with `wrangler-accounts secret put SESSION_SECRET` (or in `.dev.vars` for local dev).
- Built-in style seeding is documented in `scripts/seed-builtins.html`.

## Anonymous skill uploads

The skill CLI can upload generated images without a login:

```bash
curl -F image=@output.png -H "X-Drawstyle-Machine-Id: $(hostname)" https://<host>/api/uploads
```

The API accepts `image` (or `file`) as multipart form data and returns a public `/img/<key>` URL. Optionally pass `style_slug` to associate the upload with a style for the community generations gallery. Anonymous uploads are limited to 10 per UTC day per machine id.

Each style has a generations gallery at `/{locale}/s/{slug}/generations` showing all player uploads for that style.

Use `wrangler-accounts --profile <name> ...` or set the persistent default profile before deploy. Do not run bare `wrangler` for this project.
