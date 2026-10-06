"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { fixture } = require("./helpers/death-effects-fixture");

function kill(f, actor, direction = 1) {
  let bounds = actor.getCharBounds();
  return f.effects.kill(actor, {
    x: actor.baseX + bounds.x + bounds.width / 2,
    y: actor.baseY + actor.charY - 24,
    room: actor.room,
    direction,
    weapon: "minigun"
  });
}

test("five minigun deaths alternate impact-driven kick, arm tear, split, head spin and leg collapse", () => {
  const f = fixture();
  const deaths = Array.from({ length: 5 }, () => kill(f, f.enemy()));
  assert.deepEqual(
    Array.from(deaths, (death) => death.variant),
    ["face-kick", "shoulder-tear", "waist-split", "head-spin", "knee-collapse"]
  );
  assert.deepEqual(
    Array.from(deaths, (death) => death.parts.length),
    [1, 2, 2, 2, 2]
  );
  assert.equal(deaths[1].parts[1].part, "arm");
  assert.equal(deaths[3].parts[1].part, "head");
  assert.equal(deaths[4].parts[1].part, "leg");
  assert.ok(deaths.every((death) => death.parts.every((piece) => piece.sprite.children[0].atlas === "guard-1")));
  assert.ok(deaths.slice(1).every((death) => death.parts[0].missing.length || death.parts[0].part === "upperBody"));
});

test("a face hit propels the corpse several tiles backwards and into the linked room", () => {
  for (const direction of [-1, 1]) {
    const f = fixture();
    const actor = f.enemy(direction > 0 ? { x: 264, room: 1 } : { x: 376, room: 2 });
    const death = kill(f, actor, direction);
    const piece = death.parts[0];
    const originalX = piece.x;
    assert.equal(Math.sign(piece.vx), direction);
    f.advance(0.85);
    assert.ok((piece.x - originalX) * direction > 100, "the knockback should exceed three floor tiles");
    assert.equal(piece.room, direction > 0 ? 2 : 1);
    assert.notEqual(piece.rotation, 0, "airborne corpses tumble");
    assert.ok(f.bloodBursts.length > 3, "moving corpses leave blood drops along their trajectory");
  }
});

test("native damage/death/story commands remain in charge without duplicate visible swords", () => {
  const f = fixture();
  const actor = f.enemy({ charName: "jaffar", baseCharName: "jaffar" });
  const death = kill(f, actor);
  assert.ok(death);
  assert.equal(actor.alive, false);
  assert.equal(actor.action, "dropdead");
  assert.equal(actor.active, true);
  assert.equal(actor.visible, true);
  assert.equal(actor.alpha, 0);
  assert.equal(actor.sword.alpha, 0);
  assert.equal(actor.splash.visible, false);
  assert.equal(actor.damageCalls, 0);
  assert.equal(actor.deadSignals, 0);
  // The original CMD_DIE callback is free to run on the next actor animation frame.
  actor.proceedOnDead();
  f.advance(0.5);
  assert.equal(actor.deadSignals, 1);
  assert.equal(kill(f, actor), null, "death effects are idempotent");
  assert.equal(f.effects.deaths.length, 1);
});

test("living enemies, immortal skeletons and story shadow keep their native rendering", () => {
  const f = fixture();
  for (const actor of [
    f.enemy({ alive: true, health: 2 }),
    f.enemy({ charName: "skeleton" }),
    f.enemy({ charName: "shadow", baseCharName: "shadow" })
  ]) {
    assert.equal(kill(f, actor), null);
    assert.equal(actor.alpha, 1);
  }
  assert.equal(f.effects.parts.length, 0);
});

test("swept corpse motion bounces off stone and narrow gate posts without tunnelling", () => {
  for (const options of [{ wallColumn: 6 }, { gateColumn: 5 }]) {
    const f = fixture(options);
    const piece = kill(f, f.enemy({ x: 154 })).parts[0];
    f.advance(0.8, 0.05);
    assert.ok(piece.x < 190);
    assert.ok(piece.bounces > 0);
    assert.equal(piece.room, 1);
  }
});

test("intact corpses rest in their native prone frame and remain after rooms change", () => {
  const f = fixture();
  const piece = kill(f, f.enemy({ x: 260 })).parts[0];
  f.advance(7);
  assert.equal(piece.settled, true);
  assert.equal(f.effects.movingParts.length, 0);
  assert.equal(piece.sprite.nativeBody.frameName, "guard-1-35");
  const position = { x: piece.x, y: piece.y, room: piece.room };
  f.delegate.currentCameraRoom = 1;
  f.advance(10);
  assert.deepEqual({ x: piece.x, y: piece.y, room: piece.room }, position);
  assert.equal(f.effects.parts.length, 1);
  assert.equal(piece.sprite.destroyed, undefined);
});

test("dismembered pieces retain their native crops after settling and a removed floor wakes them", () => {
  const f = fixture();
  f.effects.variantOffset = 3;
  const death = kill(f, f.enemy({ x: 240 }));
  f.advance(8);
  assert.ok(death.parts.every((piece) => piece.settled));
  const head = death.parts.find((piece) => piece.part === "head");
  const crop = head.sprite.children[0].cropRect;
  assert.ok(crop && crop.height < 12);
  assert.equal(head.sprite.children[0].frameName, "guard-1-29");
  const oldY = head.y;
  const column = Math.floor((head.x - f.level.rooms[head.room].x * 320) / 32);
  f.level.rooms[head.room].tiles[10 + column].element = 0;
  f.level.rooms[head.room].tiles[10 + Math.max(0, column - 1)].element = 0;
  f.level.rooms[head.room].tiles[10 + Math.min(9, column + 1)].element = 0;
  f.advance(0.7);
  assert.ok(head.y > oldY + 20);
});

test("destroy removes all persistent pieces and restores native alpha without affecting enemy signals", () => {
  const f = fixture();
  const actor = f.enemy();
  kill(f, actor);
  f.advance(0.1);
  f.effects.destroy();
  assert.equal(f.effects.parts.length, 0);
  assert.equal(f.effects.movingParts.length, 0);
  assert.equal(actor.alpha, 1);
  assert.equal(actor.sword.alpha, 1);
  assert.equal(actor.damageCalls, 0);
  assert.equal(actor.deadSignals, 0);
  assert.ok(f.visuals.every((visual) => visual.destroyed));
  assert.doesNotThrow(() => f.effects.destroy());
});
