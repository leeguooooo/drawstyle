import { applyD1Migrations, env } from "cloudflare:test";

// Apply the migrations bundled into the TEST_MIGRATIONS binding to env.DB.
// The workers pool does not run migrations/ automatically, so tests rely on
// this setup file to create their tables. No-op while migrations/ is empty.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
