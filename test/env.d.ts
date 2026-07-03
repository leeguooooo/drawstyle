import type { D1Migration } from "cloudflare:test";

// Types the bindings available on `env` (from "cloudflare:test") for tests.
// In vitest-pool-workers v4, `env` is typed as `Cloudflare.Env`.
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      ASSETS: R2Bucket;
      TEST_MIGRATIONS: D1Migration[];
      SESSION_SECRET: string;
      OIDC_ISSUER: string;
      OIDC_CLIENT_ID: string;
      ADMIN_EMAILS: string;
    }
  }
}
