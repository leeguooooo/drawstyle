// Single source of truth for the Worker's production bindings.
// Merged into the `Cloudflare.Env` namespace that both the runtime types and
// vitest-pool-workers' `env` (from "cloudflare:test") resolve against.
// Test-only bindings are augmented on top in test/env.d.ts.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: R2Bucket;
    SESSION_SECRET: string;
    OIDC_ISSUER: string;
    OIDC_CLIENT_ID: string;
    ADMIN_EMAILS: string;
  }
}

// Convenience alias used by the Hono app (`Bindings: Env`), mirroring the
// shape `wrangler types` generates.
interface Env extends Cloudflare.Env {}
