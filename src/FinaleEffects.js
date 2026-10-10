"use strict";

PrinceJS.FinaleEffects = function (game, scene) {
  this.game = game;
  this.elapsed = 0;
  this.particles = [];
  this.flashes = [0, 0, 0];
  this.guns = [];
  this.layers = [];
  const layer = (z) => {
    const graphics = game.add.graphics(0, 0);
    graphics.z = z;
    this.layers.push(graphics);
    return graphics;
  };
  this.glass = layer(11);
  this.damage = layer(12);
  this.floor = layer(19);
  this.prince = layer(21);
  this.princess = layer(20);
  this.headLayer = layer(22);
  this.debris = layer(23);
  this.tracers = layer(24);
  this.princeHead = this.headSprite(this.prince, "kid", "kid-15", 0, 0, 12, 8);
  this.princeHead.scale.x = -1;
  this.faceBlood = game.make.graphics(0, 0);
  this.prince.addChild(this.faceBlood);
  this.rect(this.faceBlood, 0xa21e30, 2, -5, 2, 1);
  this.rect(this.faceBlood, 0x8b1528, 3, -4, 1, 2);
  this.princessHead = this.headSprite(this.princess, "princess", "princess-11", 2, 0, 12, 12);
  this.jaffar = this.headSprite(this.headLayer, "jaffar", "jaffar-1", 12, 0, 14, 8);
  this.jaffar.y = 3;
  this.rect(this.headLayer, 0x830d22, -3, 3, 5, 2);
  this.rect(this.headLayer, 0xc42b34, -2, 4, 2, 2);
  this.princeGun = game.make.graphics(0, 0);
  this.prince.addChild(this.princeGun);
  this.princessGuns = [game.make.graphics(0, 0), game.make.graphics(0, 0)];
  this.princessGuns.forEach((gun) => this.princess.addChild(gun));
  this.audio = new PrinceJS.WeaponAudio(game);
  this.glassSound = game.add.audio("Mirror", 0.65);
  this.kickSound = game.add.audio("BumpIntoWallHard", 0.7);
  this.drawWindow(false);
};

PrinceJS.FinaleEffects.prototype = {
  rect: function (g, color, x, y, w, h, alpha = 1) {
    g.beginFill(color, alpha);
    g.drawRect(Math.round(x), Math.round(y), w, h);
    g.endFill();
  },

  limb: function (g, a, b, color, width) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
    for (let i = 0; i <= steps; i++) {
      this.rect(
        g,
        color,
        a.x + ((b.x - a.x) * i) / steps - width / 2,
        a.y + ((b.y - a.y) * i) / steps - width / 2,
        width,
        width
      );
    }
  },

  headSprite: function (parent, key, frame, x, y, w, h) {
    const sprite = this.game.make.sprite(0, 0, key, frame);
    sprite.crop(new Phaser.Rectangle(x, y, w, h));
    sprite.anchor.setTo(0.5, 1);
    parent.addChild(sprite);
    return sprite;
  },

  polygon: function (g, color, points, alpha = 1) {
    g.beginFill(color, alpha);
    g.drawPolygon(points);
    g.endFill();
  },

  drawWindow: function (broken) {
    const g = this.glass;
    g.clear();
    // Fit the original small arched window on the left wall; its stone frame stays intact.
    if (!broken) {
      for (let y = 90; y <= 137; y++) {
        const half = y < 99 ? Math.max(1, Math.floor(Math.sqrt(81 - (99 - y) ** 2))) : 8;
        this.rect(g, y % 4 ? 0x235365 : 0x2b6171, 21 - half, y, half * 2, 1, 0.85);
      }
      this.limb(g, { x: 16, y: 106 }, { x: 26, y: 98 }, 0x9bd3d8, 1);
      this.limb(g, { x: 15, y: 122 }, { x: 27, y: 112 }, 0x619fae, 1);
      this.limb(g, { x: 17, y: 129 }, { x: 25, y: 123 }, 0x619fae, 1);
    } else {
      this.polygon(g, 0x85becb, [14, 100, 17, 104, 14, 112]);
      this.polygon(g, 0x609da9, [28, 113, 24, 122, 28, 125]);
      this.polygon(g, 0xa7dce0, [13, 136, 17, 129, 19, 136]);
      this.polygon(g, 0x609da9, [24, 136, 27, 132, 28, 136]);
    }
  },

  leg: function (g, hip, knee, ankle, princess, rear) {
    const shade = princess ? 0xd030d0 : 0xddbbaa;
    const cloth = princess ? 0xfc38fc : 0xffffdd;
    for (const [a, b] of [
      [hip, knee],
      [knee, ankle]
    ]) {
      this.limb(g, a, b, shade, 5);
      this.limb(g, a, b, rear ? shade : cloth, 3);
    }
    this.rect(g, princess ? 0xfc9c80 : 0xdd8866, ankle.x - 1, ankle.y - 1, 5, 2);
  },

  arm: function (g, shoulder, hand, bend, princess) {
    const arm = PrinceJS.PrincePose.arm(shoulder, hand, bend);
    if (!princess) {
      PrinceJS.PrincePose.drawArm(g, arm);
      this.rect(g, 0x9c2031, arm.elbow.x - 1, arm.elbow.y, 2, 2);
    } else {
      for (const [a, b] of [
        [arm.shoulder, arm.elbow],
        [arm.elbow, arm.hand]
      ]) {
        this.limb(g, a, b, 0xdc8470, 3);
        this.limb(g, a, b, 0xfc9c80, 2);
      }
    }
  },

  localPoint: function (weapon, x, y) {
    return {
      x: weapon.x + x * Math.cos(weapon.angle) - y * Math.sin(weapon.angle),
      y: weapon.y + x * Math.sin(weapon.angle) + y * Math.cos(weapon.angle)
    };
  },

  weapon: function (graphic, position, actor, index, minigun) {
    graphic.clear();
    graphic.x = Math.round(position.x);
    graphic.y = Math.round(position.y);
    graphic.rotation = position.angle;
    if (minigun) {
      PrinceJS.MinigunEffects.prototype.drawWeapon.call(
        { rect: this.rect, spin: this.elapsed * (actor.firing ? 45 : 2), spinSpeed: actor.firing ? 30 : 0 },
        graphic
      );
    } else {
      this.drawRifle(graphic);
    }
    const flash = this.flashes[index] > 0;
    if (flash) {
      const muzzle = minigun ? 18 : 22;
      this.polygon(graphic, 0xf7a537, [muzzle, -3, muzzle + 5, -2, muzzle + 10, 0, muzzle + 4, 2, muzzle, 3]);
      this.rect(graphic, 0xffffd9, muzzle, -1, 6, 2);
    }
    const muzzle = this.localPoint(position, minigun ? 18 : 22, 0);
    // The Prince faces left; the Princess faces right. All firing angles point up.
    const direction = minigun ? -1 : 1;
    this.guns[index] = {
      x: actor.x + muzzle.x * direction,
      y: actor.y + muzzle.y,
      dx: Math.cos(position.angle) * direction,
      dy: Math.sin(position.angle),
      visible: graphic.visible
    };
  },

  drawRifle: function (g) {
    // AK silhouette: wooden stock/foregrip, long barrel and a curved magazine.
    this.polygon(g, 0x391e1b, [-12, -1, -5, -2, -3, 1, -11, 4, -13, 4]);
    this.polygon(g, 0x975b30, [-12, 0, -5, -1, -4, 1, -11, 3]);
    this.rect(g, 0x121b25, -5, -3, 17, 5);
    this.rect(g, 0x778b91, -4, -3, 15, 1);
    this.rect(g, 0x303e4a, -4, -1, 14, 2);
    this.rect(g, 0xaf6b35, 6, -1, 7, 3);
    this.rect(g, 0xd79753, 7, -1, 5, 1);
    this.rect(g, 0x1b2832, 13, -2, 9, 2);
    this.rect(g, 0x879ba0, 14, -2, 7, 1);
    this.rect(g, 0x18232c, 20, -4, 2, 4);
    this.rect(g, 0x77442b, -3, 2, 3, 4);
    this.polygon(g, 0x121c26, [2, 1, 6, 1, 6, 6, 4, 9, 0, 10, 2, 6]);
    this.polygon(g, 0x4b5e68, [3, 2, 5, 2, 5, 6, 3, 8, 1, 8, 3, 5]);
  },

  drawPrince: function (pose) {
    const p = pose.prince;
    const g = this.prince;
    g.clear();
    g.x = Math.round(p.x);
    g.y = Math.round(p.y);
    g.scale.x = -1;
    const dip = p.placing * 15;
    const lean = p.placing * 9 - Math.max(0, p.kick) * 3 + p.sway * 2;
    const hip = { x: lean, y: -18 + dip * 0.65 };
    this.leg(g, hip, { x: -4 - p.step * 5, y: -10 + dip * 0.3 }, { x: -5 - p.step * 7, y: -1 }, false, true);
    let knee = { x: 3 + p.step * 5, y: -9 };
    let foot = { x: 4 + p.step * 7, y: -1 - Math.max(0, p.step) * (p.dancing ? 5 : 2) };
    if (p.kick !== 0) {
      knee = { x: 3 + Math.max(0, p.kick) * 8, y: -10 - Math.abs(p.kick) * 3 };
      foot = { x: 4 + p.kick * 15, y: -1 - Math.abs(p.kick) * 3 };
    }
    this.leg(g, hip, knee, foot, false, false);
    PrinceJS.PrincePose.drawTorso(g, Math.round(-33 + dip), Math.round(hip.y), lean, p.sway, 0.8);
    this.rect(g, 0x781525, lean - 3, -29 + dip, 4, 5);
    this.rect(g, 0xb32a3c, lean - 2, -28 + dip, 3, 2);
    this.rect(g, 0x9f2634, lean + 2, -23 + dip, 3, 4);
    this.rect(g, 0x981e31, hip.x - 2, hip.y + 3, 3, 4);
    this.rect(g, 0x7e1827, foot.x - 2, foot.y - 5, 2, 3);
    this.princeHead.x = Math.round(lean);
    this.princeHead.y = Math.round(-33 + dip);
    this.faceBlood.x = this.princeHead.x;
    this.faceBlood.y = this.princeHead.y;
    this.princeHead.tint = this.flashes[0] > 0 ? 0xffe5a0 : 0xffffff;
    const gun = {
      x: -10 + p.raise * 17 + lean,
      y: -20 - p.raise * 13 + dip,
      angle: (Math.PI - 0.35) * (1 - p.raise) + (-Math.PI / 2 + 0.22 + p.sway * 0.16) * p.raise
    };
    const hold = this.localPoint(gun, -1, -4);
    this.arm(g, { x: lean - 3, y: -30 + dip }, hold, -1, false);
    let other = pose.headHeld ? { x: p.x - pose.head.x, y: pose.head.y - p.y - 5 } : { x: lean + 9, y: -20 + dip };
    if (p.raise > 0) {
      const support = this.localPoint(gun, 7, 3);
      other = { x: other.x + (support.x - other.x) * p.raise, y: other.y + (support.y - other.y) * p.raise };
    }
    this.arm(g, { x: lean + 3, y: -30 + dip }, other, 1, false);
    if (this.flashes[0] > 0) {
      this.rect(g, 0xffd77c, lean - 3, -31 + dip, 2, 9, 0.4);
    }
    this.weapon(this.princeGun, gun, p, 0, true);
  },

  drawPrincess: function (p) {
    const g = this.princess;
    g.clear();
    g.x = Math.round(p.x);
    g.y = Math.round(p.y);
    const hip = { x: p.sway * 2, y: -18 };
    this.leg(g, hip, { x: -5 - p.sway * 3, y: -9 }, { x: -5 - p.sway * 6, y: -1 }, true, true);
    this.leg(
      g,
      hip,
      { x: 4 + p.sway * 3, y: -9 },
      { x: 5 + p.sway * 6, y: -1 - Math.max(0, -p.sway) * 5 },
      true,
      false
    );
    this.polygon(g, 0xd030d0, [-4, -23, 3, -23, 9 + p.sway * 3, -7, 2, -6, -8 + p.sway * 3, -10]);
    this.polygon(g, 0xfc38fc, [-3, -23, 2, -23, 7 + p.sway * 3, -8, 1, -7, -6 + p.sway * 3, -10]);
    this.polygon(g, 0xfcd8fc, [-5, -32, 3, -33, 4, -27, 1, -20, -5, -20, -4, -26]);
    this.rect(g, 0xfc9c80, -4, -21, 7, 3);
    this.princessHead.x = 0;
    this.princessHead.y = -31;
    this.princessHead.scale.x = -1;
    this.princessHead.tint = this.flashes[1] > 0 || this.flashes[2] > 0 ? 0xffe5bb : 0xffffff;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const gun = {
        x: side * (6 + p.draw * 6),
        y: -18 - p.draw * 17,
        angle: -Math.PI / 2 + side * (0.22 + p.sway * 0.12) - (1 - p.draw) * side * 1.2
      };
      this.princessGuns[i].visible = p.draw > 0;
      this.arm(
        g,
        { x: side * 4, y: -30 },
        p.draw > 0 ? this.localPoint(gun, -2, 4) : { x: side * 7, y: -21 },
        side,
        true
      );
      this.weapon(this.princessGuns[i], gun, p, i + 1, false);
    }
  },

  render: function (pose) {
    this.drawPrince(pose);
    this.drawPrincess(pose.princess);
    this.headLayer.x = pose.head.x;
    this.headLayer.y = pose.head.y;
    this.headLayer.rotation = pose.head.rotation;
    this.headLayer.visible = pose.head.visible;
    if (pose.headGrounded && !this.bloodOnFloor) {
      this.bloodOnFloor = true;
      this.rect(this.floor, 0x741125, pose.head.x - 5, 164, 10, 2);
      this.rect(this.floor, 0xa11e32, pose.head.x - 2, 163, 5, 2);
    }
  },

  particle: function (x, y, vx, vy, color, life, type = "dust") {
    this.particles.push({ x, y, vx, vy, color, life, type });
  },

  kickHead: function () {
    this.kickSound.play();
    for (let i = 0; i < 8; i++) {
      this.particle(
        PrinceJS.Finale.STAGE.headX,
        160,
        -20 - i * 8,
        -10 - i * 6,
        i % 2 ? 0x9a1730 : 0xc73241,
        0.8,
        "blood"
      );
    }
  },

  breakWindow: function () {
    this.drawWindow(true);
    this.glassSound.play();
    for (let i = 0; i < 26; i++) {
      const angle = i * 2.4;
      this.particle(
        22 + Math.sin(i) * 5,
        111 + Math.cos(i * 3) * 17,
        Math.cos(angle) * 65 - 8,
        Math.sin(angle) * 55 - 25,
        i % 2 ? 0xa3dce1 : 0x588d9f,
        2.8,
        "glass"
      );
    }
  },

  shoot: function (gun, index) {
    if (!gun.visible || gun.dy >= -0.7) {
      return;
    }
    this.flashes[index] = index === 0 ? 0.045 : 0.06;
    // The arch's upper masonry is the ceiling of this cinematic, never the other actor.
    const y = 22 + Math.floor(Math.random() * 5);
    const distance = (gun.y - y) / -gun.dy;
    const x = gun.x + gun.dx * distance;
    this.particles.push({ type: "tracer", x: gun.x, y: gun.y, dx: gun.dx, dy: gun.dy, distance, life: 0.045 });
    this.rect(this.damage, 0x493426, x - 1, y - 1, 3, 2);
    this.rect(this.damage, 0x1f242c, x, y, 1, 1);
    for (let i = 0; i < 3; i++) {
      this.particle(x, y, (Math.random() - 0.5) * 50, 10 + Math.random() * 30, i ? 0xb99867 : 0xffe4a3, 0.45);
    }
    this.particle(
      gun.x - gun.dx * 19,
      gun.y - gun.dy * 19,
      (index === 1 ? -1 : 1) * (20 + Math.random() * 30),
      -20 - Math.random() * 30,
      0xe5b34f,
      2,
      "brass"
    );
    if (index === 0) {
      this.audio.minigunShot();
    }
  },

  update: function (dt) {
    this.elapsed += dt;
    this.flashes = this.flashes.map((time) => Math.max(0, time - dt));
    this.debris.clear();
    this.tracers.clear();
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        return false;
      }
      if (p.type === "tracer") {
        // Sparse short streaks keep the room and both dancers readable.
        for (let fraction = 0.1; fraction < 1; fraction += 0.45) {
          const at = p.distance * fraction;
          this.limb(
            this.tracers,
            { x: p.x + p.dx * at, y: p.y + p.dy * at },
            { x: p.x + p.dx * (at + 7), y: p.y + p.dy * (at + 7) },
            0xffe19b,
            1
          );
        }
        return true;
      }
      p.vy += 150 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y >= 166 && p.type !== "dust") {
        this.rect(this.floor, p.color, p.x, 165 + Math.floor(Math.abs(p.x * 3) % 5), p.type === "glass" ? 3 : 2, 1);
        return false;
      }
      if (p.type === "glass") {
        this.polygon(this.debris, p.color, [p.x, p.y - 2, p.x + 3, p.y, p.x - 1, p.y + 2]);
      } else {
        this.rect(this.debris, p.color, p.x, p.y, p.type === "brass" ? 2 : 1, 1);
      }
      return p.x > -12 && p.x < 332 && p.y < 200;
    });
  },

  destroy: function () {
    this.audio.destroy();
    this.glassSound.destroy();
    this.kickSound.destroy();
    this.layers.forEach((layer) => layer.destroy(true));
    this.particles.length = 0;
  }
};
