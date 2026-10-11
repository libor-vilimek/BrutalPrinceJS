"use strict";

const { MongoClient } = require("mongodb");
const { validateEvent, fingerprint, semanticKey } = require("./events");
const { readStatistics } = require("./reports");
const { persistSummaries } = require("./summaries");

function createEventStore({ uri, database, retentionDays = 90, collectionName = "brutalprince" }) {
  let client;
  let ready;
  async function collection() {
    if (!uri || !database) {
      throw new Error("Statistics database is not configured");
    }
    if (!ready) {
      client ||= new MongoClient(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 3000,
        connectTimeoutMS: 3000,
        socketTimeoutMS: 5000
      });
      ready = (async () => {
        await client.connect();
        const events = client.db(database).collection(collectionName);
        await events.createIndexes([
          { key: { eventId: 1 }, unique: true },
          { key: { semanticKey: 1 }, unique: true, partialFilterExpression: { semanticKey: { $type: "string" } } },
          { key: { mapId: 1, mapRevision: 1, levelNumber: 1, eventType: 1, receivedAt: 1 } },
          { key: { attemptId: 1, sequence: 1 } },
          { key: { mapId: 1, mapRevision: 1, levelNumber: 1, "payload.source.guardId": 1, eventType: 1 } },
          {
            key: {
              mapId: 1,
              mapRevision: 1,
              levelNumber: 1,
              "payload.source.roomId": 1,
              "payload.source.tileColumn": 1,
              "payload.source.tileRow": 1,
              eventType: 1
            }
          },
          { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
          { key: { schemaVersion: 1, day: 1, levelNumber: 1 } }
        ]);
        return events;
      })().catch((error) => {
        ready = null;
        throw error;
      });
    }
    return ready;
  }
  return {
    async writeSummaries(clientId, levels) {
      return persistSummaries(await collection(), clientId, levels, retentionDays);
    },
    async write(events, droppedEventCount = 0) {
      return persistBatch(await collection(), events, retentionDays, droppedEventCount);
    },
    async report(options) {
      return {
        ...(await readStatistics(await collection(), options)),
        storage: { database, collection: collectionName }
      };
    },
    async close() {
      if (client) {
        await client.close();
      }
    }
  };
}

async function persistBatch(collection, events, retentionDays = 90, droppedEventCount = 0) {
  const results = events.map((event) => ({ eventId: typeof event?.eventId === "string" ? event.eventId : null }));
  const documents = [];
  const receivedAt = new Date();
  const seen = new Map();
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    const reason = validateEvent(event);
    if (reason) {
      Object.assign(results[index], { status: "rejected", reason });
      continue;
    }
    const hash = fingerprint(event);
    const key = semanticKey(event);
    const prior = seen.get(event.eventId) || (key && seen.get(key));
    if (prior) {
      Object.assign(results[index], { status: prior.hash === hash ? "duplicate" : "rejected", reason: "conflict" });
      continue;
    }
    const document = {
      ...event,
      fingerprint: hash,
      receivedAt,
      expiresAt: new Date(receivedAt.getTime() + retentionDays * 86400000)
    };
    if (documents.length === 0 && droppedEventCount > 0) {
      document.reportedDroppedEvents = droppedEventCount;
    }
    if (key) {
      document.semanticKey = key;
    }
    seen.set(event.eventId, { hash });
    if (key) {
      seen.set(key, { hash });
    }
    documents.push({ index, document });
  }
  if (!documents.length) {
    return results;
  }
  const filter = {
    $or: [
      { eventId: { $in: documents.map(({ document }) => document.eventId) } },
      { semanticKey: { $in: documents.map(({ document }) => document.semanticKey).filter(Boolean) } }
    ]
  };
  const existing = await collection.find(filter).toArray();
  const byId = new Map(existing.map((entry) => [entry.eventId, entry]));
  const byKey = new Map(existing.filter((entry) => entry.semanticKey).map((entry) => [entry.semanticKey, entry]));
  const pending = documents.filter(({ index, document }) => {
    const previous = byId.get(document.eventId) || byKey.get(document.semanticKey);
    if (!previous) {
      return true;
    }
    Object.assign(
      results[index],
      previous.fingerprint === document.fingerprint
        ? { status: "duplicate" }
        : { status: "rejected", reason: "conflict" }
    );
    return false;
  });
  if (pending.length) {
    try {
      await collection.insertMany(
        pending.map(({ document }) => document),
        { ordered: false }
      );
      for (const { index } of pending) {
        results[index].status = "stored";
      }
    } catch (error) {
      // Concurrent retries can race the pre-read. Only duplicate-key failures are safe to acknowledge here.
      if (
        error.code !== 11000 ||
        error.writeConcernErrors?.length ||
        error.writeErrors?.some((entry) => entry.code !== 11000)
      ) {
        throw error;
      }
      const stored = await collection.find(filter).toArray();
      for (const { index, document } of pending) {
        const previous = stored.find(
          (entry) =>
            entry.eventId === document.eventId || (document.semanticKey && entry.semanticKey === document.semanticKey)
        );
        if (!previous) {
          throw new Error("Batch persistence was not confirmed", { cause: error });
        }
        Object.assign(
          results[index],
          previous.fingerprint === document.fingerprint
            ? { status: "duplicate" }
            : { status: "rejected", reason: "conflict" }
        );
      }
    }
  }
  return results;
}

module.exports = { createEventStore, persistBatch };
