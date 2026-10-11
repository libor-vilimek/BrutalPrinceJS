"use strict";

const path = require("node:path");
const Koa = require("koa");
const serve = require("koa-static");
const { readFile } = require("node:fs/promises");

const MAX_BYTES = 256 * 1024;

async function readJson(request) {
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BYTES) {
      const error = new Error("Request too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (cause) {
    const error = new Error("Invalid JSON", { cause });
    error.status = 400;
    throw error;
  }
}

function createApp({
  store,
  publicOrigin,
  root = path.resolve(__dirname, ".."),
  rateLimit = 120,
  now = Date.now,
  gameVersion = "development",
  dashboard = false,
  sampleData = false
} = {}) {
  const app = new Koa();
  app.silent = true; // Never log raw driver errors containing connection credentials.
  const buckets = new Map();
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      ctx.status = [400, 413].includes(error.status) ? error.status : 503;
      ctx.body = {
        error: ctx.status === 400 ? "invalid_json" : ctx.status === 413 ? "batch_too_large" : "statistics_unavailable"
      };
      if (ctx.status === 503) {
        ctx.set("Retry-After", "10");
      }
    }
  });
  app.use(async (ctx, next) => {
    const files = {
      "/statistics": "index.html",
      "/statistics/": "index.html",
      "/statistics/dashboard.js": "dashboard.js",
      "/statistics/style.css": "style.css"
    };
    if (!Object.hasOwn(files, ctx.path) && ctx.path !== "/api/v1/statistics") {
      await next();
      return;
    }
    // Access is checked against the actual socket, never an untrusted forwarding header.
    const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ctx.req.socket.remoteAddress);
    const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(ctx.host);
    if (!dashboard || !local || !localHost) {
      ctx.status = 404;
      return;
    }
    if (
      (ctx.get("Origin") && ctx.get("Origin") !== `${ctx.protocol}://${ctx.host}`) ||
      ctx.get("Sec-Fetch-Site") === "cross-site"
    ) {
      ctx.status = 403;
      return;
    }
    ctx.set("Cache-Control", "no-store");
    ctx.set("X-Content-Type-Options", "nosniff");
    ctx.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'"
    );
    if (!["GET", "HEAD"].includes(ctx.method)) {
      ctx.status = 405;
      ctx.set("Allow", "GET, HEAD");
      return;
    }
    if (ctx.path === "/api/v1/statistics") {
      const days = Number(ctx.query.days || 30);
      const level = ctx.query.level === undefined ? undefined : Number(ctx.query.level);
      if (
        ![7, 30, 90].includes(days) ||
        (level !== undefined && (!Number.isSafeInteger(level) || level < 1 || level > 100000))
      ) {
        ctx.status = 400;
        ctx.body = { error: "invalid_filters" };
        return;
      }
      ctx.body = { ...(await store.report({ days, level })), sampleData };
    } else {
      const file = files[ctx.path];
      ctx.type = path.extname(file);
      ctx.body = await readFile(path.join(__dirname, "dashboard", file));
    }
  });
  app.use(async (ctx, next) => {
    if (ctx.path === "/game-version.js" && ["GET", "HEAD"].includes(ctx.method)) {
      ctx.type = "application/javascript";
      ctx.set("Cache-Control", "no-cache");
      ctx.body = `PrinceJS.gameVersion = ${JSON.stringify(gameVersion)};`;
      return;
    }
    if (ctx.path !== "/api" && !ctx.path.startsWith("/api/")) {
      await next();
      return;
    }
    ctx.set("Cache-Control", "no-store");
    if (ctx.path !== "/api/v1/gameplay-events") {
      ctx.status = 404;
      ctx.body = { error: "unknown_api_route" };
      return;
    }
    if (ctx.method !== "POST") {
      ctx.status = 405;
      ctx.set("Allow", "POST");
      ctx.body = { error: "method_not_allowed" };
      return;
    }
    const origin = ctx.get("Origin");
    if (
      (origin && origin !== (publicOrigin || `${ctx.protocol}://${ctx.host}`)) ||
      ctx.get("Sec-Fetch-Site") === "cross-site"
    ) {
      ctx.status = 403;
      ctx.body = { error: "origin_not_allowed" };
      return;
    }
    const time = now();
    if (buckets.size >= 10000) {
      for (const [key, bucket] of buckets) {
        if (time >= bucket.until) {
          buckets.delete(key);
        }
      }
      if (buckets.size >= 10000 && !buckets.has(ctx.ip)) {
        ctx.status = 429;
        ctx.set("Retry-After", "60");
        ctx.body = { error: "rate_limited" };
        return;
      }
    }
    let bucket = buckets.get(ctx.ip);
    if (!bucket || time >= bucket.until) {
      bucket = { until: time + 60000, count: 0 };
      buckets.set(ctx.ip, bucket);
    }
    if (++bucket.count > rateLimit) {
      ctx.status = 429;
      ctx.set("Retry-After", String(Math.ceil((bucket.until - time) / 1000)));
      ctx.body = { error: "rate_limited" };
      return;
    }
    if (!ctx.is("application/json") || ctx.get("Content-Encoding")) {
      ctx.status = 415;
      ctx.body = { error: "json_required" };
      return;
    }
    if (Number(ctx.get("Content-Length")) > MAX_BYTES) {
      ctx.status = 413;
      ctx.body = { error: "batch_too_large" };
      return;
    }
    const batch = await readJson(ctx.req);
    if (
      !batch ||
      batch.schemaVersion !== 1 ||
      !Array.isArray(batch.events) ||
      batch.events.length < 1 ||
      batch.events.length > 100 ||
      Object.keys(batch).some((key) => !["schemaVersion", "events", "droppedEventCount"].includes(key)) ||
      (batch.droppedEventCount !== undefined &&
        (!Number.isSafeInteger(batch.droppedEventCount) || batch.droppedEventCount < 0))
    ) {
      ctx.status = 400;
      ctx.body = { error: "invalid_batch" };
      return;
    }
    ctx.body = {
      results: await store.write(batch.events, batch.droppedEventCount || 0),
      droppedEventCount: batch.droppedEventCount || 0
    };
  });
  // Serve only published game files. Repository metadata, server code, and environment files are never public.
  const staticFiles = serve(root, { hidden: false });
  app.use(async (ctx, next) => {
    let decoded;
    try {
      decoded = decodeURIComponent(ctx.path);
    } catch (error) {
      ctx.status = 400;
      return;
    }
    if (
      decoded.includes("\\") ||
      decoded.includes("\0") ||
      decoded.split("/").some((part) => part === ".." || part.startsWith("."))
    ) {
      ctx.status = 404;
      return;
    }
    if (["/", "/index.html", "/site.webmanifest"].includes(decoded) || /^\/(assets|lib|src)\//.test(decoded)) {
      await staticFiles(ctx, next);
    } else {
      await next();
    }
  });
  return app;
}

module.exports = { createApp };
