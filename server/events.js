"use strict";

const { createHash } = require("node:crypto");

const EVENT_TYPES = new Set([
  "level_started",
  "level_observation_started",
  "level_activity",
  "level_ended",
  "prince_damaged",
  "prince_died",
  "enemy_damaged",
  "enemy_died",
  "room_entered",
  "guard_encountered",
  "weapon_used",
  "item_collected",
  "health_recovered",
  "max_health_changed",
  "tutorial_started",
  "tutorial_completed",
  "tutorial_interrupted",
  "environment_changed",
  "jetpack_changed",
  "shadow_merged",
  "campaign_completed"
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENVELOPE = new Set([
  "schemaVersion",
  "gameVersion",
  "mapId",
  "mapRevision",
  "levelNumber",
  "sessionId",
  "campaignId",
  "attemptId",
  "eventId",
  "sequence",
  "occurredAt",
  "attemptElapsedMs",
  "eventType",
  "location",
  "payload",
  "partialAttempt"
]);
const PAYLOAD = new Set([
  "reason",
  "health",
  "maxHealth",
  "inventory",
  "tutorialState",
  "outcome",
  "destinationLevel",
  "activeMs",
  "windowId",
  "windowDurationMs",
  "activityCount",
  "roomTime",
  "healthBefore",
  "healthAfter",
  "hpLost",
  "mechanism",
  "source",
  "weapon",
  "action",
  "causalChain",
  "damageEventId",
  "victimInstanceId",
  "guardId",
  "enemyType",
  "spawnLocation",
  "departureLocation",
  "impactLocation",
  "count",
  "shots",
  "hits",
  "item",
  "amount",
  "lessonId",
  "change",
  "tile",
  "enabled",
  "fromRoom",
  "inputMode",
  "originEventId",
  "attemptActiveMs",
  "supportingTile"
]);
const NESTED = new Set([
  "roomId",
  "tileColumn",
  "tileRow",
  "tileType",
  "kind",
  "guardId",
  "enemyType",
  "spawnLocation",
  "location",
  "weapon",
  "mechanism",
  "eventId",
  "actionId",
  "source",
  "roomTime",
  "activeMs",
  "count"
]);

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safe(value, allowed, depth = 0) {
  if (depth > 6) {
    return false;
  }
  if (value === null || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  }
  if (typeof value === "string") {
    return value.length <= 128 && !/[\r\n]/.test(value);
  }
  if (Array.isArray(value)) {
    return value.length <= 100 && value.every((item) => safe(item, NESTED, depth + 1));
  }
  return plain(value) && Object.keys(value).every((key) => allowed.has(key) && safe(value[key], NESTED, depth + 1));
}

function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function location(value) {
  return (
    plain(value) &&
    integer(value.roomId, -1, 100000) &&
    (value.tileColumn === undefined || value.tileColumn === null || integer(value.tileColumn, 0, 9)) &&
    (value.tileRow === undefined || value.tileRow === null || integer(value.tileRow, 0, 2))
  );
}

function validateEvent(event) {
  if (
    !plain(event) ||
    Object.keys(event).some((key) => !ENVELOPE.has(key)) ||
    event.schemaVersion !== 1 ||
    !EVENT_TYPES.has(event.eventType)
  ) {
    return "invalid_event";
  }
  for (const key of ["eventId", "sessionId", "campaignId", "attemptId"]) {
    if (typeof event[key] !== "string" || !UUID.test(event[key])) {
      return "invalid_identifier";
    }
  }
  for (const key of ["gameVersion", "mapId", "mapRevision"]) {
    if (typeof event[key] !== "string" || !/^[a-zA-Z0-9:_-]{1,128}$/.test(event[key])) {
      return "invalid_revision";
    }
  }
  if (
    !integer(event.levelNumber, 1, 100000) ||
    !integer(event.sequence, 1) ||
    !integer(event.attemptElapsedMs) ||
    typeof event.occurredAt !== "string" ||
    event.occurredAt.length > 32 ||
    !Number.isFinite(Date.parse(event.occurredAt)) ||
    typeof event.partialAttempt !== "boolean" ||
    !location(event.location) ||
    !safe(event.location, NESTED) ||
    !plain(event.payload) ||
    !safe(event.payload, PAYLOAD)
  ) {
    return "invalid_fields";
  }
  const p = event.payload;
  for (const key of ["health", "maxHealth", "healthBefore", "healthAfter", "hpLost", "amount"]) {
    if (p[key] !== undefined && !integer(p[key], 0, 100000)) {
      return "invalid_health";
    }
  }
  if (
    event.eventType.endsWith("_damaged") &&
    (!integer(p.healthBefore, 1, 100000) ||
      !integer(p.healthAfter) ||
      p.hpLost !== p.healthBefore - p.healthAfter ||
      p.hpLost <= 0)
  ) {
    return "invalid_damage";
  }
  if (
    /_(died|damaged)$/.test(event.eventType) &&
    (typeof p.mechanism !== "string" ||
      !plain(p.source) ||
      !["guard", "prince", "tile", "environment", "script", "unknown"].includes(p.source.kind) ||
      (p.source.kind === "guard" && !integer(p.source.guardId, 1)))
  ) {
    return "invalid_source";
  }
  for (const value of [p.source, p.tile, p.spawnLocation, p.departureLocation, p.impactLocation]) {
    if (value && (value.kind === "tile" || value.roomId !== undefined) && !location(value)) {
      return "invalid_location";
    }
  }
  if (/^(enemy_died|enemy_damaged|guard_encountered)$/.test(event.eventType) && !integer(p.guardId, 1)) {
    return "invalid_guard";
  }
  if (
    event.eventType.endsWith("_died") &&
    (typeof p.victimInstanceId !== "string" || p.victimInstanceId.length > 128)
  ) {
    return "invalid_victim";
  }
  if (
    event.eventType === "level_activity" &&
    (!integer(p.windowId, 1) ||
      !integer(p.activityCount, 1) ||
      !integer(p.windowDurationMs, 1) ||
      !integer(p.activeMs) ||
      p.activeMs > p.windowDurationMs)
  ) {
    return "invalid_activity";
  }
  return null;
}

function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (plain(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function fingerprint(event) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(event)))
    .digest("hex");
}

function semanticKey(event) {
  if (event.eventType.endsWith("_died")) {
    return `${event.attemptId}:${event.eventType}:${event.payload.victimInstanceId}`;
  }
  if (["level_started", "level_observation_started", "level_ended", "campaign_completed"].includes(event.eventType)) {
    return `${event.attemptId}:${event.eventType}`;
  }
  return undefined;
}

module.exports = { EVENT_TYPES, validateEvent, fingerprint, semanticKey };
