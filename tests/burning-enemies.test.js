"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture(options = {}) {
  const visuals = [];
  class Graphics {
    constructor(x, y) {
      Object.assign(this, { x, y, alpha: 1, visible: true, children: [], shapes: [], scale: { x: 1, y: 1 } });
      visuals.push(this);
    }
    addChild(child) {
      this.children.push(child);
    }
    clear() {
      this.shapes = [];
    }
    beginFill(color, alpha) {
      this.fill = { color, alpha };
    }
    drawRect(x, y, width, height) {
      this.shapes.push({ x, y, width, height, ...this.fill });
    }
    endFill() {}
    destroy() {
      this.destroyed = true;
      this.children.forEach((child) => child.destroy());
    }
  }
  class Sprite {
    constructor(x, y, atlas, frameName) {
      Object.assign(this, { x, y, atlas, frameName, anchor: { setTo() {} }, scale: { x: 1, y: 1 } });
      visuals.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const game = {
    add: { graphics: (x, y) => new Graphics(x, y) },
    make: { graphics: (x, y) => new Graphics(x, y), sprite: (...args) => new Sprite(...args) },
    cache: {
      getFrameData(atlas) {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "gfx", atlas + ".json"), "utf8"));
        return { getFrameByName: (name) => data.frames[name] };
      }
    }
  };
  const delays = [];
  let victoryFlashes = 0;
  const PrinceJS = {
    ROOM_WIDTH: 320,
    ROOM_HEIGHT: 189,
    BLOCK_WIDTH: 32,
    BLOCK_HEIGHT: 63,
    Actor: function () {},
    Utils: {
      convertX: (value) => Math.floor((value * 320) / 140),
      delayed: (callback) => delays.push(callback),
      flashWhiteVizierVictory: () => victoryFlashes++
    }
  };
  const context = vm.createContext({ PrinceJS });
  for (const name of ["Level", "Fighter", "Enemy", "GorePhysics", "BurningEnemyEffects"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", name + ".js"), "utf8"), context);
  }
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
  const level = { rooms: {}, dummyWall: tile(20, -1, -1, -1) };
  const floorRow = options.floorRow === undefined ? 1 : options.floorRow;
  const addRoom = (id, x, y, row, links) => {
    level.rooms[id] = {
      x,
      y,
      links: { left: -1, right: -1, up: -1, down: -1, ...links },
      tiles: Array.from({ length: 30 }, (_, index) =>
        tile(Math.floor(index / 10) === row ? 1 : 0, index % 10, Math.floor(index / 10), id)
      )
    };
  };
  addRoom(1, 0, 0, floorRow, { right: options.rightRoom === false ? -1 : 2, down: options.downRoom ? 3 : -1 });
  if (options.rightRoom !== false) {
    addRoom(2, 1, 0, floorRow, { left: 1 });
  }
  if (options.downRoom) {
    addRoom(3, 0, 1, 0, { up: 1 });
  }
  level.getTileAt = (column, row, room) => {
    let map = level.rooms[room];
    if (!map) {
      return level.dummyWall;
    }
    if (column < 0 || column > 9) {
      return level.getTileAt((column + 10) % 10, row, map.links[column < 0 ? "left" : "right"]);
    }
    if (row < 0 || row > 2) {
      return level.getTileAt(column, (row + 3) % 3, map.links[row < 0 ? "up" : "down"]);
    }
    return map.tiles[row * 10 + column];
  };
  const blood = [];
  const delegate = { game, level, bloodEffects: { burst: (...args) => blood.push(args) } };
  const effects = new PrinceJS.BurningEnemyEffects(delegate);
  effects.random = () => 0.5;
  const enemy = (data = {}) => {
    const room = data.room || 1;
    const origin = level.rooms[room];
    const x = data.x === undefined ? origin.x * 320 + 140 : data.x;
    const feet = data.feet === undefined ? origin.y * 189 + (floorRow + 1) * 63 - 7 : data.feet;
    return {
      game,
      charName: "guard-1",
      baseCharName: "guard",
      charFace: 1,
      charFrame: 16,
      charX: ((x - origin.x * 320) * 140) / 320,
      charY: feet - origin.y * 189 - 3,
      charFdy: 0,
      baseX: origin.x * 320,
      baseY: origin.y * 189 + 3,
      room,
      health: 4,
      alive: true,
      alpha: 1,
      active: true,
      visible: true,
      swordDrawn: true,
      sword: { alpha: 1 },
      splash: { visible: false },
      damageSignals: [],
      deadSignals: 0,
      getCharBounds() {
        return { x: (this.charX * 320) / 140 - 7, y: this.charY - 34, width: 14, height: 34 };
      },
      die: PrinceJS.Fighter.prototype.die,
      CMD_DIE: PrinceJS.Fighter.prototype.CMD_DIE,
      proceedOnDead: PrinceJS.Fighter.prototype.proceedOnDead,
      hideSplash() {
        this.splash.visible = false;
      },
      showSplash() {
        this.splash.visible = true;
      },
      bringAboveOpponent() {},
      onDamageLife: {
        dispatch(amount) {
          this.actor.damageSignals.push(amount);
        }
      },
      onDead: {
        dispatch() {
          this.actor.deadSignals++;
        }
      },
      ...data
    };
  };
  const actor = (data) => {
    let guard = enemy(data);
    guard.onDamageLife.actor = guard;
    guard.onDead.actor = guard;
    return guard;
  };
  const advance = (seconds, delta = 1 / 60) => {
    for (let elapsed = 0; elapsed < seconds; elapsed += delta) {
      effects.update(Math.min(delta, seconds - elapsed));
    }
  };
  return { PrinceJS, effects, actor, advance, level, delegate, visuals, blood, delays, flashes: () => victoryFlashes };
}

test("ignition kills health/combat immediately and dispatches native damage and death exactly once", () => {
  const f = fixture();
  const guard = f.actor();
  const burn = f.effects.ignite(guard, { direction: 1, weapon: "molotov" });
  assert.ok(burn);
  assert.equal(guard.health, 0);
  assert.equal(guard.alive, false);
  assert.equal(guard.swordDrawn, false);
  assert.deepEqual(guard.damageSignals, [4]);
  assert.equal(guard.deadSignals, 1);
  assert.equal(guard.alpha, 0);
  assert.equal(guard.sword.alpha, 0);
  assert.equal(guard.splash.visible, false);
  assert.equal(f.effects.ignite(guard, { weapon: "twinTorches" }), null);
  guard.updateSplash = () => assert.fail("native animation must not advance the dead guard");
  f.PrinceJS.Enemy.prototype.updateActor.call(guard);
  f.advance(8);
  assert.equal(guard.deadSignals, 1);
  assert.deepEqual(guard.damageSignals, [4]);
  assert.equal(f.effects.burns.length, 1);
});

test("a burning guard uses its original pixels, runs both ways and collapses into permanent charred remains at five seconds", () => {
  const f = fixture();
  const guard = f.actor();
  const burn = f.effects.ignite(guard, { direction: 1 });
  const start = burn.x;
  const frames = new Set();
  for (let i = 0; i < 48; i++) {
    f.effects.update(1 / 60);
    frames.add(burn.body.frameName);
  }
  const furthest = burn.x;
  assert.ok(furthest > start + 50);
  assert.ok(frames.size >= 3);
  assert.equal(burn.body.atlas, "guard-1");
  assert.ok(burn.flames.shapes.some((shape) => shape.color === 0xffdc68));
  f.advance(0.7);
  assert.ok(burn.x < furthest - 25, "the panic run changes direction");
  f.advance(3.45);
  assert.equal(burn.phase, "collapsing");
  assert.ok(burn.turns >= 3);
  f.advance(0.05);
  assert.equal(burn.phase, "charred");
  assert.equal(burn.body.frameName, "guard-1-35");
  assert.equal(burn.body.tint, 0x51413a);
  assert.equal(burn.flames.visible, false);
  f.advance(1);
  const position = { x: burn.x, y: burn.y, room: burn.room };
  assert.equal(burn.settled, true);
  f.delegate.currentRoom = 2;
  f.advance(20);
  assert.deepEqual({ x: burn.x, y: burn.y, room: burn.room }, position);
  assert.equal(burn.body.destroyed, undefined);
  assert.equal(guard.burningDeath, burn);
});

test("panicking guards cross real room links in either direction and keep their actor position synchronized", () => {
  for (let direction of [-1, 1]) {
    const f = fixture();
    const guard = f.actor(direction < 0 ? { room: 2, x: 342 } : { x: 298 });
    const burn = f.effects.ignite(guard, { direction });
    burn.turnTime = 10;
    f.advance(0.6);
    assert.equal(burn.room, direction < 0 ? 1 : 2);
    assert.equal(guard.room, burn.room);
    assert.equal(guard.baseX, direction < 0 ? 0 : 320);
    assert.equal(guard.x, burn.x);
    assert.equal(guard.charFace, direction);
    assert.equal(guard.deadSignals, 1);
  }
});

test("a burning guard falls through an actual gap into the linked room below and lands on its floor", () => {
  const f = fixture({ floorRow: 2, downRoom: true });
  for (let tile of f.level.rooms[1].tiles) {
    tile.element = 0;
  }
  const guard = f.actor({ x: 175 });
  const burn = f.effects.ignite(guard);
  burn.turnTime = 10;
  const originalY = burn.y;
  f.advance(0.85);
  assert.equal(burn.room, 3);
  assert.equal(guard.room, 3);
  assert.equal(guard.baseY, 192);
  assert.ok(burn.y > originalY + 50);
  assert.equal(burn.grounded, true);
  assert.equal(burn.y + burn.radius, 189 + 56);
  assert.equal(guard.deadSignals, 1, "landing cannot dispatch another death");
});

test("burning runs respect stone, missing links and partially opened gates above their feet", () => {
  for (let kind of ["stone", "gate", "edge"]) {
    const f = fixture({ rightRoom: false });
    const guard = f.actor({ x: kind === "edge" ? 291 : 167 });
    if (kind === "stone") {
      f.level.rooms[1].tiles[16].element = 20;
    } else if (kind === "gate") {
      let tile = f.level.rooms[1].tiles[16];
      tile.element = 4;
      // Feet fit through this opening; the native body's head still does not.
      tile.getBounds = () => ({ x: 200, y: 63, width: 2, height: 33 });
    }
    const burn = f.effects.ignite(guard, { direction: 1 });
    burn.turnTime = 10;
    f.advance(0.65);
    assert.ok(burn.turns > 0, kind + " must reverse the run");
    assert.ok(burn.x < (kind === "edge" ? 317 : kind === "gate" ? 200 : 192));
    assert.equal(burn.room, 1);
  }
});

test("a panicking guard impales on native spikes and remains burning there without a second death", () => {
  const f = fixture();
  const spikes = f.level.rooms[1].tiles[15];
  spikes.element = f.PrinceJS.Level.TILE_SPIKES;
  spikes.mortal = true;
  spikes.raiseCalls = 0;
  spikes.raise = () => spikes.raiseCalls++;
  const guard = f.actor({ x: 144 });
  const burn = f.effects.ignite(guard);
  burn.turnTime = 10;
  f.advance(0.5);
  assert.equal(burn.trap, "impaled");
  assert.equal(spikes.raiseCalls, 1);
  assert.equal(burn.body.frameName, "guard-1-27");
  assert.equal(burn.vx, 0);
  assert.equal(burn.flames.visible, true);
  assert.equal(f.blood.length, 1);
  f.advance(5);
  assert.equal(burn.phase, "charred");
  assert.equal(burn.body.frameName, "guard-1-27");
  assert.equal(guard.deadSignals, 1);
});

test("inactive decorative spikes do not arrest the panic run", () => {
  const f = fixture();
  const spikes = f.level.rooms[1].tiles[15];
  spikes.element = f.PrinceJS.Level.TILE_SPIKES;
  spikes.mortal = false;
  const burn = f.effects.ignite(f.actor({ x: 144 }));
  burn.turnTime = 10;
  f.advance(0.5);
  assert.equal(burn.trap, null);
  assert.ok(burn.x > 170);
});

test("panicking feet still shake loose floors and press native floor buttons", () => {
  for (let type of ["TILE_LOOSE_BOARD", "TILE_RAISE_BUTTON", "TILE_DROP_BUTTON"]) {
    const f = fixture();
    const tile = f.level.rooms[1].tiles[15];
    tile.element = f.PrinceJS.Level[type];
    let calls = [];
    tile.shake = (fall) => calls.push(fall);
    tile.push = () => calls.push("pushed");
    const burn = f.effects.ignite(f.actor({ x: 160 }));
    burn.turnTime = 10;
    f.advance(0.3);
    assert.ok(calls.length > 0);
    assert.ok(calls.every((value) => value === (type === "TILE_LOOSE_BOARD" ? true : "pushed")));
  }
});

test("running, falling, trap and charred rendering always uses existing original enemy atlas frames", () => {
  for (let atlas of [
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
    const frames = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "assets", "gfx", atlas + ".json"), "utf8")
    ).frames;
    const f = fixture();
    const burn = f.effects.ignite(f.actor({ charName: atlas }));
    for (let data of [
      { age: 0.01, grounded: true },
      { age: 0.1, grounded: true },
      { age: 0.15, grounded: true },
      { grounded: false },
      { trap: "impaled" },
      { trap: "halved" },
      { trap: null, age: 4.67 },
      { age: 4.73 },
      { age: 4.8 },
      { age: 4.89 },
      { age: 4.96 },
      { phase: "charred", age: 5 }
    ]) {
      Object.assign(burn, data);
      f.effects.render(burn);
      assert.ok(frames[burn.body.frameName], "native drawing must exist: " + burn.body.frameName);
    }
  }
});

test("a burning guard can hit an active native chopper with its trap artwork and environmental blood", () => {
  const f = fixture();
  const chopper = f.level.rooms[1].tiles[15];
  chopper.element = f.PrinceJS.Level.TILE_CHOPPER;
  chopper.step = 2;
  chopper.showBlood = () => (chopper.bloody = true);
  const guard = f.actor({ x: 158 });
  const burn = f.effects.ignite(guard);
  burn.turnTime = 10;
  f.advance(0.4);
  assert.equal(burn.trap, "halved");
  assert.equal(chopper.bloody, true);
  assert.equal(burn.body.frameName, "guard-1-28");
  assert.equal(guard.action, "halve");
  f.advance(5);
  assert.equal(guard.deadSignals, 1);
});

test("permanent charred remains wake and fall when the actual supporting floor is destroyed", () => {
  const f = fixture();
  const burn = f.effects.ignite(f.actor());
  f.advance(6);
  assert.equal(burn.settled, true);
  const y = burn.y;
  for (let tile of f.level.rooms[burn.room].tiles.slice(10, 20)) {
    tile.element = 0;
  }
  f.advance(0.85);
  assert.ok(burn.y > y + 40);
  assert.equal(burn.phase, "charred");
  assert.equal(burn.body.frameName, "guard-1-35");
  assert.equal(burn.flames.visible, false);
});

test("dead guards and supernatural skeleton/shadow actors keep their native state", () => {
  const f = fixture();
  for (let data of [
    { alive: false, health: 0 },
    { charName: "skeleton", baseCharName: "skeleton" },
    { charName: "shadow", baseCharName: "shadow" },
    { baseCharName: "shadow" }
  ]) {
    const guard = f.actor(data);
    assert.equal(f.effects.ignite(guard), null);
    assert.equal(guard.alpha, 1);
    assert.equal(guard.deadSignals, 0);
    assert.deepEqual(guard.damageSignals, []);
  }
  assert.equal(f.effects.burns.length, 0);
});

test("the native vizier death event and victory flash run once at ignition", () => {
  const f = fixture();
  const vizier = f.actor({ charName: "jaffar", baseCharName: "jaffar" });
  const burn = f.effects.ignite(vizier, { weapon: "twinTorches" });
  assert.equal(burn.body.atlas, "jaffar");
  assert.equal(vizier.deadSignals, 1);
  assert.equal(f.delays.length, 1);
  f.delays[0]();
  assert.equal(f.flashes(), 1);
  f.advance(10);
  assert.equal(f.delays.length, 1);
  assert.equal(vizier.deadSignals, 1);
});

test("shutdown removes all visual particles and restores native alpha without repeating callbacks", () => {
  const f = fixture();
  const guard = f.actor({ alpha: 0.8, sword: { alpha: 0.6 } });
  f.effects.ignite(guard);
  f.advance(0.2);
  f.effects.destroy();
  assert.equal(guard.burningDeath, undefined);
  assert.equal(guard.alpha, 0.8);
  assert.equal(guard.sword.alpha, 0.6);
  assert.equal(guard._seqpointer, 9);
  assert.equal(guard.deadSignals, 1);
  assert.equal(f.effects.burns.length, 0);
  assert.equal(f.effects.movingBurns.length, 0);
  assert.ok(f.visuals.every((visual) => visual.destroyed));
  assert.doesNotThrow(() => f.effects.destroy());
  assert.equal(f.effects.ignite(f.actor()), null);
});

test("burning effects keep the limited audio pool synchronized through ignition, camera changes, collapse and shutdown", () => {
  const f = fixture();
  const calls = [];
  let stops = 0;
  let visible = [1];
  f.delegate.roomCamera = { visibleRooms: () => visible };
  f.delegate.weaponAudio = {
    updateBurning(burns, rooms) {
      calls.push({ active: burns.filter((burn) => burn.phase !== "charred").length, rooms });
    },
    stopBurning() {
      stops++;
    }
  };
  f.effects.ignite(f.actor());
  assert.deepEqual(calls.at(-1), { active: 1, rooms: [1] });
  visible = [2];
  f.advance(0.05);
  assert.deepEqual(calls.at(-1), { active: 1, rooms: [2] });
  f.advance(5);
  assert.deepEqual(calls.at(-1), { active: 0, rooms: [2] });
  f.effects.destroy();
  f.effects.destroy();
  assert.equal(stops, 1);
});
