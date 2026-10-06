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
    "GorePhysics",
    "MolotovBallistics",
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
    cropRect: null,
    crop(rect) {
      this.cropRect = rect;
    },
    keyU: () => false,
    sword: { visible: false },
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
  const ctrlKey = { isDown: false };
  const fireKey = { isDown: false };
  const delegate = {
    game,
    level,
    kid,
    enemies: [],
    weaponCtrlKey: ctrlKey,
    weaponFireKey: fireKey,
    ui: { showText() {}, setOpponentLive() {} }
  };
  delegate.minigun = { pickup: PrinceJS.RangedWeapon.prototype.findPickup.call({ level, kid }, 1) };
  const molotov = new PrinceJS.Molotov(delegate, 1);
  delegate.weapons = [molotov];
  const equip = () => {
    kid.hasMolotov = true;
    molotov.pickup.collected = true;
    molotov.effects.collected = true;
    molotov.equip();
  };
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
  return { PrinceJS, kid, level, delegate, molotov, setTile, advance, enemy, bottle, layers, ctrlKey, fireKey, equip };
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
  assert.equal(f.kid.activeWeapon, "molotov");
  assert.equal(f.kid.molotovEquipped, true);
});

test("handling a bottle requires ownership, selection, a safe stance, and a live active Prince", () => {
  const f = fixture();
  assert.equal(f.molotov.beginCharge(), false);
  f.kid.hasMolotov = true;
  assert.equal(f.molotov.beginCharge(), false);
  f.equip();
  f.kid.action = "freefall";
  assert.equal(f.molotov.beginCharge(), false);
  f.kid.action = "hangstraight";
  f.kid.specialAction = { owner: {}, type: "jetpack" };
  assert.equal(f.molotov.beginCharge(), false);
  f.kid.specialAction = null;
  f.kid.active = false;
  assert.equal(f.molotov.beginCharge(), false);
  f.kid.active = true;
  assert.equal(f.molotov.beginCharge(), true);
  assert.equal(f.molotov.beginCharge(), false);
});

test("pressing Ctrl on a ledge immediately lights and drops once, restores the grip, and does not repeat while held", () => {
  const f = fixture();
  f.equip();
  f.kid.action = "hang";
  f.kid.charFrame = 92;
  f.kid.keyU = () => true;
  f.ctrlKey.isDown = true;
  let launches = 0;
  const createBottle = f.PrinceJS.MolotovBallistics.createBottle;
  f.PrinceJS.MolotovBallistics.createBottle = function (...args) {
    launches++;
    return createBottle.apply(this, args);
  };
  assert.equal(f.molotov.throwFromHang(), true);
  assert.equal(f.kid.alpha, 0);
  assert.equal(f.kid.specialAction.owner, f.molotov);
  assert.equal(f.molotov.throwState.phase, "throwing");
  assert.equal(f.molotov.throwState.charge, 0);
  assert.equal(f.molotov.throwState.aimUp, false);
  f.advance(0.41);
  assert.equal(f.molotov.bottles.length, 0);
  assert.equal(f.molotov.fires.length, 0);
  assert.equal(f.molotov.throwState.lighterLit, true);
  f.advance(0.01);
  assert.equal(f.molotov.bottles.length, 1);
  assert.equal(f.molotov.bottles[0].vx, 0);
  assert.ok(f.molotov.bottles[0].vy > 0);
  assert.equal(f.molotov.throwState.released, true);
  f.advance(0.18);
  assert.equal(f.kid.action, "hang");
  assert.equal(f.kid.charFrame, 92);
  assert.equal(f.kid.alpha, 0.8);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.kid.hasMolotov, true);
  assert.equal(f.molotov.throwState, null);
  assert.equal(f.molotov.actionStage, "hidden");
  f.advance(12);
  assert.equal(launches, 1);
  assert.equal(f.molotov.throwState, null);
  f.ctrlKey.isDown = false;
  f.advance(0.01);
  f.ctrlKey.isDown = true;
  f.advance(0.42);
  assert.equal(launches, 2, "a new press starts the next hanging throw");
});

test("holding Ctrl on the floor stays unlit at maximum charge until release", () => {
  const f = fixture();
  f.equip();
  f.ctrlKey.isDown = true;
  f.advance(12);
  assert.equal(f.molotov.throwState.phase, "charging");
  assert.equal(f.molotov.throwState.charge, 1.5);
  assert.equal(f.molotov.throwState.lighterLit, false);
  assert.equal(f.molotov.bottles.length, 0);
  assert.equal(f.molotov.fires.length, 0);
  f.ctrlKey.isDown = false;
  f.molotov.releaseThrow();
  f.advance(0.42);
  assert.equal(f.molotov.bottles.length, 1);
  assert.ok(f.molotov.bottles[0].vx > 0);
  f.advance(0.18);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.kid.cropRect, null);
});

test("standing and crouched throws retain native legs and head size, mirror direction, and sample Up on release", () => {
  for (const action of ["running", "stoop"]) {
    for (const direction of [1, -1]) {
      const f = fixture();
      f.equip();
      f.kid.action = action;
      f.kid.charFace = direction;
      f.kid.charX = 70;
      f.ctrlKey.isDown = true;
      f.advance(0.3);
      assert.equal(f.molotov.throwState.hanging, false);
      assert.equal(f.kid.alpha, 0.8);
      assert.equal(f.kid.cropRect, f.molotov.effects.bodyCrop);
      assert.equal(f.molotov.effects.bodyCrop.height, action === "stoop" ? 5 : 16);
      assert.equal(f.molotov.effects.head.scale.x, -direction);
      f.kid.keyU = () => true;
      f.ctrlKey.isDown = false;
      f.molotov.releaseThrow();
      f.kid.keyU = () => false;
      f.advance(0.42);
      assert.equal(f.molotov.bottles.length, 1);
      assert.equal(f.molotov.bottles[0].aimUp, true, "aim is locked at release, before lighting");
      assert.equal(Math.sign(f.molotov.bottles[0].vx), direction);
      assert.equal(f.kid.charX, 70);
      f.advance(0.18);
      assert.equal(f.kid.cropRect, null);
      assert.equal(f.kid.specialAction, null);
      assert.equal(f.molotov.effects.head.visible, false);
    }
  }
});

test("F and Ctrl share one charge; releasing one key while the other is held does not throw", () => {
  const f = fixture();
  f.equip();
  f.fireKey.isDown = true;
  f.advance(0.2);
  f.ctrlKey.isDown = true;
  f.fireKey.isDown = false;
  f.advance(0.4);
  assert.equal(f.molotov.throwState.phase, "charging");
  assert.equal(f.molotov.bottles.length, 0);
  f.ctrlKey.isDown = false;
  f.advance(0.01);
  assert.equal(f.molotov.throwState.phase, "throwing");
  f.advance(0.42);
  assert.equal(f.molotov.bottles.length, 1);
});

test("Shift leaves slow steps available and touch action preserves nearby potions", () => {
  const f = fixture();
  f.equip();
  f.kid.keyS = () => true;
  f.advance(0.2);
  assert.equal(f.kid.specialAction, null);
  f.kid.keyWeaponAction = () => true;
  f.setTile(1, f.kid.charBlockX + f.kid.charFace, 1, f.PrinceJS.Level.TILE_POTION);
  f.advance(0.2);
  assert.equal(f.kid.specialAction, null);
  f.ctrlKey.isDown = true;
  f.advance(0.2);
  assert.equal(f.kid.specialAction.owner, f.molotov, "keyboard trigger remains explicit beside a potion");
});

test("a short hanging tap drops straight down into the opening fire encounter without awaiting release", () => {
  const f = fixture();
  f.equip();
  f.kid.action = "hang";
  f.ctrlKey.isDown = true;
  f.advance(0.08);
  assert.equal(f.molotov.throwState.phase, "throwing");
  f.ctrlKey.isDown = false;
  assert.equal(f.molotov.releaseThrow(), false);
  f.advance(0.34);
  assert.equal(f.molotov.bottles[0].vx, 0);
  const x = f.molotov.bottles[0].x;
  f.advance(0.6);
  assert.equal(f.molotov.fires.length, 1);
  assert.equal(f.molotov.fires[0].x, x);
});

test("molotov and guns select exclusively; charging can cancel, but lighting and throwing keep the movement lock", () => {
  const f = fixture();
  const gun = Object.assign(Object.create(f.PrinceJS.RangedWeapon.prototype), {
    delegate: f.delegate,
    kid: f.kid,
    effects: {},
    equipTime: 0,
    spec: { id: "minigun", owned: "hasMinigun", equipped: "minigunEquipped" }
  });
  f.kid.hasMinigun = true;
  f.delegate.weapons = [f.molotov, gun];
  f.equip();
  f.ctrlKey.isDown = true;
  f.advance(0.2);
  assert.equal(gun.equip(), true, "selecting another weapon cancels an unlit charged bottle");
  assert.equal(f.kid.molotovEquipped, false);
  assert.equal(f.kid.minigunEquipped, true);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.kid.cropRect, null);
  assert.equal(f.molotov.bottles.length, 0);
  f.ctrlKey.isDown = false;
  f.advance(0.2);
  assert.equal(f.molotov.equip(), true);
  assert.equal(f.kid.minigunEquipped, false);
  f.ctrlKey.isDown = true;
  f.advance(0.2);
  f.ctrlKey.isDown = false;
  f.molotov.releaseThrow();
  assert.equal(gun.equip(), false);
  assert.equal(f.kid.specialAction.owner, f.molotov);
  f.advance(0.6);
  assert.equal(gun.equip(), true);
  assert.equal(f.kid.specialAction, null);
});

test("death, loss of a ledge, and an ownership change cancel safely before releasing a bottle", () => {
  for (const disruption of ["death", "ledge", "owner"]) {
    const f = fixture();
    f.equip();
    f.kid.action = "hang";
    f.ctrlKey.isDown = true;
    f.molotov.throwFromHang();
    f.advance(0.2);
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

test("ground injury cancels before launch and restores the native crop without replacing the injury sequence", () => {
  const f = fixture();
  f.equip();
  f.ctrlKey.isDown = true;
  f.advance(0.4);
  f.ctrlKey.isDown = false;
  f.molotov.releaseThrow();
  f.advance(0.2);
  f.kid.action = "stabbed";
  f.advance(0.05);
  assert.equal(f.molotov.throwState, null);
  assert.equal(f.molotov.bottles.length, 0);
  assert.equal(f.kid.cropRect, null);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.kid.action, "stabbed");
});

test("swept falling bottles land on the first floor and continue through a linked room below", () => {
  const f = fixture();
  const initial = f.bottle();
  assert.equal(f.molotov.advanceBottle(initial, 1), false);
  assert.equal(f.molotov.fires[0].y, 119);
  f.molotov.fires.length = 0;
  f.setTile(1, 3, 1, 0);
  const dropped = f.bottle(112, 170);
  assert.equal(f.molotov.advanceBottle(dropped, 1), false);
  assert.equal(dropped.room, 2);
  assert.equal(f.molotov.fires[0].room, 2);
  assert.equal(f.molotov.fires[0].y, 308);
});

test("walls block a bottle, and an unlinked bottom edge cannot reach another room", () => {
  const f = fixture();
  f.setTile(1, 3, 1, 20);
  assert.equal(f.molotov.advanceBottle(f.bottle(112, 40), 1), false);
  assert.equal(f.molotov.fires.length, 0);
  f.setTile(1, 3, 1, 0);
  f.level.rooms[1].links.down = -1;
  assert.equal(f.molotov.advanceBottle(f.bottle(112, 170), 0.5), false);
  assert.equal(f.molotov.fires.length, 0);
});

test("ceiling impacts drop burning oil below a native slab or solid wall and ignite only the floor beneath", () => {
  for (const element of [1, 20]) {
    const f = fixture();
    f.setTile(1, 3, 1, element);
    for (let column = 0; column < 10; column++) {
      f.setTile(1, column, 2, 1);
    }
    const impacts = [];
    f.molotov.effects.shatter = (x, y, burning) => impacts.push({ x, y, burning });
    const bottle = Object.assign(f.bottle(112, 155), { vx: 0, vy: -400 });
    assert.equal(f.molotov.advanceBottle(bottle, 0.1), false);
    assert.ok(Math.abs(bottle.y - 131) < 0.00001);
    assert.equal(impacts.length, 1);
    assert.equal(impacts[0].burning, true);
    assert.equal(f.molotov.fires.length, 0, "the surface above the impact never catches fire");
    assert.equal(f.molotov.oils.length, 3);
    assert.ok(f.molotov.oils.every((oil) => oil.oil && oil.room === 1 && oil.y - oil.radius > 126 && oil.vy > 0));
    f.advance(0.7);
    assert.equal(f.molotov.oils.length, 0);
    assert.equal(f.molotov.fires.length, 3);
    assert.ok(f.molotov.fires.every((fire) => fire.room === 1 && fire.row === 2 && fire.y === 182));
    assert.equal(impacts.length, 1, "oil landing does not replay the glass impact");
  }
});

test("a fully charged Up throw in native level one's lower room burns the floor below its stone ceiling", () => {
  const f = fixture();
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/maps/level1.json"), "utf8"));
  for (const id of [1, 2]) {
    const index = map.room.findIndex((room) => room.id === id);
    f.level.rooms[id].x = index % map.size.width;
    f.level.rooms[id].y = Math.floor(index / map.size.width);
    map.room[index].tile.forEach((tile, i) => f.setTile(id, i % 10, Math.floor(i / 10), tile.element));
  }
  f.kid.room = 2;
  const room = f.level.rooms[2];
  const originX = room.x * f.PrinceJS.ROOM_WIDTH;
  const originY = room.y * f.PrinceJS.ROOM_HEIGHT;
  const point = { x: originX + f.PrinceJS.Utils.convertX(49) + 14, y: originY + 119 - 33 };
  const bottle = f.PrinceJS.MolotovBallistics.createBottle(
    f.molotov,
    { charge: 1.5, aimUp: true, direction: 1 },
    point
  );
  f.molotov.bottles.push(bottle);
  f.advance(0.1);
  assert.equal(f.molotov.bottles.length, 0);
  assert.ok(Math.abs(bottle.y - (originY + 68)) < 0.00001);
  assert.equal(f.molotov.oils.length, 3);
  assert.equal(f.molotov.fires.length, 0);
  f.advance(0.7);
  assert.equal(f.molotov.oils.length, 0);
  assert.equal(f.molotov.fires.length, 3);
  assert.ok(f.molotov.fires.every((fire) => fire.room === 2 && fire.row === 1 && fire.y === originY + 119));
});

test("oil from a ceiling in an upper linked room stays in the exposed lower room and stops at its first floor", () => {
  const f = fixture();
  f.setTile(1, 3, 2, 1);
  const bottle = Object.assign(f.bottle(112, 220, 2), { vx: 0, vy: -400 });
  assert.equal(f.molotov.advanceBottle(bottle, 0.1), false);
  assert.ok(Math.abs(bottle.y - 194) < 0.00001);
  assert.equal(f.molotov.fires.length, 0);
  assert.equal(f.molotov.oils.length, 3);
  assert.ok(f.molotov.oils.every((oil) => oil.room === 2 && oil.y - oil.radius > 189));
  f.advance(1);
  assert.equal(f.molotov.oils.length, 0);
  assert.equal(f.molotov.fires.length, 3);
  assert.ok(f.molotov.fires.every((fire) => fire.room === 2 && fire.row === 1 && fire.y === 308));
});

test("ceiling oil falls through real gaps and lower links without crossing a closed map boundary", () => {
  for (const linked of [true, false]) {
    const f = fixture();
    for (let column = 0; column < 10; column++) {
      f.setTile(1, column, 1, 0);
    }
    f.setTile(1, 3, 0, 1);
    if (!linked) {
      f.level.rooms[1].links.down = -1;
    }
    const bottle = Object.assign(f.bottle(112, 100), { vx: 0, vy: -400 });
    assert.equal(f.molotov.advanceBottle(bottle, 0.12), false);
    assert.equal(f.molotov.oils.length, 3);
    f.advance(1.6);
    assert.equal(f.molotov.oils.length, 0);
    assert.equal(f.molotov.fires.length, linked ? 3 : 0);
    assert.ok(f.molotov.fires.every((fire) => fire.room === 2 && fire.y === 308));
  }
  const f = fixture();
  f.level.rooms[2].links.up = -1;
  const bottle = Object.assign(f.bottle(112, 220, 2), { vx: 0, vy: -400 });
  assert.equal(f.molotov.advanceBottle(bottle, 0.12), false);
  assert.equal(f.molotov.oils.length, 0, "a sealed missing upper room has no native ceiling tile to ignite");
  assert.equal(f.molotov.fires.length, 0);
});

test("wall impacts burn the struck face and drop burning oil onto the actual floor below in both directions", () => {
  for (const direction of [1, -1]) {
    const f = fixture();
    const wall = f.setTile(1, 3, 1, 20);
    const impacts = [];
    f.molotov.effects.shatter = (x, y, burning) => impacts.push({ x, y, burning });
    const bottle = Object.assign(f.bottle(direction > 0 ? 90 : 134, 86), { vx: direction * 500, vy: 0 });
    assert.equal(f.molotov.advanceBottle(bottle, 0.08), false);
    assert.equal(impacts.length, 1);
    assert.equal(impacts[0].burning, true);
    assert.equal(f.molotov.fires.length, 1);
    const attached = f.molotov.fires[0];
    assert.equal(attached.kind, "wall");
    assert.equal(attached.tile, wall);
    assert.equal(attached.x, direction > 0 ? 96 : 128);
    assert.equal(attached.normalX, -direction);
    assert.equal(f.molotov.oils.length, 3);
    assert.ok(f.molotov.oils.every((oil) => oil.oil && oil.vy > 0));
    f.advance(0.65);
    assert.equal(f.molotov.oils.length, 0);
    const pools = f.molotov.fires.filter((fire) => fire.kind !== "wall");
    assert.equal(pools.length, 3);
    assert.ok(pools.every((pool) => pool.y === 119 && pool.room === 1 && pool.column === (direction > 0 ? 2 : 4)));
    assert.equal(impacts.length, 1, "oil landing does not play another glass impact");
    assert.ok(attached.life > 0);
    f.setTile(1, 3, 1, 0);
    f.molotov.updateFires(0.01);
    assert.ok(!f.molotov.fires.includes(attached), "attached fire vanishes with the struck wall");
    assert.equal(f.molotov.fires.length, 3, "supported pools remain after the wall is destroyed");
  }
});

test("burning wall oil falls through a gap and linked lower room, and never ignites behind an unlinked edge", () => {
  for (const linked of [true, false]) {
    const f = fixture();
    f.setTile(1, 3, 1, 20);
    f.setTile(1, 2, 1, 0);
    if (!linked) {
      f.level.rooms[1].links.down = -1;
    }
    const bottle = Object.assign(f.bottle(90, 86), { vx: 500, vy: 0 });
    f.molotov.advanceBottle(bottle, 0.08);
    f.advance(1.5);
    assert.equal(f.molotov.oils.length, 0);
    const pools = f.molotov.fires.filter((fire) => fire.kind !== "wall");
    assert.equal(pools.length, linked ? 3 : 0);
    assert.ok(pools.every((pool) => pool.room === 2 && pool.y === 308 && pool.column === 2));
  }
});

test("wall flame burns only the exposed side of a closed gate and disappears when the gate lifts clear", () => {
  const f = fixture();
  const gate = f.setTile(1, 3, 1, 4);
  const near = f.enemy(115);
  const shielded = f.enemy(142);
  const bottle = Object.assign(f.bottle(130, 86), { vx: 500, vy: 0 });
  f.molotov.advanceBottle(bottle, 0.08);
  f.molotov.updateFires(0.01);
  assert.equal(near.health, 3);
  assert.equal(shielded.health, 4);
  assert.equal(f.molotov.fires[0].kind, "wall");
  gate.posY = -47;
  f.molotov.updateFires(0.01);
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
  f.equip();
  f.kid.action = "hang";
  f.molotov.throwFromHang();
  f.molotov.bottles.push(f.bottle());
  f.molotov.oils.push(Object.assign(f.bottle(), { oil: true }));
  f.molotov.ignite(f.bottle(), 3, 1, 119);
  f.molotov.destroy();
  f.molotov.destroy();
  assert.equal(f.kid.alpha, 0.8);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.molotov.bottles.length, 0);
  assert.equal(f.molotov.oils.length, 0);
  assert.equal(f.molotov.fires.length, 0);
  assert.equal(f.molotov.effects.particles.length, 0);
  assert.ok(f.layers.every((layer) => layer.destroyed === 1));
  assert.equal(f.molotov.throwFromHang(), false);
});
