"use strict";

// Standalone static preview: never import the game server, statistics store or MongoDB driver.
const path = require("node:path");
const Koa = require("koa");
const serve = require("koa-static");

function createPreviewApp(root = path.resolve(__dirname, "..")) {
  const app = new Koa();
  const staticFiles = serve(root, { hidden: false });
  app.use(async (ctx, next) => {
    ctx.set("Cache-Control", "no-store");
    ctx.set("X-Content-Type-Options", "nosniff");
    ctx.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
        "connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'"
    );
    if (!["GET", "HEAD"].includes(ctx.method)) {
      ctx.status = 405;
      ctx.set("Allow", "GET, HEAD");
      return;
    }
    if (ctx.path === "/") {
      ctx.redirect("/dev/preview/");
      return;
    }
    let decoded;
    try {
      decoded = decodeURIComponent(ctx.path);
    } catch {
      ctx.status = 400;
      return;
    }
    if (
      decoded.includes("\\") ||
      decoded.includes("\0") ||
      decoded.split("/").some((part) => part === ".." || part.startsWith(".")) ||
      !/^\/(assets|lib|src|dev\/preview)\//.test(decoded)
    ) {
      ctx.status = 404;
      return;
    }
    await staticFiles(ctx, next);
  });
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PREVIEW_PORT || 8090);
  const server = createPreviewApp().listen(port, "127.0.0.1", () => {
    process.stdout.write(`Local previews: http://127.0.0.1:${server.address().port}/dev/preview/\n`);
    process.stdout.write("Sound disabled. Static files only; no database or statistics API.\n");
  });
  server.on("error", (error) => {
    process.stderr.write(`Preview server: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { createPreviewApp };
