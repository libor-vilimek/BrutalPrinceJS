"use strict";

const kills = { $sum: { $cond: [{ $eq: ["$eventType", "prince_died"] }, { $ifNull: ["$count", 1] }, 0] } };
const hpLost = {
  $sum: { $cond: [{ $eq: ["$eventType", "prince_damaged"] }, { $ifNull: ["$payload.hpLost", 0] }, 0] }
};
const hits = { $sum: { $cond: [{ $eq: ["$eventType", "prince_damaged"] }, { $ifNull: ["$count", 1] }, 0] } };
const level = { level: "$levelNumber", map: "$mapId", revision: "$mapRevision" };

function dangerRanking(kind, relative = false) {
  const source =
    kind === "guards"
      ? { guard: "$payload.source.guardId", room: "$payload.source.roomId", spawn: "$payload.source.spawnLocation" }
      : {
          cause: "$payload.mechanism",
          room: "$payload.source.roomId",
          column: "$payload.source.tileColumn",
          row: "$payload.source.tileRow",
          tileType: "$payload.source.tileType"
        };
  const match = {
    eventType: { $in: ["prince_damaged", "prince_died"] },
    "payload.source.kind": kind === "guards" ? "guard" : { $in: ["tile", "environment"] }
  };
  if (!relative) {
    return [
      { $match: match },
      { $group: { _id: { ...level, ...source }, kills, hpLost, ...(kind === "guards" ? { hits } : {}) } },
      { $sort: kind === "guards" ? { hpLost: -1, kills: -1 } : { kills: -1, hpLost: -1 } },
      { $limit: 8 }
    ];
  }
  const started = { $eq: ["$eventType", "level_started"] };
  return [
    {
      $match: {
        $or: [match, { eventType: "level_started", $expr: { $gt: [{ $ifNull: ["$count", 1] }, 0] } }]
      }
    },
    // Collapse repeat starts across days before computing the denominator. Partial observations never enter it.
    {
      $group: {
        _id: {
          ...level,
          source: { $cond: [started, null, source] },
          client: { $cond: [started, "$clientId", null] }
        },
        started: { $max: { $cond: [started, 1, 0] } },
        kills,
        hpLost,
        hits
      }
    },
    {
      $setWindowFields: {
        partitionBy: { level: "$_id.level", map: "$_id.map", revision: "$_id.revision" },
        output: { levelStarters: { $sum: "$started", window: { documents: ["unbounded", "unbounded"] } } }
      }
    },
    { $match: { "_id.source": { $ne: null }, kills: { $gt: 0 }, levelStarters: { $gt: 0 } } },
    {
      $project: {
        _id: {
          $mergeObjects: [{ level: "$_id.level", map: "$_id.map", revision: "$_id.revision" }, "$_id.source"]
        },
        kills: 1,
        hpLost: 1,
        hits: 1,
        levelStarters: 1,
        killsPer100Starters: { $multiply: [{ $divide: ["$kills", "$levelStarters"] }, 100] }
      }
    },
    // Rank every source by the rate, not just the eight winners of the absolute ranking.
    { $sort: { killsPer100Starters: -1, kills: -1, hpLost: -1, "_id.level": 1, "_id.room": 1 } },
    { $limit: 8 }
  ];
}

module.exports = { dangerRanking };
