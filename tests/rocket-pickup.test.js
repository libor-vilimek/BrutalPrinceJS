"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture(number = 3, owned = false, direction = -1, changeMap) {
  class Graphics {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.scale = { x: 1, y: 1 };
    }
    clear() {}
    beginFill() {}
    endFill() {}
    drawRect() {}
    drawCircle() {}
    drawPolygon() {}
    lineStyle() {}
    destroy() {
      this.destroyed = true;
    }
  }
  const PrinceJS = {
    ROOM_WIDTH: 320,
    ROOM_HEIGHT: 189,
    BLOCK_WIDTH: 32,
    BLOCK_HEIGHT: 63,
    currentLevel: number
  };
  const context = vm.createContext({
    PrinceJS,
    Phaser: {
      Rectangle: function (x, y, width, height) {
        Object.assign(this, { x, y, width, height });
      }
    }
  });
  for (const file of [
    "Utils",
    "Level",
    "tiles/Base",
    "RangedWeapon",
    "RocketLauncherAction",
    "PrincePose",
    "RocketLauncherEffects",
    "RocketLauncher"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  // Keep the native entrance geometry even when testing another progression tier.
  const mapNumber = number === 2 ? 2 : 3;
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, `../assets/maps/level${mapNumber}.json`), "utf8"));
  if (changeMap) {
    changeMap(map);
  }
  const level = Object.create(PrinceJS.Level.prototype);
  level.number = map.number;
  level.rooms = {};
  level.dummyWall = Object.assign(Object.create(PrinceJS.Tile.Base.prototype), { element: 20 });
  const roomAt = (x, y) =>
    x < 0 || y < 0 || x >= map.size.width || y >= map.size.height ? -1 : map.room[y * map.size.width + x].id;
  map.room.forEach((data, i) => {
    if (data.id < 1) {
      return;
    }
    const x = i % map.size.width;
    const y = Math.floor(i / map.size.width);
    level.rooms[data.id] = {
      x,
      y,
      links: { left: roomAt(x - 1, y), right: roomAt(x + 1, y), up: roomAt(x, y - 1), down: roomAt(x, y + 1) },
      tiles: data.tile.map((tile, location) =>
        Object.assign(Object.create(PrinceJS.Tile.Base.prototype), tile, {
          room: data.id,
          roomX: location % 10,
          roomY: Math.floor(location / 10)
        })
      )
    };
  });
  const sounds = [];
  const messages = [];
  const game = {
    add: {
      graphics: (x, y) => new Graphics(x, y),
      sprite(x, y) {
        return {
          x,
          y,
          scale: { x: 1 },
          anchor: { setTo() {} },
          crop(rect) {
            this.cropRect = rect;
          },
          destroy() {
            this.destroyed = true;
          }
        };
      }
    },
    sound: { play: (name) => sounds.push(name) }
  };
  const kid = {
    room: map.prince.room,
    baseX: level.rooms[map.prince.room].x * 320,
    baseY: level.rooms[map.prince.room].y * 189 + 3,
    charBlockX: map.prince.location % 10,
    charBlockY: Math.floor(map.prince.location / 10),
    charX: PrinceJS.Utils.convertBlockXtoX(map.prince.location % 10) + 7,
    charY: PrinceJS.Utils.convertBlockYtoY(Math.floor(map.prince.location / 10)),
    charFace: direction,
    alive: true,
    active: true,
    visible: true,
    action: "stand",
    hasRocketLauncher: owned,
    rocketLauncherEquipped: false,
    specialAction: null,
    sword: { visible: false },
    keyWeaponAction: () => false
  };
  const ctrlKey = { isDown: false };
  const delegate = {
    game,
    level,
    kid,
    weaponFireKey: { isDown: false },
    weaponCtrlKey: ctrlKey,
    enemies: [],
    ui: { showText: (text) => messages.push(text) }
  };
  const launcher = new PrinceJS.RocketLauncher(delegate, direction);
  delegate.weapons = [launcher];
  return { PrinceJS, kid, level, delegate, launcher, ctrlKey, sounds, messages };
}

test("the level 2 launcher is visible immediately left of the arrival doors and collects on foot", () => {
  for (const direction of [-1, 1]) {
    const { PrinceJS, kid, level, launcher } = fixture(2, false, direction);
    const { pickup, effects } = launcher;
    assert.equal(pickup.room, 5);
    assert.equal(pickup.worldX - kid.baseX, 48);
    assert.equal(pickup.worldY - kid.baseY, 116);
    const floor = level.getTileAt(1, 1, pickup.room);
    assert.equal(floor.isSafeWalkable(), true);
    assert.equal(floor.isBarrier(), false);
    assert.equal(floor.element, PrinceJS.Level.TILE_TORCH, "the torch is on the back wall above the pickup");
    assert.equal(level.getTileAt(2, 1, pickup.room).element, PrinceJS.Level.TILE_EXIT_LEFT);
    assert.equal(level.getTileAt(3, 1, pickup.room).element, PrinceJS.Level.TILE_EXIT_RIGHT);
    assert.equal(effects.ground.visible, true);
    launcher.checkPickup();
    assert.equal(kid.hasRocketLauncher, false, "the introductory turn does not collect the weapon");
    kid.charX = PrinceJS.Utils.convertBlockXtoX(1);
    kid.inFallDown = true;
    launcher.checkPickup();
    assert.equal(kid.hasRocketLauncher, false);
    kid.inFallDown = false;
    launcher.checkPickup();
    launcher.update(0);
    assert.equal(kid.hasRocketLauncher, true);
    assert.equal(kid.activeWeapon, "rocketLauncher");
    assert.equal(effects.ground.visible, false);
  }
});

test("the native level 3 launcher is visible on clear floor near the arrival doorway", () => {
  const { PrinceJS, kid, level, launcher } = fixture();
  const { pickup, effects } = launcher;
  assert.equal(pickup.room, 9);
  assert.equal(pickup.worldX, 1552);
  assert.equal(pickup.worldY, 560);
  assert.equal(level.getTileAt(8, 2, pickup.room).element, PrinceJS.Level.TILE_FLOOR);
  assert.equal(level.getTileAt(3, 2, pickup.room).element, PrinceJS.Level.TILE_EXIT_LEFT);
  assert.equal(level.getTileAt(4, 2, pickup.room).element, PrinceJS.Level.TILE_EXIT_RIGHT);
  for (let x = 5; x <= 8; x++) {
    const tile = level.getTileAt(x, 2, pickup.room);
    assert.equal(tile.isSafeWalkable(), true, "walking from the arrival door to the launcher is safe");
    assert.equal(tile.isBarrier(), false);
  }
  const startX = kid.baseX + PrinceJS.Utils.convertX(kid.charX);
  assert.ok(pickup.worldX - startX <= 4 * PrinceJS.BLOCK_WIDTH);
  assert.equal(pickup.collected, false);
  assert.equal(effects.ground.visible, true);
  assert.equal(effects.ground.x, pickup.worldX);
  assert.equal(effects.weapon.visible, false, "the uncollected launcher only renders as a floor pickup");
  launcher.checkPickup();
  assert.equal(kid.hasRocketLauncher, false, "the introductory turn does not automatically collect it");
});

test("level 3 requires a grounded walk to collect, equips once, and hides the floor graphic", () => {
  const { PrinceJS, kid, launcher, ctrlKey, sounds, messages } = fixture();
  ctrlKey.isDown = true;
  launcher.update(1 / 60);
  assert.equal(launcher.actionStage, "hidden");
  assert.equal(launcher.bullets.length, 0, "an unowned floor weapon cannot fire");
  ctrlKey.isDown = false;
  kid.charX = PrinceJS.Utils.convertBlockXtoX(8);
  kid.inFallDown = true;
  launcher.checkPickup();
  assert.equal(kid.hasRocketLauncher, false);
  kid.inFallDown = false;
  kid.charY -= 10;
  launcher.checkPickup();
  assert.equal(kid.hasRocketLauncher, false, "the launcher cannot be taken from the floor above");
  kid.charY += 10;
  launcher.checkPickup();
  launcher.update(1 / 60);
  assert.equal(kid.hasRocketLauncher, true);
  assert.equal(kid.activeWeapon, "rocketLauncher");
  assert.equal(kid.rocketLauncherEquipped, true);
  assert.equal(launcher.pickup.collected, true);
  assert.equal(launcher.effects.collected, true);
  assert.equal(launcher.effects.ground.visible, false);
  assert.equal(kid.specialAction, null, "collection does not start firing or block the Prince");
  launcher.checkPickup();
  assert.deepEqual(sounds, ["UnsheatheSword"]);
  assert.equal(messages.length, 1);
});

test("the introductory facing direction does not move the level 3 pickup behind the entrance", () => {
  for (const direction of [-1, 1]) {
    const { launcher } = fixture(3, false, direction);
    assert.equal(launcher.pickup.worldX, 1552);
    assert.equal(launcher.pickup.worldY, 560);
  }
});

test("automatic ownership still suppresses pickup graphics on later levels", () => {
  const { kid, launcher, sounds, messages } = fixture(4, true);
  assert.equal(launcher.pickup.collected, true);
  assert.equal(launcher.effects.ground.visible, false);
  launcher.checkPickup();
  assert.equal(kid.hasRocketLauncher, true);
  assert.deepEqual(sounds, []);
  assert.deepEqual(messages, []);
});

test("custom level 3 maps and modified unsafe native floors retain the safe generic search", () => {
  for (const f of [
    fixture(99),
    fixture(3, false, 1, (map) => {
      map.room.find((room) => room.id === 9).tile[28].element = 11;
    })
  ]) {
    const fallback = f.PrinceJS.RangedWeapon.prototype.findPickup.call(f.launcher, f.kid.charFace);
    assert.equal(f.launcher.pickup.worldX, fallback.worldX);
    assert.equal(f.launcher.pickup.worldY, fallback.worldY);
    assert.notEqual(f.launcher.pickup.worldX, 1552);
  }
});
