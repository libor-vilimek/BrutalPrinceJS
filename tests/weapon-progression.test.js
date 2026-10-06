"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture(number) {
  const keyboardCodes = {
    F: 70,
    CONTROL: 17,
    ONE: 49,
    TWO: 50,
    THREE: 51,
    FOUR: 52,
    FIVE: 53,
    X: 88,
    J: 74,
    R: 82,
    A: 65,
    L: 76,
    SPACEBAR: 32
  };
  const PrinceJS = {
    ROOM_WIDTH: 320,
    ROOM_HEIGHT: 189,
    BLOCK_WIDTH: 32,
    BLOCK_HEIGHT: 63,
    currentLevel: number,
    startTime: new Date(),
    danger: false
  };
  const context = vm.createContext({
    PrinceJS,
    Phaser: { Sprite: function () {}, Keyboard: keyboardCodes }
  });
  for (const file of [
    "Utils",
    "Actor",
    "Fighter",
    "Level",
    "tiles/Base",
    "tiles/Gate",
    "RangedWeapon",
    "Minigun",
    "RocketLauncherAction",
    "RocketLauncher",
    "Molotov",
    "GorePhysics",
    "Whip",
    "Game"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  const mapPath = number < 90 ? `level${number}.json` : `custom/level${number}.json`;
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/maps", mapPath), "utf8"));
  json.guards = [];
  json.prince.turn = false;
  const signal = () => {
    const listeners = [];
    return {
      add(fn, owner) {
        listeners.push({ fn, owner });
      },
      remove() {},
      dispatch(...args) {
        for (const { fn, owner } of listeners) {
          fn.apply(owner, args);
        }
      }
    };
  };
  const keys = new Map();
  const messages = [];
  const sounds = [];
  const game = {
    cache: { getJSON: () => json },
    sound: { stopAll() {}, play: (name) => sounds.push(name) },
    onPause: signal(),
    onResume: signal(),
    time: { elapsedMS: 16, events: { loop() {} } },
    world: { sort() {} },
    add: { graphics: () => ({ clear() {}, destroy() {} }) },
    input: {
      keyboard: {
        addKey(code) {
          if (!keys.has(code)) {
            keys.set(code, { isDown: false, onDown: signal(), onUp: signal() });
          }
          return keys.get(code);
        },
        removeKey: (code) => keys.delete(code)
      }
    }
  };
  PrinceJS.Utils.delayed = PrinceJS.Utils.resetFlipScreen = PrinceJS.Utils.updateQuery = () => {};
  PrinceJS.Utils.continueGame = () => false;
  PrinceJS.HordeSpawns = { create: () => [] };
  PrinceJS.LevelBuilder = function () {};
  PrinceJS.LevelBuilder.prototype.buildFromJSON = function (data) {
    const level = Object.create(PrinceJS.Level.prototype);
    level.number = data.number;
    level.rooms = {};
    level.dummyWall = Object.assign(Object.create(PrinceJS.Tile.Base.prototype), { element: 20 });
    const roomId = (x, y) => {
      if (x < 0 || x >= data.size.width || y < 0 || y >= data.size.height) {
        return -1;
      }
      return data.room[y * data.size.width + x].id;
    };
    data.room.forEach((room, index) => {
      if (room.id < 1) {
        return;
      }
      const x = index % data.size.width;
      const y = Math.floor(index / data.size.width);
      level.rooms[room.id] = {
        x,
        y,
        links: { left: roomId(x - 1, y), right: roomId(x + 1, y), up: roomId(x, y - 1), down: roomId(x, y + 1) },
        tiles: room.tile.map((tile, location) =>
          Object.assign(Object.create(PrinceJS.Tile.Base.prototype), tile, {
            room: room.id,
            roomX: location % 10,
            roomY: Math.floor(location / 10)
          })
        )
      };
    });
    return level;
  };
  PrinceJS.Kid = function (game, level, location, direction, room) {
    Object.assign(this, {
      room,
      charBlockX: location % 10,
      charBlockY: Math.floor(location / 10),
      charX: PrinceJS.Utils.convertBlockXtoX(location % 10),
      charY: PrinceJS.Utils.convertBlockYtoY(Math.floor(location / 10)),
      charFace: direction,
      baseX: level.rooms[room].x * 320,
      baseY: level.rooms[room].y * 189 + 3,
      alive: true,
      active: true,
      visible: true,
      action: "stand",
      sword: { visible: false },
      specialAction: null,
      hasTwinTorches: false,
      twinTorchesEquipped: false,
      hasWhip: false,
      hasMolotov: false,
      molotovEquipped: false,
      hasMinigun: false,
      minigunEquipped: false,
      hasRocketLauncher: false,
      rocketLauncherEquipped: false,
      hasJetpack: false,
      jetpackEquipped: false,
      activeWeapon: null,
      keyWeaponAction: () => false,
      beginSpecialAction(owner, type) {
        if (this.specialAction) {
          return false;
        }
        this.specialAction = { owner, type };
        return true;
      },
      endSpecialAction(owner) {
        if (this.specialAction && this.specialAction.owner === owner) {
          this.specialAction = null;
        }
      },
      setSpecialActionFrame(frame) {
        this.charFrame = frame;
      }
    });
    for (const event of ["onChangeRoom", "onDead", "onFlipped", "onNextLevel", "onLevelFinished"]) {
      this[event] = signal();
    }
  };
  const effects = function (game, kid, pickup) {
    this.collected = pickup.collected;
    this.pickupVisible = !this.collected;
    this.collectCalls = this.destroyCalls = 0;
    this.collect = () => {
      this.collectCalls++;
      this.collected = true;
      this.pickupVisible = false;
    };
    this.hide = this.crack = () => {};
    this.setAction = (stage) => (this.actionStage = stage);
    this.update = () => {};
    this.getMuzzle = () => ({ visible: false });
    this.destroy = () => this.destroyCalls++;
  };
  PrinceJS.MinigunEffects = PrinceJS.RocketLauncherEffects = PrinceJS.MolotovEffects = PrinceJS.WhipEffects = effects;
  // These tests exercise Game's grants/selection. Dedicated controller tests cover melee animation and physics.
  PrinceJS.TwinTorches = function (delegate) {
    Object.assign(this, {
      delegate,
      kid: delegate.kid,
      spec: { id: "twinTorches", owned: "hasTwinTorches", equipped: "twinTorchesEquipped" },
      pickup: null,
      effects: new effects(null, null, { collected: true }),
      equipTime: 0,
      actionStage: "hidden"
    });
  };
  PrinceJS.TwinTorches.prototype = Object.create(PrinceJS.RangedWeapon.prototype);
  PrinceJS.TwinTorches.prototype.startIntro =
    PrinceJS.TwinTorches.prototype.update =
    PrinceJS.TwinTorches.prototype.cancelAction =
      function () {};
  PrinceJS.TwinTorches.prototype.destroy = function () {
    this.destroyed = true;
    this.effects.destroy();
  };
  PrinceJS.WeaponAudio =
    PrinceJS.RoomCamera =
    PrinceJS.Jetpack =
    PrinceJS.BloodEffects =
    PrinceJS.EnemyDeathEffects =
    PrinceJS.BurningEnemyEffects =
      function () {
        this.update = this.destroy = () => {};
      };
  PrinceJS.Interface = function () {
    this.setPlayerLive = () => {};
    this.showText = (text) => messages.push(text);
  };
  const state = Object.assign(Object.create(PrinceJS.Game.prototype), {
    game,
    input: game.input,
    world: game.world,
    setupCamera() {},
    updateCamera() {}
  });
  state.create();
  return { PrinceJS, state, keys, keyboardCodes, messages, sounds };
}

test("level 1 keeps its original molotov and left-hand lower-room minigun pickups", () => {
  const { state } = fixture(1);
  assert.equal(state.kid.hasMolotov, false);
  assert.equal(state.kid.hasMinigun, false);
  assert.equal(state.kid.hasRocketLauncher, false);
  assert.equal(state.kid.hasJetpack, false);
  assert.equal(state.kid.hasTwinTorches, true);
  assert.equal(state.kid.activeWeapon, "twinTorches");
  assert.equal(state.rocketLauncher, null);
  assert.deepEqual(
    Array.from(state.weapons, (weapon) => weapon.spec.id),
    ["twinTorches", "molotov", "minigun"]
  );
  assert.equal(state.molotov.pickup.room, 1);
  assert.equal(state.minigun.pickup.room, 2);
  const lowerRoom = state.level.rooms[2];
  assert.equal(state.minigun.pickup.worldX - lowerRoom.x * 320, 48);
  assert.equal(state.minigun.pickup.worldY - lowerRoom.y * 189, 119);
  for (const weapon of state.weapons.filter((item) => item.pickup)) {
    assert.equal(weapon.pickup.collected, false);
    assert.equal(weapon.effects.pickupVisible, true);
  }
});

test("level 2 selects the basic torches, grants molotov/minigun, and leaves a whip to collect", () => {
  const { state, messages, sounds, keys, keyboardCodes } = fixture(2);
  assert.equal(state.kid.hasMolotov, true);
  assert.equal(state.kid.hasMinigun, true);
  assert.equal(state.kid.hasRocketLauncher, false);
  assert.equal(state.kid.hasJetpack, false);
  assert.equal(state.rocketLauncher, null);
  assert.equal(state.kid.activeWeapon, "twinTorches");
  assert.equal(state.kid.twinTorchesEquipped, true);
  assert.equal(state.kid.minigunEquipped, false);
  assert.equal(state.kid.hasWhip, false);
  assert.equal(state.whip.pickup.collected, false);
  assert.equal(state.whip.effects.pickupVisible, true);
  assert.equal(state.weapons.includes(state.whip), false);
  assert.equal(state.whip.actionKey, keys.get(keyboardCodes.X));
  keys.get(keyboardCodes.X).onDown.dispatch();
  assert.equal(state.whip.actionStage, "hidden", "X requires collecting the whip first");
  assert.equal(state.kid.molotovEquipped, false);
  assert.equal(state.kid.specialAction, null);
  for (const weapon of [state.molotov, state.minigun]) {
    assert.equal(weapon.pickup.collected, true);
    assert.equal(weapon.effects.collected, true);
    assert.equal(weapon.effects.pickupVisible, false);
    weapon.checkPickup();
    assert.equal(weapon.effects.collectCalls, 0);
  }
  state.update();
  assert.deepEqual(messages, []);
  assert.deepEqual(sounds, []);
  keys.get(keyboardCodes.TWO).onDown.dispatch();
  assert.equal(state.kid.activeWeapon, "molotov");
  assert.equal(state.kid.molotovEquipped, true);
  assert.equal(state.kid.minigunEquipped, false);
  keys.get(keyboardCodes.THREE).onDown.dispatch();
  assert.equal(state.kid.activeWeapon, "minigun");
  keys.get(keyboardCodes.FOUR).onDown.dispatch();
  assert.equal(state.kid.activeWeapon, "minigun", "the launcher remains unavailable before level 3");
  const pickup = state.whip.pickup;
  const room = state.level.rooms[pickup.room];
  state.kid.room = pickup.room;
  state.kid.baseX = room.x * 320;
  state.kid.baseY = room.y * 189 + 3;
  state.kid.charX = ((pickup.worldX - state.kid.baseX) * 140) / 320;
  state.kid.charY = pickup.worldY - state.kid.baseY;
  state.update();
  assert.equal(state.kid.hasWhip, true, "the standalone controller still checks its pickup each frame");
  assert.equal(state.kid.activeWeapon, "minigun");
  assert.equal(state.kid.minigunEquipped, true);
  assert.equal(state.whip.effects.pickupVisible, false);
  assert.ok(messages.at(-1).startsWith("X WHIP"));
});

test("level 3 shows the launcher until walking over it, and restart restores that pickup", () => {
  const { state, keys, keyboardCodes } = fixture(3);
  assert.equal(state.kid.hasRocketLauncher, false);
  assert.equal(state.rocketLauncher.effects.pickupVisible, true);
  keys.get(keyboardCodes.FOUR).onDown.dispatch();
  assert.equal(state.kid.activeWeapon, "twinTorches");
  const pickup = state.rocketLauncher.pickup;
  const room = state.level.rooms[pickup.room];
  state.kid.room = pickup.room;
  state.kid.baseX = room.x * 320;
  state.kid.baseY = room.y * 189 + 3;
  state.kid.charX = ((pickup.worldX - state.kid.baseX) * 140) / 320;
  state.kid.charY = pickup.worldY - state.kid.baseY;
  state.rocketLauncher.checkPickup();
  assert.equal(state.kid.hasRocketLauncher, true);
  assert.equal(state.kid.activeWeapon, "rocketLauncher");
  assert.equal(pickup.collected, true);
  assert.equal(state.rocketLauncher.effects.collectCalls, 1);
  state.shutdown();
  state.create();
  assert.equal(state.kid.hasRocketLauncher, false);
  assert.equal(state.rocketLauncher.pickup.collected, false);
  assert.equal(state.kid.activeWeapon, "twinTorches");
});

for (const number of [4, 12, 13, 14, 99]) {
  test(`direct level ${number} owns four weapons and a standalone X whip, preserving them on restart`, () => {
    const { state, messages, sounds, keys, keyboardCodes } = fixture(number);
    assert.deepEqual(
      Array.from(state.weapons, (weapon) => weapon.spec.id),
      ["twinTorches", "molotov", "minigun", "rocketLauncher"]
    );
    assert.equal(state.kid.activeWeapon, "twinTorches");
    assert.equal(state.kid.hasTwinTorches, true);
    assert.equal(state.kid.hasWhip, true);
    assert.equal(state.kid.hasJetpack, number >= 13);
    assert.equal(state.kid.jetpackEquipped, false);
    for (const weapon of [...state.weapons.filter((item) => item.pickup), state.whip]) {
      assert.equal(state.kid[weapon.spec.owned], true);
      assert.equal(weapon.pickup.collected, true);
      assert.equal(weapon.effects.collected, true);
      assert.equal(weapon.effects.pickupVisible, false);
      weapon.checkPickup();
      assert.equal(weapon.effects.collectCalls, 0);
    }
    assert.deepEqual(messages, []);
    assert.deepEqual(sounds, []);
    keys.get(keyboardCodes.FOUR).onDown.dispatch();
    assert.equal(state.kid.activeWeapon, "rocketLauncher");
    assert.equal(state.kid.rocketLauncherEquipped, true);
    assert.equal(state.kid.minigunEquipped, false);
    keys.get(keyboardCodes.TWO).onDown.dispatch();
    assert.equal(state.kid.activeWeapon, "molotov");
    assert.equal(keys.has(keyboardCodes.FIVE), false, "5 is no longer bound to the whip");
    state.selectWeapon("whip");
    assert.equal(state.kid.activeWeapon, "molotov");
    const whipKey = keys.get(keyboardCodes.X);
    assert.equal(whipKey, state.whipKey);
    whipKey.onDown.dispatch();
    assert.equal(state.whip.actionStage, "drawing", "a quick X key event starts the action immediately");
    assert.equal(state.kid.activeWeapon, "molotov");
    state.selectWeapon("minigun");
    assert.equal(state.kid.activeWeapon, "molotov", "weapon selection cannot skip the whip animation");
    state.game.time.elapsedMS = 10;
    for (let i = 0; i < 85; i++) {
      state.update();
    }
    assert.equal(state.whip.cracks, 1);
    assert.equal(state.whip.actionStage, "hidden");
    assert.equal(state.kid.specialAction, null);
    assert.equal(state.kid.activeWeapon, "molotov");
    const oldWhip = state.whip;
    const originalWeapons = Array.from(state.weapons);
    state.shutdown();
    assert.equal(oldWhip.destroyed, true);
    assert.equal(oldWhip.effects.destroyCalls, 1);
    assert.equal(keys.has(keyboardCodes.X), false);
    assert.equal(state.whip, null);
    for (const weapon of originalWeapons) {
      assert.equal(weapon.destroyed, true);
      assert.equal(weapon.effects.destroyCalls, 1);
    }
    assert.equal(state.weapons.length, 0);
    state.create();
    assert.equal(state.kid.activeWeapon, "twinTorches");
    assert.equal(state.kid.hasJetpack, number >= 13);
    assert.equal(state.kid.jetpackEquipped, false);
    assert.equal(state.kid.hasWhip, true);
    assert.notEqual(state.whip, oldWhip);
    assert.equal(state.whip.actionKey, keys.get(keyboardCodes.X));
    assert.equal(state.whip.pickup.collected, true);
    assert.equal(state.whip.effects.pickupVisible, false);
    for (const weapon of state.weapons.filter((item) => item.pickup)) {
      assert.equal(state.kid[weapon.spec.owned], true);
      assert.equal(weapon.pickup.collected, true);
      assert.equal(originalWeapons.includes(weapon), false);
    }
  });
}
