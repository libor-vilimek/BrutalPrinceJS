"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture() {
  const PrinceJS = { ROOM_WIDTH: 320, ROOM_HEIGHT: 189, BLOCK_WIDTH: 32, BLOCK_HEIGHT: 63 };
  const group = () => ({
    children: [],
    add(child) {
      this.children.push(child);
      child.parent = this;
    },
    getIndex(child) {
      return this.children.indexOf(child);
    },
    setChildIndex(child, index) {
      this.children.splice(this.children.indexOf(child), 1);
      this.children.splice(index, 0, child);
    }
  });
  const sprite = (x, y, key, frameName) => ({
    x,
    y,
    key,
    frameName,
    width: 60,
    height: 79,
    visible: true,
    children: [],
    addChild(child) {
      this.children.push(child);
      child.parent = this;
    },
    crop() {},
    destroy() {
      this.destroyed = true;
      for (const child of [...this.children]) {
        child.destroy();
      }
      if (this.parent) {
        this.parent.children.splice(this.parent.children.indexOf(this), 1);
      }
    },
    get centerX() {
      return this.x + this.width / 2;
    }
  });
  const context = vm.createContext({
    PrinceJS,
    Phaser: {
      Sprite: function () {},
      Signal: function () {
        this.dispose = () => {
          this.disposed = true;
        };
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
    "tiles/ExitDoor",
    "RangedWeapon",
    "RocketLauncher"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file + ".js"), "utf8"), context);
  }
  const game = {
    add: { group, graphics: () => ({}) },
    make: { sprite },
    sound: { play() {} }
  };
  const level = new PrinceJS.Level(game, 1, "Destruction test", 0);
  const setTile = (room, x, y, element) => {
    let tile;
    if (element === PrinceJS.Level.TILE_GATE) {
      tile = new PrinceJS.Tile.Gate(game, 0, 0);
      level.addTrob(tile);
    } else if (element === PrinceJS.Level.TILE_EXIT_RIGHT) {
      tile = new PrinceJS.Tile.ExitDoor(game, 0, 0);
      level.addTrob(tile);
    } else {
      tile = new PrinceJS.Tile.Base(game, element, 0, 0);
    }
    const old = level.rooms[room].tiles[y * 10 + x];
    if (old) {
      old.destroy();
    }
    level.addTile(x, y, room, tile);
    return tile;
  };
  for (let id = 1; id <= 2; id++) {
    level.rooms[id] = {
      x: id - 1,
      y: 0,
      links: { left: id === 1 ? -1 : 1, right: id === 1 ? 2 : -1, up: -1, down: -1 },
      tiles: []
    };
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 10; x++) {
        setTile(id, x, y, PrinceJS.Level.TILE_FLOOR);
      }
    }
  }
  const kid = Object.assign(Object.create(PrinceJS.Kid.prototype), {
    level,
    room: 1,
    charBlockX: 1,
    charBlockY: 1,
    charFace: 1,
    height: 42,
    centerX: 48,
    keyS: () => true
  });
  PrinceJS.RocketLauncherEffects = function () {
    this.impacts = 0;
    this.explode = () => this.impacts++;
  };
  const delegate = { game, level, kid, enemies: [], weaponFireKey: { isDown: false }, ui: { setOpponentLive() {} } };
  level.delegate = delegate;
  const launcher = new PrinceJS.RocketLauncher(delegate, -1);
  const rocket = (x = 60, direction = 1, room = 1) => ({ x, y: 95, room, direction, life: 3 });
  const enemy = (x) => {
    const target = {
      room: 1,
      baseX: 0,
      baseY: 3,
      alive: true,
      active: true,
      visible: true,
      charFrame: 16,
      health: 3,
      damageLife() {
        this.health--;
        this.alive = this.health > 0;
      },
      getCharBounds: () => ({ x, y: 72, width: 18, height: 42 })
    };
    delegate.enemies.push(target);
    return target;
  };
  return { PrinceJS, level, kid, launcher, rocket, enemy, setTile };
}

test("a rocket replaces a stone wall with permanent rubble that the Prince can walk through", () => {
  const f = fixture();
  const wall = f.setTile(1, 3, 1, f.PrinceJS.Level.TILE_WALL);
  assert.equal(f.kid.nearBarrier(2, 1), true);
  const index = f.level.front.getIndex(wall.front);
  assert.equal(f.launcher.advanceBullet(f.rocket(), 150), false);
  const rubble = f.level.getTileAt(3, 1, 1);
  assert.equal(rubble.element, f.PrinceJS.Level.TILE_DEBRIS);
  assert.equal(rubble.isSafeWalkable(), true);
  assert.equal(rubble.isBarrier(), false);
  assert.equal(f.kid.nearBarrier(2, 1), false);
  assert.equal(f.kid.canWalkOnTile(3, 1, 1), true);
  assert.equal(wall.back.destroyed, true);
  assert.equal(wall.front.destroyed, true);
  assert.equal(f.level.front.getIndex(rubble.front), index);
  f.kid.room = 2;
  f.level.checkGates(2, 1);
  f.kid.room = 1;
  f.level.checkGates(1, 2);
  assert.equal(f.level.getTileAt(3, 1, 1), rubble);
  assert.equal(f.launcher.advanceBullet(f.rocket(), 150), true);
});

test("the first explosion is occluded by an intact wall; later rockets reach soldiers through the breach", () => {
  const f = fixture();
  f.setTile(1, 3, 1, f.PrinceJS.Level.TILE_WALL);
  const guard = f.enemy(130);
  f.launcher.advanceBullet(f.rocket(), 200);
  assert.equal(guard.health, 3);
  assert.equal(f.level.getTileAt(3, 1, 1).isBarrier(), false);
  f.launcher.advanceBullet(f.rocket(), 200);
  assert.equal(guard.alive, false);
  assert.equal(f.launcher.effects.impacts, 2);
});

test("thin gate collision identifies the owning tile from either direction and clears animations and masks", () => {
  for (const direction of [-1, 1]) {
    const f = fixture();
    const gate = f.setTile(1, 3, 1, f.PrinceJS.Level.TILE_GATE);
    f.level.activeGates.push(gate);
    f.level.maskedTiles.kid = gate;
    assert.equal(f.launcher.advanceBullet(f.rocket(direction === 1 ? 60 : 200, direction), 150), false);
    assert.equal(f.level.getTileAt(3, 1, 1).isSafeWalkable(), true);
    assert.equal(f.level.getTileAt(3, 1, 1).isBarrier(), false);
    assert.equal(f.level.trobs.includes(gate), false);
    assert.equal(f.level.activeGates.includes(gate), false);
    assert.equal(f.level.maskedTiles.kid, undefined);
    assert.equal(gate.onFastDrop.disposed, true);
    f.level.update();
  }
});

test("a breach across a room seam modifies the impacted room and updates neighboring wall edge graphics", () => {
  const f = fixture();
  const left = f.setTile(1, 9, 1, f.PrinceJS.Level.TILE_WALL);
  f.setTile(2, 0, 1, f.PrinceJS.Level.TILE_WALL);
  const right = f.setTile(2, 1, 1, f.PrinceJS.Level.TILE_WALL);
  f.level.destroyBarrier(left);
  assert.equal(f.launcher.advanceBullet(f.rocket(315), 60), false);
  assert.equal(f.level.getTileAt(0, 1, 2).isSafeWalkable(), true);
  assert.equal(right.front.frameName, "SWS_13");
  assert.equal(right.back.frameName, "dungeon_wall_0");
  assert.equal(f.level.destroyBarrier(f.level.dummyWall), false);
});

test("neighboring walls expose the new opening instead of retaining solid-wall edge art", () => {
  const f = fixture();
  const left = f.setTile(1, 2, 1, f.PrinceJS.Level.TILE_WALL);
  const center = f.setTile(1, 3, 1, f.PrinceJS.Level.TILE_WALL);
  const right = f.setTile(1, 4, 1, f.PrinceJS.Level.TILE_WALL);
  f.level.refreshWallAppearance(left);
  assert.equal(left.front.frameName, "SWW_13");
  f.level.destroyBarrier(center);
  assert.equal(left.front.frameName, "SWS_13");
  assert.equal(left.back.frameName, "dungeon_wall_0");
  assert.equal(right.front.frameName, "SWS_15");
});

test("destroyed exit door panels stay open and retain the real climb-stairs level exit", () => {
  const f = fixture();
  f.setTile(1, 3, 1, f.PrinceJS.Level.TILE_EXIT_LEFT);
  const door = f.setTile(1, 4, 1, f.PrinceJS.Level.TILE_EXIT_RIGHT);
  assert.equal(f.launcher.advanceBullet(f.rocket(), 150), false);
  assert.equal(door.open, true);
  assert.equal(door.tileChildBack.visible, false);
  assert.equal(door.tileChildFront.visible, false);
  assert.equal(f.level.exitDoorOpen, true);
  door.drop();
  door.raise();
  door.mask();
  f.level.update();
  assert.equal(door.open, true);
  assert.equal(door.tileChildFront.visible, false);
  f.kid.charBlockX = 3;
  f.kid.climbstairs = () => "climbstairs";
  assert.equal(f.kid.jump(), "climbstairs");
  assert.equal(f.launcher.advanceBullet(f.rocket(), 150), true);
});

test("tapestry barriers are removed but hanging tops do not create a floor over a gap", () => {
  const f = fixture();
  const curtain = f.setTile(1, 3, 1, f.PrinceJS.Level.TILE_TAPESTRY);
  assert.equal(f.level.destroyBarrier(curtain), true);
  assert.equal(f.level.getTileAt(3, 1, 1).isSafeWalkable(), true);
  const upper = f.setTile(1, 3, 0, f.PrinceJS.Level.TILE_TAPESTRY_TOP);
  assert.equal(f.level.destroyBarrier(upper), true);
  assert.equal(f.level.getTileAt(3, 0, 1).isSpace(), true);
  assert.equal(f.level.getTileAt(3, 0, 1).isBarrier(), false);
});

test("sword floor decoration no longer suppresses action-button fire while potions still do", () => {
  const f = fixture();
  f.setTile(1, 2, 1, f.PrinceJS.Level.TILE_SWORD);
  assert.equal(f.launcher.triggerDown(), true);
  f.setTile(1, 2, 1, f.PrinceJS.Level.TILE_POTION);
  assert.equal(f.launcher.triggerDown(), false);
});
