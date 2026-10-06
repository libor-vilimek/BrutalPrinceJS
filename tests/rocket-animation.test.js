"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture(direction = 1, action = "stand") {
  class Graphics {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.scale = { x: 1, y: 1 };
      this.shapes = [];
    }
    clear() {
      this.shapes = [];
    }
    beginFill(color, alpha) {
      this.color = color;
      this.alpha = alpha;
    }
    drawRect(x, y, width, height) {
      this.shapes.push({ type: "rect", color: this.color, alpha: this.alpha, x, y, width, height });
    }
    drawCircle(x, y, diameter) {
      this.shapes.push({ type: "circle", color: this.color, x, y, diameter });
    }
    drawPolygon(points) {
      this.shapes.push({ type: "polygon", color: this.color, points });
    }
    lineStyle() {}
    endFill() {}
    destroy() {
      this.destroyed = true;
    }
  }
  const PrinceJS = {
    ROOM_WIDTH: 320,
    ROOM_HEIGHT: 189,
    BLOCK_WIDTH: 32,
    BLOCK_HEIGHT: 63,
    Level: { TILE_WALL: 20 },
    Utils: { convertX: (x) => Math.floor((x * 320) / 140), convertBlockYtoY: (y) => (y + 1) * 63 - 10 }
  };
  const context = vm.createContext({
    PrinceJS,
    Phaser: {
      Rectangle: function (x, y, width, height) {
        Object.assign(this, { x, y, width, height });
      }
    }
  });
  for (const file of [
    "PrincePose",
    "RangedWeapon",
    "RocketLauncherEffects",
    "RocketLauncherAction",
    "RocketLauncher"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file + ".js"), "utf8"), context);
  }
  const tiles = Array.from({ length: 30 }, () => ({
    element: 1,
    isWalkable: () => true,
    isSafeWalkable: () => true,
    isBarrier: () => false
  }));
  const level = {
    rooms: { 1: { x: 0, y: 0, links: { left: -1, right: -1 }, tiles } },
    getTileAt: (x, y) => (x >= 0 && x < 10 && y >= 0 && y < 3 ? tiles[y * 10 + x] : level.dummyWall),
    dummyWall: { element: 20, isBarrier: () => true }
  };
  const key = { isDown: false };
  const ctrlKey = { isDown: false };
  const kid = {
    level,
    room: 1,
    baseX: 0,
    baseY: 3,
    charX: 56,
    charY: 116,
    charBlockX: 4,
    charBlockY: 1,
    charFace: direction,
    action,
    alive: true,
    active: true,
    visible: true,
    tint: 0xffffff,
    sword: { visible: false },
    hasRocketLauncher: true,
    rocketLauncherEquipped: true,
    specialAction: null,
    keyS: () => false,
    keyWeaponAction: () => false,
    crop(rect) {
      this.cropRect = rect;
    },
    beginSpecialAction(owner, type) {
      if (this.specialAction || !this.alive || !this.active || !this.visible) {
        return false;
      }
      this.specialAction = { owner, type };
      this.charXVel = this.charYVel = 0;
      return true;
    },
    endSpecialAction(owner) {
      if (this.specialAction && this.specialAction.owner === owner) {
        this.specialAction = null;
      }
    },
    setSpecialActionFrame(frame) {
      this.charFrame = frame;
    }
  };
  const game = {
    add: {
      graphics: (x, y) => new Graphics(x, y),
      sprite(x, y, atlas, frameName) {
        return {
          x,
          y,
          atlas,
          frameName,
          scale: { x: 1 },
          anchor: { setTo() {} },
          crop(rect) {
            this.cropRect = rect;
          },
          destroy() {
            this.destroyed = true;
          }
        };
      }
    },
    sound: { play() {} }
  };
  const delegate = { game, level, kid, weaponFireKey: key, weaponCtrlKey: ctrlKey, enemies: [], ui: { showText() {} } };
  const launcher = new PrinceJS.RocketLauncher(delegate, 1);
  launcher.pickup.collected = launcher.effects.collected = true;
  const advance = (frames) => {
    for (let frame = 0; frame < frames; frame++) {
      launcher.update(1 / 60);
    }
  };
  return { launcher, effects: launcher.effects, kid, key, ctrlKey, advance };
}

test("the collected launcher stays hidden until the trigger is held", () => {
  const f = fixture();
  f.advance(45);
  assert.equal(f.launcher.actionStage, "hidden");
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.effects.weapon.visible, false);
  assert.equal(f.effects.head.visible, false);
  assert.equal(f.effects.getMuzzle().visible, false);
  f.effects.collected = f.launcher.pickup.collected = false;
  f.effects.collect();
  f.advance(45);
  assert.equal(f.effects.weapon.visible, false, "collecting a launcher does not display it in idle");
});

test("drawing locks the Prince, reaches back first, and then joins both hands to the raised launcher", () => {
  const f = fixture();
  f.ctrlKey.isDown = true;
  f.advance(4);
  assert.equal(f.kid.specialAction.owner, f.launcher);
  assert.equal(f.kid.specialAction.type, "rocketLauncher");
  assert.equal(f.kid.charFrame, 15);
  assert.equal(f.launcher.actionStage, "drawing");
  assert.equal(f.effects.weapon.visible, false);
  assert.equal(f.effects.shots, 0);
  f.advance(10);
  assert.equal(f.effects.weapon.visible, true);
  assert.ok(f.effects.weapon.rotation < 0);
  assert.equal(f.effects.getMuzzle().visible, false);
  f.advance(14);
  assert.equal(f.launcher.actionStage, "firing");
  assert.equal(f.effects.shots, 1);
  assert.equal(f.effects.weapon.rotation, 0);
  assert.equal(f.effects.getMuzzle().visible, true);
  assert.ok(
    f.effects.hands.shapes.some((shape) => shape.x === -2 && shape.y === -22),
    "the rear hand grips the trigger"
  );
  assert.ok(
    f.effects.hands.shapes.some((shape) => shape.x === 6 && shape.y === -23),
    "the other hand supports the tube"
  );
  assert.ok(
    f.effects.hands.shapes.some((shape) => shape.y === -36 && shape.width === 2 && shape.height === 1),
    "the expression stays within the original small face"
  );
  assert.equal(f.effects.head.atlas, "kid");
  assert.equal(f.effects.head.frameName, "kid-15");
  assert.equal(f.effects.head.cropRect.width, 12);
  assert.equal(f.effects.head.cropRect.height, 9, "native hair, head and neckline dimensions are preserved");
  assert.equal(f.kid.cropRect, f.effects.bodyCrop, "the replacement arms leave the original legs intact");
  assert.notEqual(f.kid.tint, 0xffffff);
  assert.equal(f.effects.head.tint, f.kid.tint);
  assert.ok(f.effects.fire.shapes.some((shape) => shape.type === "polygon"));
  assert.equal(f.kid.charX, 56);
  assert.equal(f.kid.charY, 116);
});

test("releasing stops new rockets and retains the lock until stowing restores the native sprite", () => {
  const f = fixture();
  f.key.isDown = true;
  f.advance(29);
  const rocket = f.launcher.bullets[0];
  const previousX = rocket.x;
  const shots = f.effects.shots;
  f.key.isDown = false;
  f.advance(1);
  assert.equal(f.launcher.actionStage, "holstering");
  assert.equal(f.kid.specialAction.owner, f.launcher);
  assert.equal(f.effects.getMuzzle().visible, false);
  assert.equal(f.effects.weapon.visible, true);
  assert.equal(f.kid.tint, 0xffffff);
  assert.ok(rocket.x > previousX, "a rocket already launched keeps flying during stowing");
  f.advance(8);
  assert.ok(f.effects.weapon.rotation < 0, "the tube rotates back over the shoulder");
  assert.equal(f.effects.shots, shots);
  assert.equal(f.kid.cropRect, f.effects.bodyCrop);
  assert.equal(f.launcher.equip(), false, "weapon selection cannot bypass the stow sequence");
  f.launcher.toggleEquipped();
  assert.equal(f.kid.rocketLauncherEquipped, true);
  f.advance(12);
  assert.equal(f.launcher.actionStage, "hidden");
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.effects.weapon.visible, false);
  assert.equal(f.effects.body.visible, false);
  assert.equal(f.effects.hands.visible, false);
  assert.equal(f.effects.head.visible, false);
  assert.equal(f.kid.cropRect, null);
});

test("a brief trigger tap stows the partially drawn launcher without launching a rocket", () => {
  const f = fixture();
  f.key.isDown = true;
  f.advance(4);
  f.key.isDown = false;
  f.advance(1);
  assert.equal(f.launcher.actionStage, "holstering");
  assert.equal(f.effects.weapon.visible, false);
  f.advance(4);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.launcher.actionStage, "hidden");
  assert.equal(f.effects.shots, 0);
});

test("a renewed trigger waits for stowing and a full new draw while Shift never draws a weapon", () => {
  const f = fixture();
  f.kid.keyS = () => true;
  f.advance(35);
  assert.equal(f.launcher.actionStage, "hidden");
  f.ctrlKey.isDown = true;
  f.advance(29);
  f.ctrlKey.isDown = false;
  f.advance(1);
  const shots = f.effects.shots;
  f.ctrlKey.isDown = true;
  f.advance(19);
  assert.equal(f.launcher.actionStage, "holstering");
  assert.equal(f.effects.shots, shots);
  f.advance(1);
  assert.equal(f.launcher.actionStage, "hidden");
  f.advance(1);
  assert.equal(f.launcher.actionStage, "drawing");
  f.advance(26);
  assert.equal(f.effects.shots, shots);
  f.advance(1);
  assert.equal(f.launcher.actionStage, "firing");
  assert.ok(f.effects.shots > shots);
});

test("the planted pose and shoulder stow mirror in both directions and work while crouched", () => {
  for (const direction of [1, -1]) {
    for (const action of ["stand", "crawl"]) {
      const f = fixture(direction, action);
      f.key.isDown = true;
      f.advance(29);
      assert.equal(f.kid.charFrame, action === "crawl" ? 109 : 15);
      assert.equal(f.effects.weapon.scale.x, direction);
      assert.equal(f.effects.body.scale.x, direction);
      assert.equal(f.effects.hands.scale.x, direction);
      assert.equal(f.effects.head.scale.x, -direction);
      assert.equal(f.effects.getMuzzle().direction, direction);
      assert.equal(f.effects.getMuzzle().y, action === "crawl" ? 106 : 91);
      f.key.isDown = false;
      f.advance(10);
      assert.equal(f.launcher.actionStage, "holstering");
      assert.ok(f.effects.weapon.rotation * direction < 0);
      assert.equal(f.kid.charX, 56);
      assert.equal(f.kid.charY, 116);
      f.advance(11);
      assert.equal(f.kid.specialAction, null);
      assert.equal(f.kid.cropRect, null);
    }
  }
});

test("injury, death, foreign action ownership and shutdown safely restore the native body and light", () => {
  for (const interruption of ["stabbed", "death", "foreign", "destroy"]) {
    const f = fixture();
    f.key.isDown = true;
    f.advance(28);
    assert.notEqual(f.kid.tint, 0xffffff);
    if (interruption === "destroy") {
      f.launcher.destroy();
      assert.equal(f.effects.head.destroyed, true);
      assert.equal(f.effects.body.destroyed, true);
      assert.equal(f.effects.hands.destroyed, true);
    } else {
      if (interruption === "foreign") {
        f.kid.specialAction = { owner: {}, type: "jetpack" };
      } else {
        f.kid.action = interruption === "death" ? "dropdead" : interruption;
        f.kid.alive = interruption !== "death";
      }
      f.advance(1);
      assert.equal(f.effects.weapon.visible, false);
      assert.equal(f.effects.head.visible, false);
    }
    assert.equal(f.launcher.actionStage, "hidden");
    assert.equal(f.kid.tint, 0xffffff);
    assert.equal(f.kid.cropRect, null);
    if (interruption === "foreign") {
      assert.equal(f.kid.specialAction.type, "jetpack", "a different controller keeps its action");
    } else {
      assert.equal(f.kid.specialAction, null);
    }
  }
});
