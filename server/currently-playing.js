"use strict";

const CURRENTLY_PLAYING_WINDOW_SECONDS = 180;

async function readCurrentlyPlaying(collection, now = new Date()) {
  const recent = { $gte: new Date(now.getTime() - CURRENTLY_PLAYING_WINDOW_SECONDS * 1000), $lte: now };
  // Read server receipt times before reportRows replaces them with historical play days/death timestamps.
  // This live gameplay count is independent of all historical dashboard filters and excludes generated samples.
  const [result] = await collection
    .aggregate([
      {
        $match: {
          sampleData: { $ne: true },
          $or: [
            { schemaVersion: 2, updatedAt: recent },
            { schemaVersion: { $ne: 2 }, receivedAt: recent }
          ]
        }
      },
      { $group: { _id: { $ifNull: ["$clientId", "$sessionId"] } } },
      { $match: { _id: { $type: "string", $ne: "" } } },
      { $count: "clients" }
    ])
    .toArray();
  return result?.clients || 0;
}

module.exports = { readCurrentlyPlaying, CURRENTLY_PLAYING_WINDOW_SECONDS };
