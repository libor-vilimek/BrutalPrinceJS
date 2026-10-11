"use strict";
const { reportRows } = require("./report-rows");

async function readStatistics(collection, { days = 30, level, source = "all" } = {}) {
  const since = new Date(new Date().toISOString().slice(0, 10));
  since.setUTCDate(since.getUTCDate() - days + 1);
  const match = { receivedAt: { $gte: since } };
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
  const totals = {
    starts: count("level_started"),
    observations: count("level_observation_started"),
    princeDeaths: count("prince_died"),
    enemyDeaths: count("enemy_died"),
    completed: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$eventType", "level_ended"] },
              { $eq: ["$payload.outcome", "completed"] },
              { $eq: ["$partialAttempt", false] }
            ]
          },
          { $ifNull: ["$count", 1] },
          0
        ]
      }
    },
    hpLost: sum(["prince_damaged"], "$payload.hpLost"),
    activeMs: sum(["level_activity", "level_ended"], "$payload.activeMs")
  };
  const [result] = await collection
    .aggregate([
      {
        $match: {
          ...Object.fromEntries(Object.entries(match).filter(([key]) => key !== "receivedAt")),
          $or: [
            { schemaVersion: 2, day: { $gte: since.toISOString().slice(0, 10) } },
            { schemaVersion: { $ne: 2 }, receivedAt: { $gte: since } }
          ]
        }
      },
      ...reportRows(),
      { $match: match },
      {
        $facet: {
          dataSources: [
            {
              $group: {
                _id: { $cond: [{ $eq: ["$sampleData", true] }, "samples", "gameplay"] },
                events: { $sum: { $ifNull: ["$count", 1] } }
              }
            }
          ],
          latestDeaths: [
            { $match: { eventType: "prince_died" } },
            { $sort: { receivedAt: -1, sequence: -1 } },
            { $limit: 5 },
            {
              $project: {
                _id: 0,
                levelNumber: 1,
                receivedAt: 1,
                location: 1,
                sampleData: 1,
                count: { $ifNull: ["$count", 1] },
                "payload.mechanism": 1,
                "payload.source": 1
              }
            }
          ],
          totals: [{ $group: { _id: null, events: { $sum: { $ifNull: ["$count", 1] } }, ...totals } }],
          days: [
            {
              $group: {
                _id: { $dateToString: { date: "$receivedAt", format: "%Y-%m-%d", timezone: "UTC" } },
                ...totals
              }
            },
            { $sort: { _id: 1 } }
          ],
          levels: [
            { $group: { _id: { level: "$levelNumber", map: "$mapId", revision: "$mapRevision" }, ...totals } },
            { $sort: { "_id.level": 1, "_id.revision": 1 } },
            { $limit: 50 }
          ],
          causes: [
            { $match: { eventType: { $in: ["prince_died", "enemy_died"] } } },
            {
              $group: {
                _id: { type: "$eventType", cause: "$payload.mechanism" },
                deaths: { $sum: { $ifNull: ["$count", 1] } }
              }
            },
            { $sort: { deaths: -1 } }
          ],
          guards: [
            { $match: { eventType: { $in: ["prince_damaged", "prince_died"] }, "payload.source.kind": "guard" } },
            {
              $group: {
                _id: {
                  level: "$levelNumber",
                  map: "$mapId",
                  revision: "$mapRevision",
                  guard: "$payload.source.guardId",
                  room: "$payload.source.roomId",
                  spawn: "$payload.source.spawnLocation"
                },
                hpLost: sum(["prince_damaged"], "$payload.hpLost"),
                kills: count("prince_died"),
                hits: count("prince_damaged")
              }
            },
            { $sort: { hpLost: -1, kills: -1 } },
            { $limit: 8 }
          ],
          traps: [
            {
              $match: {
                eventType: { $in: ["prince_damaged", "prince_died"] },
                "payload.source.kind": { $in: ["tile", "environment"] }
              }
            },
            {
              $group: {
                _id: {
                  level: "$levelNumber",
                  map: "$mapId",
                  revision: "$mapRevision",
                  cause: "$payload.mechanism",
                  room: "$payload.source.roomId",
                  column: "$payload.source.tileColumn",
                  row: "$payload.source.tileRow",
                  tileType: "$payload.source.tileType"
                },
                hpLost: sum(["prince_damaged"], "$payload.hpLost"),
                kills: count("prince_died")
              }
            },
            { $sort: { kills: -1, hpLost: -1 } },
            { $limit: 8 }
          ],
          weapons: [
            { $match: { eventType: { $in: ["weapon_used", "enemy_died"] } } },
            {
              $group: {
                _id: { $ifNull: ["$payload.weapon", "unknown"] },
                shots: sum(["weapon_used"], "$payload.shots"),
                hits: sum(["weapon_used"], "$payload.hits"),
                kills: count("enemy_died")
              }
            },
            { $sort: { kills: -1 } },
            { $limit: 12 }
          ],
          availableLevels: [{ $group: { _id: "$levelNumber" } }, { $sort: { _id: 1 } }]
        }
      }
    ])
    .toArray();
  return {
    ...result,
    totals: result.totals[0] || {
      events: 0,
      starts: 0,
      observations: 0,
      princeDeaths: 0,
      enemyDeaths: 0,
      completed: 0,
      hpLost: 0,
      activeMs: 0
    },
    daysRange: days
  };
}

module.exports = { readStatistics };
