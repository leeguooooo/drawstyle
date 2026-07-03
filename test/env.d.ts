import type { D1Migration } from "cloudflare:test";

// Test-only bindings, augmented on top of the production `Cloudflare.Env`
// defined in src/env.d.ts (the single source of truth for prod bindings).
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
