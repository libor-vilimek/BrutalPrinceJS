"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

test(
  "local MongoDB dashboard renders metrics, real filters, empty state and responsive layout",
  {
    skip: process.env.RUN_DASHBOARD_TESTS !== "1",
    timeout: 60000
  },
  async (t) => {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
    const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const base = process.env.STATISTICS_PREVIEW_URL || "http://127.0.0.1:8081";
    const response = await fetch(base + "/api/v1/statistics?days=30");
    assert.equal(response.status, 200);
    const data = await response.json();
    assert(data.sampleData && data.totals.events > 0);
    await page.goto(base + "/statistics");
    await page.waitForFunction(() => document.getElementById("status").textContent.includes("updated"));
    assert.equal(await page.locator(".metric").count(), 6);
    assert.equal(await page.locator("#currently-playing .metric-value").textContent(), String(data.currentlyPlaying));
    assert.equal(await page.locator("#milestones .weapon").count(), 7);
    for (const milestone of data.milestones || []) {
      const card = page.locator(`[data-milestone="${milestone._id}"]`);
      assert.equal(await card.locator("strong").textContent(), new Intl.NumberFormat("en").format(milestone.clients));
      assert(
        (await card.locator("p").textContent()).startsWith(new Intl.NumberFormat("en").format(milestone.occurrences))
      );
    }
    assert.equal(await page.locator("#sample").isVisible(), true);
    assert.equal(await page.locator("#storage").textContent(), "testbrutalprince.test_dashboard_events");
    assert.equal(
      await page.locator(".metric-value").first().textContent(),
      new Intl.NumberFormat("en").format(data.totals.princeDeaths)
    );
    assert((await page.locator("#guards .rank").count()) > 0);
    assert((await page.locator("#traps .rank").count()) > 0);
    assert(await page.locator("#prince-trend svg").isVisible());
    assert(await page.locator("#enemy-trend svg").isVisible());
    const milestones = ["exitDoors", "healthPotions", "jaffar", "jetpack", "laserRockets", "doors", "walls"].map(
      (_id, index) => ({ _id, clients: index + 2, occurrences: index + 12 })
    );
    await page.route("**/api/v1/statistics?**", (route) => route.fulfill({ json: { ...data, milestones } }));
    await page.locator("#refresh").click();
    await page.waitForFunction(() => document.querySelector('[data-milestone="exitDoors"] strong').textContent === "2");
    for (const row of milestones) {
      const card = page.locator(`[data-milestone="${row._id}"]`);
      assert.equal(await card.locator("strong").textContent(), String(row.clients));
      assert((await card.locator("p").textContent()).startsWith(String(row.occurrences)));
    }
    await page.unroute("**/api/v1/statistics?**");
    await page.locator("#days").selectOption("7");
    await page.waitForFunction(() => document.getElementById("status").textContent.includes("updated"));
    await page.locator("#level").selectOption("3");
    await page.waitForFunction(
      () =>
        document.getElementById("status").textContent.includes("updated") &&
        document.querySelectorAll("#levels tr").length === 1
    );
    assert((await page.locator("#levels").textContent()).includes("Level 3"));
    const expected = await (await fetch(base + "/api/v1/statistics?days=7&level=3")).json();
    assert.equal(
      await page.locator(".metric-value").first().textContent(),
      new Intl.NumberFormat("en").format(expected.totals.princeDeaths)
    );
    await page.locator("#source").selectOption("gameplay");
    const gameplay = await (await fetch(base + "/api/v1/statistics?days=7&level=3&source=gameplay")).json();
    await page.waitForFunction(
      () =>
        document.getElementById("status").textContent.includes("updated") &&
        !document.getElementById("data-counts").textContent.includes("sample")
    );
    assert.equal(
      await page.locator(".metric-value").first().textContent(),
      new Intl.NumberFormat("en").format(gameplay.totals.princeDeaths)
    );
    await page.locator("#level").selectOption("");
    const allGameplay = await (await fetch(base + "/api/v1/statistics?days=7&source=gameplay")).json();
    await page.waitForFunction(
      (expected) =>
        document.getElementById("status").textContent.includes("updated") &&
        document.querySelector(".metric-value").textContent === expected,
      new Intl.NumberFormat("en").format(allGameplay.totals.princeDeaths)
    );
    if (process.env.DASHBOARD_SCREENSHOT) {
      await page.screenshot({ path: process.env.DASHBOARD_SCREENSHOT });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    // A filtered period with no observations must still render an explicit empty state.
    await page.route("**/api/v1/statistics?**", (route) =>
      route.fulfill({
        json: {
          ...data,
          totals: {
            events: 0,
            starts: 0,
            observations: 0,
            princeDeaths: 0,
            enemyDeaths: 0,
            completed: 0,
            hpLost: 0,
            activeMs: 0
          },
          days: [],
          levels: [],
          causes: [],
          guards: [],
          traps: [],
          guardsPerPlayer: [],
          trapsPerPlayer: [],
          weapons: [],
          latestDeaths: [],
          dataSources: [],
          milestones: []
        }
      })
    );
    await page.locator("#refresh").click();
    await page.waitForFunction(() => document.querySelector("#prince-trend .empty"));
    // A background batch arriving after the dashboard loaded must become visible without a manual refresh.
    await page.clock.install();
    await page.unroute("**/api/v1/statistics?**");
    await page.route("**/api/v1/statistics?**", (route) =>
      route.fulfill({ json: { ...data, totals: { ...data.totals, princeDeaths: data.totals.princeDeaths + 1 } } })
    );
    await page.clock.fastForward(15000);
    await page.waitForFunction(
      (expected) => document.querySelector(".metric-value").textContent === expected,
      new Intl.NumberFormat("en").format(data.totals.princeDeaths + 1)
    );
    assert.deepEqual(errors, []);
  }
);
