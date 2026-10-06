"use strict";

PrinceJS.TwinTorchesEffects = function (game, kid) {
  this.game = game;
  this.kid = kid;
  this.elapsed = 0;
  this.hitTime = 0;
  this.back = game.add.graphics(0, 0);
  this.light = game.add.graphics(0, 0);
  this.body = game.add.graphics(0, 0);
  this.front = game.add.graphics(0, 0);
  this.head = game.add.sprite(0, 0, "kid", "kid-15");
  this.head.anchor.setTo(0, 1);
  this.head.crop(new Phaser.Rectangle(0, 0, 12, PrinceJS.PrincePose.HEAD_HEIGHT));
  this.back.z = 21;
  this.light.z = 19;
  this.body.z = 24;
  this.head.z = 25;
  this.front.z = 26;
  this.bodyCrop = new Phaser.Rectangle(0, 25, 12, 16);
  this.croppedKid = false;
  this.originalTint = null;
  this.hide();
};

PrinceJS.TwinTorchesEffects.prototype = {
  rect: function (graphic, color, x, y, width, height, alpha) {
    graphic.beginFill(color, alpha === undefined ? 1 : alpha);
    graphic.drawRect(Math.round(x), Math.round(y), width, height);
    graphic.endFill();
  },

  limb: function (graphic, from, to, color, width) {
    let steps = Math.max(1, Math.ceil(Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y))));
    for (let i = 0; i <= steps; i++) {
      this.rect(
        graphic,
        color,
        from.x + ((to.x - from.x) * i) / steps - width / 2,
        from.y + ((to.y - from.y) * i) / steps - width / 2,
        width,
        width
      );
    }
  },

  copyCrop: function (crop) {
    return crop ? new Phaser.Rectangle(crop.x, crop.y, crop.width, crop.height) : null;
  },

  cropBody: function () {
    if (!this.croppedKid) {
      this.savedCrop = this.copyCrop(this.kid.cropRect);
      this.croppedKid = true;
    }
    let frame = this.game.cache && this.game.cache.getFrameByName("kid", "kid-" + this.kid.charFrame);
    this.bodyCrop.y = (frame ? frame.height : 41) - 16;
    this.bodyCrop.width = frame ? frame.width : 12;
    this.kid.crop(this.bodyCrop);
    if (this.kid.shadowOverlay && this.kid.shadowOverlay.visible) {
      if (this.croppedShadow !== this.kid.shadowOverlay) {
        this.croppedShadow = this.kid.shadowOverlay;
        this.savedShadowCrop = this.copyCrop(this.croppedShadow.cropRect);
      }
      this.croppedShadow.crop(this.bodyCrop);
    }
  },

  restoreBody: function () {
    if (!this.croppedKid) {
      return;
    }
    if (this.kid.cropRect === this.bodyCrop) {
      this.kid.crop(this.savedCrop);
    }
    if (this.croppedShadow && this.croppedShadow.cropRect === this.bodyCrop) {
      this.croppedShadow.crop(this.savedShadowCrop);
    }
    this.croppedKid = false;
    this.croppedShadow = null;
    this.savedCrop = this.savedShadowCrop = null;
  },

  restoreTint: function () {
    if (this.originalTint !== null) {
      if (this.kid.tint === this.lastTint) {
        this.kid.tint = this.originalTint;
      }
      this.originalTint = null;
    }
    this.head.tint = 0xffffff;
  },

  hide: function () {
    this.restoreBody();
    this.restoreTint();
    for (let graphic of [this.back, this.light, this.body, this.front]) {
      graphic.clear();
      graphic.visible = false;
    }
    this.head.visible = false;
  },

  interpolate: function (from, to, amount) {
    amount = Math.max(0, Math.min(1, amount));
    let ease = amount * amount * (3 - 2 * amount);
    return { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease };
  },

  introHand: function (weapon, index, x, y) {
    let torch = weapon.introTorches[index];
    let start = index === 0 ? 0.1 : 0.66;
    let capture = PrinceJS.TwinTorches.INTRO_CAPTURES[index];
    let tuck = index === 0 ? 0.56 : 1.18;
    let time = weapon.elapsed;
    let waist = { x: index ? -9 : -3, y: -18 };
    let socket = { x: (torch.x - x) * this.kid.charFace, y: torch.y + 18 - y };
    let hand =
      time < capture
        ? this.interpolate(waist, socket, (time - start) / (capture - start))
        : this.interpolate(socket, waist, (time - capture) / (tuck - capture));
    return { hand: hand, flame: time >= capture && time < tuck, torch: { x: hand.x, y: hand.y - 18 } };
  },

  actionHand: function (weapon, index) {
    let side = index ? -1 : 1;
    let waist = { x: index ? -9 : -3, y: -18 };
    let progress = weapon.drawProgress;
    if (weapon.actionStage === "spinning") {
      let angle = weapon.spinTime * Math.PI * 5 + index * Math.PI;
      let cos = Math.cos(angle);
      let sin = Math.sin(angle);
      return {
        hand: { x: -6 + cos * 17, y: -27 + sin * 4 },
        torch: { x: -6 + cos * 38, y: -29 + sin * 8 },
        flame: true,
        depth: sin,
        angle: angle
      };
    }
    let spread = Math.max(0, Math.min(1, (progress - 0.22) / 0.78));
    let hand = this.interpolate(waist, { x: -6 + side * 17, y: -27 }, spread);
    let torch = { x: hand.x + side * (2 + spread * 8), y: hand.y - 17 };
    if (weapon.actionStage === "holstering" && weapon.holsterFromSpin) {
      let angle = weapon.spinTime * Math.PI * 5 + index * Math.PI;
      hand = this.interpolate({ x: -6 + Math.cos(angle) * 17, y: -27 + Math.sin(angle) * 4 }, waist, 1 - progress);
      torch = this.interpolate(
        { x: -6 + Math.cos(angle) * 38, y: -29 + Math.sin(angle) * 8 },
        { x: waist.x + side * 2, y: waist.y - 17 },
        1 - progress
      );
    }
    return {
      hand: hand,
      torch: torch,
      flame: progress > 0.22,
      depth: side
    };
  },

  drawTorch: function (graphic, hand, flame, index) {
    let end = flame.torch;
    this.limb(graphic, hand, end, 0x442a18, 3);
    this.limb(graphic, { x: hand.x, y: hand.y - 1 }, { x: end.x, y: end.y - 1 }, 0x98704a, 1);
    this.rect(graphic, 0xbca782, end.x - 2, end.y - 2, 5, 4);
    this.rect(graphic, 0x796249, end.x - 2, end.y, 5, 1);
    this.drawFlame(graphic, end.x, end.y - 3, index);
  },

  drawFlame: function (graphic, x, y, index, alpha) {
    let flicker = Math.floor(this.elapsed * 35 + index * 3) % 3;
    alpha = alpha === undefined ? 1 : alpha;
    this.rect(graphic, 0xc4471e, x - 4, y - 4, 8, 7, 0.8 * alpha);
    this.rect(graphic, 0xee761e, x - 3, y - 8 - flicker, 6, 10 + flicker, alpha);
    this.rect(graphic, 0xffb832, x - 2, y - 7 - flicker, 4, 8 + flicker, alpha);
    this.rect(graphic, 0xffe57a, x - 1, y - 4, 2, 6, alpha);
    this.rect(graphic, 0xffffcf, x, y - 2, 1, 3, alpha);
    this.rect(graphic, 0xffb832, x + (index ? -2 : 3), y - 12 - flicker, 1, 2, 0.65 * alpha);
    this.light.beginFill(0xffbb35, 0.045 * alpha);
    this.light.drawCircle(x, y - 3, 42);
    this.light.endFill();
    this.light.beginFill(0xffd55a, 0.07 * alpha);
    this.light.drawCircle(x, y - 2, 20);
    this.light.endFill();
  },

  drawTrail: function (weapon, index) {
    for (let i = 6; i >= 1; i--) {
      let angle = weapon.spinTime * Math.PI * 5 + index * Math.PI - i * 0.16;
      let sin = Math.sin(angle);
      let x = -6 + Math.cos(angle) * 54;
      let y = -32 + sin * 8;
      let graphic = sin < 0 ? this.back : this.front;
      this.rect(graphic, i > 3 ? 0xd9531e : 0xffad32, x - 2, y - 2, 4, 5, (7 - i) * 0.065);
      this.rect(graphic, 0xffe382, x, y - 1, 1, 3, (7 - i) * 0.075);
      // The outer fire wake retains its original radius while the arms stay compact.
      this.light.beginFill(0xffbb35, (7 - i) * 0.0015);
      this.light.drawCircle(x, y, 42);
      this.light.endFill();
    }
  },

  update: function (delta, weapon) {
    if (this.destroyed) {
      return;
    }
    this.elapsed += delta;
    this.hitTime = Math.max(0, this.hitTime - delta);
    if (weapon.actionStage === "hidden" || !weapon.validAction()) {
      this.hide();
      return;
    }
    let kid = this.kid;
    let x = Math.round(kid.baseX + PrinceJS.Utils.convertX(kid.charX));
    let y = Math.round(kid.baseY + kid.charY);
    for (let graphic of [this.back, this.light, this.body, this.front]) {
      graphic.clear();
      graphic.visible = true;
      graphic.x = x;
      graphic.y = y;
      graphic.scale.x = kid.charFace;
    }
    this.cropBody();
    let spinning = weapon.actionStage === "spinning";
    let rotation = weapon.spinTime * Math.PI * 5;
    let facing = spinning ? (Math.cos(rotation) < 0 ? -kid.charFace : kid.charFace) : kid.charFace;
    let width = spinning ? 5 + Math.round(Math.abs(Math.cos(rotation)) * 3) : 8;
    let left = -6 - width / 2;
    this.rect(this.body, 0xddbbaa, left, -32, width, 16);
    this.rect(this.body, 0xffffdd, left + 1, -32, width - 1, 16);
    this.head.visible = true;
    this.head.x = x - 6 * kid.charFace + 6 * facing;
    this.head.y = y - 41 + PrinceJS.PrincePose.HEAD_HEIGHT;
    this.head.scale.x = -facing;
    if (this.originalTint === null) {
      this.originalTint = typeof kid.tint === "number" ? kid.tint : 0xffffff;
    }
    this.lastTint = this.hitTime > 0 ? 0xffb395 : this.originalTint;
    kid.tint = this.head.tint = this.lastTint;
    for (let index = 0; index < 2; index++) {
      let pose = weapon.actionStage === "intro" ? this.introHand(weapon, index, x, y) : this.actionHand(weapon, index);
      let side = index ? -1 : 1;
      let shoulder = { x: -6 + side * 3, y: -30 };
      if (spinning) {
        shoulder.x = -6 + Math.cos(pose.angle) * 3;
        shoulder.y += pose.depth;
      }
      let arm = PrinceJS.PrincePose.arm(shoulder, pose.hand, side);
      let offset = { x: arm.hand.x - pose.hand.x, y: arm.hand.y - pose.hand.y };
      pose.torch.x += offset.x;
      pose.torch.y += offset.y;
      pose.hand = arm.hand;
      let graphic = spinning && pose.depth < 0 ? this.back : this.front;
      PrinceJS.PrincePose.drawArm(graphic, arm);
      if (spinning) {
        this.drawTrail(weapon, index);
      }
      if (pose.flame) {
        this.drawTorch(graphic, pose.hand, pose, index);
      }
      this.rect(graphic, 0xbb7766, pose.hand.x - 1, pose.hand.y - 1, 3, 3);
      this.rect(graphic, 0xdd8866, pose.hand.x - 1, pose.hand.y - 1, 2, 2);
    }
  },

  destroy: function () {
    if (this.destroyed) {
      return;
    }
    this.hide();
    this.destroyed = true;
    for (let object of [this.back, this.light, this.body, this.front, this.head]) {
      object.destroy();
    }
  }
};
