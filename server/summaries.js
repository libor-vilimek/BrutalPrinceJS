"use strict";

const { fingerprint } = require("./events");
const { StatisticsSummary } = require("../src/StatisticsSummary");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUNTERS = [
  "starts",
  "observations",
  "ends",
  "completed",
  "enemyDeaths",
  "princeDeaths",
  "hpLost",
  "activeMs",
  "activityCount",
  "healedHP",
  "healthUpgrades"
];
const GROUPS = {
  kills: { dimensions: ["cause", "weapon"], values: ["count"] },
  damage: { dimensions: ["cause", "source"], values: ["hits", "hpLost"] },
  deaths: { dimensions: ["cause", "source", "location", "weapon"], values: ["count"], dates: ["lastAt"] },
  weapons: { dimensions: ["weapon"], values: ["shots", "hits"] },
  rooms: { dimensions: ["roomId"], values: ["activeMs", "visits"] },
  extras: { dimensions: ["type", "value"], values: ["count"] }
};
const numeric = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1e12;
const text = (value) => typeof value === "string" && /^[a-zA-Z0-9:_-]{1,128}$/.test(value);
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function location(value) {
  return (
    plain(value) &&
    Number.isSafeInteger(value.roomId) &&
    value.roomId >= -1 &&
    value.roomId <= 100000 &&
    ["tileColumn", "tileRow"].every(
      (key) =>
        value[key] === null ||
        value[key] === undefined ||
        (Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= (key === "tileColumn" ? 9 : 2))
    ) &&
    Object.keys(value).every((key) => ["roomId", "tileColumn", "tileRow"].includes(key))
  );
}
function source(value) {
  return (
    plain(value) &&
    ["guard", "tile", "prince", "environment", "script", "unknown"].includes(value.kind) &&
    Object.keys(value).every((key) =>
      ["kind", "guardId", "roomId", "tileColumn", "tileRow", "tileType", "spawnLocation"].includes(key)
    ) &&
    (value.kind !== "guard" || (numeric(value.guardId) && value.guardId >= 1)) &&
    (value.spawnLocation === undefined || location(value.spawnLocation)) &&
    (value.roomId === undefined ||
      location(
        Object.fromEntries(Object.entries(value).filter(([key]) => ["roomId", "tileColumn", "tileRow"].includes(key)))
      )) &&
    (value.tileType === undefined || numeric(value.tileType))
  );
}
function validateSummary(level) {
  if (
    !plain(level) ||
    Object.keys(level).some(
      (key) => !["mapId", "mapRevision", "levelNumber", "day", "counters", ...Object.keys(GROUPS)].includes(key)
    ) ||
    !text(level.mapId) ||
    !text(level.mapRevision) ||
    !numeric(level.levelNumber) ||
    level.levelNumber < 1 ||
    level.levelNumber > 100000 ||
    typeof level.day !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(level.day) ||
    !Number.isFinite(Date.parse(level.day)) ||
    new Date(level.day).toISOString().slice(0, 10) !== level.day ||
    Date.parse(level.day) < Date.now() - 91 * 86400000 ||
    Date.parse(level.day) > Date.now() + 86400000 ||
    !plain(level.counters) ||
    Object.keys(level.counters).some((key) => !COUNTERS.includes(key) || !numeric(level.counters[key]))
  ) {
    return "invalid_summary";
  }
  for (const [name, spec] of Object.entries(GROUPS)) {
    const rows = level[name];
    if (!Array.isArray(rows) || rows.length > 128) {
      return "invalid_groups";
    }
    const seen = new Set();
    for (const row of rows) {
      if (
        !plain(row) ||
        Object.keys(row).some((key) => ![...spec.dimensions, ...spec.values, ...(spec.dates || [])].includes(key))
      ) {
        return "invalid_group";
      }
      for (const key of spec.dimensions) {
        if (
          key === "source"
            ? !source(row[key])
            : key === "location"
              ? !location(row[key])
              : key === "roomId"
                ? !Number.isInteger(row[key]) || row[key] < -1 || row[key] > 100000
                : !text(row[key])
        ) {
          return "invalid_dimension";
        }
      }
      if (spec.values.some((key) => row[key] !== undefined && !numeric(row[key]))) {
        return "invalid_counter";
      }
      const required =
        name === "damage" ? ["hits", "hpLost"] : ["kills", "deaths", "extras"].includes(name) ? ["count"] : [];
      if (required.some((key) => !numeric(row[key]) || row[key] === 0)) {
        return "invalid_counter";
      }
      if (
        spec.dates?.some(
          (key) =>
            typeof row[key] !== "string" ||
            !Number.isFinite(Date.parse(row[key])) ||
            new Date(row[key]).toISOString() !== row[key]
        )
      ) {
        return "invalid_timestamp";
      }
      if (name === "deaths" && row.lastAt.slice(0, 10) !== level.day) {
        return "invalid_timestamp";
      }
      const key = fingerprint(Object.fromEntries(spec.dimensions.map((field) => [field, row[field]])));
      if (seen.has(key)) {
        return "duplicate_group";
      }
      seen.add(key);
    }
  }
  if (
    (level.counters.enemyDeaths || 0) !== level.kills.reduce((sum, row) => sum + (row.count || 0), 0) ||
    (level.counters.princeDeaths || 0) !== level.deaths.reduce((sum, row) => sum + (row.count || 0), 0) ||
    (level.counters.hpLost || 0) !== level.damage.reduce((sum, row) => sum + (row.hpLost || 0), 0)
  ) {
    return "inconsistent_totals";
  }
  return null;
}

async function persistSummaries(collection, clientId, levels, retentionDays = 90) {
  const results = [];
  for (const level of levels) {
    const reason = validateSummary(level);
    const key =
      plain(level) && ["mapId", "mapRevision", "day"].every((field) => text(level[field])) && numeric(level.levelNumber)
        ? StatisticsSummary.key(level)
        : null;
    if (reason) {
      results.push({ key, status: "rejected", reason });
      continue;
    }
    const id = `summary:${clientId}:${key}`;
    const now = new Date();
    const maximum = {};
    const metadata = {};
    for (const [name, value] of Object.entries(level.counters)) {
      maximum[`counters.${name}`] = value;
    }
    for (const [name, spec] of Object.entries(GROUPS)) {
      for (const row of level[name]) {
        const dimensions = Object.fromEntries(spec.dimensions.map((field) => [field, row[field]]));
        const groupKey = fingerprint(dimensions).slice(0, 24);
        for (const field of spec.values) {
          if (row[field] !== undefined) {
            maximum[`${name}.${groupKey}.${field}`] = row[field];
          }
        }
        for (const field of spec.dates || []) {
          maximum[`${name}.${groupKey}.${field}`] = row[field];
        }
        for (const [field, value] of Object.entries(dimensions)) {
          metadata[`${name}.${groupKey}.${field}`] = value;
        }
      }
    }
    const update = {
      $setOnInsert: {
        eventId: id,
        schemaVersion: 2,
        clientId,
        mapId: level.mapId,
        mapRevision: level.mapRevision,
        levelNumber: level.levelNumber,
        day: level.day,
        receivedAt: now
      },
      $set: {
        ...metadata,
        updatedAt: now,
        expiresAt: new Date(Date.parse(level.day) + (retentionDays + 1) * 86400000)
      },
      ...(Object.keys(maximum).length ? { $max: maximum } : {})
    };
    try {
      await collection.updateOne({ _id: id }, update, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }
      const result = await collection.updateOne({ _id: id }, update);
      if (!result.matchedCount) {
        throw new Error("Summary update was not confirmed", { cause: error });
      }
    }
    results.push({ key, status: "stored" });
  }
  return results;
}
module.exports = { UUID, validateSummary, persistSummaries };
