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

test("an enemy death queued before a level change cannot use the destroyed game's sound", () => {
  let delayed;
  const PrinceJS = {
    Actor: function () {},
    Utils: { delayed: (fn) => (delayed = fn) }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "Fighter.js"), "utf8"), { PrinceJS });
  const enemy = {
    charName: "guard-1",
    baseCharName: "guard",
    game: {},
    showSplash() {},
    proceedOnDead() {}
  };
  PrinceJS.Fighter.prototype.CMD_DIE.call(enemy);
  enemy.game = null;
  assert.doesNotThrow(() => delayed());
});
