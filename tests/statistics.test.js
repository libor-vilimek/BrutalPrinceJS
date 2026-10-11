"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { fixture } = require("./statistics-fixture");
const { validateEvent } = require("../server/events");
const { StatisticsSummary } = require("../src/StatisticsSummary");

test("every event uses the three-second trailing batch delay, preserving events arriving during a request", async () => {
  let release;
  const f = fixture({
    fetch: async (url, options) => {
      await new Promise((resolve) => {
        release = resolve;
      });
      return {
        ok: true,
        json: async () => ({
          results: JSON.parse(options.body).levels.map((level) => ({
            key: StatisticsSummary.key(level),
            status: "stored"
          }))
        })
      };
    }
  });
  f.advance(2500);
  f.stats.record("room_entered", { fromRoom: 1 });
  f.advance(2999);
  await f.runTimers();
  assert.equal(f.requests.length, 0);
  f.advance(1);
  const flush = f.stats.flush();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].body.levels.length, 1);
  assert.equal(f.requests[0].body.levels[0].rooms[0].visits, 1);
  f.stats.record("room_entered", { fromRoom: 2 });
  release();
  await flush;
  assert.equal(f.stats.queue.length, 1);
  assert.equal(f.stats.queue[0].event.payload.fromRoom, 2);
});

test("continuous events flush within twenty seconds, with one request in flight", async () => {
  const f = fixture();
  for (let second = 1; second <= 20; second++) {
    f.advance(1000);
    f.stats.record("room_entered", { fromRoom: 1 });
    await f.runTimers();
  }
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].body.levels.length, 1);
  assert.equal(f.requests[0].body.levels[0].rooms[0].visits, 20);
});

test("network failures silently retry the same IDs and do not affect game health", async () => {
  let attempts = 0;
  const f = fixture({
    fetch: async (url, options) => {
      if (++attempts === 1) {
        throw new Error("offline");
      }
      return {
        ok: true,
        json: async () => ({
          results: JSON.parse(options.body).levels.map((level) => ({
            key: StatisticsSummary.key(level),
            status: "stored"
          }))
        })
      };
    }
  });
  const id = f.events()[0].eventId;
  await f.stats.flush();
  assert.equal(f.kid.health, 10);
  assert.equal(f.stats.queue[0].event.eventId, id);
  assert(f.stats.retryAt > 0);
  f.advance(10000);
  await f.runTimers();
  assert.deepEqual(f.requests[1].body.levels, f.requests[0].body.levels);
  assert.equal(f.requests[1].body.clientId, f.stats.clientId);
  assert.equal(f.stats.queue.length, 0);
});

test("idle simulation and blocked movement produce no activity, while a short action still marks its window", () => {
  const f = fixture();
  f.kid.keyR = () => true;
  for (let i = 0; i < 160; i++) {
    f.advance(250);
    f.stats.sample();
    f.stats.reportActivity();
  }
  assert.equal(f.events("level_activity").length, 0);
  f.kid.charX++;
  f.stats.sample();
  f.kid.keyR = () => false;
  for (let i = 0; i < 80; i++) {
    f.advance(250);
    f.stats.sample();
    f.stats.reportActivity();
  }
  assert.equal(f.events("level_activity").length, 1);
  assert(f.events("level_activity")[0].payload.activeMs <= 20000);
  for (let i = 0; i < 160; i++) {
    f.advance(250);
    f.stats.sample();
    f.stats.reportActivity();
  }
  assert.equal(f.events("level_activity").length, 1);
});

test("pause, tutorial, blur and hidden tabs discard stale presence without losing discrete queued events", () => {
  for (const mode of ["pause", "tutorial", "blur", "hidden"]) {
    const f = fixture();
    f.stats.playerAction();
    if (mode === "pause") {
      f.game.paused = true;
    }
    if (mode === "tutorial") {
      f.state.tutorial.active = {};
    }
    if (mode === "blur") {
      f.listeners.get("blur")();
    }
    if (mode === "hidden") {
      f.document.hidden = true;
    }
    f.advance(40000);
    f.stats.reportActivity();
    assert.equal(f.events("level_activity").length, 0, mode);
    assert.equal(f.events("level_started").length, 1);
  }
});

test("opt-out aborts in-flight data, clears retries and re-enables with a partial observation and new identifiers", async () => {
  let release;
  const f = fixture({
    fetch: async () => {
      await new Promise((resolve) => {
        release = resolve;
      });
      return { ok: false, status: 503 };
    }
  });
  const oldSession = f.stats.sessionId;
  const request = f.stats.flush();
  const signal = f.requests[0].options.signal;
  f.stats.setEnabled(false);
  assert(signal.aborted);
  assert.equal(f.stats.queue.length, 0);
  f.stats.record("prince_died");
  assert.equal(f.stats.queue.length, 0);
  f.stats.setEnabled(true);
  release();
  await request;
  assert.notEqual(f.stats.sessionId, oldSession);
  assert.equal(f.events("level_started").length, 0);
  assert.equal(f.events("level_observation_started").length, 1);
  assert.equal(f.events()[0].partialAttempt, true);
  assert.equal(f.stats.failures, 0);
});

test("real health paths attribute guard damage and fatal loss once, before death callbacks", () => {
  const f = fixture();
  f.kid.health = 2;
  f.PrinceJS.Kid.prototype.damageLife.call(f.kid, false, { mechanism: "sword", actor: f.enemy });
  assert.equal(f.events("prince_damaged")[0].payload.hpLost, 1);
  assert.equal(f.events("prince_damaged")[0].payload.source.guardId, 1);
  assert.equal(f.events("prince_damaged")[0].payload.source.roomId, 2);
  f.kid.die = f.PrinceJS.Fighter.prototype.die;
  f.PrinceJS.Kid.prototype.damageLife.call(f.kid, false, { mechanism: "sword", actor: f.enemy });
  f.kid.die();
  assert.equal(f.events("prince_died").length, 1);
  assert.equal(f.events("level_ended").length, 1);
  assert.equal(f.events("prince_died")[0].payload.healthBefore, 1);
  for (const event of f.events()) {
    assert.equal(validateEvent(event), null, event.eventType);
  }
});

test("fire and later corpse/trap callbacks cannot duplicate a kill; falls preserve known initiating actions", () => {
  const f = fixture();
  f.enemy.die = f.PrinceJS.Fighter.prototype.die;
  f.enemy.die(undefined, { mechanism: "fire", actor: f.kid, weapon: "molotov" });
  f.enemy.die("falldead");
  assert.equal(f.events("enemy_died").length, 1);
  assert.equal(f.events("enemy_died")[0].payload.hpLost, 3);
  f.enemy.alive = true;
  f.enemy.health = 2;
  f.enemy.id = 2;
  f.stats.initiated(f.enemy, "whip");
  const spikes = { room: 3, roomX: 4, roomY: 2, element: 2 };
  f.enemy.room = 3;
  f.PrinceJS.Fighter.prototype.dieSpikes.call(f.enemy, spikes);
  const death = f.events("enemy_died")[1];
  assert.equal(death.payload.mechanism, "spikes");
  assert.equal(death.payload.causalChain[0].weapon, "whip");
  assert.equal(death.payload.source.roomId, 3);
  assert.equal(death.payload.departureLocation.roomId, 2);
});

test("queue overflow remains bounded and retains deaths over ordinary events", () => {
  const f = fixture();
  for (let i = 0; i < 1100; i++) {
    f.stats.record("room_entered", { fromRoom: 1 });
  }
  f.stats.record("enemy_died", { victimInstanceId: "guard:1" });
  assert.equal(f.stats.queue.length, 1000);
  assert(f.stats.dropped > 0);
  assert.equal(f.events("enemy_died").length, 1);
});

test("shared shadow damage links both actors and counts one death each, while skeleton immunity stays unrecorded", () => {
  const f = fixture();
  f.enemy.charName = "shadow";
  f.enemy.baseCharName = "shadow";
  f.enemy.health = 2;
  f.enemy.opponent = f.kid;
  f.enemy.damageLife = f.PrinceJS.Fighter.prototype.damageLife;
  f.enemy.die = f.PrinceJS.Fighter.prototype.die;
  f.kid.health = 2;
  f.kid.damageLife = f.PrinceJS.Kid.prototype.damageLife;
  f.kid.die = f.PrinceJS.Fighter.prototype.die;
  f.enemy.damageLife(false, { mechanism: "sword", actor: f.kid, weapon: "sword" });
  assert.equal(f.events("prince_damaged")[0].payload.causalChain[0].eventId, f.events("enemy_damaged")[0].eventId);
  f.enemy.damageLife(false, { mechanism: "sword", actor: f.kid, weapon: "sword" });
  assert.equal(f.events("enemy_died").length, 1);
  assert.equal(f.events("prince_died").length, 1);
  assert.equal(f.events("prince_died")[0].payload.mechanism, "shared_shadow_damage");
  const skeleton = fixture();
  skeleton.enemy.charName = "skeleton";
  skeleton.PrinceJS.Fighter.prototype.damageLife.call(skeleton.enemy);
  skeleton.PrinceJS.Fighter.prototype.die.call(skeleton.enemy);
  assert.equal(skeleton.enemy.health, 3);
  assert.equal(skeleton.events("enemy_died").length, 0);
  assert.equal(skeleton.events("enemy_damaged").length, 0);
});

test("moving floors preserve source tile while recording impact and telemetry faults stay contained", () => {
  const f = fixture();
  const tile = { room: 1, roomX: 4, roomY: 0, element: 11 };
  tile.statisticsOrigin = f.stats.tile(tile);
  tile.room = 3;
  tile.roomY = 2;
  f.kid.health--;
  f.stats.healthChanged(f.kid, 10, { mechanism: "falling_floor", tile });
  const damage = f.events("prince_damaged")[0];
  assert.equal(damage.payload.source.roomId, 1);
  assert.equal(damage.payload.source.tileRow, 0);
  assert.equal(damage.payload.impactLocation.roomId, 3);
  assert.equal(damage.payload.impactLocation.tileRow, 2);
  const circular = {};
  circular.self = circular;
  assert.doesNotThrow(() => f.stats.record("room_entered", circular));
  assert.equal(f.kid.health, 9);
});
