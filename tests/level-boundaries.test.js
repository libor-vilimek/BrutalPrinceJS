"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture(type = 0, options = {}) {
  const PrinceJS = { ROOM_WIDTH: 320, ROOM_HEIGHT: 189, BLOCK_WIDTH: 32, BLOCK_HEIGHT: 63 };
  const context = vm.createContext({
    PrinceJS,
    Phaser: {
      Rectangle: function (x, y, width, height) {
        Object.assign(this, { x, y, width, height });
      }
    }
  });
  for (const file of ["Level", "tiles/Base", "LevelBuilder"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file + ".js"), "utf8"), context);
  }
  const group = () => ({
    children: [],
    add(sprite) {
      this.children.push(sprite);
    }
  });
  const sprite = (x, y, key, frameName) => ({
    x,
    y,
    key,
    frameName,
    height: 79,
    children: [],
    addChild(child) {
      this.children.push(child);
    },
    crop(rectangle) {
      this.cropRect = rectangle;
    },
    destroy() {
      this.destroyed = true;
    }
  });
  const game = {
    world: { setBounds() {} },
    add: { group },
    make: {
      sprite,
      bitmapData: () => ({
        rectangles: [],
        rect(x, y, width, height, color) {
          this.rectangles.push({ x, y, width, height, color });
        },
        add(sprite) {
          sprite.bitmapData = this;
        }
      })
    }
  };
  // The missing upper-right cell also exercises an interior corner of the map.
  const room = (options.ids || [1, 2, -1, 3, 4, 5]).map((id) => ({
    id,
    tile:
      id > 0
        ? Array.from({ length: 30 }, (_, index) => ({
            element: options.tileElement ? options.tileElement(id, index) : options.element || 1,
            modifier: 0
          }))
        : []
  }));
  const builder = new PrinceJS.LevelBuilder(game, {});
  const level = builder.buildFromJSON({
    size: { width: 3, height: 2 },
    type,
    number: 1,
    name: "Boundary test",
    prince: { room: 1, location: 11 },
    room,
    events: []
  });
  return { PrinceJS, builder, level };
}

test("unmapped cells and zoom margins receive no generated masonry", () => {
  for (const type of [0, 1]) {
    const { builder, level } = fixture(type);
    assert.equal(level.boundaryWalls, undefined);
    assert.equal(builder.buildBoundaryWalls, undefined);
    // Five mapped rooms contribute 30 tiles each. Preserve only the original
    // left perspective rims (two rooms, three tiles) and ceiling rims (three
    // rooms, ten tiles); there are no added full faces in missing rooms.
    assert.equal(level.back.children.length, 150 + 6 + 30);
    assert.equal(level.front.children.length, 150 + 6 + 30);
    for (const layer of [level.back, level.front]) {
      assert.equal(
        layer.children.some((sprite) => sprite.boundaryColumn !== undefined),
        false
      );
      assert.equal(
        layer.children.some((sprite) => sprite.cropRect),
        false
      );
    }
    assert.equal(
      level.front.children.some((sprite) => /^(?:[SW]W[SW]|W)_\d+$/.test(sprite.frameName)),
      false,
      "A floor-only layout creates no masonry faces outside its room data"
    );
  }
});

test("empty map space does not create rooms, alter real tiles, or connect absent rooms", () => {
  const { PrinceJS, level } = fixture();
  assert.equal(Object.keys(level.rooms).length, 5);
  for (const room of level.rooms.filter(Boolean)) {
    assert.equal(room.tiles.length, 30);
    assert.equal(
      room.tiles.every((tile) => tile.element === PrinceJS.Level.TILE_FLOOR),
      true
    );
  }
  assert.equal(level.rooms[2].links.right, -1);
  assert.equal(level.rooms[5].links.up, -1);
  assert.equal(level.getTileAt(10, 1, 2), level.dummyWall);
});

function wallTiles(level) {
  return Array.from(level.rooms)
    .filter(Boolean)
    .flatMap((room) => Array.from(room.tiles).filter((tile) => tile.element === 20));
}

test("mapped walls reuse the dungeon and palace masonry palettes and native artwork", () => {
  for (const type of [0, 1]) {
    const { level } = fixture(type, { element: 20 });
    for (const tile of wallTiles(level)) {
      assert.equal(tile.front.key, type === 0 ? "dungeon" : "palace");
      if (type === 0) {
        assert.match(tile.front.frameName, /^[SW]W[SW]_\d+$/);
      } else {
        assert.match(tile.front.children[0].frameName, /^W_\d+$/);
      }
    }
  }
});

test("mapped wall courses retain their native origin and perspective artwork without cropping", () => {
  for (const type of [0, 1]) {
    const { level } = fixture(type, { element: 20 });
    for (const tile of wallTiles(level)) {
      const room = level.rooms[tile.room];
      assert.equal(tile.x, room.x * 320 + tile.roomX * 32);
      assert.equal(tile.y + 16, (room.y * 3 + tile.roomY) * 63 + 3);
      assert.equal(tile.front.cropRect, undefined);
      assert.equal(level.front.children.includes(tile.front), true);
      if (type === 1) {
        const overlay = tile.front.children[0];
        assert.equal(overlay.y, 16);
        assert.equal(overlay.y + 63, tile.front.height, "Palace mortar stays inside the native face");
      }
    }
  }
});

test("masonry artwork and palace brick colors depend on world cells rather than room IDs or iteration order", () => {
  for (const type of [0, 1]) {
    const first = fixture(type, { element: 20 });
    const relabeled = fixture(type, { element: 20, ids: [23, 19, -1, 8, 4, 2] });
    function faces(level) {
      return wallTiles(level)
        .map((tile) => ({
          cell: tile.x / 32 + "," + (tile.y + 13) / 63,
          frame: type === 0 ? tile.front.frameName : tile.front.children[0].frameName,
          colors: tile.front.bitmapData ? tile.front.bitmapData.rectangles.map((rectangle) => rectangle.color) : []
        }))
        .sort((left, right) => left.cell.localeCompare(right.cell));
    }
    assert.deepEqual(faces(first.level), faces(relabeled.level));
    const left = first.level.rooms[1].tiles[19];
    const right = first.level.rooms[2].tiles[10];
    assert.equal(right.wallSeed, (left.wallSeed % 53) + 1, "Art sequence continues across a room edge");
  }
});

test("palace bricks crossing mapped room and tile edges keep the same color on both halves", () => {
  const { level } = fixture(1, { element: 20 });
  const leftRoom = level.rooms[1].tiles[19].front;
  const rightRoom = level.rooms[2].tiles[10].front;
  const leftTile = level.rooms[1].tiles[14].front;
  const rightTile = level.rooms[1].tiles[15].front;
  for (const [left, right] of [
    [leftRoom, rightRoom],
    [leftTile, rightTile]
  ]) {
    const leftColors = left.bitmapData.rectangles;
    const rightColors = right.bitmapData.rectangles;
    assert.equal(leftColors[2].color, rightColors[1].color, "Half bricks share a world brick color");
    assert.equal(leftColors[4].color, rightColors[3].color, "Offset bricks share a world brick color");
    assert.equal(leftColors[3].height, 22, "The bottom course is complete without an unrelated 3px color stripe");
    assert.equal(leftColors[4].height, 22);
    assert.equal(leftColors.length, 5);
  }
});

test("mapped wall faces choose exposed edge artwork correctly and every frame exists in the atlases", () => {
  for (const type of [0, 1]) {
    const { level } = fixture(type, {
      tileElement: (id, index) => (id === 2 && index % 10 === 0 ? 1 : 20)
    });
    const key = type === 0 ? "dungeon" : "palace";
    const frames = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "assets", "gfx", key + ".json"), "utf8")
    ).frames;
    for (const tile of wallTiles(level)) {
      const frame = type === 0 ? tile.front.frameName : tile.front.children[0].frameName;
      assert.equal(Boolean(frames[frame]), true, "Missing native frame " + frame);
    }
    if (type === 0) {
      assert.match(level.rooms[1].tiles[19].front.frameName, /^WWS_/);
      assert.match(level.rooms[2].tiles[11].front.frameName, /^SWW_/);
    }
  }
});

test("breaching a neighbor preserves the global wall artwork seed while updating the exposed edge", () => {
  const { PrinceJS, level } = fixture(0, { element: 20 });
  const tile = level.rooms[1].tiles[19];
  const seed = tile.wallSeed;
  level.rooms[2].tiles[10].element = PrinceJS.Level.TILE_FLOOR;
  level.refreshWallAppearance(tile);
  assert.equal(tile.front.frameName, "WWS_" + seed);
  assert.equal(tile.back.frameName, "dungeon_wall_0");
});
