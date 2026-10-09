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
