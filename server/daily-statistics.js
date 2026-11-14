"use strict";

const { randomUUID } = require("node:crypto");
const { setTimeout: wait } = require("node:timers/promises");
const { Readable } = require("node:stream");
const { createGzip } = require("node:zlib");
const { BSON } = require("mongodb");
const { dailyReportRows } = require("./daily-report-rows");
const { CURRENTLY_PLAYING_WINDOW_SECONDS } = require("./currently-playing");
const { dayKey, dailyId, archiveCutoff, legacy, exactDay, majority } = require("./statistics-days");

const JOB_ID = "job";
const BATCH_SIZE = 100;
const BATCH_WAIT_MS = 250;
const DAY_WAIT_MS = 5000;
const LEASE_MS = 120000;
const BSON_LIMIT = 16 * 1024 * 1024;
const queryOptions = { readPreference: "primary", maxTimeMS: 4000 };
const operations = { ...majority, timeoutMS: 5000 };

// Backdated writes take a write lock on the same document the job seals. Both changes commit together.
async function writeHistoricalSummary(client, archives, day, write) {
  const _id = dailyId(day);
  return client.withSession((session) => {
    const save = () =>
      session.withTransaction(
        async () => {
          const state = await archives.findOne({ _id }, { session, projection: { sealedAt: 1 } });
          if (state?.sealedAt) {
            return false;
          }
          await archives.updateOne(
            { _id },
            { $setOnInsert: { day }, $inc: { writeSerial: 1 } },
            { session, upsert: true }
          );
          await write(session);
          return true;
        },
        { ...majority, readPreference: "primary", timeoutMS: 5000 }
      );
    // Two first writes can race creation of the day document, including when the other write seals it.
    return save().catch((error) => {
      if (error.code !== 11000) {
        throw error;
      }
      return save();
    });
  });
}

// The BSON records are self-delimiting. The backup preserves counters and details outside the public report.
async function backupDay(events, filter, session, pause) {
  let lastReceipt = 0;
  let count = 0;
  const input = Readable.from(
    (async function* () {
      for await (const doc of events.find(filter, {
        ...queryOptions,
        session,
        batchSize: BATCH_SIZE,
        promoteLongs: false
      })) {
        const receipt = doc.schemaVersion === 2 ? doc.updatedAt : doc.receivedAt;
        lastReceipt = Math.max(lastReceipt, +receipt || 0);
        yield BSON.serialize(doc);
        if (++count % BATCH_SIZE === 0) {
          await pause(BATCH_WAIT_MS);
        }
      }
    })()
  );
  const gzip = createGzip();
  // Forward cursor failures to the consumer so a partial stream can never be published.
  input.on("error", (error) => gzip.destroy(error));
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of input.pipe(gzip)) {
      size += chunk.length;
      if (size >= BSON_LIMIT) {
        throw new Error("day_too_large");
      }
      chunks.push(chunk);
    }
  } finally {
    input.destroy();
  }
  return { source: Buffer.concat(chunks, size), lastReceipt, count };
}

async function buildDay(client, events, day, pause) {
  return client.withSession({ snapshot: true }, async (session) => {
    const filter = exactDay(day);
    const backup = await backupDay(events, filter, session, pause);
    const report = { format: 1, source: backup.source, sourceCount: backup.count, rows: [] };
    let size = BSON.calculateObjectSize(report);
    for await (const row of events.aggregate([{ $match: filter }, ...dailyReportRows()], {
      ...queryOptions,
      session,
      batchSize: BATCH_SIZE
    })) {
      size += BSON.calculateObjectSize(row) + String(report.rows.length).length + 2;
      if (size >= BSON_LIMIT) {
        throw new Error("day_too_large");
      }
      report.rows.push(row);
      if (report.rows.length % BATCH_SIZE === 0) {
        await pause(BATCH_WAIT_MS);
      }
    }
    return { report, lastReceipt: backup.lastReceipt };
  });
}

function createDailyStatistics(client, events, archives, { now = Date.now, pause = wait } = {}) {
  async function nextDay(cutoff) {
    const [compact, raw, pending] = await Promise.all([
      events.findOne(
        { schemaVersion: 2, day: { $lt: dayKey(cutoff) } },
        { ...queryOptions, sort: { day: 1 }, projection: { _id: 0, day: 1 } }
      ),
      events.findOne(
        { ...legacy, receivedAt: { $type: "date", $lt: cutoff } },
        { ...queryOptions, sort: { receivedAt: 1 }, projection: { _id: 0, receivedAt: 1 } }
      ),
      archives.findOne({ cleanupPending: true }, { ...queryOptions, sort: { day: 1 }, projection: { _id: 0, day: 1 } })
    ]);
    return [compact?.day, raw && dayKey(raw.receivedAt), pending?.day].filter(Boolean).sort()[0];
  }

  async function run(owner) {
    let processedDays = 0;
    let nextRenewal = 0;
    const job = { _id: JOB_ID, owner };
    async function renew(fields = {}) {
      const time = now();
      const result = await archives.updateOne(
        { ...job, leaseUntil: { $gt: new Date(time) } },
        { $set: { leaseUntil: new Date(time + LEASE_MS), ...fields } },
        majority
      );
      if (!result.matchedCount) {
        throw new Error("lease_lost");
      }
      nextRenewal = time + LEASE_MS / 3;
    }
    async function rest(ms) {
      await pause(ms);
      if (now() >= nextRenewal) {
        await renew();
      }
    }
    try {
      const cutoff = archiveCutoff(new Date(now()));
      for (let day = await nextDay(cutoff); day; ) {
        await renew({ day, processedDays });
        const _id = dailyId(day);
        const state = await archives.findOneAndUpdate(
          { _id },
          [
            {
              $set: {
                day,
                sealedAt: { $ifNull: ["$sealedAt", new Date(now())] },
                cleanupPending: { $ifNull: ["$cleanupPending", { $cond: ["$format", "$$REMOVE", true] }] }
              }
            }
          ],
          { ...operations, upsert: true, returnDocument: "after", projection: { format: 1 } }
        );
        if (!state.format) {
          const { report, lastReceipt } = await buildDay(client, events, day, rest);
          const deleteAfter = new Date(lastReceipt + CURRENTLY_PLAYING_WINDOW_SECONDS * 1000 + 1);
          await renew();
          await archives.updateOne(
            { _id, format: { $exists: false } },
            { $set: { ...report, deleteAfter }, $unset: { writeSerial: "" } },
            operations
          );
        }
        // Only a majority-visible, complete report authorizes removal of source documents.
        const published = await archives.findOne(
          { _id, format: 1 },
          { ...queryOptions, readConcern: { level: "majority" }, projection: { deleteAfter: 1 } }
        );
        if (!published) {
          throw new Error("report_unconfirmed");
        }
        while (now() < +published.deleteAfter) {
          await rest(Math.min(+published.deleteAfter - now(), LEASE_MS / 3));
        }
        const filter = exactDay(day);
        for (;;) {
          const batch = await events
            .find(filter, { ...queryOptions, projection: { _id: 1 }, limit: BATCH_SIZE })
            .toArray();
          if (!batch.length) {
            break;
          }
          await events.deleteMany({ ...filter, _id: { $in: batch.map((doc) => doc._id) } }, operations);
          await rest(BATCH_WAIT_MS);
        }
        await archives.updateOne({ _id, format: 1 }, { $unset: { cleanupPending: "", deleteAfter: "" } }, majority);
        processedDays++;
        day = await nextDay(cutoff);
        if (day) {
          await rest(DAY_WAIT_MS);
        }
      }
      await archives.updateOne(
        job,
        {
          $set: { status: "completed", finishedAt: new Date(now()), processedDays },
          $unset: { leaseUntil: "", day: "" }
        },
        majority
      );
    } catch (error) {
      const reason = error.message === "day_too_large" || error.code === 10334 ? "day_too_large" : "archive_failed";
      await archives.updateOne(
        job,
        { $set: { status: "failed", reason, finishedAt: new Date(now()) }, $unset: { leaseUntil: "" } },
        majority
      );
    }
  }

  return {
    async start() {
      const owner = randomUUID();
      const startedAt = new Date(now());
      try {
        await archives.updateOne(
          { _id: JOB_ID, leaseUntil: { $not: { $gt: startedAt } } },
          {
            $set: {
              owner,
              status: "running",
              startedAt,
              leaseUntil: new Date(+startedAt + LEASE_MS),
              processedDays: 0
            },
            $unset: { day: "", finishedAt: "", reason: "" }
          },
          { ...majority, upsert: true }
        );
      } catch (error) {
        if (error.code === 11000) {
          return false;
        }
        throw error;
      }
      void run(owner).catch(() => {
        // A database outage may prevent status updates. The lease will expire so the run can be retried.
      });
      return true;
    },
    async status() {
      const state = await archives.findOne({ _id: JOB_ID }, { ...queryOptions, projection: { _id: 0, owner: 0 } });
      if (!state) {
        return { status: "idle" };
      }
      const { leaseUntil, ...publicState } = state;
      if (state.status === "running" && +leaseUntil <= now()) {
        return { ...publicState, status: "interrupted" };
      }
      return publicState;
    }
  };
}

module.exports = { createDailyStatistics, writeHistoricalSummary };
