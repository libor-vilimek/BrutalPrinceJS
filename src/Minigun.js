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
  this.holsterElapsed = 0;
  this.holsterDuration = 0.32;
  this.holsterStartProgress = 1;
  this.stanceAction = "stand";
};

PrinceJS.Minigun.prototype = Object.create(PrinceJS.RangedWeapon.prototype);
PrinceJS.Minigun.prototype.constructor = PrinceJS.Minigun;

PrinceJS.Minigun.prototype.findPickup = function (direction) {
  let pickup = PrinceJS.RangedWeapon.prototype.findPickup.call(this, direction);
  if (this.level.number === 1 && this.kid.room === 1) {
    let below = this.level.rooms[this.kid.room].links.down;
    let room = this.level.rooms[below];
    let tile = room && this.level.getTileAt(7, 1, below);
    if (tile && tile.element === PrinceJS.Level.TILE_FLOOR) {
      // The second screen is below the start. This clear right-hand floor
      // keeps the gun between the pillars, beyond the landing and loose board.
      pickup.room = below;
      pickup.worldX = room.x * PrinceJS.ROOM_WIDTH + 7 * PrinceJS.BLOCK_WIDTH + 16;
      pickup.worldY = room.y * PrinceJS.ROOM_HEIGHT + PrinceJS.Utils.convertBlockYtoY(1) + 3;
    }
  }
  return pickup;
};

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
  this.holsterElapsed = 0;
  this.cooldown = 0;
  this.effects.setAction("hidden", 0);
};

PrinceJS.Minigun.prototype.beginHolster = function () {
  this.holsterStartProgress = Math.min(1, this.drawElapsed / this.drawDuration);
  this.holsterElapsed = 0;
  this.actionStage = "holstering";
  this.firing = false;
  this.effects.setAction(this.actionStage, this.holsterStartProgress);
};

PrinceJS.Minigun.prototype.update = function (delta) {
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
    // Reverse only the portion actually drawn if the trigger was released early.
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
