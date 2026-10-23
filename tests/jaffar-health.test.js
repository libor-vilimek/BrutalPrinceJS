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
    this.listeners = this.listeners.filter((listener) => listener.fn !== fn || listener.context !== context);
  }
  dispatch(...args) {
    for (const { fn, context } of [...this.listeners]) {
      fn.apply(context, args);
    }
  }
}

function fixture() {
  const PrinceJS = { SCREEN_WIDTH: 320, ROOM_WIDTH: 320, ROOM_HEIGHT: 189, BLOCK_WIDTH: 32, BLOCK_HEIGHT: 63 };
  const Phaser = {
    Signal,
    Sprite: function (game, x, y, key, frameName) {
      Object.assign(this, { game, x, y, key, frameName, visible: true });
      this.scale = { x: 1, y: 1 };
      this.anchor = { set() {}, setTo() {} };
      this.addChild = () => {};
      this.destroy = () => (this.destroyed = true);
    }
  };
  const context = vm.createContext({ PrinceJS, Phaser });
  for (const file of ["Utils", "Actor", "Fighter", "Enemy", "Interface"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  const animations = Object.fromEntries(
    ["fighter", "shadow", "sword"].map((name) => [
      name + "-anims",
      JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/anims", name + ".json"), "utf8"))
    ])
  );
  const delayed = [];
  PrinceJS.Utils.delayed = (fn) => delayed.push(fn);
  PrinceJS.Utils.flashWhiteVizierVictory = () => {};
  const game = {
    sound: { mute: true, play() {} },
    add: {
      existing() {},
      sprite: (...args) => new Phaser.Sprite(game, ...args)
    },
    make: {
      sprite: (...args) => new Phaser.Sprite(game, ...args),
      bitmapText: (x, y, font, text, fontSize) => ({
        x,
        y,
        font,
        text,
        fontSize,
        anchor: {
          setTo(x, y) {
            Object.assign(this, { x, y });
          }
        },
        get width() {
          return this.text.length * this.fontSize * 0.5;
        },
        destroy() {
          this.destroyed = true;
        }
      })
    },
    cache: { getJSON: (key) => animations[key] }
  };
  const enemy = (data = {}, number = 13) => {
    const level = { number, rooms: { 1: { x: 0, y: 0 } } };
    return new PrinceJS.Enemy(
      game,
      level,
      data.location || 8,
      data.direction || -1,
      data.room || 1,
      data.skill === undefined ? 9 : data.skill,
      data.colors || 0,
      data.type || "jaffar",
      1
    );
  };
  const ui = Object.assign(Object.create(PrinceJS.Interface.prototype), {
    game,
    layer: { addChild() {} },
    opp: null,
    oppHPs: []
  });
  return { PrinceJS, enemy, ui, delayed };
}

test("the actual campaign Jaffar has fifty lives while other enemy strengths stay unchanged", () => {
  const f = fixture();
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/maps/level13.json"), "utf8"));
  const boss = f.enemy(map.guards.find((guard) => guard.type === "jaffar"));
  assert.equal(boss.health, 50);
  assert.equal(boss.maxHealth, 50);
  for (const skill of [0, 4, 9, 11]) {
    assert.equal(f.enemy({ skill }).health, 50, "Jaffar's life does not depend on guard skill");
  }
  const nativeStrength = [4, 3, 3, 3, 3, 4, 5, 4, 4, 5, 5, 5, 4, 6, 10, 0];
  for (const type of ["guard", "fatguard", "shadow", "skeleton"]) {
    for (let number = 1; number <= 14; number++) {
      assert.equal(f.enemy({ type, skill: 1 }, number).health, nativeStrength[number], `${type}, level ${number}`);
      assert.equal(f.enemy({ type, skill: 4 }, number).health, nativeStrength[number] + 1);
    }
  }
  const shadow = f.enemy({ type: "shadow" }, 12);
  assert.equal(shadow.hasSword, false, "the peaceful level twelve shadow remains unarmed");
});

test("all fifty native damage signals reach the compact boss HUD and death still uses the story callback", () => {
  const f = fixture();
  const boss = f.enemy();
  let damage = 0;
  let deaths = 0;
  boss.onDamageLife.add((amount) => (damage += amount));
  boss.onDead.add(() => deaths++);
  f.ui.setOpponentLive(boss);
  assert.equal(f.ui.oppHPs.length, 1, "fifty icons cannot cover the player's health and timer");
  assert.equal(f.ui.oppHPs[0].frameName, "jaffar-live");
  assert.equal(f.ui.oppHealthText.text, "50/50");
  assert.equal(f.ui.oppHealthText.anchor.x, 1, "the life count stays anchored at the right edge");
  assert.ok(f.ui.oppHealthText.x - f.ui.oppHealthText.width >= 250);

  for (let hit = 1; hit <= 49; hit++) {
    boss.damageLife();
    assert.equal(boss.health, 50 - hit);
    assert.equal(boss.alive, true);
    assert.equal(f.ui.oppHPActive, boss.health);
    assert.equal(f.ui.oppHealthText.text, boss.health + "/50");
  }
  f.ui.showRegularRemainingTime = () => {};
  f.ui.updateUI();
  assert.equal(f.ui.oppHPs[0].visible, false, "the last-life warning still blinks");
  f.ui.updateUI();
  assert.equal(f.ui.oppHPs[0].visible, true);
  const text = f.ui.oppHealthText;
  boss.damageLife();
  assert.equal(boss.health, 0);
  assert.equal(boss.alive, false);
  assert.equal(boss.action, "dropdead");
  assert.equal(f.ui.oppHealthText.text, "0/50");
  assert.equal(f.ui.oppHPs[0].visible, false);
  assert.equal(damage, 50);
  assert.equal(deaths, 0, "the death animation owns the story callback");
  boss.CMD_DIE();
  assert.equal(deaths, 1);
  assert.equal(f.ui.opp, null);
  assert.equal(text.destroyed, true);
  assert.equal(boss.onDamageLife.listeners.length, 2, "the enemy and statistics listeners survive HUD cleanup");
  assert.equal(f.delayed.length, 1, "the original Jaffar victory flash remains scheduled");
});

test("boss HP survives changing HUD opponents without duplicate damage callbacks or orphaned text", () => {
  const f = fixture();
  const boss = f.enemy();
  const guard = f.enemy({ type: "guard", skill: 1 });
  f.ui.setOpponentLive(boss);
  f.ui.setOpponentLive(boss);
  assert.equal(boss.onDamageLife.listeners.length, 2);
  const oldText = f.ui.oppHealthText;
  f.ui.setOpponentLive(guard);
  assert.equal(oldText.destroyed, true);
  assert.equal(f.ui.oppHealthText, null);
  assert.equal(f.ui.oppHPs.length, 6, "ordinary opponents retain the native icon display");
  boss.damageLife();
  assert.equal(f.ui.oppHPActive, 6, "an offscreen boss cannot damage the selected guard's HUD");
  f.ui.setOpponentLive(boss);
  assert.equal(f.ui.oppHealthText.text, "49/50", "reselecting Jaffar preserves the fifty-life maximum");
  assert.equal(f.ui.oppHPActive, 49);
  boss.damageLife();
  assert.equal(f.ui.oppHealthText.text, "48/50");
  assert.equal(boss.onDamageLife.listeners.length, 2);
  f.ui.resetOpponentLive();
  assert.equal(f.ui.oppHealthText, null);
  assert.equal(f.ui.oppHPs.length, 0);
  assert.equal(boss.onDamageLife.listeners.length, 1);
});
