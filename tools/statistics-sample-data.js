"use strict";

const { randomUUID } = require("node:crypto");

function sampleEvents(attempts = 180) {
  const events = [];
  const sessionId = randomUUID();
  const campaignId = randomUUID();
  let sequence = 0;
  const random = (max) => Math.floor(Math.random() * max);
  const weapons = ["twin_torches", "molotov", "minigun", "rocket_launcher", "whip"];
  for (let attempt = 0; attempt < attempts; attempt++) {
    const levelNumber = 1 + random(8);
    const attemptId = randomUUID();
    const partialAttempt = attempt % 15 === 0;
    const when = new Date(Date.now() - random(14 * 86400) * 1000);
    const location = { roomId: 2 + levelNumber, tileColumn: 4, tileRow: 2 };
    const spawnLocation = { ...location, tileColumn: 7 };
    let elapsed = 0;
    const push = (eventType, payload) => {
      events.push({
        schemaVersion: 1,
        gameVersion: "sample-v1",
        mapId: `campaign:${levelNumber}`,
        mapRevision: "sample-map-v1",
        levelNumber,
        sessionId,
        campaignId,
        attemptId,
        eventId: randomUUID(),
        sequence: ++sequence,
        occurredAt: when.toISOString(),
        attemptElapsedMs: elapsed,
        partialAttempt,
        eventType,
        location,
        payload
      });
    };
    push(partialAttempt ? "level_observation_started" : "level_started", {
      reason: partialAttempt ? "tracking_enabled" : "new_game",
      health: 10,
      maxHealth: 10,
      inventory: ["hasTwinTorches"]
    });
    const weapon = weapons[random(weapons.length)];
    const kills = 1 + random(7);
    for (let guard = 1; guard <= kills; guard++) {
      const damageId = randomUUID();
      const payload = {
        guardId: guard,
        victimInstanceId: `guard:${guard}`,
        enemyType: "guard",
        spawnLocation,
        healthBefore: 3,
        healthAfter: 0,
        hpLost: 3,
        weapon,
        mechanism:
          weapon === "molotov" || weapon === "twin_torches"
            ? "fire"
            : weapon === "rocket_launcher"
              ? "explosion"
              : weapon === "whip"
                ? "fall"
                : "bullet",
        source: { kind: "prince", ...location }
      };
      push("enemy_damaged", payload);
      events.at(-1).eventId = damageId;
      push("enemy_died", { ...payload, damageEventId: damageId });
    }
    push("weapon_used", { weapon, shots: kills + random(10), hits: kills });
    const guardId = 1 + random(4);
    const source = { kind: "guard", guardId, enemyType: "guard", ...spawnLocation, spawnLocation };
    const lost = 1 + random(4);
    push("prince_damaged", {
      healthBefore: 10,
      healthAfter: 10 - lost,
      hpLost: lost,
      mechanism: "sword",
      source,
      victimInstanceId: "prince"
    });
    const windows = 1 + random(8);
    for (let windowId = 1; windowId <= windows; windowId++) {
      elapsed += 20000;
      push("level_activity", {
        windowId,
        windowDurationMs: 20000,
        activeMs: 18000,
        activityCount: 4 + random(20),
        attemptActiveMs: windowId * 18000,
        roomTime: [{ roomId: location.roomId, activeMs: 18000 }],
        health: 10 - lost,
        maxHealth: 10
      });
    }
    const died = random(100) < 45 + levelNumber * 3;
    let outcome = random(100) < 75 ? "completed" : "restarted";
    if (died) {
      const cause = ["sword", "spikes", "fall", "chopper", "falling_floor"][random(5)];
      const damage = {
        healthBefore: 10 - lost,
        healthAfter: 0,
        hpLost: 10 - lost,
        mechanism: cause,
        victimInstanceId: "prince",
        source:
          cause === "sword"
            ? source
            : cause === "fall"
              ? { kind: "environment", ...location }
              : { kind: "tile", ...location, tileType: cause === "spikes" ? 2 : cause === "chopper" ? 18 : 11 }
      };
      push("prince_damaged", damage);
      const damageEventId = events.at(-1).eventId;
      push("prince_died", { ...damage, damageEventId });
      outcome = "prince_died";
    }
    push("level_ended", {
      outcome,
      activeMs: 0,
      attemptActiveMs: windows * 18000,
      activityCount: 0,
      health: died ? 0 : 10 - lost,
      maxHealth: 10
    });
  }
  return events;
}

module.exports = { sampleEvents };
