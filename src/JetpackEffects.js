"use strict";

PrinceJS.JetpackEffects = function (game, kid) {
  this.game = game;
  this.kid = kid;
  this.elapsed = 0;
  this.pack = game.add.graphics(0, 0);
  this.exhaust = game.add.graphics(0, 0);
  this.grip = game.add.graphics(0, 0);
  this.head = game.add.sprite(0, 0, "kid", "kid-15");
  this.head.anchor.setTo(0.5, 1);
  this.head.crop(new Phaser.Rectangle(0, 0, 12, 8));
  this.pack.z = 19;
  this.exhaust.z = 18;
  this.grip.z = 24;
  this.head.z = 25;
  this.particles = [];
  this.bodyCrop = new Phaser.Rectangle(0, 0, 0, 15);
  this.croppedKid = false;
  this.hide();
};

PrinceJS.JetpackEffects.prototype = {
  rect: function (graphics, color, x, y, width, height, alpha) {
    graphics.beginFill(color, alpha === undefined ? 1 : alpha);
    graphics.drawRect(Math.round(x), Math.round(y), width, height);
    graphics.endFill();
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
    this.head.y = y + top + 8;
    this.head.scale.x = -direction;
    this.pack.alpha = equip;
    let rect = (graphics, color, rx, ry, width, rh, alpha) => {
      this.rect(graphics, color, rx, ry, width, rh, alpha);
    };

    // Twin steel tanks, red caps, fuel hoses and two nozzles read clearly at the game's pixel scale.
    rect(this.pack, 0x101820, -18, packY, 13, 23);
    rect(this.pack, 0x4c626a, -17, packY + 1, 5, 21);
    rect(this.pack, 0x97adb0, -16, packY + 2, 2, 17);
    rect(this.pack, 0x354950, -11, packY + 1, 5, 21);
    rect(this.pack, 0x718b91, -10, packY + 2, 2, 17);
    rect(this.pack, 0x762e24, -17, packY, 11, 3);
    rect(this.pack, 0xd56742, -16, packY, 9, 1);
    rect(this.pack, 0x182830, -18, packY + 11, 14, 3);
    rect(this.pack, 0xb49c56, -18, packY + 12, 14, 1);
    rect(this.pack, 0x202d35, -16, packY + 22, 4, 4);
    rect(this.pack, 0x202d35, -10, packY + 22, 4, 4);
    rect(this.pack, 0x9baba3, -16, packY + 23, 4, 1);
    rect(this.pack, 0x9baba3, -10, packY + 23, 4, 1);
    rect(this.pack, 0x243940, -6, packY + 4, 5, 2);
    rect(this.pack, 0xbd874c, -2, packY + 5, 2, 6);

    // Match the original Prince palette. Only these two bent arms remain above the cropped legs.
    let shoulder = top + 10;
    rect(this.grip, 0xdd8866, -1, top + 7, 3, 5);
    rect(this.grip, 0xbb7766, -1, top + 10, 1, 2);
    rect(this.grip, 0xddbbaa, -5, shoulder + 1, 9, height - 25);
    rect(this.grip, 0xffffdd, -4, shoulder + 1, 7, height - 25);
    rect(this.grip, 0xddbbaa, -5, -19, 9, 4);
    rect(this.grip, 0xffffdd, -4, -18, 7, 3);
    rect(this.grip, 0xbb9966, -5, -20, 9, 1);
    rect(this.grip, 0x554530, -5, shoulder, 2, 14);
    rect(this.grip, 0xb39c61, -5, shoulder + 1, 1, 12);
    rect(this.grip, 0x544630, 3, shoulder + 1, 2, 13);
    rect(this.grip, 0xa28f54, 4, shoulder + 2, 1, 11);
    rect(this.grip, 0xddbbaa, -8, shoulder + 2, 3, 8);
    rect(this.grip, 0xffffdd, -8, shoulder + 2, 2, 6);
    rect(this.grip, 0xffffdd, -7, shoulder + 8, 5, 3);
    rect(this.grip, 0xdd8866, -4, shoulder + 5, 3, 5);
    rect(this.grip, 0xbb7766, -4, shoulder + 9, 3, 1);
    rect(this.grip, 0xddbbaa, 5, shoulder + 3, 3, 8);
    rect(this.grip, 0xffffdd, 3, shoulder + 10, 5, 3);
    rect(this.grip, 0xdd8866, 2, shoulder + 6, 3, 6);
    rect(this.grip, 0xbb7766, 2, shoulder + 11, 3, 1);
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
    this.pack.destroy();
    this.grip.destroy();
    this.exhaust.destroy();
    this.head.destroy();
  }
};
