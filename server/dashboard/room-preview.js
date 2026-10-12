"use strict";

// A separate Phaser instance and JS realm. Never boot Game, settings, input, or the statistics recorder here.
window.PhaserGlobal = { disableAudio: true };

function mapRevision(json) {
  // Same FNV-1a revision as Statistics.prepareMap, without loading/constructing a recorder.
  const value = JSON.stringify(json) + PrinceJS.HordeSpawns.create.toString();
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(16);
}

const query = new window.URLSearchParams(window.location.search);
const integer = (name, min, max) => {
  const value = query.get(name);
  const parsed = value === null || value === "" ? NaN : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
};
const target = {
  level: integer("level", 1, 100000),
  room: integer("room", 1, 100000),
  recordedRoom: integer("recordedRoom", 1, 100000),
  column: integer("column", 0, 9),
  row: integer("row", 0, 2),
  guard: integer("guard", 1, 100000),
  tileType: integer("tileType", 0, 32),
  revision: query.get("revision"),
  map: query.get("map")
};
const status = document.getElementById("preview-status");
const expectedMap = `${target.level >= 90 ? "custom" : "campaign"}:${target.level}`;

const previewState = {
  fail: function (message) {
    this.failed = true;
    status.textContent = message;
    window.clearTimeout(this.loadTimeout);
  },

  preload: function () {
    this.game.sound.mute = true;
    this.game.input.enabled = false;
    this.loadTimeout = window.setTimeout(() => this.fail("Room could not be loaded. Close and try again."), 15000);
    this.load.onFileError.add(() => this.fail("The map or its artwork is unavailable."));
    const mapPath = target.level >= 90 ? "/assets/maps/custom/" : "/assets/maps/";
    this.load.json("level", `${mapPath}level${target.level}.json`);
    for (const key of [
      "kid",
      "guard-1",
      "guard-2",
      "guard-3",
      "guard-4",
      "guard-5",
      "guard-6",
      "guard-7",
      "fatguard",
      "jaffar",
      "skeleton",
      "shadow",
      "dungeon",
      "palace",
      "general",
      "sword"
    ]) {
      this.load.atlasJSONHash(key, `/assets/gfx/${key}.png`, `/assets/gfx/${key}.json`);
    }
    for (const key of ["fighter", "shadow", "sword"]) {
      this.load.json(`${key}-anims`, `/assets/anims/${key}.json`);
    }
  },

  create: function () {
    window.clearTimeout(this.loadTimeout);
    if (this.failed) {
      return;
    }
    try {
      this.buildRoom();
    } catch (error) {
      this.fail("This room cannot be previewed with the available map.");
    }
  },

  buildRoom: function () {
    const json = this.game.cache.getJSON("level");
    if (!json?.room.some((room) => room.id === target.room)) {
      this.fail("The recorded room is not available in this map.");
      return;
    }
    this.revisionMatches = mapRevision(json) === target.revision;
    // LevelBuilder replaces tiles in its input. Keep the cached map pristine even in this isolated instance.
    const map = JSON.parse(JSON.stringify(json));
    this.level = new PrinceJS.LevelBuilder(this.game, this).buildFromJSON(map);
    this.specialEvents = json.prince.specialEvents !== false;
    this.enemies = [];
    const guards = json.guards.concat(PrinceJS.HordeSpawns.create(this.level, json));
    guards.forEach((data, index) => {
      const enemy = new PrinceJS.Enemy(
        this.game,
        this.level,
        data.location + (data.bias || 0),
        data.direction * (data.reverse || 1),
        data.room,
        data.skill,
        data.colors,
        data.type,
        index + 1
      );
      enemy.reinforcement = data.reinforcement === true;
      if (data.health !== undefined) {
        enemy.health = data.health;
      }
      if (enemy.reinforcement) {
        PrinceJS.HordeSpawns.place(enemy, data.location);
      }
      if (data.active === false) {
        enemy.setInactive();
      }
      // Every enemy is present. Only idle animation commands are processed, never AI, damage or collision checks.
      enemy.processCommand();
      enemy.updateCharPosition();
      enemy.updateSwordPosition();
      this.enemies.push(enemy);
    });
    this.laserTurret = PrinceJS.LaserTurret.create(this);
    this.pickups = PrinceJS.RoomPreviewPickups(this.game, this.level, json);
    this.roomCamera = new PrinceJS.RoomCamera(this);
    this.roomCamera.setRoom(target.room);
    this.level.checkGates(target.room, null, this.roomCamera.visibleRooms());
    this.world.sort("z");
    this.world.alpha = 1;
    this.highlight();
    this.scale.scaleMode = Phaser.ScaleManager.SHOW_ALL;
    this.scale.pageAlignHorizontally = true;
    this.scale.pageAlignVertically = true;
    this.scale.parentIsWindow = false;
    this.scale.refresh();
    this.tick = 0;
    this.game.time.events.loop(80, this.animateRoom, this);
    this.ready = true;
  },

  highlight: function () {
    let description,
      unavailable = false;
    const enemy =
      this.revisionMatches && this.enemies.find((entry) => entry.id === target.guard && entry.room === target.room);
    if (enemy) {
      this.sourceHighlight = new PrinceJS.RoomHighlight(this.game, [enemy, enemy.sword]);
      this.highlightedGuard = enemy.id;
      description = `guard #${enemy.id}`;
    } else if (target.column !== null && target.row !== null) {
      const tile = this.level.getTileAt(target.column, target.row, target.room);
      this.highlightedTile = { room: target.room, column: target.column, row: target.row };
      unavailable = target.tileType !== null && tile.element !== target.tileType;
      if (tile.element === PrinceJS.Level.TILE_SPACE || unavailable || target.guard) {
        // Empty air (e.g. the start of a fall) has no source silhouette. Mark its floor line, never another tile.
        this.marker = this.game.add.graphics(tile.x, tile.y + PrinceJS.BLOCK_HEIGHT);
        this.marker.z = 100;
        this.marker.lineStyle(1, 0xffc857, 1);
        for (let x = 0; x < PrinceJS.BLOCK_WIDTH; x += 6) {
          this.marker.moveTo(x, 0);
          this.marker.lineTo(x + 3, 0);
        }
        this.world.sort("z");
        description =
          tile.element === PrinceJS.Level.TILE_SPACE ? "recorded gap (dashed line)" : "recorded position (dashed line)";
      } else {
        // A plain floor's modifier child is background wall decoration, not part of its walkable surface.
        this.sourceHighlight = new PrinceJS.RoomHighlight(
          this.game,
          [tile.back, tile.front],
          tile.element !== PrinceJS.Level.TILE_FLOOR
        );
        description = "source tile";
      }
    } else {
      status.textContent = "Room shown; this observation has no precise source position.";
      return;
    }
    let note = `Level ${target.level} · Room ${target.room} · highlighted ${description}`;
    if (!this.revisionMatches) {
      note += ". Map revision differs: recorded location is shown on the current layout.";
    } else if (target.guard && !enemy) {
      note += ". The guard is unavailable; only its recorded starting position is marked.";
    }
    if (unavailable) {
      note += ". The recorded tile is not present in this layout.";
    }
    if (target.guard && target.recordedRoom && target.recordedRoom !== target.room) {
      note += ` · Guard's starting room; damage was recorded in room ${target.recordedRoom}.`;
    }
    status.textContent = note;
  },

  animateRoom: function () {
    if (!this.ready || this.failed) {
      return;
    }
    this.tick++;
    for (const tile of this.level.trobs) {
      if (tile.element === PrinceJS.Level.TILE_CHOPPER && !tile.active) {
        tile.chop(false);
      }
      if (tile.element === PrinceJS.Level.TILE_SPIKES && tile.state === PrinceJS.Tile.Spikes.STATE_INACTIVE) {
        tile.raise();
      }
      if (tile.element === PrinceJS.Level.TILE_LOOSE_BOARD && this.tick % 30 === 0) {
        tile.shake(false);
      }
    }
    this.level.update();
    for (const drawing of this.pickups) {
      drawing.elapsed += 0.08;
      drawing.renderPickup();
    }
    for (const enemy of this.enemies) {
      enemy.processCommand();
      enemy.updateCharPosition();
      enemy.updateSwordPosition();
    }
    const alpha = 0.85 + Math.sin(this.tick / 5) * 0.15;
    this.sourceHighlight?.update(alpha);
    if (this.marker) {
      this.marker.alpha = alpha;
    }
  },

  // LevelBuilder's callbacks have no gameplay side effects in the preview.
  fireEvent: function () {},
  floorStartFall: function () {},
  floorStopFall: function () {},
  checkGateFastDropped: function () {},
  handleChop: function () {},
  shutdown: function () {
    window.clearTimeout(this.loadTimeout);
  }
};

if (!target.level || !target.room || (target.map && target.map !== expectedMap)) {
  status.textContent = "This observation has no available map or room.";
} else {
  PrinceJS.Init();
  PrinceJS.currentLevel = target.level;
  const game = new Phaser.Game(640, 400, Phaser.CANVAS, "room-canvas", null, false, false);
  game.state.add("RoomPreview", previewState);
  game.state.start("RoomPreview");
  window.addEventListener("pagehide", () => game.destroy());
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    window.parent.postMessage({ type: "statistics-preview-close" }, window.location.origin);
  }
});
