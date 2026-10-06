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
      Rectangle: function (x, y, width, height) {
        Object.assign(this, { x, y, width, height });
      }
    }
  });
  for (const file of ["Utils", "Level", "tiles/Base", "tiles/Gate", "GorePhysics", "MolotovBallistics"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file + ".js"), "utf8"), context);
  }
  const level = Object.create(PrinceJS.Level.prototype);
  level.rooms = [];
  level.dummyWall = Object.assign(Object.create(PrinceJS.Tile.Base.prototype), { element: 20 });
  const setTile = (room, x, y, element, posY = 0) => {
    const tile = Object.assign(
      Object.create(element === 4 ? PrinceJS.Tile.Gate.prototype : PrinceJS.Tile.Base.prototype),
      { room, roomX: x, roomY: y, element, posY }
    );
    level.rooms[room].tiles[y * 10 + x] = tile;
    return tile;
  };
  const addRoom = (id, x, y) => {
    level.rooms[id] = { x, y, links: { left: -1, right: -1, up: -1, down: -1 }, tiles: [] };
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 10; column++) {
        setTile(id, column, row, 0);
      }
    }
    return level.rooms[id];
  };
  const floor = (id, row) => {
    for (let column = 0; column < 10; column++) {
      setTile(id, column, row, 1);
    }
  };
  addRoom(1, 0, 0);
  const shatters = [];
  const fires = [];
  const wallContacts = [];
  const controller = {
    level,
    kid: { room: 1 },
    effects: { shatter: (x, y, burning) => shatters.push({ x, y, burning }) },
    resolveRoom: PrinceJS.GorePhysics.prototype.resolveRoom,
    ignite: (bottle, column, row, y) => fires.push({ room: bottle.room, x: bottle.x, y, column, row }),
    igniteWall: (bottle, contact) => {
      wallContacts.push(contact);
      shatters.push({ x: bottle.x, y: bottle.y, burning: true });
    }
  };
  const ballistics = PrinceJS.MolotovBallistics;
  const create = (state = {}, point = { x: 20, y: 160 }) =>
    ballistics.createBottle(controller, Object.assign({ charge: 0, direction: 1 }, state), point);
  const flight = (bottle) => {
    let alive = true;
    let highest = bottle.y;
    const rooms = new Set([bottle.room]);
    for (let i = 0; i < 360 && alive; i++) {
      alive = ballistics.advanceBottle(controller, bottle, 1 / 60);
      highest = Math.min(highest, bottle.y);
      rooms.add(bottle.room);
    }
    return { bottle, alive, highest, rooms };
  };
  return {
    PrinceJS,
    ballistics,
    controller,
    level,
    setTile,
    addRoom,
    floor,
    shatters,
    fires,
    wallContacts,
    create,
    flight
  };
}

test("charge controls launch speed and exact 30/70-degree aim in both directions", () => {
  const f = fixture();
  for (const direction of [-1, 1]) {
    for (const aimUp of [false, true]) {
      let previousSpeed = 0;
      for (const charge of [0, 0.3, 0.75, 1.5]) {
        const bottle = f.create({ charge, direction, aimUp });
        const speed = Math.hypot(bottle.vx, bottle.vy);
        const angle = (Math.atan2(-bottle.vy, Math.abs(bottle.vx)) * 180) / Math.PI;
        assert.ok(speed > previousSpeed);
        assert.ok(Math.abs(angle - (aimUp ? 70 : 30)) < 0.000001);
        assert.equal(Math.sign(bottle.vx), direction);
        previousSpeed = speed;
      }
    }
  }
  const maximum = f.create({ charge: 1.5 });
  const overcharged = f.create({ charge: 30 });
  assert.equal(maximum.vx, overcharged.vx);
  assert.equal(maximum.vy, overcharged.vy);
  assert.equal(f.create({ charge: -3 }).charge, 0);
});

test("longer holds land progressively farther along a real floor in either direction", () => {
  for (const direction of [-1, 1]) {
    const f = fixture();
    f.floor(1, 2);
    let previousDistance = 0;
    for (const charge of [0, 0.35, 0.85, 1.5]) {
      const point = { x: direction > 0 ? 20 : 300, y: 160 };
      const result = f.flight(f.create({ charge, direction }, point));
      const fire = f.fires.at(-1);
      const distance = Math.abs(fire.x - point.x);
      assert.equal(result.alive, false);
      assert.equal(fire.y, 182);
      assert.ok(distance > previousDistance + 10, "each longer hold makes a clearly longer throw");
      previousDistance = distance;
    }
    assert.ok(previousDistance > 260, "a fully charged throw covers most of an open room");
    assert.equal(f.shatters.length, 0);
  }
});

test("Up produces a much higher arc while normal throws stay low", () => {
  const f = fixture();
  f.floor(1, 2);
  const normal = f.flight(f.create({ charge: 1.5 }));
  const high = f.flight(f.create({ charge: 1.5, aimUp: true }));
  assert.ok(normal.highest > 120);
  assert.ok(high.highest < 35);
  assert.equal(f.fires.length, 2);
  assert.equal(f.shatters.length, 0);
});

test("an upward bottle shatters on the underside of the native ceiling slab", () => {
  const f = fixture();
  f.floor(1, 0);
  f.floor(1, 2);
  const result = f.flight(f.create({ charge: 1.5, aimUp: true }, { x: 100, y: 100 }));
  assert.equal(result.alive, false);
  assert.equal(f.fires.length, 0);
  assert.equal(f.shatters.length, 1);
  assert.equal(f.shatters[0].burning, false);
  assert.ok(Math.abs(f.shatters[0].y - 68) < 0.00001, "ceiling is row-zero slab bottom 63 plus bottle radius");
});

test("sweeps stop fast bottles at walls and thin closed gates but pass beneath an open gate", () => {
  for (const element of [4, 20]) {
    const f = fixture();
    f.setTile(1, 3, 1, element);
    const bottle = f.create({}, { x: 90, y: 86 });
    Object.assign(bottle, { vx: 1000, vy: 0 });
    assert.equal(f.ballistics.advanceBottle(f.controller, bottle, 0.12), false);
    assert.equal(f.shatters.length, 1);
    assert.equal(f.shatters[0].burning, true);
    assert.equal(f.wallContacts.length, 1);
    assert.equal(f.wallContacts[0].normalX, -1);
    assert.equal(f.fires.length, 0);
    assert.ok(bottle.x <= (element === 4 ? 131 : 91) + 0.00001);
  }
  const open = fixture();
  open.setTile(1, 3, 1, 4, -47);
  const bottle = open.create({}, { x: 90, y: 86 });
  Object.assign(bottle, { vx: 1000, vy: 0 });
  assert.equal(open.ballistics.advanceBottle(open.controller, bottle, 0.12), true);
  assert.ok(bottle.x > 200);
  assert.equal(open.shatters.length, 0);
});

test("gate posts extending beyond a room stop bottles after a linked horizontal crossing", () => {
  const f = fixture();
  f.addRoom(2, 1, 0);
  f.level.rooms[1].links.right = 2;
  f.level.rooms[2].links.left = 1;
  f.setTile(1, 9, 1, 4);
  const bottle = f.create({}, { x: 300, y: 86 });
  Object.assign(bottle, { vx: 500, vy: 0 });
  assert.equal(f.ballistics.advanceBottle(f.controller, bottle, 0.12), false);
  assert.equal(f.shatters.length, 1);
  assert.ok(Math.abs(bottle.x - 323) < 0.00001, "post at world x328 is hit five pixels before its face");
  assert.equal(f.fires.length, 0);
});

test("thrown bottles cross horizontal links in either direction and ignite the next room's floor", () => {
  for (const direction of [-1, 1]) {
    const f = fixture();
    f.addRoom(2, 1, 0);
    f.level.rooms[1].links.right = 2;
    f.level.rooms[2].links.left = 1;
    f.floor(1, 2);
    f.floor(2, 2);
    f.controller.kid.room = direction > 0 ? 1 : 2;
    const point = { x: direction > 0 ? 280 : 360, y: 130 };
    const result = f.flight(f.create({ charge: 0.9, direction }, point));
    assert.equal(result.alive, false);
    assert.equal(result.bottle.room, direction > 0 ? 2 : 1);
    assert.equal(f.fires[0].room, direction > 0 ? 2 : 1);
    assert.equal(f.fires[0].y, 182);
    assert.equal(f.shatters.length, 0);
  }
});

test("hanging throws always drop beneath the shaft, independent of charge, Up, or facing", () => {
  const f = fixture();
  for (const direction of [-1, 1]) {
    for (const charge of [0, 0.3, 1.5]) {
      for (const aimUp of [false, true]) {
        const dropped = f.create({ hanging: true, charge, direction, aimUp });
        assert.equal(dropped.vx, 0);
        assert.equal(dropped.vy, 65);
        assert.equal(dropped.aimUp, false);
      }
    }
  }
});

test("a hanging bottle passes down a linked shaft and lands only on a real supporting floor", () => {
  const f = fixture();
  f.addRoom(2, 0, 1);
  f.level.rooms[1].links.down = 2;
  f.level.rooms[2].links.up = 1;
  f.floor(2, 1);
  const result = f.flight(f.create({ hanging: true, charge: 0.08 }, { x: 238, y: 170 }));
  assert.equal(result.alive, false);
  assert.equal(result.bottle.room, 2);
  assert.deepEqual(f.fires[0], { room: 2, x: 238, y: 308, column: 7, row: 1 });
  assert.equal(f.shatters.length, 0);
});

test("high throws travel up a linked opening and return to the lower room under gravity", () => {
  const f = fixture();
  f.addRoom(2, 0, 1);
  f.level.rooms[1].links.down = 2;
  f.level.rooms[2].links.up = 1;
  f.floor(2, 1);
  f.controller.kid.room = 2;
  const result = f.flight(f.create({ charge: 1.5, aimUp: true }, { x: 20, y: 220 }));
  assert.equal(result.alive, false);
  assert.ok(result.rooms.has(1));
  assert.equal(result.bottle.room, 2);
  assert.equal(f.fires[0].room, 2);
  assert.equal(f.fires[0].y, 308);
  assert.equal(f.shatters.length, 0);
});

test("unlinked boundaries never transfer a bottle or fire into nearby map data", () => {
  for (const direction of ["right", "down", "up"]) {
    const f = fixture();
    f.addRoom(2, 1, 0);
    f.addRoom(3, 0, 1);
    const bottle = f.create({}, { x: direction === "right" ? 308 : 100, y: direction === "down" ? 175 : 15 });
    Object.assign(bottle, {
      vx: direction === "right" ? 400 : 0,
      vy: direction === "down" ? 400 : direction === "up" ? -400 : 0
    });
    assert.equal(f.ballistics.advanceBottle(f.controller, bottle, 0.2), false);
    assert.equal(bottle.room, 1);
    assert.equal(f.fires.length, 0);
    assert.equal(f.shatters.length, 1);
  }
});

test("a removed loose floor opens the trajectory to the room below instead of retaining an old collider", () => {
  const f = fixture();
  f.addRoom(2, 0, 1);
  f.level.rooms[1].links.down = 2;
  f.level.rooms[2].links.up = 1;
  f.setTile(1, 3, 2, 11);
  f.floor(2, 1);
  const bottle = f.create({ hanging: true, charge: 0.08 }, { x: 112, y: 150 });
  assert.equal(f.ballistics.advanceBottle(f.controller, bottle, 0.02), true);
  f.setTile(1, 3, 2, 0);
  f.flight(bottle);
  assert.equal(f.fires[0].room, 2);
  assert.equal(f.fires[0].y, 308);
});
