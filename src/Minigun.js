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
};

PrinceJS.Minigun.prototype = Object.create(PrinceJS.RangedWeapon.prototype);
PrinceJS.Minigun.prototype.constructor = PrinceJS.Minigun;

PrinceJS.Minigun.prototype.playShotSound = function () {
  if (this.delegate.weaponAudio) {
    this.delegate.weaponAudio.minigunShot();
  }
};
