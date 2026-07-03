import { Hono } from "hono";
import { adminRoutes } from "./api/admin";
import { stylesReadRoutes } from "./api/styles-read";
import { stylesWriteRoutes } from "./api/styles-write";
import { authOptional, type AuthVariables } from "./auth";
import { imageProxy } from "./images";

const app = new Hono<{ Bindings: Env; Variables: Partial<AuthVariables> }>();

app.get("/healthz", (c) => c.json({ ok: true }));
app.get("/img/:key", authOptional, imageProxy);
app.route("/api", stylesReadRoutes);
app.route("/api", stylesWriteRoutes);
app.route("/api", adminRoutes);

export default app;
