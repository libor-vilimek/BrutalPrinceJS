"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function fixture({ fetch, enabled = true } = {}) {
  let now = 0;
  let counter = 0;
  const timers = new Map();
  const listeners = new Map();
  const requests = [];
  const document = { hidden: false, hasFocus: () => true, addEventListener: (key, fn) => listeners.set(key, fn) };
  const window = {
    crypto: webcrypto,
    TextEncoder,
    AbortController,
    performance: { now: () => now },
    addEventListener: (key, fn) => listeners.set(key, fn),
    setTimeout(fn, ms) {
      const id = ++counter;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: () => ++counter,
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, options, body });
      if (fetch) {
        return fetch(url, options);
      }
      return {
        ok: true,
        json: async () => ({
          results: body.levels.map((level) => ({
            key: [level.mapId, level.mapRevision, level.levelNumber, level.day].join("|"),
            status: "stored"
          }))
        })
      };
    }
  };
  const PrinceJS = {
    currentLevel: 1,
    completedTutorials: new Set(),
    HordeSpawns: { create() {} },
    Utils: { flashRedDamage() {} }
  };
  const game = { settings: { values: { statistics: enabled } }, paused: false, sound: { play() {} } };
  const level = {};
  const kid = {
    game,
    level,
    room: 1,
    charBlockX: 1,
    charBlockY: 1,
    charX: 20,
    charY: 126,
    health: 10,
    maxHealth: 10,
    alive: true,
    active: true,
    visible: true,
    id: 0,
    charName: "kid",
    keyL: () => false,
    keyR: () => false,
    keyU: () => false,
    keyD: () => false,
    action: "stand",
    showSplash() {},
    hideSplash() {},
    bringAboveOpponent() {},
    onDamageLife: { dispatch() {} }
  };
  const enemy = { ...kid, id: 1, charName: "guard-1", baseCharName: "guard", room: 2, health: 3, charBlockX: 4 };
  const state = { game, level, kid, enemies: [enemy], tutorial: { active: null }, roomCamera: {} };
  const context = vm.createContext({
    PrinceJS,
    window,
    document,
    Date,
    Uint8Array,
    Phaser: { Sprite: function () {} }
  });
  for (const file of ["StatisticsSummary", "Statistics", "Actor", "Fighter", "Kid"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", `${file}.js`), "utf8"), context);
  }
  const stats = (game.statistics = new PrinceJS.Statistics(game));
  stats.prepareMap({ id: 1 });
  stats.beginLevel(state, { id: 1 });
  const events = (type) => stats.queue.map((entry) => entry.event).filter((event) => !type || event.eventType === type);
  function advance(ms) {
    now += ms;
    return now;
  }
  async function runTimers() {
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) {
        timers.delete(id);
        await timer.fn();
      }
    }
  }
  return {
    stats,
    game,
    state,
    kid,
    enemy,
    level,
    PrinceJS,
    context,
    document,
    window,
    timers,
    listeners,
    requests,
    advance,
    runTimers,
    events
  };
}

module.exports = { fixture };
