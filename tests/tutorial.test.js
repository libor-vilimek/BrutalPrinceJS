"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture() {
  let now = 1700000000000;
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  }
  const listeners = new Map();
  const window = {
    addEventListener(type, fn) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type).delete(fn);
    }
  };
  const context = vm.createContext({
    Date: Clock,
    window,
    Phaser: {
      Keyboard: {
        CONTROL: 17,
        F: 70,
        TAB: 9,
        SHIFT: 16,
        DOWN: 40,
        THREE: 51,
        FOUR: 52,
        C: 67,
        X: 88
      }
    }
  });
  for (const file of ["Boot", "Utils", "Game", "Tutorial", "TutorialLessons", "TutorialSequence"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  const prince = vm.runInContext("PrinceJS", context);
  prince.Init();
  prince.startTime = new Clock(now - 59750);
  prince.TutorialOverlay = function () {
    this.show = this.hide = this.focusKey = this.destroy = () => {};
  };
  const events = [];
  const keys = new Map();
  const addKey = (code) => {
    if (!keys.has(code)) {
      keys.set(code, {
        isDown: false,
        processKeyDown() {
          if (!this.isDown) {
            events.push(["down", code]);
            this.isDown = true;
          }
        },
        processKeyUp() {
          if (this.isDown) {
            events.push(["up", code]);
            this.isDown = false;
          }
        },
        reset() {
          this.isDown = false;
        }
      });
    }
    return keys.get(code);
  };
  let gamepadDown = false;
  let observedGamepadDown = false;
  const game = {
    time: { elapsedMS: 20 },
    input: {
      reset() {
        keys.forEach((key) => key.reset());
        observedGamepadDown = false;
      },
      keyboard: { enabled: true, addKey, removeKey() {} },
      gamepad: {
        update() {
          observedGamepadDown = gamepadDown;
        }
      }
    }
  };
  const state = Object.assign(Object.create(prince.Game.prototype), {
    game,
    kid: { alive: true, active: true, visible: true, action: "stand", activeWeapon: "twinTorches" },
    level: { number: 1, update: () => events.push("world") },
    twinTorches: { introDone: true, introPending: false, canBegin: () => !state.kid.specialAction },
    molotov: { throwState: null, cooldown: 0 },
    showRemainingMinutes: () => events.push("regular-resume"),
    ui: { showGamePaused: () => events.push("regular-pause"), showText() {} }
  });
  prince.Utils.updateQuery = () => {};
  prince.Utils.restoreQuery = () => {};
  prince.Utils.gamepadButtonDownCheck = () => observedGamepadDown;
  let paused = false;
  Object.defineProperty(game, "paused", {
    get: () => paused,
    set: (value) => {
      if (paused === value) {
        return;
      }
      paused = value;
      if (value) {
        state.onPause();
      } else {
        game.input.reset();
        state.onResume();
      }
    }
  });
  state.tutorial = new prince.Tutorial(state);
  const input = (type, code, extra = {}) => {
    const event = {
      keyCode: code,
      preventDefault() {},
      stopImmediatePropagation() {
        this.consumed = true;
      },
      ...extra
    };
    for (const listener of listeners.get(type) || []) {
      listener(event);
    }
    if (!event.consumed) {
      if (type === "keydown") {
        addKey(code).processKeyDown(event);
      }
      if (type === "keyup") {
        addKey(code).processKeyUp(event);
      }
    }
    return event;
  };
  return {
    prince,
    state,
    game,
    tutorial: state.tutorial,
    lesson: prince.TutorialLessons[0],
    input,
    events,
    keys,
    listeners,
    advance: (ms) => {
      now += ms;
    },
    gamepad: (down) => {
      gamepadDown = down;
      observedGamepadDown = down;
    }
  };
}

test("the opening waits for collected torches and a usable standing state, then freezes both update paths", () => {
  const f = fixture();
  f.state.twinTorches.introDone = false;
  f.tutorial.update(0.02);
  assert.equal(f.tutorial.active, null);
  f.state.twinTorches.introDone = true;
  f.state.kid.specialAction = {};
  f.tutorial.update(0.02);
  assert.equal(f.tutorial.active, null);
  f.state.kid.specialAction = null;
  f.state.kid.action = "running";
  f.tutorial.update(0.02);
  assert.equal(f.tutorial.active, null);
  f.state.kid.action = "stand";
  f.tutorial.update(0.02);
  assert.equal(f.tutorial.active.id, f.lesson.id);
  assert.equal(f.game.paused, true);
  assert.equal(f.game.input.keyboard.enabled, false);
  f.state.update();
  f.state.updateWorld();
  assert.deepEqual(f.events, []);
});

test("wrong keys, shortcuts, repeat and a key already held cannot dismiss or leak through the panel", () => {
  const f = fixture();
  f.input("keydown", 70);
  f.events.length = 0;
  f.tutorial.show(f.lesson);
  for (const code of [27, 13, 32, 39, 50, 67, 74, 88, 82]) {
    assert.equal(f.input("keydown", code, { ctrlKey: true }).consumed, true);
    f.input("keyup", code);
  }
  f.input("keydown", 70, { repeat: true });
  f.input("keydown", 70);
  assert.equal(f.game.paused, true);
  assert.deepEqual(f.events, []);
  f.input("keyup", 70);
  f.input("keydown", 70);
  assert.equal(f.game.paused, false);
  assert.equal(f.game.input.keyboard.enabled, true);
  assert.deepEqual(f.events, [["down", 70]]);
});

test("reading freezes the exact countdown across minute boundaries and resumes without saved-minute rounding", () => {
  const f = fixture();
  const before = JSON.stringify(f.prince.Utils.getDeltaTime());
  const start = f.prince.startTime.getTime();
  f.tutorial.show(f.lesson);
  f.advance(125500);
  assert.equal(JSON.stringify(f.prince.Utils.getDeltaTime()), before);
  f.input("keydown", 17);
  assert.equal(f.prince.startTime.getTime(), start + 125500);
  assert.equal(JSON.stringify(f.prince.Utils.getDeltaTime()), before);
  f.advance(250);
  assert.equal(f.prince.Utils.getDeltaTime().minutes, 1);
  assert.ok(!f.events.includes("regular-resume"));
  assert.equal(f.prince.tutorialPauseTime, null);
});

for (const code of [17, 70]) {
  test(`a tap of ${code} holds the actual key for 1.8 simulation seconds and delivers one release`, () => {
    const f = fixture();
    f.tutorial.show(f.lesson);
    f.input("keydown", code);
    f.input("keyup", code);
    f.advance(30000);
    assert.equal(f.keys.get(code).isDown, true);
    f.tutorial.worldUpdated();
    f.tutorial.update(10);
    assert.equal(f.keys.get(code).isDown, true, "a slow frame is capped like weapon animation time");
    for (let i = 0; i < 34; i++) {
      f.tutorial.update(0.05);
    }
    assert.equal(f.keys.get(code).isDown, true);
    f.tutorial.update(0.051);
    assert.equal(f.keys.get(code).isDown, false);
    assert.deepEqual(f.events, [
      ["down", code],
      ["up", code]
    ]);
    assert.equal(f.tutorial.active, null);
  });
}

test("assistance does not truncate physical holding, duplicate a re-press, or release the other attack alias", () => {
  const f = fixture();
  f.tutorial.show(f.lesson);
  f.input("keydown", 70);
  f.input("keyup", 70);
  f.input("keydown", 70);
  f.input("keydown", 17);
  f.tutorial.worldUpdated();
  for (let i = 0; i < 40; i++) {
    f.tutorial.update(0.05);
  }
  assert.equal(f.keys.get(70).isDown, true);
  assert.equal(f.keys.get(17).isDown, true);
  assert.equal(f.events.filter(([kind, code]) => kind === "down" && code === 70).length, 1);
  f.input("keyup", 70);
  assert.equal(f.keys.get(70).isDown, false);
  assert.equal(f.keys.get(17).isDown, true);
});

test("a lesson without a hold waits for the native actor tick as well as a render frame, even for a touch tap", () => {
  const f = fixture();
  f.tutorial.show({ ...f.lesson, id: "tap", holdMs: 0 });
  f.tutorial.accept(70, false);
  assert.equal(f.keys.get(70).isDown, true);
  f.tutorial.update(0.02);
  assert.equal(f.keys.get(70).isDown, true, "movement must not miss the tap between 80 ms actor updates");
  f.tutorial.worldUpdated();
  f.tutorial.update(0.02);
  assert.equal(f.keys.get(70).isDown, false);
  assert.deepEqual(f.events, [
    ["down", 70],
    ["up", 70]
  ]);
});

test("focus loss, pausing, death and shutdown cancel assistance without firing a late release action", () => {
  for (const cancel of [
    (f) => f.input("blur"),
    (f) => {
      f.game.paused = true;
    },
    (f) => {
      f.state.kid.alive = false;
      f.tutorial.update(0.02);
    },
    (f) => f.tutorial.destroy()
  ]) {
    const f = fixture();
    f.tutorial.show(f.lesson);
    f.input("keydown", 70);
    f.input("keyup", 70);
    cancel(f);
    assert.equal(f.tutorial.assist, null);
    assert.equal(f.keys.get(70).isDown, false);
    assert.ok(!f.events.some((event) => Array.isArray(event) && event[0] === "up"));
  }
});

test("destroying an open lesson releases its own pause and listeners without completing it or altering a new clock", () => {
  const f = fixture();
  f.tutorial.show(f.lesson);
  f.advance(500);
  f.prince.Init();
  const newStart = (f.prince.startTime = new Date(1800000000000));
  f.tutorial.destroy();
  f.tutorial.destroy();
  assert.equal(f.game.paused, false);
  assert.equal(f.prince.completedTutorials.size, 0);
  assert.equal(f.prince.startTime, newStart);
  assert.ok([...f.listeners.values()].every((set) => set.size === 0));
});

test("completed lessons survive another level controller; new-game initialization clears progress", () => {
  const f = fixture();
  f.tutorial.show(f.lesson);
  f.input("keydown", 70);
  f.tutorial.destroy();
  const next = new f.prince.Tutorial(f.state);
  assert.equal(next.show(f.lesson), false);
  f.prince.Init();
  const fresh = new f.prince.Tutorial(f.state);
  assert.equal(fresh.completed.has(f.lesson.id), false);
});

test("dead, inactive, hidden, finished or already paused games cannot open a tutorial", () => {
  for (const change of [
    (f) => {
      f.state.kid.alive = false;
    },
    (f) => {
      f.state.kid.active = false;
    },
    (f) => {
      f.state.kid.visible = false;
    },
    (f) => {
      f.state.pressButtonToNext = true;
    },
    (f) => {
      f.prince.endTime = new Date();
    },
    (f) => {
      f.game.paused = true;
    }
  ]) {
    const f = fixture();
    change(f);
    assert.equal(f.tutorial.show(f.lesson), false);
  }
});

test("controller confirmation requires a new action-button press and resumes through the same key", () => {
  const f = fixture();
  f.gamepad(true);
  f.tutorial.show(f.lesson);
  f.tutorial.pauseUpdate();
  assert.equal(f.game.paused, true);
  f.gamepad(false);
  f.tutorial.pauseUpdate();
  f.gamepad(true);
  f.tutorial.pauseUpdate();
  assert.equal(f.game.paused, false);
  assert.deepEqual(f.events, [["down", 17]]);
});

test("the ledge chord requires both keys in either order and waits for the actual hanging pose", () => {
  for (const order of [
    [16, 40],
    [40, 16]
  ]) {
    const f = fixture();
    const lesson = f.prince.TutorialLessons.find((item) => item.id === "ledge-hang");
    f.tutorial.show(lesson);
    f.input("keydown", order[0]);
    assert.equal(f.game.paused, true);
    f.input("keydown", order[1]);
    assert.equal(f.game.paused, false);
    f.input("keyup", 16);
    f.input("keyup", 40);
    f.tutorial.worldUpdated();
    f.tutorial.update(0.05);
    assert.equal(f.keys.get(16).isDown, true);
    assert.equal(f.keys.get(40).isDown, true);
    assert.ok(f.tutorial.assist, "the initial actor tick must not release a still-climbing Prince");
    f.state.kid.action = "hang";
    f.tutorial.update(0.05);
    assert.equal(f.tutorial.assist, null);
    assert.equal(f.keys.get(40).isDown, false);
    assert.equal(f.keys.get(16).isDown, true, "the grip carries into the molotov lesson");
    assert.deepEqual(f.events.slice(0, 2), [
      ["down", 16],
      ["down", 40]
    ]);
    f.tutorial.show({ ...f.lesson, id: "following-lesson" });
    f.tutorial.accept(17, false);
    assert.equal(f.keys.get(16).isDown, true, "Phaser's pause reset must not lose the carried grip");
    f.input("blur");
    assert.equal(f.keys.get(16).isDown, false);
    assert.equal(f.keys.get(17).isDown, false);
    assert.equal(f.tutorial.heldKeys.size, 0);
  }
});

test("touch confirmation forwards the complete chord and a failed climb has a bounded hold", () => {
  const f = fixture();
  const lesson = f.prince.TutorialLessons.find((item) => item.id === "ledge-hang");
  f.tutorial.show(lesson);
  f.tutorial.accept(40, false);
  f.tutorial.worldUpdated();
  for (let i = 0; i < 62; i++) {
    f.tutorial.update(0.05);
  }
  assert.equal(f.tutorial.assist, null);
  assert.equal(f.keys.get(16).isDown, false);
  assert.equal(f.keys.get(40).isDown, false);
  assert.equal(f.tutorial.heldKeys.size, 0, "a failed climb must not carry an artificial grip");
});

test("the whip lesson waits for the actual reachable ankle in the third room left", () => {
  const f = fixture();
  const lesson = f.prince.TutorialLessons.find((item) => item.id === "whip-pull");
  f.prince.currentLevel = f.state.level.number = 2;
  f.state.kid.room = 1;
  f.state.enemies = [{}];
  let snag = null;
  f.state.whip = { canAct: () => true, findSnag: () => snag };
  assert.equal(lesson.when(f.state), false);
  snag = {};
  assert.equal(lesson.when(f.state), true);
  f.state.kid.specialAction = {};
  assert.equal(lesson.when(f.state), false);
  f.state.kid.specialAction = null;
  f.state.kid.room = 5;
  assert.equal(lesson.when(f.state), false);
});

test("live guidance reserves movement but preserves restart shortcuts and the emergency kick", () => {
  const f = fixture();
  f.tutorial.sequence.guiding = true;
  assert.equal(f.input("keydown", 39).consumed, true);
  assert.equal(f.input("keyup", 39).consumed, true);
  assert.equal(f.keys.has(39), false);
  assert.ok(!f.input("keydown", 82, { ctrlKey: true }).consumed);
  assert.equal(f.keys.get(82).isDown, true);
  assert.ok(!f.input("keydown", 67).consumed);
  assert.equal(f.keys.get(67).isDown, true);
  assert.equal(f.tutorial.sequence.guiding, false);
  f.input("keyup", 67);
  assert.equal(f.keys.get(67).isDown, false);
});

test("a retry waits for the restored target to burn before guiding the Prince toward the shaft", () => {
  const f = fixture();
  const enemy = { burnRoute: "opening-shaft" };
  f.state.enemies = [enemy];
  Object.assign(f.state.kid, { room: 1, charBlockY: 2, charBlockX: 4, hasMolotov: true });
  f.tutorial.completed.add("twin-torches");
  f.tutorial.sequence = new f.prince.TutorialSequence(f.state, f.tutorial);
  f.tutorial.sequence.update();
  assert.equal(f.tutorial.sequence.guiding, false);
  enemy.burningDeath = {};
  f.input("keydown", 67);
  f.tutorial.sequence.update();
  assert.equal(f.tutorial.sequence.guiding, false, "guidance must not reset a physically held emergency kick");
  f.input("keyup", 67);
  f.tutorial.sequence.update();
  assert.equal(f.tutorial.sequence.guiding, true);
  assert.equal(f.tutorial.sequence.stage, "edge");
});

test("guidance leaves the upper platform and the player's jump alone, then takes over on the lower shelf", () => {
  const f = fixture();
  f.state.enemies = [{ burnRoute: "opening-shaft", burningDeath: {} }];
  Object.assign(f.state.kid, { room: 1, charBlockY: 1, charBlockX: 2, hasMolotov: true });
  f.tutorial.completed.add("twin-torches");
  const sequence = (f.tutorial.sequence = new f.prince.TutorialSequence(f.state, f.tutorial));
  sequence.update();
  sequence.beforeWorld();
  assert.equal(sequence.guiding, false, "finishing the torch lesson must not start an upstairs walk or jump");
  assert.ok(!f.input("keydown", 39).consumed, "movement upstairs remains player-controlled");
  f.input("keyup", 39);

  Object.assign(f.state.kid, { charBlockY: 2, charBlockX: 4, action: "freefall", inFallDown: true });
  sequence.update();
  assert.equal(sequence.guiding, false, "crossing into the lower row in midair is too early");
  Object.assign(f.state.kid, { action: "stand", inFallDown: false, charBlockX: 7 });
  sequence.update();
  assert.equal(sequence.guiding, false, "the opposite side of the shaft is outside the approach");

  f.state.kid.charBlockX = 4;
  sequence.update();
  assert.equal(sequence.guiding, true);
  assert.equal(sequence.stage, "edge");
});
