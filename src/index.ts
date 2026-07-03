import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

app.get("/healthz", (c) => c.json({ ok: true }));

export default app;
