"use strict";

PrinceJS.JetpackEffects = function (game, kid, pickup) {
  this.game = game;
  this.kid = kid;
  this.pickup = pickup;
  this.elapsed = 0;
  this.pickupGraphic = game.add.graphics(0, 0);
  this.pack = game.add.graphics(0, 0);
  this.exhaust = game.add.graphics(0, 0);
  this.grip = game.add.graphics(0, 0);
  this.head = game.add.sprite(0, 0, "kid", "kid-15");
  this.head.anchor.setTo(0.5, 1);
  this.head.crop(new Phaser.Rectangle(0, 0, 12, PrinceJS.PrincePose.HEAD_HEIGHT));
  this.pack.z = 19;
  this.pickupGraphic.z = 20;
  this.exhaust.z = 18;
  this.grip.z = 24;
  this.head.z = 25;
  this.particles = [];
  this.bodyCrop = new Phaser.Rectangle(0, 0, 0, 15);
  this.croppedKid = false;
  this.hide();
  this.drawPickup();
};

PrinceJS.JetpackEffects.prototype = {
  rect: function (graphics, color, x, y, width, height, alpha) {
    graphics.beginFill(color, alpha === undefined ? 1 : alpha);
    graphics.drawRect(Math.round(x), Math.round(y), width, height);
    graphics.endFill();
  },

  drawPack: function (graphics, x, y) {
    let rect = (color, rx, ry, width, height) => this.rect(graphics, color, x + rx, y + ry, width, height);
    // The pickup and worn pack share the same steel tanks, caps, hoses and nozzles.
    rect(0x101820, -18, 0, 13, 23);
    rect(0x4c626a, -17, 1, 5, 21);
    rect(0x97adb0, -16, 2, 2, 17);
    rect(0x354950, -11, 1, 5, 21);
    rect(0x718b91, -10, 2, 2, 17);
    rect(0x762e24, -17, 0, 11, 3);
    rect(0xd56742, -16, 0, 9, 1);
    rect(0x182830, -18, 11, 14, 3);
    rect(0xb49c56, -18, 12, 14, 1);
    rect(0x202d35, -16, 22, 4, 4);
    rect(0x202d35, -10, 22, 4, 4);
    rect(0x9baba3, -16, 23, 4, 1);
    rect(0x9baba3, -10, 23, 4, 1);
    rect(0x243940, -6, 4, 5, 2);
    rect(0xbd874c, -2, 5, 2, 6);
  },

  drawPickup: function () {
    let graphics = this.pickupGraphic;
    graphics.clear();
    graphics.visible = !!this.pickup && !this.pickup.collected;
    if (!graphics.visible) {
      return;
    }
    graphics.x = this.pickup.worldX;
    graphics.y = this.pickup.worldY;
    let glow = 0.14 + Math.sin(this.elapsed * 3) * 0.05;
    this.rect(graphics, 0x6ac6d6, -18, -2, 36, 3, glow);
    this.rect(graphics, 0x172f39, -9, -26, 19, 25, 0.8);
    this.rect(graphics, 0xa49a77, -10, -27, 2, 21);
    this.rect(graphics, 0x62573d, 8, -26, 2, 21);
    this.drawPack(graphics, 13, -26);
    this.rect(graphics, 0xd9f1ed, -3, -24, 1, 4);
    // A small J tag makes the pickup's control visible beside the twin tanks.
    this.rect(graphics, 0x101c26, 12, -12, 8, 9);
    this.rect(graphics, 0x92d9df, 14, -10, 4, 1);
    this.rect(graphics, 0x92d9df, 17, -9, 1, 4);
    this.rect(graphics, 0x92d9df, 14, -6, 3, 1);
    this.rect(graphics, 0x92d9df, 14, -8, 1, 2);
  },

  collect: function () {
    this.pickupGraphic.clear();
    this.pickupGraphic.visible = false;
  },

  hide: function () {
    if (this.croppedKid) {
      if (this.kid.cropRect === this.bodyCrop) {
        this.kid.crop(this.savedCrop);
      }
      if (this.croppedShadow && this.croppedShadow.cropRect === this.bodyCrop) {
        this.croppedShadow.crop(this.savedShadowCrop);
      }
      this.croppedKid = false;
      this.croppedShadow = null;
      this.savedCrop = this.savedShadowCrop = null;
    }
    for (let graphics of [this.pack, this.exhaust, this.grip]) {
      graphics.clear();
      graphics.visible = false;
    }
    this.head.visible = false;
    this.particles.length = 0;
  },

  cropBody: function (bounds) {
    let copyCrop = (crop) => (crop ? new Phaser.Rectangle(crop.x, crop.y, crop.width, crop.height) : null);
    if (!this.croppedKid) {
      this.savedCrop = copyCrop(this.kid.cropRect);
      this.croppedKid = true;
    }
    // Keep only the native bent legs: the recovery frames contain an outstretched hand at the waist.
    this.bodyCrop.x = 0;
    this.bodyCrop.y = bounds.height - 15;
    this.bodyCrop.width = bounds.width;
    this.bodyCrop.height = 15;
    this.kid.crop(this.bodyCrop);
    if (this.kid.shadowOverlay && this.kid.shadowOverlay.visible) {
      if (this.croppedShadow !== this.kid.shadowOverlay) {
        this.croppedShadow = this.kid.shadowOverlay;
        this.savedShadowCrop = copyCrop(this.croppedShadow.cropRect);
      }
      this.croppedShadow.crop(this.bodyCrop);
    }
  },

  update: function (delta, jetpack) {
    if (this.destroyed) {
      return;
    }
    let dt = Math.max(0, Math.min(Number(delta) || 0, 0.05));
    this.elapsed += dt;
    this.drawPickup();
    if (!jetpack.active || !this.kid.alive || !this.kid.visible) {
      this.hide();
      return;
    }
    let kid = this.kid;
    let bounds = kid.getCharBounds();
    let direction = kid.charFace === -1 ? -1 : 1;
    // Align the torso with the native hip pixels, rather than the full frame's extended arm bounds.
    let hipOffset = kid.charFrame === 15 ? 6 : 8;
    let x = Math.round(kid.x - hipOffset * direction);
    let y = Math.round(kid.baseY + kid.charY);
    let height = bounds.height;
    let top = -height;
    let equip = jetpack.phase === "equipping" ? Math.min(1, jetpack.elapsed / 0.24) : 1;
    let packY = top + 9 + Math.round((1 - equip) * 6);
    this.cropBody(bounds);
    for (let graphics of [this.pack, this.grip]) {
      graphics.clear();
      graphics.visible = true;
      graphics.x = x;
      graphics.y = y;
      graphics.scale.x = direction;
    }
    this.head.visible = true;
    this.head.x = x;
    this.head.y = y + top + PrinceJS.PrincePose.HEAD_HEIGHT;
    this.head.scale.x = -direction;
    this.pack.alpha = equip;
    let rect = (graphics, color, rx, ry, width, rh, alpha) => {
      this.rect(graphics, color, rx, ry, width, rh, alpha);
    };

    this.drawPack(this.pack, 0, packY);

    // Match the original Prince palette. Only these two bent arms remain above the cropped legs.
    let shoulder = top + 9;
    PrinceJS.PrincePose.drawTorso(this.grip, top + PrinceJS.PrincePose.HEAD_HEIGHT, -15, 0);
    rect(this.grip, 0x554530, -5, shoulder, 2, 14);
    rect(this.grip, 0xb39c61, -5, shoulder + 1, 1, 12);
    rect(this.grip, 0x544630, 3, shoulder + 1, 2, 13);
    rect(this.grip, 0xa28f54, 4, shoulder + 2, 1, 11);
    PrinceJS.PrincePose.drawArm(
      this.grip,
      PrinceJS.PrincePose.arm({ x: -3, y: shoulder + 2 }, { x: -3, y: shoulder + 9 }, 1, 0.7)
    );
    PrinceJS.PrincePose.drawArm(
      this.grip,
      PrinceJS.PrincePose.arm({ x: 2, y: shoulder + 3 }, { x: 3, y: shoulder + 10 }, -1, 0.7)
    );
    rect(this.grip, 0xdac690, -5, shoulder + 11, 2, 2);
    rect(this.grip, 0xdac690, 3, shoulder + 12, 2, 2);

    this.drawExhaust(dt, jetpack, x, y, direction, packY, equip);
  },

  drawExhaust: function (dt, jetpack, x, y, direction, packY, equip) {
    let graphics = this.exhaust;
    graphics.clear();
    graphics.visible = true;
    graphics.x = graphics.y = 0;
    if (jetpack.phase === "flying") {
      let boost = Math.max(0, -jetpack.velocityY / 96);
      let length = 9 + Math.round(boost * 8) + (Math.floor(this.elapsed * 45) % 4);
      for (let nozzle of [-14, -8]) {
        let flameX = Math.round(x + nozzle * direction);
        let flameY = y + packY + 26;
        this.rect(graphics, 0xe86724, flameX - 3, flameY, 5, length, 0.75);
        this.rect(graphics, 0xffbd38, flameX - 2, flameY, 3, length - 2, 0.95);
        this.rect(graphics, 0xfff4aa, flameX - 1, flameY, 1, Math.max(3, length - 5));
        this.rect(graphics, 0x78bcdf, flameX - 2, flameY, 3, 3);
        if (dt > 0 && this.particles.length < 40) {
          this.particles.push({
            x: flameX,
            y: flameY + length,
            vx: -jetpack.velocityX * 0.3 + nozzle,
            vy: 22 + boost * 22,
            life: 0.28,
            hot: Math.floor(this.elapsed * 30) % 3 === 0
          });
        }
      }
    } else if (equip > 0.55) {
      this.rect(graphics, 0xffb434, x - 14 * direction, y + packY + 26, 2, 3);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      let particle = this.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      let alpha = (particle.life / 0.28) * (particle.hot ? 0.75 : 0.3);
      let size = particle.hot ? 1 : particle.life < 0.14 ? 3 : 2;
      this.rect(graphics, particle.hot ? 0xffcc49 : 0x99988b, particle.x, particle.y, size, size, alpha);
    }
  },

  destroy: function () {
    if (this.destroyed) {
      return;
    }
    this.hide();
    this.destroyed = true;
    this.pickupGraphic.destroy();
    this.pack.destroy();
    this.grip.destroy();
    this.exhaust.destroy();
    this.head.destroy();
  }
};
