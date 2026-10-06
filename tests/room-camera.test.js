"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture() {
  const PrinceJS = { ROOM_WIDTH: 320, ROOM_HEIGHT: 189, SCALE_FACTOR: 2, UI_HEIGHT: 8 };
  const context = vm.createContext({ PrinceJS });
  for (const file of ["RoomCamera", "Game", "Level"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  const rooms = {
    1: { x: 0, y: 0, links: { left: -1, right: 2, down: 4 } },
    2: { x: 1, y: 0, links: { left: 1, right: 3, down: 5 } },
    3: { x: 2, y: 0, links: { left: 2, right: -1 } },
    4: { x: 0, y: 1, links: { left: -1, right: 5, up: 1 } },
    5: { x: 1, y: 1, links: { left: 4, right: -1, up: 2 } },
    6: { x: 4, y: 0, links: { left: -1, right: -1 } },
    7: { x: 1, y: 2, links: { left: -1, right: -1, up: 5 } }
  };
  const gates = [];
  const opponents = [];
  const scene = Object.assign(Object.create(PrinceJS.Game.prototype), {
    game: {
      camera: { x: 0, y: 0, width: 640, height: 400, bounds: { x: 0, y: 0 } },
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
    },
    level: {
      rooms,
      checkGates: (...args) => gates.push(args)
    },
    kid: { baseX: 0, charX: 70, room: 1, charFace: 1, exists: true },
    blockCamera: false,
    currentRoom: 1,
    currentCameraRoom: null,
    previousCameraRoom: null,
    cameraVisibleRooms: null,
    visitedRooms: {},
    checkForOpponent: (id) => opponents.push(id),
    outOfRoom() {
      this.outside = true;
    }
  });
  scene.roomCamera = new PrinceJS.RoomCamera(scene);
  const position = (worldX, id = scene.kid.room, direction = 1) => {
    scene.kid.room = id;
    scene.kid.charFace = direction;
    scene.kid.baseX = rooms[id].x * 320;
    scene.kid.charX = ((worldX - scene.kid.baseX) * 140) / 320;
  };
  const advance = (seconds, fps = 60) => {
    for (let i = 0; i < Math.round(seconds * fps); i++) {
      scene.updateCamera(1 / fps);
    }
  };
  return { PrinceJS, scene, camera: scene.roomCamera, rooms, position, advance, gates, opponents };
}

function containsRoom(f, id) {
  const room = f.rooms[id];
  const left = f.scene.game.camera.x / f.camera.scale;
  const top = f.scene.game.camera.y / f.camera.scale;
  return (
    left <= room.x * 320 &&
    left + f.camera.viewWidth >= (room.x + 1) * 320 &&
    top <= room.y * 189 &&
    top + f.camera.viewHeight >= (room.y + 1) * 189
  );
}

function cameraY(f, row) {
  return Math.round((row * 189 - f.camera.paddingY) * f.camera.scale);
}

test("opening view aligns with a room and middle-screen movement leaves the camera still", () => {
  const f = fixture();
  f.position(480, 2);
  f.scene.setupCamera(2);
  assert.equal(f.scene.game.camera.x, 448);
  assert.equal(f.scene.game.camera.y, cameraY(f, 0));
  for (const x of [420, 480, 540]) {
    f.position(x);
    f.advance(0.5);
    assert.equal(f.camera.x, 280);
    assert.equal(containsRoom(f, 2), true);
  }
});

test("approaching the right edge pans before crossing it and reveals the adjoining room", () => {
  const f = fixture();
  f.scene.setupCamera(1);
  f.position(290);
  f.scene.updateCamera(1 / 60);
  assert.ok(f.camera.x > -40 && f.camera.x < -15);
  assert.equal(f.scene.game.camera.y, cameraY(f, 0));
  assert.deepEqual(Array.from(f.camera.visibleRooms()), [1, 2, 4, 5]);
  assert.equal(containsRoom(f, 1), true);
  assert.equal(f.camera.isRoomVisible(2), true);
  assert.equal(f.scene.currentRoom, 1);
  assert.equal(f.scene.currentCameraRoom, 1);
  assert.equal(f.opponents.length, 1);
  assert.deepEqual(Object.keys(f.scene.visitedRooms), ["1"]);
});

test("approaching the left edge pans left smoothly before a room change", () => {
  const f = fixture();
  f.position(350, 2, -1);
  f.scene.setupCamera(2);
  f.scene.updateCamera(1 / 60);
  assert.ok(f.camera.x < 280 && f.camera.x > 255);
  assert.equal(containsRoom(f, 2), true);
  assert.ok(f.camera.isRoomVisible(1));
});

test("legacy edge hints cannot cut sideways, including notifications with cameraRoom zero", () => {
  const f = fixture();
  f.scene.setupCamera(1);
  f.position(330);
  f.advance(0.2);
  const before = f.scene.game.camera.x;
  f.scene.changeRoom(1, 2);
  assert.equal(f.scene.game.camera.x, before);
  assert.equal(f.scene.currentCameraRoom, 1);
  f.position(330, 2);
  f.scene.changeRoom(2, 0);
  assert.equal(f.scene.game.camera.x, before);
  assert.equal(f.scene.currentCameraRoom, 2);
  assert.equal(f.scene.currentRoom, 2);
  assert.equal(f.scene.kid.flee, false);
  assert.deepEqual(f.opponents, [1, 1, 2]);
  f.scene.updateCamera(1 / 60);
  assert.ok(f.scene.game.camera.x > before);
});

test("travel across multiple rooms and back never resets the horizontal camera", () => {
  const f = fixture();
  f.scene.setupCamera(1);
  const walk = (from, to, direction) => {
    for (let x = from; direction > 0 ? x <= to : x >= to; x += 3 * direction) {
      const id = Math.min(3, Math.floor(x / 320) + 1);
      const before = f.scene.game.camera.x;
      f.position(x, id, direction);
      f.scene.changeRoom(id, 0);
      assert.equal(f.scene.game.camera.x, before);
      f.scene.updateCamera(1 / 60);
      assert.ok(Math.abs(f.scene.game.camera.x - before) < 50);
      assert.ok(direction * (f.scene.game.camera.x - before) >= 0);
    }
  };
  walk(160, 890, 1);
  assert.ok(f.camera.x > 580);
  f.advance(1);
  walk(890, 40, -1);
  f.advance(1);
  assert.equal(f.scene.game.camera.x, -64);
});

test("camera limits follow connected rooms rather than the full map or rooms beyond a hole", () => {
  const f = fixture();
  f.scene.setupCamera(1);
  f.position(1500, 3);
  f.camera.setRoom(3);
  f.advance(2);
  assert.equal(f.scene.game.camera.x, 960);
  assert.equal(containsRoom(f, 3), true);
  assert.equal(f.camera.isRoomVisible(6), false);
  f.position(-100, 1);
  f.camera.setRoom(1);
  f.advance(2);
  assert.equal(f.scene.game.camera.x, -64);
  f.position(1450, 6);
  f.scene.changeRoom(6);
  assert.equal(f.scene.game.camera.x, 1984);
  f.advance(1);
  assert.equal(f.scene.game.camera.x, 1984);
  assert.equal(containsRoom(f, 6), true);
  assert.deepEqual(Array.from(f.camera.visibleRooms()), [6]);
});

test("vertical room transitions cut immediately both down and up", () => {
  const f = fixture();
  f.scene.setupCamera(1);
  f.position(310);
  f.advance(0.3);
  assert.ok(f.camera.x > -40);
  f.position(310, 4);
  f.scene.changeRoom(4);
  assert.equal(f.scene.game.camera.x, -64);
  assert.equal(f.scene.game.camera.y, cameraY(f, 1));
  f.scene.updateCamera(1 / 60);
  assert.equal(f.scene.game.camera.y, cameraY(f, 1));
  f.position(310, 1);
  f.scene.changeRoom(1);
  assert.equal(f.scene.game.camera.x, -64);
  assert.equal(f.scene.game.camera.y, cameraY(f, 0));
});

test("a map opening camera override is honored before normal room travel resumes", () => {
  const f = fixture();
  f.scene.setupCamera(1, 4);
  assert.equal(f.scene.game.camera.y, cameraY(f, 1));
  f.advance(0.5);
  assert.equal(f.scene.game.camera.y, cameraY(f, 1));
  assert.equal(f.scene.game.camera.x, -64);
  f.position(160, 4);
  f.scene.changeRoom(4);
  assert.equal(f.scene.currentRoom, 4);
  assert.equal(f.scene.currentCameraRoom, 4);
  f.position(490, 5);
  f.scene.changeRoom(5, 0);
  assert.equal(f.scene.game.camera.x, -64);
  f.advance(0.2);
  assert.ok(f.scene.game.camera.x > -64);
});

test("damping is independent of rendering frame rate", () => {
  const positions = [30, 60, 120].map((fps) => {
    const f = fixture();
    f.scene.setupCamera(1);
    f.position(300);
    f.advance(0.5, fps);
    return f.camera.x;
  });
  assert.ok(Math.max(...positions) - Math.min(...positions) < 0.000001);
});

test("subpixel accumulation finishes slow camera movement despite Phaser's integer rounding", () => {
  const f = fixture();
  f.scene.setupCamera(1);
  f.position(241);
  f.scene.updateCamera(1 / 120);
  assert.equal(f.scene.game.camera.x, -64);
  f.advance(1, 120);
  assert.equal(f.scene.game.camera.x, -63);
  assert.ok(f.camera.x > -39.501);
});

test("pause-sized deltas cannot jump the camera and camera locks freeze it", () => {
  const f = fixture();
  f.scene.setupCamera(1);
  f.position(300);
  f.scene.updateCamera(0);
  assert.equal(f.camera.x, -40);
  f.scene.updateCamera(10);
  assert.ok(f.camera.x > -40 && f.camera.x < -25);
  const before = f.camera.x;
  f.scene.blockCamera = true;
  f.advance(1);
  f.scene.changeRoom(2);
  assert.equal(f.camera.x, before);
  assert.equal(f.scene.game.camera.y, cameraY(f, 0));
  f.scene.blockCamera = false;
  f.scene.kid.exists = false;
  f.advance(1);
  assert.equal(f.camera.x, before);
});

test("invalid room signals retain the normal out-of-map death behavior", () => {
  const f = fixture();
  f.scene.setupCamera(1);
  f.scene.changeRoom(-1);
  assert.equal(f.scene.outside, true);
  assert.equal(f.scene.game.camera.x, -64);
});

test("misaligned or cyclic links cannot make the camera reveal a disconnected map segment", () => {
  const f = fixture();
  f.rooms[3].links.right = 6;
  f.rooms[1].links.left = 3;
  f.scene.setupCamera(1);
  assert.deepEqual(Array.from(f.camera.rooms), [1, 2, 3]);
  assert.equal(f.camera.maxX, 600);
});

test("gate audio follows every partly visible room and is muted again when it leaves the view", () => {
  const f = fixture();
  f.scene.setupCamera(1);
  f.position(290);
  f.advance(0.2);
  assert.deepEqual(Array.from(f.gates.at(-1)[2]), [1, 2, 4, 5]);
  const count = f.gates.length;
  f.advance(0.2);
  assert.equal(f.gates.length, count);
  f.position(790, 3);
  f.scene.changeRoom(3);
  f.advance(1);
  assert.ok(!f.gates.at(-1)[2].includes(1));
  assert.ok(f.gates.at(-1)[2].includes(3));

  const gate = () => ({
    calls: [],
    isVisible(visible) {
      this.calls.push(visible);
    }
  });
  const first = gate();
  const second = gate();
  const edge = gate();
  const level = Object.assign(Object.create(f.PrinceJS.Level.prototype), {
    activeGates: [],
    getGatesAll: (id) => (id === 1 ? [first, edge] : [second, edge])
  });
  level.checkGates(1, null, [1, 2]);
  assert.equal(level.activeGates.length, 3);
  assert.deepEqual(edge.calls, [true]);
  level.checkGates(1, null, [1]);
  assert.equal(second.calls.at(-1), false);
  assert.equal(first.calls.at(-1), true);
});

test("choppers are audible in a visible neighbor without requiring a logical room change", () => {
  const f = fixture();
  f.scene.setupCamera(1);
  f.position(290);
  f.advance(0.2);
  const heard = [];
  for (const room of [1, 2, 3, 4]) {
    f.scene.handleChop({ room, chop: (audible) => heard.push(audible) });
  }
  assert.deepEqual(heard, [true, true, false, true]);
});

test("zoom frames the complete primary room with actual rooms visible above and below it", () => {
  const f = fixture();
  f.position(480, 5);
  f.scene.setupCamera(5);
  assert.equal(f.scene.game.world.scale.x, 1.6);
  assert.equal(f.scene.game.world.scale.y, 1.6);
  assert.equal(f.camera.viewWidth, 400);
  assert.equal(f.camera.viewHeight, 240);
  assert.equal(containsRoom(f, 5), true);
  assert.equal(f.camera.isRoomVisible(2), true);
  assert.equal(f.camera.isRoomVisible(7), true);
});

test("side previews never crop the primary room, even when the Prince stops at either exit", () => {
  const f = fixture();
  f.scene.setupCamera(2);
  for (const direction of [-1, 1]) {
    for (const localX of [0, 16, 50, 80, 160, 240, 270, 320, 336]) {
      f.position(320 + localX, 2, direction);
      f.advance(1);
      assert.equal(containsRoom(f, 2), true, "Room must fit at exit position " + localX);
    }
  }
});

test("entering the next room completes its full frame even when the Prince stops just inside", () => {
  const f = fixture();
  f.scene.setupCamera(1);
  f.position(330);
  f.advance(0.5);
  const before = f.scene.game.camera.x;
  f.position(336, 2);
  f.scene.changeRoom(2, 0);
  assert.equal(f.scene.game.camera.x, before);
  f.advance(0.6);
  assert.equal(f.scene.game.camera.x, 448);
  assert.equal(containsRoom(f, 2), true);
  f.advance(1);
  assert.equal(f.scene.game.camera.x, 448);
  f.position(310, 1, -1);
  f.scene.changeRoom(1, 0);
  f.advance(0.6);
  assert.equal(f.scene.game.camera.x, -64);
  assert.equal(containsRoom(f, 1), true);
});

test("reversing across an entrance during a pan stays continuous and frames the room returned to", () => {
  const f = fixture();
  f.scene.setupCamera(1);
  f.position(336, 2);
  f.scene.changeRoom(2);
  f.advance(0.2);
  const before = f.scene.game.camera.x;
  f.position(310, 1, -1);
  f.scene.changeRoom(1);
  assert.equal(f.scene.game.camera.x, before);
  f.scene.updateCamera(1 / 60);
  assert.ok(Math.abs(f.scene.game.camera.x - before) < 10);
  f.advance(0.6);
  assert.equal(containsRoom(f, 1), true);
});

test("leaving gameplay restores the original zoom and camera bounds for menus and cutscenes", () => {
  const f = fixture();
  const bounds = f.camera.originalBounds;
  assert.equal(f.scene.game.camera.bounds, null);
  f.camera.destroy();
  assert.equal(f.scene.game.world.scale.x, 2);
  assert.equal(f.scene.game.world.scale.y, 2);
  assert.equal(f.scene.game.camera.bounds, bounds);
  const nextCamera = new f.PrinceJS.RoomCamera(f.scene);
  assert.equal(f.scene.game.world.scale.x, 1.6);
  nextCamera.destroy();
  assert.equal(f.scene.game.world.scale.x, 2);
  assert.equal(f.scene.game.camera.bounds, bounds);
});
