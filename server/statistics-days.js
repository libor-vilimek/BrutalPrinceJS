"use strict";

const DAY_MS = 86400000;
const dayKey = (date) => date.toISOString().slice(0, 10);
const dailyId = (day) => `daily:${day}`;
const archiveCutoff = (now) => new Date(Date.parse(dayKey(now)) - DAY_MS);
const legacy = { schemaVersion: { $in: [1, null] } };
const dayReceipt = (day) => {
  const start = new Date(day);
  return { $gte: start, $lt: new Date(+start + DAY_MS) };
};
const liveDays = (day, receivedAt, archived = []) => ({
  $or: [
    { schemaVersion: 2, day: archived.length ? { ...day, $nin: archived } : day },
    {
      ...legacy,
      receivedAt,
      ...(archived.length ? { $nor: archived.map((day) => ({ receivedAt: dayReceipt(day) })) } : {})
    }
  ]
});
const exactDay = (day) => liveDays(day, dayReceipt(day));
const majority = { writeConcern: { w: "majority" } };

module.exports = { DAY_MS, dayKey, dailyId, archiveCutoff, legacy, liveDays, exactDay, majority };
