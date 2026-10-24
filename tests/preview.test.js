"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createPreviewApp } = require("../tools/preview-server");

test("the local preview serves isolated demos but has no database, game page, private files or write API", async (t) => {
  const server = createPreviewApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /data-demo="casings"/);
  const engine = await fetch(origin + "/dev/preview/engine.html");
  const html = await engine.text();
  assert.equal(engine.status, 200);
  assert.match(html, /Finale.js/);
  assert.match(html, /TutorialOverlay.js/);
  assert.match(html, /LevelHints.js/);
  assert.doesNotMatch(html, /Statistics|GameSettings|\/Game.js|Preloader/);
  for (const pathname of ["/.env", "/server/index.js", "/package.json", "/index.html", "/api/v2/gameplay-statistics"]) {
    assert.equal((await fetch(origin + pathname)).status, 404, pathname);
  }
  assert.equal((await fetch(origin + "/api/v2/gameplay-statistics", { method: "POST", body: "{}" })).status, 405);
  assert.equal((await fetch(origin + "/assets/gfx/kid.json")).status, 200);
  assert.equal(
    Object.keys(require.cache).some((filename) => /[\\/]mongodb[\\/]/.test(filename)),
    false
  );
});
