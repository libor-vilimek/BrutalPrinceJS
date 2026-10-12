"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const { createApp } = require("../server/app");

test(
  "statistics: daily counts, four rankings and isolated animated room previews",
  {
    skip: process.env.RUN_BROWSER_TESTS !== "1",
    timeout: 90000
  },
  async (t) => {
    const context = vm.createContext({});
    for (const file of ["Boot", "HordeSpawns", "Statistics"]) {
      vm.runInContext(fs.readFileSync(`src/${file}.js`, "utf8"), context);
    }
    const json = JSON.parse(fs.readFileSync("assets/maps/level7.json", "utf8"));
    context.map = json;
    const revision = vm.runInContext(
      "PrinceJS.Statistics.hash(JSON.stringify(map) + PrinceJS.HordeSpawns.create.toString())",
      context
    );
    const room = json.room.find((room) => room.id > 0 && room.tile.some((tile) => tile.element === 18));
    const tileIndex = room.tile.findIndex((tile) => tile.element === 18);
    const guard = json.guards[0];
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const meta = { level: 7, map: "campaign:7", revision };
    const guards = [
      {
        _id: {
          ...meta,
          guard: 1,
          room: guard.room,
          spawn: {
            roomId: guard.room,
            tileColumn: (guard.location + (guard.bias || 0)) % 10,
            tileRow: Math.floor((guard.location + (guard.bias || 0)) / 10)
          }
        },
        hpLost: 20,
        hits: 2,
        kills: 1,
        levelStarters: 2,
        killsPer100Starters: 50
      }
    ];
    const traps = [
      {
        _id: {
          ...meta,
          cause: "chopper",
          room: room.id,
          column: tileIndex % 10,
          row: Math.floor(tileIndex / 10),
          tileType: 18
        },
        hpLost: 30,
        kills: 3,
        levelStarters: 2,
        killsPer100Starters: 150
      }
    ];
    const report = {
      totals: {
        events: 12,
        starts: 2,
        observations: 0,
        princeDeaths: 7,
        enemyDeaths: 103,
        completed: 0,
        hpLost: 50,
        activeMs: 1000
      },
      daysRange: 7,
      days: [
        { _id: yesterday, princeDeaths: 5, enemyDeaths: 100 },
        { _id: today, princeDeaths: 2, enemyDeaths: 3 }
      ],
      guards,
      traps,
      guardsPerPlayer: guards,
      trapsPerPlayer: traps,
      causes: [],
      levels: [],
      weapons: [],
      milestones: [],
      availableLevels: [],
      latestDeaths: [],
      dataSources: []
    };
    let writes = 0;
    const server = createApp({
      store: {
        report: async () => report,
        writeSummaries: async (clientId, summaries) => {
          writes++;
          return summaries.map((level) => ({
            key: [level.mapId, level.mapRevision, level.levelNumber, level.day].join("|"),
            status: "stored"
          }));
        }
      }
    }).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
    const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
    t.after(async () => {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
    });
    const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await browserContext.newPage();
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push({ url: request.url(), method: request.method() }));
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${base}/statistics`);
    await page.waitForFunction(() => document.getElementById("status").textContent.includes("updated"));
    await page.evaluate(() =>
      localStorage.setItem(
        "brutal-prince-settings-v1",
        JSON.stringify({ soundMuted: true, musicMuted: true, statistics: true })
      )
    );
    const gamePage = await browserContext.newPage();
    gamePage.on("pageerror", (error) => errors.push(error.message));
    await gamePage.goto(`${base}/?level=7&health=100`);
    await gamePage.waitForFunction(
      () => window.Phaser?.GAMES?.[0]?.state.current === "Preloader" && Phaser.GAMES[0].input.keyboard.onDownCallback
    );
    await gamePage.evaluate(() => {
      PrinceJS.SKIP_TITLE = true;
    });
    await gamePage.keyboard.press("Space");
    await gamePage.waitForFunction(() => Phaser.GAMES[0].state.current === "Game");
    await gamePage.evaluate(() => Phaser.GAMES[0].menu.open());
    await gamePage.waitForTimeout(250);
    await gamePage.evaluate(() => Phaser.GAMES[0].statistics.flush());
    const gameplaySnapshot = () => {
      const game = Phaser.GAMES[0],
        state = game.state.getCurrentState();
      return {
        url: window.location.href,
        level: PrinceJS.currentLevel,
        start: PrinceJS.startTime?.getTime(),
        health: state.kid.health,
        x: state.kid.charX,
        y: state.kid.charY,
        room: state.kid.room,
        action: state.kid.action,
        inventory: game.statistics.inventory(),
        weapon: state.kid.activeWeapon,
        client: game.statistics.clientId,
        sequence: game.statistics.sequence,
        queued: game.statistics.queue.length,
        enabled: game.statistics.enabled,
        settings: game.settings.values,
        paused: game.paused
      };
    };
    const gameBefore = await gamePage.evaluate(gameplaySnapshot);
    assert(gameBefore.paused && gameBefore.enabled);
    assert(gameBefore.settings.soundMuted && gameBefore.settings.musicMuted);
    const writesBefore = writes;
    const storage = await page.evaluate(() => JSON.stringify(localStorage));
    await page.bringToFront();
    for (const id of ["guards", "traps", "guards-per-player", "traps-per-player"]) {
      assert.equal(await page.locator(`#${id} button.rank`).count(), 1);
    }
    assert.equal(await page.locator(`#prince-trend [data-day="${today}"]`).getAttribute("data-count"), "2");
    assert.equal(await page.locator(`#enemy-trend [data-day="${today}"]`).getAttribute("data-count"), "3");
    assert.equal(await page.locator("#prince-trend [data-day]").count(), 7);
    assert.equal(await page.locator('#prince-trend [data-count="0"]').count(), 5);
    if (process.env.DASHBOARD_SCREENSHOT) {
      await page.screenshot({ path: process.env.DASHBOARD_SCREENSHOT, fullPage: true });
    }
    await page.locator("#traps button").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#preview-content iframe")?.contentWindow?.Phaser?.GAMES?.[0]?.state.getCurrentState()
          ?.ready
    );
    let frame = page.frames().find((frame) => frame.url().includes("room-preview"));
    const initial = await frame.evaluate(() => {
      const game = Phaser.GAMES[0],
        state = game.state.getCurrentState();
      return {
        noKid: !state.kid,
        noStats: !game.statistics,
        noSettings: !game.settings,
        muted: game.sound.mute,
        revisionMatches: state.revisionMatches,
        enemies: state.enemies.length,
        tile: state.highlightedTile,
        tick: state.tick,
        alive: state.enemies.every((enemy) => enemy.alive)
      };
    });
    assert(
      initial.noKid &&
        initial.noStats &&
        initial.noSettings &&
        initial.muted &&
        initial.revisionMatches &&
        initial.alive
    );
    assert(initial.enemies > json.guards.length);
    assert.deepEqual(initial.tile, { room: room.id, column: tileIndex % 10, row: Math.floor(tileIndex / 10) });
    const frames = new Set();
    for (let sample = 0; sample < 10; sample++) {
      frames.add(
        await frame.evaluate(
          ({ room, column, row }) =>
            Phaser.GAMES[0].state.getCurrentState().level.getTileAt(column, row, room).tileChildBack.frameName,
          initial.tile
        )
      );
      await page.waitForTimeout(90);
    }
    assert(frames.size > 1, "choppers actually animate");
    await frame.evaluate(() => {
      const state = Phaser.GAMES[0].state.getCurrentState();
      const enemy = state.enemies[0],
        tile = state.highlightedTile;
      enemy.room = tile.room;
      enemy.charBlockX = tile.column;
      enemy.charBlockY = tile.row;
      for (let step = 0; step < 100; step++) {
        state.animateRoom();
      }
    });
    assert(await frame.evaluate(() => Phaser.GAMES[0].state.getCurrentState().enemies.every((enemy) => enemy.alive)));
    if (process.env.PREVIEW_SCREENSHOT) {
      await page.screenshot({ path: process.env.PREVIEW_SCREENSHOT });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert(
      await frame.evaluate(() => {
        const canvas = document.querySelector("canvas").getBoundingClientRect();
        return canvas.right <= window.innerWidth + 1 && canvas.bottom <= window.innerHeight + 1;
      }),
      "the full preview fits on mobile"
    );
    await page.locator("#preview-close").click();
    await page.locator("#preview-content iframe").waitFor({ state: "detached" });
    await page.locator("#guards-per-player button").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#preview-content iframe")?.contentWindow?.Phaser?.GAMES?.[0]?.state.getCurrentState()
          ?.ready
    );
    frame = page.frames().find((frame) => frame.url().includes("room-preview"));
    assert.equal(await frame.evaluate(() => Phaser.GAMES[0].state.getCurrentState().highlightedGuard), 1);
    await frame.locator("canvas").click();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#room-preview").open);
    guards[0]._id.revision = "older-revision";
    await page.locator("#refresh").click();
    await page.waitForFunction(() => document.querySelector("#guards").textContent.includes("older-re"));
    await page.locator("#guards button").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#preview-content iframe")?.contentWindow?.Phaser?.GAMES?.[0]?.state.getCurrentState()
          ?.ready
    );
    frame = page.frames().find((frame) => frame.url().includes("room-preview"));
    assert((await frame.locator("#preview-status").textContent()).includes("Map revision differs"));
    await page.locator("#preview-close").click();
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storage);
    assert.equal(writes, writesBefore);
    assert.deepEqual(
      await gamePage.evaluate(gameplaySnapshot),
      gameBefore,
      "preview leaves the existing game and recorder untouched"
    );
    assert(!requests.some((request) => request.method === "POST" || /\/assets\/(music|sfx)\//.test(request.url)));
    // Exercise palace/dungeon artwork, dormant skeletons, shadows and Jaffar with the actual map assets.
    const smoke = await browserContext.newPage();
    smoke.on("pageerror", (error) => errors.push(error.message));
    for (let level = 1; level <= 14; level++) {
      const map = JSON.parse(fs.readFileSync(`assets/maps/level${level}.json`, "utf8"));
      await smoke.goto(`${base}/statistics/room-preview?level=${level}&room=${map.prince.room}&column=5&row=1`);
      await smoke.waitForFunction(() => {
        const state = window.Phaser?.GAMES?.[0]?.state.getCurrentState();
        return state?.ready || state?.failed;
      });
      const result = await smoke.evaluate(() => {
        const state = Phaser.GAMES[0].state.getCurrentState();
        if (state.ready) {
          for (let step = 0; step < 60; step++) {
            state.animateRoom();
          }
        }
        return {
          ready: state.ready,
          status: document.getElementById("preview-status").textContent,
          alive: state.enemies?.every((enemy) => enemy.alive),
          pickups: state.pickups?.map((drawing) => drawing.id)
        };
      });
      assert(result.ready && result.alive, `Level ${level}: ${result.status}`);
      if (level === 1) {
        assert.deepEqual(result.pickups, ["minigun", "molotov"]);
      }
      if (level === 2) {
        assert.deepEqual(result.pickups, ["rocketLauncher", "whip"]);
      }
      if (level === 12) {
        assert.deepEqual(result.pickups, ["jetpack"]);
      }
    }
    await smoke.goto(`${base}/statistics/room-preview?level=7&room=999`);
    await smoke.waitForFunction(() => document.querySelector("#preview-status").textContent.includes("not available"));
    await smoke.close();
    assert.deepEqual(errors, []);
  }
);
