"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture(currentLevel = 2) {
  const PrinceJS = {
    currentLevel,
    maxHealth: 10,
    ROOM_WIDTH: 320,
    ROOM_HEIGHT: 189,
    BLOCK_WIDTH: 32,
    BLOCK_HEIGHT: 63
  };
  function Sprite(game, x, y) {
    Object.assign(this, {
      game,
      x,
      y,
      scale: { x: 1 },
      anchor: { set() {}, setTo() {} },
      addChild() {},
      visible: true
    });
  }
  function Signal() {
    this.events = [];
    this.dispatch = (...args) => this.events.push(args);
  }
  const context = vm.createContext({ PrinceJS, Phaser: { Sprite, Signal, Keyboard: { SHIFT: 16 } } });
  for (const file of ["Utils", "Actor", "Fighter", "Kid", "Level"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file + ".js"), "utf8"), context);
  }
  const keys = { left: { isDown: false }, right: { isDown: false }, up: { isDown: false }, down: { isDown: false } };
  const shift = { isDown: false };
  const sounds = [];
  const animations = {
    "kid-anims": JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/anims/kid.json"), "utf8")),
    "sword-anims": JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/anims/sword.json"), "utf8"))
  };
  const game = {
    make: { sprite: () => new Sprite(game, 0, 0) },
    add: { existing() {} },
    cache: { getJSON: (key) => animations[key] },
    input: { keyboard: { createCursorKeys: () => keys, addKey: () => shift } },
    sound: { play: (name) => sounds.push(name) }
  };
  game.world = { getIndex: () => -1 };
  const tiles = new Map();
  const removed = [];
  const level = {
    rooms: { 1: { x: 0, y: 0, links: {} } },
    getTileAt: (x, y) => tiles.get(`${x},${y}`) || { element: PrinceJS.Level.TILE_FLOOR, isWalkable: () => true },
    removeObject: (...args) => removed.push(args),
    recheckCurrentRoom() {}
  };
  const kid = new PrinceJS.Kid(game, level, 11, 1, 1);
  kid.x = 40;
  kid.y = 119;
  kid.charFrame = 15;
  kid.keyL = () => keys.left.isDown;
  kid.keyR = () => keys.right.isDown;
  kid.keyU = () => keys.up.isDown;
  kid.keyD = () => keys.down.isDown;
  kid.keyS = () => shift.isDown;
  kid.nearBarrier = () => false;
  kid.canReachOpponent = () => true;
  kid.facingOpponent = () => true;
  kid.opponentDistance = () => 20;
  const opponent = {
    alive: true,
    active: true,
    charName: "guard-1",
    charBlockY: 1,
    action: "engarde",
    facingOpponent: () => true,
    frameID: () => false,
    damage: 0,
    stabbed() {
      this.damage++;
    },
    onEnemyStrike: new Signal()
  };
  kid.opponent = opponent;
  return { PrinceJS, game, level, kid, keys, shift, sounds, tiles, removed, opponent };
}

test("the Prince starts without a sword on every level, including later and custom levels", () => {
  for (const level of [1, 2, 12, 14, 99]) {
    const { kid } = fixture(level);
    assert.equal(kid.hasSword, false);
    assert.equal(kid.swordDrawn, false);
    assert.equal(kid.charSword, false);
    assert.equal(kid.sword.visible, false);
  }
});

test("nearby enemies never draw a sword with guns equipped, holstered, or not collected", () => {
  for (const equipment of [
    {},
    { hasMinigun: true, minigunEquipped: true },
    { hasRocketLauncher: true, rocketLauncherEquipped: true },
    { hasMinigun: true, hasRocketLauncher: true }
  ]) {
    const { kid, shift, sounds } = fixture();
    Object.assign(kid, equipment);
    kid.updateBehaviour();
    assert.equal(kid.action, "stand");
    shift.isDown = true;
    kid.updateBehaviour();
    assert.equal(kid.action, "stand");
    assert.equal(kid.swordDrawn, false);
    assert.deepEqual(sounds, []);
  }
});

test("ground swords cannot be picked up and do not redirect the Prince's movement", () => {
  for (const swordX of [1, 2]) {
    const { PrinceJS, kid, tiles, removed, sounds } = fixture();
    tiles.set(`${swordX},1`, { element: PrinceJS.Level.TILE_SWORD });
    const startX = kid.charX;
    kid.tryPickup();
    assert.equal(kid.pickupSword, false);
    assert.equal(kid.action, "stand");
    assert.equal(kid.charX, startX);
    kid.gotSword();
    assert.equal(kid.hasSword, false);
    assert.deepEqual(removed, []);
    assert.deepEqual(sounds, []);
  }
});

test("direct combat entry points cannot start sword animations or damage an opponent", () => {
  const { kid, opponent, sounds } = fixture();
  // Enemy checkFight can call turnengarde on its opponent, bypassing player input.
  for (const method of ["tryEngarde", "engarde", "turnengarde", "advance", "retreat", "strike", "block"]) {
    kid.charFrame = 158;
    kid[method]();
    assert.equal(kid.action, "stand", method);
    assert.equal(kid.swordDrawn, false, method);
  }
  kid.action = "strike";
  kid.charFrame = 154;
  kid.checkFight();
  assert.equal(opponent.damage, 0);
  assert.deepEqual(sounds, []);
});

test("sword animation frames cannot render a sword on the Prince", () => {
  const { kid } = fixture();
  kid.charFrame = 150;
  kid.charSword = true;
  kid.sword.visible = true;
  kid.updateSwordFrame();
  kid.updateSwordPosition();
  assert.equal(kid.charSword, false);
  assert.equal(kid.sword.visible, false);
});

test("turning and running beside an enemy keep their normal movement animations", () => {
  const { kid, keys } = fixture();
  keys.left.isDown = true;
  kid.updateBehaviour();
  assert.equal(kid.action, "turn");
  kid.charFace = -1;
  kid.charFrame = 48;
  kid.updateBehaviour();
  assert.equal(kid.action, "turnrun");
  kid.action = "stand";
  kid.updateBehaviour();
  assert.equal(kid.action, "startrun");
  assert.equal(kid.swordDrawn, false);
});

test("Shift still picks up and drinks potions, including beside an ignored ground sword", () => {
  for (const direction of [-1, 1]) {
    const { PrinceJS, kid, tiles, shift, removed } = fixture();
    kid.charFace = direction;
    tiles.set("1,1", { element: PrinceJS.Level.TILE_SWORD });
    tiles.set(`${1 + direction},1`, {
      element: PrinceJS.Level.TILE_POTION,
      isSpecial: true,
      roomX: 1 + direction,
      roomY: 1,
      room: 1
    });
    shift.isDown = true;
    kid.updateBehaviour();
    assert.equal(kid.action, "stoop");
    assert.equal(kid.pickupPotion, true);
    assert.equal(kid.pickupSword, false);
    kid.charFrame = 109;
    kid.updateBehaviour();
    assert.equal(kid.action, "drinkpotion");
    assert.equal(kid.pickupPotion, false);
    assert.deepEqual(removed, [[1 + direction, 1, 1]]);
  }
});

test("Shift continues holding a ledge and releasing Shift lets go", () => {
  const { kid, shift } = fixture();
  let falls = 0;
  kid.action = "hangstraight";
  kid.startFall = () => falls++;
  shift.isDown = true;
  kid.updateBehaviour();
  assert.equal(falls, 0);
  shift.isDown = false;
  kid.updateBehaviour();
  assert.equal(falls, 1);
});

test("Down still surrenders to the synchronized shadow without using the Prince's sword", () => {
  const { kid, keys, opponent } = fixture(12);
  opponent.charName = "shadow";
  opponent.fastsheathe = () => {
    opponent.active = false;
  };
  kid.opponentSync = true;
  keys.down.isDown = true;
  kid.updateBehaviour();
  assert.equal(opponent.active, false);
  assert.equal(kid.action, "stand");
  assert.equal(kid.swordDrawn, false);
  assert.equal(kid.sword.visible, false);
  kid.updateBehaviour();
  assert.equal(kid.action, "stoop");
});

test("enemy fighters retain their sword stance, rendering, and damaging attacks", () => {
  const { PrinceJS, game, level, opponent } = fixture();
  const guard = new PrinceJS.Fighter(game, level, 11, 1, 1, "guard-1", "kid");
  guard.opponent = opponent;
  guard.nearBarrier = () => false;
  guard.opponentDistance = () => 20;
  assert.equal(guard.engarde(), true);
  assert.equal(guard.swordDrawn, true);
  guard.charFrame = 150;
  guard.updateSwordFrame();
  guard.updateSwordPosition();
  assert.equal(guard.sword.visible, true);
  guard.charFrame = 158;
  guard.strike();
  assert.equal(guard.action, "strike");
  guard.charFrame = 154;
  guard.checkFight();
  assert.equal(opponent.damage, 1);
});

test("each guard stab removes one of ten health points even with no weapon or with guns holstered", () => {
  for (const equipment of [
    {},
    { hasMinigun: true, minigunEquipped: false },
    { hasMinigun: true, minigunEquipped: true },
    { hasRocketLauncher: true, rocketLauncherEquipped: true }
  ]) {
    const { PrinceJS, kid, game, level } = fixture();
    PrinceJS.Utils.flashRedDamage = () => {};
    Object.assign(kid, equipment);
    const guard = new PrinceJS.Fighter(game, level, 11, 1, 1, "guard-1", "kid");
    guard.opponent = kid;
    guard.opponentDistance = () => 20;
    guard.action = "strike";
    guard.charFrame = 154;
    for (let hits = 1; hits <= 10; hits++) {
      kid.action = "stand";
      guard.checkFight();
      assert.equal(kid.health, 10 - hits);
      assert.equal(kid.alive, hits < 10);
      assert.equal(kid.action, hits < 10 ? "bump" : "stabkill");
      assert.equal(kid.swordDrawn, false);
      assert.deepEqual(kid.onDamageLife.events[hits - 1], [1]);
    }
    kid.stabbed();
    assert.equal(kid.onDamageLife.events.length, 10);
  }
});

test("a nonfatal unarmed stab recovers through real animation frames to normal movement", () => {
  const { PrinceJS, kid, keys } = fixture();
  PrinceJS.Utils.flashRedDamage = () => {};
  kid.charX = 70;
  kid.charXVel = 6;
  kid.charYVel = -3;
  kid.inJumpUp = true;
  kid.pickupPotion = true;
  kid.allowCrawl = false;
  kid.stabbed();
  assert.equal(kid.charXVel, 0);
  assert.equal(kid.charYVel, 0);
  assert.equal(kid.inJumpUp, false);
  assert.equal(kid.pickupPotion, false);
  assert.equal(kid.allowCrawl, true);
  for (let tick = 0; tick < 5; tick++) {
    kid.processCommand();
    kid.updateSwordPosition();
    assert.equal(kid.sword.visible, false);
    assert.ok(!["engarde", "strike", "advance", "retreat"].includes(kid.action));
  }
  assert.equal(kid.action, "stand");
  assert.equal(kid.health, 9);
  keys.right.isDown = true;
  kid.updateBehaviour();
  assert.equal(kid.action, "startrun");
});
