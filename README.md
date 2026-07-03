# drawstyle

## Deploy prerequisites

- D1 uses the shared `public-db` database because the Cloudflare account is limited to 10 D1 databases; all tables/indexes in this project are prefixed with `drawstyle_`.
- If `public-db` does not exist yet, create it with `wrangler-accounts d1 create public-db`, then paste the real `database_id` over `TBD-at-deploy` in `wrangler.jsonc`.
- `wrangler-accounts r2 bucket create drawstyle-assets`
- `SESSION_SECRET` is a secret, deliberately not in `vars`: set it with `wrangler-accounts secret put SESSION_SECRET` (or in `.dev.vars` for local dev).

Use `wrangler-accounts --profile <name> ...` or set the persistent default profile before deploy. Do not run bare `wrangler` for this project.
