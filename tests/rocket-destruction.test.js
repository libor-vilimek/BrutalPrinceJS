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
    crop(rectangle) {
      this.cropRect = rectangle;
    },
    beginFill(color, alpha) {
      this.color = color;
      this.alpha = alpha;
    },
    drawRect(x, y, width, height) {
      this.draws.push({ x, y, width, height, color: this.color, alpha: this.alpha });
    },
    endFill() {},
    clear() {
      this.draws = [];
    },
    draws: [],
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
    "LevelBuilder",
    "RangedWeapon",
    "RocketLauncherAction",
    "RocketLauncher",
    "TutorialSequence"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file + ".js"), "utf8"), context);
  }
  const game = {
    world: { setBounds() {} },
    add: { group, graphics: () => ({}) },
    make: { sprite, graphics: (x, y) => sprite(x, y) },
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
    this.shot = () => {};
    this.explode = () => this.impacts++;
  };
  const delegate = { game, level, kid, enemies: [], weaponFireKey: { isDown: false }, ui: { setOpponentLive() {} } };
  level.delegate = delegate;
  const launcher = new PrinceJS.RocketLauncher(delegate, -1);
  const rocket = (x = 60, direction = 1, room = 1) => ({
    x,
    y: 95,
    room,
    direction,
    life: launcher.spec.lifetime,
    age: 0
  });
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
  return { PrinceJS, game, delegate, level, kid, launcher, rocket, enemy, setTile };
}

function realDoorFixture(number) {
  const f = fixture();
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "maps", "level" + number + ".json")));
  const arrivalClosures = [];
  f.PrinceJS.Utils.delayed = (fn) => arrivalClosures.push(fn);
  const builder = new f.PrinceJS.LevelBuilder(f.game, f.delegate);
  const buildTile = builder.buildTile;
  // Use the real map, positions, door constructor and builder classification.
  // Decorative/trap classes are irrelevant to these door interactions.
  builder.buildTile = function (x, y, room, ...start) {
    const source = this.level.rooms[room].tiles[y * 10 + x];
    return source.element === f.PrinceJS.Level.TILE_EXIT_RIGHT
      ? buildTile.call(this, x, y, room, ...start)
      : new f.PrinceJS.Tile.Base(f.game, source.element, source.modifier, map.type);
  };
  f.level = builder.buildFromJSON(map);
  f.delegate.level = f.launcher.level = f.kid.level = f.level;
  arrivalClosures.forEach((fn) => fn());
  f.kid.room = map.prince.room;
  f.kid.charBlockX = map.prince.location % 10;
  f.kid.charBlockY = Math.floor(map.prince.location / 10);
  return { ...f, map, builder };
}

function fireFrom(f, x, direction, room) {
  f.kid.room = room;
  f.kid.baseX = f.level.rooms[room].x * f.PrinceJS.ROOM_WIDTH;
  f.kid.charX = ((x - f.kid.baseX) * 140) / 320;
  f.launcher.fire({ x: x + 18 * direction, y: 95, direction });
  assert.equal(f.launcher.bullets.length, 1);
  for (let i = 0; i <= Math.ceil(f.launcher.spec.lifetime / 0.05) && f.launcher.bullets.length; i++) {
    f.launcher.advanceBullets(0.05);
  }
  assert.equal(f.launcher.bullets.length, 0);
}

function demolitionSequence(f, muzzle = { x: 60, y: 95, direction: 1 }) {
  f.launcher.effects.getMuzzle = () => muzzle;
  f.delegate.rocketLauncher = f.launcher;
  f.kid.baseX = f.level.rooms[f.kid.room].x * f.PrinceJS.ROOM_WIDTH;
  f.kid.charX = ((muzzle.x - 18 * muzzle.direction - f.kid.baseX) * 140) / 320;
  return new f.PrinceJS.TutorialSequence(f.delegate, {});
}

test("demolition targets real walls, gates and exit doors and observes their actual rocket destruction", () => {
  for (const element of ["TILE_WALL", "TILE_GATE", "TILE_EXIT_RIGHT"]) {
    const f = fixture();
    const tile = f.setTile(1, 3, 1, f.PrinceJS.Level[element]);
    const sequence = demolitionSequence(f);
    assert.equal(sequence.findRocketTarget(), tile);
    assert.equal(sequence.rocketTargetDestroyed(), false);
    assert.equal(f.launcher.advanceBullet(f.rocket(), 200), false);
    assert.equal(sequence.rocketTargetDestroyed(), true, "use real debris or the blasted door state");
    assert.equal(sequence.findRocketTarget(), null, "rubble and destroyed doors cannot trigger another lesson");
  }
});

test("demolition follows room links both ways and waits for the actual barrier to become visible", () => {
  for (const direction of [-1, 1]) {
    const f = fixture();
    const tile = f.setTile(direction === 1 ? 2 : 1, direction === 1 ? 0 : 9, 1, f.PrinceJS.Level.TILE_WALL);
    f.kid.room = direction === 1 ? 1 : 2;
    const sequence = demolitionSequence(f, { x: direction === 1 ? 280 : 380, y: 95, direction });
    f.delegate.roomCamera = { camera: { x: 400, y: 0 }, scale: 1, viewWidth: 200, viewHeight: 189 };
    assert.equal(sequence.findRocketTarget(), null);
    f.delegate.roomCamera.camera.x = 200;
    assert.equal(sequence.findRocketTarget(), tile);
    f.launcher.advanceBullet(f.rocket(direction === 1 ? 280 : 380, direction, f.kid.room), 150);
    assert.equal(sequence.rocketTargetDestroyed(), true);
  }
});

test("demolition requires an unobstructed shot and ignores entrance doors, missing rooms and distant walls", () => {
  const f = fixture();
  const door = f.setTile(1, 3, 1, f.PrinceJS.Level.TILE_EXIT_RIGHT);
  door.doorRole = "entrance";
  const sequence = demolitionSequence(f);
  assert.equal(sequence.findRocketTarget(), null, "the protected arrival door is never a demolition target");
  const wall = f.setTile(1, 6, 1, f.PrinceJS.Level.TILE_WALL);
  assert.equal(sequence.findRocketTarget(), wall, "rockets pass through the arrival door");
  const guard = f.enemy(150);
  assert.equal(sequence.findRocketTarget(), null, "a guard intercepts the shot first");
  guard.alive = false;
  assert.equal(sequence.findRocketTarget(), wall);
  f.setTile(1, 6, 1, f.PrinceJS.Level.TILE_FLOOR);
  f.setTile(2, 7, 1, f.PrinceJS.Level.TILE_WALL);
  assert.equal(sequence.findRocketTarget(), null, "only a nearby barrier is useful for the demonstration");
  f.kid.room = 2;
  f.kid.charX = (602 * 140) / 320;
  f.launcher.effects.getMuzzle = () => ({ x: 620, y: 95, direction: 1 });
  assert.equal(sequence.findRocketTarget(), null, "a missing neighboring room is not a destructible boundary wall");
});

test("demolition includes the body-to-muzzle sweep instead of overlooking a gate under the barrel", () => {
  const f = fixture();
  const gate = f.setTile(1, 2, 1, f.PrinceJS.Level.TILE_GATE);
  f.setTile(1, 6, 1, f.PrinceJS.Level.TILE_WALL);
  const sequence = demolitionSequence(f, { x: 116, y: 95, direction: 1 });
  assert.equal(sequence.findRocketTarget(), gate);
  f.launcher.fire(f.launcher.effects.getMuzzle());
  assert.equal(sequence.rocketTargetDestroyed(), true);
});

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

test("rockets from the far room edge progressively breach every column of a solid adjacent room", () => {
  for (const direction of [1, -1]) {
    const f = fixture();
    const sourceRoom = direction === 1 ? 1 : 2;
    const targetRoom = direction === 1 ? 2 : 1;
    const launchX = direction === 1 ? 8 : 632;
    for (let column = 0; column < 10; column++) {
      f.setTile(targetRoom, column, 1, f.PrinceJS.Level.TILE_WALL);
    }
    for (let shot = 0; shot < 10; shot++) {
      const column = direction === 1 ? shot : 9 - shot;
      fireFrom(f, launchX, direction, sourceRoom);
      assert.equal(f.level.getTileAt(column, 1, targetRoom).isSafeWalkable(), true);
      assert.equal(f.level.getTileAt(column, 1, targetRoom).isBarrier(), false);
      if (shot < 9) {
        assert.equal(f.level.getTileAt(column + direction, 1, targetRoom).isBarrier(), true);
      }
    }
    assert.equal(f.launcher.effects.impacts, 10);
  }
});

test("a rocket reaches the far wall of the adjacent room without an existing opening at that wall", () => {
  const f = fixture();
  f.setTile(2, 9, 1, f.PrinceJS.Level.TILE_WALL);
  fireFrom(f, 8, 1, 1);
  assert.equal(f.level.getTileAt(9, 1, 2).isSafeWalkable(), true);
  assert.equal(f.launcher.effects.impacts, 1);
});

test("rockets cannot enter a geometrically neighboring room without its level link", () => {
  const f = fixture();
  const wall = f.setTile(2, 0, 1, f.PrinceJS.Level.TILE_WALL);
  f.level.rooms[1].links.right = -1;
  fireFrom(f, 8, 1, 1);
  assert.equal(f.level.getTileAt(0, 1, 2), wall);
  assert.equal(wall.isBarrier(), true);
  assert.equal(f.launcher.effects.impacts, 1);
});

test("a rocket sweeps its final partial frame and breaches the wall before its fuse expires", () => {
  const f = fixture();
  f.setTile(1, 2, 1, f.PrinceJS.Level.TILE_WALL);
  const rocket = f.rocket(62);
  rocket.life = 0.025;
  f.launcher.bullets.push(rocket);
  f.launcher.advanceBullets(0.05);
  assert.equal(f.launcher.bullets.length, 0);
  assert.equal(f.level.getTileAt(2, 1, 1).isSafeWalkable(), true);
  assert.equal(rocket.age, 0.025);
  assert.equal(f.launcher.effects.impacts, 1);
});

test("rockets visibly accelerate from a slow launch to eight times their initial speed", () => {
  const f = fixture();
  const rocket = f.rocket();
  const distances = [];
  f.launcher.advanceBullet = (projectile, distance) => {
    distances.push(distance);
    projectile.x += distance * projectile.direction;
    return true;
  };
  f.launcher.bullets.push(rocket);
  for (let i = 0; i < 7; i++) {
    f.launcher.advanceBullets(0.1);
  }
  assert.ok(Math.abs(distances[0] - 13.5) < 1e-8);
  assert.ok(distances[6] > distances[0] * 4.9);
  assert.ok(Math.abs(rocket.speed - 720) < 1e-8);
  f.launcher.advanceBullets(0.1);
  assert.ok(Math.abs(distances[7] - 72) < 1e-8);
  assert.equal(rocket.speed, 720);
});

test("acceleration is frame independent, including a frame crossing the maximum speed", () => {
  for (const direction of [-1, 1]) {
    const positions = [];
    for (const steps of [[1], Array(20).fill(0.05), [0.65, 0.35]]) {
      const f = fixture();
      const rocket = f.rocket(60, direction);
      f.launcher.advanceBullet = (projectile, distance) => {
        projectile.x += distance * projectile.direction;
        return true;
      };
      f.launcher.bullets.push(rocket);
      for (const delta of steps) {
        f.launcher.advanceBullets(delta);
      }
      positions.push(rocket.x);
    }
    for (const position of positions) {
      assert.ok(Math.abs(position - (60 + direction * 499.5)) < 1e-8);
    }
  }
});

test("accelerating rockets sweep their entire final range and detonate once at 720 pixels", () => {
  const f = fixture();
  const rocket = f.rocket();
  f.launcher.advanceBullet = (projectile, distance) => {
    projectile.x += distance;
    return true;
  };
  f.launcher.bullets.push(rocket);
  f.launcher.advanceBullets(2);
  assert.equal(rocket.x, 780);
  assert.equal(rocket.distance, 720);
  assert.equal(f.launcher.bullets.length, 0);
  assert.equal(f.launcher.effects.impacts, 1);
  f.launcher.advanceBullets(1);
  assert.equal(f.launcher.effects.impacts, 1);
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

test("real dungeon and palace maps classify both door halves using the Prince's arrival door", () => {
  for (const number of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
    const f = realDoorFixture(number);
    const rightDoors = f.level.rooms
      .filter(Boolean)
      .flatMap((room) => room.tiles.filter((tile) => tile.element === f.PrinceJS.Level.TILE_EXIT_RIGHT));
    for (const door of rightDoors) {
      const nearSpawn =
        door.room === f.map.prince.room &&
        Math.abs(door.roomY * 10 + door.roomX - (f.map.prince.location + (f.map.prince.bias || 0))) <= 1;
      assert.equal(door.doorRole, nearSpawn ? "entrance" : "exit", "level " + number);
      assert.equal(door.leftTile.doorRole, door.doorRole);
      assert.equal(door.leftTile.exitDoor, door);
      assert.equal(f.level[nearSpawn ? "entranceDoors" : "exitDoors"].includes(door), true);
    }
  }
});

test("rockets pass both halves of open and closed arrival doors in either direction without exploding", () => {
  for (const number of [2, 3, 4]) {
    const f = realDoorFixture(number);
    const door = f.level.entranceDoors[0];
    const room = f.level.rooms[door.room];
    const left = door.leftTile.x - 2;
    const right = door.x + f.PrinceJS.BLOCK_WIDTH + 2;
    for (const open of [false, true]) {
      door.open = open;
      door.state = open ? f.PrinceJS.Tile.ExitDoor.STATE_OPEN : f.PrinceJS.Tile.ExitDoor.STATE_CLOSED;
      const state = door.state;
      for (const direction of [-1, 1]) {
        const rocket = {
          x: direction === 1 ? left : right,
          y: room.y * f.PrinceJS.ROOM_HEIGHT + door.roomY * f.PrinceJS.BLOCK_HEIGHT + 30,
          room: door.room,
          direction
        };
        assert.equal(f.launcher.advanceBullet(rocket, right - left), true, "level " + number);
        assert.equal(rocket.x, direction === 1 ? right : left);
        assert.equal(f.launcher.effects.impacts, 0);
        assert.equal(door.open, open);
        assert.equal(door.state, state);
        assert.equal(door.destroyedByRocket, undefined);
        assert.equal(door.damagedFacade, undefined);
        assert.equal(f.level.exitDoorOpen, false);
      }
    }
  }
});

test("arrival doors remain protected from forced damage and nearby rocket blasts", () => {
  for (const number of [3, 4]) {
    const f = realDoorFixture(number);
    const door = f.level.entranceDoors[0];
    const left = door.leftTile;
    const room = f.level.rooms[door.room];
    assert.equal(f.level.destroyBarrier(left, { direction: 1 }), false);
    assert.equal(f.level.destroyBarrier(door, { direction: -1 }), false);
    assert.equal(door.blastOpen({ direction: 1 }), false, "door protects itself too");
    for (const direction of [-1, 1]) {
      for (const half of [left, door]) {
        const rocket = { x: half.x + 16, y: room.y * 189 + door.roomY * 63 + 30, room: door.room, direction };
        assert.equal(f.launcher.obstacleAt(rocket, room), null);
        f.launcher.impact(rocket, null, half);
        assert.equal(door.destroyedByRocket, undefined);
        assert.equal(door.damagedFacade, undefined);
        assert.equal(f.level.exitDoorOpen, false);
      }
    }
    f.launcher.impact({ x: left.x - 8, y: left.y + 40, room: door.room, direction: 1 });
    assert.equal(door.destroyedByRocket, undefined);
    assert.equal(f.level.exitDoorOpen, false);
    // Native close/raise behavior remains available after rocket impacts.
    door.state = f.PrinceJS.Tile.ExitDoor.STATE_CLOSED;
    door.raise();
    assert.equal(door.state, f.PrinceJS.Tile.ExitDoor.STATE_RAISING);
  }
});

test("real exits shatter from either half even after being opened and preserve the native exit action", () => {
  for (const number of [3, 4]) {
    for (const direction of [-1, 1]) {
      for (const fromLeft of [true, false]) {
        const f = realDoorFixture(number);
        const door = f.level.exitDoors[0];
        const half = fromLeft ? door.leftTile : door;
        const room = f.level.rooms[door.room];
        door.open = true;
        const rocket = { x: half.x + 16, y: room.y * 189 + door.roomY * 63 + 30, room: door.room, direction };
        assert.equal(f.launcher.obstacleAt(rocket, room), door);
        f.launcher.impact(rocket, null, half);
        assert.equal(door.destroyedByRocket, true);
        assert.equal(door.open, true);
        assert.equal(f.level.exitDoorOpen, true);
        assert.equal(f.level.getTileAt(door.roomX, door.roomY, door.room), door);
        assert.equal(f.launcher.obstacleAt(rocket, room), null);
        assert.equal(door.damagedFacade.parent, door.back);
        assert.equal(door.damageRubble.parent, door.front);
        assert.ok(door.damagedFacade.children.length >= 6);
        assert.equal(door.damageAnimation.fragments.length, 16);
        f.kid.room = door.room;
        f.kid.charBlockX = half.roomX;
        f.kid.charBlockY = half.roomY;
        f.kid.climbstairs = () => "climbstairs";
        assert.equal(f.kid.jump(), "climbstairs");
      }
    }
  }
});

test("blasted doorway shards fly, settle permanently, and never restore an intact door on re-entry", () => {
  const f = realDoorFixture(3);
  const door = f.level.exitDoors[0];
  f.level.destroyBarrier(door, { direction: 1 });
  const originalY = door.damageAnimation.fragments[0].sprite.y;
  f.level.update();
  assert.notEqual(door.damageAnimation.fragments[0].sprite.y, originalY);
  assert.ok(door.damageDust.draws.length > 0);
  for (let i = 0; i < 25; i++) {
    f.level.update();
  }
  assert.equal(
    door.damageAnimation.fragments.every((fragment) => fragment.settled),
    true
  );
  assert.equal(door.damageDust.draws.length, 0);
  const settled = JSON.stringify(
    door.damageAnimation.fragments.map(({ sprite }) => [sprite.x, sprite.y, sprite.angle])
  );
  const backDraws = JSON.stringify(door.damagedFacade.draws);
  door.drop();
  door.raise();
  door.mask();
  f.level.checkGates(door.room);
  for (let i = 0; i < 30; i++) {
    f.level.update();
  }
  assert.equal(door.open, true);
  assert.equal(door.tileChildBack.visible, false);
  assert.equal(door.tileChildFront.visible, false);
  assert.equal(JSON.stringify(door.damagedFacade.draws), backDraws);
  assert.equal(
    JSON.stringify(door.damageAnimation.fragments.map(({ sprite }) => [sprite.x, sprite.y, sprite.angle])),
    settled
  );
  assert.equal(f.level.destroyBarrier(door), false, "another rocket cannot duplicate persistent debris");
  door.destroy();
  assert.equal(door.damagedFacade.destroyed, true);
  assert.equal(door.damageRubble.destroyed, true);
  assert.equal(door.damageDust.destroyed, true);
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
  f.kid.keyWeaponAction = () => true;
  f.setTile(1, 2, 1, f.PrinceJS.Level.TILE_SWORD);
  assert.equal(f.launcher.triggerDown(), true);
  f.setTile(1, 2, 1, f.PrinceJS.Level.TILE_POTION);
  assert.equal(f.launcher.triggerDown(), false);
});
