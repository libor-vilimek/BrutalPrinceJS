"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture(number = 1) {
  const PrinceJS = { ROOM_WIDTH: 320, ROOM_HEIGHT: 189, BLOCK_WIDTH: 32, BLOCK_HEIGHT: 63 };
  const Phaser = {
    Sprite: function (game) {
      this.game = game;
      this.scale = { x: 1, y: 1 };
      this.anchor = { setTo() {}, set() {} };
      this.addChild = () => {};
      this.visible = true;
    },
    Signal: function () {
      this.add = () => {};
    }
  };
  const context = vm.createContext({ PrinceJS, Phaser });
  for (const file of [
    "Utils",
    "Actor",
    "Fighter",
    "Enemy",
    "Level",
    "tiles/Base",
    "tiles/Gate",
    "HordeSpawns",
    "Game"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file + ".js"), "utf8"), context);
  }
  const json = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "assets", "maps", number >= 90 ? "custom" : "", `level${number}.json`))
  );
  const level = Object.create(PrinceJS.Level.prototype);
  level.number = json.number;
  level.rooms = {};
  level.dummyWall = { element: PrinceJS.Level.TILE_WALL, isSeeBarrier: () => true };
  const roomId = (x, y) =>
    x >= 0 && x < json.size.width && y >= 0 && y < json.size.height ? json.room[y * json.size.width + x].id : -1;
  json.room.forEach((data, index) => {
    if (data.id < 0) {
      return;
    }
    const x = index % json.size.width;
    const y = Math.floor(index / json.size.width);
    level.rooms[data.id] = {
      x,
      y,
      links: { left: roomId(x - 1, y), right: roomId(x + 1, y), up: roomId(x, y - 1), down: roomId(x, y + 1) },
      tiles: data.tile.map((tile) =>
        Object.assign(
          Object.create(
            tile.element === PrinceJS.Level.TILE_GATE ? PrinceJS.Tile.Gate.prototype : PrinceJS.Tile.Base.prototype
          ),
          tile,
          { posY: -tile.modifier * 46 }
        )
      )
    };
  });
  return { PrinceJS, level, json };
}

const campaignLevels = Array.from({ length: 14 }, (_, index) => index + 1);
const allowedFloors = [1, 3, 8, 14, 19];
const animations = Object.fromEntries(
  ["fighter", "sword"].map((key) => [
    key + "-anims",
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "anims", key + ".json")))
  ])
);
const game = {
  add: { existing() {} },
  make: { sprite: () => ({ scale: { x: 1 }, anchor: { set() {}, setTo() {} } }) },
  cache: { getJSON: (key) => animations[key] }
};

for (const number of campaignLevels) {
  test(`mission ${number} standing animation keeps every reinforcement's feet on its intended floor`, () => {
    const { PrinceJS, level, json } = fixture(number);
    const guards = PrinceJS.HordeSpawns.create(level, json);
    for (const [index, guard] of guards.entries()) {
      const enemy = new PrinceJS.Enemy(
        game,
        level,
        guard.location,
        guard.direction,
        guard.room,
        guard.skill,
        guard.colors,
        guard.type,
        index + 1
      );
      assert.ok(Number.isFinite(enemy.health) && enemy.health > 0, `mission ${number} enemy has usable health`);
      PrinceJS.HordeSpawns.place(enemy, guard.location);
      const column = guard.location % 10;
      const row = Math.floor(guard.location / 10);
      for (let tick = 0; tick < 60; tick++) {
        enemy.processCommand();
        enemy.updateAcceleration();
        enemy.updateVelocity();
        assert.equal(enemy.room, guard.room);
        assert.equal(enemy.charBlockX, column, `room ${guard.room}, slot ${guard.location}`);
        assert.equal(enemy.charBlockY, row);
        const footX = enemy.charX + enemy.charFdx * enemy.charFace - enemy.charFfoot * enemy.charFace;
        assert.equal(footX, PrinceJS.Utils.convertBlockXtoX(column) + 7);
        enemy.checkFloor();
        enemy.checkRoomChange();
        assert.equal(enemy.inFallDown, false);
        assert.equal(enemy.alive, true);
        assert.equal(enemy.action, "stand");
      }
    }
  });
}

for (const number of campaignLevels) {
  test(`mission ${number} has a dense army on safe permanent floors outside spawn`, () => {
    const { PrinceJS, level, json } = fixture(number);
    const guards = PrinceJS.HordeSpawns.create(level, json);
    const availableFloors = Object.entries(level.rooms)
      .filter(([id]) => Number(id) !== json.prince.room)
      .flatMap(([, room]) => room.tiles)
      .filter((tile) => allowedFloors.includes(tile.element)).length;
    assert.ok(
      guards.length >= Math.ceil(availableFloors * 0.7),
      `only ${guards.length} reinforcements for ${availableFloors} safe floors`
    );
    assert.ok(guards.length >= 20, `mission ${number} has only ${guards.length} reinforcements`);
    assert.equal(new Set(guards.map((guard) => `${guard.room}:${guard.location}`)).size, guards.length);
    for (const guard of guards) {
      const column = guard.location % 10;
      const row = Math.floor(guard.location / 10);
      const room = level.rooms[guard.room];
      assert.notEqual(guard.room, json.prince.room);
      assert.ok(allowedFloors.includes(level.getTileAt(column, row, guard.room).element));
      assert.ok(guard.colors >= 1 && guard.colors <= 7);
      assert.equal(guard.type, "guard");
      assert.equal(guard.reinforcement, true);
      if (room.links.right === json.prince.room) {
        assert.ok(column < 7);
      }
      if (room.links.left === json.prince.room) {
        assert.ok(column > 2);
      }
      const x = room.x * 320 + column * 32 + 16;
      for (const original of json.guards) {
        const originalRoom = level.rooms[original.room];
        const location = original.location + (original.bias || 0);
        if (room.y * 3 + row !== originalRoom.y * 3 + Math.floor(location / 10)) {
          continue;
        }
        const direction = original.direction * (original.reverse || 1);
        const originalX =
          originalRoom.x * 320 +
          PrinceJS.Utils.convertX(PrinceJS.Utils.convertBlockXtoX(location % 10) + direction * 7);
        assert.ok(Math.abs(originalX - x) >= 28, "reinforcement overlaps a story guard");
      }
    }
  });
}

test("reinforcements are reproducible and append after every original story actor", () => {
  for (const number of campaignLevels) {
    const { PrinceJS, level, json } = fixture(number);
    const before = JSON.stringify(json);
    const first = PrinceJS.HordeSpawns.create(level, json);
    assert.deepEqual(PrinceJS.HordeSpawns.create(level, json), first);
    assert.equal(JSON.stringify(json), before);
    assert.deepEqual(json.guards.concat(first).slice(0, json.guards.length), json.guards);
  }
  const { PrinceJS, level, json } = fixture(2);
  assert.ok(PrinceJS.HordeSpawns.create(level, json).length > 0);
  assert.deepEqual(
    json.guards.map((guard) => guard.room),
    [24, 15, 7, 11, 4]
  );
});

test("story scenes have clear floors while troops populate other floors around them", () => {
  const scenes = {
    3: ["1:1", "3:1", "8:2"],
    4: ["4:0"],
    5: ["11:0", "24:0"],
    6: ["1:1"],
    12: ["15:0", "15:1", "2:0"],
    13: ["1:0"]
  };
  for (const [number, clearRows] of Object.entries(scenes)) {
    const { PrinceJS, level, json } = fixture(Number(number));
    const guards = PrinceJS.HordeSpawns.create(level, json);
    assert.ok(guards.length >= 20);
    assert.ok(!guards.some((guard) => clearRows.includes(`${guard.room}:${Math.floor(guard.location / 10)}`)));
    if ([4, 5, 6, 12].includes(Number(number))) {
      const sceneRooms = clearRows.map((row) => Number(row.split(":")[0]));
      assert.ok(
        guards.some((guard) => sceneRooms.includes(guard.room)),
        `mission ${number} retains nearby troops`
      );
    }
    if (Number(number) === 12) {
      const leftLanding = level.rooms[2].links.left;
      assert.ok(!guards.some((guard) => guard.room === leftLanding && guard.location >= 6 && guard.location <= 9));
    }
  }
});

test("every bundled custom map has reinforcements with native campaign health and safe feet placement", () => {
  const directory = path.join(__dirname, "../assets/maps/custom");
  const files = fs.readdirSync(directory).filter((file) => /^level\d+\.json$/.test(file));
  assert.ok(files.length > 200);
  let totalGuards = 0;
  let totalFloors = 0;
  for (const file of files) {
    const { PrinceJS, level, json } = fixture(Number(file.match(/\d+/)[0]));
    const before = JSON.stringify(json);
    assert.ok(json.id >= 90, file);
    assert.ok(level.number >= 1 && level.number <= 14, `map id ${json.id} resolves to a native mission's strength`);
    const guards = PrinceJS.HordeSpawns.create(level, json);
    const availableFloors = Object.entries(level.rooms)
      .filter(([id]) => Number(id) !== json.prince.room)
      .flatMap(([, room]) => room.tiles)
      .filter((tile) => allowedFloors.includes(tile.element)).length;
    assert.ok(
      guards.length >= Math.max(1, Math.ceil(availableFloors * 0.4)),
      `${file} has only ${guards.length} reinforcements for ${availableFloors} safe floors`
    );
    totalGuards += guards.length;
    totalFloors += availableFloors;
    assert.deepEqual(PrinceJS.HordeSpawns.create(level, json), guards);
    assert.equal(JSON.stringify(json), before);
    const placements = new Set();
    for (const [index, guard] of guards.entries()) {
      const column = guard.location % 10;
      const row = Math.floor(guard.location / 10);
      const key = `${guard.room}:${guard.location}`;
      assert.notEqual(guard.room, json.prince.room, file);
      assert.ok(!placements.has(key), `${file} duplicates ${key}`);
      placements.add(key);
      assert.ok(allowedFloors.includes(level.getTileAt(column, row, guard.room).element), `${file} unsafe ${key}`);
      const enemy = new PrinceJS.Enemy(
        game,
        level,
        guard.location,
        guard.direction,
        guard.room,
        guard.skill,
        guard.colors,
        guard.type,
        index + 1
      );
      assert.ok(Number.isFinite(enemy.health) && enemy.health > 0, `${file} invalid enemy health`);
      PrinceJS.HordeSpawns.place(enemy, guard.location);
      assert.equal(enemy.charBlockX, column, `${file} ${key}`);
      assert.equal(enemy.charBlockY, row, `${file} ${key}`);
    }
  }
  assert.ok(totalGuards >= totalFloors * 0.7, "custom armies scale with the amount of permanent floor in their maps");
});

test("mission one opens with two molotov targets under the shaft and a clear approach to the minigun", () => {
  const { PrinceJS, level, json } = fixture(1);
  const below = level.rooms[json.prince.room].links.down;
  assert.equal(below, 2);
  const guards = PrinceJS.HordeSpawns.create(level, json);
  const intro = guards.filter((guard) => guard.room === below);
  assert.equal(intro.length, 2);
  assert.deepEqual(
    Array.from(intro, (guard) => guard.location),
    [16, 17]
  );
  assert.ok(intro.every((guard) => guard.skill === 0));
  assert.ok(
    intro.every((guard) => guard.health === 2),
    "opening guards die before hit reactions carry them out of the fire"
  );
  assert.ok(guards.filter((guard) => guard.room !== below).every((guard) => guard.health === undefined));
  assert.equal(
    level.getTileAt(6, 0, below).element,
    PrinceJS.Level.TILE_SPACE,
    "the bottle has an open shaft above its targets"
  );
  assert.equal(
    level.getTileAt(7, 1, below).element,
    PrinceJS.Level.TILE_FLOOR,
    "the gun waits on clear right-hand floor"
  );
  const nextRoom = level.rooms[below].links.right;
  assert.ok(
    !guards.some(
      (guard) => guard.room === nextRoom && Math.floor(guard.location / 10) === 1 && guard.location % 10 < 3
    ),
    "the next room's entrance stays clear beyond the right-hand gun"
  );
  assert.ok(
    guards.some((guard) => guard.room === nextRoom && guard.location === 13),
    "the first crowd starts beyond the three-column entrance clearance"
  );
  assert.ok(!guards.some((guard) => guard.room === json.prince.room), "the molotov's starting floor remains peaceful");
});

function battleFixture() {
  const { PrinceJS, level, json } = fixture(1);
  const state = Object.create(PrinceJS.Game.prototype);
  const kid = Object.assign(Object.create(PrinceJS.Fighter.prototype), {
    level,
    room: 21,
    baseX: level.rooms[21].x * 320,
    charX: 14,
    charBlockX: 1,
    charBlockY: 0,
    alive: true,
    hasMinigun: true,
    opponent: null
  });
  const enemy = (charX, options = {}) =>
    Object.assign(Object.create(PrinceJS.Enemy.prototype), {
      level,
      room: 21,
      baseX: level.rooms[21].x * 320,
      charX,
      charBlockX: Math.floor(charX / 14),
      charBlockY: 0,
      charY: PrinceJS.Utils.convertBlockYtoY(0),
      charFace: 1,
      baseCharName: "guard",
      charName: "guard-1",
      alive: true,
      active: true,
      visible: true,
      reinforcement: true,
      opponent: null,
      startFight: true,
      action: "stand",
      swordDrawn: false,
      sneakUp: false,
      opponentDistance: () => 50,
      canReachOpponent: () => true,
      canSeeOpponent: () => true,
      facingOpponent: () => true,
      engarde() {
        this.swordDrawn = true;
      },
      ...options
    });
  Object.assign(state, {
    level,
    kid,
    hordeEnabled: true,
    hordeEngaged: false,
    spawnRoom: json.prince.room,
    enemies: [],
    ui: {
      opp: null,
      setOpponentLive(actor) {
        this.opp = actor;
      },
      resetOpponentLive() {
        this.opp = null;
      }
    }
  });
  return { PrinceJS, level, state, kid, enemy };
}

test("every nearby soldier reacts, while HUD follows the nearest living opponent", () => {
  const { state, kid, enemy } = battleFixture();
  const far = enemy(112);
  const near = enemy(56);
  const middle = enemy(84);
  const dead = enemy(28, { alive: false });
  const invisible = enemy(29, { visible: false });
  const inactive = enemy(30, { active: false });
  state.enemies = [far, middle, dead, invisible, inactive, near];
  state.checkForOpponent(21);
  assert.equal(kid.opponent, near);
  assert.equal(state.ui.opp, near);
  for (const guard of [near, middle, far]) {
    assert.equal(guard.opponent, kid);
    guard.updateBehaviour();
    assert.equal(guard.swordDrawn, true);
  }
  for (const guard of [dead, invisible, inactive]) {
    assert.equal(guard.opponent, null);
  }
  near.alive = false;
  state.checkForOpponent(21);
  assert.equal(kid.opponent, middle);
  middle.alive = far.alive = false;
  state.checkForOpponent(21);
  assert.equal(kid.opponent, null);
  assert.equal(state.ui.opp, null);
});

test("starting room remains peaceful when visible guards have no route and guards stop chasing distant rooms", () => {
  const { level, state, kid, enemy } = battleFixture();
  const guard = enemy(84);
  state.enemies = [guard];
  kid.room = state.spawnRoom;
  state.checkForOpponent(kid.room);
  assert.equal(state.hordeEngaged, false);
  assert.equal(guard.opponent, null);
  kid.room = 21;
  state.checkForOpponent(21);
  assert.equal(state.hordeEngaged, true);
  assert.equal(guard.opponent, kid);
  kid.room = 11;
  kid.baseX = level.rooms[11].x * 320;
  state.checkForOpponent(11);
  assert.equal(guard.opponent, null);
  assert.equal(kid.opponent, null);
});

test("visible guards hunt on the same floor before gun pickup and wait while the Prince hangs above", () => {
  const { level, state, kid, enemy } = battleFixture();
  const guard = enemy(98, { room: 2, baseX: level.rooms[2].x * 320, charBlockY: 1 });
  state.enemies = [guard];
  Object.assign(kid, { room: 2, baseX: level.rooms[2].x * 320, charBlockY: 1, hasMinigun: false });
  state.checkForOpponent(2);
  assert.equal(state.hordeEngaged, true);
  assert.equal(guard.opponent, kid);
  assert.equal(guard.startFight, true);
  assert.equal(kid.opponent, guard);
  kid.charBlockY = 0;
  kid.action = "hang";
  state.checkForOpponent(2);
  assert.equal(guard.opponent, null);
  assert.equal(guard.startFight, false);
  assert.equal(kid.opponent, null);
  kid.hasMinigun = true;
  state.checkForOpponent(2);
  assert.equal(guard.opponent, null, "collecting a gun cannot connect different walking floors");
  state.hordeEngaged = false;
  state.level.number = 2;
  Object.assign(kid, { hasMinigun: false, charBlockY: 1, action: "stand" });
  state.checkForOpponent(2);
  assert.equal(state.hordeEngaged, true, "other missions also react immediately to an accessible Prince");
});

test("later missions keep the original inactive story-character selection", () => {
  const { state, kid, enemy } = battleFixture();
  state.hordeEnabled = false;
  state.game = { sound: { play() {} } };
  const skeleton = enemy(84, { active: false, reinforcement: false, charName: "skeleton" });
  state.enemies = [skeleton];
  state.checkForOpponent(21);
  assert.equal(kid.opponent, skeleton);
  assert.equal(skeleton.opponent, kid);
});

test("mission two's scripted guard adjustment does not move a new soldier off its safe tile", () => {
  const { state, enemy } = battleFixture();
  const original = enemy(7, {
    room: 24,
    charBlockX: 0,
    charBlockY: 1,
    reinforcement: false,
    updateBlockXY() {}
  });
  const reinforcement = enemy(7, { room: 24, charBlockX: 0, charBlockY: 1, updateBlockXY() {} });
  state.level.number = 2;
  state.specialEvents = true;
  state.firstUpdate = true;
  state.enemies = [original, reinforcement];
  state.checkLevelLogic();
  assert.equal(original.charX, -5);
  assert.equal(reinforcement.charX, 7);
});
