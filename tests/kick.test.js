"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fixture = require("./helpers/whip-fixture");

function setup() {
  const f = fixture();
  f.delegate.kickKey = { isDown: false };
  f.kick = new f.PrinceJS.Kick(f.delegate);
  f.kick.launchCount = 0;
  let seed = 37;
  f.kick.random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  f.launches = [];
  const launch = f.kick.knockDown;
  f.kick.knockDown = function (...args) {
    const hadState = !!args[0].kickState;
    launch.apply(this, args);
    if (!hadState && args[0].kickState) {
      const s = args[0].kickState;
      f.launches.push({ enemy: args[0], vx: s.vx, vy: s.vy, spin: s.spin, secondary: s.secondary });
    }
  };
  f.advanceKick = (seconds) => {
    for (let i = 0; i < Math.ceil(seconds / 0.01); i++) {
      f.kick.update(0.01);
    }
  };
  return f;
}

test("roundhouse winds up, sweeps both sides, keeps the selected weapon and does not damage guards", () => {
  const f = setup();
  f.placeKid(4);
  const front = f.guard(5);
  const back = f.guard(3);
  const hp = front.health;
  const gun = {
    actionStage: "holstering",
    cancelAction() {
      f.kid.endSpecialAction(this);
      this.actionStage = "hidden";
    }
  };
  f.kid.specialAction = { owner: gun, type: "minigun" };
  f.kick.request();
  assert.equal(gun.actionStage, "hidden");
  assert.equal(f.kid.specialAction.type, "kick");
  assert.equal(f.kid.activeWeapon, "minigun");
  assert.ok(!front.kickState && !back.kickState, "readable wind-up before contact");
  f.advanceKick(0.2);
  assert.ok(front.kickState && !back.kickState, "front arc hits first");
  f.advanceKick(0.3);
  assert.ok(back.kickState, "rear arc catches enemies behind the Prince");
  assert.equal(front.health, hp);
  assert.equal(back.health, hp);
  assert.equal(f.delegate.bloodEffects.hits.length, 2);
  f.advanceKick(0.36);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.kid.cropRect, null);
});

test("the full spin blocks repeated sword strikes including wind-up and recovery, but not after ending", () => {
  const f = setup();
  f.guard(2);
  f.kid.game = f.game;
  f.kid.damageLife = () => f.kid.health--;
  f.kid.showSplash = () => {};
  f.kick.request();
  for (let i = 0; i < 16; i++) {
    f.PrinceJS.Kid.prototype.stabbed.call(f.kid);
    f.advanceKick(0.05);
  }
  assert.equal(f.kid.health, 10);
  assert.equal(f.kid.specialAction.type, "kick");
  f.advanceKick(0.06);
  f.PrinceJS.Kid.prototype.stabbed.call(f.kid);
  assert.equal(f.kid.health, 9);
  assert.equal(f.kid.action, "bump");
});

test("direct kicks retain varied trajectories, flips, cosmetic blood and separated landing positions", () => {
  const f = setup();
  f.placeKid(4);
  const guards = [5, 5, 3, 3].map((x) => f.guard(x));
  const hp = guards.map((enemy) => enemy.health);
  f.kick.request();
  f.advanceKick(0.13);
  assert.equal(f.launches.length, 0);
  f.advanceKick(1.4);
  assert.equal(f.launches.length, 4, "both arcs reach only the guards next to the Prince");
  assert.ok(f.launches.every((s) => !s.secondary));
  assert.ok(new Set(f.launches.map((s) => Math.round(s.vx))).size >= 3);
  assert.ok(new Set(f.launches.map((s) => Math.round(s.vy))).size >= 3);
  assert.ok(f.launches.some((s) => s.spin < 0) && f.launches.some((s) => s.spin > 0));
  f.advanceKick(4);
  assert.deepEqual(
    guards.map((e) => e.health),
    hp
  );
  const xs = guards.map((e) => f.kick.position(e).x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 100, "landing spread exceeds three tiles: " + xs);
  assert.ok(new Set(xs.map((x) => Math.round(x / 16))).size >= 3, "at least three distinct landing spots");
  assert.ok(guards.every((e) => !e.kickState && e.alpha === 1));
  assert.ok(f.delegate.bloodEffects.bursts.length > 0);
});

test("a directly kicked body topples neighbours locally, and secondary falls cannot propagate", () => {
  const f = setup();
  const first = f.guard(2);
  const second = f.guard(3);
  f.kick.request();
  for (let i = 0; i < 100 && !second.kickState; i++) {
    f.advanceKick(0.01);
  }
  assert.ok(first.kickState && !first.kickState.secondary);
  assert.ok(second.kickState && second.kickState.secondary);
  assert.equal(second.kickState.phase, "toppling");
  assert.ok(!second.kickState.sprite, "a normal native fall replaces the flying cartwheel");
  const secondX = f.kick.position(second).x;
  const third = f.guard(4);
  f.kick.syncEnemy(third, { x: secondX + 18, y: f.kick.position(second).y, room: second.room }, 16);
  // Remove the original projectile so any new impact would have to propagate
  // from the secondary fall; the third guard is directly inside that fall's path.
  f.kick.releaseEnemy(first);
  first.active = false;
  f.advanceKick(0.6);
  assert.ok(!third.kickState);
  assert.equal(f.launches.length, 2);
  assert.equal(second.kickState.phase, "recovering");
  assert.ok(Math.abs(f.kick.position(second).x - secondX) <= 12, "secondary falls stay close to their original feet");
  assert.equal(second.alpha, 1);
  assert.ok(f.kick.updateEnemyActor(second), "fallen secondary guards still yield their combat AI");
  f.advanceKick(3);
  assert.ok(!second.kickState);
  assert.equal(second.health, 3);
  assert.equal(third.health, 3);
});

test("an empty kick stays visible and direct contact stops at one tile in both directions", () => {
  for (const direction of [-1, 1]) {
    const f = setup();
    f.placeKid(4, 1, 1, direction);
    const distant = f.guard(4);
    const origin = f.kick.position(f.kid);
    f.kick.syncEnemy(distant, { x: origin.x + direction * 34, y: origin.y, room: origin.room }, 16);
    f.kick.request();
    assert.equal(f.kid.specialAction.type, "kick");
    assert.equal(f.kick.effects.pose.visible, true);
    f.advanceKick(0.83);
    assert.ok(!distant.kickState, "a guard beyond the foot's short range stays upright");
    assert.equal(f.kick.effects.pose.visible, true);
    f.advanceKick(0.3);
    distant.active = false;
    f.kick.request();
    assert.equal(f.kid.specialAction.type, "kick", "no eligible enemy is required on free ground");
    f.advanceKick(0.86);
    assert.equal(f.kid.specialAction, null);
    assert.equal(f.kid.cropRect, null);
    assert.equal(f.kick.effects.pose.visible, false);
    assert.equal(f.kid.activeWeapon, "minigun");
  }
});

test("left-facing launch crosses an actual room link and restores the native sprite after landing", () => {
  const f = setup();
  f.placeKid(1, 1, 2, -1);
  const enemy = f.guard(0, 1, 2);
  f.kick.request();
  f.advanceKick(1);
  assert.equal(enemy.room, 1);
  assert.ok(f.launches[0].vx < 0);
  f.advanceKick(4);
  assert.ok(!enemy.kickState);
  assert.equal(enemy.alpha, 1);
});

test("walls and closed gates block both the sweep and flying bodies", () => {
  for (const element of [20, 4]) {
    const f = setup();
    f.placeKid(1);
    const behind = f.guard(3);
    f.setTile(1, 2, 1, element);
    f.kick.request();
    assert.equal(f.kid.specialAction.type, "kick", "a blocked target does not prevent an empty kick");
    f.advanceKick(1.1);
    assert.ok(!behind.kickState);
    f.PrinceJS.HordeSpawns.place(behind, 15);
    const near = f.guard(2);
    f.setTile(1, 2, 1, 1);
    const barrier = f.setTile(1, 3, 1, element);
    f.kick.request();
    let maxX = -Infinity;
    for (let i = 0; i < 100; i++) {
      f.advanceKick(0.01);
      if (near.kickState && near.kickState.elapsed > 0) {
        maxX = Math.max(maxX, near.kickState.x);
      }
    }
    const barrierX = element === 20 ? 96 : barrier.getBounds().x;
    assert.ok(maxX <= barrierX - 18 + 0.1, `body cannot cross barrier ${element}: ${maxX} <= ${barrierX - 18}`);
    assert.equal(f.launches.length, 1, "the guard behind the barrier is not struck");
    assert.equal(near.health, 3);
  }
});

test("floor and ceiling collisions contain launched guards without causing HP loss", () => {
  const f = setup();
  for (let x = 0; x < 10; x++) {
    f.setTile(1, x, 0, 1);
  }
  f.kick.launchCount = 1; // high arc deliberately meets the ceiling
  const enemy = f.guard(2);
  f.kick.request();
  for (let i = 0; i < 150; i++) {
    f.advanceKick(0.01);
    if (enemy.kickState && enemy.kickState.phase === "airborne") {
      assert.ok(enemy.kickState.y >= 63 + enemy.kickState.radius - 0.1);
      assert.ok(enemy.kickState.y <= 119 - enemy.kickState.radius + 0.1);
    }
  }
  assert.equal(enemy.health, 3);
});

test("a short drop preserves HP; a real two-floor drop retains native fatal behavior", () => {
  for (const floors of [1, 2]) {
    const f = setup();
    f.placeKid(2, 0);
    f.setTile(1, 2, 0, 1);
    f.setTile(1, 3, 0, 1);
    for (const room of [1, 2]) {
      for (let x = 0; x < 10; x++) {
        f.setTile(room, x, 1, floors === 1 ? 1 : 0);
        f.setTile(room, x, 2, 1);
      }
    }
    const enemy = f.guard(3, 0);
    f.kick.request();
    f.advanceKick(4);
    assert.equal(enemy.alive, floors === 1);
    assert.equal(enemy.health, floors === 1 ? 3 : 0);
  }
});

test("cooldown cannot skip follow-through and a dead Prince is not protected", () => {
  const f = setup();
  f.guard(2);
  f.kick.request();
  f.advanceKick(0.4);
  const elapsed = f.kick.elapsed;
  f.kick.request();
  assert.equal(f.kick.elapsed, elapsed);
  f.kid.alive = false;
  f.kid.action = "dropdead";
  assert.equal(f.kick.handleMeleeHit(), false);
  f.advanceKick(0.01);
  assert.equal(f.kid.action, "dropdead");
  assert.equal(f.kid.cropRect, null);
});

test("a trap killing a guard on the last recovery frame cannot be replaced by standing up", () => {
  const f = setup();
  const enemy = f.guard(2);
  f.kick.request();
  f.advanceKick(1.5);
  assert.equal(enemy.kickState.phase, "recovering");
  enemy.kickState.elapsed = enemy.kickState.recovery;
  enemy.checkChoppers = () => enemy.die("halve");
  f.advanceKick(0.01);
  assert.ok(!enemy.alive && !enemy.kickState);
  assert.equal(enemy.action, "halve");
  assert.equal(enemy.alpha, 1);
});

test("no enemy, another floor, jetpack and story exits cannot activate the emergency bypass", () => {
  const f = setup();
  let cancelled = 0;
  const owner = {
    cancelAction() {
      cancelled++;
    }
  };
  f.kid.specialAction = { owner, type: "minigun" };
  f.kick.request();
  f.advanceKick(1);
  f.guard(2, 0);
  f.kick.request();
  assert.equal(cancelled, 0);
  f.guard(2);
  f.kid.specialAction.type = "jetpack";
  f.kick.request();
  assert.equal(cancelled, 0);
  f.kid.specialAction = null;
  f.kid.action = "climbstairs";
  f.kick.request();
  assert.ok(!f.kid.specialAction);
});

test("destroy/fire/death release flying visuals without resurrecting actors or leaving crop masks", () => {
  const f = setup();
  const enemy = f.guard(2);
  f.kid.shadowOverlay = {
    visible: true,
    cropRect: null,
    crop(rect) {
      this.cropRect = rect;
    }
  };
  f.kick.request();
  f.advanceKick(0.2);
  assert.ok(!f.whip.canTarget(enemy));
  const sprite = enemy.kickState.sprite;
  assert.equal(enemy.alpha, 0);
  f.kick.destroy();
  assert.equal(sprite.destroyed, true);
  assert.ok(!enemy.kickState);
  assert.equal(enemy.alpha, 1);
  assert.equal(f.kid.cropRect, null);
  assert.equal(f.kid.shadowOverlay.cropRect, null);
  assert.equal(f.kick.effects.bodies.destroyed, true);
  const g = setup();
  const burn = g.guard(2);
  g.kick.request();
  g.advanceKick(0.2);
  burn.burningDeath = {};
  burn.alive = false;
  g.advanceKick(0.01);
  assert.ok(!burn.kickState);
  assert.equal(burn.alpha, 0, "the fire controller retains ownership of its replacement sprite");
});
function nativeKid(f, row, direction, room = 1) {
  const keyboard = { createCursorKeys: () => ({ left: {}, right: {}, up: {}, down: {} }), addKey: () => ({}) };
  f.game.input = { keyboard };
  // Reuse real actor commands and level geometry, with input/trap rendering stubbed.
  const kid = Object.create(f.PrinceJS.Kid.prototype);
  f.PrinceJS.Fighter.call(kid, f.game, f.level, row * 10 + 3, direction, room, "kid");
  kid.hasSword = false;
  kid.registerCommand(0xfd, kid.CMD_UP);
  kid.registerCommand(0xfc, kid.CMD_DOWN);
  kid.registerCommand(0xf5, () => {});
  kid.registerCommand(0xf4, () => {});
  kid.registerCommand(0xf3, () => {});
  for (const name of ["keyL", "keyR", "keyU", "keyD", "keyS"]) {
    kid[name] = () => false;
  }
  for (const name of ["checkSpikes", "checkChoppers", "checkButton", "checkRoomChange", "maskAndCrop"]) {
    kid[name] = () => {};
  }
  kid.action = "hangstraight";
  kid.actionCode = 6;
  kid.setSpecialActionFrame(91);
  kid.updateBlockXY();
  f.level.recheckCurrentRoom = () => {};
  f.kid = f.delegate.kid = f.kick.kid = f.kick.effects.kid = kid;
  return kid;
}

test("C completes the real ledge animation quickly in both directions without teleporting through the floor", () => {
  for (const direction of [-1, 1]) {
    const f = setup();
    for (let x = 1; x <= 6; x++) {
      f.setTile(1, x, 0, 1);
    }
    const kid = nativeKid(f, 1, direction);
    f.guard(direction === 1 ? 5 : 1, 0);
    const y = kid.charY;
    f.kick.request();
    assert.equal(kid.action, "climbup");
    f.advanceKick(0.24);
    assert.equal(kid.charY, y - 63);
    assert.equal(kid.action, "stand");
    assert.equal(kid.specialAction.type, "kick");
    assert.equal(kid.inFallDown, false);
  }
});

test("accelerated climb retains the native upward room-change event", () => {
  const f = setup();
  for (let x = 1; x <= 6; x++) {
    f.setTile(1, x, 2, 1);
  }
  const kid = nativeKid(f, 0, 1, 3);
  const rooms = [];
  kid.onChangeRoom.add((room) => rooms.push(room));
  f.guard(5, 2, 1);
  f.kick.request();
  f.advanceKick(0.24);
  assert.equal(kid.room, 1);
  assert.deepEqual(rooms, [1]);
  assert.equal(kid.charBlockY, 2);
  assert.equal(kid.specialAction.type, "kick");
});
