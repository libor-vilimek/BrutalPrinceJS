"use strict";

// Cumulative snapshots can be resent without keeping individual enemy identities.
function StatisticsSummary() {
  this.levels = new Map();
}
StatisticsSummary.key = (level) => [level.mapId, level.mapRevision, level.levelNumber, level.day].join("|");
StatisticsSummary.source = function (event) {
  const source = event.payload.supportingTile || event.payload.source || { kind: "unknown" };
  if (source.kind === "guard") {
    return {
      kind: "guard",
      guardId: source.guardId,
      roomId: source.roomId,
      ...(source.spawnLocation ? { spawnLocation: source.spawnLocation } : {})
    };
  }
  if (source.kind === "tile") {
    return {
      kind: "tile",
      roomId: source.roomId,
      tileColumn: source.tileColumn,
      tileRow: source.tileRow,
      tileType: source.tileType
    };
  }
  return {
    kind: source.kind,
    ...(source.kind === "environment" ? event.payload.departureLocation || event.location : {})
  };
};
StatisticsSummary.prototype = {
  add: function (event) {
    if (["enemy_damaged", "guard_encountered"].includes(event.eventType)) {
      return null;
    }
    const meta = {
      mapId: event.mapId,
      mapRevision: event.mapRevision,
      levelNumber: event.levelNumber,
      day: event.occurredAt.slice(0, 10)
    };
    const key = StatisticsSummary.key(meta);
    let level = this.levels.get(key);
    if (!level) {
      level = { ...meta, counters: {}, kills: [], damage: [], deaths: [], weapons: [], rooms: [], extras: [] };
      this.levels.set(key, level);
    }
    const p = event.payload;
    const increment = (name, amount = 1) => {
      level.counters[name] = (level.counters[name] || 0) + amount;
    };
    const group = (name, dimensions, values) => {
      let identity = JSON.stringify(dimensions);
      let row = level[name].find((entry) => entry.identity === identity);
      if (!row) {
        // Reserve one bucket for unusual/custom maps without losing total counts.
        if (level[name].length >= 127) {
          dimensions = {
            kills: { cause: "other", weapon: "unknown" },
            damage: { cause: "other", source: { kind: "unknown" } },
            deaths: { cause: "other", source: { kind: "unknown" }, location: { roomId: -1 }, weapon: "unknown" },
            weapons: { weapon: "other" },
            rooms: { roomId: -1 },
            extras: { type: "other", value: "count" }
          }[name];
          identity = JSON.stringify(dimensions);
          row = level[name].find((entry) => entry.identity === identity);
        }
        if (!row) {
          row = { identity, ...dimensions };
          level[name].push(row);
        }
      }
      for (const [field, amount] of Object.entries(values)) {
        row[field] = (row[field] || 0) + amount;
      }
      return row;
    };
    switch (event.eventType) {
      case "level_started":
        increment("starts");
        break;
      case "level_observation_started":
        increment("observations");
        break;
      case "level_ended":
        increment("ends");
        if (p.outcome === "completed" && !event.partialAttempt) {
          increment("completed");
        }
        group("extras", { type: "outcome", value: p.outcome }, { count: 1 });
        increment("activeMs", p.activeMs || 0);
        increment("activityCount", p.activityCount || 0);
        for (const room of p.roomTime || []) {
          group("rooms", { roomId: room.roomId }, { activeMs: room.activeMs });
        }
        break;
      case "level_activity":
        increment("activeMs", p.activeMs || 0);
        increment("activityCount", p.activityCount || 0);
        for (const room of p.roomTime || []) {
          group("rooms", { roomId: room.roomId }, { activeMs: room.activeMs });
        }
        break;
      case "enemy_died":
        increment("enemyDeaths");
        group("kills", { cause: p.mechanism, weapon: p.weapon || "unknown" }, { count: 1 });
        break;
      case "prince_damaged":
        increment("hpLost", p.hpLost);
        group("damage", { cause: p.mechanism, source: StatisticsSummary.source(event) }, { hits: 1, hpLost: p.hpLost });
        break;
      case "prince_died": {
        increment("princeDeaths");
        const row = group(
          "deaths",
          {
            cause: p.mechanism,
            source: StatisticsSummary.source(event),
            location: event.location,
            weapon: p.weapon || "unknown"
          },
          { count: 1 }
        );
        if (row) {
          row.lastAt = row.lastAt > event.occurredAt ? row.lastAt : event.occurredAt;
        }
        break;
      }
      case "weapon_used":
        group("weapons", { weapon: p.weapon }, { shots: p.shots || 0, hits: p.hits || 0 });
        break;
      case "room_entered":
        group("rooms", { roomId: event.location.roomId }, { visits: 1 });
        break;
      case "health_recovered":
        increment("healedHP", p.amount || 0);
        break;
      case "max_health_changed":
        increment("healthUpgrades", p.amount || 0);
        break;
      default:
        group(
          "extras",
          {
            type: event.eventType,
            value: String(p.item || p.lessonId || p.change || (p.enabled === undefined ? "count" : p.enabled))
          },
          { count: 1 }
        );
    }
    return key;
  },
  snapshot: function (key) {
    return JSON.parse(JSON.stringify(this.levels.get(key), (name, value) => (name === "identity" ? undefined : value)));
  }
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = { StatisticsSummary };
} else {
  PrinceJS.StatisticsSummary = StatisticsSummary;
}
