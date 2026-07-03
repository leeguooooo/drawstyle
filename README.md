# drawstyle

## Deploy prerequisites

- `wrangler-accounts d1 create drawstyle_db`, then paste the real `database_id` over `TBD-at-deploy` in `wrangler.jsonc`.
- `wrangler-accounts r2 bucket create drawstyle-assets`
- `SESSION_SECRET` is a secret, deliberately not in `vars`: set it with `wrangler-accounts secret put SESSION_SECRET` (or in `.dev.vars` for local dev).

Use `wrangler-accounts --profile <name> ...` or set the persistent default profile before deploy. Do not run bare `wrangler` for this project.
