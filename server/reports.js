"use strict";
const { reportRows } = require("./report-rows");
const { milestonePipeline } = require("./milestones");
const { dangerRanking } = require("./danger-rankings");
const { readCurrentlyPlaying } = require("./currently-playing");
const { groupWithClients, positiveCount } = require("./report-clients");
const { DAY_MS, dayKey, liveDays } = require("./statistics-days");

async function readStatistics(collection, archives, { days = 30, day, level, source = "all" } = {}) {
  const now = new Date();
  const since = new Date(day || dayKey(now));
  if (!day) {
    since.setUTCDate(since.getUTCDate() - days + 1);
  }
  const until = day ? new Date(since.getTime() + DAY_MS) : undefined;
  const receivedRange = { $gte: since, ...(until ? { $lt: until } : {}) };
  const playDayRange = day ? { $eq: day } : { $gte: dayKey(since) };
  const match = {};
  if (source === "samples") {
    match.sampleData = true;
  }
  if (source === "gameplay") {
    match.sampleData = { $ne: true };
  }
  if (level !== undefined) {
    match.levelNumber = level;
  }
  const count = (type) => ({ $sum: { $cond: [{ $eq: ["$eventType", type] }, { $ifNull: ["$count", 1] }, 0] } });
  const sum = (types, field) => ({ $sum: { $cond: [{ $in: ["$eventType", types] }, { $ifNull: [field, 0] }, 0] } });
  const occurred = (type) => ({ $and: [{ $eq: ["$eventType", type] }, positiveCount] });
  const completed = {
    $and: [
      { $eq: ["$eventType", "level_ended"] },
      { $eq: ["$payload.outcome", "completed"] },
      { $eq: ["$partialAttempt", false] }
    ]
  };
  const clientConditions = {
    startedClients: occurred("level_started"),
    observationClients: occurred("level_observation_started"),
    completedClients: { $and: [completed, positiveCount] },
    princeDeathClients: occurred("prince_died"),
    enemyDeathClients: occurred("enemy_died"),
    damagedClients: { $and: [occurred("prince_damaged"), { $gt: ["$payload.hpLost", 0] }] },
    activeClients: {
      $and: [
        { $in: ["$eventType", ["level_activity", "level_ended"]] },
        { $gt: [{ $ifNull: ["$payload.activeMs", 0] }, 0] }
      ]
    }
  };
  const totals = {
    starts: count("level_started"),
    observations: count("level_observation_started"),
    princeDeaths: count("prince_died"),
    enemyDeaths: count("enemy_died"),
    completed: {
      $sum: {
        $cond: [completed, { $ifNull: ["$count", 1] }, 0]
      }
    },
    hpLost: sum(["prince_damaged"], "$payload.hpLost"),
    activeMs: sum(["level_activity", "level_ended"], "$payload.activeMs")
  };
  const observationCount = { $cond: [{ $eq: ["$eventType", "milestone"] }, 0, { $ifNull: ["$count", 1] }] };
  const totalFields = { events: { $sum: observationCount }, ...totals };
  const statistics = collection.client.withSession({ snapshot: true }, async (session) => {
    const completeDays = { format: 1, day: playDayRange };
    // Keep completed days out of the live scan without looking up an archive for each observation.
    const archived = await archives
      .find(completeDays, { session, projection: { _id: 0, day: 1 }, readPreference: "primary" })
      .toArray();
    const archiveKeys = archived.map(({ day }) => day);
    const live = liveDays(playDayRange, receivedRange, archiveKeys);
    const current =
      day && archiveKeys.length
        ? [{ $match: { _id: { $in: [] } } }]
        : [{ $match: { ...match, ...live } }, ...reportRows()];
    return collection
      .aggregate(
        [
          ...current,
          ...(archiveKeys.length
            ? [
                {
                  $unionWith: {
                    coll: archives.collectionName,
                    pipeline: [
                      { $match: completeDays },
                      { $project: { _id: 0, day: 1, rows: 1 } },
                      { $unwind: "$rows" },
                      { $replaceWith: { $mergeObjects: ["$rows", { playDay: "$day" }] } },
                      { $match: match }
                    ]
                  }
                }
              ]
            : []),
          {
            $facet: {
              milestones: milestonePipeline(),
              dataSources: [
                ...groupWithClients(
                  { $cond: [{ $eq: ["$sampleData", true] }, "samples", "gameplay"] },
                  { events: { $sum: observationCount } }
                ),
                { $sort: { _id: 1 } }
              ],
              latestDeaths: [
                { $match: { eventType: "prince_died" } },
                { $sort: { receivedAt: -1, sequence: -1, sourceId: 1, rowIndex: 1 } },
                { $limit: 5 },
                {
                  $project: {
                    _id: 0,
                    levelNumber: 1,
                    mapId: 1,
                    mapRevision: 1,
                    receivedAt: 1,
                    location: 1,
                    sampleData: 1,
                    count: { $ifNull: ["$count", 1] },
                    "payload.mechanism": 1,
                    "payload.source": 1
                  }
                }
              ],
              totals: groupWithClients(null, totalFields, clientConditions),
              days: [...groupWithClients("$playDay", totals, clientConditions), { $sort: { _id: 1 } }],
              levels: [
                ...groupWithClients({ level: "$levelNumber" }, totals, clientConditions),
                { $sort: { "_id.level": 1 } },
                { $limit: 50 }
              ],
              causes: [
                { $match: { eventType: { $in: ["prince_died", "enemy_died"] } } },
                ...groupWithClients(
                  { type: "$eventType", cause: "$payload.mechanism" },
                  { deaths: { $sum: { $ifNull: ["$count", 1] } } }
                ),
                { $sort: { deaths: -1, "_id.type": 1, "_id.cause": 1 } }
              ],
              guards: dangerRanking("guards"),
              traps: dangerRanking("traps"),
              guardsPerPlayer: dangerRanking("guards", true),
              trapsPerPlayer: dangerRanking("traps", true),
              weapons: [
                { $match: { eventType: { $in: ["weapon_used", "enemy_died"] } } },
                ...groupWithClients(
                  { $ifNull: ["$payload.weapon", "unknown"] },
                  {
                    shots: sum(["weapon_used"], "$payload.shots"),
                    hits: sum(["weapon_used"], "$payload.hits"),
                    kills: count("enemy_died")
                  },
                  {
                    usedClients: {
                      $and: [
                        { $eq: ["$eventType", "weapon_used"] },
                        { $or: [{ $gt: ["$payload.shots", 0] }, { $gt: ["$payload.hits", 0] }] }
                      ]
                    },
                    killClients: occurred("enemy_died")
                  }
                ),
                { $sort: { kills: -1, _id: 1 } },
                { $limit: 12 }
              ],
              availableLevels: [{ $group: { _id: "$levelNumber" } }, { $sort: { _id: 1 } }]
            }
          }
        ],
        { session, readPreference: "primary" }
      )
      .toArray();
  });
  const [[result], currentlyPlaying] = await Promise.all([statistics, readCurrentlyPlaying(collection, now)]);
  return {
    ...result,
    currentlyPlaying,
    totals:
      result.totals[0] ||
      Object.fromEntries(
        [...Object.keys(totalFields), "clients", ...Object.keys(clientConditions)].map((name) => [name, 0])
      ),
    daysRange: day ? 1 : days,
    rangeStart: dayKey(since)
  };
}

module.exports = { readStatistics };
