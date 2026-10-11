"use strict";

const { spawnSync } = require("node:child_process");
const result = spawnSync(process.execPath, ["--use-system-ca", "--test", "tests/mongodb.integration.test.js"], {
  stdio: "inherit",
  env: { ...process.env, RUN_MONGODB_TESTS: "1" }
});
process.exitCode = result.status ?? 1;
