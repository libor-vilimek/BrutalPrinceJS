"use strict";

PrinceJS.KickEffects = function (game, kid) {
  this.game = game;
  this.kid = kid;
  // A permanent sorted parent keeps airborne guards behind foreground masonry.
  this.bodies = game.add.graphics(0, 0);
  this.bodies.z = 21;
  this.pose = game.add.graphics(0, 0);
  this.head = game.add.sprite(0, 0, "kid", "kid-15");
  this.head.anchor.setTo(0, 1);
  this.head.crop(new Phaser.Rectangle(0, 0, 12, PrinceJS.PrincePose.HEAD_HEIGHT));
  this.bodyCrop = new Phaser.Rectangle(0, 0, 0, 0);
  this.flourish = game.add.graphics(0, 0);
  this.particles = [];
  this.pose.z = 24;
  this.head.z = 25;
  this.flourish.z = 26;
  this.hide();
};

PrinceJS.KickEffects.prototype = {
  rect: PrinceJS.WhipEffects.prototype.rect,
  limb: PrinceJS.WhipEffects.prototype.limb,
  cropBody: PrinceJS.WhipEffects.prototype.cropBody,
  restoreBody: PrinceJS.WhipEffects.prototype.restoreBody,

  hide: function () {
    this.pose.clear();
    this.pose.visible = this.head.visible = false;
    this.restoreBody();
  },

  launch: function (enemy, state) {
    state.sprite = this.game.make.sprite(0, 0, enemy.charName, enemy.charName + "-31");
    state.sprite.anchor.setTo(0.5, 0.5);
    state.sprite.scale.x = -enemy.charFace;
    this.bodies.addChild(state.sprite);
    this.fly(enemy, state);
  },

  fly: function (enemy, state) {
    state.sprite.x = Math.round(state.x);
    state.sprite.y = Math.round(state.y);
    state.sprite.rotation = state.rotation;
    state.sprite.visible = enemy.visible;
  },

  release: function (enemy, state) {
    if (state.sprite) {
      state.sprite.destroy();
      state.sprite = null;
    }
  },

  impact: function (x, y, direction) {
    for (let i = 0; i < 9; i++) {
      let angle = (i * Math.PI * 2) / 9;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * 95 + direction * 25,
        vy: Math.sin(angle) * 75,
        age: 0,
        life: 0.16,
        color: i % 2 ? 0xffd681 : 0xffffdd,
        size: 2
      });
    }
  },

  dust: function (x, y) {
    for (let i = 0; i < 7; i++) {
      this.particles.push({
        x,
        y,
        vx: (i - 3) * 16,
        vy: -12 - (i % 3) * 7,
        age: 0,
        life: 0.32,
        color: 0xb9a189,
        size: 2
      });
    }
  },

  decorations: function (dt, state) {
    this.flourish.clear();
    this.particles = this.particles.filter((p) => {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.rect(this.flourish, p.color, p.x, p.y, p.size, p.size, Math.max(0, 1 - p.age / p.life));
      return p.age < p.life;
    });
    for (let enemy of state.enemies || []) {
      let fallen = enemy.kickState;
      if (!fallen || fallen.phase !== "recovering" || fallen.elapsed > fallen.recovery - 0.6 || !enemy.visible) {
        continue;
      }
      // Three tiny orbiting stars: still alive, just reconsidering his career.
      for (let i = 0; i < 3; i++) {
        let angle = fallen.elapsed * 5 + (i * Math.PI * 2) / 3;
        let x = fallen.position.x + Math.cos(angle) * 10;
        let y = fallen.position.y - 13 + Math.sin(angle) * 3;
        this.rect(this.flourish, 0xf6d86d, x - 2, y, 5, 1, 0.9);
        this.rect(this.flourish, 0xffffc3, x, y - 2, 1, 5, 0.9);
      }
    }
  },

  leg: function (hip, knee, ankle, footDirection, shade) {
    let colors = PrinceJS.PrincePose.colors;
    for (let pair of [
      [hip, knee],
      [knee, ankle]
    ]) {
      this.limb(this.pose, pair[0], pair[1], colors.clothShade, 5);
      this.limb(this.pose, pair[0], pair[1], shade ? colors.clothShade : colors.cloth, 3);
    }
    this.rect(
      this.pose,
      shade ? colors.skinShade : colors.skin,
      ankle.x - (footDirection < 0 ? 4 : 1),
      ankle.y - 1,
      5,
      3
    );
  },

  update: function (delta, state) {
    this.decorations(delta, state);
    let kid = this.kid;
    if (state.actionStage !== "kicking" || !kid.alive || !kid.visible) {
      this.hide();
      return;
    }
    this.cropBody();
    this.pose.clear();
    this.pose.visible = this.head.visible = true;
    // Retiming the whole pose keeps the foot aligned with both contact windows.
    let time = Math.min(PrinceJS.Kick.DURATION, state.elapsed) * PrinceJS.Kick.ANIMATION_SPEED;
    let remaining = Math.max(0, PrinceJS.Kick.DURATION - state.elapsed) * PrinceJS.Kick.ANIMATION_SPEED;
    let spin = Math.max(0, Math.min(1, (time - 0.08) / 0.7));
    let angle = spin * Math.PI * 2 - Math.PI * 0.4;
    let turn = Math.cos(angle);
    let depth = Math.sin(angle);
    let extension = Math.min(1, time / 0.14) * Math.min(1, remaining / 0.19);
    extension = Math.max(0, extension);
    let hip = { x: -7, y: -18 };
    let foot = { x: hip.x + turn * 22 * extension, y: -2 - extension * (24 + depth * 3) };
    let knee = { x: hip.x + turn * 10 * extension, y: -10 - extension * 13 };
    let x = kid.baseX + PrinceJS.Utils.convertX(kid.charX);
    let y = kid.baseY + kid.charY;
    this.pose.x = Math.round(x);
    this.pose.y = Math.round(y);
    this.pose.scale.x = kid.charFace;
    let facing = turn >= 0 ? 1 : -1;
    // Rear leg/arm pass behind the torso before the front-facing arc.
    if (depth < 0) {
      this.leg(hip, knee, foot, facing, true);
    }
    PrinceJS.PrincePose.drawArm(
      this.pose,
      PrinceJS.PrincePose.arm({ x: -9, y: -30 }, { x: -9 - facing * 11, y: -24 + depth * 4 }, facing)
    );
    // One grounded pivot leg is always visible. The second leg sweeps around it.
    this.leg(hip, { x: -8 - turn * 2, y: -9 }, { x: -7, y: -1 }, facing, false);
    PrinceJS.PrincePose.drawTorso(this.pose, -33, -17, -6, -turn * extension * 2, turn);
    if (depth >= 0) {
      this.leg(hip, knee, foot, facing, false);
    }
    PrinceJS.PrincePose.drawArm(
      this.pose,
      PrinceJS.PrincePose.arm({ x: -6, y: -30 }, { x: -7 + facing * 9, y: -27 - depth * 3 }, -facing)
    );
    this.head.x = Math.round(x + (facing > 0 ? -2 : -12) * kid.charFace);
    this.head.y = Math.round(y - 41 + PrinceJS.PrincePose.HEAD_HEIGHT);
    this.head.scale.x = -kid.charFace * facing;
    // Elliptical heel trails describe the rotation without stretching the leg.
    if (extension > 0.5) {
      for (let i = 1; i <= 12; i++) {
        let a = angle - i * 0.065;
        this.rect(this.pose, 0xf6e8c4, hip.x + Math.cos(a) * 25, -25 - Math.sin(a) * 5, 2, 1, 0.35 * (1 - i / 13));
      }
    }
  },

  destroy: function () {
    this.hide();
    this.bodies.destroy(true);
    this.pose.destroy();
    this.head.destroy();
    this.flourish.destroy();
    this.particles.length = 0;
  }
};
