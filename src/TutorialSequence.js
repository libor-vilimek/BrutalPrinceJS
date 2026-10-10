"use strict";

// Small pieces of campaign choreography. Movement still uses the Prince's
// native step/turn/climb animations and real floors; lessons own the pauses.
PrinceJS.TutorialSequence = function (state, tutorial) {
  this.state = state;
  this.tutorial = tutorial;
  this.guiding = false;
  this.ledgeReady = false;
  this.stage = "waiting";
  this.opening = state.enemies && state.enemies.find((enemy) => enemy.burnRoute === "opening-shaft");
};

PrinceJS.TutorialSequence.prototype = {
  findExitRocketTarget: function () {
    const kid = this.state.kid;
    if (
      !kid.hasRocketLauncher ||
      kid.specialAction ||
      kid.inFallDown ||
      kid.inJumpUp ||
      kid.pickupPotion ||
      kid.pickupSword ||
      (!["stand", "startrun", "running", "runstop"].includes(kid.action) && !/^step\d+$/.test(kid.action))
    ) {
      return null;
    }
    const target = this.findRocketTarget(4 * PrinceJS.BLOCK_WIDTH);
    return target && target.element === PrinceJS.Level.TILE_EXIT_RIGHT ? target : null;
  },

  findRocketTarget: function (maxDistance = PrinceJS.ROOM_WIDTH) {
    const s = this.state;
    const launcher = s.rocketLauncher;
    const muzzle = launcher.effects.getMuzzle();
    const point = { x: s.kid.baseX + PrinceJS.Utils.convertX(s.kid.charX), y: muzzle.y, room: s.kid.room };
    this.rocketTarget = null;
    // Follow the native rocket's two-pixel collision sweep from body to muzzle
    // and through room links, including barriers underneath the long barrel.
    // Limit the demonstration to the current room and its visible neighbors.
    const range = Math.min(launcher.spec.range, maxDistance);
    for (let distance = 0; distance <= range; distance += 2) {
      let room = s.level.rooms[point.room];
      if (!room) {
        return null;
      }
      if (point.x < room.x * PrinceJS.ROOM_WIDTH || point.x >= (room.x + 1) * PrinceJS.ROOM_WIDTH) {
        point.room = point.x < room.x * PrinceJS.ROOM_WIDTH ? room.links.left : room.links.right;
        room = s.level.rooms[point.room];
        if (!room) {
          return null;
        }
      }
      const tile = launcher.obstacleAt(point, room);
      if (tile) {
        const camera = s.roomCamera;
        const visible =
          !camera ||
          (point.x >= camera.camera.x / camera.scale &&
            point.x < camera.camera.x / camera.scale + camera.viewWidth &&
            point.y >= camera.camera.y / camera.scale &&
            point.y < camera.camera.y / camera.scale + camera.viewHeight);
        if (
          [PrinceJS.Level.TILE_WALL, PrinceJS.Level.TILE_GATE, PrinceJS.Level.TILE_EXIT_RIGHT].includes(tile.element) &&
          tile.doorRole !== "entrance" &&
          !tile.destroyedByRocket &&
          s.level.rooms[tile.room] &&
          s.level.getTileAt(tile.roomX, tile.roomY, tile.room) === tile &&
          visible
        ) {
          this.rocketTarget = tile;
        }
        return this.rocketTarget;
      }
      // Do not announce a demolition shot that would hit a guard first.
      if (
        s.enemies.some((enemy) => {
          if (
            !enemy.alive ||
            !enemy.active ||
            !enemy.visible ||
            enemy.charFrame === undefined ||
            enemy.room !== point.room
          ) {
            return false;
          }
          const bounds = enemy.getCharBounds();
          return (
            point.x >= enemy.baseX + bounds.x &&
            point.x <= enemy.baseX + bounds.x + bounds.width &&
            point.y >= enemy.baseY + bounds.y &&
            point.y <= enemy.baseY + bounds.y + bounds.height
          );
        })
      ) {
        return null;
      }
      point.x += muzzle.direction * 2;
    }
    return null;
  },

  rocketTargetDestroyed: function () {
    const tile = this.rocketTarget;
    if (!tile) {
      return false;
    }
    const current = this.state.level.getTileAt(tile.roomX, tile.roomY, tile.room);
    return !!(
      current &&
      (current.destroyedByRocket || (current !== tile && current.destroyedElement === tile.element))
    );
  },

  update: function () {
    const s = this.state;
    const kid = s.kid;
    if (this.tutorial.completed.has("ledge-molotov") && !s.molotov.throwState) {
      this.tutorial.releaseHeldKey(Phaser.Keyboard.SHIFT);
    }
    if (
      !this.opening ||
      !this.opening.burningDeath ||
      s.level.number !== 1 ||
      PrinceJS.currentLevel !== 1 ||
      this.tutorial.completed.has("ledge-hang") ||
      this.stage !== "waiting" ||
      !this.tutorial.completed.has("twin-torches") ||
      kid.room !== 1 ||
      kid.charBlockY !== 2 ||
      ![4, 5].includes(kid.charBlockX) ||
      !kid.hasMolotov ||
      kid.action !== "stand" ||
      kid.specialAction ||
      kid.inFallDown ||
      kid.inJumpUp ||
      this.tutorial.downKeys.has(Phaser.Keyboard.C)
    ) {
      return;
    }
    this.guiding = true;
    this.stage = "edge";
    s.game.input.reset(false);
    s.ui.showText("FOLLOW THE PRINCE TO THE LEDGE", "tutorial");
    s.ui.hideTextTimer = 45;
  },

  beforeWorld: function () {
    if (!this.guiding) {
      return;
    }
    const kid = this.state.kid;
    if (!kid.alive || kid.room !== 1 || kid.specialAction) {
      this.cancel();
      return;
    }
    if (kid.action !== "stand") {
      return;
    }
    // Clear touch/pad/keyboard motion during this short, explicit guided walk.
    this.state.game.input.reset(false);
    if (this.stage === "edge") {
      if (this.state.level.getTileAt(6, 2, 1).element !== PrinceJS.Level.TILE_SPACE) {
        return;
      }
      if (kid.charFace !== 1) {
        kid.turn();
      } else if (kid.charBlockX === 5 && kid.distanceToEdge() <= 0) {
        kid.turn();
        this.stage = "turn";
      } else {
        kid.step();
      }
    } else if (this.stage === "turn" && kid.charFace === -1) {
      this.guiding = false;
      this.ledgeReady = true;
      this.stage = "ready";
      this.tutorial.show(this.tutorial.lessons.find((lesson) => lesson.id === "ledge-hang"));
    }
  },

  cancel: function () {
    if (this.guiding) {
      this.guiding = false;
      this.stage = "waiting";
    }
  }
};
