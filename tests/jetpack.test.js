"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture(number = 13, map = null) {
  const PrinceJS = { ROOM_WIDTH: 320, ROOM_HEIGHT: 189, BLOCK_WIDTH: 32, BLOCK_HEIGHT: 63, currentLevel: number };
  const context = vm.createContext({
    PrinceJS,
    Phaser: {
      Sprite: function () {},
      Signal: function () {
        const listeners = [];
        this.add = (callback, owner) => listeners.push((...args) => callback.apply(owner, args));
        this.dispatch = (...args) => listeners.forEach((listener) => listener(...args));
      },
      Animation: {
        generateFrameNames: (prefix, first, last, suffix) =>
          Array.from({ length: last - first + 1 }, (_, index) => prefix + (first + index) + suffix)
      },
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
    "tiles/Loose",
    "PrincePose",
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
    make: {
      sprite(x, y, key, frameName) {
        return {
          x,
          y,
          frameName,
          height: 63,
          visible: true,
          addChild() {},
          destroy() {
            this.destroyed = true;
          }
        };
      }
    },
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
  level.game = game;
  level.back = level.front = { add() {} };
  level.number = map ? map.number : number;
  level.rooms = [];
  level.dummyWall = Object.assign(Object.create(PrinceJS.Tile.Base.prototype), { element: 20 });
  level.unMaskTile = () => {};
  const setTile = (room, x, y, element, posY = 0) => {
    const tile = Object.assign(
      element === PrinceJS.Level.TILE_LOOSE_BOARD
        ? new PrinceJS.Tile.Loose(game, 0, PrinceJS.Level.TYPE_DUNGEON)
        : Object.create(element === 4 ? PrinceJS.Tile.Gate.prototype : PrinceJS.Tile.Base.prototype),
      { room, roomX: x, roomY: y, element, posY, shakes: 0, pushes: 0, raises: 0 }
    );
    const shake = tile.shake;
    tile.shake = (fall) => {
      tile.shakes++;
      if (shake) {
        shake.call(tile, fall);
      }
    };
    tile.push = () => tile.pushes++;
    tile.raise = () => tile.raises++;
    if (element === PrinceJS.Level.TILE_LOOSE_BOARD) {
      tile.onStartFalling.add(level.floorStartFall, level);
      tile.onStopFalling.add(level.floorStopFall, level);
      level.addTile(x, y, room, tile);
    } else {
      level.rooms[room].tiles[y * 10 + x] = tile;
    }
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
  if (map) {
    level.rooms = [];
    const roomId = (x, y) =>
      x >= 0 && x < map.size.width && y >= 0 && y < map.size.height ? map.room[y * map.size.width + x].id : -1;
    map.room.forEach((room, index) => {
      if (room.id < 1) {
        return;
      }
      const x = index % map.size.width;
      const y = Math.floor(index / map.size.width);
      level.rooms[room.id] = {
        x,
        y,
        links: { left: roomId(x - 1, y), right: roomId(x + 1, y), up: roomId(x, y - 1), down: roomId(x, y + 1) },
        tiles: []
      };
      room.tile.forEach((tile, location) => setTile(room.id, location % 10, Math.floor(location / 10), tile.element));
    });
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
    hasJetpack: number >= 13,
    jetpackEquipped: false,
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
  if (map) {
    const prince = map.prince;
    const row = Math.floor(prince.location / 10);
    const room = level.rooms[prince.room];
    Object.assign(kid, {
      room: prince.room,
      baseX: room.x * 320,
      baseY: room.y * 189 + 3,
      charX:
        PrinceJS.Utils.convertBlockXtoX(prince.location % 10) + (prince.turn !== false ? 7 : 0) + (prince.offset || 0),
      charY: PrinceJS.Utils.convertBlockYtoY(row),
      charFace: prince.direction * (prince.reverse || 1),
      charBlockX: prince.location % 10,
      charBlockY: row
    });
  }
  kid.updateCharFrame();
  const messages = [];
  const ui = { showText: (text) => messages.push(text) };
  const jetpack = new PrinceJS.Jetpack({ game, kid, level, ui }, map ? map.prince.direction : 1);
  const advance = (ticks, dt = 0.05) => {
    for (let i = 0; i < ticks; i++) {
      jetpack.update(dt);
    }
  };
  return { PrinceJS, kid, level, jetpack, pressed, graphics, sprites, setTile, advance, roomsChanged, messages };
}

function nativeMap(number) {
  const mapPath = number < 90 ? `level${number}.json` : `custom/level${number}.json`;
  return JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/maps", mapPath), "utf8"));
}

test("levels before 12 cannot equip a jetpack and contain no pickup", () => {
  for (const number of [1, 2, 3, 11]) {
    const f = fixture(number, nativeMap(number));
    assert.equal(f.kid.hasJetpack, false);
    assert.equal(f.jetpack.pickup, null);
    assert.equal(f.jetpack.toggle(), false);
    assert.equal(f.kid.specialAction, null);
    assert.equal(f.kid.jetpackEquipped, false);
    f.advance(20);
    assert.ok(f.graphics.every((graphic) => !graphic.visible));
  }
});

test("level 12 places matching pickup art on reachable clear floor beside the real entrance", () => {
  const f = fixture(12, nativeMap(12));
  const pickup = f.jetpack.pickup;
  const room = f.level.rooms[3];
  assert.equal(f.kid.hasJetpack, false);
  assert.equal(f.jetpack.toggle(), false);
  assert.equal(pickup.room, 3);
  assert.equal(pickup.worldX - room.x * 320, 208);
  assert.equal(pickup.worldY - room.y * 189, 182);
  assert.equal(f.level.getTileAt(6, 2, 3).element, f.PrinceJS.Level.TILE_FLOOR);
  assert.equal(pickup.collected, false);
  assert.equal(f.jetpack.effects.pickupGraphic.visible, true);
  assert.ok(f.jetpack.effects.pickupGraphic.shapes.some((shape) => shape.color === 0x97adb0));
  assert.ok(f.jetpack.effects.pickupGraphic.shapes.some((shape) => shape.color === 0x92d9df));
  f.advance(30);
  assert.equal(f.kid.hasJetpack, false, "the starting pose does not silently collect it");
  f.kid.charX = ((pickup.worldX - f.kid.baseX) * 140) / 320;
  f.kid.charBlockX = 6;
  f.advance(1);
  assert.equal(f.kid.hasJetpack, true);
  assert.equal(pickup.collected, true);
  assert.equal(f.jetpack.effects.pickupGraphic.visible, false);
  assert.equal(f.kid.jetpackEquipped, false, "collecting it does not automatically start flying");
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.messages.filter((text) => text.includes("COLLECTED")).length, 1);
  f.advance(10);
  assert.equal(f.messages.filter((text) => text.includes("COLLECTED")).length, 1);
  assert.equal(f.jetpack.toggle(), true);
  f.pressed.up = true;
  f.advance(12);
  assert.equal(f.jetpack.phase, "flying");
  assert.ok(f.kid.charY < 179);
});

test("jumping, falling, hanging or locked actors must land before collecting the level 12 pack", () => {
  const f = fixture(12, nativeMap(12));
  f.kid.charX = ((f.jetpack.pickup.worldX - f.kid.baseX) * 140) / 320;
  for (const action of ["hang", "runningjump", "freefall", "climbup"]) {
    f.kid.action = action;
    assert.equal(f.jetpack.checkPickup(), false);
    assert.equal(f.kid.hasJetpack, false);
  }
  f.kid.action = "stand";
  for (const flag of ["inFallDown", "inJumpUp"]) {
    f.kid[flag] = true;
    assert.equal(f.jetpack.checkPickup(), false);
    f.kid[flag] = false;
  }
  for (const flag of ["alive", "active", "visible"]) {
    f.kid[flag] = false;
    assert.equal(f.jetpack.checkPickup(), false);
    f.kid[flag] = true;
  }
  f.kid.specialAction = { owner: {}, type: "weapon" };
  assert.equal(f.jetpack.checkPickup(), false);
  f.kid.specialAction = null;
  assert.equal(f.jetpack.checkPickup(), true);
});

test("the manual level 12 pickup avoids hazards, uncollected weapons and floors beyond a gap", () => {
  const f = fixture(12, nativeMap(12));
  f.setTile(3, 6, 2, f.PrinceJS.Level.TILE_SPIKES);
  let pickup = f.jetpack.findPickup(1);
  assert.equal(pickup.worldX - f.kid.baseX, 80, "the unsafe right approach chooses clear floor on the left");
  f.setTile(3, 6, 2, f.PrinceJS.Level.TILE_SPACE);
  pickup = f.jetpack.findPickup(1);
  assert.equal(pickup.worldX - f.kid.baseX, 80, "a pack is never stranded beyond the hole");
  f.jetpack.delegate.weapons = [
    { pickup: { room: 3, worldX: f.kid.baseX + 80, worldY: f.jetpack.pickup.worldY, collected: false } }
  ];
  f.setTile(3, 1, 2, f.PrinceJS.Level.TILE_SPIKES);
  assert.equal(f.jetpack.findPickup(1), null, "no reachable unoccupied pickup position is preferable to a hazard");
});

test("direct level 13 and later starts keep owned packs unequipped, including custom map numbers", () => {
  for (const number of [13, 14, 99]) {
    const f = fixture(number, nativeMap(number));
    assert.equal(f.kid.hasJetpack, true);
    assert.equal(f.kid.jetpackEquipped, false);
    assert.equal(f.jetpack.pickup, null);
    assert.equal(f.jetpack.effects.pickupGraphic.visible, false);
    assert.equal(f.jetpack.toggle(), true);
    assert.equal(f.kid.jetpackEquipped, true);
    assert.equal(f.jetpack.phase, "equipping");
    f.jetpack.destroy();
    assert.ok(f.graphics.every((graphic) => graphic.destroyed));
    const restarted = fixture(number, nativeMap(number));
    assert.equal(restarted.kid.hasJetpack, true);
    assert.equal(restarted.kid.jetpackEquipped, false);
    assert.equal(restarted.jetpack.pickup, null);
    assert.equal(restarted.jetpack.toggle(), true);
  }
  const twelve = fixture(12, nativeMap(12));
  assert.equal(twelve.kid.hasJetpack, false);
  assert.equal(twelve.jetpack.pickup.collected, false);
});

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

test("upward jetpack head impacts open loose floors immediately and preserve native falling debris", () => {
  for (const face of [-1, 1]) {
    const f = fixture();
    f.kid.charFace = face;
    const loose = f.setTile(1, 3, 0, f.PrinceJS.Level.TILE_LOOSE_BOARD);
    const neighbor = f.setTile(1, 4, 0, f.PrinceJS.Level.TILE_FLOOR);
    const floor = new f.PrinceJS.Tile.Base(f.level.game, f.PrinceJS.Level.TILE_FLOOR, 0, 0);
    f.level.addTile(3, 1, 1, floor);
    const removedSurfaces = [];
    f.level.delegate = { bloodEffects: { removeSurface: (tile) => removedSurfaces.push(tile) } };
    if (face === -1) {
      loose.shake(true);
      loose.update();
    }
    f.jetpack.toggle();
    f.pressed.up = true;
    f.advance(6);
    assert.equal(f.level.getTileAt(3, 0, 1), loose, "no break before the head reaches the ceiling");
    f.advance(14);
    assert.equal(f.level.getTileAt(3, 0, 1).element, f.PrinceJS.Level.TILE_SPACE);
    assert.equal(f.level.getTileAt(4, 0, 1), neighbor);
    assert.deepEqual(removedSurfaces, [loose], "only the broken slab loses its blood marks");
    assert.ok(f.jetpack.position.y < 53, "the whole body flies through the opened floor");
    assert.equal(f.jetpack.velocityY, -96, "the impact does not stop the ascent");
    assert.equal(f.kid.health, 10);
    assert.equal(f.kid.jetpackEquipped, true);
    assert.equal(f.kid.specialAction.owner, f.jetpack);
    assert.equal(loose.state, f.PrinceJS.Tile.Loose.STATE_FALLING);
    assert.equal(loose.back.frameName, "dungeon_falling");
    assert.equal(loose.front.visible, false, "the original foreground floor disappears");
    for (let i = 0; i < 10; i++) {
      loose.update();
    }
    assert.equal(floor.debris, true);
    assert.equal(loose.back.destroyed, true);
    assert.equal(loose.front.destroyed, true);
    assert.equal(f.level.getTileAt(3, 0, 1).isWalkable(), false, "the passage remains open after debris lands");
  }
});

test("head impacts break both touched loose slabs at a seam but leave an adjacent solid ceiling intact", () => {
  const f = fixture();
  f.kid.charX = (128 * 140) / 320;
  f.setTile(1, 3, 0, f.PrinceJS.Level.TILE_LOOSE_BOARD);
  f.setTile(1, 4, 0, f.PrinceJS.Level.TILE_LOOSE_BOARD);
  const untouched = f.setTile(1, 5, 0, f.PrinceJS.Level.TILE_LOOSE_BOARD);
  f.jetpack.toggle();
  f.pressed.up = true;
  f.advance(20);
  assert.equal(f.level.getTileAt(3, 0, 1).element, f.PrinceJS.Level.TILE_SPACE);
  assert.equal(f.level.getTileAt(4, 0, 1).element, f.PrinceJS.Level.TILE_SPACE);
  assert.equal(f.level.getTileAt(5, 0, 1), untouched);
  assert.equal(untouched.state, f.PrinceJS.Tile.Loose.STATE_INACTIVE);
  assert.ok(f.jetpack.position.y < 53);

  const mixed = fixture();
  mixed.kid.charX = (128 * 140) / 320;
  mixed.setTile(1, 3, 0, mixed.PrinceJS.Level.TILE_LOOSE_BOARD);
  const solid = mixed.setTile(1, 4, 0, mixed.PrinceJS.Level.TILE_FLOOR);
  mixed.jetpack.toggle();
  mixed.pressed.up = true;
  mixed.advance(40);
  assert.equal(mixed.level.getTileAt(3, 0, 1).element, mixed.PrinceJS.Level.TILE_SPACE);
  assert.equal(mixed.level.getTileAt(4, 0, 1), solid);
  assert.ok(Math.abs(mixed.jetpack.position.y - 99) < 0.01, "the remaining solid half still blocks the head");
});

test("head impacts resolve loose floors in linked rooms above and beside the Prince", () => {
  const above = fixture();
  above.setTile(3, 3, 2, above.PrinceJS.Level.TILE_LOOSE_BOARD);
  above.jetpack.toggle();
  above.pressed.up = true;
  above.advance(40);
  assert.equal(above.level.getTileAt(3, 2, 3).element, above.PrinceJS.Level.TILE_SPACE);
  assert.equal(above.kid.room, 3);
  assert.deepEqual(above.roomsChanged, [3]);

  const beside = fixture();
  beside.kid.charX = (322 * 140) / 320;
  beside.setTile(2, 0, 0, beside.PrinceJS.Level.TILE_LOOSE_BOARD);
  beside.setTile(2, 0, 1, beside.PrinceJS.Level.TILE_FLOOR);
  beside.jetpack.toggle();
  beside.pressed.up = true;
  beside.advance(20);
  assert.equal(beside.level.getTileAt(0, 0, 2).element, beside.PrinceJS.Level.TILE_SPACE);
  assert.equal(beside.kid.room, 1);
  assert.ok(beside.jetpack.position.y < 53);
});

test("a swept ascent breaks successive loose floors even with long frame deltas", () => {
  const f = fixture();
  f.kid.charY = 179;
  for (const row of [0, 1]) {
    f.setTile(1, 3, row, f.PrinceJS.Level.TILE_LOOSE_BOARD);
  }
  f.jetpack.toggle();
  f.pressed.up = true;
  f.advance(45, 1);
  for (const row of [0, 1]) {
    assert.equal(f.level.getTileAt(3, row, 1).element, f.PrinceJS.Level.TILE_SPACE);
  }
  assert.equal(f.kid.room, 3);
  assert.equal(f.kid.jetpackEquipped, true);
});

test("collision queries, hovering and side contact never smash loose floors", () => {
  const f = fixture();
  const loose = f.setTile(1, 3, 0, f.PrinceJS.Level.TILE_LOOSE_BOARD);
  assert.equal(f.jetpack.blockedAt({ room: 1, x: 112, y: 98 }), true);
  assert.equal(f.level.getTileAt(3, 0, 1), loose, "collision probes must not change the level");
  f.kid.charY = 99;
  f.jetpack.toggle();
  f.advance(20);
  assert.equal(f.level.getTileAt(3, 0, 1), loose);
  assert.equal(loose.state, f.PrinceJS.Tile.Loose.STATE_INACTIVE);
  f.jetpack.toggle();
  f.kid.charX = (80 * 140) / 320;
  f.kid.charY = 83;
  f.jetpack.toggle();
  f.pressed.right = true;
  f.advance(30);
  assert.equal(f.level.getTileAt(3, 0, 1), loose);
  assert.equal(loose.state, f.PrinceJS.Tile.Loose.STATE_INACTIVE);
  assert.ok(Math.abs(f.jetpack.position.x - 88) < 0.01, "side contact stops at the slab edge");
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
    assert.equal(f.level.getTileAt(3, 1, 1), tile, "landing does not immediately smash the floor");
    if (element === f.PrinceJS.Level.TILE_LOOSE_BOARD) {
      assert.equal(tile.state, f.PrinceJS.Tile.Loose.STATE_SHAKING);
      assert.equal(tile.fall, true);
    }
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
  const skin = effects.grip.shapes.filter((shape) => shape.color === 0xdd8866);
  assert.ok(
    skin.some((shape) => shape.x === -5 && shape.width === 2 && shape.height === 2),
    "left hand grips its strap"
  );
  assert.ok(
    skin.some((shape) => shape.x === 2 && shape.width === 2 && shape.height === 2),
    "right hand grips its strap"
  );
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
