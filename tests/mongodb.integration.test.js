"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");
const { MongoClient } = require("mongodb");
const { createEventStore } = require("../server/store");
const { createApp } = require("../server/app");
const { fixture } = require("./statistics-fixture");

test(
  "real MongoDB: HTTP batch persistence, indexes, retries, conflicts, mixed validity, concurrent deduplication and expiry",
  {
    skip: process.env.RUN_MONGODB_TESTS !== "1",
    timeout: 60000
  },
  async (t) => {
    const uri = process.env.mongoconnectionurl || process.env.MONGODB_URI;
    assert(uri, "Set mongoconnectionurl in the ignored .env file before running test:mongodb");
    const database = process.env.MONGODB_TEST_DATABASE || "testbrutalprince";
    const collectionName = `test_gameplay_events_${randomUUID().replaceAll("-", "")}`;
    const store = createEventStore({ uri, database, collectionName });
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
    const listener = createApp({ store }).listen(0, "127.0.0.1");
    await new Promise((resolve) => listener.once("listening", resolve));
    t.after(async () => {
      await new Promise((resolve) => listener.close(resolve));
      try {
        // Cleanup is restricted to this run's fresh collection; never wipe a shared or production collection.
        assert(/^test_gameplay_events_[a-f0-9]{32}$/.test(collectionName));
        await client.db(database).collection(collectionName).drop();
      } catch (error) {
        if (error.codeName !== "NamespaceNotFound") {
          // eslint-disable-next-line preserve-caught-error -- The driver cause may contain credentials; do not let the test runner print it.
          throw new Error("MongoDB test collection cleanup failed; driver details suppressed");
        }
      } finally {
        await store.close();
        await client.close();
      }
    });
    async function post(events) {
      const response = await fetch(`http://127.0.0.1:${listener.address().port}/api/v1/gameplay-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaVersion: 1, events })
      });
      assert.equal(response.status, 200, "Real MongoDB did not acknowledge persistence");
      return (await response.json()).results;
    }
    try {
      await client.connect();
      await client.db(database).command({ ping: 1 });
      const f = fixture();
      f.enemy.die = f.PrinceJS.Fighter.prototype.die;
      f.enemy.die(undefined, { mechanism: "fire", actor: f.kid, weapon: "molotov" });
      const events = JSON.parse(JSON.stringify(f.events()));
      const collection = client.db(database).collection(collectionName);
      const first = await post(events);
      assert(first.every((result) => result.status === "stored"));
      assert.equal(await collection.countDocuments(), events.length);
      assert((await post(events)).every((result) => result.status === "duplicate"));
      const death = events.find((event) => event.eventType === "enemy_died");
      assert.equal((await post([{ ...death, eventId: randomUUID() }]))[0].status, "rejected");
      assert.equal(await collection.countDocuments({ eventType: "enemy_died" }), 1);
      const original = await collection.findOne({ eventId: death.eventId });
      assert.equal(original.payload.source.kind, "prince");
      assert(original.expiresAt instanceof Date && original.receivedAt instanceof Date);
      assert.equal(original.expiresAt.getTime() - original.receivedAt.getTime(), 90 * 86400000);
      const indexes = await collection.listIndexes().toArray();
      assert(indexes.some((index) => index.key.eventId && index.unique));
      assert(indexes.some((index) => index.key.semanticKey && index.unique));
      assert(indexes.some((index) => index.expireAfterSeconds === 0));
      const activity = { ...events[0], eventId: randomUUID(), eventType: "room_entered", payload: { fromRoom: 1 } };
      const mixed = await post([{ ...events[0], eventId: randomUUID(), email: "rejected@example.com" }, activity]);
      assert.equal(mixed[0].status, "rejected");
      assert.equal(mixed[1].status, "stored");
      const racing = { ...activity, eventId: randomUUID() };
      const parallel = await Promise.all(Array.from({ length: 5 }, () => post([racing])));
      assert(parallel.every((results) => ["stored", "duplicate"].includes(results[0].status)));
      assert.equal(await collection.countDocuments({ eventId: racing.eventId }), 1);
      const summary = await collection
        .aggregate([
          { $match: { eventType: "enemy_died" } },
          { $group: { _id: "$payload.mechanism", deaths: { $sum: 1 } } }
        ])
        .toArray();
      assert.deepEqual(summary, [{ _id: "fire", deaths: 1 }]);
      const report = await store.report({ days: 30 });
      assert.equal(report.totals.enemyDeaths, 1);
      assert.equal(report.totals.starts, 1);
      assert.equal(report.weapons.find((row) => row._id === "molotov").kills, 1);
      assert.equal((await store.report({ days: 7, level: 99 })).totals.events, 0);
      f.kid.die = f.PrinceJS.Fighter.prototype.die;
      f.kid.die(undefined, { mechanism: "sword", actor: f.enemy, weapon: "sword" });
      await post(JSON.parse(JSON.stringify(f.events())));
      const actual = await store.report({ days: 30, source: "gameplay" });
      assert.equal(actual.totals.princeDeaths, 1);
      assert.equal(actual.latestDeaths[0].payload.mechanism, "sword");
      assert.deepEqual(actual.storage, { database, collection: collectionName });
      const sample = { ...activity, eventId: randomUUID() };
      await post([sample]);
      await collection.updateOne({ eventId: sample.eventId }, { $set: { sampleData: true } });
      const samples = await store.report({ days: 30, source: "samples" });
      assert.equal(samples.totals.events, 1);
      assert.equal(samples.totals.princeDeaths, 0);
      assert.equal((await store.report({ days: 30, source: "gameplay" })).totals.events, actual.totals.events);
    } catch (error) {
      if (error instanceof assert.AssertionError) {
        throw error;
      }
      // eslint-disable-next-line preserve-caught-error -- The driver cause may contain credentials; do not let the test runner print it.
      throw new Error("MongoDB integration operation failed; credentials and driver details suppressed");
    }
  }
);
