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
    assert.equal(await page.locator(".metric").count(), 5);
    assert.equal(await page.locator("#sample").isVisible(), true);
    assert.equal(
      await page.locator(".metric-value").first().textContent(),
      new Intl.NumberFormat("en").format(data.totals.princeDeaths)
    );
    assert((await page.locator("#guards .rank").count()) > 0);
    assert((await page.locator("#traps .rank").count()) > 0);
    assert(await page.locator("#trend svg").isVisible());
    if (process.env.DASHBOARD_SCREENSHOT) {
      await page.screenshot({ path: process.env.DASHBOARD_SCREENSHOT, fullPage: true });
    }
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
          weapons: []
        }
      })
    );
    await page.locator("#refresh").click();
    await page.waitForFunction(() => document.querySelector("#trend .empty"));
    assert.deepEqual(errors, []);
  }
);
