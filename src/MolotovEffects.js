"use strict";

PrinceJS.MolotovEffects = function (game, kid, pickup) {
  this.game = game;
  this.kid = kid;
  this.pickup = pickup;
  this.elapsed = 0;
  this.collected = !!pickup.collected;
  this.poseActive = false;
  this.bodyCrop = new Phaser.Rectangle(0, 25, 12, 16);
  this.croppedKid = false;
  this.particles = [];
  this.ground = game.add.graphics(0, 0);
  this.light = game.add.graphics(0, 0);
  this.pose = game.add.graphics(0, 0);
  this.head = game.add.sprite(0, 0, "kid", "kid-15");
  this.head.anchor.setTo(0, 1);
  this.head.crop(new Phaser.Rectangle(0, 0, 12, 7));
  this.head.visible = false;
  this.head.z = 25;
  this.bottles = game.add.graphics(0, 0);
  this.fire = game.add.graphics(0, 0);
  this.debris = game.add.graphics(0, 0);
  [this.ground, this.light, this.pose, this.bottles, this.fire, this.debris].forEach((graphics, i) => {
    graphics.z = 22 + i;
  });
  this.update(0, null, [], []);
};

PrinceJS.MolotovEffects.prototype = {
  rect: function (graphics, color, x, y, width, height, alpha) {
    graphics.beginFill(color, alpha === undefined ? 1 : alpha);
    graphics.drawRect(Math.round(x), Math.round(y), width, height);
    graphics.endFill();
  },

  limb: function (graphics, from, to, color, width) {
    let steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]), 1);
    for (let i = 0; i <= steps; i++) {
      this.rect(
        graphics,
        color,
        from[0] + ((to[0] - from[0]) * i) / steps - width / 2,
        from[1] + ((to[1] - from[1]) * i) / steps - width / 2,
        width,
        width
      );
    }
  },

  flame: function (graphics, x, y, size, phase, alpha) {
    let height = Math.round(size + Math.sin(phase) * size * 0.25);
    this.rect(graphics, 0xd54e1c, x - 3, y - height + 2, 6, height, alpha);
    this.rect(graphics, 0xffa52b, x - 2, y - height, 4, height, alpha);
    this.rect(graphics, 0xffdc68, x - 1, y - height + 3, 2, Math.max(2, height - 3), alpha);
    this.rect(graphics, 0xfff8c0, x, y - 3, 1, 3, alpha);
    this.rect(graphics, 0xffcc50, x + Math.round(Math.sin(phase * 1.7)), y - height - 2, 1, 2, alpha);
  },

  drawBottle: function (graphics, x, y, lit, phase) {
    this.rect(graphics, 0x153a32, x - 3, y - 2, 7, 9);
    this.rect(graphics, 0x397650, x - 2, y - 2, 5, 8);
    this.rect(graphics, 0x7cad72, x - 2, y - 1, 1, 5);
    this.rect(graphics, 0xd7cba0, x - 2, y + 2, 5, 3);
    this.rect(graphics, 0xa98052, x - 1, y + 2, 3, 1);
    this.rect(graphics, 0x234e36, x - 1, y - 6, 3, 4);
    this.rect(graphics, 0xb9be93, x, y - 6, 1, 2);
    this.rect(graphics, 0xe4d8b1, x, y - 9, 2, 3);
    this.rect(graphics, 0x9b6542, x + 1, y - 10, 2, 2);
    if (lit) {
      this.flame(graphics, x + 2, y - 10, 5, phase, 1);
    }
  },

  collect: function () {
    this.collected = true;
    for (let i = 0; i < 14; i++) {
      this.emit(
        this.pickup.worldX,
        this.pickup.worldY - 5,
        (Math.random() - 0.5) * 65,
        -15 - Math.random() * 45,
        0.6,
        0xffd966
      );
    }
  },

  beginThrow: function (state) {
    if (this.poseActive) {
      return;
    }
    let kid = this.kid;
    let bounds = kid.getCharBounds();
    this.anchor = {
      x: kid.baseX + PrinceJS.Utils.convertX(kid.charX) + kid.charFace * 2,
      y: kid.baseY + bounds.y,
      floorY: kid.baseY + kid.charY,
      hanging: state.hanging,
      crouched: state.crouched,
      direction: kid.charFace
    };
    this.savedAlpha = kid.alpha;
    // Hanging needs a full pose; on the floor the original planted legs stay visible.
    if (state.hanging) {
      kid.alpha = 0;
    } else {
      this.cropBody(state.crouched);
    }
    this.poseActive = true;
  },

  finishThrow: function () {
    if (this.poseActive) {
      this.kid.alpha = this.savedAlpha === undefined ? 1 : this.savedAlpha;
      this.poseActive = false;
    }
    this.pose.clear();
    this.pose.visible = false;
    this.head.visible = false;
    this.restoreBody();
  },

  cropBody: function (crouched) {
    let copy = (crop) => (crop ? new Phaser.Rectangle(crop.x, crop.y, crop.width, crop.height) : null);
    if (!this.croppedKid) {
      this.savedCrop = copy(this.kid.cropRect);
      this.croppedKid = true;
    }
    this.bodyCrop.y = crouched ? 14 : 25;
    this.bodyCrop.width = crouched ? 20 : 12;
    this.bodyCrop.height = crouched ? 5 : 16;
    this.kid.crop(this.bodyCrop);
    if (this.kid.shadowOverlay && this.kid.shadowOverlay.visible) {
      if (this.croppedShadow !== this.kid.shadowOverlay) {
        this.croppedShadow = this.kid.shadowOverlay;
        this.savedShadowCrop = copy(this.croppedShadow.cropRect);
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

  getDropPoint: function () {
    return { x: this.anchor.x - 8 * this.anchor.direction, y: this.anchor.y + 45 };
  },

  getThrowPoint: function (state) {
    if (state.hanging) {
      return this.getDropPoint();
    }
    return { x: this.anchor.x + 12 * this.anchor.direction, y: this.anchor.floorY - (state.crouched ? 22 : 33) };
  },

  handAt: function (time, points) {
    for (let i = 1; i < points.length; i++) {
      if (time <= points[i][0]) {
        let from = points[i - 1];
        let to = points[i];
        let progress = Math.max(0, (time - from[0]) / (to[0] - from[0]));
        let ease = progress * progress * (3 - 2 * progress);
        return [from[1] + (to[1] - from[1]) * ease, from[2] + (to[2] - from[2]) * ease];
      }
    }
    let last = points[points.length - 1];
    return [last[1], last[2]];
  },

  drawCharge: function (state, x, y) {
    if (state.phase !== "charging") {
      return;
    }
    let progress = Math.min(1, state.charge / PrinceJS.Molotov.MAX_CHARGE);
    this.rect(this.pose, 0x17161c, x - 11, y - 1, 24, 5, 0.85);
    this.rect(this.pose, 0x655346, x - 10, y, 22, 3);
    this.rect(this.pose, progress === 1 ? 0xffdf70 : 0xd59c42, x - 10, y, Math.max(1, Math.round(22 * progress)), 3);
    let angle = ((state.aimUp ? 70 : 30) * Math.PI) / 180;
    let tip = [x + 10 * Math.cos(angle), y - 7 - 10 * Math.sin(angle)];
    this.limb(this.pose, [x, y - 7], tip, 0xffdc85, 1);
    this.rect(this.pose, 0xffe7a4, tip[0] - 1, tip[1] - 1, 2, 2);
  },

  drawPose: function (state) {
    let graphics = this.pose;
    graphics.clear();
    graphics.visible = this.head.visible = !!state && this.poseActive;
    if (!graphics.visible) {
      return;
    }
    if (!state.hanging) {
      this.drawGroundPose(state);
      return;
    }
    graphics.x = Math.round(this.anchor.x);
    graphics.y = Math.round(this.anchor.y);
    graphics.scale.x = this.anchor.direction;
    let time = state.time;
    let sway = Math.round(Math.sin(time * 9) * 1.2);
    let charging = state.phase === "charging";
    let hand = this.handAt(
      time,
      charging
        ? [
            [0, -13, 32],
            [0.18, -15, 28],
            [10, -15, 28]
          ]
        : [
            [0, -13, 32],
            [0.06, -14, 32],
            [0.12, -2, 16],
            [0.2, -14, 32],
            [0.28, -2, 26],
            [0.32, -9, 33],
            [0.42, -8, 45],
            [0.6, -1, 1]
          ]
    );
    let shoulder = [-7 + sway, 20];
    let elbow = [-17 + sway, Math.min(30, Math.max(14, hand[1] - 3))];

    // One hand stays anchored to the ledge from start to finish. The legs counterbalance the free arm.
    this.limb(graphics, [-4 + sway, 18], [-3, 7], 0xc8c5a4, 5);
    this.limb(graphics, [-3, 7], [0, 0], 0xf6efc5, 3);
    this.rect(graphics, 0xd19a62, -2, -1, 5, 3);
    this.rect(graphics, 0xffcb91, -1, -2, 4, 2);
    this.rect(graphics, 0xb1a77d, -13 + sway, 19, 10, 18);
    this.rect(graphics, 0xefefc6, -12 + sway, 19, 8, 17);
    this.rect(graphics, 0xffffdb, -10 + sway, 21, 5, 11);
    this.rect(graphics, 0xa78258, -12 + sway, 33, 9, 3);
    this.rect(graphics, 0xeee9bd, -12 + sway, 34, 9, 8);
    this.limb(graphics, [-10 + sway, 40], [-11 - sway, 49], 0xc8c6a4, 5);
    this.limb(graphics, [-11 - sway, 49], [-10 - sway, 55], 0xf4efc7, 4);
    this.limb(graphics, [-5 + sway, 40], [-4 + sway, 48], 0xf7f0c8, 5);
    this.limb(graphics, [-4 + sway, 48], [-1 + sway, 53], 0xc8c6a4, 4);
    this.rect(graphics, 0xe9b377, -11 - sway, 54, 5, 2);
    this.rect(graphics, 0xffc990, -3 + sway, 52, 6, 2);

    // Keep the original Prince's small head and ochre hair while he leans toward the flame.
    this.head.x = graphics.x + (sway - 2) * this.anchor.direction;
    this.head.y = graphics.y + 17;
    this.head.scale.x = -this.anchor.direction;
    this.head.tint = !charging && time >= 0.12 && time < 0.45 ? 0xffffcc : 0xffffff;
    this.rect(graphics, 0xdd8866, -8 + sway, 17, 3, 3);

    this.limb(graphics, shoulder, elbow, 0xbebc9d, 5);
    this.limb(graphics, shoulder, elbow, 0xefedc3, 3);
    this.limb(graphics, elbow, hand, 0xf5edc6, 3);
    this.rect(graphics, 0xc98b58, hand[0] - 1, hand[1] - 1, 4, 4);
    this.rect(graphics, 0xffce95, hand[0], hand[1] - 1, 3, 3);

    // Pull the lighter from the belt, then keep it in the mouth while the free hand takes the bottle.
    if (!charging && time >= 0.04 && time < 0.12) {
      this.rect(graphics, 0x626970, hand[0], hand[1] - 5, 3, 5);
      this.rect(graphics, 0xd6d3b7, hand[0], hand[1] - 5, 3, 1);
    }
    if (!charging && time >= 0.12 && time < 0.45) {
      this.rect(graphics, 0x626970, -3 + sway, 16, 5, 2);
      this.rect(graphics, 0xd6d3b7, 1 + sway, 16, 1, 1);
      if (state.lighterLit) {
        this.flame(graphics, 2 + sway, 16, 5, this.elapsed * 29, 1);
      }
    }
    if (charging || (time >= 0.2 && time < PrinceJS.Molotov.RELEASE_TIME)) {
      this.drawBottle(graphics, hand[0] + 2, hand[1] + 1, !charging && time >= 0.28, this.elapsed * 28);
    }
    if (!charging && time >= 0.12 && time < 0.45) {
      this.rect(graphics, 0xffc84c, -10 + sway, 13, 7, 7, 0.18 + Math.sin(this.elapsed * 37) * 0.05);
    }
    this.drawCharge(state, -8, -13);
  },

  drawGroundPose: function (state) {
    let graphics = this.pose;
    this.cropBody(state.crouched);
    graphics.x = Math.round(this.anchor.x - 2 * this.anchor.direction);
    graphics.y = Math.round(this.anchor.floorY);
    graphics.scale.x = this.anchor.direction;
    let charging = state.phase === "charging";
    let time = state.time;
    let headY = state.crouched ? -19 : -41;
    let shoulderY = state.crouched ? -12 : -31;
    let waistY = state.crouched ? -5 : -19;
    let lift = state.crouched ? 11 : 0;
    let bottleHand = this.handAt(
      time,
      charging
        ? [
            [0, -13, -18],
            [0.18, 4, -23],
            [10, 4, -23]
          ]
        : [
            [0, 4, -23],
            [0.24, 5, -23],
            [0.34, -14, -31],
            [0.42, 14, -33],
            [0.6, 0, -19]
          ]
    );
    let lighterHand = this.handAt(
      time,
      charging
        ? [
            [0, -3, -19],
            [10, -3, -19]
          ]
        : [
            [0, -13, -19],
            [0.1, 10, -29],
            [0.24, 10, -29],
            [0.36, -3, -19],
            [0.6, -3, -19]
          ]
    );
    bottleHand[1] += lift;
    lighterHand[1] += lift;
    this.rect(graphics, 0xddbbaa, -11, shoulderY, 9, waistY - shoulderY + 1);
    this.rect(graphics, 0xffffdd, -9, shoulderY, 8, waistY - shoulderY);
    this.rect(graphics, 0xddbbaa, -10, waistY, 9, 2);
    this.rect(graphics, 0xbb7766, -7, headY + 7, 3, 3);
    this.rect(graphics, 0xdd8866, -6, headY + 7, 2, 3);
    this.head.x = graphics.x;
    this.head.y = graphics.y + headY + 7;
    this.head.scale.x = -this.anchor.direction;
    this.head.tint = !charging && state.lighterLit && time < 0.35 ? 0xffffcc : 0xffffff;
    for (let arm of [
      { shoulder: [-8, shoulderY + 2], elbow: [-11, waistY - 2], hand: lighterHand },
      { shoulder: [-3, shoulderY + 3], elbow: [2, waistY], hand: bottleHand }
    ]) {
      this.limb(graphics, arm.shoulder, arm.elbow, 0xddbbaa, 4);
      this.limb(graphics, arm.elbow, arm.hand, 0xffffdd, 3);
      this.rect(graphics, 0xbb7766, arm.hand[0] - 1, arm.hand[1] - 1, 4, 4);
      this.rect(graphics, 0xdd8866, arm.hand[0] - 1, arm.hand[1] - 1, 3, 3);
    }
    if (charging || time < PrinceJS.Molotov.RELEASE_TIME) {
      this.drawBottle(graphics, bottleHand[0] + 1, bottleHand[1] + 1, !charging && time >= 0.24, this.elapsed * 28);
    }
    if (!charging && time < 0.32) {
      this.rect(graphics, 0x3c4650, lighterHand[0], lighterHand[1] - 5, 3, 5);
      this.rect(graphics, 0xadb4b0, lighterHand[0], lighterHand[1] - 5, 3, 1);
      if (state.lighterLit) {
        this.flame(graphics, lighterHand[0] + 1, lighterHand[1] - 5, 5, this.elapsed * 31, 1);
        this.rect(graphics, 0xffc84c, -8, headY + 5, 7, 7, 0.2);
      }
    }
    this.drawCharge(state, -5, headY - 8);
  },

  emit: function (x, y, vx, vy, life, color, smoke) {
    if (this.particles.length < 180) {
      this.particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, color: color, smoke: !!smoke });
    }
  },

  shatter: function (x, y, burning) {
    for (let i = 0; i < 20; i++) {
      this.emit(
        x,
        y,
        (Math.random() - 0.5) * 135,
        -20 - Math.random() * 110,
        0.25 + Math.random() * 0.45,
        i % 4 === 0 ? 0xa0c794 : burning ? (i % 2 ? 0xffa735 : 0xffe778) : 0x569466
      );
    }
  },

  singe: function (x, y) {
    for (let i = 0; i < 3; i++) {
      this.emit(x, y, (Math.random() - 0.5) * 25, -20 - Math.random() * 40, 0.3, 0xffc848);
    }
  },

  firePointVisible: function (fire, x) {
    let level = this.kid.level;
    if (!level) {
      return true;
    }
    let point = { room: fire.room, x: fire.x, y: fire.y - 12 };
    let steps = Math.max(1, Math.ceil(Math.abs(x - fire.x) / 2));
    for (let i = 0; i <= steps; i++) {
      point.x = fire.x + ((x - fire.x) * i) / steps;
      let room = level.rooms[point.room];
      if (!room) {
        return false;
      }
      if (point.x < room.x * PrinceJS.ROOM_WIDTH || point.x >= (room.x + 1) * PrinceJS.ROOM_WIDTH) {
        point.room = point.x < room.x * PrinceJS.ROOM_WIDTH ? room.links.left : room.links.right;
        room = level.rooms[point.room];
      }
      if (!room || Math.floor(point.y / PrinceJS.ROOM_HEIGHT) !== room.y) {
        return false;
      }
      let column = Math.floor((point.x - room.x * PrinceJS.ROOM_WIDTH) / PrinceJS.BLOCK_WIDTH);
      let tile = level.getTileAt(column, fire.row, point.room);
      if (
        !tile ||
        !tile.isWalkable() ||
        PrinceJS.RangedWeapon.prototype.obstacleAt.call({ level: level }, point, room)
      ) {
        return false;
      }
    }
    return true;
  },

  drawFires: function (fires, delta) {
    this.fire.clear();
    this.light.clear();
    for (let fire of fires) {
      let fade = Math.min(1, fire.age / 0.12, fire.life / 0.65);
      if (fire.kind === "wall") {
        this.drawWallFire(fire, fade, delta);
        continue;
      }
      let width = fire.radius * Math.min(1, 0.45 + fire.age * 3);
      for (let i = -4; i <= 4; i++) {
        let x = fire.x + (i / 4) * width;
        if (!this.firePointVisible(fire, x)) {
          continue;
        }
        this.rect(this.fire, 0x482519, x - 3, fire.y - 1, 6, 2, fade * 0.65);
        let height = 9 + (4 - Math.abs(i)) * 2;
        this.flame(this.fire, Math.round(x), fire.y - 1, height, this.elapsed * 15 + i * 2.1, fade);
      }
      this.light.beginFill(0xffb628, 0.1 * fade);
      this.light.drawCircle(fire.x, fire.y - 8, 62);
      this.light.endFill();
      if (Math.random() < delta * 14) {
        this.emit(
          fire.x + (Math.random() - 0.5) * width,
          fire.y - 19,
          (Math.random() - 0.5) * 8,
          -16,
          0.7,
          0x76614d,
          true
        );
      }
    }
  },

  drawWallFire: function (fire, fade, delta) {
    let top = Math.max(fire.top, fire.y - 13);
    let bottom = Math.min(fire.bottom - 1, fire.y + 21);
    let normal = fire.normalX;
    let smearX = fire.x + (normal < 0 ? -1 : -2);
    this.rect(this.fire, 0x351c15, smearX, top, 3, Math.max(1, bottom - top), fade * 0.7);
    this.rect(this.fire, 0xa13e18, fire.x + normal - 1, fire.y - 4, 3, Math.min(16, bottom - fire.y + 4), fade * 0.65);
    for (let i = 0; i < 5; i++) {
      let y = Math.min(bottom, top + 7 + i * 6);
      this.flame(this.fire, fire.x + normal * (2 + (i % 2)), y, 5 + (i % 3) * 2, this.elapsed * 18 + i * 1.7, fade);
    }
    this.light.beginFill(0xffb628, 0.09 * fade);
    this.light.drawCircle(fire.x + normal * 5, fire.y, 48);
    this.light.endFill();
    if (Math.random() < delta * 10) {
      this.emit(fire.x + normal * 5, fire.y - 13, normal * 3, -15, 0.6, 0x76614d, true);
    }
  },

  update: function (delta, state, bottles, fires, oils = []) {
    if (this.destroyed) {
      return;
    }
    this.elapsed += delta;
    this.ground.clear();
    this.ground.visible = !this.collected;
    if (!this.collected) {
      this.rect(this.ground, 0x000000, this.pickup.worldX - 7, this.pickup.worldY, 15, 2, 0.5);
      this.drawBottle(this.ground, this.pickup.worldX, this.pickup.worldY - 7, false, 0);
      let pulse = 0.6 + Math.sin(this.elapsed * 4) * 0.25;
      this.rect(this.ground, 0xffd257, this.pickup.worldX + 7, this.pickup.worldY - 17, 1, 5, pulse);
      this.rect(this.ground, 0xffd257, this.pickup.worldX + 5, this.pickup.worldY - 15, 5, 1, pulse);
    }
    this.drawPose(state);
    this.bottles.clear();
    for (let bottle of bottles) {
      this.drawBottle(this.bottles, bottle.x, bottle.y, true, this.elapsed * 26 + bottle.age);
    }
    for (let oil of oils) {
      this.rect(this.bottles, 0xd54e1c, oil.x - 1, oil.y - 7, 2, 8, 0.85);
      this.flame(this.bottles, oil.x, oil.y, 4, this.elapsed * 23 + oil.age, 1);
      this.rect(this.bottles, 0xffed9c, oil.x, oil.y, 1, 2);
    }
    this.drawFires(fires, delta);
    this.debris.clear();
    this.particles = this.particles.filter((particle) => {
      particle.life -= delta;
      if (particle.life <= 0) {
        return false;
      }
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      if (!particle.smoke) {
        particle.vy += delta * 170;
      }
      let size = particle.smoke ? 3 : 1;
      this.rect(
        this.debris,
        particle.color,
        particle.x,
        particle.y,
        size,
        size,
        Math.min(1, particle.life * 3) * (particle.smoke ? 0.3 : 1)
      );
      return true;
    });
  },

  destroy: function () {
    if (this.destroyed) {
      return;
    }
    this.finishThrow();
    this.destroyed = true;
    this.particles.length = 0;
    [this.ground, this.light, this.pose, this.head, this.bottles, this.fire, this.debris].forEach((graphics) =>
      graphics.destroy()
    );
  }
};

PrinceJS.MolotovEffects.prototype.constructor = PrinceJS.MolotovEffects;
