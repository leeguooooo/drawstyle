import { Hono } from "hono";
import { authOptional, type AuthVariables } from "./auth";
import { imageProxy } from "./images";

const app = new Hono<{ Bindings: Env; Variables: Partial<AuthVariables> }>();

app.get("/healthz", (c) => c.json({ ok: true }));
app.get("/img/:key", authOptional, imageProxy);

export default app;
