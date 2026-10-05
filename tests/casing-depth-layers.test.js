"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture() {
  const graphics = [];
  class Graphics {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.scale = { x: 1, y: 1 };
      this.children = [];
      this.rects = [];
      this.cached = false;
      this.hadCache = false;
      this.cacheBuilds = 0;
      graphics.push(this);
    }
    clear() {
      this.rects.length = 0;
    }
    beginFill(color) {
      this.color = color;
    }
    drawRect(x, y, width, height) {
      this.rects.push({ x, y, width, height, color: this.color });
    }
    drawCircle() {}
    drawPolygon() {}
    endFill() {}
    addChild(child) {
      this.children.push(child);
    }
    addChildAt(child, index) {
      this.children.splice(index, 0, child);
    }
    destroy() {
      this.destroyed = true;
      this.children.forEach((child) => child.destroy());
    }
    set cacheAsBitmap(value) {
      // Match Phaser 2's unsupported attempt to disable a never-created cache.
      assert.ok(value || this.hadCache);
      this.cached = value;
      if (value) {
        this.hadCache = true;
        this.cacheBuilds++;
      }
    }
    get cacheAsBitmap() {
      return this.cached;
    }
  }
  const PrinceJS = { Utils: { convertX: (x) => Math.floor((x * 320) / 140) } };
  const context = vm.createContext({ PrinceJS });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/MinigunEffects.js"), "utf8"), context);
  const rooms = {};
  for (let room = 1; room <= 2; room++) {
    rooms[room] = {
      x: room - 1,
      y: 0,
      tiles: Array.from({ length: 30 }, (_, i) => ({
        element: i < 10 ? 0 : 1,
        isWalkable() {
          return this.element === 1;
        }
      }))
    };
  }
  const kid = {
    room: 1,
    level: { rooms },
    action: "stand",
    charX: 56,
    charY: 116,
    baseX: 0,
    baseY: 3,
    charFace: 1,
    minigunEquipped: false
  };
  const game = { add: { graphics: (x, y) => new Graphics(x, y) } };
  const effects = new PrinceJS.MinigunEffects(game, kid, { room: 1, worldX: 120, worldY: 119, collected: true });
  const emit = (depthLayer, x = 120, y = 92, vx = 0, vy = 0) => {
    const casing = effects.emitCasing(x, y, vx, vy, 0xffdb70, 119, depthLayer);
    casing.width = 3;
    casing.height = 2;
    return casing;
  };
  const advance = (seconds) => {
    for (let frame = 0; frame < seconds * 60; frame++) {
      effects.update(1 / 60, false);
    }
  };
  const settle = (depthLayer, x = 120, room = 1) => {
    const casing = emit(depthLayer, x);
    const support = effects.findCasingSupport(casing, 90, 119);
    assert.ok(support);
    assert.equal(Number(support.room), room);
    effects.settleCasing(casing, support);
    effects.activeCasings.pop();
    return casing;
  };
  return { effects, kid, rooms, graphics, emit, advance, settle };
}

test("bursts use all ten floor depths and land on ten visible, diagonally staggered lanes", () => {
  const f = fixture();
  const casings = Array.from({ length: 10 }, () => f.emit());
  assert.equal(new Set(casings.map((casing) => casing.depthLayer)).size, 10);
  f.advance(3);
  assert.equal(f.effects.activeCasings.length, 0);
  assert.equal(f.effects.casingRooms[1].settled.length, 10);
  assert.equal(new Set(casings.map((casing) => casing.y)).size, 1, "different depths never stack on each other");
  const positions = casings.map((casing) => {
    const offset = f.effects.casingDepthOffset(casing);
    const bottom = casing.y + casing.height + offset.y;
    assert.ok(bottom >= 114 && bottom <= 123, "brass stays above the foreground lip at Y126");
    assert.equal(offset.x, -2 * offset.y);
    return bottom;
  });
  assert.equal(new Set(positions).size, 10);
  const back = casings.find((casing) => casing.depthLayer === 0);
  const front = casings.find((casing) => casing.depthLayer === 9);
  assert.ok(back.shade < front.shade, "rear brass is shaded, and front brass catches the light");
});

test("each depth supports its own growing pile without lifting neighboring depth lanes", () => {
  const f = fixture();
  const first = Array.from({ length: 10 }, (_, layer) => f.settle(layer));
  const second = f.emit(4);
  f.advance(3);
  assert.ok(second.settled);
  assert.equal(second.y, first[4].y - second.height);
  for (let layer = 0; layer < 10; layer++) {
    assert.equal(f.effects.casingPileHeight(119, 120, 3, layer), layer === 4 ? 4 : 2);
  }
  assert.equal(f.effects.casingSurfaceAt(120, 3, 119, 4), 115);
  assert.equal(f.effects.casingSurfaceAt(120, 3, 119, 5), 117);
});

test("settled brass keeps its depth and pile shape across room changes without repeated physics or cache rebuilds", () => {
  const f = fixture();
  for (let layer = 0; layer < 10; layer++) {
    f.settle(layer, 120);
    f.settle(layer, 440, 2);
  }
  f.advance(1 / 60);
  const snapshot = JSON.stringify(f.effects.casings.map(({ x, y, depthLayer }) => ({ x, y, depthLayer })));
  const cacheBuilds = f.graphics.reduce((sum, graphic) => sum + graphic.cacheBuilds, 0);
  let moved = 0;
  f.effects.moveCasing = () => moved++;
  f.kid.room = 2;
  f.kid.baseX = 320;
  f.advance(5);
  f.kid.room = 1;
  f.kid.baseX = 0;
  f.advance(5);
  assert.equal(JSON.stringify(f.effects.casings.map(({ x, y, depthLayer }) => ({ x, y, depthLayer }))), snapshot);
  assert.equal(f.effects.casingRooms[1].settled.length, 10);
  assert.equal(f.effects.casingRooms[2].settled.length, 10);
  assert.equal(moved, 0);
  assert.equal(
    f.graphics.reduce((sum, graphic) => sum + graphic.cacheBuilds, 0),
    cacheBuilds
  );
});

test("removing a supporting floor releases every depth and the brass piles again on the floor below", () => {
  const f = fixture();
  const casings = Array.from({ length: 10 }, (_, layer) => f.settle(layer));
  f.advance(1 / 60);
  f.rooms[1].tiles[13].element = 0;
  f.effects.checkCasingFloors(1);
  assert.equal(f.effects.activeCasings.length, 10);
  assert.equal(f.effects.casingRooms[1].settled.length, 0);
  for (let layer = 0; layer < 10; layer++) {
    assert.equal(f.effects.casingPileHeight(119, 120, 3, layer), 0);
  }
  f.advance(4);
  assert.equal(f.effects.casings.length, 10);
  assert.equal(f.effects.activeCasings.length, 0);
  assert.equal(f.effects.casingRooms[1].settled.length, 10);
  casings.forEach((casing, layer) => {
    assert.equal(casing.depthLayer, layer);
    assert.equal(casing.floorY, 182);
    assert.equal(casing.floorRow, 2);
  });
});

test("thousands of permanent casings use bounded batches and no per-frame simulation after settling", () => {
  const f = fixture();
  for (let i = 0; i < 4000; i++) {
    f.settle(i % 10, 70 + (Math.floor(i / 10) % 50) * 3);
  }
  f.advance(1 / 60);
  assert.equal(f.effects.casings.length, 4000);
  assert.equal(f.effects.casingRooms[1].settled.length, 4000);
  assert.equal(f.effects.casingRooms[1].batches.length, 40);
  assert.ok(f.effects.casingRooms[1].batches.every((batch) => batch.casings.length <= 128));
  let supportsChecked = 0;
  f.effects.findCasingSupport = () => supportsChecked++;
  f.advance(2);
  assert.equal(supportsChecked, 0);
  assert.equal(f.effects.casings.length, 4000);
  f.effects.destroy();
  assert.equal(f.effects.casings.length, 0);
  assert.ok(f.effects.casingLayer.destroyed);
});
