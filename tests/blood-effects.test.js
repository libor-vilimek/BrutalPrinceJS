"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const { test } = require("node:test");

function fixture() {
  const PrinceJS = { ROOM_WIDTH: 320, ROOM_HEIGHT: 189, BLOCK_WIDTH: 32, BLOCK_HEIGHT: 63 };
  const math = Object.create(Math);
  math.random = () => 0.5;
  const context = vm.createContext({
    PrinceJS,
    Math: math,
    Phaser: {
      Rectangle: function (x, y, width, height) {
        Object.assign(this, { x, y, width, height });
      }
    }
  });
  for (const file of ["Level", "tiles/Base", "tiles/Gate", "GorePhysics", "BloodEffects"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file + ".js"), "utf8"), context);
  }
  const bitmaps = [];
  const sprites = [];
  const graphics = [];
  const game = {
    add: {
      bitmapData(width, height) {
        const draws = [];
        const clears = [];
        const pixels = new Map();
        const bitmap = {
          width,
          height,
          draws,
          clears,
          pixels,
          ctx: {
            fillStyle: "",
            fillRect(x, y, width, height) {
              draws.push({ x, y, width, height, color: this.fillStyle });
              for (let row = Math.max(0, y); row < Math.min(bitmap.height, y + height); row++) {
                for (let column = Math.max(0, x); column < Math.min(bitmap.width, x + width); column++) {
                  pixels.set(row * bitmap.width + column, this.fillStyle);
                }
              }
            },
            clearRect(x, y, width, height) {
              clears.push({ x, y, width, height });
              for (let row = Math.max(0, y); row < Math.min(bitmap.height, y + height); row++) {
                for (let column = Math.max(0, x); column < Math.min(bitmap.width, x + width); column++) {
                  pixels.delete(row * bitmap.width + column);
                }
              }
            }
          },
          destroyed: 0,
          destroy() {
            this.destroyed++;
          }
        };
        bitmaps.push(bitmap);
        return bitmap;
      },
      sprite(x, y, bitmap) {
        const sprite = {
          x,
          y,
          bitmap,
          destroyed: 0,
          destroy() {
            this.destroyed++;
          }
        };
        sprites.push(sprite);
        return sprite;
      },
      graphics() {
        const layer = {
          clears: 0,
          clear() {
            this.clears++;
          },
          beginFill() {},
          endFill() {},
          drawRect() {},
          destroyed: 0,
          destroy() {
            this.destroyed++;
          }
        };
        graphics.push(layer);
        return layer;
      }
    },
    world: {
      sorts: 0,
      sort() {
        this.sorts++;
      }
    }
  };
  const level = Object.create(PrinceJS.Level.prototype);
  level.rooms = [];
  level.dummyWall = Object.assign(Object.create(PrinceJS.Tile.Base.prototype), { element: 20 });
  level.rooms[1] = { x: 0, y: 0, links: { left: -1, right: 2, up: -1, down: 3 }, tiles: [] };
  level.rooms[2] = { x: 1, y: 0, links: { left: 1, right: -1, up: -1, down: -1 }, tiles: [] };
  level.rooms[3] = { x: 0, y: 1, links: { left: -1, right: -1, up: 1, down: -1 }, tiles: [] };
  const setTile = (id, column, row, element, posY = 0) => {
    const tile = Object.assign(
      Object.create(element === 4 ? PrinceJS.Tile.Gate.prototype : PrinceJS.Tile.Base.prototype),
      { room: id, roomX: column, roomY: row, element, posY, type: 0, key: "dungeon" }
    );
    level.rooms[id].tiles[row * 10 + column] = tile;
    return tile;
  };
  for (let id = 1; id <= 3; id++) {
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 10; column++) {
        setTile(id, column, row, row === 1 ? 1 : 0);
      }
    }
  }
  const delegate = { game, level };
  const blood = new PrinceJS.BloodEffects(delegate);
  const physics = new PrinceJS.GorePhysics(level);
  const advance = (seconds) => {
    for (let i = 0; i < Math.ceil(seconds / 0.01); i++) {
      blood.update(0.01);
    }
  };
  return { PrinceJS, level, game, blood, physics, setTile, advance, bitmaps, sprites, graphics, delegate };
}

let dungeonImage;
function nativeTerrain(f) {
  if (!dungeonImage) {
    const png = fs.readFileSync(path.join(__dirname, "../assets/gfx/dungeon.png"));
    const chunks = [];
    let width;
    let height;
    for (let offset = 8; offset < png.length; ) {
      const size = png.readUInt32BE(offset);
      const kind = png.toString("ascii", offset + 4, offset + 8);
      if (kind === "IHDR") {
        width = png.readUInt32BE(offset + 8);
        height = png.readUInt32BE(offset + 12);
        assert.equal(png[offset + 16], 8);
        assert.equal(png[offset + 17], 6, "native atlas is eight-bit RGBA");
      }
      if (kind === "IDAT") {
        chunks.push(png.subarray(offset + 8, offset + 8 + size));
      }
      offset += size + 12;
    }
    const raw = zlib.inflateSync(Buffer.concat(chunks));
    const pixels = new Uint8Array(width * height * 4);
    const stride = width * 4;
    let cursor = 0;
    for (let y = 0; y < height; y++) {
      const filter = raw[cursor++];
      for (let x = 0; x < stride; x++) {
        const index = y * stride + x;
        const left = x >= 4 ? pixels[index - 4] : 0;
        const up = y > 0 ? pixels[index - stride] : 0;
        const diagonal = x >= 4 && y > 0 ? pixels[index - stride - 4] : 0;
        const guess = left + up - diagonal;
        const distanceLeft = Math.abs(guess - left);
        const distanceUp = Math.abs(guess - up);
        const distanceDiagonal = Math.abs(guess - diagonal);
        const paeth =
          distanceLeft <= distanceUp && distanceLeft <= distanceDiagonal
            ? left
            : distanceUp <= distanceDiagonal
              ? up
              : diagonal;
        const predictor = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
        pixels[index] = (raw[cursor++] + predictor) & 255;
      }
    }
    dungeonImage = { width, height, pixels };
  }
  const source = dungeonImage;
  const frames = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/gfx/dungeon.json"), "utf8")).frames;
  const scratch = [];
  const sprite = (key, x = 0, y = 0) => {
    const frame = frames[key].frame;
    return {
      x,
      y,
      scale: { x: 1, y: 1 },
      anchor: { x: 0, y: 0 },
      children: [],
      texture: {
        baseTexture: { source },
        crop: { x: frame.x, y: frame.y, width: frame.w, height: frame.h }
      }
    };
  };
  f.game.make = {
    sprite(x, y, key, frame) {
      return sprite(frame, x, y);
    },
    bitmapData(width, height) {
      const bitmap = {
        width,
        height,
        resize(width, height) {
          this.width = width;
          this.height = height;
        },
        ctx: {
          clearRect() {},
          drawImage(image, x, y, width, height) {
            this.data = new Uint8Array(width * height * 4);
            for (let row = 0; row < height; row++) {
              for (let column = 0; column < width; column++) {
                const start = ((y + row) * image.width + x + column) * 4;
                this.data.set(image.pixels.subarray(start, start + 4), (row * width + column) * 4);
              }
            }
          },
          getImageData() {
            return { data: this.data };
          }
        },
        destroyed: 0,
        destroy() {
          this.destroyed++;
        }
      };
      scratch.push(bitmap);
      return bitmap;
    }
  };
  for (const room of f.level.rooms) {
    if (!room) {
      continue;
    }
    for (const tile of room.tiles) {
      if (tile.element === 0) {
        continue;
      }
      tile.back = sprite(tile.element === 20 ? "dungeon_wall_0" : "dungeon_" + tile.element);
      tile.front = sprite(tile.element === 20 ? "SWS_1" : "dungeon_" + tile.element + "_fg");
      if (tile.element === 4) {
        tile.back.children.push(sprite("dungeon_gate"));
        tile.front.children.push(sprite("dungeon_gate_fg", 32, 16));
      }
    }
  }
  const opaque = (x, y, frontOnly) => {
    const contains = (entry, left, top) => {
      const crop = entry.texture.crop;
      const column = x - left;
      const row = y - top;
      if (
        column >= 0 &&
        row >= 0 &&
        column < crop.width &&
        row < crop.height &&
        source.pixels[((crop.y + row) * source.width + crop.x + column) * 4 + 3] > 32
      ) {
        return true;
      }
      return entry.children.some((child) => contains(child, left + child.x, top + child.y));
    };
    return f.level.rooms.some(
      (room) =>
        room &&
        room.tiles.some((tile) => {
          if (!tile.back) {
            return false;
          }
          const left = room.x * 320 + tile.roomX * 32;
          const top = room.y * 189 + tile.roomY * 63 - 13;
          return contains(tile.front, left, top) || (!frontOnly && contains(tile.back, left, top));
        })
    );
  };
  return { source, scratch, opaque };
}

function assertNativePaint(layer, native) {
  for (const bitmap of [layer.bitmap, ...[...layer.floorDepths.values()].map((floor) => floor.bitmap)]) {
    for (const draw of bitmap.draws) {
      for (let x = draw.x; x < draw.x + draw.width; x++) {
        for (let y = draw.y; y < draw.y + draw.height; y++) {
          assert.ok(
            native.opaque(x + layer.x, y + layer.y),
            `paint needs real artwork at ${x + layer.x}, ${y + layer.y}`
          );
        }
      }
    }
  }
}

test("native floor blood occupies ten shaded depth lanes and spills onto actual foreground stone", () => {
  const f = fixture();
  const native = nativeTerrain(f);
  f.blood.burst(112, 110, 1, { count: 20, vx: 0, vy: 120 });
  assert.equal(new Set(f.blood.particles.map((particle) => particle.depthLayer)).size, 10);
  f.advance(0.2);
  const layer = f.blood.decalRooms.get(1);
  assert.equal(layer.floorDepths.size, 10);
  assert.ok(f.blood.depthCounts.every((count) => count === 2));
  assert.ok(layer.depthCounts.every((count) => count === 2));
  assert.ok(layer.foregroundStainCount > 0);
  assert.ok(f.blood.foregroundStainCount > 0);
  assert.ok(f.blood.drawnPixelCount > 100);
  assertNativePaint(layer, native);
  assert.ok(layer.bitmap.draws.some((draw) => native.opaque(draw.x + layer.x, draw.y + layer.y, true)));
  const lanes = [...layer.floorDepths.values()].sort((a, b) => a.depthLayer - b.depthLayer);
  assert.equal(new Set(lanes.map((lane) => Math.min(...lane.bitmap.draws.map((draw) => draw.y)))).size, 10);
  assert.ok(lanes[0].sprite.z < lanes[9].sprite.z);
  assert.ok(
    Number.parseInt(lanes[0].bitmap.draws[0].color.slice(1), 16) <
      Number.parseInt(lanes[9].bitmap.draws[0].color.slice(1), 16)
  );
  assert.equal(native.scratch.length, 1, "native alpha frames share one temporary readback canvas");
});

test("all floor depths and foreground caches retain their identities and pixels after room travel", () => {
  const f = fixture();
  nativeTerrain(f);
  f.blood.burst(112, 110, 1, { count: 30, vx: 0, vy: 120 });
  f.advance(0.2);
  const layer = f.blood.decalRooms.get(1);
  const floorBitmaps = [...layer.floorDepths.values()].map((depth) => depth.bitmap);
  const before = JSON.stringify(f.bitmaps.map(({ draws }) => draws));
  const revision = layer.revision;
  const pixels = f.blood.drawnPixelCount;
  f.delegate.currentRoom = 2;
  f.advance(5);
  f.delegate.currentRoom = 1;
  f.advance(5);
  assert.equal(f.blood.decalRooms.get(1), layer);
  assert.deepEqual(
    [...layer.floorDepths.values()].map((depth) => depth.bitmap),
    floorBitmaps
  );
  assert.equal(JSON.stringify(f.bitmaps.map(({ draws }) => draws)), before);
  assert.equal(layer.revision, revision);
  assert.equal(f.blood.drawnPixelCount, pixels);
  assert.equal(f.blood.stainCount, 30);
});

test("a falling loose board loses all ten floor lanes and its lip ink while intact stone stays unchanged", () => {
  const f = fixture();
  for (let column = 0; column < 10; column++) {
    f.setTile(1, column, 1, 0);
  }
  const loose = f.setTile(1, 3, 1, 11);
  loose.yTo = 0;
  f.setTile(1, 7, 1, 1);
  f.setTile(1, 8, 1, 3);
  f.setTile(1, 8, 0, 20);
  f.setTile(1, 8, 2, 20);
  nativeTerrain(f);
  f.blood.burst(112, 110, 1, { count: 20, vx: 0, vy: 120 });
  f.blood.burst(240, 110, 1, { count: 20, vx: 0, vy: 120 });
  f.blood.hit({ room: 1, charBlockY: 1, charName: "guard-2" }, { x: 250, y: 90, direction: 1, weapon: "minigun" });
  f.advance(3);
  const layer = f.blood.decalRooms.get(1);
  const caches = [layer, ...layer.floorDepths.values()];
  const leftInk = (cache, pixel) => (pixel % cache.bitmap.width) + layer.x < 180;
  const retained = caches.map((cache) => [...cache.bitmap.pixels].filter(([pixel]) => !leftInk(cache, pixel)));
  const textures = caches.map((cache) => cache.bitmap);
  assert.equal(layer.floorDepths.size, 10);
  assert.ok(caches.every((cache) => [...cache.bitmap.pixels.keys()].some((pixel) => leftInk(cache, pixel))));
  assert.ok(
    retained.every((pixels) => pixels.length > 0),
    "the other floor and pillar/wall marks are visible"
  );
  f.level.game = f.game;
  f.level.delegate = f.delegate;
  f.delegate.bloodEffects = f.blood;
  f.level.back = f.level.front = { add() {} };
  f.level.floorStartFall(loose);
  assert.equal(f.level.getTileAt(3, 1, 1).element, 0, "the original board becomes an actual shaft");
  assert.equal(loose.room, 3, "the falling tile's destination changes after the replacement hook");
  assert.equal(f.blood.surfacePixels.has(loose), false);
  for (let i = 0; i < caches.length; i++) {
    assert.equal(caches[i].bitmap, textures[i], "textures are reused instead of rebuilt");
    assert.equal(
      [...caches[i].bitmap.pixels.keys()].some((pixel) => leftInk(caches[i], pixel)),
      false
    );
    assert.deepEqual([...caches[i].bitmap.pixels], retained[i], "unaffected pixels keep their exact colors");
    assert.ok(caches[i].bitmap.clears.every((clear) => clear.height === 1 && clear.width < 32));
  }
  const after = caches.map((cache) => JSON.stringify([...cache.bitmap.pixels]));
  const clears = caches.map((cache) => cache.bitmap.clears.length);
  f.blood.removeSurface(loose);
  f.delegate.currentRoom = 2;
  f.advance(5);
  f.delegate.currentRoom = 1;
  f.advance(5);
  assert.deepEqual(
    caches.map((cache) => JSON.stringify([...cache.bitmap.pixels])),
    after
  );
  assert.deepEqual(
    caches.map((cache) => cache.bitmap.clears.length),
    clears,
    "settled caches do no further erasing"
  );
});

test("replacing a floor removes its overhang ink from a linked room's cache without clearing the room", () => {
  const f = fixture();
  const loose = f.setTile(1, 9, 1, 11);
  nativeTerrain(f);
  const layer = f.blood.roomDecals(2);
  const terrain = f.blood.terrain({ room: 2, x: 324, y: 120 });
  const ownTerrain = (tile) => ({
    sprites: terrain.sprites.filter((entry) => entry.tile === tile),
    fallback: []
  });
  const intact = f.level.getTileAt(0, 1, 2);
  f.blood.paint(layer, ownTerrain(loose), 314, 115, 32, 12, "#7a1420");
  const oldPixels = new Set(layer.bitmap.pixels.keys());
  assert.ok(oldPixels.size > 0, "native floor artwork overhangs the actual room seam");
  f.blood.paint(layer, ownTerrain(intact), 326, 115, 24, 12, "#b52c35");
  const retained = [...layer.bitmap.pixels].filter(([, color]) => color === "#b52c35");
  assert.ok(
    retained.some(([pixel]) => oldPixels.has(pixel)),
    "the intact floor has newer ink at overlapping pixels"
  );
  f.level.delegate = f.delegate;
  f.delegate.bloodEffects = f.blood;
  f.level.back = f.level.front = { add() {} };
  const space = { element: 0, back: {}, front: {} };
  f.level.addTile(9, 1, 1, space);
  assert.equal(f.blood.decalRooms.get(2), layer);
  assert.deepEqual([...layer.bitmap.pixels], retained);
  assert.ok(layer.bitmap.clears.length > 0);
  f.blood.destroy();
  assert.equal(f.blood.surfacePixels.size, 0);
  assert.equal(layer.pixelOwners.size, 0);
});

test("native wall and gate splashes stay above their opaque fronts and leave black pixels unpainted", () => {
  for (const element of [20, 4]) {
    const f = fixture();
    f.setTile(1, element === 20 ? 4 : 2, 1, element);
    const native = nativeTerrain(f);
    f.blood.burst(element === 20 ? 118 : 94, 90, 1, { count: 3, vx: 200, vy: 0 });
    f.advance(0.2);
    const layer = f.blood.decalRooms.get(1);
    assert.ok(layer.foregroundStainCount > 0);
    assert.ok(layer.bitmap.draws.length > 0);
    assertNativePaint(layer, native);
    assert.ok(layer.sprite.z > 30);
  }
});

test("enemy hits splatter native pillars and masonry above and below the walking floor", () => {
  const f = fixture();
  const pillar = f.setTile(1, 4, 1, 3);
  for (const row of [0, 2]) {
    for (let column = 3; column <= 5; column++) {
      f.setTile(1, column, row, 20);
    }
  }
  const native = nativeTerrain(f);
  f.blood.hit({ room: 1, charBlockY: 1, charName: "guard-2" }, { x: 118, y: 90, direction: 1, weapon: "minigun" });
  assert.equal(f.blood.particles.length, 11, "the original airborne spray remains intact");
  assert.equal(f.blood.masonryCounts.pillar, 1);
  assert.equal(f.blood.masonryCounts.above, 1);
  assert.equal(f.blood.masonryCounts.below, 1);
  const layer = f.blood.decalRooms.get(1);
  const painted = layer.bitmap.draws.map((draw) => ({ ...draw, x: draw.x + layer.x, y: draw.y + layer.y }));
  assert.ok(
    painted.some((draw) => draw.x >= 136 && draw.x < 155 && draw.y > 70 && draw.y < 110),
    "pillar shaft catches the spray"
  );
  assert.ok(
    painted.some((draw) => draw.y < 63),
    "upper wall catches upward flecks"
  );
  assert.ok(
    painted.some((draw) => draw.y > 130),
    "lower wall catches splashes below the floor lip"
  );
  assert.ok(
    painted.some((draw) => draw.color === "#d5423c"),
    "splashes have small fresh highlights"
  );
  assert.equal(layer.floorDepths.size, 0, "masonry ink uses the foreground cache");
  assertNativePaint(layer, native);
  const piece = { room: 1, x: 146, y: 90, vx: 200, vy: 0, radius: 1 };
  const movement = f.physics.step(piece, 0.15, { gravity: 0 });
  assert.equal(piece.x, 176);
  assert.ok(
    movement.contacts.every((contact) => contact.tile !== pillar),
    "decorative pillars remain walk-through"
  );
  assert.ok(layer.sprite.z > 30, "blood appears over the pillar's visible foreground face");
});

test("small and tall pillars receive clipped splashes in either firing direction", () => {
  for (const element of [3, 8, 9]) {
    for (const direction of [-1, 1]) {
      const f = fixture();
      f.setTile(1, 4, 1, element);
      const native = nativeTerrain(f);
      f.blood.hit(
        { room: 1, charBlockY: 1, charName: "guard-2" },
        { x: direction === 1 ? 118 : 188, y: 90, direction, weapon: "rocketLauncher" }
      );
      assert.equal(f.blood.masonryCounts.pillar, 1, `pillar ${element}, direction ${direction}`);
      assertNativePaint(f.blood.decalRooms.get(1), native);
    }
  }
});

test("a decorative tile with an empty native frame receives no floating masonry stain", () => {
  const f = fixture();
  f.setTile(1, 4, 1, 25);
  nativeTerrain(f);
  f.blood.hit({ room: 1, charBlockY: 1, charName: "guard-2" }, { x: 118, y: 90, direction: 1, weapon: "minigun" });
  assert.equal(f.blood.masonryCounts.pillar, 0);
  assert.equal(f.bitmaps.length, 0);
});

test("masonry spray follows real room links and never paints an unlinked neighboring room", () => {
  for (const linked of [true, false]) {
    const f = fixture();
    f.setTile(3, 3, 0, 20);
    if (!linked) {
      f.level.rooms[1].links.down = -1;
    }
    const native = nativeTerrain(f);
    f.blood.hit({ room: 1, charBlockY: 2, charName: "guard-2" }, { x: 112, y: 164, direction: 1, weapon: "minigun" });
    assert.equal(f.blood.decalRooms.has(3), linked);
    assert.equal(f.blood.masonryCounts.below, linked ? 1 : 0);
    if (linked) {
      assertNativePaint(f.blood.decalRooms.get(3), native);
    } else {
      assert.equal(f.bitmaps.length, 0, "empty map margins receive no artificial stone or ink");
    }
  }
});

test("pillar and wall splashes keep identical pixels after settling and revisiting rooms", () => {
  const f = fixture();
  f.setTile(1, 4, 1, 3);
  f.setTile(1, 4, 0, 20);
  f.setTile(1, 4, 2, 20);
  nativeTerrain(f);
  f.blood.hit({ room: 1, charBlockY: 1, charName: "guard-2" }, { x: 118, y: 90, direction: 1, weapon: "minigun" });
  f.advance(3);
  const layer = f.blood.decalRooms.get(1);
  const bitmap = layer.bitmap;
  const pixels = JSON.stringify(f.bitmaps.map(({ draws }) => draws));
  const revision = layer.revision;
  f.delegate.currentRoom = 2;
  f.advance(5);
  f.delegate.currentRoom = 1;
  f.advance(5);
  assert.equal(f.blood.decalRooms.get(1), layer);
  assert.equal(layer.bitmap, bitmap);
  assert.equal(layer.revision, revision);
  assert.equal(JSON.stringify(f.bitmaps.map(({ draws }) => draws)), pixels);
  f.blood.destroy();
  assert.ok(f.bitmaps.every((entry) => entry.destroyed === 1));
});

test("stone ink stays above native fronts and floor ink below actors when Phaser renumbers world z", () => {
  const f = fixture();
  f.setTile(1, 4, 1, 3);
  f.setTile(1, 4, 0, 20);
  f.setTile(1, 4, 2, 20);
  nativeTerrain(f);
  const group = () => ({
    children: [],
    reindex() {
      this.children.forEach((child, index) => (child.z = index));
    },
    add(child) {
      if (child.parent) {
        child.parent.children.splice(child.parent.children.indexOf(child), 1);
        child.parent.reindex();
      }
      child.parent = this;
      this.children.push(child);
      this.reindex();
    },
    setChildIndex(child, index) {
      this.children.splice(this.children.indexOf(child), 1);
      this.children.splice(index, 0, child);
      this.reindex();
    }
  });
  f.level.back = group();
  f.level.front = group();
  const world = group();
  world.sort = function () {
    this.children.sort((a, b) => a.z - b.z);
    this.reindex();
  };
  world.add(f.level.back);
  f.level.back.z = 10;
  for (let i = 0; i < 60; i++) {
    const actor = {};
    world.add(actor);
    actor.z = 20;
  }
  world.add(f.level.front);
  f.level.front.z = 30;
  world.sort();
  assert.ok(f.level.front.z > 30.5, "crowded rooms overwrite the initial foreground z value");
  for (const room of f.level.rooms.filter(Boolean)) {
    for (const tile of room.tiles.filter((tile) => tile.back)) {
      f.level.back.add(tile.back);
      f.level.front.add(tile.front);
    }
  }
  f.game.world = world;
  const createSprite = f.game.add.sprite;
  f.game.add.sprite = (x, y, bitmap) => {
    const sprite = createSprite(x, y, bitmap);
    world.add(sprite);
    return sprite;
  };
  f.blood.hit({ room: 1, charBlockY: 1, charName: "guard-2" }, { x: 118, y: 90, direction: 1, weapon: "minigun" });
  f.advance(3);
  const layer = f.blood.decalRooms.get(1);
  assert.equal(layer.sprite.parent, f.level.front);
  assert.equal(f.level.front.children.at(-1), layer.sprite);
  assert.ok(layer.floorDepths.size > 0);
  assert.ok([...layer.floorDepths.values()].every((depth) => depth.sprite.parent === f.level.back));
  const depths = f.level.back.children
    .filter((child) => child.bloodDepth !== undefined)
    .map((child) => child.bloodDepth);
  assert.deepEqual(
    depths,
    [...depths].sort((a, b) => a - b)
  );
  const corpse = {};
  world.add(corpse);
  corpse.z = 21;
  world.sort();
  assert.equal(f.level.front.children.at(-1), layer.sprite, "later effects cannot hide stone stains");
  assert.ok(
    f.sprites.every((sprite) => !world.children.includes(sprite)),
    "ink stays anchored to its terrain group"
  );
  assert.ok(f.level.back.z < corpse.z && f.level.front.z > corpse.z);
});

test("level cleanup releases all ten depth textures, foreground ink and native alpha readback canvas", () => {
  const f = fixture();
  const native = nativeTerrain(f);
  f.blood.burst(112, 110, 1, { count: 20, vx: 0, vy: 120 });
  f.advance(0.2);
  assert.equal(f.bitmaps.length, 11);
  const layer = f.blood.decalRooms.get(1);
  f.blood.destroy();
  f.blood.destroy();
  assert.ok(f.bitmaps.every((bitmap) => bitmap.destroyed === 1));
  assert.ok(f.sprites.every((sprite) => sprite.destroyed === 1));
  assert.equal(native.scratch[0].destroyed, 1);
  assert.equal(layer.floorDepths.size, 0);
  assert.equal(f.blood.decalRooms.size, 0);
  assert.ok(f.blood.depthCounts.every((count) => count === 0));
  assert.equal(f.blood.foregroundStainCount, 0);
  assert.equal(f.blood.drawnPixelCount, 0);
});

test("blood drops hit the actual floor and leave a cached stain that persists across room travel", () => {
  const f = fixture();
  f.blood.burst(112, 110, 1, { count: 2, vx: 0, vy: 120 });
  f.advance(0.2);
  assert.equal(f.blood.particles.length, 0);
  assert.equal(f.blood.stainCount, 2);
  assert.equal(f.blood.decalRooms.size, 1);
  assert.equal(f.sprites[0].x, -32);
  assert.equal(f.sprites[0].y, -32);
  assert.ok(f.sprites[0].z > 30, "stains stay above opaque tile foregrounds");
  assert.ok(f.bitmaps[0].draws.every((draw) => draw.y - 32 >= 126 && draw.y - 32 + draw.height <= 129));
  const layer = f.blood.decalRooms.get(1);
  assert.equal(layer.floorDepths.size, 2);
  assert.ok([...layer.floorDepths.values()].every((floor) => floor.sprite.z < 20));
  const originalDraws = f.bitmaps.map((bitmap) => bitmap.draws.length);
  const originalSorts = f.game.world.sorts;
  f.delegate.currentRoom = 2;
  f.advance(30);
  f.delegate.currentRoom = 1;
  assert.equal(f.blood.stainCount, 2);
  assert.deepEqual(
    f.bitmaps.map((bitmap) => bitmap.draws.length),
    originalDraws,
    "settled blood is never redrawn or erased"
  );
  assert.equal(f.game.world.sorts, originalSorts, "only creating a cached layer changes painter order");
});

test("an unmapped edge stops drops without painting stains in the empty map margin", () => {
  const f = fixture();
  f.blood.burst(6, 85, 1, { count: 2, vx: -200, vy: 0 });
  f.advance(0.1);
  assert.equal(f.blood.particles.length, 0);
  assert.equal(f.blood.stainCount, 0);
  assert.equal(f.blood.decalRooms.size, 0);
  assert.equal(f.bitmaps.length, 0);
});

test("wall sprays remain clipped to stone rather than drawing a floating stain in open air", () => {
  const f = fixture();
  f.setTile(1, 4, 1, 20);
  f.blood.burst(118, 85, 1, { count: 1, vx: 200, vy: 0 });
  f.advance(0.2);
  assert.equal(f.blood.stainCount, 1);
  assert.ok(f.bitmaps[0].draws.length > 0);
  assert.ok(f.bitmaps[0].draws.every((draw) => draw.x - 32 >= 128 && draw.x - 32 + draw.width <= 160));
  assert.ok(f.bitmaps[0].draws.some((draw) => draw.color === "#d33635"));
});

test("rocket splash blood starts on the struck enemy rather than at the explosion center", () => {
  const f = fixture();
  const enemy = {
    room: 2,
    baseX: 320,
    baseY: 3,
    charName: "guard-3",
    getCharBounds: () => ({ x: 10, y: 47, width: 20, height: 43 })
  };
  f.blood.hit(enemy, { x: 290, y: 100, room: 1, direction: 1, weapon: "rocketLauncher" });
  assert.equal(f.blood.particles.length, 24);
  assert.ok(f.blood.particles.every((particle) => particle.room === 2 && particle.x === 331 && particle.y === 91));
  assert.ok(f.blood.particles.every((particle) => particle.vx > 0));
});

test("minigun blood preserves the projectile contact and supernatural enemies do not bleed", () => {
  const f = fixture();
  const impact = { x: 90, y: 85, room: 1, direction: -1, weapon: "minigun" };
  f.blood.hit({ room: 1, charName: "skeleton" }, impact);
  f.blood.hit({ room: 1, charName: "shadow" }, impact);
  assert.equal(f.blood.particles.length, 0);
  f.blood.hit({ room: 1, charName: "guard-2" }, impact);
  assert.equal(f.blood.particles.length, 11);
  assert.ok(f.blood.particles.every((particle) => particle.x === 90 && particle.y === 85 && particle.vx < 0));
});

test("stains at a linked-room wall seam belong to the solid neighboring room", () => {
  const f = fixture();
  f.setTile(2, 0, 1, 20);
  f.blood.burst(310, 85, 1, { count: 1, vx: 200, vy: 0 });
  f.advance(0.15);
  assert.equal(f.blood.stainCount, 1);
  assert.equal(f.blood.decalRooms.has(2), true);
  assert.equal(f.blood.decalRooms.has(1), false);
  assert.equal(f.sprites[0].x, 288);
  assert.ok(f.bitmaps[0].draws.every((draw) => draw.x + 288 >= 320));
});

test("blood emitted exactly at a wall impact settles there rather than starting inside the stone", () => {
  const f = fixture();
  f.setTile(1, 4, 1, 20);
  f.blood.burst(128, 85, 1, { count: 1, vx: 200, vy: 0 });
  f.advance(0.01);
  assert.equal(f.blood.stainCount, 1);
  assert.equal(f.blood.particles.length, 0);
  assert.ok(f.bitmaps[0].draws.every((draw) => draw.x - 32 >= 128 && draw.x - 32 + draw.width <= 160));
});

test("destroying blood effects releases all droplets and cached textures exactly once", () => {
  const f = fixture();
  f.blood.burst(112, 110, 1, { count: 1, vx: 0, vy: 120 });
  f.advance(0.2);
  f.blood.burst(350, 90, 2, { count: 4 });
  f.blood.destroy();
  f.blood.destroy();
  f.blood.update(0.05);
  f.blood.burst(112, 90, 1);
  assert.equal(f.blood.particles.length, 0);
  assert.equal(f.blood.decalRooms.size, 0);
  assert.equal(f.blood.stainCount, 0);
  assert.ok(f.bitmaps.every((bitmap) => bitmap.destroyed === 1));
  assert.ok(f.sprites.every((sprite) => sprite.destroyed === 1));
  assert.equal(f.graphics[0].destroyed, 1);
  const replacement = new f.PrinceJS.BloodEffects(f.delegate);
  assert.equal(replacement.stainCount, 0, "a restarted level starts with clean walls and floors");
});

test("shared gore physics sweeps fast pieces against narrow gates and their current raised height", () => {
  const f = fixture();
  const gate = f.setTile(1, 2, 1, 4);
  const piece = { room: 1, x: 70, y: 90, vx: 500, vy: 0, radius: 2 };
  const blocked = f.physics.step(piece, 0.2, { gravity: 0 });
  assert.equal(piece.x, 102);
  assert.equal(piece.vx, 0);
  assert.equal(blocked.contacts[0].tile, gate);
  assert.equal(blocked.contacts[0].normalX, -1);
  gate.posY = -60;
  piece.x = 70;
  piece.vx = 500;
  const clear = f.physics.step(piece, 0.2, { gravity: 0 });
  assert.ok(Math.abs(piece.x - 170) < 0.001);
  assert.equal(clear.contacts.length, 0);
});

test("fast fragments stop at walls without tunneling and floor contacts are unique per step", () => {
  const f = fixture();
  const wall = f.setTile(1, 4, 1, 20);
  const piece = { room: 1, x: 70, y: 85, vx: 500, vy: 0, radius: 2 };
  const result = f.physics.step(piece, 0.5, { gravity: 0 });
  assert.equal(piece.x, 126);
  assert.equal(result.contacts[0].tile, wall);
  const sliding = { room: 1, x: 80, y: 117, vx: 100, vy: 0, radius: 2 };
  const grounded = f.physics.step(sliding, 0.2, { friction: 200 });
  assert.ok(Math.abs(sliding.vx - 60) < 0.001);
  assert.equal(sliding.y, 117);
  assert.equal(grounded.grounded, true);
  assert.equal(grounded.supported, true);
  assert.ok(grounded.contacts.length <= 2, "resting pieces do not emit an impact for every tiny sweep");
});

test("upward fragments collide with the underside of an actual floor slab", () => {
  const f = fixture();
  const ceiling = f.setTile(1, 3, 0, 1);
  const piece = { room: 1, x: 112, y: 80, vx: 0, vy: -300, radius: 2 };
  const result = f.physics.step(piece, 0.2, { gravity: 0 });
  assert.equal(piece.y, 65);
  assert.equal(piece.vy, 0);
  assert.equal(result.contacts[0].tile, ceiling);
  assert.equal(result.contacts[0].normalY, 1);
});

test("body pieces cross horizontal room links in both directions without resetting world position", () => {
  const f = fixture();
  const piece = { room: 1, x: 315, y: 85, vx: 100, vy: 0, radius: 2 };
  let result = f.physics.step(piece, 0.3, { gravity: 0 });
  assert.equal(piece.room, 2);
  assert.ok(Math.abs(piece.x - 345) < 0.001);
  assert.equal(result.contacts.length, 0);
  piece.vx = -100;
  result = f.physics.step(piece, 0.3, { gravity: 0 });
  assert.equal(piece.room, 1);
  assert.ok(Math.abs(piece.x - 315) < 0.001);
  assert.equal(result.contacts.length, 0);
});

test("fragments fall through linked shafts, while an unlinked edge stays sealed", () => {
  const f = fixture();
  const piece = { room: 1, x: 112, y: 181, vx: 0, vy: 100, radius: 2 };
  const open = f.physics.step(piece, 0.3, { gravity: 0 });
  assert.equal(piece.room, 3);
  assert.ok(Math.abs(piece.y - 211) < 0.001);
  assert.equal(open.contacts.length, 0);
  f.level.rooms[1].links.down = -1;
  Object.assign(piece, { room: 1, y: 181, vy: 100 });
  const blocked = f.physics.step(piece, 0.3, { gravity: 0 });
  assert.equal(piece.room, 1);
  assert.equal(piece.y, 187);
  assert.equal(blocked.grounded, true);
});

test("resting pieces lose support when the slab beneath them is destroyed", () => {
  const f = fixture();
  const piece = { room: 1, x: 112, y: 117, vx: 0, vy: 0, radius: 2 };
  assert.ok(f.physics.supportAt(piece));
  f.setTile(1, 3, 1, 0);
  assert.equal(f.physics.supportAt(piece), undefined);
  const result = f.physics.step(piece, 0.2);
  assert.ok(piece.y > 123);
  assert.equal(result.grounded, false);
});
