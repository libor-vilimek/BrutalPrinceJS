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
      Sprite: function () {},
      Rectangle: function (x, y, width, height) {
        Object.assign(this, { x, y, width, height });
      },
      Keyboard: { F: 70, CONTROL: 17 }
    }
  });
  for (const file of [
    "Utils",
    "Actor",
    "Fighter",
    "Level",
    "tiles/Base",
    "tiles/Gate",
    "RangedWeapon",
    "Minigun",
    "RocketLauncher"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file + ".js"), "utf8"), context);
  }
  const graphics = { clear() {}, beginFill() {}, drawRect() {}, endFill() {}, destroy() {} };
  const key = { isDown: false, onDown: { add() {}, remove() {} } };
  const game = {
    add: { graphics: () => graphics },
    input: { keyboard: { addKey: () => key, removeKey() {} } },
    sound: { play() {} }
  };
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
  for (let room = 1; room <= 2; room++) {
    level.rooms[room] = { x: room - 1, y: 0, links: { left: room - 1, right: room < 2 ? room + 1 : -1 }, tiles: [] };
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 10; x++) {
        setTile(room, x, y, 1);
      }
    }
  }
  const kid = {
    room: 1,
    baseX: 0,
    baseY: 3,
    charBlockX: 1,
    charBlockY: 1,
    charX: 21,
    charY: 116,
    charFace: 1,
    alive: true,
    visible: true,
    active: true,
    action: "stand",
    specialAction: null,
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
    },
    sword: {},
    keyS: () => false
  };
  PrinceJS.MinigunEffects = function () {
    this.shots = 0;
    this.impacts = 0;
    this.update = () => {};
    this.collect = () => {};
    this.setAction = (stage, progress) => {
      this.actionStage = stage;
      this.drawProgress = progress;
    };
    this.destroy = () => {};
    this.shot = () => this.shots++;
    this.impact = () => this.impacts++;
    this.explode = () => this.impacts++;
    this.getMuzzle = () => ({
      x: kid.baseX + PrinceJS.Utils.convertX(kid.charX) + 25 * kid.charFace,
      y: kid.baseY + kid.charY - 24,
      direction: kid.charFace,
      visible: true
    });
  };
  PrinceJS.RocketLauncherEffects = PrinceJS.MinigunEffects;
  const delegate = { game, level, kid, weaponFireKey: key, enemies: [], ui: { showText() {}, setOpponentLive() {} } };
  const gun = new PrinceJS.Minigun(delegate, 1);
  const enemy = (x, room = 1, y = 95) => {
    const target = Object.assign(Object.create(PrinceJS.Fighter.prototype), {
      room,
      baseX: level.rooms[room].x * 320,
      baseY: 3,
      health: 3,
      alive: true,
      active: true,
      visible: true,
      charFrame: 16,
      charName: "guard-1",
      onDamageLife: {
        dispatch: (n) => {
          target.damage += n;
        }
      },
      damage: 0,
      showSplash() {},
      hideSplash() {},
      bringAboveOpponent() {},
      getCharBounds: () => ({ x: x - level.rooms[room].x * 320, y: y - 20 - 3, width: 18, height: 42 })
    });
    delegate.enemies.push(target);
    return target;
  };
  const bullet = (x = 60, direction = 1, room = 1, y = 95) => ({ x, y, direction, room, life: 1.25 });
  return { PrinceJS, game, kid, level, delegate, gun, key, enemy, bullet, setTile };
}

test("level 1 pickup sits beside the actual landing, and requires proximity on the same floor", () => {
  const f = fixture();
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/maps/level1.json"), "utf8"));
  map.room
    .find((room) => room.id === map.prince.room)
    .tile.forEach((tile, i) => f.setTile(1, i % 10, Math.floor(i / 10), tile.element));
  f.kid.charBlockY = 0;
  const pickup = f.gun.findPickup(1);
  assert.equal(pickup.worldX, 80);
  assert.equal(pickup.worldY, 119);
  f.gun.pickup = pickup;
  f.kid.charX = 35;
  f.kid.charY = 53;
  f.gun.checkPickup();
  assert.equal(pickup.collected, false);
  f.kid.charY = 116;
  f.kid.inFallDown = true;
  f.gun.checkPickup();
  assert.equal(pickup.collected, false);
  f.kid.inFallDown = false;
  f.gun.checkPickup();
  assert.equal(pickup.collected, true);
  assert.equal(f.kid.hasMinigun, true);
  assert.equal(f.gun.canFire(), false);
});

test("a pickup at a doorway works while the Prince still belongs to the adjacent room", () => {
  const f = fixture();
  f.gun.pickup.worldX = 336;
  f.gun.pickup.room = 2;
  f.kid.room = 1;
  f.kid.baseX = 0;
  f.kid.charX = 147;
  f.gun.checkPickup();
  assert.equal(f.kid.hasMinigun, true);
});

test("swept bullets damage and kill the nearest guard through the existing health/death system", () => {
  const f = fixture();
  const first = f.enemy(105);
  const second = f.enemy(170);
  for (let i = 0; i < 3; i++) {
    assert.equal(f.gun.advanceBullet(f.bullet(), 200), false);
  }
  assert.equal(first.health, 0);
  assert.equal(first.alive, false);
  assert.equal(first.action, "dropdead");
  assert.equal(first.damage, 3);
  assert.equal(second.health, 3);
  f.gun.advanceBullet(f.bullet(), 200);
  assert.equal(second.health, 2);
});

test("left-facing bullets hit targets without damaging guards behind the shooter or on other floors", () => {
  const f = fixture();
  const left = f.enemy(90);
  const behind = f.enemy(200);
  const below = f.enemy(125, 1, 158);
  f.gun.advanceBullet(f.bullet(180, -1), 160);
  assert.equal(left.health, 2);
  assert.equal(behind.health, 3);
  assert.equal(below.health, 3);
});

test("walls and four-pixel gates stop even a full-room sweep, but raised gates let bullets through", () => {
  const f = fixture();
  const guard = f.enemy(190);
  f.setTile(1, 3, 1, 20);
  f.gun.advanceBullet(f.bullet(), 250);
  assert.equal(guard.health, 3);
  f.setTile(1, 3, 1, 4, 0);
  f.gun.advanceBullet(f.bullet(), 250);
  assert.equal(guard.health, 3);
  f.setTile(1, 3, 1, 4, -47);
  f.gun.advanceBullet(f.bullet(), 250);
  assert.equal(guard.health, 2);
});

test("bullets travel through connected rooms and stop at an unlinked room boundary", () => {
  const f = fixture();
  const guard = f.enemy(355, 2);
  f.gun.advanceBullet(f.bullet(300), 90);
  assert.equal(guard.health, 2);
  f.level.rooms[1].links.right = -1;
  f.gun.advanceBullet(f.bullet(300), 90);
  assert.equal(guard.health, 2);
});

test("a barrel protruding through a wall cannot spawn a bullet beyond the wall", () => {
  const f = fixture();
  f.kid.charX = 40; // Body at 91px, muzzle beyond the wall at 96px.
  f.setTile(1, 3, 1, 20);
  const guard = f.enemy(135);
  f.gun.fire(f.gun.effects.getMuzzle());
  assert.equal(f.gun.bullets.length, 0);
  assert.equal(guard.health, 3);
});

test("held minigun fire draws first, locks a planted stance, then fires until released or interrupted", () => {
  const f = fixture();
  f.key.isDown = true;
  f.gun.update(1 / 60);
  assert.equal(f.gun.effects.shots, 0);
  f.kid.hasMinigun = true;
  f.kid.minigunEquipped = true;
  f.gun.pickup.collected = true;
  f.kid.action = "running";
  f.kid.charXVel = 5;
  f.gun.update(1 / 60);
  assert.equal(f.gun.actionStage, "drawing");
  assert.equal(f.kid.specialAction.owner, f.gun);
  assert.equal(f.kid.specialAction.type, "minigun");
  assert.equal(f.kid.action, "stand");
  assert.equal(f.kid.charXVel, 0);
  for (let i = 0; i < 24; i++) {
    f.gun.update(1 / 60);
  }
  assert.equal(f.gun.effects.shots, 0, "the barrel cannot fire during the draw sequence");
  for (let i = 0; i < 35; i++) {
    f.gun.update(1 / 60);
  }
  assert.equal(f.gun.actionStage, "firing");
  assert.ok(f.gun.effects.shots >= 8 && f.gun.effects.shots <= 10);
  const shots = f.gun.effects.shots;
  f.key.isDown = false;
  f.gun.update(0.05);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.gun.actionStage, "hidden");
  f.key.isDown = true;
  f.kid.action = "climbup";
  f.gun.update(0.05);
  f.kid.action = "stand";
  f.kid.alive = false;
  f.gun.update(0.05);
  assert.equal(f.gun.effects.shots, shots);
});

test("letting go during the draw cancels without a shot, and a new press draws again", () => {
  const f = fixture();
  f.kid.hasMinigun = f.kid.minigunEquipped = f.gun.pickup.collected = true;
  f.key.isDown = true;
  for (let i = 0; i < 5; i++) {
    f.gun.update(0.05);
  }
  f.key.isDown = false;
  f.gun.update(0.05);
  assert.equal(f.gun.effects.shots, 0);
  assert.equal(f.gun.actionStage, "hidden");
  assert.equal(f.kid.specialAction, null);
  f.key.isDown = true;
  f.gun.update(0.05);
  assert.equal(f.gun.actionStage, "drawing");
  assert.equal(f.gun.drawElapsed, 0.05);
});

test("switches, damage, death, and destruction release the minigun movement lock", () => {
  for (const interrupt of ["switch", "hurt", "death", "destroy"]) {
    const f = fixture();
    f.kid.hasMinigun = f.kid.minigunEquipped = f.gun.pickup.collected = true;
    f.key.isDown = true;
    f.gun.update(0.05);
    assert.equal(f.kid.specialAction.owner, f.gun);
    if (interrupt === "switch") {
      const rocket = new f.PrinceJS.RocketLauncher(f.delegate, -1);
      f.delegate.weapons = [f.gun, rocket];
      f.kid.hasRocketLauncher = true;
      rocket.equip();
      assert.equal(f.kid.rocketLauncherEquipped, true);
      assert.equal(f.kid.minigunEquipped, false);
    } else if (interrupt === "hurt") {
      f.kid.action = "stabbed";
      f.gun.update(0.05);
      assert.equal(f.kid.action, "stabbed");
    } else if (interrupt === "death") {
      f.kid.alive = false;
      f.kid.action = "dropdead";
      f.gun.update(0.05);
      assert.equal(f.kid.action, "dropdead");
    } else {
      f.gun.destroy();
    }
    assert.equal(f.kid.specialAction, null, interrupt);
    assert.equal(f.gun.actionStage, "hidden", interrupt);
    assert.equal(f.gun.firing, false, interrupt);
  }
});

test("other special actions block shooting, Ctrl, pickups, and weapon selection", () => {
  const f = fixture();
  f.kid.hasMinigun = f.kid.minigunEquipped = true;
  const owner = {};
  f.kid.specialAction = { owner, type: "jetpack" };
  f.key.isDown = true;
  f.gun.update(0.05);
  assert.equal(f.gun.canFire(), false);
  assert.equal(f.gun.actionStage, "hidden");
  f.gun.toggleEquipped();
  assert.equal(f.kid.minigunEquipped, true);
  f.kid.minigunEquipped = false;
  assert.equal(f.gun.equip(), false);
  assert.equal(f.kid.minigunEquipped, false);
  assert.equal(f.kid.specialAction.owner, owner);
  f.gun.pickup.worldX = f.PrinceJS.Utils.convertX(f.kid.charX);
  f.gun.pickup.worldY = f.kid.baseY + f.kid.charY;
  f.gun.checkPickup();
  assert.equal(f.gun.pickup.collected, false);
});

test("action fire preserves potion interactions, and hidden/inactive guards are not hit", () => {
  const f = fixture();
  f.kid.keyS = () => true;
  assert.equal(f.gun.triggerDown(), true);
  f.setTile(1, 2, 1, 10);
  assert.equal(f.gun.triggerDown(), false);
  f.key.isDown = true;
  assert.equal(f.gun.triggerDown(), true);
  const hidden = f.enemy(100);
  hidden.visible = false;
  const inactive = f.enemy(140);
  inactive.active = false;
  f.gun.advanceBullet(f.bullet(), 200);
  assert.equal(hidden.health, 3);
  assert.equal(inactive.health, 3);
});

test("Ctrl holsters and re-equips an owned minigun, preventing hidden fire and clearing stale combat stance", () => {
  const f = fixture();
  f.gun.toggleEquipped();
  assert.equal(f.kid.minigunEquipped, undefined);
  f.kid.hasMinigun = true;
  f.kid.minigunEquipped = true;
  f.gun.pickup.collected = true;
  f.key.isDown = true;
  f.gun.toggleEquipped();
  assert.equal(f.kid.hasMinigun, true);
  assert.equal(f.kid.minigunEquipped, false);
  for (let i = 0; i < 20; i++) {
    f.gun.update(0.05);
  }
  assert.equal(f.gun.effects.shots, 0);
  assert.equal(f.gun.pickup.collected, true);
  f.kid.swordDrawn = true;
  f.kid.action = "engarde";
  f.gun.toggleEquipped();
  assert.equal(f.kid.minigunEquipped, true);
  assert.equal(f.kid.swordDrawn, false);
  assert.equal(f.kid.action, "stand");
  for (let i = 0; i < 20; i++) {
    f.gun.update(0.05);
  }
  assert.ok(f.gun.effects.shots > 0);
});

test("switching between collected weapons draws exactly one, with Ctrl preserving the selected inventory", () => {
  const f = fixture();
  const launcher = new f.PrinceJS.RocketLauncher(f.delegate, -1);
  f.delegate.weapons = [f.gun, launcher];
  f.kid.hasMinigun = true;
  f.kid.hasRocketLauncher = true;
  f.gun.equip();
  assert.equal(f.kid.minigunEquipped, true);
  assert.equal(f.kid.rocketLauncherEquipped, false);
  launcher.equip();
  assert.equal(f.kid.minigunEquipped, false);
  assert.equal(f.kid.rocketLauncherEquipped, true);
  assert.equal(f.kid.activeWeapon, "rocketLauncher");
  launcher.toggleEquipped();
  assert.equal(f.kid.rocketLauncherEquipped, false);
  assert.equal(f.kid.hasRocketLauncher, true);
});

test("rockets explode on impact and kill a directly hit guard", () => {
  const f = fixture();
  const launcher = new f.PrinceJS.RocketLauncher(f.delegate, -1);
  const guard = f.enemy(130);
  assert.equal(launcher.advanceBullet(f.bullet(), 200), false);
  assert.equal(launcher.effects.impacts, 1);
  assert.equal(guard.health, 0);
  assert.equal(guard.alive, false);
});

test("rocket splash hurts nearby guards, falls off with distance, and cannot penetrate walls", () => {
  const f = fixture();
  const launcher = new f.PrinceJS.RocketLauncher(f.delegate, -1);
  const close = f.enemy(118);
  const outer = f.enemy(163);
  const far = f.enemy(230);
  launcher.impact(f.bullet(120));
  assert.equal(close.health, 0);
  assert.equal(outer.health, 1);
  assert.equal(far.health, 3);
  f.setTile(1, 4, 1, 20);
  const shielded = f.enemy(165);
  launcher.impact(f.bullet(120));
  assert.equal(shielded.health, 3);
});

test("expired rockets detonate and stop existing as projectiles", () => {
  const f = fixture();
  const launcher = new f.PrinceJS.RocketLauncher(f.delegate, -1);
  const rocket = f.bullet();
  rocket.life = 0.01;
  rocket.age = 2.99;
  launcher.bullets.push(rocket);
  launcher.advanceBullets(0.05);
  assert.equal(launcher.bullets.length, 0);
  assert.equal(launcher.effects.impacts, 1);
});

test("projectiles expire and shutdown removes them, then a new level has a fresh pickup", () => {
  const f = fixture();
  const expired = f.bullet();
  expired.life = 0.01;
  f.gun.bullets.push(expired);
  f.gun.advanceBullets(0.05);
  assert.equal(f.gun.bullets.length, 0);
  f.gun.bullets.push(f.bullet());
  f.gun.destroy();
  assert.equal(f.gun.bullets.length, 0);
  const next = fixture();
  assert.equal(next.gun.pickup.collected, false);
  assert.equal(next.gun.effects.shots, 0);
});
