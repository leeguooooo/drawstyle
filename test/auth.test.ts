import { env } from "cloudflare:test";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import {
  SESSION_COOKIE_NAME,
  requireAdmin,
  requireUser,
  setJwksFetcher,
  signSession,
} from "../src/auth";
import { createUser, type UserRow } from "../src/db";

type AuthApp = Hono<{
  Bindings: Env;
  Variables: {
    user: UserRow;
    authSource: "bearer" | "session";
  };
}>;

function makeApp(): AuthApp {
  const app = new Hono<{
    Bindings: Env;
    Variables: {
      user: UserRow;
      authSource: "bearer" | "session";
    };
  }>();
  app.get("/me", requireUser, (c) =>
    c.json({ user: c.var.user, source: c.var.authSource }),
  );
  app.post("/me", requireUser, (c) =>
    c.json({ user: c.var.user, source: c.var.authSource }),
  );
  app.get("/admin", requireAdmin, (c) => c.json({ ok: true }));
  return app;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createJwtSigner() {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const publicJwk = (await crypto.subtle.exportKey(
    "jwk",
    keyPair.publicKey,
  )) as JsonWebKey & { kid?: string; alg?: string; use?: string };
  publicJwk.kid = "test-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  async function sign(claims: Record<string, unknown>): Promise<string> {
    const header = { alg: "RS256", kid: "test-key", typ: "JWT" };
    const encodedHeader = base64Url(
      new TextEncoder().encode(JSON.stringify(header)),
    );
    const encodedPayload = base64Url(
      new TextEncoder().encode(JSON.stringify(claims)),
    );
    const input = `${encodedHeader}.${encodedPayload}`;
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      keyPair.privateKey,
      new TextEncoder().encode(input),
    );
    return `${input}.${base64Url(new Uint8Array(signature))}`;
  }

  return { publicJwk, sign };
}

async function installTestJwks(): Promise<{
  sign: (claims: Record<string, unknown>) => Promise<string>;
}> {
  const { publicJwk, sign } = await createJwtSigner();
  setJwksFetcher(async (url) => {
    if (url === `${env.OIDC_ISSUER}/.well-known/openid-configuration`) {
      return Response.json({
        issuer: env.OIDC_ISSUER,
        jwks_uri: `${env.OIDC_ISSUER}/jwks.json`,
      });
    }
    if (url === `${env.OIDC_ISSUER}/jwks.json`) {
      return Response.json({ keys: [publicJwk] });
    }
    return new Response("not found", { status: 404 });
  });
  return { sign };
}

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: env.OIDC_ISSUER,
    sub: `oidc|auth-test-${crypto.randomUUID()}`,
    aud: "drawstyle-cli",
    exp: Math.floor(Date.now() / 1000) + 300,
    email: "user@test.dev",
    name: "Test User",
    ...overrides,
  };
}

async function makeSessionUser(email = "session@test.dev"): Promise<UserRow> {
  return createUser(env.DB, {
    oidc_sub: `session|${crypto.randomUUID()}`,
    email,
    display_name: "Session User",
  });
}

afterEach(() => {
  setJwksFetcher();
});

describe("auth middleware", () => {
  it("returns 401 when requireUser has no credential", async () => {
    const res = await makeApp().request("/me", {}, env);
    expect(res.status).toBe(401);
  });

  it("accepts a valid RS256 bearer JWT and upserts the user", async () => {
    const { sign } = await installTestJwks();
    const token = await sign(
      claims({
        sub: "oidc|valid-bearer",
        email: "bearer@test.dev",
        name: "Bearer User",
      }),
    );

    const res = await makeApp().request(
      "/me",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: UserRow; source: string };
    expect(body.source).toBe("bearer");
    expect(body.user.oidc_sub).toBe("oidc|valid-bearer");
    expect(body.user.email).toBe("bearer@test.dev");
  });

  it("rejects expired or wrong-issuer bearer JWTs", async () => {
    const { sign } = await installTestJwks();
    const expiredToken = await sign(
      claims({ exp: Math.floor(Date.now() / 1000) - 1 }),
    );
    const wrongIssuerToken = await sign(claims({ iss: "https://issuer.invalid" }));

    const expired = await makeApp().request(
      "/me",
      { headers: { Authorization: `Bearer ${expiredToken}` } },
      env,
    );
    expect(expired.status).toBe(401);

    const wrongIssuer = await makeApp().request(
      "/me",
      { headers: { Authorization: `Bearer ${wrongIssuerToken}` } },
      env,
    );
    expect(wrongIssuer.status).toBe(401);
  });

  it("accepts a signed session cookie", async () => {
    const user = await makeSessionUser();
    const session = await signSession(user.id, env);

    const res = await makeApp().request(
      "/me",
      { headers: { Cookie: `${SESSION_COOKIE_NAME}=${session}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: UserRow; source: string };
    expect(body.source).toBe("session");
    expect(body.user.id).toBe(user.id);
  });

  it("rejects cookie-authenticated state-changing requests without CSRF header", async () => {
    const user = await makeSessionUser("csrf@test.dev");
    const session = await signSession(user.id, env);

    const blocked = await makeApp().request(
      "/me",
      { method: "POST", headers: { Cookie: `${SESSION_COOKIE_NAME}=${session}` } },
      env,
    );
    expect(blocked.status).toBe(403);

    const allowed = await makeApp().request(
      "/me",
      {
        method: "POST",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${session}`,
          "X-Requested-With": "drawstyle",
        },
      },
      env,
    );
    expect(allowed.status).toBe(200);
  });

  it("requires an admin allow-listed email", async () => {
    const nonAdmin = await makeSessionUser("plain@test.dev");
    const nonAdminSession = await signSession(nonAdmin.id, env);
    const denied = await makeApp().request(
      "/admin",
      { headers: { Cookie: `${SESSION_COOKIE_NAME}=${nonAdminSession}` } },
      env,
    );
    expect(denied.status).toBe(403);

    const admin = await makeSessionUser("admin@test.dev");
    const adminSession = await signSession(admin.id, env);
    const allowed = await makeApp().request(
      "/admin",
      { headers: { Cookie: `${SESSION_COOKIE_NAME}=${adminSession}` } },
      env,
    );
    expect(allowed.status).toBe(200);
  });
});
