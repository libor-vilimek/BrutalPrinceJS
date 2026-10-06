"use strict";

// The launcher keeps the Prince planted while he draws, aims, and stows the tube.
PrinceJS.RocketLauncherAction = function (delegate, direction, spec) {
  PrinceJS.RangedWeapon.call(this, delegate, direction, spec);
  this.actionStage = "hidden";
  this.drawElapsed = 0;
  this.drawDuration = 0.46;
  this.holsterElapsed = 0;
  this.holsterDuration = 0.34;
  this.holsterStartProgress = 1;
  this.stanceAction = "stand";
};

PrinceJS.RocketLauncherAction.prototype = Object.create(PrinceJS.RangedWeapon.prototype);
PrinceJS.RocketLauncherAction.prototype.constructor = PrinceJS.RocketLauncherAction;

PrinceJS.RocketLauncherAction.prototype.beginDraw = function () {
  this.stanceAction = /stoop|crawl/.test(this.kid.action) ? "stoop" : "stand";
  this.kid.action = this.stanceAction;
  if (!this.kid.beginSpecialAction(this, "rocketLauncher")) {
    return false;
  }
  this.kid.actionCode = this.stanceAction === "stoop" ? 1 : 0;
  this.kid.setSpecialActionFrame(this.stanceAction === "stoop" ? 109 : 15);
  this.actionStage = "drawing";
  this.drawElapsed = 0;
  this.effects.setAction(this.actionStage, 0);
  return true;
};

PrinceJS.RocketLauncherAction.prototype.cancelAction = function () {
  PrinceJS.RangedWeapon.prototype.cancelAction.call(this);
  if (this.kid.specialAction && this.kid.specialAction.owner === this) {
    // An injury, fall, or death still owns its original animation after interruption.
    if (this.kid.alive && this.kid.action === this.stanceAction) {
      this.kid.setSpecialActionFrame(this.stanceAction === "stoop" ? 109 : 15);
    }
    this.kid.endSpecialAction(this);
  }
  this.actionStage = "hidden";
  this.drawElapsed = this.holsterElapsed = this.cooldown = 0;
  this.effects.setAction("hidden", 0);
};

PrinceJS.RocketLauncherAction.prototype.beginHolster = function () {
  this.holsterStartProgress = Math.min(1, this.drawElapsed / this.drawDuration);
  this.holsterElapsed = 0;
  this.actionStage = "holstering";
  this.firing = false;
  this.effects.setAction(this.actionStage, this.holsterStartProgress);
};

PrinceJS.RocketLauncherAction.prototype.update = function (delta) {
  if (this.destroyed) {
    return;
  }
  delta = Math.max(0, Math.min(Number(delta) || 0, 0.05));
  this.cooldown = Math.max(0, this.cooldown - delta);
  this.equipTime = Math.max(0, this.equipTime - delta);
  this.checkPickup();

  let canAct = this.canFire();
  let requested = canAct && this.triggerDown();
  let ownsAction = this.kid.specialAction && this.kid.specialAction.owner === this;
  if (this.actionStage !== "hidden" && (!ownsAction || !canAct || this.kid.action !== this.stanceAction)) {
    this.cancelAction();
    requested = false;
  }
  if (["drawing", "firing"].includes(this.actionStage) && !requested) {
    this.beginHolster();
  }
  if (this.actionStage === "hidden" && requested) {
    this.beginDraw();
  }
  if (this.actionStage === "drawing") {
    this.drawElapsed += delta;
    if (this.drawElapsed >= this.drawDuration) {
      this.actionStage = "firing";
    }
  }
  let progress = Math.min(1, this.drawElapsed / this.drawDuration);
  if (this.actionStage === "holstering") {
    // A brief tap reverses the reached pose instead of playing a full stow sequence.
    let duration = this.holsterDuration * Math.max(0.2, this.holsterStartProgress);
    this.holsterElapsed += delta;
    progress = this.holsterStartProgress * Math.max(0, 1 - this.holsterElapsed / duration);
    if (this.holsterElapsed >= duration) {
      this.cancelAction();
      progress = 0;
    }
  }
  this.effects.setAction(this.actionStage, progress);
  this.firing = this.actionStage === "firing";
  this.effects.firing = this.firing;
  // Rockets already in flight keep moving through drawing and stowing.
  this.advanceBullets(delta);
  if (this.firing && this.cooldown === 0) {
    let muzzle = this.effects.getMuzzle();
    if (muzzle.visible !== false) {
      this.fire(muzzle);
      this.cooldown = this.spec.interval;
    }
  }
  this.updateEffects(delta);
  this.drawBullets();
};

PrinceJS.RocketLauncherAction.prototype.updateEffects = function (delta) {
  this.effects.update(delta, this.bullets);
};
