"use strict";

// Expand groups, never individual occurrences: 10,000 kills remain one aggregation row.
function reportRows() {
  const rows = (name, body) => ({
    $map: { input: { $objectToArray: { $ifNull: [`$${name}`, {}] } }, as: "g", in: body }
  });
  return [
    {
      $project: {
        mapId: 1,
        mapRevision: 1,
        levelNumber: 1,
        sampleData: 1,
        receivedAt: {
          $cond: [{ $eq: ["$schemaVersion", 2] }, { $dateFromString: { dateString: "$day" } }, "$receivedAt"]
        },
        reportingRows: {
          $cond: [
            { $eq: ["$schemaVersion", 2] },
            {
              $concatArrays: [
                [
                  { eventType: "level_started", count: { $ifNull: ["$counters.starts", 0] }, partialAttempt: false },
                  { eventType: "level_observation_started", count: { $ifNull: ["$counters.observations", 0] } },
                  {
                    eventType: "level_ended",
                    count: { $ifNull: ["$counters.completed", 0] },
                    partialAttempt: false,
                    payload: { outcome: "completed" }
                  },
                  {
                    eventType: "level_activity",
                    count: 0,
                    payload: { activeMs: { $ifNull: ["$counters.activeMs", 0] } }
                  }
                ],
                rows("kills", {
                  eventType: "enemy_died",
                  count: "$$g.v.count",
                  payload: { mechanism: "$$g.v.cause", weapon: "$$g.v.weapon" }
                }),
                rows("damage", {
                  eventType: "prince_damaged",
                  count: "$$g.v.hits",
                  payload: { mechanism: "$$g.v.cause", hpLost: "$$g.v.hpLost", source: "$$g.v.source" }
                }),
                rows("deaths", {
                  eventType: "prince_died",
                  count: "$$g.v.count",
                  receivedAt: { $dateFromString: { dateString: "$$g.v.lastAt" } },
                  location: "$$g.v.location",
                  payload: { mechanism: "$$g.v.cause", source: "$$g.v.source", weapon: "$$g.v.weapon" }
                }),
                rows("weapons", {
                  eventType: "weapon_used",
                  count: 1,
                  payload: { weapon: "$$g.v.weapon", shots: "$$g.v.shots", hits: "$$g.v.hits" }
                })
              ]
            },
            ["$$ROOT"]
          ]
        }
      }
    },
    { $unwind: "$reportingRows" },
    {
      $replaceWith: {
        $mergeObjects: [
          {
            mapId: "$mapId",
            mapRevision: "$mapRevision",
            levelNumber: "$levelNumber",
            sampleData: "$sampleData",
            receivedAt: "$receivedAt"
          },
          "$reportingRows"
        ]
      }
    }
  ];
}
module.exports = { reportRows };
