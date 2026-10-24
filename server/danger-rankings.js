"use strict";
const { clientFlag, groupWithClients } = require("./report-clients");

const kills = { $sum: { $cond: [{ $eq: ["$eventType", "prince_died"] }, { $ifNull: ["$count", 1] }, 0] } };
const hpLost = {
  $sum: { $cond: [{ $eq: ["$eventType", "prince_damaged"] }, { $ifNull: ["$payload.hpLost", 0] }, 0] }
};
const hits = { $sum: { $cond: [{ $eq: ["$eventType", "prince_damaged"] }, { $ifNull: ["$count", 1] }, 0] } };
const level = { level: "$levelNumber", map: "$mapId", revision: "$mapRevision" };
const death = { $eq: ["$eventType", "prince_died"] };

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
      ...groupWithClients(
        { ...level, ...source },
        { kills, hpLost, ...(kind === "guards" ? { hits } : {}) },
        { deathClients: death }
      ),
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
          client: "$clientId"
        },
        started: clientFlag(started),
        clients: clientFlag({ $in: ["$eventType", ["prince_damaged", "prince_died"]] }),
        deathClients: clientFlag(death),
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
    { $match: { "_id.source": { $ne: null }, levelStarters: { $gt: 0 } } },
    {
      $group: {
        _id: { level: "$_id.level", map: "$_id.map", revision: "$_id.revision", source: "$_id.source" },
        kills: { $sum: "$kills" },
        hpLost: { $sum: "$hpLost" },
        hits: { $sum: "$hits" },
        clients: { $sum: "$clients" },
        deathClients: { $sum: "$deathClients" },
        levelStarters: { $max: "$levelStarters" }
      }
    },
    { $match: { kills: { $gt: 0 } } },
    {
      $project: {
        _id: {
          $mergeObjects: [{ level: "$_id.level", map: "$_id.map", revision: "$_id.revision" }, "$_id.source"]
        },
        kills: 1,
        hpLost: 1,
        hits: 1,
        clients: 1,
        deathClients: 1,
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
