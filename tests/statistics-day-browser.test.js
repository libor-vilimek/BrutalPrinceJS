"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createApp } = require("../server/app");

test(
  "statistics single-day picker filters reports, anchors historical charts and survives refreshes",
  { skip: process.env.RUN_BROWSER_TESTS !== "1", timeout: 30000 },
  async (t) => {
    const today = "2026-10-24";
    const selectedDay = "2024-02-29";
    const emptyDay = "2024-03-01";
    const calls = [];
    const listener = createApp({
      store: {
        report: async (options) => {
          calls.push(options);
          const day = options.day || today;
          const count = day === selectedDay ? 3 : day === emptyDay ? 0 : 6;
          const totals = {
            events: count * 4,
            starts: count,
            observations: 0,
            completed: 0,
            princeDeaths: count,
            enemyDeaths: count * 2,
            hpLost: count * 10,
            activeMs: count * 1000
          };
          return {
            currentlyPlaying: 2,
            totals,
            daysRange: options.day ? 1 : options.days,
            rangeStart:
              options.day || new Date(Date.parse(today) - (options.days - 1) * 86400000).toISOString().slice(0, 10),
            days: count ? [{ _id: day, ...totals }] : [],
            levels: count ? [{ _id: { level: 3, map: "campaign:3", revision: "test" }, ...totals }] : [],
            causes: count ? [{ _id: { type: "prince_died", cause: "fire" }, deaths: count }] : [],
            weapons: count ? [{ _id: "molotov", kills: count * 2, shots: count, hits: count }] : [],
            milestones: count ? [{ _id: "jetpack", clients: count, occurrences: count }] : [],
            availableLevels: [{ _id: 3 }],
            guards: [],
            traps: [],
            latestDeaths: count
              ? [{ levelNumber: 3, receivedAt: `${day}T12:00:00.000Z`, payload: { mechanism: "fire" }, count }]
              : [],
            dataSources: count ? [{ _id: "gameplay", events: totals.events }] : []
          };
        }
      }
    }).listen(0, "127.0.0.1");
    await new Promise((resolve) => listener.once("listening", resolve));
    t.after(() => new Promise((resolve) => listener.close(resolve)));
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
    const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
    t.after(() => browser.close());
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
      timezoneId: "America/Los_Angeles"
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install({ time: new Date(`${today}T00:30:00.000Z`) });
    await page.goto(`http://127.0.0.1:${listener.address().port}/statistics`);
    const updated = () => page.waitForFunction(() => document.querySelector("#status").textContent.includes("updated"));
    await updated();
    assert.equal(await page.locator("#day").isVisible(), false);
    await page.locator("#days").selectOption("day");
    await updated();
    assert.equal(await page.locator("#day").isVisible(), true);
    assert.equal(await page.locator("#day").inputValue(), today, "default day uses UTC even before local midnight");
    assert.deepEqual(calls.at(-1), { day: today, level: undefined, source: "all" });

    await page.locator("#day").fill(selectedDay);
    await page.waitForFunction(
      (day) => document.querySelector("#prince-trend [data-day]")?.getAttribute("data-day") === day,
      selectedDay
    );
    assert.equal(await page.locator("#prince-trend [data-day]").count(), 1);
    assert.equal(await page.locator("#prince-trend [data-count]").getAttribute("data-count"), "3");
    assert.equal(await page.locator("#enemy-trend [data-count]").getAttribute("data-count"), "6");
    assert.equal(await page.locator(".metric-value").first().textContent(), "3");
    assert.equal(await page.locator("#levels td").nth(1).textContent(), "3");
    assert((await page.locator("#weapons").textContent()).includes("6 kills"));
    assert.equal(await page.locator('[data-milestone="jetpack"] strong').textContent(), "3");
    assert.equal(await page.locator("#latest-deaths td").nth(4).textContent(), "3");
    assert.equal(await page.locator("#currently-playing .metric-value").textContent(), "2");
    await page.locator("#level").selectOption("3");
    await updated();
    await page.locator("#source").selectOption("gameplay");
    await updated();
    assert.deepEqual(calls.at(-1), { day: selectedDay, level: 3, source: "gameplay" });
    const countBeforeRefresh = calls.length;
    await page.locator("#refresh").click();
    await updated();
    await page.clock.fastForward(15000);
    await updated();
    assert(calls.length >= countBeforeRefresh + 2);
    assert.deepEqual(calls.at(-1), { day: selectedDay, level: 3, source: "gameplay" });
    if (process.env.DAY_SCREENSHOT) {
      await page.screenshot({ path: process.env.DAY_SCREENSHOT });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    for (const id of ["days", "day", "level", "source"]) {
      assert((await page.locator(`#${id}`).boundingBox()).width >= 120, `${id} stays readable on mobile`);
    }
    if (process.env.DAY_MOBILE_SCREENSHOT) {
      await page.screenshot({ path: process.env.DAY_MOBILE_SCREENSHOT });
    }

    await page.locator("#day").fill(emptyDay);
    await page.waitForFunction(() => document.querySelector("#prince-trend .empty"));
    assert.equal(await page.locator(".metric-value").first().textContent(), "0");
    assert.equal(await page.locator("#currently-playing .metric-value").textContent(), "2");
    assert((await page.locator("#latest-deaths").textContent()).includes("No Prince deaths"));
    assert((await page.locator("#levels").textContent()).includes("No level observations"));
    const countBeforeClear = calls.length;
    await page.locator("#day").fill("");
    await page.waitForFunction(() => document.querySelector("#status").textContent.includes("Select a valid UTC day"));
    await page.clock.fastForward(15000);
    assert.equal(calls.length, countBeforeClear, "an empty picker cannot silently fall back to a rolling report");
    await page.locator("#days").selectOption("7");
    await updated();
    assert.equal(await page.locator("#day").isVisible(), false);
    assert.deepEqual(calls.at(-1), { days: 7, level: 3, source: "gameplay" });
    assert.equal(await page.locator("#prince-trend [data-day]").count(), 7);
    assert.deepEqual(errors, []);
  }
);
