import { getCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import { getUserById, upsertUser, type UserRow } from "./db";

export const SESSION_COOKIE_NAME = "drawstyle_session";
const CACHE_TTL_MS = 60 * 60 * 1000;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ACCEPTED_AUDIENCES = new Set(["drawstyle-web", "drawstyle-cli"]);

export interface AuthVariables {
  user: UserRow;
  authSource: "bearer" | "session";
}

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface JwtClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  email?: string;
  name?: string;
  display_name?: string;
}

interface JwksKey extends JsonWebKey {
  kid?: string;
}

interface JwksDocument {
  keys?: JwksKey[];
}

type JwksFetcher = (url: string) => Promise<Response>;
type AnyAuthContext = Context<any>;

let jwksFetcher: JwksFetcher = (url) => fetch(url);
const discoveryCache = new Map<string, { jwksUri: string; expiresAt: number }>();
const jwksCache = new Map<string, { keys: JwksKey[]; expiresAt: number }>();

export function setJwksFetcher(fetcher?: JwksFetcher): void {
  jwksFetcher = fetcher ?? ((url) => fetch(url));
  discoveryCache.clear();
  jwksCache.clear();
}

function unauthorized(c: Context): Response {
  return c.json({ error: "unauthorized" }, 401);
}

function forbidden(c: Context, error = "forbidden"): Response {
  return c.json({ error }, 403);
}

function base64UrlToBytes(value: string): Uint8Array {
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

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseJsonPart<T>(part: string): T {
  const json = new TextDecoder().decode(base64UrlToBytes(part));
  return JSON.parse(json) as T;
}

async function loadDiscovery(env: Env): Promise<string> {
  const issuer = env.OIDC_ISSUER.replace(/\/+$/g, "");
  const cached = discoveryCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.jwksUri;
  }

  const res = await jwksFetcher(`${issuer}/.well-known/openid-configuration`);
  if (!res.ok) {
    throw new Error("OIDC discovery failed");
  }
  const body = (await res.json()) as { jwks_uri?: string };
  if (!body.jwks_uri) {
    throw new Error("OIDC discovery missing jwks_uri");
  }
  discoveryCache.set(issuer, {
    jwksUri: body.jwks_uri,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return body.jwks_uri;
}

async function loadJwks(env: Env): Promise<JwksKey[]> {
  const jwksUri = await loadDiscovery(env);
  const cached = jwksCache.get(jwksUri);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  const res = await jwksFetcher(jwksUri);
  if (!res.ok) {
    throw new Error("JWKS fetch failed");
  }
  const body = (await res.json()) as JwksDocument;
  const keys = body.keys ?? [];
  jwksCache.set(jwksUri, {
    keys,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return keys;
}

function hasAcceptedAudience(aud: string | string[] | undefined): boolean {
  if (typeof aud === "string") {
    return ACCEPTED_AUDIENCES.has(aud);
  }
  if (Array.isArray(aud)) {
    return aud.some((value) => ACCEPTED_AUDIENCES.has(value));
  }
  return false;
}

async function verifyJwt(token: string, env: Env): Promise<JwtClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  let header: JwtHeader;
  let claims: JwtClaims;
  try {
    header = parseJsonPart<JwtHeader>(parts[0]);
    claims = parseJsonPart<JwtClaims>(parts[1]);
  } catch {
    return null;
  }

  if (header.alg !== "RS256") {
    return null;
  }
  if (claims.iss !== env.OIDC_ISSUER.replace(/\/+$/g, "")) {
    return null;
  }
  if (!claims.sub || !claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  if (!hasAcceptedAudience(claims.aud)) {
    return null;
  }

  const keys = await loadJwks(env);
  const jwk = keys.find((key) => key.kid === header.kid) ?? keys[0];
  if (!jwk) {
    return null;
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  return verified ? claims : null;
}

function emailFromClaims(claims: JwtClaims): string {
  if (claims.email) {
    return claims.email;
  }
  return `${claims.sub}@account.leeguoo.com`;
}

function displayNameFromClaims(claims: JwtClaims): string {
  return claims.display_name ?? claims.name ?? claims.email ?? claims.sub ?? "User";
}

export async function verifyBearer(
  token: string,
  env: Env,
): Promise<JwtClaims | null> {
  return verifyJwt(token, env);
}

async function hmacSha256(data: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return new Uint8Array(signature);
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

export async function signSession(
  userId: number,
  env: Env,
  ttlSeconds = 30 * 24 * 60 * 60,
): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${userId}.${expiresAt}`;
  const signature = bytesToBase64Url(await hmacSha256(payload, env.SESSION_SECRET));
  return `${payload}.${signature}`;
}

export async function verifySession(
  cookie: string | undefined,
  env: Env,
): Promise<number | null> {
  if (!cookie) {
    return null;
  }
  const parts = cookie.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [rawUserId, rawExpiry, signature] = parts;
  const userId = Number.parseInt(rawUserId, 10);
  const expiresAt = Number.parseInt(rawExpiry, 10);
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(expiresAt)) {
    return null;
  }
  if (expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  const payload = `${rawUserId}.${rawExpiry}`;
  const expected = bytesToBase64Url(await hmacSha256(payload, env.SESSION_SECRET));
  return constantTimeEqual(signature, expected) ? userId : null;
}

async function resolveBearerUser(c: AnyAuthContext): Promise<UserRow | null> {
  const authorization = c.req.header("Authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }
  const claims = await verifyBearer(match[1], c.env);
  if (!claims?.sub) {
    return null;
  }
  return upsertUser(c.env.DB, {
    oidc_sub: claims.sub,
    email: emailFromClaims(claims),
    display_name: displayNameFromClaims(claims),
  });
}

async function resolveSessionUser(c: AnyAuthContext): Promise<UserRow | null> {
  const cookie = getCookie(c, SESSION_COOKIE_NAME);
  const userId = await verifySession(cookie, c.env);
  if (!userId) {
    return null;
  }
  if (
    !SAFE_METHODS.has(c.req.method.toUpperCase()) &&
    c.req.header("X-Requested-With") !== "drawstyle"
  ) {
    throw new Response(JSON.stringify({ error: "csrf_required" }), {
      status: 403,
      headers: { "content-type": "application/json; charset=UTF-8" },
    });
  }
  return getUserById(c.env.DB, userId);
}

async function resolveUser(
  c: AnyAuthContext,
): Promise<{ user: UserRow; source: "bearer" | "session" } | null> {
  const bearerUser = await resolveBearerUser(c);
  if (bearerUser) {
    return { user: bearerUser, source: "bearer" };
  }
  const sessionUser = await resolveSessionUser(c);
  if (sessionUser) {
    return { user: sessionUser, source: "session" };
  }
  return null;
}

export const authOptional: MiddlewareHandler<{
  Bindings: Env;
  Variables: Partial<AuthVariables>;
}> = async (c, next) => {
  try {
    const resolved = await resolveUser(c);
    if (resolved) {
      c.set("user", resolved.user);
      c.set("authSource", resolved.source);
    }
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return unauthorized(c);
  }
  return next();
};

export const requireUser: MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> = async (c, next) => {
  try {
    const resolved = await resolveUser(c);
    if (!resolved) {
      return unauthorized(c);
    }
    c.set("user", resolved.user);
    c.set("authSource", resolved.source);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return unauthorized(c);
  }
  return next();
};

function adminEmails(env: Env): Set<string> {
  return new Set(
    env.ADMIN_EMAILS.split(/[\s,]+/g)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const requireAdmin: MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> = async (c, next) => {
  try {
    const resolved = await resolveUser(c);
    if (!resolved) {
      return unauthorized(c);
    }
    c.set("user", resolved.user);
    c.set("authSource", resolved.source);
    if (!adminEmails(c.env).has(resolved.user.email.toLowerCase())) {
      return forbidden(c);
    }
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return unauthorized(c);
  }
  return next();
};
