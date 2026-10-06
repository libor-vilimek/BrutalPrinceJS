"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture(search = "") {
  let now = Date.UTC(2026, 9, 25, 12);
  let savedSearch = search;
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return now;
    }
  }
  const context = vm.createContext({
    Date: Clock,
    window: { location: { search } },
    URLSearchParams,
    history: { replaceState: (_state, _title, url) => (savedSearch = url) }
  });
  for (const file of ["Boot", "Utils", "Game", "Interface"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file + ".js"), "utf8"), context);
  }
  const prince = vm.runInContext("PrinceJS", context);
  prince.Init();
  prince.Utils.applyQuery();
  const start = () => {
    prince.Game.prototype.create.call({
      game: { sound: { stopAll() {} }, cache: { getJSON: () => null } },
      restartGame() {}
    });
  };
  return {
    prince,
    start,
    advance: (minutes, seconds = 0) => (now += minutes * 60000 + seconds * 1000),
    savedSearch: () => savedSearch,
    now: () => now
  };
}

test("new games initialize and start a 600-minute clock", () => {
  const f = fixture();
  assert.equal(f.prince.minutes, 600);
  assert.equal(f.prince.Utils.getRemainingMinutes(), 600);
  f.start();
  assert.equal(f.prince.startTime.getTime(), f.now());
  assert.equal(f.prince.Utils.getRemainingMinutes(), 600);
});

test("long and short saved time parameters accept 1 through 600, including old 60-minute saves", () => {
  for (const key of ["time", "t"]) {
    for (const minutes of [1, 15, 60, 61, 599, 600]) {
      const f = fixture(`?${key}=${minutes}`);
      assert.equal(f.prince.minutes, minutes);
      f.start();
      assert.equal(f.prince.Utils.getRemainingMinutes(), minutes);
      assert.equal(f.now() - f.prince.startTime.getTime(), (600 - minutes) * 60000);
    }
    for (const value of ["0", "-1", "601", "10000", "no-time"]) {
      const f = fixture(`?${key}=${value}`);
      assert.equal(f.prince.minutes, 600);
      f.start();
      assert.equal(f.prince.Utils.getRemainingMinutes(), 600);
    }
  }
});

test("the extended clock counts real minutes while seconds still use a 60-second minute", () => {
  const f = fixture();
  f.start();
  f.advance(0, 59);
  assert.equal(f.prince.Utils.getRemainingMinutes(), 600);
  assert.equal(f.prince.Utils.getDeltaTime().seconds, 59);
  assert.equal(f.prince.Utils.getRemainingSeconds(), 1);
  f.advance(0, 1);
  assert.equal(f.prince.Utils.getRemainingMinutes(), 599);
  assert.equal(f.prince.Utils.getDeltaTime().seconds, 0);
  assert.equal(f.prince.Utils.getRemainingSeconds(), 60);
  f.advance(598, 59);
  assert.equal(f.prince.Utils.getRemainingMinutes(), 1);
  assert.equal(f.prince.Utils.getRemainingSeconds(), 1);
  f.advance(0, 1);
  assert.equal(f.prince.Utils.getRemainingMinutes(), 0);
  f.advance(10);
  assert.equal(f.prince.Utils.getRemainingMinutes(), 0);
});

test("saved countdowns over 60 minutes round-trip through either URL form", () => {
  for (const shortcut of [false, true]) {
    const f = fixture(shortcut ? "?_=true" : "");
    f.start();
    f.advance(45);
    f.prince.Utils.updateQuery();
    const key = shortcut ? "t" : "time";
    assert.equal(new URLSearchParams(f.savedSearch()).get(key), "555");
    const restored = fixture(f.savedSearch());
    restored.start();
    assert.equal(restored.prince.Utils.getRemainingMinutes(), 555);
  }
});

test("resuming restores saved remaining time against the 600-minute total", () => {
  const f = fixture();
  f.start();
  f.advance(50);
  f.prince.Utils.updateQuery();
  assert.equal(f.prince.minutes, 550);
  f.advance(13);
  assert.equal(f.prince.Utils.getRemainingMinutes(), 537);
  f.prince.Utils.restoreQuery();
  assert.equal(f.prince.Utils.getRemainingMinutes(), 550);
  assert.equal(f.now() - f.prince.startTime.getTime(), 50 * 60000);
});

test("ending a run freezes the extended clock and resetting it restores 600 minutes", () => {
  const f = fixture();
  f.start();
  f.advance(21, 37);
  f.prince.endTime = new Date(f.now());
  f.advance(100);
  assert.equal(f.prince.Utils.getRemainingMinutes(), 579);
  assert.equal(f.prince.Utils.getRemainingSeconds(), 23);
  f.prince.Utils.resetRemainingMinutesTo600();
  assert.equal(f.prince.minutes, 600);
  assert.equal(f.prince.startTime, undefined);
  assert.equal(f.prince.endTime, undefined);
  assert.equal(new URLSearchParams(f.savedSearch()).get("time"), "600");
  f.start();
  assert.equal(f.prince.Utils.getRemainingMinutes(), 600);
});

test("the scripted skip-level penalty still caps the countdown at 15 minutes", () => {
  const f = fixture();
  f.start();
  f.advance(23);
  f.prince.Utils.setRemainingMinutesTo15();
  assert.equal(f.prince.minutes, 15);
  assert.equal(f.prince.Utils.getRemainingMinutes(), 15);
  assert.equal(new URLSearchParams(f.savedSearch()).get("time"), "15");
  f.advance(3);
  f.prince.Utils.setRemainingMinutesTo15();
  assert.equal(f.prince.Utils.getRemainingMinutes(), 12);
});

test("moving to the next custom campaign resets the real game clock to 600 minutes", () => {
  const f = fixture();
  f.start();
  f.advance(200);
  f.prince.currentLevel = 103;
  f.prince.Game.prototype.nextLevel.call({
    level: { number: 14 },
    kid: { health: 10, maxHealth: 10 },
    reset() {}
  });
  assert.equal(f.prince.currentLevel, 104);
  assert.equal(f.prince.Utils.getRemainingMinutes(), 600);
  assert.equal(new URLSearchParams(f.savedSearch()).get("time"), "600");
});

test("the UI displays 600 minutes and keeps five-minute reminders during the longer countdown", () => {
  const f = fixture();
  f.start();
  let message;
  let reminders = 0;
  const ui = {
    showText: (text) => (message = text),
    showRemainingMinutes: () => reminders++
  };
  f.prince.Interface.prototype.showRemainingMinutes.call(ui, true);
  assert.equal(message, "600 MINUTES LEFT");
  f.prince.Interface.prototype.showRegularRemainingTime.call(ui);
  assert.equal(reminders, 0);
  f.advance(5);
  f.prince.Interface.prototype.showRegularRemainingTime.call(ui);
  assert.equal(reminders, 1);
});
