"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { createPreviewApp } = require("../tools/preview-server");

test(
  "preview buttons run real casings, tutorial overlays and the full ending without maps, telemetry or saved settings",
  {
    skip: process.env.RUN_BROWSER_TESTS !== "1",
    timeout: 60000
  },
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
    const page = await browser.newPage({ viewport: { width: 1380, height: 1000 } });
    const errors = [],
      requests = [],
      failed = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(new URL(request.url()).pathname));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failed.push(response.url());
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/dev/preview/`);
    const frame = page.frames().find((frame) => frame.url().endsWith("engine.html"));
    await frame.waitForFunction(() => window.PrincePreview?.ready && window.PrincePreview.casings);
    const initial = await frame.evaluate(() => ({
      count: window.PrincePreview.casings.casings.length,
      x: window.PrincePreview.kid.charX,
      height: Math.max(
        ...Object.values(window.PrincePreview.casings.pileColumns[182]).flatMap((columns) => Object.values(columns))
      ),
      parents: window.PrincePreview.casings.casingDepths.map(
        (depth) => depth.graphics.parent === window.PrincePreview.casings.casingBackLayer
      ),
      muted: window.PrincePreview.game.sound.mute && window.PrincePreview.game.sound.noAudio,
      statistics: !!window.PrincePreview.game.statistics,
      campaign: typeof PrinceJS.Game !== "undefined"
    }));
    assert(initial.count > 1000);
    assert.deepEqual(initial.parents, [...Array(5).fill(true), ...Array(5).fill(false)]);
    assert(initial.muted && !initial.statistics && !initial.campaign);
    await frame.waitForFunction((x) => window.PrincePreview.kid.charX !== x, initial.x);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await frame.waitForFunction(() => window.PrincePreview.paused);
    const pausedX = await frame.evaluate(() => window.PrincePreview.kid.charX);
    await page.waitForTimeout(200);
    assert.equal(await frame.evaluate(() => window.PrincePreview.kid.charX), pausedX);
    await page.getByRole("button", { name: "Walk through deep piles" }).click();
    await frame.waitForFunction(() => window.PrincePreview.id === "deep-casings" && !window.PrincePreview.paused);
    const taller = await frame.evaluate(() =>
      Math.max(
        ...Object.values(window.PrincePreview.casings.pileColumns[182]).flatMap((columns) => Object.values(columns))
      )
    );
    assert(taller > initial.height);
    if (process.env.PREVIEW_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PREVIEW_SCREENSHOT_DIR, "preview-casings.png") });
    }
    for (const [button, title] of [
      ["Text and mosaic frame", "The twin flames"],
      ["Weapon selection", "Choose your firepower"],
      ["Shift + Down lesson", "Trust your grip"]
    ]) {
      await page.getByRole("button", { name: button, exact: true }).click();
      await frame.locator(".tutorial-overlay").waitFor({ state: "visible" });
      assert.equal(await frame.locator("#tutorial-title").textContent(), title);
      assert((await frame.locator(".tutorial-glyph").count()) > 100);
      if (process.env.PREVIEW_SCREENSHOT_DIR && button === "Text and mosaic frame") {
        await page.screenshot({ path: path.join(process.env.PREVIEW_SCREENSHOT_DIR, "preview-tutorial.png") });
      }
      await frame.locator(".tutorial-key").first().click();
      await frame.locator(".tutorial-overlay").waitFor({ state: "hidden" });
    }
    await page.getByRole("button", { name: "Play the full ending" }).click();
    await frame.waitForFunction(() => window.PrincePreview.id === "finale" && window.PrincePreview.finale);
    await page.locator("#timeline").fill("15.7");
    await frame.waitForFunction(() => window.PrincePreview.paused && window.PrincePreview.finale.effects.bodyCrushed);
    assert.deepEqual(
      await frame.evaluate(() =>
        window.PrincePreview.scene.front.children
          .filter((child) => child.frameName === "room_pillar")
          .map((pillar) => [pillar.x, pillar.y, pillar.visible])
      ),
      [
        [59, 120, true],
        [240, 120, true]
      ]
    );
    assert.equal(await frame.evaluate(() => window.PrincePreview.finale.effects.archHole.visible), true);
    if (process.env.PREVIEW_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.PREVIEW_SCREENSHOT_DIR, "preview-ending.png") });
    }
    await page.locator("#timeline").fill("2.8");
    await frame.waitForFunction(
      () => window.PrincePreview.elapsed < 3 && window.PrincePreview.finale.pose(window.PrincePreview.elapsed).body.held
    );
    assert.equal(await frame.evaluate(() => window.PrincePreview.finale.effects.archHole.visible), false);
    await page.locator("#timeline").fill("19.95");
    await frame.waitForFunction(() => window.PrincePreview.elapsed > 19.9);
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await frame.waitForFunction(() => window.PrincePreview.finale.complete && window.PrincePreview.paused);
    assert.match(await page.locator("#status").textContent(), /Ending complete/);
    await page.getByRole("button", { name: "Epilogue title", exact: true }).click();
    await frame.waitForFunction(() => window.PrincePreview.epilogue && !window.PrincePreview.finale);
    assert((await frame.evaluate(() => window.PrincePreview.epilogue.brutalDrips.length)) > 0);
    await frame.waitForFunction(() => window.PrincePreview.epilogue.brutalElapsed > 0.1);
    assert.match(await page.locator("#standalone").getAttribute("href"), /demo=epilogue$/);
    await page.getByRole("button", { name: "Walk through growing piles" }).click();
    await frame.waitForFunction(
      () =>
        window.PrincePreview.id === "casings" &&
        !window.PrincePreview.finale &&
        !window.PrincePreview.epilogue &&
        !window.PrincePreview.overlay
    );
    assert.equal(await frame.evaluate(() => localStorage.length), 0);
    assert.equal(
      requests.some((pathname) =>
        /\/api\/|\/assets\/maps\/|\/assets\/(music|sfx)\/|\/src\/(Statistics|GameSettings|Game)\.js/.test(pathname)
      ),
      false
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
  }
);
