"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture(number) {
  const delayed = [];
  const PrinceJS = {
    Level: { TILE_SKELETON: 21, TILE_RAISE_BUTTON: 15 },
    Utils: {
      delayed: (callback, ms) => delayed.push({ callback, ms }),
      convertX: (x) => Math.floor((x * 320) / 140)
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/Game.js"), "utf8"), { PrinceJS });
  const played = [];
  const kid = {
    room: 1,
    charBlockX: 2,
    charBlockY: 1,
    charX: 42,
    baseX: 0,
    alive: true,
    opponent: null,
    opponentInSameRoom: (enemy, room) => enemy.room === room,
    opponentNearRoom: () => false,
    opponentOnSameLevel: () => true
  };
  const state = Object.assign(Object.create(PrinceJS.Game.prototype), {
    specialEvents: true,
    firstUpdate: false,
    currentCameraRoom: 1,
    visitedRooms: {},
    level: { number, rooms: {}, getTileAt: () => ({ element: 0 }) },
    kid,
    enemies: [],
    game: { sound: { play: (sound) => played.push(sound) } },
    ui: {
      setOpponentLive: (enemy) => (state.ui.opp = enemy),
      resetOpponentLive: () => (state.ui.opp = null)
    }
  });
  return { PrinceJS, state, kid, delayed, played };
}

test("the dormant original skeleton wakes when the exit opens even if a guard owns the HUD", () => {
  const { state, kid, played } = fixture(3);
  let removed = 0;
  const skeleton = {
    charName: "skeleton",
    room: 1,
    charBlockX: 5,
    charBlockY: 1,
    active: false,
    setActive() {
      this.active = true;
    }
  };
  kid.opponent = { charName: "guard-1" };
  state.enemies = [skeleton, kid.opponent];
  state.level.exitDoorOpen = true;
  state.level.getTileAt = () => ({ element: 21, removeObject: () => removed++ });
  state.checkLevelLogic();
  assert.equal(skeleton.active, true);
  assert.equal(skeleton.opponent, kid);
  assert.equal(removed, 1);
  assert.deepEqual(played, ["BonesLeapToLife"]);
});

test("Jaffar's death stops the clock and opens the real exit independently of the horde HUD", () => {
  const { PrinceJS, state, kid, delayed } = fixture(13);
  let reminders = 0;
  let pushes = 0;
  state.showRemainingMinutes = () => reminders++;
  const button = { element: 15, push: () => pushes++ };
  state.level.getTileAt = () => button;
  const boss = { baseCharName: "jaffar", alive: false };
  kid.opponent = { baseCharName: "guard", alive: true, reinforcement: true };
  state.enemies = [boss, kid.opponent];
  state.checkLevelLogic();
  state.checkLevelLogic();
  assert.ok(PrinceJS.endTime);
  assert.equal(reminders, 1);
  assert.equal(delayed.length, 1);
  assert.equal(delayed[0].ms, 7000);
  delayed[0].callback();
  assert.equal(pushes, 1);
  assert.equal(button.mute, true);
});

test("the surrendering synchronized shadow keeps its interaction while other guards continue hunting", () => {
  const { state, kid } = fixture(12);
  const shadow = {
    charName: "shadow",
    alive: true,
    visible: true,
    active: false,
    room: 1,
    charBlockY: 1
  };
  const guard = {
    alive: true,
    visible: true,
    active: true,
    room: 1,
    baseX: 0,
    charX: 56,
    charBlockY: 1,
    isProactiveGuard: () => true,
    canHuntOpponent: () => true
  };
  state.shadow = shadow;
  state.enemies = [shadow, guard];
  kid.opponentSync = true;
  state.checkHordeOpponents(1);
  assert.equal(kid.opponent, shadow);
  assert.equal(shadow.opponent, kid);
  assert.equal(state.ui.opp, shadow);
  assert.equal(guard.opponent, kid);
  assert.equal(guard.startFight, true);
  shadow.visible = false;
  state.checkHordeOpponents(1);
  assert.equal(kid.opponent, guard);
});

test("a nearby horde guard cannot trigger the inactive shadow's merge", () => {
  const { state, kid } = fixture(12);
  state.shadow = { active: false, visible: false };
  kid.opponent = { charName: "guard-1" };
  kid.opponentDistance = () => 0;
  state.checkLevelLogic();
  assert.equal(state.level.shadowMerge, undefined);
  assert.equal(state.level.leapOfFaith, undefined);
});

test("the peaceful active shadow merges directly and grants its original reward exactly once", () => {
  const { PrinceJS, state, kid, delayed } = fixture(12);
  let lives = 0;
  let flashes = 0;
  const shadow = (state.shadow = {
    charName: "shadow",
    active: true,
    visible: true,
    alive: true,
    room: kid.room,
    charBlockY: kid.charBlockY,
    isPeacefulShadow: () => true
  });
  kid.opponent = shadow;
  kid.action = "running";
  kid.opponentDistance = () => 6;
  kid.addLife = () => lives++;
  kid.mergeShadowPosition = () => {
    shadow.visible = false;
    kid.opponent = null;
  };
  kid.showShadowOverlay = kid.flashShadowOverlay = () => flashes++;
  PrinceJS.Utils.flashWhiteShadowMerge = () => flashes++;
  state.checkLevelLogic();
  state.checkLevelLogic();
  assert.equal(state.level.shadowMerge, true);
  assert.equal(state.level.leapOfFaith, true);
  assert.equal(lives, 1);
  assert.equal(flashes, 3);
  assert.equal(delayed.length, 1);
});

test("dead shadows and shadows on another floor or room cannot grant a merge", () => {
  for (const change of [{ alive: false }, { room: 2 }, { charBlockY: 2 }, { visible: false }]) {
    const { state, kid } = fixture(12);
    state.shadow = {
      active: true,
      visible: true,
      alive: true,
      room: kid.room,
      charBlockY: kid.charBlockY,
      isPeacefulShadow: () => true,
      ...change
    };
    kid.action = "stand";
    kid.opponent = state.shadow;
    kid.opponentDistance = () => 0;
    state.checkLevelLogic();
    assert.equal(state.level.shadowMerge, undefined);
  }
});

test("the level 6 plunge schedules only one transition even across another world tick", () => {
  const { PrinceJS, state, kid, delayed } = fixture(6);
  PrinceJS.currentLevel = 6;
  kid.charBlockY = 2;
  kid.charY = 186;
  const levels = [];
  state.nextLevel = (number) => levels.push(number);
  state.checkLevelLogic();
  state.checkLevelLogic();
  assert.equal(delayed.length, 1);
  assert.equal(state.blockCamera, true);
  PrinceJS.currentLevel = 7;
  delayed[0].callback();
  assert.deepEqual(levels, [6], "a stale callback cannot skip a later level");
});

test("the shadow is linked for shared damage immediately upon appearing", () => {
  const { PrinceJS, state, kid, delayed } = fixture(12);
  PrinceJS.Utils.convertBlockXtoX = (x) => x * 14 + 7;
  PrinceJS.Utils.convertBlockYtoY = (y) => y * 63 + 53;
  kid.room = 15;
  kid.charBlockX = 5;
  state.shadow = {
    room: 22,
    alive: true,
    visible: false,
    isPeacefulShadow: () => true,
    setVisible() {
      this.visible = true;
    },
    setActive() {
      this.active = true;
    }
  };
  state.checkLevelLogic();
  assert.equal(kid.opponent, state.shadow);
  assert.equal(state.shadow.opponent, kid);
  assert.equal(kid.opponentSync, true);
  assert.equal(state.shadow.active, true);
  assert.equal(delayed.length, 0);
});
