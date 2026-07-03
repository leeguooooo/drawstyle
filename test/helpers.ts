// Seeding utilities shared across test files. Thin wrappers over src/db.ts
// helpers with sensible defaults, so later tasks can grow this file instead
// of hand-rolling INSERTs in every test. Uses the ambient `env.DB` from
// "cloudflare:test" (same D1 instance every test in a file shares), mirroring
// test/apply-migrations.ts.
//
// NOTE: `loginAs` is deliberately NOT here — auth doesn't exist yet (Task 3).

import { env } from "cloudflare:test";
import {
  createStyle,
  createUser,
  type StyleKind,
  type StyleRow,
  type StyleStatus,
  type UserRow,
} from "../src/db";

let counter = 0;

// Monotonic-ish counter so repeated calls within a test file don't collide
// on unique columns (slug, oidc_sub, email).
function nextId(): number {
  counter += 1;
  return counter;
}

export interface MakeUserOverrides {
  oidc_sub?: string;
  email?: string;
  display_name?: string;
}

export async function makeUser(
  overrides: MakeUserOverrides = {},
): Promise<UserRow> {
  const n = nextId();
  return createUser(env.DB, {
    oidc_sub: overrides.oidc_sub ?? `test-oidc-sub-${n}`,
    email: overrides.email ?? `test-user-${n}@example.com`,
    display_name: overrides.display_name ?? `Test User ${n}`,
  });
}

export interface MakeStyleOverrides {
  slug?: string;
  name?: string;
  kind?: StyleKind;
  category?: string;
  status?: StyleStatus;
  snippet?: string;
}

export async function makeStyle(
  userId: number,
  overrides: MakeStyleOverrides = {},
): Promise<StyleRow> {
  const n = nextId();
  return createStyle(env.DB, {
    slug: overrides.slug ?? `test-style-${n}`,
    name: overrides.name ?? `Test Style ${n}`,
    owner_user_id: userId,
    kind: overrides.kind ?? "style",
    category: overrides.category ?? "report",
    status: overrides.status ?? "approved",
    snippet: overrides.snippet,
  });
}
