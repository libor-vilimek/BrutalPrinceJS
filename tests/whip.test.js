"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const fixture = require("./helpers/whip-fixture");

test("level two's coiled whip is left of the spawn beside the launcher, visible and not collected from the spawn", () => {
  const f = fixture();
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/maps/level2.json")));
  const data = json.room.find((room) => room.id === json.prince.room);
  const gridIndex = json.room.indexOf(data);
  f.level.rooms[5] = {
    x: gridIndex % json.size.width,
    y: Math.floor(gridIndex / json.size.width),
    links: { left: -1, right: -1, up: -1, down: -1 },
    tiles: []
  };
  data.tile.forEach((tile, i) => f.setTile(5, i % 10, Math.floor(i / 10), tile.element));
  f.level.entranceDoors = [{ room: 5, roomX: 3, roomY: 1 }];
  f.placeKid(3, 1, 5);
  f.kid.hasWhip = false;
  const whip = new f.PrinceJS.Whip(f.delegate, 1);
  assert.equal(whip.pickup.room, 5);
  assert.equal(whip.pickup.column, 2);
  assert.equal(whip.pickup.row, 1);
  assert.equal(whip.pickup.worldX, 3920);
  assert.equal(whip.pickup.worldY, 497);
  assert.equal(whip.effects.ground.visible, true);
  assert.equal(whip.checkPickup(), false);
  f.kid.charX = 2 * 14 + 7;
  assert.equal(whip.checkPickup(), true);
  assert.equal(f.kid.hasWhip, true);
  assert.equal(f.kid.activeWeapon, "minigun");
  assert.equal(f.kid.minigunEquipped, true);
  assert.equal(f.kid.specialAction, undefined);
  assert.equal(whip.effects.ground.visible, false);
  assert.equal(whip.checkPickup(), false);
});

test("automatically owned whips hide their pickup without playing collection effects", () => {
  const f = fixture();
  assert.equal(f.whip.pickup.collected, true);
  assert.equal(f.whip.effects.collected, true);
  assert.equal(f.whip.effects.ground.visible, false);
  assert.equal(f.sounds.length, 0);
});

test("held X draws, cracks repeatedly and deals one native HP per swing without changing the selected weapon", () => {
  const f = fixture();
  const enemy = f.guard(3);
  const initial = enemy.health;
  const x = f.kid.charX;
  f.whipKey.isDown = true;
  f.advance(0.15);
  assert.equal(f.whip.actionStage, "drawing");
  assert.equal(enemy.health, initial);
  assert.equal(f.kid.specialAction.owner, f.whip);
  f.advance(0.4);
  assert.equal(f.whip.actionStage, "cracking");
  assert.equal(enemy.health, initial - 1);
  f.advance(0.25);
  assert.equal(enemy.health, initial - 1, "a swing cannot hit every render frame");
  f.advance(0.25);
  assert.equal(enemy.health, initial - 2);
  assert.equal(f.kid.charX, x);
  assert.equal(f.kid.activeWeapon, "minigun");
  assert.equal(f.kid.minigunEquipped, true);
  assert.equal(f.delegate.bloodEffects.hits.length, 2);
});

test("releasing X holsters the whip before unlocking movement", () => {
  const f = fixture();
  f.whipKey.isDown = true;
  f.advance(0.55);
  assert.equal(f.whip.actionStage, "cracking");
  assert.equal(f.whip.effects.pose.visible, true);
  assert.ok(f.kid.cropRect);
  f.whipKey.isDown = false;
  f.advance(0.1);
  assert.equal(f.whip.actionStage, "holstering");
  assert.equal(f.kid.specialAction.owner, f.whip);
  f.advance(0.15);
  assert.equal(f.whip.actionStage, "hidden");
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.kid.cropRect, null);
  assert.equal(f.whip.effects.pose.visible, false);
  assert.equal(f.kid.activeWeapon, "minigun");
});

test("a quick X tap completes one strike and stows the whip with any main weapon selected", () => {
  for (let id of ["twinTorches", "molotov", "minigun", "rocketLauncher"]) {
    const f = fixture();
    const enemy = f.guard(3);
    f.kid.activeWeapon = id;
    f.kid[id + "Equipped"] = true;
    f.whipKey.isDown = true;
    f.advance(0.02);
    f.whipKey.isDown = false;
    f.advance(0.85);
    assert.equal(enemy.health, 2);
    assert.equal(f.whip.cracks, 1);
    assert.equal(f.whip.actionStage, "hidden");
    assert.equal(f.kid.activeWeapon, id);
    assert.equal(f.kid[id + "Equipped"], true);
    assert.equal(f.kid.specialAction, null);
    assert.equal(f.kid.cropRect, null);
  }
});

test("releasing X before or just after catching an ankle finishes the pull and swing before stowing", () => {
  for (const face of [-1, 1]) {
    for (const quickTap of [false, true]) {
      const f = fixture();
      const enemy = f.makeLedge();
      f.placeKid(3, 1, 1, face);
      const x = f.kid.charX;
      f.whipKey.isDown = true;
      f.advance(quickTap ? 0.02 : 0.45);
      f.whipKey.isDown = false;
      if (quickTap) {
        f.advance(0.43);
      }
      assert.equal(enemy.whipState.phase, "pulling");
      f.advance(0.06);
      assert.equal(f.whip.actionStage, "cracking", "key release cannot skip the caught swing's follow-through");
      assert.equal(f.whip.effects.tether.enemy, enemy, "the cord remains visibly attached to the ankle");
      assert.equal(f.kid.specialAction.owner, f.whip);
      assert.equal(f.whip.effects.cord.visible, true);
      f.tickEnemies();
      assert.equal(enemy.whipState.phase, "pulling");
      assert.equal(f.whip.effects.tether.enemy, enemy);
      f.tickEnemies();
      assert.equal(enemy.whipState.phase, "falling");
      assert.equal(f.whip.actionStage, "cracking", "the Prince still finishes the whole swing after the drag");
      f.advance(0.08);
      assert.equal(f.whip.actionStage, "holstering");
      assert.equal(f.kid.specialAction.owner, f.whip);
      assert.equal(f.whip.cracks, 1);
      f.advance(0.2);
      assert.equal(f.whip.actionStage, "hidden");
      assert.equal(f.kid.specialAction, null);
      assert.equal(f.kid.cropRect, null);
      assert.equal(f.whip.effects.cord.visible, false);
      assert.equal(f.kid.charX, x);
      assert.equal(f.kid.activeWeapon, "minigun");
      f.tickEnemies(30);
      assert.equal(enemy.whipState, undefined);
      assert.equal(enemy.health, 2, "the completed fall still costs exactly one life");
    }
  }
});

test("neither releasing nor holding X can finish a caught swing before the native drag reaches the gap", () => {
  for (const held of [false, true]) {
    const f = fixture();
    const enemy = f.makeLedge();
    f.whipKey.isDown = true;
    f.advance(0.45);
    f.whipKey.isDown = held;
    // Actor movement and render animations use separate clocks. Delay the actor ticks.
    f.advance(0.6);
    assert.equal(f.whip.actionStage, "cracking");
    assert.equal(f.whip.cracks, 1, "holding X cannot replace an unfinished pull with another swing");
    assert.equal(f.whip.effects.tether.enemy, enemy);
    assert.equal(f.kid.specialAction.owner, f.whip);
    f.tickEnemies(2);
    assert.equal(enemy.whipState.phase, "falling");
    assert.equal(f.whip.actionStage, held ? "cracking" : "holstering");
    assert.equal(f.whip.cracks, held ? 2 : 1);
    f.whipKey.isDown = false;
    f.advance(0.6);
    assert.equal(f.kid.specialAction, null);
    assert.equal(f.kid.cropRect, null);
  }
});

test("a caught swing still finishes and unlocks if its target dies, burns, disappears or meets a new wall", () => {
  for (const interruption of ["death", "fire", "removed", "wall"]) {
    const f = fixture();
    const enemy = f.makeLedge();
    f.whipKey.isDown = true;
    f.advance(0.45);
    f.whipKey.isDown = false;
    if (interruption === "death") {
      enemy.alive = false;
    } else if (interruption === "fire") {
      enemy.burningDeath = {};
    } else if (interruption === "removed") {
      enemy.exists = false;
    } else {
      f.setTile(1, 4, 0, 20);
      f.tickEnemies(3);
    }
    f.advance(0.6);
    assert.equal(enemy.whipState, undefined);
    assert.equal(f.whip.actionStage, "hidden");
    assert.equal(f.whip.effects.tether, null);
    assert.equal(f.kid.specialAction, null);
    assert.equal(f.kid.cropRect, null);
  }
});

test("a nearby threat still allows the emergency kick to interrupt a caught swing", () => {
  const f = fixture();
  const enemy = f.makeLedge();
  f.whipKey.isDown = true;
  f.advance(0.45);
  f.whipKey.isDown = false;
  f.guard(5);
  const kick = new f.PrinceJS.Kick(f.delegate);
  kick.request();
  assert.equal(f.kid.specialAction.owner, kick);
  assert.equal(f.whip.actionStage, "hidden");
  assert.equal(f.whip.effects.tether, null);
  for (let i = 0; i < 40 && enemy.whipState; i++) {
    enemy.updateActor();
    f.advance(0.08);
  }
  assert.equal(enemy.whipState, undefined);
  assert.equal(enemy.health, 2, "the guard's already started fall still completes independently");
});

test("Ctrl, F and the shared weapon action cannot trigger the standalone whip", () => {
  const f = fixture();
  const enemy = f.guard(3);
  f.ctrlKey.isDown = f.fireKey.isDown = true;
  f.kid.keyWeaponAction = () => true;
  f.advance(1);
  assert.equal(f.whip.actionStage, "hidden");
  assert.equal(f.whip.cracks, 0);
  assert.equal(enemy.health, 3);
  assert.equal(f.kid.activeWeapon, "minigun");
});

test("X cannot use an unowned whip or interrupt another action, a fall or a jump", () => {
  for (let state of [
    { hasWhip: false },
    { specialAction: { owner: {}, type: "minigun" } },
    { specialAction: { owner: { actionStage: "holstering" }, type: "minigun" } },
    { specialAction: { owner: {}, type: "jetpack" } },
    { inFallDown: true, action: "freefall" },
    { inJumpUp: true, action: "highjump" }
  ]) {
    const f = fixture();
    Object.assign(f.kid, state);
    f.whipKey.isDown = true;
    f.advance(1);
    assert.equal(f.whip.cracks, 0);
    assert.equal(f.whip.actionStage, "hidden");
    assert.equal(f.kid.specialAction, state.specialAction);
  }
});

test("pressing X again during stowing waits for the complete animation", () => {
  const f = fixture();
  f.whipKey.isDown = true;
  f.advance(0.5);
  f.whipKey.isDown = false;
  f.advance(0.02);
  f.whipKey.isDown = true;
  f.advance(0.1);
  assert.equal(f.whip.actionStage, "holstering");
  assert.equal(f.whip.cracks, 1);
  assert.equal(f.kid.specialAction.owner, f.whip);
  f.advance(0.12);
  assert.equal(f.whip.actionStage, "drawing");
  assert.equal(f.whip.cracks, 1);
});

test("a whip crack cannot damage enemies through a wall, a closed gate, a ceiling or an unlinked room", () => {
  for (let element of [20, 4]) {
    const f = fixture();
    const enemy = f.guard(3);
    f.setTile(1, 2, 1, element);
    f.whip.attack();
    assert.equal(enemy.health, 3);
  }
  const f = fixture();
  f.placeKid(9);
  const enemy = f.guard(0, 1, 2);
  f.level.rooms[1].links.right = -1;
  f.level.rooms[2].links.left = -1;
  f.whip.attack();
  assert.equal(enemy.health, 3);
});

test("normal attacks reach an enemy through a linked neighboring room and only hit the nearest target", () => {
  const f = fixture();
  f.placeKid(9);
  const near = f.guard(0, 1, 2);
  const far = f.guard(1, 1, 2);
  f.whip.attack();
  assert.equal(near.health, 2);
  assert.equal(far.health, 3);
});

test("the cord wraps the open ledge and physically drags an upper guard into the gap", () => {
  const f = fixture();
  const enemy = f.makeLedge();
  const snag = f.whip.findSnag(enemy);
  assert.ok(snag);
  assert.equal(snag.gap.column, 4);
  const initialX = f.whip.position(enemy).x;
  f.whip.attack();
  assert.equal(enemy.whipState.phase, "pulling");
  assert.equal(enemy.health, 3, "the pull deals its damage on landing");
  f.tickEnemies();
  assert.ok(f.whip.position(enemy).x > initialX);
  f.tickEnemies();
  assert.equal(enemy.whipState.phase, "falling");
  assert.equal(enemy.charBlockX, 4);
  assert.equal(f.level.getTileAt(enemy.charBlockX, 0, enemy.room).isSpace(), true);
});

test("standing directly beneath a guard catches his ankle around either ledge in either facing direction", () => {
  for (let ledgeDirection of [-1, 1]) {
    for (let face of [-1, 1]) {
      for (let offset of [-18, 0, 18]) {
        const f = fixture();
        for (let column = 0; column < 10; column++) {
          f.setTile(1, column, 0, (column - 3) * ledgeDirection <= 0 ? 1 : 0);
        }
        f.placeKid(3, 1, 1, face);
        f.kid.charX += (offset * 140) / 320;
        const enemy = f.guard(3, 0);
        const snag = f.whip.findSnag(enemy);
        assert.ok(snag, `ledge ${ledgeDirection}, facing ${face}, offset ${offset}`);
        assert.equal(snag.gap.column, 3 + ledgeDirection);
        const kid = f.whip.position(f.kid);
        let previous = { x: kid.x + face * 7, y: kid.y - 25, room: kid.room };
        for (let point of [...snag.route, { x: snag.foot.x, y: snag.foot.y - 8, room: snag.foot.room }]) {
          assert.ok(f.whip.lineClear(previous, point), "every cord segment clears the solid floor");
          previous = point;
        }
        f.whipKey.isDown = true;
        f.advance(0.7);
        assert.equal(enemy.whipState.phase, "pulling");
        assert.equal(enemy.health, 3);
        f.whipKey.isDown = false;
        for (let i = 0; i < 30 && enemy.whipState.phase !== "recovering"; i++) {
          f.tickEnemies();
        }
        assert.equal(enemy.whipState.phase, "recovering");
        assert.equal(enemy.charBlockX, snag.gap.column);
        assert.equal(enemy.charBlockY, 1);
        assert.equal(enemy.charFrame, 35);
        assert.equal(enemy.health, 2);
        assert.equal(enemy.sword.visible, false);
        f.tickEnemies(20);
        assert.equal(enemy.whipState, undefined);
        assert.equal(enemy.health, 2);
      }
    }
  }
});

test("a cast from beneath the guard cannot wrap through a wall or closed gate below the lip", () => {
  for (let element of [20, 4]) {
    const f = fixture();
    const enemy = f.makeLedge();
    f.placeKid(element === 4 ? 2 : 3);
    for (let column = 0; column < 3; column++) {
      f.setTile(1, column, 0, 1);
    }
    f.setTile(1, element === 4 ? 2 : 4, 1, element);
    assert.equal(f.whip.findSnag(enemy) === null, true);
    f.whip.attack();
    assert.equal(enemy.whipState, undefined);
    assert.equal(enemy.health, 3);
  }
});

test("routing around a ledge cannot extend the cord beyond its reach", () => {
  const f = fixture();
  for (let column = 0; column <= 6; column++) {
    f.setTile(1, column, 0, 1);
  }
  f.placeKid(4);
  const enemy = f.guard(6, 0);
  assert.equal(f.whip.findSnag(enemy), null);
});

test("a short pulled fall lands face first, loses exactly one HP and cannot attack until its recovery finishes", () => {
  const f = fixture();
  const enemy = f.makeLedge();
  const originalLand = enemy.land;
  f.whip.attack();
  for (let i = 0; i < 30 && enemy.whipState && enemy.whipState.phase !== "recovering"; i++) {
    f.tickEnemies();
  }
  assert.equal(enemy.whipState.phase, "recovering");
  assert.equal(enemy.health, 2);
  assert.equal(enemy.charFrame, 35);
  assert.equal(enemy.charBlockY, 1);
  assert.equal(enemy.alive, true);
  assert.equal(enemy.sword.visible, false);
  const kidHealth = f.kid.health;
  f.tickEnemies(10);
  assert.equal(enemy.health, 2);
  assert.equal(enemy.whipState.phase, "recovering");
  assert.equal(f.kid.health, kidHealth);
  assert.equal(enemy.charFrame, 35);
  f.tickEnemies(10);
  assert.equal(enemy.whipState, undefined);
  assert.equal(enemy.land, originalLand);
  assert.equal(enemy.action, "stand");
  assert.equal(enemy.startFight, true);
  assert.equal(f.delegate.bloodEffects.hits.length, 1);
});

test("the native spikes still impale a guard pulled through a gap", () => {
  const f = fixture();
  const enemy = f.makeLedge();
  f.setTile(1, 4, 1, 2);
  f.whip.attack();
  for (let i = 0; i < 30 && enemy.alive; i++) {
    f.tickEnemies();
  }
  assert.equal(enemy.alive, false);
  assert.equal(enemy.health, 0);
  assert.equal(enemy.action, "impale");
  assert.equal(enemy.whipState, undefined);
});

test("pulling down two floors preserves native fatal fall behavior", () => {
  const f = fixture();
  const enemy = f.makeLedge();
  f.setTile(1, 4, 1, 0);
  f.setTile(1, 4, 2, 1);
  f.whip.attack();
  for (let i = 0; i < 40 && enemy.alive; i++) {
    f.tickEnemies();
  }
  assert.equal(enemy.alive, false);
  assert.equal(enemy.health, 0);
  assert.equal(enemy.action, "falldead");
  assert.equal(enemy.whipState, undefined);
});

test("a long dragged fall crosses the real room below and dies on its floor", () => {
  const f = fixture();
  const enemy = f.makeLedge();
  f.setTile(1, 4, 1, 0);
  f.setTile(1, 4, 2, 0);
  f.setTile(3, 4, 0, 1);
  f.whip.attack();
  for (let i = 0; i < 50 && enemy.alive; i++) {
    f.tickEnemies();
  }
  assert.equal(enemy.room, 3);
  assert.equal(enemy.alive, false);
  assert.equal(enemy.action, "falldead");
});

test("a guard on an intact ceiling cannot be caught through it", () => {
  const f = fixture();
  const enemy = f.makeLedge();
  for (let column = 0; column < 10; column++) {
    f.setTile(1, column, 0, 1);
  }
  assert.equal(f.whip.findSnag(enemy), null);
  f.whip.attack();
  assert.equal(enemy.whipState, undefined);
  assert.equal(enemy.health, 3);
});

test("a ceiling closing the route to the lip prevents the ankle cast", () => {
  const f = fixture();
  const enemy = f.makeLedge();
  f.setTile(1, 4, 0, 20);
  f.setTile(1, 2, 0, 20);
  assert.equal(f.whip.findSnag(enemy), null);
});

test("a wall appearing while a guard is being pulled cancels the drag without moving through it", () => {
  const f = fixture();
  const enemy = f.makeLedge();
  f.whip.attack();
  const x = f.whip.position(enemy).x;
  f.setTile(1, 4, 0, 20);
  f.tickEnemies(3);
  assert.equal(enemy.whipState, undefined);
  assert.ok(f.whip.position(enemy).x < 128);
  assert.ok(f.whip.position(enemy).x >= x);
});

test("death or fire during a drag releases its native landing hook", () => {
  for (let burning of [false, true]) {
    const f = fixture();
    const enemy = f.makeLedge();
    const originalLand = enemy.land;
    f.whip.attack();
    if (burning) {
      enemy.burningDeath = {};
    } else {
      enemy.alive = false;
    }
    f.advance(0.02);
    assert.equal(enemy.whipState, undefined);
    assert.equal(enemy.land, originalLand);
    assert.equal(f.whip.pulledEnemies.size, 0);
  }
});

test("an ankle pull across a horizontal room link falls on the neighboring room's floor", () => {
  const f = fixture();
  f.setTile(1, 9, 0, 1);
  f.placeKid(0, 1, 2, -1);
  const enemy = f.guard(9, 0);
  const snag = f.whip.findSnag(enemy);
  assert.ok(snag);
  assert.equal(snag.gap.room, 2);
  assert.equal(snag.gap.column, 0);
  f.whip.attack();
  for (let i = 0; i < 30 && enemy.whipState && enemy.whipState.phase !== "recovering"; i++) {
    f.tickEnemies();
  }
  assert.equal(enemy.room, 2);
  assert.equal(enemy.whipState.phase, "recovering");
  assert.equal(enemy.health, 2);
  assert.equal(enemy.charBlockX, 0);
});

test("an enemy just above the Prince in a linked upper room can be dragged into the room below", () => {
  const f = fixture();
  f.setTile(1, 3, 2, 1);
  f.setTile(3, 4, 0, 1);
  f.placeKid(4, 0, 3, -1);
  const enemy = f.guard(3, 2);
  assert.ok(f.whip.findSnag(enemy));
  f.whip.attack();
  for (let i = 0; i < 30 && enemy.whipState && enemy.whipState.phase !== "recovering"; i++) {
    f.tickEnemies();
  }
  assert.equal(enemy.room, 3);
  assert.equal(enemy.whipState.phase, "recovering");
  assert.equal(enemy.health, 2);
  assert.equal(enemy.charBlockY, 0);
});

test("room seven in the actual second level provides a reachable ledge pull and safe short landing", () => {
  const f = fixture();
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/maps/level2.json")));
  const data = json.room.find((room) => room.id === 7);
  const gridIndex = json.room.indexOf(data);
  f.level.rooms[7] = {
    x: gridIndex % json.size.width,
    y: Math.floor(gridIndex / json.size.width),
    links: { left: -1, right: -1, up: -1, down: -1 },
    tiles: []
  };
  data.tile.forEach((tile, i) => f.setTile(7, i % 10, Math.floor(i / 10), tile.element));
  f.placeKid(5, 1, 7, 1);
  const enemy = f.guard(6, 0, 7);
  const snag = f.whip.findSnag(enemy);
  assert.ok(snag);
  assert.equal(snag.gap.column, 5);
  f.whip.attack();
  for (let i = 0; i < 30 && enemy.whipState && enemy.whipState.phase !== "recovering"; i++) {
    f.tickEnemies();
  }
  assert.equal(enemy.health, 2);
  assert.equal(enemy.whipState.phase, "recovering");
  assert.equal(enemy.charBlockX, 5);
  assert.equal(enemy.charBlockY, 1);
});

test("the Prince directly below room sixteen's upper guard pulls him around the actual floor into the right gap", () => {
  const f = fixture();
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/maps/level2.json")));
  const data = json.room.find((room) => room.id === 16);
  const gridIndex = json.room.indexOf(data);
  f.level.rooms[16] = {
    x: gridIndex % json.size.width,
    y: Math.floor(gridIndex / json.size.width),
    links: { left: -1, right: -1, up: -1, down: -1 },
    tiles: []
  };
  data.tile.forEach((tile, i) => f.setTile(16, i % 10, Math.floor(i / 10), tile.element));
  f.placeKid(5, 1, 16, 1);
  const enemy = f.guard(5, 0, 16, 1);
  const snag = f.whip.findSnag(enemy);
  assert.ok(snag);
  assert.equal(snag.gap.column, 6);
  assert.equal(snag.route.length, 2);
  f.whip.attack();
  for (let i = 0; i < 30 && enemy.whipState.phase !== "recovering"; i++) {
    f.tickEnemies();
  }
  assert.equal(enemy.alive, true);
  assert.equal(enemy.health, 2);
  assert.equal(enemy.whipState.phase, "recovering");
  assert.equal(enemy.charFrame, 35);
  assert.equal(enemy.charBlockX, 6);
  assert.equal(enemy.charBlockY, 1);
});

test("active choppers can kill a dragged falling guard before he lands", () => {
  const f = fixture();
  const enemy = f.makeLedge();
  const chopper = f.setTile(1, 4, 1, 18);
  chopper.step = 2;
  enemy.inChopDistance = () => true;
  f.whip.attack();
  for (let i = 0; i < 30 && enemy.alive; i++) {
    f.tickEnemies();
  }
  assert.equal(enemy.alive, false);
  assert.equal(enemy.action, "halve");
  assert.equal(enemy.whipState, undefined);
});

test("two separately dragged guards recover independently and each loses only one HP", () => {
  const f = fixture();
  const first = f.makeLedge();
  f.whip.attack();
  f.setTile(1, 7, 0, 1);
  f.placeKid(8, 1, 1, -1);
  const second = f.guard(7, 0);
  f.whip.attack();
  assert.equal(f.whip.pulledEnemies.size, 2);
  f.tickEnemies(16);
  assert.equal(first.health, 2);
  assert.equal(second.health, 2);
  assert.equal(first.whipState.phase, "recovering");
  assert.equal(second.whipState.phase, "recovering");
  f.tickEnemies(15);
  assert.equal(first.whipState, undefined);
  assert.equal(second.whipState, undefined);
  assert.equal(f.whip.pulledEnemies.size, 0);
});

test("losing the floor again while recovering does not apply the same pull's landing damage twice", () => {
  const f = fixture();
  const enemy = f.makeLedge();
  f.setTile(1, 4, 2, 1);
  f.whip.attack();
  for (let i = 0; i < 30 && enemy.whipState && enemy.whipState.phase !== "recovering"; i++) {
    f.tickEnemies();
  }
  assert.equal(enemy.health, 2);
  f.setTile(1, 4, 1, 0);
  f.tickEnemies();
  assert.equal(enemy.whipState.phase, "falling");
  for (let i = 0; i < 30 && enemy.whipState && enemy.whipState.phase !== "recovering"; i++) {
    f.tickEnemies();
  }
  assert.equal(enemy.health, 2);
  assert.equal(enemy.whipState.phase, "recovering");
  assert.equal(enemy.charBlockY, 2);
  assert.equal(f.delegate.bloodEffects.hits.length, 1);
});

test("death, another special action or a hit interrupt the Prince's whip without leaving movement locked", () => {
  const f = fixture();
  f.whipKey.isDown = true;
  f.advance(0.55);
  assert.equal(f.kid.specialAction.owner, f.whip);
  f.kid.action = "bump";
  f.advance(0.02);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.whip.actionStage, "hidden");
  assert.equal(f.kid.action, "bump");
  assert.equal(f.kid.cropRect, null);
});

test("destroying the controller restores native actors, crops and graphics", () => {
  const f = fixture();
  const enemy = f.makeLedge();
  const originalLand = enemy.land;
  f.whip.attack();
  f.whipKey.isDown = true;
  f.advance(0.55);
  f.whip.destroy();
  assert.equal(enemy.whipState, undefined);
  assert.equal(enemy.land, originalLand);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.kid.cropRect, null);
  assert.equal(f.whip.pulledEnemies.size, 0);
  assert.ok(f.visuals.every((visual) => visual.destroyed));
});

test("the shadow overlay cannot leave original arms visible during a whip pose", () => {
  const f = fixture();
  const shadow = {
    visible: true,
    cropRect: null,
    crop(rect) {
      this.cropRect = rect;
    }
  };
  f.kid.shadowOverlay = shadow;
  f.whipKey.isDown = true;
  f.advance(0.3);
  assert.equal(shadow.cropRect, f.kid.cropRect);
  assert.equal(shadow.cropRect.y, 25);
  f.whipKey.isDown = false;
  f.advance(0.8);
  assert.equal(shadow.cropRect, null);
  assert.equal(f.kid.cropRect, null);
});
