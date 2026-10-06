"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture() {
  const PrinceJS = {
    ROOM_WIDTH: 320,
    ROOM_HEIGHT: 189,
    BLOCK_WIDTH: 32,
    BLOCK_HEIGHT: 63,
    SCALE_FACTOR: 2,
    UI_HEIGHT: 8
  };
  const delayed = [];
  const Phaser = {
    Sprite: function (game) {
      Object.assign(this, { game, x: 0, y: 0, width: 32, height: 40, visible: true });
      this.scale = { x: 1, y: 1 };
      this.anchor = { setTo() {}, set() {} };
      this.addChild = () => {};
    },
    Signal: function () {
      this.add = () => {};
      this.dispatch = () => {};
    },
    Rectangle: function (x, y, width, height) {
      Object.assign(this, { x, y, width, height });
      this.intersects = (other) =>
        x < other.x + other.width && x + width > other.x && y < other.y + other.height && y + height > other.y;
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
    "RoomCamera",
    "Game"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  PrinceJS.Utils.delayed = (callback, ms) => delayed.push({ callback, ms });
  const level = Object.assign(Object.create(PrinceJS.Level.prototype), {
    number: 1,
    rooms: {
      1: { x: 0, y: 0, links: { left: -1, right: 2, up: -1, down: 4 } },
      2: { x: 1, y: 0, links: { left: 1, right: 3, up: -1, down: -1 } },
      3: { x: 2, y: 0, links: { left: 2, right: -1, up: -1, down: -1 } },
      4: { x: 0, y: 1, links: { left: -1, right: -1, up: 1, down: -1 } }
    },
    dummyWall: Object.assign(Object.create(PrinceJS.Tile.Base.prototype), { element: PrinceJS.Level.TILE_WALL }),
    maskTile() {},
    unMaskTile() {}
  });
  for (const [id, room] of Object.entries(level.rooms)) {
    room.tiles = Array.from({ length: 30 }, (_, index) => {
      const row = Math.floor(index / 10);
      const column = index % 10;
      return Object.assign(Object.create(PrinceJS.Tile.Base.prototype), {
        element:
          row === 1 ? PrinceJS.Level.TILE_FLOOR : row === 0 ? PrinceJS.Level.TILE_SPACE : PrinceJS.Level.TILE_WALL,
        room: Number(id),
        roomX: column,
        roomY: row,
        back: { x: column * 32, y: row * 63, width: 32, height: 63, centerX: column * 32 + 16 },
        front: { x: column * 32, y: row * 63, width: 32, height: 63 }
      });
    });
  }
  const animations = Object.fromEntries(
    ["fighter", "sword"].map((key) => [
      key + "-anims",
      JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/anims", key + ".json")))
    ])
  );
  const frames = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/gfx/guard-1.json"))).frames;
  const game = {
    add: { existing() {} },
    make: { sprite: () => new Phaser.Sprite(game) },
    cache: {
      getJSON: (key) => animations[key],
      getFrameData: () => ({ getFrameByName: (key) => ({ width: frames[key].frame.w, height: frames[key].frame.h }) })
    },
    rnd: { between: () => 254 },
    sound: { play() {} },
    camera: { x: 0, y: 0, width: 640, height: 400, bounds: null },
    world: {
      scale: {
        x: 2,
        y: 2,
        setTo(x, y) {
          this.x = x;
          this.y = y;
        }
      }
    }
  };
  const state = Object.assign(Object.create(PrinceJS.Game.prototype), {
    game,
    level,
    hordeEnabled: true,
    hordeEngaged: false,
    spawnRoom: 1,
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
  game.state = { getCurrentState: () => state };
  const kid = Object.assign(Object.create(PrinceJS.Fighter.prototype), {
    level,
    room: 1,
    charX: 119,
    charY: 116,
    charFace: -1,
    charBlockX: 8,
    charBlockY: 1,
    alive: true,
    active: true,
    visible: true,
    hasMinigun: false,
    swordDrawn: false,
    action: "stand",
    opponent: null,
    sneaks: () => false,
    stabbed() {
      this.health--;
    },
    health: 10,
    frameID: () => false
  });
  kid.updateBase();
  kid.x = PrinceJS.Utils.convertX(kid.charX);
  kid.y = kid.baseY + kid.charY;
  state.kid = kid;
  state.roomCamera = new PrinceJS.RoomCamera(state);
  state.roomCamera.setRoom(1);
  const guard = (column = 1, room = 1, direction = 1) => {
    const enemy = new PrinceJS.Enemy(
      game,
      level,
      10 + column,
      direction,
      room,
      1,
      1,
      "guard",
      state.enemies.length + 1
    );
    PrinceJS.HordeSpawns.place(enemy, 10 + column);
    enemy.updateCharPosition();
    state.enemies.push(enemy);
    return enemy;
  };
  const placeKid = (room, column, row = 1) => {
    Object.assign(kid, {
      room,
      charX: PrinceJS.Utils.convertBlockXtoX(column) + 7,
      charBlockX: column,
      charBlockY: row,
      charY: PrinceJS.Utils.convertBlockYtoY(row)
    });
    kid.updateBase();
    kid.x = kid.baseX + PrinceJS.Utils.convertX(kid.charX);
    kid.y = kid.baseY + kid.charY;
  };
  return { PrinceJS, level, game, state, kid, guard, placeKid, delayed };
}

test("a visible ordinary guard immediately draws and advances before any gun pickup", () => {
  const { state, kid, guard, delayed } = fixture();
  const enemy = guard();
  assert.equal(enemy.opponent, null);
  enemy.updateBehaviour();
  assert.equal(enemy.opponent, kid);
  assert.equal(enemy.startFight, true);
  assert.equal(enemy.swordDrawn, true);
  assert.equal(enemy.action, "engarde");
  assert.equal(delayed.length, 0, "hunting has no delayed or random start");
  const initialX = enemy.charX;
  for (let tick = 0; tick < 20; tick++) {
    enemy.updateActor();
  }
  assert.ok(enemy.charX > initialX + 10, "the original fighter animation advances toward the Prince");
  assert.equal(enemy.room, 1);
  assert.equal(enemy.charBlockY, 1);
  assert.equal(enemy.alive, true);
  assert.equal(kid.hasMinigun, false);
  state.checkHordeOpponents(1);
  assert.equal(state.ui.opp, enemy);
});

test("a guard facing away turns through its native command sequence before hunting", () => {
  const { guard, placeKid } = fixture();
  placeKid(1, 1);
  const enemy = guard(8);
  enemy.updateBehaviour();
  assert.equal(enemy.startFight, true);
  assert.equal(enemy.charFace, -1);
  for (let tick = 0; tick < 14; tick++) {
    enemy.updateActor();
  }
  assert.equal(enemy.charFace, -1);
  assert.equal(enemy.swordDrawn, true);
  assert.ok(["engarde", "advance"].includes(enemy.action));
});

test("the Phaser visible flag cannot activate an off-camera guard in a partially visible room", () => {
  const { state, guard } = fixture();
  const enemy = guard(8, 2, -1);
  assert.equal(enemy.visible, true);
  assert.equal(state.roomCamera.isRoomVisible(2), true, "the zoomed view includes the left edge of the neighbor");
  assert.equal(enemy.canHuntOpponent(state.kid, state.roomCamera), false);
  enemy.updateBehaviour();
  assert.equal(enemy.opponent, null);
  assert.equal(enemy.startFight, false);
  const near = guard(0, 2, -1);
  assert.equal(
    near.canHuntOpponent(state.kid, state.roomCamera),
    true,
    "a guard actually inside the neighbor preview can hunt"
  );
});

test("guards on the same local row of another floor cannot acquire the Prince", () => {
  const { guard, kid } = fixture();
  const enemy = guard(8, 4);
  enemy.opponent = kid;
  assert.equal(enemy.opponentOnSameLevel(), false);
  enemy.updateBehaviour();
  assert.equal(enemy.opponent, null);
  assert.equal(enemy.startFight, false);
  assert.equal(enemy.action, "stand");
});

test("guards beneath a hanging Prince stay on their own walking floor", () => {
  const { guard, kid, placeKid } = fixture();
  const enemy = guard(6);
  placeKid(1, 7, 0);
  kid.action = "hang";
  enemy.opponent = kid;
  enemy.lookBelow = true;
  enemy.updateBehaviour();
  assert.equal(enemy.opponent, null);
  assert.equal(enemy.startFight, false);
  assert.equal(enemy.swordDrawn, false);
});

test("a close opponent across a missing floor does not trigger the legacy distance shortcut", () => {
  const { level, guard, placeKid, PrinceJS } = fixture();
  const enemy = guard(4);
  placeKid(1, 6);
  level.getTileAt(5, 1, 1).element = PrinceJS.Level.TILE_SPACE;
  enemy.updateBehaviour();
  assert.equal(enemy.opponent, null);
  assert.equal(enemy.startFight, false);
});

test("walls, mirrors, tapestries, loose boards, and choppers stop pursuit", () => {
  const { PrinceJS, level, guard, kid } = fixture();
  const enemy = guard();
  const tile = level.getTileAt(5, 1, 1);
  for (const element of [
    PrinceJS.Level.TILE_WALL,
    PrinceJS.Level.TILE_MIRROR,
    PrinceJS.Level.TILE_TAPESTRY,
    PrinceJS.Level.TILE_TAPESTRY_TOP,
    PrinceJS.Level.TILE_LOOSE_BOARD,
    PrinceJS.Level.TILE_CHOPPER
  ]) {
    tile.element = element;
    assert.equal(enemy.canHuntOpponent(kid), false, `blocked by tile ${element}`);
  }
  tile.element = PrinceJS.Level.TILE_FLOOR;
  assert.equal(enemy.canHuntOpponent(kid), true);
});

test("a guard acquires when a gate opens and stops as soon as its route closes", () => {
  const { PrinceJS, level, guard, kid } = fixture();
  const enemy = guard();
  const gate = level.getTileAt(5, 1, 1);
  Object.setPrototypeOf(gate, PrinceJS.Tile.Gate.prototype);
  gate.element = PrinceJS.Level.TILE_GATE;
  gate.posY = 0;
  enemy.updateBehaviour();
  assert.equal(enemy.opponent, null);
  gate.posY = -47;
  enemy.updateBehaviour();
  assert.equal(enemy.opponent, kid);
  assert.equal(enemy.startFight, true);
  gate.posY = 0;
  enemy.updateBehaviour();
  assert.equal(enemy.opponent, null);
  assert.equal(enemy.startFight, false);
  assert.equal(enemy.action, "stand");
});

test("pursuit crosses valid room seams but rejects missing, misaligned, or one-way links", () => {
  const { level, guard, kid, placeKid } = fixture();
  const enemy = guard(8);
  placeKid(2, 2);
  assert.equal(enemy.canHuntOpponent(kid), true);
  enemy.opponent = kid;
  assert.ok(enemy.opponentDistance() > 35, "distance uses world positions across the seam");
  level.rooms[1].links.right = -1;
  assert.equal(enemy.canHuntOpponent(kid), false);
  level.rooms[1].links.right = 2;
  level.rooms[2].links.left = -1;
  assert.equal(enemy.canHuntOpponent(kid), false);
  level.rooms[2].links.left = 1;
  level.rooms[2].x = 2;
  assert.equal(enemy.canHuntOpponent(kid), false);
  level.rooms[2].x = 1;
  level.rooms[2].y = 1;
  assert.equal(enemy.canHuntOpponent(kid), false);
});

test("a guard walks across a neighboring room seam using the existing collision and animation code", () => {
  const { guard, placeKid } = fixture();
  placeKid(1, 5);
  const enemy = guard(1, 2, -1);
  for (let tick = 0; tick < 80 && enemy.room !== 1; tick++) {
    enemy.updateActor();
  }
  assert.equal(enemy.room, 1);
  assert.equal(enemy.baseX, 0);
  assert.equal(enemy.charBlockY, 1);
  assert.equal(enemy.inFallDown, false);
  assert.equal(enemy.alive, true);
  assert.equal(enemy.startFight, true);
});

test("the continuous-floor route can span more than one linked room", () => {
  const { guard, kid, placeKid, level, PrinceJS } = fixture();
  const enemy = guard(1);
  placeKid(3, 1);
  assert.equal(enemy.hasHuntPath(kid), true);
  enemy.opponent = kid;
  assert.ok(enemy.opponentDistance() >= 280);
  level.getTileAt(6, 1, 2).element = PrinceJS.Level.TILE_SPACE;
  assert.equal(enemy.hasHuntPath(kid), false);
});

test("every accessible guard hunts independently and HUD skips closer blocked or different-floor guards", () => {
  const { state, kid, guard, level, PrinceJS } = fixture();
  const near = guard(6);
  const far = guard(2);
  const below = guard(8, 4);
  const blocked = guard(9, 2, -1);
  level.getTileAt(5, 1, 2).element = PrinceJS.Level.TILE_WALL;
  state.checkHordeOpponents(1);
  assert.equal(kid.opponent, near);
  assert.equal(state.ui.opp, near);
  for (const enemy of [near, far]) {
    assert.equal(enemy.opponent, kid);
    assert.equal(enemy.startFight, true);
  }
  assert.equal(below.opponent, null);
  assert.equal(blocked.opponent, null);
  near.alive = false;
  state.checkHordeOpponents(1);
  assert.equal(kid.opponent, far);
});

test("hidden, inactive, and dead guards never hunt or have death animations replaced", () => {
  for (const options of [
    { visible: false },
    { active: false },
    { alive: false, action: "dropdead", swordDrawn: false }
  ]) {
    const { guard } = fixture();
    const enemy = Object.assign(guard(), options);
    enemy.updateBehaviour();
    assert.equal(enemy.opponent, null);
    assert.equal(enemy.startFight, false);
    assert.equal(enemy.action, options.action || "stand");
  }
});

test("Jaffar keeps the scripted delay and other story characters are not proactive guards", () => {
  const { guard, kid, delayed } = fixture();
  const enemy = guard();
  enemy.baseCharName = "jaffar";
  enemy.opponent = kid;
  enemy.startFight = false;
  enemy.updateBehaviour();
  assert.equal(enemy.startFight, false);
  assert.equal(delayed.length, 1);
  assert.equal(delayed[0].ms, 2300);
  delayed[0].callback();
  assert.equal(enemy.startFight, true);
  for (const name of ["shadow", "skeleton", "jaffar"]) {
    enemy.baseCharName = name;
    assert.equal(enemy.isProactiveGuard(), false);
  }
  enemy.baseCharName = "fatguard";
  assert.equal(enemy.isProactiveGuard(), true);
});
