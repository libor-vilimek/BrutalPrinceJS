"use strict";

const MILESTONES = {
  exitDoors: "exitDoorsDestroyed",
  healthPotions: "healthUpgrades",
  jaffar: "jaffarDeaths",
  jetpack: "jetpackUses",
  laserRockets: "laserRocketsIntercepted",
  doors: "doorsDestroyed",
  walls: "wallsDestroyed"
};

function milestonePipeline() {
  const is = (type) => ({ $eq: ["$eventType", type] });
  const change = (name, tileTypes = []) => ({
    $and: [
      is("environment_changed"),
      {
        $or: [
          { $eq: ["$payload.change", name] },
          { $and: [{ $eq: ["$payload.change", "barrier_destroyed"] }, { $in: ["$payload.tile.tileType", tileTypes] }] }
        ]
      }
    ]
  });
  return [
    {
      $set: {
        metric: {
          $switch: {
            branches: [
              { case: is("milestone"), then: "$payload.metric" },
              { case: change("exit_door_destroyed", [16, 17]), then: "exitDoors" },
              { case: change("door_destroyed", [4]), then: "doors" },
              { case: change("wall_destroyed", [20]), then: "walls" },
              { case: { $and: [is("max_health_changed"), { $gt: ["$payload.amount", 0] }] }, then: "healthPotions" },
              { case: { $and: [is("enemy_died"), { $eq: ["$payload.enemyType", "jaffar"] }] }, then: "jaffar" },
              { case: { $and: [is("jetpack_changed"), { $eq: ["$payload.enabled", true] }] }, then: "jetpack" },
              {
                case: {
                  $and: [
                    is("environment_changed"),
                    { $eq: ["$payload.change", "rocket_intercepted"] },
                    { $eq: ["$levelNumber", 6] }
                  ]
                },
                then: "laserRockets"
              }
            ],
            default: null
          }
        }
      }
    },
    { $match: { metric: { $in: Object.keys(MILESTONES) }, count: { $ne: 0 } } },
    // Compact exit-door counts already contribute to doors; legacy events need both rows.
    {
      $set: {
        metrics: {
          $cond: [
            { $and: [{ $eq: ["$metric", "exitDoors"] }, { $ne: ["$eventType", "milestone"] }] },
            ["exitDoors", "doors"],
            ["$metric"]
          ]
        }
      }
    },
    { $unwind: "$metrics" },
    { $group: { _id: { metric: "$metrics", client: "$clientId" }, occurrences: { $sum: { $ifNull: ["$count", 1] } } } },
    { $group: { _id: "$_id.metric", clients: { $sum: 1 }, occurrences: { $sum: "$occurrences" } } },
    { $sort: { _id: 1 } }
  ];
}

module.exports = { MILESTONES, milestonePipeline };
