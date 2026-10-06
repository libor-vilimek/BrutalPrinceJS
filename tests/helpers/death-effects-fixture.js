"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture(options = {}) {
  const visuals = [];
  class Graphics {
    constructor(x, y) {
      Object.assign(this, { x, y, alpha: 1, rotation: 0, scale: { x: 1, y: 1 }, children: [], shapes: [] });
      visuals.push(this);
    }
    beginFill(color) {
      this.color = color;
    }
    drawRect(x, y, width, height) {
      this.shapes.push({ x, y, width, height, color: this.color });
    }
    endFill() {}
    addChild(child) {
      this.children.push(child);
      child.parent = this;
    }
    destroy() {
      this.destroyed = true;
      this.children.forEach((child) => child.destroy());
    }
  }
  class Sprite {
    constructor(x, y, atlas, frameName) {
      Object.assign(this, { x, y, atlas, frameName, alpha: 1, scale: { x: 1, y: 1 }, anchor: { setTo() {} } });
      visuals.push(this);
    }
    crop(rect) {
      this.cropRect = rect;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const atlasFrames = {};
  for (const key of [
    "guard-1",
    "guard-2",
    "guard-3",
    "guard-4",
    "guard-5",
    "guard-6",
    "guard-7",
    "fatguard",
    "jaffar"
  ]) {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "assets", "gfx", key + ".json"), "utf8"));
    atlasFrames[key] = Object.fromEntries(
      Object.entries(data.frames).map(([name, value]) => [name, { width: value.frame.w, height: value.frame.h }])
    );
  }
  const game = {
    add: { graphics: (x, y) => new Graphics(x, y) },
    make: { graphics: (x, y) => new Graphics(x, y), sprite: (x, y, atlas, frame) => new Sprite(x, y, atlas, frame) },
    cache: { getFrameData: (key) => ({ getFrameByName: (frame) => atlasFrames[key] && atlasFrames[key][frame] }) }
  };
  const PrinceJS = { ROOM_WIDTH: 320, ROOM_HEIGHT: 189, BLOCK_WIDTH: 32, BLOCK_HEIGHT: 63 };
  const context = vm.createContext({
    PrinceJS,
    Phaser: {
      Rectangle: function (x, y, width, height) {
        Object.assign(this, { x, y, width, height });
      }
    }
  });
  for (const name of ["Level", "GorePhysics", "EnemyDeathEffects"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "..", "src", name + ".js"), "utf8"), context);
  }
  if (options.rocket) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "..", "src", "RocketDeathEffects.js"), "utf8"), context);
  }
  const level = { rooms: {}, dummyWall: null };
  const tile = (element, column, row, room) => ({
    element,
    room,
    roomX: column,
    roomY: row,
    isWalkable() {
      return this.element !== 0;
    },
    isBarrier() {
      return this.element === 20 || this.element === 4;
    },
    getBounds() {
      return { x: column * 32 + 30, y: row * 63, width: 2, height: 53 };
    }
  });
  level.dummyWall = tile(20, -1, -1, -1);
  const floorRow = options.floorRow === undefined ? 1 : options.floorRow;
  const roomCount = options.rightRoom === false ? 1 : 2;
  for (let id = 1; id <= roomCount; id++) {
    level.rooms[id] = {
      x: id - 1,
      y: 0,
      links: { left: id > 1 ? id - 1 : -1, right: id < roomCount ? id + 1 : -1, up: -1, down: -1 },
      tiles: Array.from({ length: 30 }, (_, index) =>
        tile(Math.floor(index / 10) === floorRow ? 1 : 0, index % 10, Math.floor(index / 10), id)
      )
    };
  }
  if (options.wallColumn !== undefined) {
    level.rooms[1].tiles[floorRow * 10 + options.wallColumn].element = 20;
  }
  if (options.gateColumn !== undefined) {
    level.rooms[1].tiles[floorRow * 10 + options.gateColumn].element = 4;
  }
  level.getTileAt = (column, row, room) => {
    if (!level.rooms[room]) {
      return level.dummyWall;
    }
    if (column < 0) {
      return level.getTileAt(column + 10, row, level.rooms[room].links.left);
    }
    if (column >= 10) {
      return level.getTileAt(column - 10, row, level.rooms[room].links.right);
    }
    return level.rooms[room].tiles[row * 10 + column] || level.dummyWall;
  };
  const bloodBursts = [];
  const delegate = { game, level, bloodEffects: { burst: (...args) => bloodBursts.push(args) } };
  const effects = new PrinceJS.EnemyDeathEffects(delegate);
  effects.variantOffset = 0;
  effects.random = options.random || (() => 0.5);
  const enemy = (data = {}) => {
    const room = data.room || 1;
    const worldX = data.x === undefined ? (room - 1) * 320 + 140 : data.x;
    const feetY = data.y === undefined ? (floorRow + 1) * 63 - 7 : data.y;
    const actor = {
      charName: "guard-1",
      baseCharName: "guard",
      baseX: (room - 1) * 320,
      baseY: 3,
      charX: ((worldX - (room - 1) * 320) * 140) / 320,
      charY: feetY - 3,
      charFdy: 0,
      charFace: -1,
      room,
      alive: false,
      health: 0,
      alpha: 1,
      active: true,
      visible: true,
      action: "dropdead",
      sword: { alpha: 1, visible: true },
      splash: { visible: true },
      damageCalls: 0,
      deadSignals: 0,
      getCharBounds() {
        return { x: worldX - this.baseX - 7, y: feetY - this.baseY - 40, width: 14, height: 40 };
      },
      damageLife() {
        this.damageCalls++;
      },
      proceedOnDead() {
        this.deadSignals++;
      },
      ...data
    };
    return actor;
  };
  const advance = (seconds, delta = 1 / 60) => {
    for (let elapsed = 0; elapsed < seconds; elapsed += delta) {
      effects.update(Math.min(delta, seconds - elapsed));
    }
  };
  return { PrinceJS, effects, enemy, advance, level, delegate, bloodBursts, visuals };
}

module.exports = { fixture };
