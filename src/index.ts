import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  ASSETS: R2Bucket;
  OIDC_ISSUER: string;
  OIDC_CLIENT_ID: string;
  ADMIN_EMAILS: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/healthz", (c) => c.json({ ok: true }));

export default app;
