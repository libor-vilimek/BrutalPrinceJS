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
    "Kid",
    "Level",
    "tiles/Base",
    "tiles/Gate",
    "JetpackEffects",
    "Jetpack"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  const atlas = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/gfx/kid.json"), "utf8"));
  const animations = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/anims/kid.json"), "utf8"));
  const graphics = [];
  const sprites = [];
  const game = {
    add: {
      sprite() {
        const sprite = {
          scale: { x: 1 },
          anchor: { setTo() {} },
          crop(rect) {
            this.cropRect = rect;
          },
          destroy() {
            this.destroyed = true;
          }
        };
        sprites.push(sprite);
        return sprite;
      },
      graphics() {
        const graphic = {
          scale: { x: 1 },
          shapes: [],
          clear() {
            this.shapes.length = 0;
          },
          beginFill(color, alpha) {
            this.color = color;
            this.alphaValue = alpha;
          },
          drawRect(x, y, width, height) {
            this.shapes.push({ color: this.color, alpha: this.alphaValue, x, y, width, height });
          },
          endFill() {},
          destroy() {
            this.destroyed = true;
          }
        };
        graphics.push(graphic);
        return graphic;
      }
    },
    cache: {
      getFrameData: () => ({
        getFrameByName(name) {
          const frame = atlas.frames[name].frame;
          return { width: frame.w, height: frame.h };
        }
      })
    },
    sound: { play() {} }
  };
  const level = Object.create(PrinceJS.Level.prototype);
  level.rooms = [];
  level.dummyWall = Object.assign(Object.create(PrinceJS.Tile.Base.prototype), { element: 20 });
  level.unMaskTile = () => {};
  const setTile = (room, x, y, element, posY = 0) => {
    const tile = Object.assign(
      Object.create(element === 4 ? PrinceJS.Tile.Gate.prototype : PrinceJS.Tile.Base.prototype),
      { room, roomX: x, roomY: y, element, posY, shakes: 0, pushes: 0, raises: 0 }
    );
    tile.shake = () => tile.shakes++;
    tile.push = () => tile.pushes++;
    tile.raise = () => tile.raises++;
    level.rooms[room].tiles[y * 10 + x] = tile;
    return tile;
  };
  const roomPositions = [
    [0, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, 0]
  ];
  for (let id = 1; id <= roomPositions.length; id++) {
    const [x, y] = roomPositions[id - 1];
    level.rooms[id] = { x, y, links: { left: -1, right: -1, up: -1, down: -1 }, tiles: [] };
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 10; column++) {
        setTile(id, column, row, 0);
      }
    }
  }
  Object.assign(level.rooms[1].links, { right: 2, up: 3, down: 4, left: 5 });
  level.rooms[2].links.left = level.rooms[3].links.down = level.rooms[4].links.up = level.rooms[5].links.right = 1;
  for (let column = 0; column < 10; column++) {
    setTile(1, column, 1, 1);
  }
  const pressed = { left: false, right: false, up: false, down: false };
  const roomsChanged = [];
  const kid = Object.assign(Object.create(PrinceJS.Kid.prototype), {
    game,
    level,
    anims: animations,
    charName: "kid",
    room: 1,
    baseX: 0,
    baseY: 3,
    charX: 49,
    charY: 116,
    charFdx: 0,
    charFdy: 0,
    charFrame: 15,
    charFace: 1,
    charBlockX: 3,
    charBlockY: 1,
    charXVel: 4,
    charYVel: 8,
    fallingBlocks: 3,
    action: "stand",
    alive: true,
    active: true,
    visible: true,
    health: 10,
    alpha: 1,
    scale: { x: -1 },
    sword: { visible: false, scale: { x: -1 } },
    specialAction: null,
    onChangeRoom: { dispatch: (room) => roomsChanged.push(room) },
    keyL: () => pressed.left,
    keyR: () => pressed.right,
    keyU: () => pressed.up,
    keyD: () => pressed.down,
    crop(rect) {
      this.cropRect = rect;
    },
    processCommand() {
      this.actionCode = this.action === "freefall" ? 4 : 0;
      this.charFrame = this.action === "freefall" ? 106 : 15;
      this.updateCharFrame();
    },
    dieSpikes() {
      this.alive = false;
      this.action = "impale";
    }
  });
  kid.updateCharFrame();
  const ui = { showText() {} };
  const jetpack = new PrinceJS.Jetpack({ game, kid, level, ui });
  const advance = (ticks, dt = 0.05) => {
    for (let i = 0; i < ticks; i++) {
      jetpack.update(dt);
    }
  };
  return { PrinceJS, kid, level, jetpack, pressed, graphics, sprites, setTile, advance, roomsChanged };
}

test("J equips in a short locked sequence, then arrows lift the Prince and idle hovers", () => {
  const f = fixture();
  assert.equal(f.kid.hasJetpack, true);
  assert.equal(f.jetpack.toggle(), true);
  assert.equal(f.kid.specialAction.owner, f.jetpack);
  assert.equal(f.kid.specialAction.type, "jetpack");
  assert.equal(f.kid.beginSpecialAction({}, "weapon"), false);
  f.pressed.up = true;
  f.advance(4);
  assert.equal(f.kid.charY, 116);
  assert.equal(f.jetpack.phase, "equipping");
  f.advance(8);
  assert.equal(f.jetpack.phase, "flying");
  assert.ok(f.kid.charY < 100);
  assert.equal(f.kid.inFallDown, false);
  f.pressed.up = false;
  f.advance(5);
  const hoverY = f.kid.charY;
  f.advance(40);
  assert.equal(f.kid.charY, hoverY);
  assert.equal(f.jetpack.velocityY, 0);
  assert.ok([32, 33].includes(f.kid.charFrame));
});

test("toggle removes the pack on the ground, in midair and during equip without leaving a lock", () => {
  const f = fixture();
  f.jetpack.toggle();
  assert.equal(f.jetpack.toggle(), true);
  assert.equal(f.kid.action, "stand");
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.kid.jetpackEquipped, false);
  f.jetpack.toggle();
  f.pressed.up = true;
  f.advance(12);
  f.jetpack.toggle();
  assert.equal(f.kid.action, "freefall");
  assert.equal(f.kid.inFallDown, true);
  assert.equal(f.kid.fallingBlocks, 0);
  assert.equal(f.kid.charYVel, 0);
  assert.equal(f.kid.specialAction, null);
  assert.ok(f.graphics.every((graphics) => !graphics.visible));
});

test("other action owners, potions, inactive actors and dead actors reject flight", () => {
  const f = fixture();
  const other = {};
  f.kid.specialAction = { owner: other, type: "molotov" };
  assert.equal(f.jetpack.toggle(), false);
  assert.equal(f.kid.specialAction.owner, other);
  f.kid.specialAction = null;
  for (const flag of ["pickupPotion", "pickupSword"]) {
    f.kid[flag] = true;
    assert.equal(f.jetpack.toggle(), false);
    f.kid[flag] = false;
  }
  f.kid.action = "drinkpotion";
  assert.equal(f.jetpack.toggle(), false);
  f.kid.action = "stand";
  for (const flag of ["active", "visible", "alive"]) {
    f.kid[flag] = false;
    assert.equal(f.jetpack.toggle(), false);
    f.kid[flag] = true;
  }
  f.kid.room = -1;
  assert.equal(f.jetpack.toggle(), false);
});

test("swept flight stops at a full wall and cannot tunnel through a thin closed gate", () => {
  const f = fixture();
  f.setTile(1, 4, 1, 20);
  f.jetpack.toggle();
  f.pressed.right = true;
  f.advance(80, 1);
  assert.ok(f.jetpack.position.x <= 120);
  assert.ok(f.jetpack.position.x > 119);
  assert.equal(f.kid.room, 1);
  f.jetpack.toggle();
  f.setTile(1, 4, 1, 1);
  f.setTile(1, 3, 1, 4);
  f.jetpack.toggle();
  f.advance(80);
  assert.ok(f.jetpack.position.x <= 128);
  assert.ok(f.jetpack.position.x > 127);
  const closedX = f.jetpack.position.x;
  f.setTile(1, 3, 1, 4, -47);
  f.advance(15);
  assert.ok(f.jetpack.position.x > closedX + 30);
});

test("floors catch downward flight and ceilings stop upward flight unless the tile is a gap", () => {
  const f = fixture();
  f.kid.charY = 83;
  f.jetpack.toggle();
  f.pressed.down = true;
  f.advance(40);
  assert.ok(Math.abs(f.kid.charY - 116) < 0.01);
  assert.equal(f.jetpack.grounded, true);
  assert.equal(f.kid.charFrame, 15);
  for (let column = 0; column < 10; column++) {
    f.setTile(1, column, 0, 1);
  }
  f.pressed.down = false;
  f.pressed.up = true;
  f.advance(40);
  assert.ok(Math.abs(f.kid.charY - 99) < 0.01);
  f.setTile(1, 3, 0, 0);
  f.advance(8);
  assert.ok(f.kid.charY < 80);
});

test("horizontal and vertical linked room travel updates actor, bases, block indices and camera signal", () => {
  const right = fixture();
  right.jetpack.toggle();
  right.pressed.right = true;
  right.advance(65);
  assert.equal(right.kid.room, 2);
  assert.equal(right.kid.baseX, 320);
  assert.ok(right.kid.charBlockX >= 0 && right.kid.charBlockX < 10);
  assert.deepEqual(right.roomsChanged, [2]);
  right.pressed.right = false;
  right.pressed.left = true;
  right.advance(70);
  assert.equal(right.kid.room, 1);
  assert.equal(right.kid.charFace, -1);
  assert.equal(right.kid.baseX, 0);
  assert.ok(right.roomsChanged.includes(1));

  const up = fixture();
  up.jetpack.toggle();
  up.pressed.up = true;
  up.advance(35);
  assert.equal(up.kid.room, 3);
  assert.equal(up.kid.baseY, -186);
  assert.equal(up.kid.charBlockY, 2);
  assert.deepEqual(up.roomsChanged, [3]);

  const down = fixture();
  for (let column = 0; column < 10; column++) {
    down.setTile(1, column, 1, 0);
  }
  down.kid.charY = 140;
  down.jetpack.toggle();
  down.pressed.down = true;
  down.advance(23);
  assert.equal(down.kid.room, 4);
  assert.equal(down.kid.baseY, 192);
  assert.equal(down.kid.charBlockY, 0);
  assert.deepEqual(down.roomsChanged, [4]);
});

test("missing room links never move the actor or camera out of the mapped level", () => {
  for (const direction of ["left", "right", "up", "down"]) {
    const f = fixture();
    Object.assign(f.level.rooms[1].links, { left: -1, right: -1, up: -1, down: -1 });
    for (let column = 0; column < 10; column++) {
      f.setTile(1, column, 1, 0);
    }
    f.jetpack.toggle();
    f.pressed[direction] = true;
    f.advance(100);
    assert.equal(f.kid.room, 1);
    assert.equal(f.roomsChanged.length, 0);
    assert.ok(f.jetpack.position.x >= 16 && f.jetpack.position.x <= 312);
    assert.ok(f.jetpack.position.y >= 40 && f.jetpack.position.y < 189);
  }
});

test("hovering above buttons and loose floors does not trigger them; actual contact does", () => {
  for (const [element, counter] of [
    [6, "pushes"],
    [15, "pushes"],
    [11, "shakes"]
  ]) {
    const f = fixture();
    const tile = f.setTile(1, 3, 1, element);
    f.kid.charY = 88;
    f.jetpack.toggle();
    f.advance(10);
    assert.equal(tile[counter], 0);
    f.pressed.down = true;
    f.advance(20);
    assert.ok(tile[counter] > 0);
  }
});

test("landing on spikes remains lethal and releases flight ownership", () => {
  const f = fixture();
  const spikes = f.setTile(1, 3, 1, 2);
  f.kid.charY = 88;
  f.jetpack.toggle();
  f.pressed.down = true;
  f.advance(30);
  assert.equal(f.kid.alive, false);
  assert.equal(f.kid.action, "impale");
  assert.equal(f.jetpack.active, false);
  assert.equal(f.kid.specialAction, null);
  assert.ok(spikes.raises > 0);
  assert.ok(f.graphics.every((graphics) => !graphics.visible));
});

test("damage, death and shutdown remove the pack without replacing death animation or another owner", () => {
  const f = fixture();
  f.jetpack.toggle();
  f.pressed.up = true;
  f.advance(12);
  f.kid.health--;
  f.advance(1);
  assert.equal(f.jetpack.active, false);
  assert.equal(f.kid.action, "freefall");
  assert.equal(f.kid.specialAction, null);
  f.jetpack.toggle();
  f.kid.alive = false;
  f.kid.action = "halve";
  f.advance(1);
  assert.equal(f.kid.action, "halve");
  assert.equal(f.kid.specialAction, null);
  f.kid.alive = true;
  f.kid.action = "stand";
  f.jetpack.toggle();
  const other = {};
  f.kid.specialAction = { owner: other, type: "weapon" };
  f.advance(1);
  assert.equal(f.kid.specialAction.owner, other);
  f.jetpack.destroy();
  f.jetpack.destroy();
  assert.equal(f.jetpack.toggle(), false);
  assert.ok(f.graphics.every((graphics) => graphics.destroyed));
});

test("a grounded injury interrupts flight without replacing its animation or sequence position", () => {
  const f = fixture();
  f.jetpack.toggle();
  f.advance(6);
  f.kid.action = "stabbed";
  f.kid._seqpointer = 3;
  f.kid.charFrame = 174;
  f.kid.health--;
  f.advance(1);
  assert.equal(f.jetpack.active, false);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.kid.action, "stabbed");
  assert.equal(f.kid._seqpointer, 3);
  assert.equal(f.kid.charFrame, 174);
  assert.equal(f.kid.inFallDown, false);
});

test("pixel-art pack, two-handed straps and animated exhaust are visible only while equipped", () => {
  const f = fixture();
  assert.ok(f.graphics.every((graphic) => !graphic.visible));
  f.jetpack.toggle();
  f.pressed.up = true;
  f.advance(12);
  const effects = f.jetpack.effects;
  assert.ok(effects.pack.visible && effects.grip.visible && effects.exhaust.visible);
  assert.ok(effects.head.visible);
  assert.equal(f.kid.cropRect.height, 15);
  assert.ok(f.kid.cropRect.y >= 24);
  assert.ok(effects.pack.shapes.some((shape) => shape.color === 0x97adb0));
  assert.equal(effects.grip.shapes.filter((shape) => shape.color === 0xdd8866 && shape.y >= -25).length, 2);
  assert.ok(effects.exhaust.shapes.some((shape) => shape.color === 0xfff4aa));
  f.pressed.up = false;
  f.advance(120);
  assert.ok(effects.particles.length <= 40);
  f.jetpack.toggle();
  assert.equal(effects.particles.length, 0);
  assert.equal(f.kid.cropRect, null);
  assert.equal(effects.head.visible, false);
  assert.ok(f.graphics.every((graphic) => !graphic.visible));
});

test("the native torso crop is restored on J, damage, death, foreign ownership and destroy", () => {
  for (const reason of ["J", "damage", "death", "foreign owner", "destroy"]) {
    const f = fixture();
    const originalAlpha = (f.kid.alpha = 0.85);
    const splash = (f.kid.splash = { visible: true, alpha: 1 });
    const shadow = (f.kid.shadowOverlay = {
      visible: true,
      cropRect: null,
      crop(rect) {
        this.cropRect = rect;
      }
    });
    f.jetpack.toggle();
    f.pressed.up = true;
    f.advance(12);
    assert.equal(f.kid.cropRect.height, 15);
    assert.equal(shadow.cropRect, f.kid.cropRect);
    assert.equal(f.kid.alpha, originalAlpha);
    assert.equal(f.kid.visible, true);
    assert.equal(splash.visible, true);
    assert.equal(splash.alpha, 1);
    if (reason === "J") {
      f.jetpack.toggle();
    } else if (reason === "destroy") {
      f.jetpack.destroy();
      assert.ok(f.sprites.every((sprite) => sprite.destroyed));
    } else {
      if (reason === "damage") {
        f.kid.health--;
      } else if (reason === "death") {
        f.kid.alive = false;
        f.kid.action = "halve";
      } else {
        f.kid.specialAction = { owner: {}, type: "molotov" };
      }
      f.advance(1);
    }
    assert.equal(f.kid.cropRect, null, reason);
    assert.equal(shadow.cropRect, null, reason);
    assert.equal(f.kid.alpha, originalAlpha, reason);
    assert.equal(splash.visible, true, reason);
    assert.equal(f.jetpack.effects.head.visible, false, reason);
  }
});
