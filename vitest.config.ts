import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// The vitest workers pool does NOT auto-apply migrations/. Read them here and
// hand them to the worker via a binding so a setup file can apply them per-run.
const migrations = await readD1Migrations("./migrations");

// NOTE: @cloudflare/vitest-pool-workers 0.18 (Vitest v4) replaced the old
// `defineWorkersConfig` / `poolOptions.workers` shape with the `cloudflareTest`
// Vite plugin. The plugin takes what used to be the `poolOptions.workers`
// object; setupFiles moved to the standard `test.setupFiles`.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // d1Databases / r2Buckets come from wrangler.jsonc via configPath —
        // do NOT re-declare them here.
        bindings: {
          SESSION_SECRET: "test-secret",
          ADMIN_EMAILS: "admin@test.dev",
          TEST_MIGRATIONS: migrations,
        },
      },
    }),
  ],
  test: {
    // Applies TEST_MIGRATIONS to env.DB before each test file runs (in-worker).
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
