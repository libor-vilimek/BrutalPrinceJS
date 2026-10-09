"use strict";

PrinceJS.WhipEffects = function (game, kid, pickup) {
  this.game = game;
  this.kid = kid;
  this.pickup = pickup;
  this.collected = !!pickup.collected;
  this.elapsed = 0;
  this.flashTime = 0;
  this.target = this.tether = null;
  this.puffs = [];
  this.ground = game.add.graphics(0, 0);
  this.pose = game.add.graphics(0, 0);
  this.cord = game.add.graphics(0, 0);
  this.flash = game.add.graphics(0, 0);
  this.head = game.add.sprite(0, 0, "kid", "kid-15");
  this.head.anchor.setTo(0, 1);
  this.head.crop(new Phaser.Rectangle(0, 0, 12, PrinceJS.PrincePose.HEAD_HEIGHT));
  this.bodyCrop = new Phaser.Rectangle(0, 25, 12, 16);
  this.ground.z = 22;
  this.pose.z = 24;
  this.head.z = 25;
  this.cord.z = 26;
  this.flash.z = 27;
  this.ground.visible = !this.collected;
  this.hide();
  this.drawPickup();
};

PrinceJS.WhipEffects.prototype = {
  rect: function (layer, color, x, y, width, height, alpha) {
    layer.beginFill(color, alpha === undefined ? 1 : alpha);
    layer.drawRect(Math.round(x), Math.round(y), width, height);
    layer.endFill();
  },

  limb: function (layer, from, to, color, width) {
    let steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1);
    for (let i = 0; i <= steps; i++) {
      this.rect(
        layer,
        color,
        from.x + ((to.x - from.x) * i) / steps - width / 2,
        from.y + ((to.y - from.y) * i) / steps - width / 2,
        width,
        width
      );
    }
  },

  drawPickup: function () {
    this.ground.clear();
    this.ground.visible = !this.collected;
    if (!this.ground.visible) {
      return;
    }
    let x = this.pickup.worldX;
    let y = this.pickup.worldY;
    this.rect(this.ground, 0xffd379, x - 16, y - 2, 32, 2, 0.18 + Math.sin(this.elapsed * 4) * 0.07);
    for (let i = 0; i < 44; i++) {
      let angle = (i / 44) * Math.PI * 2;
      this.rect(this.ground, i % 3 ? 0xb98451 : 0xead0a0, x + Math.cos(angle) * 10, y - 7 + Math.sin(angle) * 4, 2, 2);
    }
    this.rect(this.ground, 0x3b2117, x - 3, y - 13, 4, 10);
    this.rect(this.ground, 0xe3bd79, x - 2, y - 12, 2, 8);
    this.rect(this.ground, 0x8f4c26, x - 2, y - 9, 2, 1);
    this.rect(this.ground, 0x8f4c26, x - 2, y - 6, 2, 1);
  },

  collect: function () {
    this.collected = true;
    this.ground.visible = false;
    this.ground.clear();
  },

  crack: function () {
    this.flashTime = 0.09;
  },

  landing: function (position) {
    for (let i = 0; i < 6; i++) {
      this.puffs.push({ x: position.x, y: position.y - 2, vx: (i - 2.5) * 10, age: 0, life: 0.28 });
    }
  },

  cropBody: function () {
    if (!this.croppedKid) {
      this.savedCrop = this.kid.cropRect
        ? new Phaser.Rectangle(
            this.kid.cropRect.x,
            this.kid.cropRect.y,
            this.kid.cropRect.width,
            this.kid.cropRect.height
          )
        : null;
      this.croppedKid = true;
    }
    this.kid.crop(this.bodyCrop);
    if (this.kid.shadowOverlay && this.kid.shadowOverlay.visible) {
      if (this.croppedShadow !== this.kid.shadowOverlay) {
        this.croppedShadow = this.kid.shadowOverlay;
        let crop = this.croppedShadow.cropRect;
        this.savedShadowCrop = crop ? new Phaser.Rectangle(crop.x, crop.y, crop.width, crop.height) : null;
      }
      this.croppedShadow.crop(this.bodyCrop);
    }
  },

  restoreBody: function () {
    if (this.croppedKid && this.kid.cropRect === this.bodyCrop) {
      this.kid.crop(this.savedCrop);
    }
    if (this.croppedShadow && this.croppedShadow.cropRect === this.bodyCrop) {
      this.croppedShadow.crop(this.savedShadowCrop);
    }
    this.croppedKid = false;
    this.croppedShadow = null;
    this.savedShadowCrop = null;
    this.savedCrop = null;
  },

  hide: function () {
    this.pose.clear();
    this.cord.clear();
    this.pose.visible = this.cord.visible = this.head.visible = false;
    this.restoreBody();
  },

  update: function (delta, state) {
    if (this.destroyed) {
      return;
    }
    this.elapsed += delta;
    this.flashTime = Math.max(0, this.flashTime - delta);
    this.drawPickup();
    this.flash.clear();
    this.puffs = this.puffs.filter((puff) => {
      puff.age += delta;
      puff.x += puff.vx * delta;
      puff.y -= 10 * delta;
      this.rect(this.flash, 0xbc9473, puff.x, puff.y, 3, 2, Math.max(0, 1 - puff.age / puff.life));
      return puff.age < puff.life;
    });
    let kid = this.kid;
    if (
      state.actionStage === "hidden" ||
      !kid.alive ||
      !kid.visible ||
      !kid.specialAction ||
      kid.specialAction.owner !== state
    ) {
      this.hide();
      return;
    }
    this.cropBody();
    this.pose.clear();
    this.cord.clear();
    this.pose.visible = this.cord.visible = this.head.visible = true;
    let direction = kid.charFace;
    let x = kid.baseX + PrinceJS.Utils.convertX(kid.charX);
    let floorY = kid.baseY + kid.charY;
    let progress = state.actionStage === "cracking" ? Math.min(1, state.elapsed / PrinceJS.Whip.CRACK_DURATION) : 0;
    let snap = Math.max(0, 1 - Math.abs(progress - 0.42) * 4);
    let twist = state.actionStage === "cracking" ? Math.round(Math.sin(progress * Math.PI * 2) * 2) : 0;
    this.pose.x = Math.round(x);
    this.pose.y = Math.round(floorY);
    this.pose.scale.x = direction;
    PrinceJS.PrincePose.drawTorso(this.pose, -33, -16, -6, twist);
    this.head.x = Math.round(x + twist * direction);
    this.head.y = floorY - 41 + PrinceJS.PrincePose.HEAD_HEIGHT;
    this.head.scale.x = -direction;
    let drawing = state.actionStage === "drawing";
    let holstering = state.actionStage === "holstering";
    let armProgress = drawing ? state.elapsed / PrinceJS.Whip.DRAW_DURATION : holstering ? 1 - state.elapsed / 0.2 : 1;
    armProgress = Math.max(0, Math.min(1, armProgress));
    let gripX = -6 + armProgress * (snap * 20 + Math.sin(progress * Math.PI * 2) * 8);
    let gripY = -20 - armProgress * (11 + Math.sin(progress * Math.PI * 2) * 14);
    let arm = PrinceJS.PrincePose.arm({ x: -7 + twist, y: -30 }, { x: gripX, y: gripY }, 1);
    PrinceJS.PrincePose.drawArm(this.pose, arm);
    PrinceJS.PrincePose.drawArm(this.pose, PrinceJS.PrincePose.arm({ x: -9 + twist, y: -29 }, { x: -7, y: -20 }, 1));
    gripX = arm.hand.x;
    gripY = arm.hand.y;
    let hand = { x: x + gripX * direction, y: floorY + gripY };
    let handle = { x: hand.x + direction * 2, y: hand.y - 7 };
    this.limb(this.cord, hand, handle, 0x3b2117, 3);
    this.limb(this.cord, hand, handle, 0xd8ad66, 1);
    let path = [handle];
    if (this.tether && this.tether.enemy.whipState) {
      let stateOwner = this.tether.enemy.whipState.owner;
      let ankle = stateOwner.position(this.tether.enemy);
      path.push(...this.tether.route, { x: ankle.x, y: ankle.y - 7 });
      for (let i = 0; i < 12; i++) {
        let angle = (i / 12) * Math.PI * 2;
        this.rect(this.cord, 0xd8ad66, ankle.x + Math.cos(angle) * 4, ankle.y - 7 + Math.sin(angle) * 2, 1, 1);
      }
    } else {
      let length = 14 + snap * 67;
      let target =
        this.target && snap > 0.35 ? this.target : { x: hand.x + direction * length, y: hand.y + (1 - snap) * 18 };
      let bend = (1 - snap) * 32;
      for (let i = 1; i <= 12; i++) {
        let t = i / 12;
        path.push({
          x: handle.x + (target.x - handle.x) * t,
          y: handle.y + (target.y - handle.y) * t + Math.sin(t * Math.PI * 2 - progress * 8) * bend * t
        });
      }
    }
    for (let i = 1; i < path.length; i++) {
      this.limb(this.cord, path[i - 1], path[i], 0x5b3320, 2);
      this.limb(this.cord, path[i - 1], path[i], i % 2 ? 0xddb780 : 0xb98451, 1);
    }
    if (this.flashTime > 0 && path.length) {
      let tip = path[path.length - 1];
      this.rect(this.flash, 0xffefbd, tip.x - 3, tip.y, 7, 1, this.flashTime / 0.09);
      this.rect(this.flash, 0xffefbd, tip.x, tip.y - 3, 1, 7, this.flashTime / 0.09);
    }
  },

  destroy: function () {
    this.hide();
    this.destroyed = true;
    for (let visual of [this.ground, this.pose, this.cord, this.flash, this.head]) {
      visual.destroy();
    }
    this.puffs.length = 0;
  }
};
