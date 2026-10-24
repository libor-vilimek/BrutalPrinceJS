"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { createApp } = require("../server/app");

test(
  "level-one signs follow the real pickup and exit plate without changing movement or level progression",
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
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.BROWSER_EXECUTABLE,
      args: ["--mute-audio"]
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.PhaserGlobal = { disableAudio: true };
      localStorage.setItem(
        "brutal-prince-settings-v1",
        JSON.stringify({ soundMuted: true, musicMuted: true, statistics: false })
      );
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/?level=1`);
    await page.waitForFunction(
      () => window.Phaser?.GAMES[0]?.state.current === "Preloader" && Phaser.GAMES[0].input.keyboard.onDownCallback
    );
    await page.evaluate(() => (PrinceJS.SKIP_TITLE = true));
    await page.keyboard.press("Space");
    await page.waitForFunction(() => Phaser.GAMES[0].state.getCurrentState().tutorial?.active);
    await page.evaluate(() => {
      const game = Phaser.GAMES[0];
      const state = game.state.getCurrentState();
      game.stage.disableVisibilityChange = true;
      game.sound.mute = true;
      state.tutorial.destroy();
      state.tutorial = null;
      for (const enemy of state.enemies) {
        enemy.setInactive();
      }
      window.firstLevelHints = state.levelHints;
    });
    // Checkpoints represent a cleared approach; pickups, terrain and inputs stay native.
    const place = async (room, x, row, face = 1) => {
      await page.evaluate(
        ([room, x, row, face]) => {
          const game = Phaser.GAMES[0];
          const state = game.state.getCurrentState();
          const kid = state.kid;
          game.input.reset(false);
          kid.room = room;
          kid.charX = x;
          kid.charY = PrinceJS.Utils.convertBlockYtoY(row);
          kid.charBlockX = PrinceJS.Utils.convertXtoBlockX(x);
          kid.charBlockY = row;
          if (kid.charFace !== face) {
            kid.changeFace();
          }
          kid.action = "stand";
          kid.charXVel = kid.charYVel = 0;
          kid.inFallDown = kid.inJumpUp = false;
          kid.updateBase();
          kid.processCommand();
          kid.updateCharPosition();
          state.changeRoom(room);
          state.levelHints.update(0);
        },
        [room, x, row, face]
      );
    };
    await place(2, 91, 1);
    assert.equal(await page.evaluate(() => window.firstLevelHints.route.layer.visible), false);
    await page.keyboard.down("ArrowRight");
    await page.waitForFunction(() => window.firstLevelHints.route.layer.visible);
    await page.keyboard.up("ArrowRight");
    const pickup = await page.evaluate(() => {
      const state = Phaser.GAMES[0].state.getCurrentState();
      return {
        collected: state.minigun.pickup.collected,
        owned: state.kid.hasMinigun,
        weapon: state.kid.activeWeapon,
        position: [window.firstLevelHints.route.layer.x, window.firstLevelHints.route.layer.y]
      };
    });
    assert.ok(pickup.collected && pickup.owned);
    assert.equal(pickup.weapon, "minigun");
    await page.keyboard.down("ArrowRight");
    await page.waitForFunction(() => Phaser.GAMES[0].state.getCurrentState().kid.charX > 115);
    await page.keyboard.up("ArrowRight");
    assert.deepEqual(
      await page.evaluate(() => [window.firstLevelHints.route.layer.x, window.firstLevelHints.route.layer.y]),
      pickup.position
    );
    await place(9, 25, 1);
    await page.waitForFunction(() => window.firstLevelHints.hints.find((hint) => hint.door).layer.visible);
    await page.waitForFunction(() => !Phaser.GAMES[0].state.getCurrentState().roomCamera.transition);
    assert.equal(await page.evaluate(() => window.firstLevelHints.route.layer.visible), false);
    if (process.env.PREVIEW_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PREVIEW_SCREENSHOT_DIR, "level-one-exit-hint.png") });
    }
    await page.evaluate(() => window.firstLevelHints.hints.find((hint) => hint.door).button.push());
    await page.waitForFunction(() => !window.firstLevelHints.hints.find((hint) => hint.door).layer.visible);
    await page.waitForFunction(() => Phaser.GAMES[0].state.getCurrentState().level.exitDoors[0].open);
    await place(9, 49, 1, -1);
    await page.keyboard.down("ArrowUp");
    await page.waitForFunction(() => Phaser.GAMES[0].state.getCurrentState().kid.action === "climbstairs");
    await page.keyboard.up("ArrowUp");
    await page.waitForFunction(() => Phaser.GAMES[0].state.getCurrentState().pressButtonToNext);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => Phaser.GAMES[0].state.getCurrentState().level?.number === 2);
    assert.equal(await page.evaluate(() => window.firstLevelHints.hints.length), 0);
    assert.equal(await page.evaluate(() => Phaser.GAMES[0].state.getCurrentState().levelHints.hints.length), 0);
    assert.equal(await page.evaluate(() => Phaser.GAMES[0].state.getCurrentState().kid.hasMinigun), true);
    assert.deepEqual(
      await page.evaluate(() => [Phaser.GAMES[0].settings.volume("sound"), Phaser.GAMES[0].settings.volume("music")]),
      [0, 0]
    );
    assert.deepEqual(errors, []);
  }
);
