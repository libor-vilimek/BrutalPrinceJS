"use strict";

const { reportRows } = require("./report-rows");

// Preserve the inputs needed to recompute every report for arbitrary periods and filters.
// Recent deaths keep their original timestamp, ordering fields and individual group counts.
function dailyReportRows() {
  const is = (type) => ({ $eq: ["$eventType", type] });
  const death = is("prince_died");
  const when = (condition, field) => ({ $cond: [condition, field, "$$REMOVE"] });
  const sum = (field) => ({ $sum: { $ifNull: [field, 0] } });
  return [
    ...reportRows(),
    {
      $match: {
        $nor: [
          { eventType: { $in: ["level_observation_started", "level_ended", "milestone"] }, count: 0 },
          { eventType: "level_activity", count: 0, "payload.activeMs": 0 }
        ]
      }
    },
    {
      $group: {
        _id: {
          clientId: "$clientId",
          mapId: "$mapId",
          mapRevision: "$mapRevision",
          levelNumber: "$levelNumber",
          sampleData: "$sampleData",
          eventType: "$eventType",
          partialAttempt: "$partialAttempt",
          receivedAt: when(death, "$receivedAt"),
          sequence: when(death, "$sequence"),
          location: when(death, "$location"),
          // Keep distinct death groups even when several observations share a timestamp and source.
          sourceId: when(death, "$sourceId"),
          rowIndex: when(death, "$rowIndex"),
          payload: {
            outcome: "$payload.outcome",
            mechanism: "$payload.mechanism",
            source: "$payload.source",
            weapon: "$payload.weapon",
            metric: "$payload.metric",
            change: "$payload.change",
            tile: { tileType: "$payload.tile.tileType" },
            amount: "$payload.amount",
            enemyType: "$payload.enemyType",
            enabled: "$payload.enabled"
          }
        },
        count: { $sum: { $ifNull: ["$count", 1] } },
        activeMs: sum("$payload.activeMs"),
        hpLost: sum("$payload.hpLost"),
        shots: sum("$payload.shots"),
        hits: sum("$payload.hits")
      }
    },
    {
      $replaceWith: {
        $mergeObjects: [
          "$_id",
          {
            count: "$count",
            payload: {
              $mergeObjects: [
                "$_id.payload",
                { activeMs: "$activeMs", hpLost: "$hpLost", shots: "$shots", hits: "$hits" }
              ]
            }
          }
        ]
      }
    }
  ];
}

module.exports = { dailyReportRows };
