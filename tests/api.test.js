"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const http = require("node:http");
const { createApp } = require("../server/app");
const { fixture } = require("./statistics-fixture");
const { validateEvent } = require("../server/events");
const { validateSummary } = require("../server/summaries");
const { StatisticsSummary } = require("../src/StatisticsSummary");

test("compact API validates the client/envelope and acknowledges summaries only after storage", async (t) => {
  const f = fixture();
  const levels = [...f.stats.summaries.levels.keys()].map((key) => f.stats.summaries.snapshot(key));
  let called = 0;
  const url = await server(t, {
    store: {
      async writeSummaries(clientId, rows) {
        assert.equal(clientId, f.stats.clientId);
        called++;
        return rows.map((level) => ({
          key: StatisticsSummary.key(level),
          status: validateSummary(level) ? "rejected" : "stored"
        }));
      }
    }
  });
  const body = { schemaVersion: 2, clientId: f.stats.clientId, levels };
  const post = (value) =>
    fetch(url + "/api/v2/gameplay-statistics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value)
    });
  for (const value of [
    { ...body, clientId: "device-name" },
    { ...body, email: "private@example.com" },
    { ...body, droppedEventCount: -1 },
    { ...body, levels: [] }
  ]) {
    assert.equal((await post(value)).status, 400);
  }
  assert.equal(called, 0);
  const response = await post(body);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results[0].status, "stored");
  assert.equal(called, 1);
});

async function server(t, options = {}) {
  const app = createApp({
    store: { write: async (events) => events.map((event) => ({ eventId: event.eventId, status: "stored" })) },
    ...options
  });
  const listener = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => listener.once("listening", resolve));
  t.after(() => new Promise((resolve) => listener.close(resolve)));
  return `http://127.0.0.1:${listener.address().port}`;
}

test("Koa serves the existing game and assets but never environment files, repository files or backend source", async (t) => {
  const url = await server(t);
  for (const route of ["/", "/src/Statistics.js", "/assets/web/game.css", "/game-version.js"]) {
    assert.equal((await fetch(url + route)).status, 200, route);
  }
  for (const route of [
    "/.env",
    "/.env.example",
    "/server/index.js",
    "/package.json",
    "/.git/config",
    "/api/missing",
    "/src/%2e%2e%2fserver/index.js"
  ]) {
    assert.equal((await fetch(url + route)).status, 404, route);
  }
});

test("batch endpoint restricts methods, origin, content type, body size and rate", async (t) => {
  const url = await server(t, { rateLimit: 3 });
  const endpoint = url + "/api/v1/gameplay-events";
  assert.equal((await fetch(endpoint)).status, 405);
  assert.equal((await fetch(endpoint, { method: "POST", headers: { Origin: "https://foreign.example" } })).status, 403);
  assert.equal((await fetch(endpoint, { method: "POST" })).status, 415);
  assert.equal(
    (await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).status,
    400
  );
  assert.equal(
    (
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: " ".repeat(262145)
      })
    ).status,
    413
  );
  assert.equal((await fetch(endpoint, { method: "POST" })).status, 429);
});

test("database failure is a sanitized retryable response; acceptance awaits persistence", async (t) => {
  let release;
  const url = await server(t, {
    store: {
      write: async () => {
        await new Promise((resolve) => {
          release = resolve;
        });
        throw new Error("mongodb://secret");
      }
    }
  });
  const response = fetch(url + "/api/v1/gameplay-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schemaVersion: 1, events: fixture().events() })
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  release();
  const result = await response;
  assert.equal(result.status, 503);
  assert.equal(result.headers.get("Retry-After"), "10");
  assert.deepEqual(await result.json(), { error: "statistics_unavailable" });
});

test("validation rejects injected fields, invalid health deltas, source coordinates and unknown schema", () => {
  const event = fixture().events()[0];
  assert.equal(validateEvent(event), null);
  assert(validateEvent({ ...event, email: "someone@example.com" }));
  assert(validateEvent({ ...event, schemaVersion: 2 }));
  assert(validateEvent({ ...event, location: { roomId: 1, tileColumn: 99 } }));
  assert(validateEvent({ ...event, payload: { reason: "new_game", source: { $where: "bad" } } }));
  assert(
    validateEvent({
      ...event,
      eventType: "prince_damaged",
      payload: {
        healthBefore: 10,
        healthAfter: 8,
        hpLost: 9,
        mechanism: "sword",
        source: { kind: "guard", guardId: 1 }
      }
    })
  );
});

test("statistics dashboard is opt-in and local, with bounded filters and sanitized failures", async (t) => {
  const disabled = await server(t);
  assert.equal((await fetch(disabled + "/statistics")).status, 404);
  assert.equal((await fetch(disabled + "/api/v1/statistics")).status, 404);
  let options;
  const url = await server(t, {
    dashboard: true,
    sampleData: true,
    store: {
      report: async (value) => {
        options = value;
        return { totals: { events: 42 } };
      }
    }
  });
  const page = await fetch(url + "/statistics");
  assert.equal(page.status, 200);
  assert(page.headers.get("Content-Security-Policy").includes("frame-ancestors 'none'"));
  assert((await page.text()).includes("Every death tells a story."));
  const response = await fetch(url + "/api/v1/statistics?days=7&level=3");
  assert.deepEqual(await response.json(), { totals: { events: 42 }, sampleData: true });
  assert.deepEqual(options, { days: 7, level: 3, source: "all" });
  await fetch(url + "/api/v1/statistics?source=gameplay");
  assert.equal(options.source, "gameplay");
  assert.equal((await fetch(url + "/api/v1/statistics?source=unknown")).status, 400);
  assert.equal((await fetch(url + "/api/v1/statistics?days=999")).status, 400);
  assert.equal((await fetch(url + "/api/v1/statistics?level=abc")).status, 400);
  assert.equal(
    (await fetch(url + "/api/v1/statistics", { headers: { Origin: "https://foreign.example" } })).status,
    403
  );
  const foreignHostStatus = await new Promise((resolve, reject) => {
    http
      .get(url + "/statistics", { headers: { Host: "foreign.example" } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      })
      .on("error", reject);
  });
  assert.equal(foreignHostStatus, 404);
});
