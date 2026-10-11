"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { StatisticsSummary } = require("../src/StatisticsSummary");
const { validateSummary } = require("../server/summaries");
const { fixture } = require("./statistics-fixture");
const { sampleEvents } = require("../tools/statistics-sample-data");

function event(eventType, payload, extra = {}) {
  return {
    mapId: "campaign:1",
    mapRevision: "abcd",
    levelNumber: 1,
    occurredAt: new Date().toISOString(),
    location: { roomId: 1, tileColumn: 4, tileRow: 2 },
    eventType,
    payload,
    ...extra
  };
}

test("10,000 enemy deaths become one counter with over 99% less JSON and no enemy identity", () => {
  const accumulator = new StatisticsSummary();
  const events = [];
  let key;
  for (let id = 1; id <= 10000; id++) {
    const death = event("enemy_died", {
      mechanism: "fire",
      weapon: "molotov",
      guardId: id,
      victimInstanceId: `guard:${id}`
    });
    events.push(death);
    key = accumulator.add(death);
  }
  const level = accumulator.snapshot(key);
  assert.equal(validateSummary(level), null);
  assert.deepEqual(level.kills, [{ cause: "fire", weapon: "molotov", count: 10000 }]);
  assert.equal(level.counters.enemyDeaths, 10000);
  assert(!JSON.stringify(level).includes("guardId"));
  assert(!JSON.stringify(level).includes("victimInstanceId"));
  const ratio = Buffer.byteLength(JSON.stringify(level)) / Buffer.byteLength(JSON.stringify(events));
  assert(ratio < 0.01, `Expected over 99% reduction, got ${ratio}`);
});

test("Prince damage groups by guard and screen, deaths by source and tile, floors retain their origin", () => {
  const accumulator = new StatisticsSummary();
  const guard = {
    kind: "guard",
    guardId: 2,
    roomId: 1,
    tileColumn: 3,
    tileRow: 2,
    spawnLocation: { roomId: 1, tileColumn: 7, tileRow: 2 }
  };
  let key;
  for (let hit = 0; hit < 4; hit++) {
    key = accumulator.add(
      event("prince_damaged", { mechanism: "sword", hpLost: 2, source: { ...guard, tileColumn: hit } })
    );
    accumulator.add(event("prince_died", { mechanism: "sword", source: guard }));
  }
  const floor = { kind: "tile", roomId: 4, tileColumn: 8, tileRow: 0, tileType: 11 };
  accumulator.add(event("prince_died", { mechanism: "fall", source: { kind: "environment" }, supportingTile: floor }));
  const level = accumulator.snapshot(key);
  assert.equal(validateSummary(level), null);
  assert.equal(level.damage.length, 1);
  assert.equal(level.damage[0].hits, 4);
  assert.equal(level.damage[0].hpLost, 8);
  assert.equal(level.deaths.length, 2);
  assert.equal(level.deaths[0].count, 4);
  assert.deepEqual(level.deaths[1].source, floor);
  assert.equal(level.counters.princeDeaths, 5);
});

test("unusual maps overflow into a bounded other bucket without losing deaths or HP", () => {
  const accumulator = new StatisticsSummary();
  let key;
  for (let id = 1; id <= 400; id++) {
    const source = { kind: "guard", guardId: id, roomId: 1 };
    key = accumulator.add(event("prince_damaged", { mechanism: "sword", source, hpLost: 1 }));
    accumulator.add(event("prince_died", { mechanism: "sword", source }));
  }
  const level = accumulator.snapshot(key);
  assert.equal(validateSummary(level), null);
  assert.equal(level.damage.length, 128);
  assert.equal(level.deaths.length, 128);
  assert.equal(level.deaths.at(-1).count, 273);
  assert.equal(level.counters.hpLost, 400);
  assert.equal(level.counters.princeDeaths, 400);
});

test("clientId survives a level restart; opt-in and page opens create fresh identities", async () => {
  const f = fixture();
  const firstId = f.stats.clientId;
  f.stats.beginLevel(f.state, { id: 1 }, "restart");
  await f.stats.flush();
  assert.equal(f.requests[0].body.clientId, firstId);
  assert.equal(f.requests[0].body.levels[0].counters.starts, 2);
  assert(!JSON.stringify(f.requests[0].body).includes("attemptId"));
  assert(!JSON.stringify(f.requests[0].body).includes("eventId"));
  f.stats.setEnabled(false);
  f.stats.setEnabled(true);
  await f.stats.flush();
  assert.notEqual(f.requests[1].body.clientId, firstId);
  assert.equal(f.requests[1].body.levels[0].counters.observations, 1);
  assert.equal(f.requests[1].body.levels[0].counters.starts, undefined);
  assert.notEqual(fixture().stats.clientId, firstId);
});

test("all random sample observations compact into valid daily summaries with matching totals", () => {
  const events = sampleEvents(180);
  const accumulator = new StatisticsSummary();
  for (const row of events) {
    accumulator.add(row);
  }
  const levels = [...accumulator.levels.keys()].map((key) => accumulator.snapshot(key));
  for (const level of levels) {
    assert.equal(validateSummary(level), null);
  }
  assert.equal(
    levels.reduce((sum, level) => sum + (level.counters.enemyDeaths || 0), 0),
    events.filter((row) => row.eventType === "enemy_died").length
  );
  assert.equal(
    levels.reduce((sum, level) => sum + (level.counters.princeDeaths || 0), 0),
    events.filter((row) => row.eventType === "prince_died").length
  );
  assert.equal(
    levels.reduce((sum, level) => sum + (level.counters.activeMs || 0), 0),
    events.reduce((sum, row) => sum + (row.payload.activeMs || 0), 0)
  );
  assert(Buffer.byteLength(JSON.stringify(levels)) < Buffer.byteLength(JSON.stringify(events)) * 0.2);
});

test("invalid dimensions, dates, extra fields and mismatched totals are rejected", () => {
  const accumulator = new StatisticsSummary();
  const key = accumulator.add(event("enemy_died", { mechanism: "fire", weapon: "molotov" }));
  const level = accumulator.snapshot(key);
  assert.equal(validateSummary({ ...level, email: "private@example.com" }), "invalid_summary");
  assert.equal(validateSummary({ ...level, day: "2026-02-30" }), "invalid_summary");
  assert.equal(validateSummary({ ...level, counters: { enemyDeaths: 2 } }), "inconsistent_totals");
  assert.equal(validateSummary({ ...level, kills: [{ ...level.kills[0], count: -1 }] }), "invalid_counter");
  assert.equal(validateSummary({ ...level, kills: [...level.kills, ...level.kills] }), "duplicate_group");
});

test("enemy hits alone do not send unchanged summaries or create false activity reports", async () => {
  const f = fixture();
  await f.stats.flush();
  f.stats.record("enemy_damaged", { hpLost: 1, mechanism: "fire" });
  f.advance(20000);
  await f.runTimers();
  await f.stats.flush();
  assert.equal(f.requests.length, 1);
  assert.equal(f.stats.queue.length, 0);
});

test("UTC days, levels and map revisions have independent counters", () => {
  const accumulator = new StatisticsSummary();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const base = event("enemy_died", { mechanism: "fire", weapon: "molotov" });
  const keys = [
    accumulator.add(base),
    accumulator.add({ ...base, occurredAt: yesterday }),
    accumulator.add({ ...base, mapRevision: "different" }),
    accumulator.add({ ...base, mapId: "campaign:2", levelNumber: 2 })
  ];
  assert.equal(new Set(keys).size, 4);
  for (const key of keys) {
    const level = accumulator.snapshot(key);
    assert.equal(validateSummary(level), null);
    assert.equal(level.counters.enemyDeaths, 1);
  }
});
