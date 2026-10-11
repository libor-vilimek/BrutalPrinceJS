"use strict";

// Observational only: no gameplay method awaits this recorder or its transport.
PrinceJS.Statistics = function (game) {
  this.game = game;
  this.enabled = game.settings.values.statistics;
  this.queue = [];
  this.generation = 0;
  this.sequence = 0;
  this.dropped = 0;
  this.sessionId = this.id();
  this.clientId = this.sessionId;
  this.summaries = new PrinceJS.StatisticsSummary();
  this.campaignId = this.id();
  this.lastPlayerActivity = -Infinity;
  this.focused = document.hasFocus();
  this.transportTimer = null;
  this.onBlur = () => {
    this.focused = false;
    this.suspend();
  };
  this.onFocus = () => {
    this.focused = true;
    this.suspend();
    this.schedule();
  };
  this.onVisibility = () => {
    this.suspend();
    this.schedule();
  };
  this.onExit = () => this.flush(true);
  window.addEventListener("blur", this.onBlur);
  window.addEventListener("focus", this.onFocus);
  document.addEventListener("visibilitychange", this.onVisibility);
  window.addEventListener("pagehide", this.onExit);
  this.activityTimer = window.setInterval(() => this.reportActivity(), 1000);
};

PrinceJS.Statistics.hash = function (value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  }
  return (hash >>> 0).toString(16);
};

PrinceJS.Statistics.prototype = {
  now: function () {
    return window.performance.now();
  },

  id: function () {
    if (window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  },

  location: function (actor) {
    const column = actor.charBlockX ?? actor.roomX;
    const row = actor.charBlockY ?? actor.roomY;
    return {
      roomId: Number.isInteger(actor.room) ? actor.room : -1,
      tileColumn: Number.isInteger(column) && column >= 0 && column <= 9 ? column : null,
      tileRow: Number.isInteger(row) && row >= 0 && row <= 2 ? row : null
    };
  },

  source: function (actor) {
    if (!actor) {
      return { kind: "unknown" };
    }
    if (actor === this.state?.kid) {
      return { kind: "prince", ...this.location(actor) };
    }
    return {
      kind: "guard",
      guardId: actor.id,
      enemyType: actor.baseCharName,
      ...this.location(actor),
      spawnLocation: actor.statisticsSpawn
    };
  },

  tile: function (tile) {
    return tile.statisticsOrigin || { kind: "tile", ...this.location(tile), tileType: tile.element };
  },

  weaponId: function (weapon) {
    return { twinTorches: "twin_torches", rocketLauncher: "rocket_launcher" }[weapon] || weapon;
  },

  setEnabled: function (enabled) {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    this.generation++;
    window.clearTimeout(this.transportTimer);
    this.controller?.abort();
    this.queue.length = 0;
    this.inFlight = false;
    this.retryAt = this.failures = this.dropped = 0;
    this.sessionId = this.id();
    this.clientId = this.sessionId;
    this.summaries = new PrinceJS.StatisticsSummary();
    this.campaignId = this.id();
    this.sequence = 0;
    this.suspend();
    if (enabled && this.state && !this.ended && this.state.kid?.alive) {
      this.beginLevel(this.state, this.mapData, "tracking_enabled", true);
    }
  },

  newCampaign: function () {
    this.campaignId = this.id();
    this.entryReason = "new_game";
  },

  prepareMap: function (json) {
    // The level builder replaces map tiles with live objects containing circular game references.
    this.mapRevision = PrinceJS.Statistics.hash(JSON.stringify(json) + PrinceJS.HordeSpawns.create.toString());
  },

  beginLevel: function (state, json, reason, partial = false) {
    this.state = state;
    this.mapData = json;
    this.attemptId = this.id();
    this.partial = partial;
    this.ended = false;
    this.elapsedMs = this.totalActiveMs = this.activeMs = this.activityCount = 0;
    this.roomTime = new Map();
    this.encountered = new Set();
    this.dead = new Set();
    this.weaponCounts = new Map();
    this.lastSample = this.windowStart = this.now();
    this.lastPlayerActivity = -Infinity;
    this.windowId = 0;
    this.nextEncounterAt = 0;
    this.previousPosition = this.position();
    this.previousInventory = this.inventory();
    this.mapId = `${PrinceJS.currentLevel >= 90 ? "custom" : "campaign"}:${PrinceJS.currentLevel}`;
    for (const enemy of state.enemies) {
      enemy.statisticsSpawn ||= this.location(enemy);
    }
    this.record(
      partial ? "level_observation_started" : "level_started",
      {
        reason: reason || this.entryReason || (PrinceJS.currentLevel === 1 ? "new_game" : "resume"),
        health: state.kid.health,
        maxHealth: state.kid.maxHealth,
        inventory: this.inventory(),
        tutorialState: Array.from(PrinceJS.completedTutorials || [])
      },
      false
    );
    this.entryReason = null;
  },

  inventory: function () {
    return ["hasTwinTorches", "hasMolotov", "hasMinigun", "hasRocketLauncher", "hasWhip", "hasJetpack"].filter(
      (key) => this.state.kid[key]
    );
  },

  position: function () {
    const kid = this.state.kid;
    return { room: kid.room, x: kid.charX, y: kid.charY };
  },

  foreground: function () {
    return this.focused && !document.hidden;
  },

  playable: function () {
    return (
      this.foreground() &&
      this.state &&
      !this.ended &&
      !this.game.paused &&
      !this.game.menu?.isOpen &&
      !this.state.tutorial?.active &&
      this.state.kid.alive &&
      this.state.kid.active &&
      this.state.kid.visible
    );
  },

  suspend: function () {
    this.lastPlayerActivity = -Infinity;
    this.lastSample = this.windowStart = this.now();
    this.activityCount = this.activeMs = 0;
    this.roomTime?.clear();
    window.clearTimeout(this.transportTimer);
  },

  playerAction: function () {
    if (this.enabled && this.playable()) {
      this.lastPlayerActivity = this.now();
      this.activityCount++;
    }
  },

  sample: function () {
    if (!this.state || !this.enabled) {
      return;
    }
    const now = this.now();
    const delta = Math.max(0, Math.min(now - this.lastSample, 250));
    this.lastSample = now;
    const position = this.position();
    const kid = this.state.kid;
    if (!this.playable()) {
      this.previousPosition = position;
      this.suspend();
      return;
    }
    this.elapsedMs += delta;
    const inventory = this.inventory();
    for (const item of inventory) {
      if (!this.previousInventory.includes(item)) {
        this.record("item_collected", { item });
      }
    }
    this.previousInventory = inventory;
    const moving =
      position.room !== this.previousPosition.room ||
      Math.abs(position.x - this.previousPosition.x) > 0.1 ||
      Math.abs(position.y - this.previousPosition.y) > 0.1;
    const input = ["keyL", "keyR", "keyU", "keyD"].some((key) => kid[key]?.());
    // Automatic tutorial movement, recoil, and enemy/particle simulation cannot keep an idle player present.
    const spinning = this.state.twinTorches?.isSpinning() && this.state.twinTorches.triggerDown();
    if ((moving && input && !this.state.tutorial?.sequence?.guiding) || spinning) {
      this.playerAction();
    }
    if (position.room !== this.previousPosition.room) {
      this.record("room_entered", { fromRoom: this.previousPosition.room });
    }
    this.previousPosition = position;
    if (now - this.lastPlayerActivity < 20000) {
      this.activeMs += delta;
      this.totalActiveMs += delta;
      this.roomTime.set(kid.room, (this.roomTime.get(kid.room) || 0) + delta);
      if (now >= this.nextEncounterAt) {
        this.nextEncounterAt = now + 500;
        for (const enemy of this.state.enemies) {
          if (
            !this.encountered.has(enemy.id) &&
            enemy.sneakUp !== false &&
            enemy.canHuntOpponent?.(kid, this.state.roomCamera)
          ) {
            this.encountered.add(enemy.id);
            this.record("guard_encountered", {
              guardId: enemy.id,
              enemyType: enemy.baseCharName,
              spawnLocation: enemy.statisticsSpawn
            });
          }
        }
      }
    }
  },

  deltas: function () {
    const value = {
      activeMs: Math.round(this.activeMs),
      activityCount: this.activityCount,
      attemptActiveMs: Math.round(this.totalActiveMs),
      roomTime: Array.from(this.roomTime, ([roomId, activeMs]) => ({ roomId, activeMs: Math.round(activeMs) }))
    };
    this.activeMs = this.activityCount = 0;
    this.roomTime.clear();
    return value;
  },

  reportActivity: function () {
    if (!this.enabled || !this.state) {
      return;
    }
    const now = this.now();
    if (!this.playable()) {
      this.suspend();
      this.schedule();
      return;
    }
    if (now - this.windowStart < 20000) {
      return;
    }
    this.flushWeapons();
    if (this.activityCount > 0) {
      this.record(
        "level_activity",
        {
          windowId: ++this.windowId,
          windowDurationMs: Math.round(now - this.windowStart),
          ...this.deltas(),
          health: this.state.kid.health,
          maxHealth: this.state.kid.maxHealth
        },
        false
      );
    } else {
      this.deltas();
    }
    this.windowStart = now;
  },

  endLevel: function (outcome, destinationLevel) {
    if (!this.state || this.ended) {
      return;
    }
    if (this.state.tutorial?.active) {
      this.record("tutorial_interrupted", { lessonId: this.state.tutorial.active.id }, false);
    }
    this.flushWeapons();
    const payload = { outcome, ...this.deltas(), health: this.state.kid.health, maxHealth: this.state.kid.maxHealth };
    if (destinationLevel !== undefined) {
      payload.destinationLevel = destinationLevel;
    }
    this.record("level_ended", payload, false);
    this.ended = true;
    this.entryReason = ["restarted", "prince_died"].includes(outcome)
      ? "restart"
      : outcome === "skipped"
        ? "debug_skip"
        : "progression";
  },

  detach: function () {
    this.endLevel("left");
    this.state = null;
  },

  record: function (eventType, payload = {}, activity = true, actor) {
    if (!this.enabled || !this.state || (this.ended && !["campaign_completed"].includes(eventType))) {
      return null;
    }
    const now = this.now();
    if (activity && this.playable() && now - this.lastPlayerActivity < 20000) {
      this.activityCount++;
    }
    const event = {
      schemaVersion: 1,
      gameVersion: PrinceJS.gameVersion || "statistics-v1",
      mapId: this.mapId,
      mapRevision: this.mapRevision,
      levelNumber: PrinceJS.currentLevel,
      sessionId: this.sessionId,
      campaignId: this.campaignId,
      attemptId: this.attemptId,
      eventId: this.id(),
      sequence: ++this.sequence,
      occurredAt: new Date().toISOString(),
      attemptElapsedMs: Math.round(this.elapsedMs),
      partialAttempt: this.partial,
      eventType,
      location: this.location(actor || this.state.kid),
      payload: JSON.parse(JSON.stringify(payload))
    };
    const summaryKey = this.summaries.add(event);
    if (this.queue.length >= 1000) {
      const index = this.queue.findIndex((entry) => !/(_died|level_started|level_ended)$/.test(entry.event.eventType));
      if (index < 0) {
        this.dropped++;
        return null;
      }
      this.queue.splice(index, 1);
      this.dropped++;
    }
    this.queue.push({ event, summaryKey, queuedAt: now });
    if (summaryKey) {
      this.lastEventAt = now;
    }
    this.schedule();
    return event.eventId;
  },

  healthChanged: function (actor, before, context = {}) {
    if (!this.state || actor.level !== this.state.level || !this.enabled) {
      return;
    }
    const isPrince = actor === this.state.kid;
    const mechanism = context.mechanism || "unknown";
    const source = context.tile
      ? this.tile(context.tile)
      : context.source ||
        (context.actor ? this.source(context.actor) : { kind: mechanism === "fall" ? "environment" : "unknown" });
    const causalChain = [];
    if (actor.statisticsCause && ["fall", "spikes", "chopper"].includes(mechanism)) {
      causalChain.push(actor.statisticsCause);
    }
    if (context.originEventId) {
      causalChain.push({ eventId: context.originEventId, mechanism: "shared_shadow_damage" });
    }
    const payload = {
      healthBefore: before,
      healthAfter: actor.health,
      hpLost: Math.max(0, before - actor.health),
      mechanism,
      source,
      weapon: this.weaponId(context.weapon || actor.statisticsCause?.weapon || null),
      action: actor.action,
      victimInstanceId: isPrince ? "prince" : `guard:${actor.id}`,
      ...(isPrince ? {} : { guardId: actor.id, enemyType: actor.baseCharName, spawnLocation: actor.statisticsSpawn }),
      causalChain
    };
    if (actor.statisticsDeparture && ["fall", "spikes", "falling_floor"].includes(mechanism)) {
      payload.departureLocation = actor.statisticsDeparture;
      if (actor.statisticsSupport) {
        payload.supportingTile = actor.statisticsSupport;
      }
    }
    if (context.tile) {
      payload.impactLocation = this.location(context.tile);
    }
    if (payload.hpLost > 0) {
      actor.statisticsDamageEvent = this.record(isPrince ? "prince_damaged" : "enemy_damaged", payload, true, actor);
    }
    if (!actor.alive && !this.dead.has(payload.victimInstanceId)) {
      this.dead.add(payload.victimInstanceId);
      this.record(
        isPrince ? "prince_died" : "enemy_died",
        { ...payload, damageEventId: actor.statisticsDamageEvent },
        true,
        actor
      );
      if (isPrince) {
        this.endLevel("prince_died");
      }
    }
  },

  fallStarted: function (actor) {
    if (!actor.inFallDown) {
      actor.statisticsDeparture = this.location(actor);
      const tile = actor.level?.getTileAt(actor.charBlockX, actor.charBlockY, actor.room);
      actor.statisticsSupport = tile?.isWalkable() ? this.tile(tile) : null;
    }
  },

  initiated: function (actor, weapon) {
    actor.statisticsCause = { weapon, source: this.source(this.state.kid) };
    actor.statisticsDeparture = this.location(actor);
  },

  weaponUsed: function (weapon, hits = 0) {
    weapon = this.weaponId(weapon);
    if (!hits) {
      this.playerAction();
    }
    const counts = this.weaponCounts.get(weapon) || { shots: 0, hits: 0 };
    if (hits) {
      counts.hits += hits;
    } else {
      counts.shots++;
    }
    this.weaponCounts.set(weapon, counts);
  },

  flushWeapons: function () {
    for (const [weapon, counts] of this.weaponCounts || []) {
      this.record("weapon_used", { weapon, ...counts }, false);
    }
    this.weaponCounts?.clear();
  },

  schedule: function () {
    window.clearTimeout(this.transportTimer);
    const first = this.queue.find((entry) => entry.summaryKey);
    if (!this.enabled || this.inFlight || !first || !this.foreground()) {
      return;
    }
    const now = this.now();
    const due = Math.min(this.lastEventAt + 3000, first.queuedAt + 20000);
    this.transportTimer = window.setTimeout(() => this.flush(), Math.max(0, Math.max(due, this.retryAt || 0) - now));
  },

  flush: async function (exiting = false) {
    if (!this.enabled || this.inFlight || !this.queue.length || (!exiting && !this.foreground())) {
      return;
    }
    this.flushWeapons();
    const keys = [];
    const levels = [];
    let bytes = 256;
    for (const entry of this.queue) {
      if (!entry.summaryKey || keys.includes(entry.summaryKey)) {
        continue;
      }
      const level = this.summaries.snapshot(entry.summaryKey);
      const size = new window.TextEncoder().encode(JSON.stringify(level)).length;
      if (keys.length >= 100 || bytes + size > (exiting ? 60000 : 240000)) {
        break;
      }
      keys.push(entry.summaryKey);
      levels.push(level);
      bytes += size;
    }
    if (!this.queue.some((entry) => entry.summaryKey)) {
      this.queue.length = 0;
      return;
    }
    const entries = this.queue.filter((entry) => !entry.summaryKey || keys.includes(entry.summaryKey));
    if (!levels.length) {
      if (exiting) {
        return;
      }
      this.queue.shift();
      this.dropped++;
      this.schedule();
      return;
    }
    const generation = this.generation;
    const dropped = this.dropped;
    this.inFlight = true;
    const controller = (this.controller = new window.AbortController());
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await window.fetch("/api/v2/gameplay-statistics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        signal: controller.signal,
        keepalive: exiting,
        body: JSON.stringify({
          schemaVersion: 2,
          clientId: this.clientId,
          levels,
          droppedEventCount: dropped
        })
      });
      if (generation !== this.generation) {
        return;
      }
      if (!response.ok) {
        const retrySeconds = Number(response.headers.get("Retry-After"));
        if (response.status === 429 || response.status >= 500) {
          this.retryAt = this.now() + Math.min(60000, Math.max(0, retrySeconds || 0) * 1000);
          throw new Error("Retry statistics later");
        }
        // Permanent protocol errors discard this batch, with no player-facing feedback.
        this.queue = this.queue.filter((entry) => !entries.includes(entry));
        this.dropped += entries.length;
      } else {
        const body = await response.json();
        if (
          !Array.isArray(body.results) ||
          body.results.length !== keys.length ||
          body.results.some(
            (result, index) =>
              (result.key !== keys[index] && !(result.key === null && result.status === "rejected")) ||
              !["stored", "duplicate", "rejected"].includes(result.status)
          )
        ) {
          throw new Error("Invalid statistics acknowledgement");
        }
        this.queue = this.queue.filter((entry) => !entries.includes(entry));
        this.dropped = Math.max(0, this.dropped - dropped);
      }
      this.failures = 0;
      this.retryAt = 0;
    } catch (error) {
      if (generation === this.generation) {
        this.failures = (this.failures || 0) + 1;
        this.retryAt = Math.max(
          this.retryAt || 0,
          this.now() + Math.min(60000, 1000 * 2 ** Math.min(this.failures, 6)) * (0.75 + Math.random() * 0.5)
        );
      }
    } finally {
      window.clearTimeout(timeout);
      if (generation === this.generation) {
        this.inFlight = false;
        this.controller = null;
        this.schedule();
      }
    }
  }
};

// Telemetry bugs are contained just like network failures, including rejected asynchronous operations.
for (const name of Object.keys(PrinceJS.Statistics.prototype)) {
  const operation = PrinceJS.Statistics.prototype[name];
  PrinceJS.Statistics.prototype[name] = function (...args) {
    try {
      const result = operation.apply(this, args);
      return result && typeof result.catch === "function" ? result.catch(() => undefined) : result;
    } catch (error) {
      return undefined;
    }
  };
}
