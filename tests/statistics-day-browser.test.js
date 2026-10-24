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
    const zeroDay = "2026-10-23";
    const calls = [];
    const listener = createApp({
      store: {
        report: async (options) => {
          calls.push(options);
          const day = options.day || today;
          const count = day === selectedDay ? 3 : [emptyDay, zeroDay].includes(day) ? 0 : 6;
          const totals = {
            events: count * 4,
            starts: count,
            observations: 0,
            completed: count ? 1 : 0,
            princeDeaths: count,
            enemyDeaths: count * 2,
            hpLost: count * 10,
            activeMs: count * 1000,
            clients: count ? 3 : 0,
            startedClients: count ? 2 : 0,
            completedClients: count ? 1 : 0,
            princeDeathClients: count ? 1 : 0,
            enemyDeathClients: count ? 2 : 0,
            activeClients: count ? 2 : 0,
            damagedClients: count ? 1 : 0
          };
          return {
            currentlyPlaying: 2,
            totals,
            daysRange: options.day ? 1 : options.days,
            rangeStart:
              options.day || new Date(Date.parse(today) - (options.days - 1) * 86400000).toISOString().slice(0, 10),
            days: count ? [{ _id: day, ...totals }] : [],
            levels: count ? [{ _id: { level: 3, map: "campaign:3", revision: "test" }, ...totals }] : [],
            causes: count ? [{ _id: { type: "prince_died", cause: "fire" }, deaths: count, clients: 1 }] : [],
            weapons: count
              ? [{ _id: "molotov", kills: count * 2, shots: count, hits: count, usedClients: 1, killClients: 2 }]
              : [],
            milestones: count ? [{ _id: "jetpack", clients: count, occurrences: count }] : [],
            availableLevels: [{ _id: 3 }],
            guards: [],
            traps: [],
            latestDeaths: count
              ? [{ levelNumber: 3, receivedAt: `${day}T12:00:00.000Z`, payload: { mechanism: "fire" }, count }]
              : [],
            dataSources: count ? [{ _id: "gameplay", events: totals.events, clients: 3 }] : []
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
    await page.locator(`#prince-trend [data-day="${today}"]`).hover();
    assert.equal(await page.locator("#days").inputValue(), "30", "hover only displays counts");
    assert((await page.locator("#prince-trend-value").textContent()).includes("1 client"));
    await page.locator(`#enemy-trend [data-day="${today}"]`).click();
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
    assert.equal(await page.locator("#levels td").nth(1).locator("span").textContent(), "3");
    assert.equal(await page.locator("#levels td").nth(1).locator("small").textContent(), "2 clients");
    assert.equal(await page.locator("#levels td").nth(2).locator("small").textContent(), "1 client");
    assert((await page.locator(".metric-note").nth(2).textContent()).includes("2 clients started"));
    assert((await page.locator(".metric-note").nth(3).textContent()).includes("1 client finished"));
    assert((await page.locator("#status").textContent()).includes("3 clients"));
    assert((await page.locator("#causes").textContent()).includes("1 client"));
    assert.equal(await page.locator("#prince-trend [data-clients]").getAttribute("data-clients"), "1");
    assert((await page.locator("#weapons").textContent()).includes("6 kills"));
    assert((await page.locator("#weapons").textContent()).includes("1 client used · 2 clients with kills"));
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
    await page.locator(`#prince-trend [data-day="${zeroDay}"]`).click();
    await page.waitForFunction(() => document.querySelector("#prince-trend .empty"));
    assert.deepEqual(calls.at(-1), { day: zeroDay, level: 3, source: "gameplay" });
    assert.equal(await page.locator("#day").inputValue(), zeroDay);
    assert.equal(await page.locator("#days").inputValue(), "day");
    for (const [chart, key] of [
      ["prince-trend", "Enter"],
      ["enemy-trend", "Space"]
    ]) {
      await page.locator("#days").selectOption("7");
      await updated();
      await page.locator(`#${chart} [data-day="${today}"]`).focus();
      assert.equal(await page.locator("#days").inputValue(), "7", "focus only displays counts");
      await page.locator(`#${chart} [data-day="${today}"]`).press(key);
      await updated();
      assert.deepEqual(calls.at(-1), { day: today, level: 3, source: "gameplay" });
      assert.equal(await page.locator("#days").inputValue(), "day");
      assert.equal(await page.locator("#day").inputValue(), today);
      assert.equal(await page.locator("#prince-trend [data-day]").count(), 1);
    }
    assert.deepEqual(errors, []);
  }
);
