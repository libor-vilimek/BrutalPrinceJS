"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");
const { MongoClient, BSON } = require("mongodb");
const { createEventStore } = require("../server/store");
const { createApp } = require("../server/app");
const { fixture } = require("./statistics-fixture");
const { StatisticsSummary } = require("../src/StatisticsSummary");
const { readCurrentlyPlaying } = require("../server/currently-playing");

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
      assert(indexes.some((index) => index.key.updatedAt && index.key.clientId));
      assert(indexes.some((index) => index.key.receivedAt && index.key.sessionId));
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
      assert.equal(report.currentlyPlaying, 1, "multiple legacy updates from one session count once");
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

      async function compact(clientId, levels) {
        const response = await fetch(`http://127.0.0.1:${listener.address().port}/api/v2/gameplay-statistics`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schemaVersion: 2, clientId, levels })
        });
        assert.equal(response.status, 200);
        return (await response.json()).results;
      }
      const clientId = randomUUID();
      const accumulated = new StatisticsSummary();
      const key = accumulated.add(events[0]);
      const older = accumulated.snapshot(key);
      for (let kill = 0; kill < 1000; kill++) {
        accumulated.add(death);
      }
      for (let fatal = 0; fatal < 3; fatal++) {
        for (const row of JSON.parse(JSON.stringify(f.events())).filter((row) =>
          ["prince_damaged", "prince_died"].includes(row.eventType)
        )) {
          accumulated.add(row);
        }
      }
      const newer = accumulated.snapshot(key);
      const invalid = { ...newer, counters: { ...newer.counters, enemyDeaths: 1001 } };
      const compactMixed = await compact(clientId, [invalid, newer]);
      assert.equal(compactMixed[0].status, "rejected");
      assert.equal(compactMixed[1].status, "stored");
      await Promise.all(Array.from({ length: 4 }, () => compact(clientId, [newer])));
      await compact(clientId, [older]); // Late retry must never decrease an already stored counter.
      assert.equal(await collection.countDocuments({ clientId }), 1);
      const document = await collection.findOne({ clientId });
      assert.equal(document.counters.enemyDeaths, 1000);
      assert.equal(document.counters.princeDeaths, 3);
      assert.equal(Object.values(document.kills).length, 1);
      assert.equal(Object.values(document.deaths)[0].count, 3);
      assert.equal(Object.values(document.damage)[0].hits, 3);
      assert(!JSON.stringify(document).includes("victimInstanceId"));
      assert(BSON.calculateObjectSize(document) < BSON.calculateObjectSize(original) * 1000 * 0.01);
      assert(document.expiresAt instanceof Date);
      const combined = await store.report({ days: 30, source: "gameplay" });
      assert.equal(combined.totals.enemyDeaths, 1001);
      assert.equal(combined.totals.princeDeaths, 4);
      assert.equal(combined.totals.hpLost, actual.totals.hpLost * 4);
      assert.equal(combined.guards[0].kills, 4);
      assert.equal(combined.guardsPerPlayer[0].levelStarters, 2, "legacy session and compact client each count once");
      assert.equal(combined.guardsPerPlayer[0].killsPer100Starters, 200);
      assert.equal(combined.latestDeaths.find((row) => row.count === 3).payload.mechanism, "sword");
      assert.equal(combined.weapons.find((row) => row._id === "molotov").kills, 1001);
      const freshId = randomUUID();
      await Promise.all(Array.from({ length: 4 }, () => compact(freshId, [newer])));
      assert.equal(await collection.countDocuments({ clientId: freshId }), 1);

      // A client appearing on multiple days/revisions is one client, while occurrences are summed.
      const milestoneClient = randomUUID();
      const secondClient = randomUUID();
      const milestoneSummary = (day, revision) => {
        const accumulator = new StatisticsSummary();
        const base = {
          ...events[0],
          mapId: "campaign:6",
          mapRevision: revision,
          levelNumber: 6,
          occurredAt: `${day}T12:00:00.000Z`
        };
        let key;
        for (const change of ["exit_door_destroyed", "door_destroyed", "wall_destroyed", "rocket_intercepted"]) {
          key = accumulator.add({ ...base, eventType: "environment_changed", payload: { change } });
        }
        accumulator.add({ ...base, eventType: "max_health_changed", payload: { amount: 1 } });
        accumulator.add({ ...base, eventType: "jetpack_changed", payload: { enabled: true } });
        accumulator.add({ ...base, eventType: "jetpack_changed", payload: { enabled: false } });
        accumulator.add({
          ...base,
          eventType: "enemy_died",
          payload: { enemyType: "jaffar", mechanism: "explosion", weapon: "rocket_launcher" }
        });
        return accumulator.snapshot(key);
      };
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const milestones = [milestoneSummary(today, "milestone-a"), milestoneSummary(yesterday, "milestone-b")];
      await compact(milestoneClient, milestones);
      await compact(milestoneClient, milestones); // Replaying counts cannot add occurrences or clients.
      await compact(secondClient, [milestones[0]]);
      const milestoneReport = await store.report({ days: 30, level: 6 });
      for (const row of milestoneReport.milestones) {
        assert.equal(row.clients, 2, row._id);
        assert.equal(row.occurrences, row._id === "doors" ? 6 : 3, row._id);
      }
      assert.equal(milestoneReport.milestones.length, 7);
      await collection.updateOne({ clientId: secondClient }, { $set: { sampleData: true } });
      assert(
        (await store.report({ days: 30, level: 6, source: "gameplay" })).milestones.every((row) => row.clients === 1)
      );
      assert(
        (await store.report({ days: 30, level: 6, source: "samples" })).milestones.every(
          (row) => row.clients === 1 && row.occurrences === (row._id === "doors" ? 2 : 1)
        )
      );
      assert.equal((await store.report({ days: 30, level: 99 })).milestones.length, 0);
      const oldJetpack = structuredClone(milestones[0]);
      delete oldJetpack.counters.jetpackUses;
      await compact(randomUUID(), [oldJetpack]);
      await post([
        {
          ...events[0],
          eventId: randomUUID(),
          levelNumber: 6,
          eventType: "jetpack_changed",
          payload: { enabled: true }
        }
      ]);
      const jets = (await store.report({ days: 30, level: 6 })).milestones.find((row) => row._id === "jetpack");
      assert.equal(jets.clients, 4);
      assert.equal(jets.occurrences, 5);

      // A rare level must rank ahead of common sources even outside the absolute top eight.
      const rankingSummary = (levelNumber, day, starts, count, sources = 1, revision = "danger-test") => {
        const base = {
          mapId: `campaign:${levelNumber}`,
          mapRevision: revision,
          levelNumber,
          day,
          counters: { starts, princeDeaths: count * sources * 2, hpLost: count * sources * 20 },
          kills: [],
          damage: [],
          deaths: [],
          weapons: [],
          rooms: [],
          extras: []
        };
        for (let index = 1; index <= sources; index++) {
          for (const source of [
            { kind: "guard", guardId: index, roomId: 1, spawnLocation: { roomId: 1, tileColumn: index, tileRow: 1 } },
            { kind: "tile", roomId: 1, tileColumn: index, tileRow: 1, tileType: 18 }
          ]) {
            if (!count) {
              continue;
            }
            const cause = source.kind === "guard" ? "sword" : "chopper";
            base.damage.push({ cause, source, hits: count, hpLost: count * 10 });
            base.deaths.push({
              cause,
              source,
              location: { roomId: 1, tileColumn: index, tileRow: 1 },
              weapon: "unknown",
              count,
              lastAt: `${day}T00:00:01.000Z`
            });
          }
        }
        return base;
      };
      for (let index = 0; index < 10; index++) {
        const results = await compact(randomUUID(), [
          rankingSummary(70, today, 3, index === 0 ? 20 : 0, 9),
          rankingSummary(70, yesterday, 2, 0, 9)
        ]);
        assert(results.every((result) => result.status === "stored"));
      }
      const rareClient = randomUUID();
      await compact(rareClient, [rankingSummary(71, today, 3, 3), rankingSummary(71, yesterday, 2, 1)]);
      await compact(randomUUID(), [rankingSummary(72, today, 0, 100)]);
      await compact(randomUUID(), [rankingSummary(71, today, 1, 0, 1, "different-revision")]);
      const ranked = await store.report({ days: 7 });
      assert(!ranked.guards.some((row) => row._id.level === 71));
      assert(!ranked.traps.some((row) => row._id.level === 71));
      for (const rows of [ranked.guardsPerPlayer, ranked.trapsPerPlayer]) {
        assert.equal(rows[0]._id.level, 71);
        assert.equal(rows[0].levelStarters, 1);
        assert.equal(rows[0].kills, 4);
        assert.equal(rows[0].killsPer100Starters, 400);
        assert(!rows.some((row) => row._id.level === 72), "zero denominators are excluded");
        const common = rows.find((row) => row._id.level === 70);
        assert.equal(common.levelStarters, 10);
        assert.equal(common.killsPer100Starters, 200);
      }
      const perDay = await store.report({ days: 7, level: 71 });
      assert.equal(perDay.days.find((day) => day._id === yesterday).princeDeaths, 2);
      assert.equal(perDay.days.find((day) => day._id === today).princeDeaths, 6);
      await collection.updateMany({ clientId: rareClient }, { $set: { sampleData: true } });
      assert.equal((await store.report({ days: 7, level: 71, source: "gameplay" })).guardsPerPlayer.length, 0);
      assert.equal(
        (await store.report({ days: 7, level: 71, source: "samples" })).guardsPerPlayer[0].killsPer100Starters,
        400
      );
      await t.test(
        "currently playing uses unique server receipts within 180 seconds, independent of history",
        async () => {
          const expired = new Date(Date.now() - 3600000);
          // Only this run's private test collection is changed; existing fixtures become inactive.
          await collection.updateMany({}, { $set: { updatedAt: expired, receivedAt: expired } });
          assert.equal((await store.report()).currentlyPlaying, 0);
          const liveClient = randomUUID();
          const liveRows = [rankingSummary(80, today, 1, 0), rankingSummary(81, yesterday, 1, 0)];
          assert((await compact(liveClient, liveRows)).every((row) => row.status === "stored"));
          const response = await fetch(
            `http://127.0.0.1:${listener.address().port}/api/v1/statistics?days=7&level=99&source=samples`
          );
          const liveReport = await response.json();
          assert.equal(liveReport.totals.events, 0);
          assert.equal(
            liveReport.currentlyPlaying,
            1,
            "live clients are global, even in an empty historical selection"
          );
          await collection.updateMany({ clientId: liveClient }, { $set: { updatedAt: expired, receivedAt: expired } });
          assert.equal(await readCurrentlyPlaying(collection), 0);
          await compact(liveClient, [liveRows[1]]);
          assert.equal(await readCurrentlyPlaying(collection), 1, "a receipt refreshes an existing older-day summary");
          await compact(randomUUID(), [invalid]);
          assert.equal(await readCurrentlyPlaying(collection), 1, "rejected updates cannot create active clients");

          const now = new Date();
          const boundary = new Date(now.getTime() - 180000);
          const outside = new Date(boundary.getTime() - 1);
          const future = new Date(now.getTime() + 3600000);
          const document = await collection.findOne({ clientId: liveClient });
          const compactReceipt = (fields) => {
            const id = randomUUID();
            return {
              ...document,
              _id: id,
              eventId: id,
              clientId: randomUUID(),
              receivedAt: now,
              updatedAt: now,
              ...fields
            };
          };
          const legacyClient = randomUUID();
          const legacyReceipt = (fields) => ({
            ...events[0],
            eventId: randomUUID(),
            sessionId: legacyClient,
            receivedAt: now,
            ...fields
          });
          await collection.insertMany([
            compactReceipt({ updatedAt: boundary, receivedAt: expired }),
            compactReceipt({ updatedAt: outside }),
            compactReceipt({ updatedAt: future }),
            compactReceipt({ sampleData: true }),
            compactReceipt({ clientId: null }),
            legacyReceipt({ sessionId: liveClient }),
            legacyReceipt({ occurredAt: expired.toISOString() }),
            legacyReceipt({ occurredAt: future.toISOString() }),
            legacyReceipt({ sessionId: randomUUID(), receivedAt: boundary }),
            legacyReceipt({ sessionId: randomUUID(), receivedAt: outside, occurredAt: now.toISOString() }),
            legacyReceipt({ sessionId: randomUUID(), sampleData: true })
          ]);
          assert.equal(
            await readCurrentlyPlaying(collection, now),
            4,
            "count clients once, include exactly 180s, ignore client clocks, samples and future/expired server times"
          );
          assert.equal(
            await readCurrentlyPlaying(collection, new Date(now.getTime() + 180001)),
            0,
            "clients expire without receiving any further updates"
          );
        }
      );
    } catch (error) {
      if (error instanceof assert.AssertionError) {
        throw error;
      }
      // eslint-disable-next-line preserve-caught-error -- The driver cause may contain credentials; do not let the test runner print it.
      throw new Error("MongoDB integration operation failed; credentials and driver details suppressed");
    }
  }
);
