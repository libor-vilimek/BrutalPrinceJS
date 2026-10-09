"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

test("new games have ten health points, including old saved URLs with three health", () => {
  for (const search of ["", "?health=3&level=2", "?h=3&l=1", "?health=10&level=2"]) {
    const context = vm.createContext({ window: { location: { search } }, URLSearchParams });
    for (const file of ["Boot", "Utils"]) {
      vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file + ".js"), "utf8"), context);
    }
    const game = vm.runInContext("PrinceJS", context);
    game.Init();
    game.Utils.applyQuery();
    assert.equal(game.maxHealth, 10);
    assert.equal(game.currentHealth, null);
    assert.equal(game.currentLevel, search.includes("level=2") ? 2 : 1);
  }
});

function fixture(search = "") {
  const savedURLs = [];
  const pending = [];
  const context = vm.createContext({
    window: { location: { search } },
    history: { replaceState: (_data, _title, url) => savedURLs.push(url) },
    URLSearchParams
  });
  for (const file of ["Boot", "Utils"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  const PrinceJS = vm.runInContext("PrinceJS", context);
  PrinceJS.Init();
  PrinceJS.Fighter = function () {};
  for (const file of ["Kid", "Interface", "Level", "Game"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  const signal = () => {
    const listeners = [];
    return {
      add: (fn, owner) => listeners.push((...args) => fn.apply(owner, args)),
      dispatch: (...args) => listeners.forEach((fn) => fn(...args))
    };
  };
  const kid = Object.assign(Object.create(PrinceJS.Kid.prototype), {
    health: 10,
    maxHealth: 10,
    charBlockX: 1,
    charBlockY: 1,
    charFace: 1,
    room: 5,
    onDamageLife: signal(),
    onRecoverLive: signal(),
    onAddLive: signal()
  });
  const ui = Object.assign(Object.create(PrinceJS.Interface.prototype), {
    game: {
      add: { sprite: (x, y, _key, frameName) => ({ x, y, frameName, visible: true }) },
      make: { bitmapText: () => ({ anchor: { setTo() {} }, width: 40 }) }
    },
    layer: { addChild() {} },
    playerHPs: []
  });
  ui.setPlayerLive(kid);
  kid.game = { sound: { play() {} } };
  PrinceJS.Utils.delayed = (fn) => pending.push(fn);
  PrinceJS.Utils.flashRedPotion = () => {};
  return { PrinceJS, kid, ui, pending, savedURLs };
}

test("large potions grow health past ten and refill it, while small potions restore exactly one", () => {
  const { PrinceJS, kid, ui, pending } = fixture();
  let tile;
  let removed = 0;
  kid.level = {
    getTileAt: () => tile,
    removeObject: () => removed++
  };
  const drink = (modifier) => {
    tile = { element: PrinceJS.Level.TILE_POTION, modifier, room: 5, roomX: 2, roomY: 1 };
    kid.drinkPotion();
    assert.equal(kid.action, "drinkpotion");
    assert.equal(pending.length, 1, "the native drinking delay still runs");
    pending.shift()();
  };
  for (const maximum of [11, 12, 13]) {
    kid.health -= 2;
    kid.onDamageLife.dispatch(2);
    drink(PrinceJS.Level.POTION_ADD);
    assert.equal(kid.maxHealth, maximum);
    assert.equal(kid.health, maximum);
    assert.equal(ui.playerHPActive, maximum);
    assert.equal(ui.playerHealthText.text, maximum + "/" + maximum);
    assert.equal(ui.playerHealthText.visible, true);
  }
  kid.health -= 3;
  kid.onDamageLife.dispatch(3);
  drink(PrinceJS.Level.POTION_RECOVER);
  assert.equal(kid.health, 11);
  assert.equal(kid.maxHealth, 13);
  assert.equal(ui.playerHealthText.text, "11/13");
  kid.recoverLife();
  kid.recoverLife();
  kid.recoverLife();
  assert.equal(kid.health, 13);
  assert.equal(ui.playerHPActive, 13);
  assert.equal(ui.playerHealthText.text, "13/13");
  assert.equal(removed, 4, "each bottle is consumed once");
});

test("expanded health survives level progression and the saved URL in both query formats", () => {
  for (const shortcut of [false, true]) {
    const { PrinceJS, kid, ui, savedURLs } = fixture();
    kid.addLife();
    kid.addLife();
    const state = Object.assign(Object.create(PrinceJS.Game.prototype), { kid, reset() {} });
    state.nextLevel();
    assert.equal(PrinceJS.maxHealth, 12);
    assert.equal(PrinceJS.currentLevel, 2);
    PrinceJS.shortcut = shortcut;
    PrinceJS.Utils.updateQuery();
    const saved = savedURLs.at(-1);
    assert.equal(new URLSearchParams(saved).get(shortcut ? "h" : "health"), "12");
    PrinceJS.Init();
    const restored = fixture(saved).PrinceJS;
    restored.Utils.applyQuery();
    assert.equal(restored.maxHealth, 12);
    assert.equal(restored.currentLevel, 2);
    assert.equal(ui.playerHPActive, 12);
  }
});

test("health query rejects invalid values and the HUD can handle large saved maxima and lethal damage", () => {
  for (const value of ["-1", "NaN", "Infinity", "11.5", "12junk", "9007199254740992"]) {
    const { PrinceJS } = fixture("?health=" + value);
    PrinceJS.Utils.applyQuery();
    assert.equal(PrinceJS.maxHealth, 10);
  }
  const { kid, ui } = fixture();
  assert.equal(ui.playerHealthText.visible, false, "ten lives retain the native icons");
  kid.health = kid.maxHealth = 100;
  ui.addPlayerLive();
  assert.equal(ui.playerHealthText.text, "100/100");
  assert.equal(ui.playerHPs.filter((hp) => hp.visible).length, 1);
  kid.health = 1;
  ui.damagePlayerLive(99);
  assert.equal(ui.playerHealthText.text, "1/100");
  ui.showRegularRemainingTime = () => {};
  ui.updateUI();
  assert.equal(ui.playerHPs[0].frameName, "kid-emptylive", "the last-life warning still blinks");
  kid.health = 0;
  ui.damagePlayerLive(1);
  assert.equal(ui.playerHPActive, 0);
  assert.equal(ui.playerHealthText.text, "0/100");
});

test("campaign rooms contain more one-point recovery bottles without replacing the original special potions", () => {
  const originalRecoverCounts = [4, 6, 3, 4, 5, 0, 1, 4, 3, 2, 3, 0, 0];
  const originalMaxCounts = [0, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0];
  for (let number = 1; number <= 13; number++) {
    const json = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/maps/level" + number + ".json")));
    const potions = json.room
      .filter((room) => room.id > 0)
      .flatMap((room) => room.tile)
      .filter((tile) => tile.element === 10);
    assert.ok(
      potions.filter((tile) => tile.modifier === 1).length > originalRecoverCounts[number - 1],
      "level " + number
    );
    assert.equal(potions.filter((tile) => tile.modifier === 2).length, originalMaxCounts[number - 1]);
  }
});
