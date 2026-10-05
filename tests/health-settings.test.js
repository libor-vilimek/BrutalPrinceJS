"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

test("new games have ten health points, including old saved URLs with three health", () => {
  for (const search of ["", "?health=3&level=2", "?h=3&l=1", "?health=10&level=2"]) {
    const context = vm.createContext({ window: { location: { search } }, URLSearchParams });
    for (const file of ["Boot", "Utils"]) {
      vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", file + ".js"), "utf8"), context);
    }
    const game = vm.runInContext("PrinceJS", context);
    game.Init();
    game.Utils.applyQuery();
    assert.equal(game.maxHealth, 10);
    assert.equal(game.currentHealth, null);
    assert.equal(game.currentLevel, search.includes("level=2") ? 2 : 1);
  }
});
