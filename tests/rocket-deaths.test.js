"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { fixture } = require("./helpers/death-effects-fixture");

function choreography() {
  const PrinceJS = { EnemyDeathEffects: function () {} };
  const context = vm.createContext({ PrinceJS });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "RocketDeathEffects.js"), "utf8"), context);
  const bursts = [];
  const effects = Object.assign(Object.create(PrinceJS.EnemyDeathEffects.prototype), {
    random: () => 0.5,
    pose: (enemy) => enemy.pose,
    spawnPart: (enemy, impact, options) => ({ enemy, impact, ...options }),
    delegate: { bloodEffects: { burst: (...args) => bursts.push(args) } }
  });
  const enemy = {
    pose: { x: 280, y: 116, room: 1, direction: -1, height: 44, width: 24 },
    charName: "guard-4",
    health: 0,
    alive: false
  };
  return { effects, enemy, bursts };
}

test("rocket fragments are propelled away from either side of the explosion", () => {
  for (const direction of [-1, 1]) {
    const { effects, enemy } = choreography();
    const result = effects.spawnRocketDeath(enemy, {
      x: enemy.pose.x - direction * 24,
      y: 94,
      room: 1,
      direction
    });
    assert.equal(result.parts.length, 6);
    assert.ok(result.parts.every((piece) => Math.sign(piece.vx) === direction));
    assert.ok(result.parts.every((piece) => Math.abs(piece.vx) >= 180 && Math.abs(piece.vx) <= 400));
    assert.ok(result.parts.every((piece) => piece.vy < -65 && piece.vy >= -270));
    assert.ok(result.parts.every((piece) => piece.enemy === enemy));
  }
});

test("a central explosion spreads separate native arms and legs to both sides", () => {
  const { effects, enemy } = choreography();
  const result = effects.spawnRocketDeath(enemy, { x: 280, y: 94, room: 1, direction: 1 });
  assert.deepEqual(
    Array.from(result.parts, (piece) => piece.part),
    ["head", "torso", "arm", "arm", "leg", "leg"]
  );
  const arms = result.parts.filter((piece) => piece.part === "arm");
  const legs = result.parts.filter((piece) => piece.part === "leg");
  assert.equal(Math.sign(arms[0].vx), -1);
  assert.equal(Math.sign(arms[1].vx), 1);
  assert.equal(Math.sign(legs[0].vx), -1);
  assert.equal(Math.sign(legs[1].vx), 1);
  assert.notEqual(arms[0].side, arms[1].side);
  assert.ok(result.parts.every((piece) => piece.x === undefined && piece.y === undefined));
});

test("the radial spread follows native limb positions when an enemy faces the other way", () => {
  const f = fixture({ rocket: true });
  for (const direction of [-1, 1]) {
    const actor = f.enemy({ x: 280, charFace: direction });
    const death = f.effects.kill(actor, { weapon: "rocketLauncher", x: 280, y: 94, room: 1, direction: 1 });
    for (const piece of death.parts.filter((part) => part.part === "arm" || part.part === "leg")) {
      assert.equal(Math.sign(piece.vx), Math.sign(piece.x - 280));
    }
  }
});

test("rocket deaths alternate tumbling, scattered and high split trajectories", () => {
  const { effects, enemy } = choreography();
  const impact = { x: 258, y: 94, room: 1, direction: 1 };
  const results = Array.from({ length: 3 }, () => effects.spawnRocketDeath(enemy, impact));
  assert.equal(new Set(results.map((result) => result.variant)).size, 3);
  const torso = results.map((result) => result.parts.find((piece) => piece.part === "torso"));
  const head = results.map((result) => result.parts.find((piece) => piece.part === "head"));
  assert.ok(Math.abs(torso[1].spin) > Math.abs(torso[0].spin));
  assert.ok(Math.abs(torso[1].vy) < Math.abs(torso[0].vy));
  assert.ok(Math.abs(head[2].vy) > Math.abs(head[0].vy));
  assert.ok(results.every((result) => result.parts.every((piece) => Number.isFinite(piece.rotation))));
});

test("an explosion below an enemy lifts chunks harder and distant splash has less force", () => {
  const { effects, enemy } = choreography();
  const impact = { x: 258, y: 94, room: 1, direction: 1 };
  const normal = effects.spawnRocketDeath(enemy, impact);
  effects.rocketDeathSerial = 0;
  const below = effects.spawnRocketDeath(enemy, { ...impact, y: 109 });
  effects.rocketDeathSerial = 0;
  const farther = effects.spawnRocketDeath(enemy, { ...impact, x: 228 });
  assert.ok(Math.abs(below.parts[0].vy) > Math.abs(normal.parts[0].vy));
  assert.ok(Math.abs(farther.parts[0].vx) < Math.abs(normal.parts[0].vx));
});

test("rocket choreography emits blood without altering enemy health or original death signals", () => {
  const { effects, enemy, bursts } = choreography();
  let deathSignals = 0;
  enemy.damageLife = () => {
    deathSignals++;
  };
  enemy.onDead = { dispatch: enemy.damageLife };
  const result = effects.spawnRocketDeath(enemy, { x: 258, y: 94, room: 1, direction: 1 });
  assert.equal(deathSignals, 0);
  assert.equal(enemy.health, 0);
  assert.equal(enemy.alive, false);
  assert.equal(bursts.length, 1);
  assert.deepEqual(bursts[0].slice(0, 3), [280, 94, 1]);
  assert.ok(bursts[0][3].count >= 20);
  assert.ok(result.parts.every((piece) => piece.bleed && piece.friction >= 100));
});

function rocketKill(f, actor, direction = 1) {
  const pose = f.effects.pose(actor);
  return f.effects.kill(actor, {
    weapon: "rocketLauncher",
    x: pose.x - direction * 22,
    y: pose.y - 25,
    room: pose.room,
    direction
  });
}

test("rocket body pieces fly several tiles into the linked next room in either direction", () => {
  for (const direction of [-1, 1]) {
    const f = fixture({ rocket: true });
    const actor = f.enemy({ x: direction === 1 ? 280 : 360, room: direction === 1 ? 1 : 2 });
    const death = rocketKill(f, actor, direction);
    const originalX = death.parts.map((piece) => piece.x);
    f.advance(3);
    assert.ok(death.parts.some((piece) => piece.room === (direction === 1 ? 2 : 1)));
    assert.ok(death.parts.some((piece, index) => Math.abs(piece.x - originalX[index]) > 32 * 3));
    assert.ok(death.parts.every((piece) => piece.x >= piece.radius && piece.x <= 640 - piece.radius));
    assert.ok(f.bloodBursts.length > 1, "flying pieces leave blood trails and contact splashes");
  }
});

test("fast rocket chunks collide with a full intact wall instead of passing through it", () => {
  const f = fixture({ rocket: true, wallColumn: 9 });
  for (const tile of f.level.rooms[1].tiles) {
    if (tile.roomX === 9) {
      tile.element = 20;
    }
  }
  const death = rocketKill(f, f.enemy({ x: 250 }));
  f.advance(4);
  assert.ok(death.parts.every((piece) => piece.x + piece.radius <= 288.001));
  assert.ok(death.parts.every((piece) => piece.room === 1));
  assert.ok(death.parts.some((piece) => piece.bounces > 0));
});

test("a closed gate constrains rocket fragments inside a corridor", () => {
  const f = fixture({ rocket: true, gateColumn: 8 });
  for (const tile of f.level.rooms[1].tiles) {
    if (tile.roomY === 0) {
      tile.element = 1;
    }
  }
  const death = rocketKill(f, f.enemy({ x: 250 }));
  f.advance(4);
  assert.ok(death.parts.every((piece) => piece.x + piece.radius <= 286.001));
  assert.ok(death.parts.every((piece) => piece.room === 1));
  assert.ok(death.parts.every((piece) => piece.settled));
});

test("settled rocket fragments stay on real floor and persist when the player changes rooms", () => {
  const f = fixture({ rocket: true });
  const death = rocketKill(f, f.enemy({ x: 280 }));
  f.advance(5);
  assert.ok(death.parts.every((piece) => piece.settled));
  assert.equal(f.effects.movingParts.length, 0);
  assert.ok(death.parts.every((piece) => Math.abs(piece.y + piece.radius - 119) < 0.001));
  const positions = death.parts.map((piece) => [piece.x, piece.y, piece.rotation]);
  f.delegate.currentCameraRoom = 1;
  f.advance(1);
  f.delegate.currentCameraRoom = 2;
  f.advance(1);
  assert.deepEqual(
    death.parts.map((piece) => [piece.x, piece.y, piece.rotation]),
    positions
  );
  assert.ok(death.parts.every((piece) => !piece.sprite.destroyed));
});

test("rocket fragments use each original guard and boss atlas palette", () => {
  const f = fixture({ rocket: true });
  for (const atlas of [
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
    const actor = f.enemy({ charName: atlas, baseCharName: atlas.startsWith("guard") ? "guard" : atlas });
    const death = rocketKill(f, actor);
    assert.ok(death.parts.every((piece) => piece.atlas === atlas));
    assert.ok(
      death.parts.every((piece) =>
        piece.sprite.children.some((child) => child.atlas === atlas && child.frameName === atlas + "-29")
      )
    );
    assert.ok(death.parts.every((piece) => piece.width > 0 && piece.height > 0));
  }
});

test("rocket replacement preserves delayed death signals and story actor exceptions", () => {
  const f = fixture({ rocket: true });
  const boss = f.enemy({ charName: "jaffar", baseCharName: "jaffar" });
  const death = rocketKill(f, boss);
  assert.ok(death);
  assert.equal(boss.action, "dropdead");
  assert.equal(boss.active, true);
  assert.equal(boss.visible, true);
  assert.equal(boss.damageCalls, 0);
  assert.equal(boss.deadSignals, 0);
  boss.proceedOnDead();
  assert.equal(boss.deadSignals, 1);
  assert.equal(rocketKill(f, boss), null, "the same killed actor cannot spawn parts twice");
  for (const charName of ["skeleton", "shadow"]) {
    const special = f.enemy({ charName, baseCharName: charName });
    assert.equal(f.effects.kill(special, { weapon: "rocketLauncher", x: 120, y: 94, room: 1, direction: 1 }), null);
    assert.equal(special.alpha, 1);
    assert.equal(special.damageCalls, 0);
    assert.equal(special.deadSignals, 0);
  }
  const living = f.enemy({ alive: true, health: 1 });
  assert.equal(rocketKill(f, living), null);
  assert.equal(living.health, 1);
});

test("rocket fragment cleanup destroys every native sprite and restores hidden original actors", () => {
  const f = fixture({ rocket: true });
  const actor = f.enemy({ alpha: 0.8, sword: { alpha: 0.6, visible: true } });
  const death = rocketKill(f, actor);
  const sprites = death.parts.map((piece) => piece.sprite);
  f.effects.destroy();
  assert.ok(sprites.every((sprite) => sprite.destroyed && sprite.children.every((child) => child.destroyed)));
  assert.equal(f.effects.parts.length, 0);
  assert.equal(f.effects.movingParts.length, 0);
  assert.equal(f.effects.deaths.length, 0);
  assert.equal(actor.alpha, 0.8);
  assert.equal(actor.sword.alpha, 0.6);
  assert.doesNotThrow(() => f.effects.destroy());
});
