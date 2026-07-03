import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { SESSION_COOKIE_NAME, signSession, verifyBearer } from "./auth";
import { upsertUser } from "./db";

const TX_COOKIE_NAME = "oidc_tx";
const TX_TTL_SECONDS = 10 * 60;

type TokenFetcher = (url: string, init?: RequestInit) => Promise<Response>;

let tokenFetcher: TokenFetcher = (url, init) => fetch(url, init);

export function setTokenFetcher(fetcher?: TokenFetcher): void {
  tokenFetcher = fetcher ?? ((url, init) => fetch(url, init));
}

export const oidcRoutes = new Hono<{ Bindings: Env }>();

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesFromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sha256Base64Url(value: string): Promise<string> {
  return base64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  );
}

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)),
    ),
  );
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

async function signTx(
  payload: { state: string; verifier: string; exp: number },
  env: Env,
): Promise<string> {
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encoded}.${await hmac(encoded, env.SESSION_SECRET)}`;
}

async function verifyTx(
  cookie: string | undefined,
  env: Env,
): Promise<{ state: string; verifier: string; exp: number } | null> {
  if (!cookie) {
    return null;
  }
  const [encoded, signature] = cookie.split(".");
  if (!encoded || !signature) {
    return null;
  }
  const expected = await hmac(encoded, env.SESSION_SECRET);
  if (!constantTimeEqual(signature, expected)) {
    return null;
  }
  const parsed = JSON.parse(
    new TextDecoder().decode(bytesFromBase64Url(encoded)),
  ) as { state?: unknown; verifier?: unknown; exp?: unknown };
  if (
    typeof parsed.state !== "string" ||
    typeof parsed.verifier !== "string" ||
    typeof parsed.exp !== "number" ||
    parsed.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }
  return { state: parsed.state, verifier: parsed.verifier, exp: parsed.exp };
}

async function discovery(env: Env): Promise<{
  authorization_endpoint: string;
  token_endpoint: string;
}> {
  const issuer = env.OIDC_ISSUER.replace(/\/+$/g, "");
  const res = await tokenFetcher(`${issuer}/.well-known/openid-configuration`);
  if (!res.ok) {
    throw new Error("OIDC discovery failed");
  }
  const body = (await res.json()) as {
    authorization_endpoint?: string;
    token_endpoint?: string;
  };
  if (!body.authorization_endpoint || !body.token_endpoint) {
    throw new Error("OIDC discovery missing endpoints");
  }
  return {
    authorization_endpoint: body.authorization_endpoint,
    token_endpoint: body.token_endpoint,
  };
}

function redirectUri(requestUrl: string): string {
  return `${new URL(requestUrl).origin}/auth/callback`;
}

oidcRoutes.get("/login", async (c) => {
  const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const endpoints = await discovery(c.env);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: c.env.OIDC_CLIENT_ID,
    redirect_uri: redirectUri(c.req.url),
    scope: "openid email profile",
    state,
    code_challenge_method: "S256",
    code_challenge: await sha256Base64Url(verifier),
  });
  setCookie(
    c,
    TX_COOKIE_NAME,
    await signTx(
      {
        state,
        verifier,
        exp: Math.floor(Date.now() / 1000) + TX_TTL_SECONDS,
      },
      c.env,
    ),
    {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: TX_TTL_SECONDS,
      path: "/auth",
    },
  );
  return c.redirect(`${endpoints.authorization_endpoint}?${params.toString()}`);
});

oidcRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const tx = await verifyTx(getCookie(c, TX_COOKIE_NAME), c.env);
  deleteCookie(c, TX_COOKIE_NAME, { path: "/auth" });
  if (!code || !state || !tx || tx.state !== state) {
    return c.json({ error: { code: "bad_state", message: "invalid OIDC state" } }, 400);
  }

  const endpoints = await discovery(c.env);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(c.req.url),
    client_id: c.env.OIDC_CLIENT_ID,
    code_verifier: tx.verifier,
  });
  if (c.env.OIDC_CLIENT_SECRET) {
    body.set("client_secret", c.env.OIDC_CLIENT_SECRET);
  }
  const tokenRes = await tokenFetcher(endpoints.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) {
    return c.json({ error: { code: "token_exchange_failed", message: "login failed" } }, 400);
  }
  const token = (await tokenRes.json()) as { id_token?: string };
  if (!token.id_token) {
    return c.json({ error: { code: "missing_id_token", message: "login failed" } }, 400);
  }
  const claims = await verifyBearer(token.id_token, c.env);
  if (!claims?.sub) {
    return c.json({ error: { code: "bad_id_token", message: "login failed" } }, 400);
  }
  const user = await upsertUser(c.env.DB, {
    oidc_sub: claims.sub,
    email: claims.email ?? `${claims.sub}@account.leeguoo.com`,
    display_name: claims.name ?? claims.email ?? claims.sub,
  });
  setCookie(c, SESSION_COOKIE_NAME, await signSession(user.id, c.env), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return c.redirect("/");
});

// POST + custom header: logout is a session-cookie state change, so it gets
// the same CSRF gate as src/auth.ts resolveSessionUser (a bare <img>/<a> GET
// from another origin must not be able to log the user out).
oidcRoutes.post("/logout", (c) => {
  if (c.req.header("X-Requested-With") !== "drawstyle") {
    return c.json(
      { error: { code: "csrf_required", message: "X-Requested-With required" } },
      403,
    );
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
  return c.redirect("/");
});
