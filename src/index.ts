import { Hono } from "hono";
import { adminRoutes } from "./api/admin";
import { stylesReadRoutes } from "./api/styles-read";
import { stylesWriteRoutes } from "./api/styles-write";
import { authOptional, isAdminEmail, type AuthVariables } from "./auth";
import { imageProxy } from "./images";
import { oidcRoutes } from "./oidc";
import { adminPage } from "./pages/admin";
import { detailPage } from "./pages/detail";
import { galleryPage } from "./pages/gallery";
import { mePage } from "./pages/me";
import { submitPage } from "./pages/submit";

const app = new Hono<{ Bindings: Env; Variables: Partial<AuthVariables> }>();

app.get("/healthz", (c) => c.json({ ok: true }));
app.route("/auth", oidcRoutes);
app.get("/", authOptional, async (c) =>
  c.html(await galleryPage(c.env.DB, new URL(c.req.url).origin, c.var.user)),
);
app.get("/s/:slug", authOptional, async (c) => {
  const html = await detailPage(
    c.env.DB,
    new URL(c.req.url).origin,
    c.req.param("slug"),
    c.var.user,
  );
  return html ? c.html(html) : c.notFound();
});
app.get("/submit", authOptional, async (c) => {
  if (!c.var.user) {
    return c.redirect("/auth/login");
  }
  return c.html(
    await submitPage(
      c.env.DB,
      { fork: c.req.query("fork"), edit: c.req.query("edit") },
      c.var.user,
    ),
  );
});
app.get("/me", authOptional, async (c) => {
  if (!c.var.user) {
    return c.redirect("/auth/login");
  }
  return c.html(await mePage(c.env.DB, c.var.user));
});
app.get("/admin", authOptional, async (c) => {
  if (!c.var.user || !isAdminEmail(c.var.user.email, c.env)) {
    return c.text("forbidden", 403);
  }
  return c.html(await adminPage(c.env.DB, c.var.user));
});
app.get("/img/:key", authOptional, imageProxy);
app.route("/api", stylesReadRoutes);
app.route("/api", stylesWriteRoutes);
app.route("/api", adminRoutes);

export default app;
