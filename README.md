# drawstyle

## Deploy prerequisites

- `wrangler d1 create drawstyle_db`, then paste the real `database_id` over `TBD-at-deploy` in `wrangler.jsonc`.
- `wrangler r2 bucket create drawstyle-assets`
- `SESSION_SECRET` is a secret, deliberately not in `vars`: set it with `wrangler secret put SESSION_SECRET` (or in `.dev.vars` for local dev).
