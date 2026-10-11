"use strict";

const { MongoClient } = require("mongodb");
const { createApp } = require("../server/app");
const { createEventStore } = require("../server/store");
const { sampleEvents } = require("./statistics-sample-data");
const { StatisticsSummary } = require("../src/StatisticsSummary");

// Deliberately fixed: destructive preview commands cannot be redirected to production by environment variables.
const database = "testbrutalprince";
const collectionName = "test_dashboard_events";
const uri = process.env.mongoconnectionurl || process.env.MONGODB_URI;
async function main() {
  const action = process.argv[2] || "preview";
  if (!["preview", "seed", "wipe", "reset"].includes(action)) {
    throw new Error("Unknown preview command");
  }
  if (!uri) {
    throw new Error("MongoDB is not configured");
  }
  const store = createEventStore({ uri, database, collectionName });
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  let server;
  try {
    await client.connect();
    const collection = client.db(database).collection(collectionName);
    if (action === "wipe" || action === "reset") {
      try {
        await collection.drop();
      } catch (error) {
        if (error.codeName !== "NamespaceNotFound") {
          throw error;
        }
      }
      process.stdout.write(`Cleared ${database}.${collectionName}.\n`);
    }
    if (action === "seed" || action === "reset") {
      // Exercise compact gameplay persistence. Synthetic play dates populate the daily chart.
      server = createApp({ store }).listen(0, "127.0.0.1");
      await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
      const events = sampleEvents();
      const clientId = events[0].sessionId;
      const summaries = new StatisticsSummary();
      for (const event of events) {
        summaries.add(event);
      }
      const levels = [...summaries.levels.keys()].map((key) => summaries.snapshot(key));
      for (let offset = 0; offset < levels.length; offset += 30) {
        const batch = levels.slice(offset, offset + 30);
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v2/gameplay-statistics`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schemaVersion: 2, clientId, levels: batch }),
          signal: AbortSignal.timeout(15000)
        });
        if (!response.ok || (await response.json()).results.some((result) => result.status !== "stored")) {
          throw new Error("Sample batch was not stored");
        }
        await collection.bulkWrite(
          batch.map((level) => ({
            updateOne: {
              filter: { _id: `summary:${clientId}:${StatisticsSummary.key(level)}` },
              update: {
                $set: {
                  sampleData: true
                }
              }
            }
          }))
        );
      }
      await new Promise((resolve) => server.close(resolve));
      server = null;
      process.stdout.write(
        `Stored ${levels.length} compact summaries from ${events.length} sample observations via the API in ${database}.${collectionName}.\n`
      );
    }
    if (action === "preview") {
      const app = createApp({ store, dashboard: true, sampleData: true });
      server = app.listen(Number(process.env.STATISTICS_PREVIEW_PORT) || 8081, "127.0.0.1");
      await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
      process.stdout.write(`Statistics preview: http://127.0.0.1:${server.address().port}/statistics\n`);
      await new Promise((resolve) => {
        process.once("SIGINT", resolve);
        process.once("SIGTERM", resolve);
      });
    }
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await store.close();
    await client.close();
  }
}
main().catch(() => {
  process.stderr.write(
    "Statistics preview operation failed. Check local MongoDB configuration, access and port; driver details suppressed.\n"
  );
  process.exitCode = 1;
});
