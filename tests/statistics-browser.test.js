"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { createApp } = require("../server/app");
const { validateEvent } = require("../server/events");

test(
  "browser: real game, silent batches, menu opt-out, damage attribution, restarts and mobile layout",
  {
    skip: process.env.RUN_BROWSER_TESTS !== "1",
    timeout: 60000
  },
  async (t) => {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
    const events = [];
    const batches = [];
    let unavailable = false;
    const listener = createApp({
      store: {
        async write(batch) {
          if (unavailable) {
            throw new Error("test outage");
          }
          batches.push(batch);
          for (const event of batch) {
            assert.equal(validateEvent(event), null, `${event.eventType} violates the API contract`);
            events.push(event);
          }
          return batch.map((event) => ({ eventId: event.eventId, status: "stored" }));
        }
      }
    }).listen(0, "127.0.0.1");
    await new Promise((resolve) => listener.once("listening", resolve));
    let browser;
    t.after(async () => {
      await browser?.close();
      await new Promise((resolve) => listener.close(resolve));
    });
    browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem(
        "brutal-prince-settings-v1",
        JSON.stringify({ soundMuted: true, musicMuted: true, statistics: true })
      );
    });
    const url = `http://127.0.0.1:${listener.address().port}/?level=3&health=100`;
    await page.goto(url);
    await page.waitForFunction(
      () => Phaser.GAMES[0]?.state.current === "Preloader" && Phaser.GAMES[0].input.keyboard.onDownCallback
    );
    await page.evaluate(() => {
      PrinceJS.SKIP_TITLE = true;
    });
    await page.keyboard.press("Space");
    await page.waitForFunction(() => window.Phaser?.GAMES?.[0]?.state.current === "Game");
    await page.evaluate(() => {
      const game = Phaser.GAMES[0];
      game.settings.set("soundMuted", true);
      game.settings.set("musicMuted", true);
    });
    await page.waitForTimeout(3500);
    const diagnostic = await page.evaluate(() => {
      const stats = Phaser.GAMES[0].statistics;
      return {
        enabled: stats.enabled,
        focused: stats.focused,
        state: !!stats.state,
        queued: stats.queue.map((entry) => entry.event),
        failures: stats.failures
      };
    });
    assert(
      events.some((event) => event.eventType === "level_started"),
      JSON.stringify({ diagnostic, errors })
    );
    const gameInfo = await page.evaluate(() => {
      const game = Phaser.GAMES[0];
      const state = game.state.getCurrentState();
      return {
        muted: game.settings.values.soundMuted && game.settings.values.musicMuted,
        focused: game.statistics.focused,
        inventory: game.statistics.inventory(),
        active: state.kid.alive
      };
    });
    assert(gameInfo.muted && gameInfo.active && gameInfo.focused);
    assert(gameInfo.inventory.includes("hasWhip"));
    await page.evaluate(() => {
      const game = Phaser.GAMES[0];
      const state = game.state.getCurrentState();
      state.kid.damageLife(false, { mechanism: "sword", actor: state.enemies[0], weapon: "sword" });
      game.statistics.record("room_entered", { fromRoom: state.kid.room });
    });
    await page.waitForTimeout(3300);
    const damage = events.find((event) => event.eventType === "prince_damaged");
    assert(damage && damage.payload.source.guardId >= 1 && damage.payload.hpLost === 1);
    assert(batches.some((batch) => batch.length >= 2));
    await page.keyboard.press("Escape");
    await page.locator("#statistics-enabled").uncheck();
    assert.equal(await page.evaluate(() => Phaser.GAMES[0].statistics.enabled), false);
    const count = events.length;
    await page.locator(".menu-resume").click();
    await page.evaluate(() => Phaser.GAMES[0].state.getCurrentState().kid.damageLife());
    await page.waitForTimeout(3300);
    assert.equal(events.length, count);
    await page.keyboard.press("Escape");
    await page.locator("#statistics-enabled").check();
    await page.locator(".menu-resume").click();
    await page.waitForTimeout(3300);
    assert(events.some((event) => event.eventType === "level_observation_started" && event.partialAttempt));
    unavailable = true;
    await page.evaluate(() => Phaser.GAMES[0].statistics.record("room_entered", { fromRoom: 1 }));
    await page.waitForTimeout(3300);
    assert(await page.evaluate(() => Phaser.GAMES[0].state.getCurrentState().kid.alive));
    unavailable = false;
    await page.evaluate(() => {
      const state = Phaser.GAMES[0].state.getCurrentState();
      state.restartLevel();
    });
    await page.waitForFunction(
      () => Phaser.GAMES[0].statistics.entryReason === null && Phaser.GAMES[0].state.current === "Game"
    );
    assert(await page.evaluate(() => Phaser.GAMES[0].state.getCurrentState().kid.hasWhip));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("Escape");
    await page.locator("#touch-enabled").check();
    assert(await page.locator("#statistics-enabled").isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.locator(".menu-resume").click();
    if (process.env.BROWSER_SCREENSHOT) {
      await page.screenshot({ path: path.resolve(process.env.BROWSER_SCREENSHOT) });
    }
    assert.deepEqual(errors, []);
  }
);
