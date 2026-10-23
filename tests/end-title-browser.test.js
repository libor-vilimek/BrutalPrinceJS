"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { createPreviewApp } = require("../tools/preview-server");

test(
  "the epilogue preserves native story artwork, adds a dripping BRUTAL title, and keeps its fade and skip lifecycle",
  { skip: process.env.RUN_BROWSER_TESTS !== "1", timeout: 30000 },
  async (t) => {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
    const server = createPreviewApp().listen(0, "127.0.0.1");
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
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin + "/dev/preview/engine.html");
    await page.waitForFunction(() => window.PrincePreview?.ready);
    await page.addScriptTag({ url: origin + "/src/EndTitle.js" });
    await page.evaluate(async () => {
      const preview = window.PrincePreview;
      preview.paused = true;
      preview.clear();
      preview.game.world.removeAll();
      const game = preview.game;
      if (!game.cache.getFrameData("title")) {
        await new Promise((resolve) => {
          game.load.onLoadComplete.addOnce(resolve);
          game.load.atlasJSONHash("title", "/assets/gfx/title.png", "/assets/gfx/title.json");
          game.load.start();
        });
      }
      window.epilogueTransitions = [];
      const epilogue = (window.epilogue = Object.create(PrinceJS.EndTitle.prototype));
      Object.assign(epilogue, {
        game,
        world: game.world,
        input: game.input,
        state: { start: (name) => window.epilogueTransitions.push(name) }
      });
      epilogue.create();
    });
    const artwork = await page.evaluate(() => {
      const epilogue = window.epilogue;
      const game = epilogue.game;
      const bitmap = game.make.bitmapData(320, 200);
      const source = game.make.image(0, 0, "title", "the_tyrant");
      bitmap.draw(source, 0, 0);
      const original = bitmap.ctx.getImageData(0, 0, 320, 200).data;
      const revised = epilogue.brutalEpilogueBitmap.ctx.getImageData(0, 0, 320, 200).data;
      let unchanged = true,
        titleExact = true,
        redInk = 0;
      const white = (pixels, x, y) => {
        const index = (y * 320 + x) * 4;
        return pixels[index] > 200 && pixels[index + 1] > 200 && pixels[index + 2] > 200;
      };
      for (let y = 0; y < 200; y++) {
        for (let x = 0; x < 320; x++) {
          const index = (y * 320 + x) * 4;
          if (x < 18 || x >= 302 || y < 79 || y >= 174) {
            for (let channel = 0; channel < 4; channel++) {
              unchanged &&= original[index + channel] === revised[index + channel];
            }
          }
          if (x >= 132 && x < 267 && y >= 155 && y < 165) {
            titleExact &&= white(original, x + 12, y - 5) === white(revised, x, y);
          }
          if (x >= 54 && x < 124 && y >= 152 && y < 166 && revised[index] > 140 && revised[index + 1] < 50) {
            redInk++;
          }
        }
      }
      source.destroy();
      bitmap.destroy();
      const shapes = [];
      const drawRect = epilogue.brutalBlood.drawRect;
      epilogue.brutalBlood.drawRect = function (...shape) {
        shapes.push(shape);
        return drawRect.apply(this, shape);
      };
      epilogue.updateBrutalEpilogue(0.6);
      const first = JSON.stringify(shapes);
      shapes.length = 0;
      epilogue.updateBrutalEpilogue(0.8);
      const animated = first !== JSON.stringify(shapes);
      const clipped = shapes.every(([x, y, width, height]) => x >= 54 && x + width < 125 && y + height <= 174);
      epilogue.brutalBlood.drawRect = drawRect;
      return {
        unchanged,
        titleExact,
        redInk,
        animated,
        clipped,
        streams: epilogue.brutalDrips.length,
        attached: epilogue.brutalBlood.parent === epilogue.back,
        muted: game.sound.noAudio && game.sound.mute && game.sound.volume === 0
      };
    });
    assert(artwork.unchanged, "original mosaic, drop cap, opening lines and bottom border stay pixel exact");
    assert(artwork.titleExact, "the final PRINCE OF PERSIA lettering is copied from the original story art");
    assert(artwork.redInk > 200 && artwork.streams >= 6);
    assert(artwork.animated && artwork.clipped && artwork.attached && artwork.muted);
    const lifecycle = await page.evaluate(() => {
      const epilogue = window.epilogue;
      epilogue.tick = 100;
      epilogue.update();
      const fadeIn = epilogue.tween1.isRunning;
      epilogue.back.alpha = 1;
      epilogue.game.tweens.remove(epilogue.tween1);
      epilogue.tick = 1250;
      epilogue.update();
      const wipe = epilogue.tween2.isRunning;
      epilogue.game.tweens.remove(epilogue.tween2);
      epilogue.cropRect.width = 0;
      epilogue.textBack.updateCrop();
      return { fadeIn, wipe };
    });
    assert(lifecycle.fadeIn && lifecycle.wipe);
    if (process.env.PREVIEW_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PREVIEW_SCREENSHOT_DIR, "epilogue-brutal.png") });
    }
    const exit = await page.evaluate(() => {
      const epilogue = window.epilogue;
      epilogue.tick = 7250;
      epilogue.update();
      const fadeOut = epilogue.tween3.isRunning && !epilogue.back.visible;
      epilogue.tween3.onComplete.dispatch();
      const automatic = [...window.epilogueTransitions];
      window.epilogueTransitions.length = 0;
      epilogue.next();
      const skipped = [...window.epilogueTransitions];
      const bitmap = epilogue.brutalEpilogueBitmap;
      const blood = epilogue.brutalBlood;
      epilogue.shutdown();
      return {
        fadeOut,
        automatic,
        skipped,
        cleaned:
          !epilogue.brutalEpilogueBitmap && epilogue.brutalDrips.length === 0 && !blood.parent && !bitmap.texture.valid
      };
    });
    assert(exit.fadeOut && exit.cleaned);
    assert.deepEqual(exit.automatic, ["Title"]);
    assert.deepEqual(exit.skipped, ["Title"]);
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => window.epilogue.input.keyboard.onDownCallback), null);
    assert.deepEqual(errors, []);
  }
);
