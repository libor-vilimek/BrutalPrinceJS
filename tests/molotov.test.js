"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture() {
  const PrinceJS = { ROOM_WIDTH: 320, ROOM_HEIGHT: 189, BLOCK_WIDTH: 32, BLOCK_HEIGHT: 63 };
  const context = vm.createContext({
    PrinceJS,
    Phaser: {
      Sprite: function () {},
      Rectangle: function (x, y, width, height) {
        Object.assign(this, { x, y, width, height });
      }
    }
  });
  for (const file of [
    "Utils",
    "Actor",
    "Fighter",
    "Level",
    "tiles/Base",
    "tiles/Gate",
    "RangedWeapon",
    "Molotov",
    "MolotovEffects"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file + ".js"), "utf8"), context);
  }
  const layers = [];
  const game = {
    add: {
      sprite() {
        return { scale: { x: 1 }, anchor: { setTo() {} }, crop() {}, destroy() {} };
      },
      graphics() {
        const graphics = {
          scale: { x: 1, y: 1 },
          clear() {},
          beginFill() {},
          drawRect() {},
          drawCircle() {},
          endFill() {},
          destroyed: 0,
          destroy() {
            this.destroyed++;
          }
        };
        layers.push(graphics);
        return graphics;
      }
    },
    sound: { play() {} }
  };
  const level = Object.create(PrinceJS.Level.prototype);
  level.rooms = [];
  level.dummyWall = Object.assign(Object.create(PrinceJS.Tile.Base.prototype), { element: 20 });
  for (let id = 1; id <= 2; id++) {
    level.rooms[id] = {
      x: 0,
      y: id - 1,
      links: { left: -1, right: -1, up: id - 1, down: id === 1 ? 2 : -1 },
      tiles: []
    };
  }
  const setTile = (room, x, y, element, posY = 0) => {
    const tile = Object.assign(
      Object.create(element === 4 ? PrinceJS.Tile.Gate.prototype : PrinceJS.Tile.Base.prototype),
      { room, roomX: x, roomY: y, element, posY }
    );
    level.rooms[room].tiles[y * 10 + x] = tile;
    return tile;
  };
  for (let id = 1; id <= 2; id++) {
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 10; column++) {
        setTile(id, column, row, row === 1 ? 1 : 0);
      }
    }
  }
  const kid = {
    level,
    room: 1,
    baseX: 0,
    baseY: 3,
    charBlockX: 1,
    charBlockY: 1,
    charX: 21,
    charY: 116,
    charFace: 1,
    charFrame: 15,
    alive: true,
    visible: true,
    active: true,
    alpha: 0.8,
    action: "stand",
    specialAction: null,
    beginSpecialAction(owner, type) {
      if (this.specialAction || !this.alive || !this.active || !this.visible) {
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
    },
    getCharBounds() {
      return { x: PrinceJS.Utils.convertX(this.charX) - 8, y: this.charY - 67, width: 12, height: 57 };
    }
  };
  const delegate = { game, level, kid, enemies: [], ui: { showText() {}, setOpponentLive() {} } };
  delegate.minigun = { pickup: PrinceJS.RangedWeapon.prototype.findPickup.call({ level, kid }, 1) };
  const molotov = new PrinceJS.Molotov(delegate, 1);
  const advance = (seconds) => {
    let ticks = Math.round(seconds / 0.01);
    for (let i = 0; i < ticks; i++) {
      molotov.update(0.01);
    }
  };
  const enemy = (x, bottom = 119, room = 1, name = "guard-1") => {
    const target = Object.assign(Object.create(PrinceJS.Fighter.prototype), {
      room,
      baseX: 0,
      baseY: level.rooms[room].y * 189 + 3,
      health: 4,
      alive: true,
      active: true,
      visible: true,
      charFrame: 16,
      charName: name,
      damage: 0,
      onDamageLife: { dispatch: (damage) => (target.damage += damage) },
      showSplash() {},
      hideSplash() {},
      bringAboveOpponent() {},
      getCharBounds: () => ({ x, y: bottom - target.baseY - 43, width: 18, height: 43 })
    });
    delegate.enemies.push(target);
    return target;
  };
  const bottle = (x = 112, y = 80, room = 1) => ({ x, y, room, age: 0, life: 6, vy: 100 });
  return { PrinceJS, kid, level, delegate, molotov, setTile, advance, enemy, bottle, layers };
}

test("the level-one bottle sits on a safe landing tile separate from the minigun and requires landing proximity", () => {
  const f = fixture();
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/maps/level1.json"), "utf8"));
  map.room
    .find((room) => room.id === map.prince.room)
    .tile.forEach((tile, i) => f.setTile(1, i % 10, Math.floor(i / 10), tile.element));
  f.kid.charBlockY = 0;
  f.delegate.minigun.pickup = f.PrinceJS.RangedWeapon.prototype.findPickup.call({ level: f.level, kid: f.kid }, 1);
  f.molotov.pickup = f.molotov.findPickup(1);
  Object.assign(f.molotov.effects.pickup, f.molotov.pickup);
  assert.equal(f.molotov.pickup.worldX, 112);
  assert.equal(f.molotov.pickup.worldY, 119);
  f.delegate.minigun.pickup = { worldX: 168, worldY: 182 };
  assert.equal(f.molotov.findPickup(1).worldX, 80, "moving the minigun frees the visible upper pickup spot");
  f.kid.charX = 49;
  f.kid.charY = 53;
  f.molotov.checkPickup();
  assert.equal(f.kid.hasMolotov, undefined);
  f.kid.charY = 116;
  f.kid.inFallDown = true;
  f.molotov.checkPickup();
  assert.equal(f.kid.hasMolotov, undefined);
  f.kid.inFallDown = false;
  f.molotov.checkPickup();
  assert.equal(f.kid.hasMolotov, true);
  assert.equal(f.molotov.pickup.collected, true);
  assert.equal(f.molotov.effects.collected, true);
});

test("Ctrl requires an owned bottle and a live, active, idle hanging Prince", () => {
  const f = fixture();
  assert.equal(f.molotov.throwFromHang(), false);
  f.kid.hasMolotov = true;
  assert.equal(f.molotov.throwFromHang(), false);
  f.kid.action = "hangstraight";
  f.kid.specialAction = { owner: {}, type: "jetpack" };
  assert.equal(f.molotov.throwFromHang(), false);
  f.kid.specialAction = null;
  f.kid.active = false;
  assert.equal(f.molotov.throwFromHang(), false);
  f.kid.active = true;
  assert.equal(f.molotov.throwFromHang(), true);
  assert.equal(f.molotov.throwFromHang(), false);
});

test("the quick hanging sequence drops once, restores the grip and rendered actor, and never consumes inventory", () => {
  const f = fixture();
  f.kid.hasMolotov = true;
  f.kid.action = "hang";
  f.kid.charFrame = 92;
  assert.equal(f.molotov.throwFromHang(), true);
  assert.equal(f.kid.alpha, 0);
  assert.equal(f.kid.specialAction.owner, f.molotov);
  f.advance(0.75);
  assert.equal(f.molotov.bottles.length, 0);
  assert.equal(f.molotov.throwState.lighterLit, true);
  f.advance(0.08);
  assert.equal(f.molotov.bottles.length, 1);
  assert.equal(f.molotov.throwState.released, true);
  const x = f.molotov.bottles[0].x;
  f.advance(0.17);
  assert.equal(f.kid.action, "hang");
  assert.equal(f.kid.charFrame, 92);
  assert.equal(f.kid.alpha, 0.8);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.kid.hasMolotov, true);
  assert.equal(f.molotov.throwState, null);
  assert.equal(f.molotov.fires.length, 1);
  assert.equal(f.molotov.fires[0].x, x);
  f.advance(0.2);
  assert.equal(f.molotov.throwFromHang(), true);
});

test("death, loss of a ledge, and an ownership change cancel safely before releasing a bottle", () => {
  for (const disruption of ["death", "ledge", "owner"]) {
    const f = fixture();
    f.kid.hasMolotov = true;
    f.kid.action = "hang";
    f.molotov.throwFromHang();
    f.advance(0.5);
    const newOwner = {};
    if (disruption === "death") {
      f.kid.alive = false;
      f.kid.action = "dropdead";
    } else if (disruption === "ledge") {
      f.kid.action = "hangfall";
    } else {
      f.kid.specialAction = { owner: newOwner, type: "jetpack" };
    }
    f.advance(0.1);
    assert.equal(f.molotov.bottles.length, 0);
    assert.equal(f.molotov.throwState, null);
    assert.equal(f.kid.alpha, 0.8);
    if (disruption === "owner") {
      assert.equal(f.kid.specialAction.owner, newOwner);
    } else {
      assert.equal(f.kid.specialAction, null);
    }
  }
});

test("swept falling bottles land on the first floor and continue through a linked room below", () => {
  const f = fixture();
  const initial = f.bottle();
  assert.equal(f.molotov.advanceBottle(initial, 350), false);
  assert.equal(f.molotov.fires[0].y, 119);
  f.molotov.fires.length = 0;
  f.setTile(1, 3, 1, 0);
  const dropped = f.bottle(112, 170);
  assert.equal(f.molotov.advanceBottle(dropped, 300), false);
  assert.equal(dropped.room, 2);
  assert.equal(f.molotov.fires[0].room, 2);
  assert.equal(f.molotov.fires[0].y, 308);
});

test("walls block a bottle, and an unlinked bottom edge cannot reach another room", () => {
  const f = fixture();
  f.setTile(1, 3, 1, 20);
  assert.equal(f.molotov.advanceBottle(f.bottle(112, 40), 300), false);
  assert.equal(f.molotov.fires.length, 0);
  f.setTile(1, 3, 1, 0);
  f.level.rooms[1].links.down = -1;
  assert.equal(f.molotov.advanceBottle(f.bottle(112, 170), 100), false);
  assert.equal(f.molotov.fires.length, 0);
});

test("ground fire persists, uses the existing health/death signals, and cannot burn through closed gates", () => {
  const f = fixture();
  const close = f.enemy(110);
  const otherFloor = f.enemy(110, 182);
  const hidden = f.enemy(110);
  hidden.visible = false;
  f.setTile(1, 3, 1, 4, 0);
  const shielded = f.enemy(145);
  f.molotov.ignite(f.bottle(125), 3, 1, 119);
  f.molotov.updateFires(0.01);
  assert.equal(close.health, 3);
  assert.equal(otherFloor.health, 4);
  assert.equal(hidden.health, 4);
  assert.equal(shielded.health, 4);
  f.molotov.updateFires(0.1);
  assert.equal(close.health, 3);
  assert.equal(close.damage, 1);
  f.setTile(1, 3, 1, 4, -47);
  f.molotov.updateFires(0.4);
  assert.equal(close.health, 2);
  assert.equal(shielded.health, 3);
  f.molotov.updateFires(0.46);
  f.molotov.updateFires(0.46);
  assert.equal(close.health, 0);
  assert.equal(close.alive, false);
  assert.equal(close.action, "dropdead");
  assert.equal(close.damage, 4);
  assert.ok(f.molotov.fires[0].life > 0);
  f.molotov.updateFires(6);
  assert.equal(f.molotov.fires.length, 0);
});

test("overlapping fires share a damage cadence, preserve skeleton immunity, and extinguish on a falling floor", () => {
  const f = fixture();
  const guard = f.enemy(110);
  const skeleton = f.enemy(110, 119, 1, "skeleton");
  for (let i = 0; i < 2; i++) {
    f.molotov.ignite(f.bottle(), 3, 1, 119);
  }
  f.molotov.updateFires(0.01);
  assert.equal(guard.health, 3);
  assert.equal(skeleton.health, 4);
  f.setTile(1, 3, 1, 0);
  f.molotov.updateFires(0.5);
  assert.equal(f.molotov.fires.length, 0);
});

test("destroy restores an in-progress pose and disposes bounded graphics and transient fire state once", () => {
  const f = fixture();
  f.kid.hasMolotov = true;
  f.kid.action = "hang";
  f.molotov.throwFromHang();
  f.molotov.bottles.push(f.bottle());
  f.molotov.ignite(f.bottle(), 3, 1, 119);
  f.molotov.destroy();
  f.molotov.destroy();
  assert.equal(f.kid.alpha, 0.8);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.molotov.bottles.length, 0);
  assert.equal(f.molotov.fires.length, 0);
  assert.equal(f.molotov.effects.particles.length, 0);
  assert.ok(f.layers.every((layer) => layer.destroyed === 1));
  assert.equal(f.molotov.throwFromHang(), false);
});
