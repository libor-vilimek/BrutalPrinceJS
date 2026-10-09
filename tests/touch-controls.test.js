"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture() {
  const PrinceJS = {};
  const context = vm.createContext({ PrinceJS });
  for (const file of ["TouchControls", "Game"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  const calls = [];
  const game = { paused: false, settings: { values: { touch: true }, unlockAudio() {} } };
  const state = {
    kid: { alive: true, activeWeapon: "torches", hasTorches: true, hasMolotov: false, hasMinigun: true },
    weapons: [
      { spec: { id: "torches", owned: "hasTorches" } },
      { spec: { id: "molotov", owned: "hasMolotov" } },
      { spec: { id: "minigun", owned: "hasMinigun" } }
    ],
    handleWeaponControl() {
      calls.push("fire-down");
    },
    handleWeaponRelease() {
      calls.push("fire-up");
    },
    handleWhipControl() {
      calls.push("whip");
    },
    handleKickControl() {
      calls.push("kick");
    },
    toggleJetpack() {
      calls.push("jetpack");
    },
    showRemainingMinutes() {
      calls.push("time");
    },
    buttonPressed() {
      calls.push("continue");
    },
    selectWeapon(id) {
      calls.push(id);
      this.kid.activeWeapon = id;
    }
  };
  const buttons = new Map();
  const button = (code) => {
    if (!buttons.has(code)) {
      buttons.set(code, {
        dataset:
          typeof code === "number"
            ? { code: String(code) }
            : { action: code, ...(code === "shift" ? { code: "16" } : {}) },
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        classList: { add() {}, remove() {} }
      });
    }
    return buttons.get(code);
  };
  const touch = Object.assign(Object.create(PrinceJS.TouchControls.prototype), {
    game,
    state,
    pointers: new Map(),
    shiftLocked: false,
    shiftToggle: button("shift"),
    buttons: [],
    root: { hidden: false },
    update() {}
  });
  return {
    touch,
    game,
    state,
    calls,
    PrinceJS,
    press: (id, code) => touch.press({ pointerId: id, preventDefault() {} }, button(code))
  };
}

test("multiple fingers hold independent directions and grab without touching physical keys", () => {
  const f = fixture();
  const physical = { isDown: true };
  f.game.input = { keyboard: { left: physical } };
  f.press("left", 37);
  f.press("up", 38);
  f.press("grab", 16);
  assert(f.touch.isDown(37) && f.touch.isDown(38) && f.touch.isDown(16));
  f.touch.release("up");
  assert(!f.touch.isDown(38) && f.touch.isDown(37) && f.touch.isDown(16));
  f.touch.clear();
  assert(!f.touch.isDown(37) && !f.touch.isDown(16));
  assert.equal(physical.isDown, true);
});

test("a fire button shared by two pointers releases only after the last finger", () => {
  const f = fixture();
  f.press("first", 17);
  f.press("second", 17);
  assert.deepEqual(f.calls, ["fire-down"]);
  f.touch.release("first");
  assert(f.touch.isDown(17));
  assert.deepEqual(f.calls, ["fire-down"]);
  f.touch.release("second");
  assert.deepEqual(f.calls, ["fire-down", "fire-up"]);
  assert(!f.touch.isDown(17));
});

test("Toggle Shift remains down after a tap and combines with movement until toggled off", () => {
  const f = fixture();
  f.press("toggle", "shift");
  assert(!f.touch.isDown(16), "an unfinished tap does not latch Shift");
  f.touch.release("toggle");
  assert(f.touch.isDown(16));
  assert.equal(f.touch.shiftToggle.attributes["aria-pressed"], "true");
  f.press("left", 37);
  f.press("down", 40);
  assert(f.touch.isDown(16) && f.touch.isDown(37) && f.touch.isDown(40));
  f.touch.release("left");
  f.touch.release("down", true);
  assert(f.touch.isDown(16), "releasing or cancelling another finger does not release the toggle");
  f.press("toggle", "shift");
  f.touch.release("toggle");
  assert(!f.touch.isDown(16));
  assert.equal(f.touch.shiftToggle.attributes["aria-pressed"], "false");
  assert.deepEqual(f.calls, [], "the Shift toggle never selects or fires a weapon");
});

test("latched Shift and Walk / Grab release independently without resetting a physical Shift key", () => {
  const f = fixture();
  const physicalShift = { isDown: true };
  f.game.input = { keyboard: { shift: physicalShift } };
  f.press("grab", 16);
  f.press("toggle", "shift");
  f.touch.release("toggle");
  f.touch.release("grab");
  assert(f.touch.isDown(16));
  f.press("grab", 16);
  f.press("toggle", "shift");
  f.touch.release("toggle");
  assert(!f.touch.shiftLocked && f.touch.isDown(16), "Walk / Grab still holds Shift after switching the latch off");
  f.touch.release("grab");
  assert(!f.touch.isDown(16));
  f.touch.clear();
  assert.equal(physicalShift.isDown, true);
});

test("cancelled taps do not toggle Shift, and shared taps cannot toggle it twice", () => {
  const f = fixture();
  f.press("cancelled", "shift");
  f.touch.release("cancelled", true);
  assert(!f.touch.isDown(16));
  f.press("first", "shift");
  f.press("second", "shift");
  f.touch.release("first");
  assert(!f.touch.isDown(16));
  f.touch.release("second");
  f.touch.release("second");
  assert(f.touch.isDown(16));
  f.press("cancelled", "shift");
  f.touch.release("cancelled", true);
  assert(f.touch.isDown(16), "cancelling the toggle's next tap leaves its prior state unchanged");
});

test("cleanup, hidden controls and level attachment release latched Shift and update menu visibility", () => {
  const f = fixture();
  const visible = [];
  f.game.menu = { setControlsVisible: (value) => visible.push(value) };
  const latch = () => {
    f.press("toggle", "shift");
    f.touch.release("toggle");
    assert(f.touch.isDown(16));
  };
  latch();
  f.game.paused = true;
  assert(!f.touch.isDown(16));
  f.touch.clear();
  f.game.paused = false;
  assert(!f.touch.isDown(16));
  assert.equal(f.touch.shiftToggle.attributes["aria-pressed"], "false");
  latch();
  f.game.settings.values.touch = false;
  f.touch.refresh();
  assert(f.touch.root.hidden && !f.touch.shiftLocked && !f.touch.isDown(16));
  f.game.settings.values.touch = true;
  f.touch.refresh();
  latch();
  f.touch.attach(null);
  assert(f.touch.root.hidden && !f.touch.shiftLocked);
  f.touch.attach(f.state);
  assert(!f.touch.isDown(16));
  assert.deepEqual(visible, [false, true, false, true]);
});

test("cancel, pause and death clear or suppress touch holds and duplicate releases", () => {
  const f = fixture();
  f.press("fire", 17);
  f.touch.release("fire", true);
  f.touch.release("fire");
  assert.deepEqual(f.calls, ["fire-down"]);
  f.press("left", 37);
  f.game.paused = true;
  assert(!f.touch.isDown(37));
  f.press("kick", 67);
  assert(!f.calls.includes("kick"));
  f.touch.clear();
  f.game.paused = false;
  assert(!f.touch.isDown(37));
  f.state.kid.alive = false;
  f.press("right", 39);
  assert(!f.touch.isDown(39));
});

test("touch weapon switching skips unowned equipment and standalone actions keep selection", () => {
  const f = fixture();
  f.press("switch1", "switch");
  assert.equal(f.state.kid.activeWeapon, "minigun");
  f.press("whip", 88);
  f.press("kick", 67);
  assert.equal(f.state.kid.activeWeapon, "minigun");
  f.touch.release("switch1");
  f.press("switch2", "switch");
  assert.equal(f.state.kid.activeWeapon, "torches");
  assert.deepEqual(f.calls, ["minigun", "whip", "kick", "torches"]);
});

test("guided tutorials reserve touch movement and equipment but the kick can cancel guidance", () => {
  const f = fixture();
  const sequence = {
    guiding: true,
    cancel() {
      this.guiding = false;
    }
  };
  f.state.tutorial = { sequence, isGuidedKey: (code) => sequence.guiding && [37, 17, 16].includes(code) };
  f.press("move", 37);
  f.press("fire", 17);
  f.press("switch", "switch");
  f.press("toggle", "shift");
  f.touch.release("toggle");
  assert(!f.touch.isDown(37));
  assert(!f.touch.isDown(16) && !f.touch.shiftLocked);
  assert.deepEqual(f.calls, []);
  f.press("kick", 67);
  assert.equal(sequence.guiding, false);
  assert.deepEqual(f.calls, ["kick"]);
});
