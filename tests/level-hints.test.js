"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture(number = 1) {
  const context = vm.createContext({});
  for (const file of ["Boot", "Utils", "Level", "LevelHints"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  const PrinceJS = vm.runInContext("PrinceJS", context);
  const map = structuredClone(require("../assets/maps/level1.json"));
  const rooms = [];
  map.room.forEach((room, index) => {
    if (room.id < 1) {
      return;
    }
    room.x = index % map.size.width;
    room.y = Math.floor(index / map.size.width);
    room.tiles = room.tile.map((tile, location) => ({
      ...tile,
      room: room.id,
      roomX: location % 10,
      roomY: Math.floor(location / 10)
    }));
    rooms[room.id] = room;
  });
  const door = rooms[9].tiles.find((tile) => tile.element === PrinceJS.Level.TILE_EXIT_RIGHT);
  door.open = false;
  const state = {
    game: {},
    level: { number, rooms, events: map.events, exitDoors: [door], exitDoorOpen: false },
    kid: { room: 1, alive: true, active: true, visible: true, hasMinigun: false, activeWeapon: "twinTorches" },
    minigun: { pickup: { room: 2, worldX: 2160, worldY: 308, collected: false } }
  };
  PrinceJS.LevelHints.prototype.createHint = function (room, x, y, direction, text) {
    const hint = {
      room,
      layer: { x, y, visible: false, destroy: () => (hint.destroyed = true) },
      arrow: {},
      label: { text },
      direction
    };
    this.hints.push(hint);
    return hint;
  };
  return { state, PrinceJS, hints: new PrinceJS.LevelHints(state), door };
}

test("the route sign waits for the actual minigun pickup and stays at a fixed world location", () => {
  const { state, hints } = fixture();
  const route = hints.route;
  assert.equal(route.layer.visible, false);
  state.kid.room = 2;
  hints.update(0);
  assert.equal(route.layer.visible, false, "landing alone does not show the hint");
  state.kid.hasMinigun = state.minigun.pickup.collected = true;
  hints.update(0);
  assert.equal(route.layer.visible, true);
  assert.equal(route.direction, "right");
  assert.equal(route.label.text, "recommended path");
  assert.deepEqual([route.layer.x, route.layer.y], [2160, 246]);
  state.kid.charX = 130;
  state.game.camera = { x: 300, y: 40 };
  for (let i = 0; i < 10; i++) {
    hints.update(0.05);
  }
  assert.equal(route.arrow.alpha, 0.3, "the arrow flashes on the simulation clock");
  assert.deepEqual([route.layer.x, route.layer.y], [2160, 246], "movement and camera pans cannot move the sign");
  assert.equal(state.kid.activeWeapon, "twinTorches");
  state.kid.room = 3;
  hints.update(0);
  assert.equal(route.layer.visible, false);
  state.kid.room = 2;
  state.kid.alive = false;
  hints.update(0);
  assert.equal(route.layer.visible, false);
});

test("the exit hint targets the native plate connected to the exit and disappears once it opens", () => {
  const { state, hints, door } = fixture();
  const hint = hints.hints.find((item) => item.door);
  assert.equal(hints.hints.length, 2, "unrelated gate plates never receive exit hints");
  assert.equal(hint.layer.visible, false);
  state.kid.room = 9;
  hints.update(0);
  assert.equal(hint.layer.visible, true, "entering the exit room is sufficient");
  assert.equal(hint.direction, "down");
  assert.equal(hint.label.text, "press this");
  assert.deepEqual([hint.button.room, hint.button.roomX, hint.button.roomY], [9, 0, 0]);
  assert.deepEqual([hint.layer.x, hint.layer.y], [2576, 223]);
  state.level.exitDoorOpen = true;
  hints.update(0);
  assert.equal(hint.layer.visible, false);
  state.level.exitDoorOpen = false;
  door.destroyedByRocket = true;
  hints.update(0);
  assert.equal(hint.layer.visible, false);
  const signs = [...hints.hints];
  hints.destroy();
  assert(signs.every((sign) => sign.destroyed));
  assert.equal(hints.hints.length, 0);
});

test("guidance is limited to level 1 and preview fragments retain the real plate and room layout", () => {
  assert.equal(fixture(2).hints.hints.length, 0);
  const map = require("../assets/maps/level1.json");
  const preview = require("../dev/preview/guidance-rooms.json");
  assert.deepEqual(
    preview.route,
    map.room.find((room) => room.id === 2)
  );
  assert.deepEqual(
    preview.exit,
    map.room.find((room) => room.id === 9)
  );
  assert.deepEqual(preview.events, map.events);
});
