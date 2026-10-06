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
      this.children = [];
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
    endFill() {}
    addChild(child) {
      this.children.push(child);
    }
    addChildAt(child, index) {
      this.children.splice(index, 0, child);
    }
    destroy() {
      this.destroyed = true;
      this.children.forEach((child) => child.destroy());
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
  for (const file of ["RangedWeapon", "MinigunEffects", "Minigun"]) {
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
    hasMinigun: true,
    minigunEquipped: true,
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
  const ctrlKey = { isDown: false };
  const delegate = { game, level, kid, weaponFireKey: key, weaponCtrlKey: ctrlKey, enemies: [], ui: { showText() {} } };
  const gun = new PrinceJS.Minigun(delegate, 1);
  gun.pickup.collected = gun.effects.collected = true;
  const advance = (frames) => {
    for (let frame = 0; frame < frames; frame++) {
      gun.update(1 / 60);
    }
  };
  return { gun, effects: gun.effects, kid, key, ctrlKey, advance };
}

test("an owned and selected idle gun stays hidden, including after collecting it", () => {
  const f = fixture();
  f.advance(40);
  assert.equal(f.effects.weapon.visible, false);
  assert.equal(f.effects.body.visible, false);
  assert.equal(f.effects.hands.visible, false);
  assert.equal(f.effects.getMuzzle().visible, false);
  f.effects.collected = f.gun.pickup.collected = false;
  f.effects.collect();
  f.advance(40);
  assert.equal(f.effects.ground.visible, false);
  assert.equal(f.effects.weapon.visible, false);
  assert.equal(f.effects.getMuzzle().visible, false);
});

test("the Prince reaches behind, pulls the gun forward, then grips and fires with both hands", () => {
  const f = fixture();
  f.key.isDown = true;
  f.advance(4);
  assert.equal(f.gun.actionStage, "drawing");
  assert.equal(f.kid.specialAction.owner, f.gun);
  assert.equal(f.kid.charFrame, 15);
  assert.equal(f.effects.body.visible, true);
  assert.equal(f.effects.weapon.visible, false, "the hand reaches back before the gun appears");
  const reachingHands = f.effects.hands.shapes.map((shape) => shape.x);
  assert.ok(Math.min(...reachingHands) < -10);
  f.advance(10);
  assert.equal(f.effects.weapon.visible, true);
  assert.ok(f.effects.weapon.rotation < 0);
  assert.equal(f.effects.getMuzzle().visible, false);
  assert.equal(f.effects.shots, 0);
  f.advance(13);
  assert.equal(f.gun.actionStage, "firing");
  assert.equal(f.effects.weapon.rotation, 0);
  assert.equal(f.effects.getMuzzle().visible, true);
  assert.equal(f.effects.shots, 1);
  const hands = f.effects.hands.shapes;
  assert.ok(
    hands.some((shape) => shape.x === -1),
    "trigger hand rests at the receiver"
  );
  assert.ok(
    hands.some((shape) => shape.x === 8),
    "support hand holds the front grip"
  );
  assert.ok(
    f.effects.hands.shapes.some((shape) => shape.y === -36 && shape.width === 2 && shape.height === 1),
    "the clenched smile stays within two native pixels"
  );
  assert.equal(f.effects.head.atlas, "kid");
  assert.equal(f.effects.head.frameName, "kid-15");
  assert.equal(f.effects.head.cropRect.height, 7, "the original hair and face are preserved at native size");
  assert.equal(f.kid.cropRect, f.effects.bodyCrop, "the relaxed native arms are replaced during firing");
  assert.notEqual(f.kid.tint, 0xffffff, "yellow muzzle light illuminates the original Prince sprite");
  assert.ok(f.effects.light.shapes.some((shape) => shape.type === "circle"));
  assert.equal(f.effects.casings.length, 3);
});

test("release stops firing immediately, keeps the Prince locked while stowing, then restores the full sprite", () => {
  const f = fixture();
  f.key.isDown = true;
  f.advance(30);
  assert.ok(f.effects.casings.length >= 3);
  const shells = f.effects.casings.length;
  f.key.isDown = false;
  f.advance(1);
  assert.equal(f.gun.actionStage, "holstering");
  assert.equal(f.kid.specialAction.owner, f.gun);
  assert.equal(f.effects.weapon.visible, true);
  assert.equal(f.effects.getMuzzle().visible, false);
  const shots = f.effects.shots;
  assert.equal(f.effects.flash.shapes.length, 0);
  assert.equal(f.effects.light.shapes.length, 0);
  assert.equal(f.kid.tint, 0xffffff);
  assert.equal(f.kid.cropRect, f.effects.bodyCrop);
  f.advance(7);
  assert.equal(f.gun.actionStage, "holstering");
  assert.ok(f.effects.weapon.rotation < 0, "the gun tilts back toward its holster");
  assert.equal(f.effects.shots, shots);
  f.advance(12);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.effects.weapon.visible, false);
  assert.equal(f.effects.body.visible, false);
  assert.equal(f.effects.hands.visible, false);
  assert.equal(f.kid.cropRect, null);
  assert.equal(f.effects.head.visible, false);
  f.advance(180);
  assert.equal(f.effects.casings.length, shells);
  assert.equal(f.effects.activeCasings.length, 0);
});

test("the draw and two-handed firing pose mirror correctly and remain grounded when crouched", () => {
  for (const direction of [1, -1]) {
    const f = fixture(direction, "crawl");
    f.key.isDown = true;
    f.advance(30);
    assert.equal(f.kid.action, "stoop");
    assert.equal(f.kid.charFrame, 109);
    assert.equal(f.effects.weapon.scale.x, direction);
    assert.equal(f.effects.body.scale.x, direction);
    assert.equal(f.effects.hands.scale.x, direction);
    assert.equal(f.effects.head.scale.x, -direction);
    assert.equal(f.effects.getMuzzle().direction, direction);
    assert.equal(f.effects.getMuzzle().y, 106);
    assert.ok(f.effects.body.shapes.every((shape) => shape.y >= -20));
    assert.equal(f.kid.charX, 56);
    assert.equal(f.kid.charY, 116);
  }
});

test("an interrupted action and shutdown clear the animated pose and its temporary lighting", () => {
  for (const interrupt of ["hurt", "inactive", "destroy"]) {
    const f = fixture();
    f.key.isDown = true;
    f.advance(27);
    assert.notEqual(f.kid.tint, 0xffffff);
    if (interrupt === "destroy") {
      f.gun.destroy();
      assert.equal(f.effects.body.destroyed, true);
      assert.equal(f.effects.hands.destroyed, true);
    } else {
      if (interrupt === "hurt") {
        f.kid.action = "stabbed";
      } else {
        f.kid.active = false;
      }
      f.advance(1);
      assert.equal(f.effects.weapon.visible, false);
      assert.equal(f.effects.body.visible, false);
    }
    assert.equal(f.kid.specialAction, null);
    assert.equal(f.kid.tint, 0xffffff);
    assert.equal(f.kid.cropRect, null);
  }
});

test("Ctrl draws and fires directly, while Shift leaves the Prince free for slow steps and ledges", () => {
  const f = fixture();
  f.kid.keyS = () => true;
  f.advance(35);
  assert.equal(f.gun.actionStage, "hidden");
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.effects.shots, 0);
  f.ctrlKey.isDown = true;
  f.advance(35);
  assert.equal(f.gun.actionStage, "firing");
  assert.ok(f.effects.shots > 0);
  f.ctrlKey.isDown = false;
  f.advance(1);
  assert.equal(f.kid.specialAction.owner, f.gun);
  f.advance(19);
  assert.equal(f.kid.specialAction, null);
});

test("a new trigger press waits for stowing to finish and then performs a complete new draw", () => {
  const f = fixture();
  f.key.isDown = true;
  f.advance(30);
  f.key.isDown = false;
  f.advance(1);
  const shots = f.effects.shots;
  f.key.isDown = true;
  f.advance(18);
  assert.equal(f.gun.actionStage, "holstering");
  assert.equal(f.effects.shots, shots);
  f.advance(1);
  assert.equal(f.gun.actionStage, "hidden");
  f.advance(1);
  assert.equal(f.gun.actionStage, "drawing");
  f.advance(24);
  assert.equal(f.effects.shots, shots);
  f.advance(2);
  assert.equal(f.gun.actionStage, "firing");
  assert.ok(f.effects.shots > shots);
});

test("stowing mirrors in both directions and crouched poses, and injury, death or shutdown interrupt it safely", () => {
  for (const direction of [1, -1]) {
    for (const action of ["stand", "stoop"]) {
      const f = fixture(direction, action);
      f.key.isDown = true;
      f.advance(30);
      f.key.isDown = false;
      f.advance(10);
      assert.equal(f.gun.actionStage, "holstering");
      assert.equal(f.effects.weapon.scale.x, direction);
      assert.ok(f.effects.weapon.rotation * direction < 0);
      assert.equal(f.kid.charX, 56);
      assert.equal(f.kid.charY, 116);
      f.advance(10);
      assert.equal(f.kid.specialAction, null);
      assert.equal(f.kid.cropRect, null);
    }
  }
  for (const interruption of ["stabbed", "death", "destroy"]) {
    const f = fixture();
    f.key.isDown = true;
    f.advance(30);
    f.key.isDown = false;
    f.advance(1);
    if (interruption === "destroy") {
      f.gun.destroy();
    } else {
      f.kid.action = interruption === "death" ? "dropdead" : interruption;
      f.kid.alive = interruption !== "death";
      f.advance(1);
      assert.equal(f.kid.action, interruption === "death" ? "dropdead" : interruption);
    }
    assert.equal(f.kid.specialAction, null);
    assert.equal(f.kid.cropRect, null);
    assert.equal(f.effects.weapon.visible, false);
    assert.equal(f.gun.actionStage, "hidden");
  }
});
