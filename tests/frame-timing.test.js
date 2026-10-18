"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const engine = fs.readFileSync(path.join(__dirname, "../lib/phaser.js"), "utf8");

// Execute the bundled engine's real scheduling methods, without DOM/rendering mocks.
function engineMethod(context, type, name) {
  const prototype = engine.slice(engine.indexOf(`Phaser.${type}.prototype = {`));
  const start = prototype.indexOf(`    ${name}: function (`);
  const end = prototype.indexOf("\n    },", start);
  return vm.runInContext(`({${prototype.slice(start, end + 6)}\n}).${name}`, context);
}

function fixture() {
  let now = 1000000;
  const context = vm.createContext({ Date: { now: () => now } });
  for (const name of ["Boot", "Game", "Cutscene", "Title"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", name + ".js"), "utf8"), context);
  }
  const prince = vm.runInContext("PrinceJS", context);
  for (const name of ["GameSettings", "Statistics", "TouchControls", "GameMenu"]) {
    prince[name] = function () {};
  }
  prince.Statistics.prototype.sample = function () {};
  prince.Utils = { applyQuery() {}, applyScreenWidth() {}, continueGame: () => false };
  const game = {
    forceSingleUpdate: true,
    _kickstart: false,
    _deltaTime: 0,
    _spiraling: 0,
    _lastCount: 0,
    _nextFpsNotification: 0,
    paused: false,
    canvas: {},
    raf: { _isSetTimeOut: false },
    fpsProblemNotifier: { dispatch() {} }
  };
  game.time = {
    game,
    now: 0,
    time: now,
    desiredFps: 60,
    desiredFpsMult: 1 / 60,
    physicsElapsed: 1 / 60,
    slowMotion: 1,
    events: { update() {} },
    _timers: [],
    update: engineMethod(context, "Time", "update"),
    refresh: engineMethod(context, "Time", "refresh")
  };
  prince.Boot.prototype.create.call({ game, world: { scale: { set() {} } }, state: { start() {} } });
  const elapsed = {};
  const track = (name) => ({ update: (dt) => (elapsed[name] = (elapsed[name] || 0) + dt) });
  const state = Object.assign(new prince.Game(game), {
    game,
    updateCamera: (dt) => track("camera").update(dt),
    tutorial: track("tutorial"),
    weapons: [track("weapon")]
  });
  for (const name of [
    "kick",
    "whip",
    "jetpack",
    "laserTurret",
    "bloodEffects",
    "enemyDeathEffects",
    "burningEnemyEffects"
  ]) {
    state[name] = track(name);
  }
  const cutscene = { game, finale: track("finale") };
  const title = {
    game,
    tick: 1,
    prince: { visible: true },
    presents: {},
    textBack: { updateCrop() {} },
    updateBrutalTitle: (dt) => track("title").update(dt)
  };
  let updates = 0;
  let renders = 0;
  game.updateLogic = () => {
    if (!game.paused) {
      updates++;
      state.update();
      prince.Cutscene.prototype.update.call(cutscene);
      prince.Title.prototype.update.call(title);
    }
  };
  game.updateRender = () => renders++;
  const update = engineMethod(context, "Game", "update");
  const frame = (ms) => {
    now += ms;
    update.call(game, now - 1000000);
  };
  return { game, frame, elapsed, updates: () => updates, renders: () => renders, title };
}

for (const fps of [30, 60, 90, 120, 144, 165, 240]) {
  test(`gameplay, camera, tutorials, title and finale keep real-time speed at ${fps} fps`, () => {
    const f = fixture();
    for (let i = 0; i < fps * 2; i++) {
      f.frame(1000 / fps);
    }
    assert(Math.abs(f.updates() - 120) <= 1, `Expected 120 logic steps, got ${f.updates()}`);
    assert.equal(f.renders(), fps * 2, "Catch-up logic must render only once per display frame");
    for (const [name, seconds] of Object.entries(f.elapsed)) {
      assert(Math.abs(seconds - 2) <= 1 / 60 + 1e-8, `${name} advanced ${seconds}s in 2 real seconds`);
    }
    assert.equal(f.title.tick, f.updates() + 1);
  });
}

test("paused frames do not advance actions, and a long frame has bounded catch-up", () => {
  const f = fixture();
  f.game.paused = true;
  for (let i = 0; i < 60; i++) {
    f.frame(1000 / 30);
  }
  assert.equal(f.updates(), 0);
  assert.deepEqual(f.elapsed, {});
  f.game.paused = false;
  f.frame(1000 / 60);
  assert(f.updates() <= 2);
  const before = f.updates();
  f.frame(5000);
  assert(f.updates() - before <= 3, "A stall must not cause unbounded replay");
  assert(f.elapsed.weapon <= 5 / 60 + 1e-8);
});
