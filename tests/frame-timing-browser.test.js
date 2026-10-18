"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createApp } = require("../server/app");

test(
  "browser: bundled engine preserves kick duration and native world updates at different display rates",
  { skip: process.env.RUN_BROWSER_TESTS !== "1", timeout: 60000 },
  async (t) => {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
    const server = createApp({ store: {} }).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    let browser;
    t.after(async () => {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    });
    browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem(
        "brutal-prince-settings-v1",
        JSON.stringify({ soundMuted: true, musicMuted: true, statistics: false })
      );
    });
    for (const fps of [30, 60, 120, 144, 240]) {
      await page.goto(`http://127.0.0.1:${server.address().port}/?level=3`);
      await page.waitForFunction(
        () => window.Phaser?.GAMES[0]?.state.current === "Preloader" && Phaser.GAMES[0].input.keyboard.onDownCallback
      );
      await page.evaluate(() => (PrinceJS.SKIP_TITLE = true));
      await page.keyboard.press("Space");
      await page.waitForFunction(() => Phaser.GAMES[0].state.getCurrentState().kick);
      const result = await page.evaluate((fps) => {
        const game = Phaser.GAMES[0];
        const state = game.state.getCurrentState();
        game.sound.mute = true;
        game.stage.disableVisibilityChange = true;
        state.tutorial.destroy();
        state.tutorial = null;
        game.paused = false;
        for (const enemy of state.enemies) {
          enemy.setInactive();
        }
        game.raf.stop();
        state.kid.action = "stand";
        const health = state.kid.health;
        const weapon = state.kid.activeWeapon;
        const started = state.kick.begin();
        let finishedAt = null;
        let simulated = 0;
        let worldTicks = 0;
        const kickUpdate = state.kick.update;
        state.kick.update = function (dt) {
          simulated += dt;
          kickUpdate.call(this, dt);
        };
        const event = game.time.events.events.find((event) => event.callback === state.updateWorld);
        const worldUpdate = event.callback;
        event.callback = function () {
          worldTicks++;
          worldUpdate.call(this);
        };
        const dateNow = Date.now;
        const base = dateNow();
        let elapsed = 0;
        Date.now = () => Math.floor(base + elapsed);
        game.time.now = 0;
        game.time.time = base;
        game._kickstart = false;
        game._deltaTime = game._spiraling = game._lastCount = 0;
        try {
          for (let frame = 1; frame <= fps * 2; frame++) {
            elapsed = (frame * 1000) / fps;
            game.update(elapsed);
            if (finishedAt === null && state.kick.actionStage === "hidden") {
              finishedAt = elapsed / 1000;
            }
          }
        } finally {
          Date.now = dateNow;
        }
        return {
          started,
          finishedAt,
          simulated,
          worldTicks,
          healthPreserved: state.kid.health === health,
          weaponPreserved: state.kid.activeWeapon === weapon,
          muted: game.sound.mute
        };
      }, fps);
      assert(result.started, `${fps} fps: kick did not start`);
      assert(result.finishedAt >= 1.04 && result.finishedAt < 1.15, `${fps} fps: ${JSON.stringify(result)}`);
      assert(Math.abs(result.simulated - 2) < 0.07, `${fps} fps: ${JSON.stringify(result)}`);
      assert(result.worldTicks >= 24 && result.worldTicks <= 26, `${fps} fps: native 80 ms world clock changed`);
      assert(result.healthPreserved && result.weaponPreserved && result.muted);
    }
    assert.deepEqual(errors, []);
  }
);
