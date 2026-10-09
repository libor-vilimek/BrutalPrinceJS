"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture({ tutorialActive = false, alreadyPaused = false } = {}) {
  let now = 1000000;
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  }
  const PrinceJS = { startTime: new Clock(now - 12345) };
  const context = vm.createContext({ PrinceJS, Date: Clock });
  for (const file of ["GameMenu", "Game", "Utils"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  const calls = [];
  const state = {
    tutorial: {
      active: tutorialActive ? {} : null,
      downKeys: new Set([17]),
      cancelAssist() {
        calls.push("cancel-assist");
      },
      overlay: {
        focusKey() {
          calls.push("lesson-focus");
        }
      }
    }
  };
  const game = {
    input: {
      reset() {
        calls.push("reset");
      },
      keyboard: { enabled: !tutorialActive }
    },
    touchControls: {
      clear() {
        calls.push("clear-touch");
      },
      root: {}
    },
    canvas: {
      focus() {
        calls.push("canvas-focus");
      }
    },
    state: { getCurrentState: () => state }
  };
  const node = () => ({ hidden: true, setAttribute() {}, classList: { add() {}, remove() {} } });
  const menu = Object.assign(Object.create(PrinceJS.GameMenu.prototype), {
    game,
    isOpen: false,
    root: node(),
    corner: node(),
    toggle: node(),
    showControls() {},
    syncSettings() {},
    reveal() {}
  });
  game.menu = menu;
  let paused = tutorialActive || alreadyPaused;
  Object.defineProperty(game, "paused", {
    get: () => paused,
    set: (value) => {
      if (paused !== value) {
        paused = value;
        const method = value ? "onPause" : "onResume";
        // Real Game handlers must skip their ordinary rounded-minute restore.
        PrinceJS.Game.prototype[method].call({ game });
      }
    }
  });
  return { menu, game, state, PrinceJS, calls, advance: (ms) => (now += ms) };
}

test("settings and Controls pause the campaign clock exactly without rounding away elapsed time", () => {
  const f = fixture();
  const before = f.PrinceJS.Utils.getDeltaTime();
  f.menu.open();
  assert(f.game.paused && !f.game.input.keyboard.enabled);
  assert.equal(f.state.tutorial.downKeys.size, 0);
  f.advance(91234);
  assert.deepEqual(f.PrinceJS.Utils.getDeltaTime(), before);
  f.menu.close();
  assert(!f.game.paused && f.game.input.keyboard.enabled);
  assert.deepEqual(f.PrinceJS.Utils.getDeltaTime(), before);
  f.advance(1000);
  assert.equal(f.PrinceJS.Utils.getDeltaTime().seconds, before.seconds + 1);
  assert(f.calls.includes("cancel-assist"));
  assert(f.calls.includes("clear-touch"));
});

test("closing settings over a lesson preserves its pause, disabled keyboard and completion state", () => {
  const f = fixture({ tutorialActive: true });
  const lesson = f.state.tutorial.active;
  f.menu.open();
  f.advance(60000);
  f.menu.close();
  assert(f.game.paused && !f.game.input.keyboard.enabled);
  assert.equal(f.state.tutorial.active, lesson);
  assert(f.calls.includes("lesson-focus"));
  assert(!f.calls.includes("cancel-assist"));
  assert.equal(f.PrinceJS.menuPauseTime, undefined, "the lesson remains owner of the paused clock");
});

test("closing settings does not resume an existing pause or rewrite a replacement campaign clock", () => {
  const paused = fixture({ alreadyPaused: true });
  paused.menu.open();
  paused.menu.close();
  assert(paused.game.paused);
  const f = fixture();
  f.menu.open();
  const replacement = new Date(12345);
  f.PrinceJS.startTime = replacement;
  f.advance(5000);
  f.menu.close();
  assert.equal(f.PrinceJS.startTime, replacement);
});
