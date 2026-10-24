"use strict";

const validClient = { $and: [{ $eq: [{ $type: "$clientId" }, "string"] }, { $ne: ["$clientId", ""] }] };
const positiveCount = { $gt: [{ $ifNull: ["$count", 1] }, 0] };

function clientFlag(condition) {
  return { $max: { $cond: [{ $and: [validClient, condition] }, 1, 0] } };
}

// Count each client once per result, without collecting or returning arrays of client IDs.
function groupWithClients(id, sums, conditions = {}) {
  const fields = {
    ...sums,
    ...Object.fromEntries(
      Object.entries({
        clients: { $or: [positiveCount, { $gt: [{ $ifNull: ["$payload.activeMs", 0] }, 0] }] },
        ...conditions
      }).map(([name, condition]) => [name, clientFlag(condition)])
    )
  };
  return [
    { $group: { _id: { group: id, client: "$clientId" }, ...fields } },
    {
      $group: {
        _id: "$_id.group",
        ...Object.fromEntries(Object.keys(fields).map((name) => [name, { $sum: `$${name}` }]))
      }
    }
  ];
}

module.exports = { clientFlag, groupWithClients, positiveCount };
