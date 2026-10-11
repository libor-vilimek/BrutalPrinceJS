"use strict";

const { createApp } = require("./app");
const { createEventStore } = require("./store");
const { createHash } = require("node:crypto");
const { readdirSync, readFileSync } = require("node:fs");
const path = require("node:path");

const store = createEventStore({
  uri: process.env.mongoconnectionurl || process.env.MONGODB_URI,
  database: process.env.MONGODB_DATABASE || "brutalprince"
});
const sourceRoot = path.join(__dirname, "../src");
const hash = createHash("sha256");
for (const file of readdirSync(sourceRoot)
  .filter((file) => file.endsWith(".js"))
  .sort()) {
  hash.update(file).update(readFileSync(path.join(sourceRoot, file)));
}
const gameVersion = process.env.SOURCE_VERSION || hash.digest("hex");
const app = createApp({ store, publicOrigin: process.env.PUBLIC_ORIGIN, gameVersion });
// Heroku terminates TLS and supplies one trusted forwarding hop.
if (process.env.DYNO) {
  app.proxy = true;
  app.maxIpsCount = 1;
}
const server = app.listen(Number(process.env.PORT) || 8080);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.once("listening", () =>
  process.stdout.write(`Brutal Prince game and statistics API: http://localhost:${server.address().port}\n`)
);
server.on("error", () => {
  process.stderr.write("Could not start the web server.\n");
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(() =>
      store
        .close()
        .catch(() => {})
        .finally(() => process.exit(0))
    );
    setTimeout(() => process.exit(0), 10000).unref();
  });
}
