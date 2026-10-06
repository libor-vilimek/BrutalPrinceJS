"use strict";

PrinceJS.Minigun = function (delegate, direction) {
  PrinceJS.RangedWeapon.call(this, delegate, direction, {
    id: "minigun",
    label: "MINIGUN",
    owned: "hasMinigun",
    equipped: "minigunEquipped",
    effects: PrinceJS.MinigunEffects,
    pickupRadius: 18,
    interval: 0.065,
    speed: 640,
    lifetime: 1.25,
    maxProjectiles: 32
  });
  this.actionStage = "hidden";
  this.drawElapsed = 0;
  this.drawDuration = 0.44;
  this.stanceAction = "stand";
};

PrinceJS.Minigun.prototype = Object.create(PrinceJS.RangedWeapon.prototype);
PrinceJS.Minigun.prototype.constructor = PrinceJS.Minigun;

PrinceJS.Minigun.prototype.beginDraw = function () {
  this.stanceAction = /stoop|crawl/.test(this.kid.action) ? "stoop" : "stand";
  this.kid.action = this.stanceAction;
  if (!this.kid.beginSpecialAction(this, "minigun")) {
    return false;
  }
  this.kid.actionCode = this.stanceAction === "stoop" ? 1 : 0;
  this.kid.setSpecialActionFrame(this.stanceAction === "stoop" ? 109 : 15);
  this.actionStage = "drawing";
  this.drawElapsed = 0;
  this.effects.setAction(this.actionStage, 0);
  return true;
};

PrinceJS.Minigun.prototype.cancelAction = function () {
  PrinceJS.RangedWeapon.prototype.cancelAction.call(this);
  let owned = this.kid.specialAction && this.kid.specialAction.owner === this;
  if (owned) {
    // Never replace a hit, fall, or death sequence when an action is interrupted.
    if (this.kid.alive && this.kid.action === this.stanceAction) {
      this.kid.setSpecialActionFrame(this.stanceAction === "stoop" ? 109 : 15);
    }
    this.kid.endSpecialAction(this);
  }
  this.actionStage = "hidden";
  this.drawElapsed = 0;
  this.cooldown = 0;
  this.effects.setAction("hidden", 0);
};

PrinceJS.Minigun.prototype.update = function (delta) {
  if (this.destroyed) {
    return;
  }
  delta = Math.max(0, Math.min(Number(delta) || 0, 0.05));
  this.cooldown = Math.max(0, this.cooldown - delta);
  this.equipTime = Math.max(0, this.equipTime - delta);
  this.checkPickup();

  let requested = this.canFire() && this.triggerDown();
  let ownsAction = this.kid.specialAction && this.kid.specialAction.owner === this;
  if (this.actionStage !== "hidden" && (!ownsAction || !requested || this.kid.action !== this.stanceAction)) {
    this.cancelAction();
    requested = false;
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
  this.effects.setAction(this.actionStage, Math.min(1, this.drawElapsed / this.drawDuration));
  this.firing = this.actionStage === "firing";
  this.effects.firing = this.firing;
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

PrinceJS.Minigun.prototype.playShotSound = function () {
  if (this.delegate.weaponAudio) {
    this.delegate.weaponAudio.minigunShot();
  }
};
