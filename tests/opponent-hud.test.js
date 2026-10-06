"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

class Signal {
  constructor() {
    this.listeners = [];
  }
  add(fn, context) {
    this.listeners.push({ fn, context });
  }
  remove(fn, context) {
    this.listeners = this.listeners.filter((item) => item.fn !== fn || item.context !== context);
  }
  dispatch(...args) {
    for (const item of [...this.listeners]) {
      item.fn.apply(item.context, args);
    }
  }
}

test("changing the HUD opponent preserves enemy damage and story death listeners", () => {
  const PrinceJS = { SCREEN_WIDTH: 320, Enemy: { COLOR: [] } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "Interface.js"), "utf8"), { PrinceJS });
  const ui = Object.assign(Object.create(PrinceJS.Interface.prototype), {
    game: { add: { sprite: () => ({ visible: true, destroy() {} }) } },
    layer: { addChild() {} },
    opp: null,
    oppHPs: []
  });
  const makeEnemy = () => ({
    active: true,
    charName: "guard",
    baseCharName: "guard",
    charColor: 0,
    health: 3,
    onDamageLife: new Signal(),
    onDead: new Signal()
  });
  const first = makeEnemy();
  const second = makeEnemy();
  let damageCallbacks = 0;
  let deathCallbacks = 0;
  first.onDamageLife.add(() => damageCallbacks++);
  first.onDead.add(() => deathCallbacks++);

  ui.setOpponentLive(first);
  ui.setOpponentLive(second);
  first.onDamageLife.dispatch(1);
  first.onDead.dispatch(first);
  assert.equal(damageCallbacks, 1);
  assert.equal(deathCallbacks, 1);
  assert.equal(ui.opp, second);
  assert.equal(ui.oppHPActive, 3);

  second.onDamageLife.dispatch(1);
  assert.equal(ui.oppHPActive, 2);
  second.onDead.dispatch(second);
  assert.equal(ui.opp, null);
  assert.equal(ui.oppHPActive, 0);
});

test("enemy deaths dispatch their callbacks silently even when many guards die together", () => {
  const pending = [];
  const played = [];
  let deaths = 0;
  let bossFlashes = 0;
  const PrinceJS = {
    Actor: function () {},
    Utils: { delayed: (fn) => pending.push(fn), flashWhiteVizierVictory: () => bossFlashes++ }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "Fighter.js"), "utf8"), { PrinceJS });
  for (const type of [...Array(30).fill("guard"), "shadow", "jaffar"]) {
    const enemy = {
      charName: type === "guard" ? "guard-1" : type,
      baseCharName: type,
      game: { sound: { play: (name) => played.push(name) } },
      showSplash() {},
      proceedOnDead() {
        deaths++;
      }
    };
    PrinceJS.Fighter.prototype.CMD_DIE.call(enemy);
    assert.equal(enemy.alive, false);
    assert.equal(enemy.swordDrawn, false);
  }
  pending.forEach((fn) => fn());
  assert.equal(deaths, 32);
  assert.equal(played.length, 0);
  assert.equal(pending.length, 1, "ordinary kills schedule no audio callbacks");
  assert.equal(bossFlashes, 1, "the story victory flash still runs");
});

test("a boss death queued before a level change cannot use the destroyed game", () => {
  let delayed;
  const PrinceJS = {
    Actor: function () {},
    Utils: { delayed: (fn) => (delayed = fn) }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "Fighter.js"), "utf8"), { PrinceJS });
  const enemy = {
    charName: "jaffar",
    baseCharName: "jaffar",
    game: {},
    showSplash() {},
    proceedOnDead() {}
  };
  PrinceJS.Fighter.prototype.CMD_DIE.call(enemy);
  enemy.game = null;
  assert.doesNotThrow(() => delayed());
});
