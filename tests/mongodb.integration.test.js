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
      await t.test("single-day reports respect UTC boundaries for compact and legacy data", async () => {
        const midnight = Date.parse(yesterday);
        const legacyRows = [-1, 0, 86400000 - 1, 86400000].map((offset) => ({
          ...death,
          eventId: randomUUID(),
          sessionId: randomUUID(),
          mapId: "campaign:90",
          mapRevision: "danger-test",
          levelNumber: 90,
          receivedAt: new Date(midnight + offset)
        }));
        await collection.insertMany(legacyRows);
        const daily = (day, count) => ({
          ...rankingSummary(90, day, 1, count),
          counters: { starts: 1, princeDeaths: count * 2, hpLost: count * 20, enemyDeaths: count },
          kills: [{ cause: "fire", weapon: "molotov", count }]
        });
        assert(
          (await compact(randomUUID(), [daily(yesterday, 3), daily(today, 7)])).every((row) => row.status === "stored")
        );
        const response = await fetch(
          `http://127.0.0.1:${listener.address().port}/api/v1/statistics?day=${yesterday}&level=90&source=gameplay`
        );
        assert.equal(response.status, 200);
        const report = await response.json();
        assert.equal(report.rangeStart, yesterday);
        assert.equal(report.daysRange, 1);
        assert.equal(report.days.length, 1);
        assert.equal(report.days[0]._id, yesterday);
        assert.equal(report.totals.enemyDeaths, 5, "include UTC midnight and final millisecond, exclude adjacent days");
        assert.equal(report.totals.princeDeaths, 6);
        assert.equal(report.totals.starts, 1);
        assert.equal(report.totals.hpLost, 60);
        assert.equal(report.levels.length, 1);
        assert.equal(report.weapons.find((row) => row._id === "molotov").kills, 5);
        assert(report.latestDeaths.length > 0);
        assert(report.latestDeaths.every((row) => row.receivedAt.slice(0, 10) === yesterday));
        for (const rows of [report.guardsPerPlayer, report.trapsPerPlayer]) {
          assert.equal(rows[0].kills, 3);
          assert.equal(rows[0].levelStarters, 1);
          assert.equal(rows[0].killsPer100Starters, 300);
        }
        const empty = await store.report({ day: yesterday, level: 90, source: "samples" });
        assert.equal(empty.totals.events, 0);
        assert.deepEqual(empty.days, []);
        assert.deepEqual(empty.latestDeaths, []);
        const emptyDay = await store.report({ day: "2000-01-01", level: 90 });
        assert.equal(emptyDay.daysRange, 1);
        assert.equal(emptyDay.totals.events, 0);
        assert.deepEqual(emptyDay.days, []);
        const milestones = (await store.report({ day: yesterday, level: 6 })).milestones;
        assert.equal(milestones.length, 7);
        assert(milestones.every((row) => row.clients === 1 && row.occurrences === (row._id === "doors" ? 2 : 1)));
        const rolling = await store.report({ days: 7, level: 90 });
        assert.equal(rolling.daysRange, 7);
        assert.equal(
          rolling.totals.enemyDeaths,
          14,
          "rolling periods retain both compact days and all legacy fixtures"
        );
      });
      await t.test(
        "unique clients are deduplicated across attempts, days, levels and revisions for each metric",
        async () => {
          const baseline = await store.report({ days: 7, source: "gameplay" });
          const [a, b, c, legacyClient] = Array.from({ length: 4 }, () => randomUUID());
          const guard = {
            kind: "guard",
            guardId: 1,
            roomId: 1,
            spawnLocation: { roomId: 1, tileColumn: 3, tileRow: 1 }
          };
          const location = { roomId: 1, tileColumn: 3, tileRow: 1 };
          const payloads = {
            level_started: {},
            level_observation_started: {},
            level_ended: { outcome: "completed", activeMs: 0 },
            prince_died: { mechanism: "sword", source: guard },
            enemy_died: { mechanism: "fire", weapon: "molotov" }
          };
          function daily(day, levelNumber, revision, values) {
            const summary = new StatisticsSummary();
            const base = {
              ...events[0],
              mapId: `campaign:${levelNumber}`,
              levelNumber,
              mapRevision: revision,
              occurredAt: `${day}T12:00:00.000Z`,
              location,
              partialAttempt: false
            };
            let key;
            const add = (eventType, payload, partialAttempt = false) => {
              key = summary.add({ ...base, eventType, payload, partialAttempt });
            };
            for (const [name, type] of Object.entries({
              starts: "level_started",
              completed: "level_ended",
              deaths: "prince_died",
              kills: "enemy_died",
              observations: "level_observation_started"
            })) {
              for (let index = 0; index < (values[name] || 0); index++) {
                add(type, payloads[type]);
              }
            }
            if (values.partialCompleted) {
              add("level_ended", payloads.level_ended, true);
            }
            if (values.damage) {
              add("prince_damaged", { mechanism: "sword", source: guard, hpLost: values.damage });
            }
            if (values.activeMs) {
              add("level_activity", { activeMs: values.activeMs });
            }
            if (values.shots) {
              add("weapon_used", { weapon: "molotov", shots: values.shots, hits: values.kills || 0 });
            }
            return summary.snapshot(key);
          }
          const rowsA = [
            daily(yesterday, 91, "clients-a", {
              starts: 3,
              completed: 2,
              deaths: 2,
              kills: 4,
              damage: 3,
              activeMs: 1000,
              shots: 10
            }),
            daily(today, 91, "clients-a", {
              starts: 1,
              completed: 1,
              deaths: 1,
              kills: 1,
              damage: 1,
              activeMs: 500,
              shots: 4
            }),
            daily(today, 91, "clients-b", { starts: 1, damage: 1, activeMs: 250, shots: 1 }),
            daily(today, 92, "clients-a", {
              starts: 2,
              completed: 1,
              deaths: 1,
              kills: 2,
              damage: 2,
              activeMs: 1000,
              shots: 8
            })
          ];
          const rowsB = [
            daily(today, 91, "clients-a", { starts: 2, completed: 1, kills: 2, damage: 4, activeMs: 200, shots: 6 })
          ];
          const rowsC = [
            daily(today, 91, "clients-a", { observations: 1, partialCompleted: 1, deaths: 1, damage: 1, activeMs: 100 })
          ];
          for (const [id, rows] of [
            [a, rowsA],
            [b, rowsB],
            [c, rowsC]
          ]) {
            assert((await compact(id, rows)).every((row) => row.status === "stored"));
          }
          // Legacy retries/attempts use sessionId and join the same selected level/revision.
          const legacyEvents = [
            ["level_started", {}],
            ["level_started", {}],
            ["level_ended", payloads.level_ended],
            ["prince_died", payloads.prince_died],
            ["prince_died", payloads.prince_died],
            ["enemy_died", payloads.enemy_died],
            ["enemy_died", payloads.enemy_died],
            ["prince_damaged", { mechanism: "sword", source: guard, hpLost: 1 }],
            ["level_activity", { activeMs: 300 }],
            ["weapon_used", { weapon: "molotov", shots: 2, hits: 2 }]
          ];
          await collection.insertMany(
            legacyEvents.map(([eventType, payload]) => ({
              ...events[0],
              eventId: randomUUID(),
              sessionId: legacyClient,
              mapId: "campaign:91",
              mapRevision: "clients-a",
              levelNumber: 91,
              eventType,
              payload,
              location,
              partialAttempt: false,
              receivedAt: new Date(`${today}T12:00:00.000Z`)
            }))
          );
          const all = await store.report({ days: 7, source: "gameplay" });
          for (const [metric, expected] of Object.entries({
            clients: 4,
            startedClients: 3,
            completedClients: 3,
            observationClients: 1,
            princeDeathClients: 3,
            enemyDeathClients: 3,
            damagedClients: 4,
            activeClients: 4
          })) {
            assert.equal(
              all.totals[metric] - baseline.totals[metric],
              expected,
              `overall ${metric} deduplicates levels and revisions`
            );
          }
          const report = await store.report({ days: 7, level: 91, source: "gameplay" });
          assert.equal(report.totals.starts, 9);
          assert.equal(report.totals.completed, 5, "partial completions are excluded");
          assert.equal(report.totals.startedClients, 3);
          assert.equal(report.totals.completedClients, 3);
          assert.equal(report.totals.observationClients, 1);
          assert.equal(report.totals.clients, 4);
          assert.equal(report.totals.princeDeathClients, 3);
          assert.equal(report.totals.enemyDeathClients, 3);
          assert.equal(report.dataSources[0].clients, 4);
          const levelRow = report.levels.find((row) => row._id.revision === "clients-a");
          assert.equal(levelRow.starts, 8);
          assert.equal(levelRow.startedClients, 3);
          assert.equal(levelRow.completedClients, 3);
          assert.equal(report.levels.find((row) => row._id.revision === "clients-b").startedClients, 1);
          const cause = report.causes.find((row) => row._id.type === "prince_died");
          assert.equal(cause.deaths, 6);
          assert.equal(cause.clients, 3);
          const weapon = report.weapons.find((row) => row._id === "molotov");
          assert.equal(weapon.kills, 9);
          assert.equal(weapon.usedClients, 3);
          assert.equal(weapon.killClients, 3);
          for (const rows of [report.guards, report.guardsPerPlayer]) {
            const row = rows.find((row) => row._id.revision === "clients-a");
            assert.equal(row.clients, 4);
            assert.equal(row.deathClients, 3);
            assert.equal(row.kills, 6);
            assert.equal(row.hpLost, 10, "relative rankings retain damage-only clients");
          }
          assert.equal(report.guardsPerPlayer[0].levelStarters, 3);
          const day = await store.report({ day: yesterday, level: 91 });
          assert.equal(day.totals.startedClients, 1);
          assert.equal(day.totals.completedClients, 1);
          assert.equal(day.totals.starts, 3);
          assert.equal(day.days[0].princeDeathClients, 1);
          await collection.updateMany({ clientId: b }, { $set: { sampleData: true } });
          assert.equal((await store.report({ days: 7, level: 91, source: "gameplay" })).totals.startedClients, 2);
          const samples = await store.report({ days: 7, level: 91, source: "samples" });
          assert.equal(samples.totals.startedClients, 1);
          assert.equal(samples.totals.completedClients, 1);
          assert.equal(samples.totals.princeDeathClients, 0);
          const beforeMissingId = await store.report({ days: 7, level: 91, source: "gameplay" });
          await collection.insertOne({
            ...events[0],
            eventId: randomUUID(),
            sessionId: null,
            mapId: "campaign:91",
            mapRevision: "clients-a",
            levelNumber: 91,
            eventType: "level_started",
            payload: {},
            receivedAt: new Date(`${today}T12:00:00.000Z`)
          });
          const missingId = await store.report({ days: 7, level: 91, source: "gameplay" });
          assert.equal(missingId.totals.starts, beforeMissingId.totals.starts + 1);
          assert.equal(missingId.totals.startedClients, beforeMissingId.totals.startedClients);
          assert.equal(
            missingId.totals.clients,
            beforeMissingId.totals.clients,
            "a missing identity never invents a client"
          );
          const empty = await store.report({ day: "2000-01-01", level: 91 });
          assert.equal(empty.totals.clients, 0);
          assert.equal(empty.totals.startedClients, 0);
          assert.equal(empty.totals.completedClients, 0);
        }
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
          assert.equal((await store.report({ day: "2000-01-01", level: 99, source: "samples" })).currentlyPlaying, 1);
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
