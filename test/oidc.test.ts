import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME, setJwksFetcher } from "../src/auth";
import { getStyleBySlug } from "../src/db";
import app from "../src/index";
import { setTokenFetcher } from "../src/oidc";

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
  publicJwk.kid = "oidc-test-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  async function sign(claims: Record<string, unknown>): Promise<string> {
    const header = { alg: "RS256", kid: "oidc-test-key", typ: "JWT" };
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

async function installOidcStubs() {
  const { publicJwk, sign } = await createJwtSigner();
  setJwksFetcher(async (url) => {
    if (url === `${env.OIDC_ISSUER}/.well-known/openid-configuration`) {
      return Response.json({
        jwks_uri: `${env.OIDC_ISSUER}/jwks.json`,
      });
    }
    if (url === `${env.OIDC_ISSUER}/jwks.json`) {
      return Response.json({ keys: [publicJwk] });
    }
    return new Response("not found", { status: 404 });
  });
  setTokenFetcher(async (url, init) => {
    if (url === `${env.OIDC_ISSUER}/.well-known/openid-configuration`) {
      return Response.json({
        authorization_endpoint: `${env.OIDC_ISSUER}/authorize`,
        token_endpoint: `${env.OIDC_ISSUER}/token`,
      });
    }
    if (url === `${env.OIDC_ISSUER}/token`) {
      const body = init?.body as URLSearchParams;
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("client_id")).toBe(env.OIDC_CLIENT_ID);
      expect(body.get("code_verifier")).toBeTruthy();
      return Response.json({
        id_token: await sign({
          iss: env.OIDC_ISSUER,
          sub: "oidc|web-user",
          aud: "drawstyle-web",
          exp: Math.floor(Date.now() / 1000) + 300,
          email: "web@test.dev",
          name: "Web User",
        }),
      });
    }
    return new Response("not found", { status: 404 });
  });
}

function cookieValue(setCookie: string, name: string): string {
  const part = setCookie
    .split(/,\s*(?=[^;,]+=)/g)
    .find((cookie) => cookie.startsWith(`${name}=`));
  if (!part) {
    throw new Error(`cookie ${name} missing`);
  }
  return part.split(";")[0];
}

afterEach(() => {
  setJwksFetcher();
  setTokenFetcher();
});

describe("web OIDC login", () => {
  it("redirects to the issuer authorize endpoint with PKCE and stores tx cookie", async () => {
    await installOidcStubs();
    const res = await app.request("https://drawstyle.leeguoo.com/auth/login", {}, env);
    expect(res.status).toBe(302);
    const location = res.headers.get("Location");
    expect(location).toBeTruthy();
    const url = new URL(location ?? "");
    expect(`${url.origin}${url.pathname}`).toBe(`${env.OIDC_ISSUER}/authorize`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(env.OIDC_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://drawstyle.leeguoo.com/auth/callback",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(res.headers.get("Set-Cookie")).toContain("oidc_tx=");
  });

  it("exchanges code, upserts the user, sets session cookie, and redirects home", async () => {
    await installOidcStubs();
    const login = await app.request("https://drawstyle.leeguoo.com/auth/login", {}, env);
    const location = new URL(login.headers.get("Location") ?? "");
    const txCookie = cookieValue(login.headers.get("Set-Cookie") ?? "", "oidc_tx");

    const callback = await app.request(
      `https://drawstyle.leeguoo.com/auth/callback?code=ok&state=${location.searchParams.get("state")}`,
      { headers: { Cookie: txCookie } },
      env,
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get("Location")).toBe("/");
    const setCookie = callback.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");

    const row = await env.DB.prepare(
      `SELECT oidc_sub, email, display_name
       FROM drawstyle_users
       WHERE oidc_sub = ?`,
    )
      .bind("oidc|web-user")
      .first<{ oidc_sub: string; email: string; display_name: string }>();
    expect(row).toEqual({
      oidc_sub: "oidc|web-user",
      email: "web@test.dev",
      display_name: "Web User",
    });
  });

  it("returns to a same-site return_to after login, and ignores an off-site one", async () => {
    await installOidcStubs();
    // same-site path is honored
    const login = await app.request(
      `https://drawstyle.leeguoo.com/auth/login?return_to=${encodeURIComponent("/zh/submit")}`,
      {},
      env,
    );
    const loc = new URL(login.headers.get("Location") ?? "");
    const txCookie = cookieValue(login.headers.get("Set-Cookie") ?? "", "oidc_tx");
    const cb = await app.request(
      `https://drawstyle.leeguoo.com/auth/callback?code=ok&state=${loc.searchParams.get("state")}`,
      { headers: { Cookie: txCookie } },
      env,
    );
    expect(cb.headers.get("Location")).toBe("/zh/submit");

    // protocol-relative / off-site target is rejected → falls back to "/"
    const login2 = await app.request(
      `https://drawstyle.leeguoo.com/auth/login?return_to=${encodeURIComponent("//evil.example/x")}`,
      {},
      env,
    );
    const loc2 = new URL(login2.headers.get("Location") ?? "");
    const tx2 = cookieValue(login2.headers.get("Set-Cookie") ?? "", "oidc_tx");
    const cb2 = await app.request(
      `https://drawstyle.leeguoo.com/auth/callback?code=ok&state=${loc2.searchParams.get("state")}`,
      { headers: { Cookie: tx2 } },
      env,
    );
    expect(cb2.headers.get("Location")).toBe("/");
  });

  it("rejects mismatched state", async () => {
    await installOidcStubs();
    const login = await app.request("https://drawstyle.leeguoo.com/auth/login", {}, env);
    const txCookie = cookieValue(login.headers.get("Set-Cookie") ?? "", "oidc_tx");

    const callback = await app.request(
      "https://drawstyle.leeguoo.com/auth/callback?code=ok&state=wrong",
      { headers: { Cookie: txCookie } },
      env,
    );
    expect(callback.status).toBe(400);
    expect(await callback.json()).toEqual({
      error: { code: "bad_state", message: "invalid OIDC state" },
    });
  });

  it("clears the session cookie on logout via POST with the CSRF header", async () => {
    const res = await app.request(
      "https://drawstyle.leeguoo.com/auth/logout",
      { method: "POST", headers: { "X-Requested-With": "drawstyle" } },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Set-Cookie")).toContain(`${SESSION_COOKIE_NAME}=;`);
  });

  it("rejects logout without the CSRF header or via GET", async () => {
    const noHeader = await app.request(
      "https://drawstyle.leeguoo.com/auth/logout",
      { method: "POST" },
      env,
    );
    expect(noHeader.status).toBe(403);
    expect(noHeader.headers.get("Set-Cookie")).toBeNull();

    const get = await app.request(
      "https://drawstyle.leeguoo.com/auth/logout",
      {},
      env,
    );
    expect(get.status).toBe(404);
    expect(get.headers.get("Set-Cookie")).toBeNull();
  });
});
