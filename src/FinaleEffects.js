"use strict";

PrinceJS.FinaleEffects = function (game, scene) {
  this.game = game;
  this.elapsed = 0;
  this.particles = [];
  this.flashes = [0, 0, 0];
  this.guns = [];
  this.layers = [];
  this.pillars = [
    { x: 67, hits: 0, chips: 0 },
    { x: 248, hits: 0, chips: 0 },
    { x: 117, hits: 0, chips: 0 }
  ];
  const layer = (z) => {
    const graphics = game.add.graphics(0, 0);
    graphics.z = z;
    this.layers.push(graphics);
    return graphics;
  };
  this.glass = layer(11);
  this.damage = layer(12);
  this.archHole = layer(13);
  this.bloodTrail = layer(18);
  this.dragBloodX = 320;
  this.floor = layer(19);
  this.prince = layer(21);
  this.princess = layer(20);
  this.bodyLayer = layer(22);
  this.headLayer = layer(23);
  this.debris = layer(24);
  this.tracers = layer(25);
  this.pillarDamage = layer(31);
  this.fallingArch = layer(32);
  if (scene.front && typeof scene.front.addChildAt === "function") {
    const coverIndex = scene.front.children.findIndex((child) => child.key === "cover");
    const index = coverIndex < 0 ? scene.front.children.length : coverIndex;
    // Foreground cracks and falling masonry also sit behind the existing fade cover.
    scene.front.addChildAt(this.pillarDamage, index);
    scene.front.addChildAt(this.fallingArch, index + 1);
  }
  this.createArchFragment();
  this.windowMask = layer(0);
  // The mask shares the world's scale. Keep it transformable but never paint it.
  this.windowMask.isMask = true;
  this.rect(this.windowMask, 0xffffff, 29, 0, 307, 200);
  // Rectangles stay in one WebGL mask batch; mixed complex polygons would be
  // ignored by this Phaser version's single-batch stencil-mask implementation.
  for (let y = 90; y <= 137; y++) {
    const half = y < 99 ? Math.max(1, Math.floor(Math.sqrt(81 - (99 - y) ** 2))) : 8;
    this.rect(this.windowMask, 0xffffff, 21 - half, y, half * 2, 1);
  }
  this.headLayer.mask = this.windowMask;
  this.princeHead = this.headSprite(this.prince, "kid", "kid-15", 0, 0, 12, 8);
  this.princeHead.scale.x = -1;
  this.faceBlood = game.make.graphics(0, 0);
  this.prince.addChild(this.faceBlood);
  this.rect(this.faceBlood, 0xa21e30, 2, -5, 2, 1);
  this.rect(this.faceBlood, 0x8b1528, 3, -4, 1, 2);
  this.princessHead = this.headSprite(this.princess, "princess", "princess-11", 2, 0, 12, 12);
  // Split the native dead frame at its neck. The turban, face, sash and robes stay original.
  this.jaffarBody = game.make.sprite(0, -11, "jaffar", "jaffar-35");
  this.jaffarBody.crop(new Phaser.Rectangle(0, 0, 33, 11));
  this.bodyLayer.addChild(this.jaffarBody);
  this.attachedHead = game.make.sprite(33, -11, "jaffar", "jaffar-35");
  this.attachedHead.crop(new Phaser.Rectangle(33, 0, 10, 11));
  this.bodyLayer.addChild(this.attachedHead);
  this.jaffar = this.headSprite(this.headLayer, "jaffar", "jaffar-35", 33, 0, 10, 11);
  this.jaffar.anchor.setTo(0.5, 0.5);
  this.rect(this.headLayer, 0x830d22, -5, 1, 3, 2);
  this.rect(this.headLayer, 0xc42b34, -5, 2, 2, 2);
  this.princeGun = game.make.graphics(0, 0);
  this.prince.addChild(this.princeGun);
  this.princessGuns = [game.make.graphics(0, 0), game.make.graphics(0, 0)];
  this.princessGuns.forEach((gun) => this.princess.addChild(gun));
  this.audio = new PrinceJS.WeaponAudio(game);
  this.glassSound = game.add.audio("Mirror", 0.65);
  this.kickSound = game.add.audio("BumpIntoWallHard", 0.7);
  this.collapseSound = game.add.audio("LooseFloorLands", 0.7);
  this.squishSound = game.add.audio("HardLandingSplat", 0.7);
  this.drawWindow(false);
};

PrinceJS.FinaleEffects.prototype = {
  createArchFragment: function () {
    const arch = PrinceJS.Finale.ARCH;
    const frame = this.game.cache.getFrameByName("cutscene", "room");
    this.archBitmap = this.game.add.bitmapData(arch.width, arch.height);
    const context = this.archBitmap.ctx;
    context.imageSmoothingEnabled = false;
    context.drawImage(
      this.game.cache.getImage("cutscene"),
      frame.x + arch.x,
      frame.y + arch.y,
      arch.width,
      arch.height,
      0,
      0,
      arch.width,
      arch.height
    );
    const image = context.getImageData(0, 0, arch.width, arch.height);
    this.archBackingBitmap = this.game.add.bitmapData(arch.width, arch.height);
    const backingContext = this.archBackingBitmap.ctx;
    backingContext.imageSmoothingEnabled = false;
    // The room atlas flattens the outer and inner arches. Reconstruct the
    // hidden continuation with the native inner arch and its blue backdrop.
    backingContext.fillStyle = "#080f35";
    backingContext.fillRect(0, 0, arch.width, arch.height);
    backingContext.drawImage(
      this.game.cache.getImage("cutscene"),
      frame.x + arch.backing.x,
      frame.y + arch.backing.y,
      arch.width,
      arch.height,
      0,
      0,
      arch.width,
      arch.height
    );
    const backing = backingContext.getImageData(0, 0, arch.width, arch.height);
    this.archBacking = this.game.make.sprite(arch.x, arch.y, this.archBackingBitmap);
    this.archHole.addChild(this.archBacking);
    this.archFracture = this.game.make.graphics(0, 0);
    this.archHole.addChild(this.archFracture);
    // Cut both the moving stone and its hole on the same native pixel grid.
    // A single bitmap keeps the rotated texture continuous across every row.
    for (let y = 0; y < arch.height; y++) {
      let left = arch.width;
      let right = 0;
      for (let x = 0; x < arch.width; x++) {
        let inside = false;
        for (let i = 0, j = arch.outline.length - 1; i < arch.outline.length; j = i++) {
          const [ax, ay] = arch.outline[i];
          const [bx, by] = arch.outline[j];
          if (ay > y + 0.5 !== by > y + 0.5 && x + 0.5 < ax + ((bx - ax) * (y + 0.5 - ay)) / (by - ay)) {
            inside = !inside;
          }
        }
        if (inside) {
          left = Math.min(left, x);
          right = x + 1;
        } else {
          image.data[(y * arch.width + x) * 4 + 3] = 0;
          backing.data[(y * arch.width + x) * 4 + 3] = 0;
        }
      }
      if (right > left) {
        // Narrow broken edges give the opening depth without hiding the
        // surviving ceiling and background behind a solid dark fill.
        this.rect(this.archFracture, 0x8d633c, arch.x + left, arch.y + y, 1, 1);
        this.rect(this.archFracture, 0xf4c77e, arch.x + right - 1, arch.y + y, 1, 1);
      }
    }
    context.putImageData(image, 0, 0);
    backingContext.putImageData(backing, 0, 0);
    this.archBitmap.dirty = true;
    this.archBackingBitmap.dirty = true;
    this.archSprite = this.game.make.sprite(-Math.floor(arch.width / 2), -Math.floor(arch.height / 2), this.archBitmap);
    this.fallingArch.addChild(this.archSprite);
    this.archCracks = this.game.make.graphics(0, 0);
    this.fallingArch.addChild(this.archCracks);
    this.crack(this.archCracks, -2, -8, 15, 3);
    this.archHole.visible = this.fallingArch.visible = false;
  },

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
    // Follow the Prince's turn while he walks around the corpse.
    const direction = minigun ? actor.facing : 1;
    this.guns[index] = {
      x: actor.x + muzzle.x * direction,
      y: actor.y + muzzle.y,
      dx: Math.cos(position.angle) * direction,
      dy: Math.sin(position.angle),
      target: position.target,
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
    g.scale.x = p.facing;
    const dip = p.crouch;
    const lean = p.lean - Math.max(0, p.kick) * 3 + p.sway * 2;
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
    const carry = p.dragPose * (1 - p.raise);
    const gun = {
      x: -10 + p.raise * 17 + lean + carry * 19,
      y: -20 - p.raise * 13 + dip - carry * 5,
      angle:
        (Math.PI - 0.35) * (1 - p.raise) + (-Math.PI / 2 + 0.22 + p.sway * 0.16) * p.raise - carry * (Math.PI + 0.1)
    };
    if (p.firing) {
      gun.target = p.aim;
      gun.angle = Math.atan2(p.aim.y - p.y - gun.y, p.x - p.aim.x - gun.x);
    }
    const hold = this.localPoint(gun, -1, -4);
    this.arm(g, { x: lean - 3, y: -30 + dip }, hold, -1, false);
    let other = pose.body.held
      ? { x: (pose.body.grip.x - p.x) / p.facing, y: pose.body.grip.y - p.y }
      : { x: lean + 9, y: -20 + dip };
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
    this.princessHead.x = p.look;
    this.princessHead.y = -31;
    // The native face looks left. Narrow it briefly through the turn, keeping
    // a visible head and a fixed neck as she follows the passing Prince.
    this.princessHead.scale.x = (p.look >= 0 ? -1 : 1) * Math.max(0.35, Math.abs(p.look));
    this.princessHead.tint = this.flashes[1] > 0 || this.flashes[2] > 0 ? 0xffe5bb : 0xffffff;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const gun = {
        x: side * (6 + p.draw * 6),
        y: -18 - p.draw * 17,
        angle: -Math.PI / 2 + side * (0.22 + p.sway * 0.12) - (1 - p.draw) * side * 1.2
      };
      if (p.firing) {
        gun.target = p.aims[i];
        gun.angle = Math.atan2(gun.target.y - p.y - gun.y, gun.target.x - p.x - gun.x);
      }
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
    this.bodyLayer.clear();
    this.bodyLayer.x = pose.body.x;
    this.bodyLayer.y = pose.body.crushed ? PrinceJS.Finale.STAGE.floorY + 1 : pose.body.y;
    this.bodyLayer.rotation = pose.body.rotation;
    this.bodyLayer.scale.y = pose.body.crushed ? 0.38 : 1;
    this.attachedHead.visible = pose.body.headAttached;
    this.bodyLayer.z = 19.5;
    if (!pose.body.headAttached) {
      this.rect(this.bodyLayer, 0x761027, 30, -6, 4, 4);
      this.rect(this.bodyLayer, 0xc63443, 32, -5, 2, 2);
    }
    this.headLayer.x = pose.head.x;
    this.headLayer.y = pose.head.y;
    this.headLayer.rotation = pose.head.rotation;
    this.headLayer.visible = pose.head.visible;
    // Interior + aperture form one clipping region; the outside wall is never exposed.
    this.headLayer.mask = this.windowMask;
    if (pose.body.dragging) {
      this.drawDragBlood(pose.body.floorContact.x);
    }
    if (!pose.body.held && !this.bloodOnFloor) {
      this.bloodOnFloor = true;
      this.rect(this.floor, 0x741125, pose.body.x + 4, 164, 35, 3);
      this.rect(this.floor, 0xa11e32, pose.body.x + 22, 163, 15, 2);
    }
    this.drawPillars(pose);
  },

  drawDragBlood: function (contactX) {
    const next = Math.max(0, Math.min(320, Math.round(contactX)));
    // Stamp each world pixel only once, so the smear is continuous and has
    // identical edges at every frame rate. This layer is never cleared.
    for (let x = this.dragBloodX - 1; x >= next; x--) {
      const edge = (Math.floor(x / 5) % 3) - 1;
      this.rect(this.bloodTrail, 0x650f25, x, 164 + edge, 1, 5 + (x % 3 === 0 ? 1 : 0));
      this.rect(this.bloodTrail, 0x981b32, x, 165, 1, 2);
      if (x % 7 === 0) {
        this.rect(this.bloodTrail, 0xc02b3c, x, 164, 2, 1);
      }
      if (x % 11 === 0) {
        this.rect(this.bloodTrail, 0x7e152b, x + 3, 171 + (x % 2), 2, 1);
      }
    }
    this.dragBloodX = Math.min(this.dragBloodX, next);
  },

  crack: function (g, x, y, height, strength) {
    const points = [
      { x, y },
      { x: x - 3, y: y + height * 0.24 },
      { x: x + 2, y: y + height * 0.48 },
      { x: x - 2, y: y + height * 0.73 },
      { x: x + 2, y: y + height }
    ];
    for (let i = 1; i < points.length; i++) {
      this.limb(g, points[i - 1], points[i], 0x37291f, strength > 2 ? 2 : 1);
      if (strength > 1 && i % 2) {
        this.limb(g, points[i], { x: points[i].x + 5, y: points[i].y - 4 }, 0x37291f, 1);
        this.rect(g, 0xffd28b, points[i].x - 1, points[i].y, 1, 2);
      }
    }
  },

  drawPillars: function (pose) {
    this.pillarDamage.clear();
    const falling = pose.arch.falling && this.pillars[2].hits >= 24;
    this.fallingArch.visible = this.archHole.visible = falling;
    for (let i = 0; i < this.pillars.length; i++) {
      const pillar = this.pillars[i];
      const strength = Math.min(3, Math.floor(pillar.hits / 8));
      if (!strength || (i === 2 && falling)) {
        continue;
      }
      this.crack(this.pillarDamage, pillar.x, i === 2 ? 21 : 24, i === 2 ? 22 : 91, strength);
      if (i < 2) {
        this.crack(this.pillarDamage, pillar.x, 122, 37, strength);
      }
    }
    if (falling) {
      this.fallingArch.x = pose.arch.x;
      this.fallingArch.y = pose.arch.y;
      this.fallingArch.rotation = pose.arch.rotation;
      if (!this.archDetached) {
        this.archDetached = true;
        const arch = PrinceJS.Finale.ARCH;
        for (let i = 0; i < 14; i++) {
          this.particle(
            arch.x + 2 + i * 1.7,
            arch.y + 10 + (i % 4) * 3,
            (i - 7) * 5,
            5 + (i % 3) * 5,
            i % 2 ? 0xd0ad74 : 0x88613f,
            0.5,
            i % 3 ? "dust" : "stone"
          );
        }
      }
      if (pose.body.crushed && !this.bodyCrushed) {
        this.crushBody();
      }
    }
  },

  crushBody: function () {
    this.bodyCrushed = true;
    this.collapseSound.play();
    this.squishSound.play();
    this.rect(this.floor, 0x580b1d, 83, 164, 57, 5);
    this.rect(this.floor, 0xa81d32, 99, 163, 31, 3);
    for (let i = 0; i < 32; i++) {
      const side = i % 2 ? -1 : 1;
      this.particle(
        113 + side * 5,
        161,
        side * (20 + (i % 8) * 12),
        -26 - (i % 7) * 12,
        i % 3 ? 0xa71930 : 0xe0444d,
        1.8,
        "blood"
      );
    }
    for (let i = 0; i < 14; i++) {
      this.particle(111, 162, (i - 7) * 10, -10 - (i % 4) * 13, 0xc9a572, 0.8, "stone");
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
    const target = gun.target;
    if (!target) {
      return;
    }
    // Every tracer ends on the actual gold support/arch toward which the weapon is aimed.
    const { x, y } = target;
    const distance = Math.hypot(x - gun.x, y - gun.y);
    this.particles.push({ type: "tracer", x: gun.x, y: gun.y, dx: gun.dx, dy: gun.dy, distance, life: 0.045 });
    this.rect(this.damage, 0x493426, x - 1, y - 1, 3, 3);
    this.rect(this.damage, 0x1f242c, x, y, 2, 1);
    const pillar = this.pillars[target.pillar];
    pillar.hits++;
    if (pillar.hits % 8 === 0) {
      pillar.chips++;
      this.particle(x, y + 4, (Math.random() - 0.5) * 28, 15, 0xcba56c, 2, "stone");
      this.particle(
        (target.pillar === 2 ? x : pillar.x) + (pillar.chips % 2 ? 4 : -4),
        target.pillar === 2 ? y + 6 : 107,
        (Math.random() - 0.5) * 35,
        10,
        0xe6bc7e,
        1.4,
        "stone"
      );
      this.polygon(this.damage, 0x35251d, [x - 3, y - 1, x + 3, y, x + 1, y + 4, x - 2, y + 3]);
    }
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
        const width = p.type === "stone" ? 5 : p.type === "glass" ? 3 : 2;
        this.rect(this.floor, p.color, p.x, 165 + Math.floor(Math.abs(p.x * 3) % 5), width, p.type === "stone" ? 3 : 1);
        return false;
      }
      if (p.type === "stone") {
        this.polygon(this.debris, 0x775237, [p.x - 3, p.y - 2, p.x + 2, p.y - 3, p.x + 4, p.y + 2, p.x - 2, p.y + 3]);
        this.polygon(this.debris, p.color, [p.x - 3, p.y - 2, p.x + 2, p.y - 3, p.x + 2, p.y + 1, p.x - 2, p.y + 1]);
      } else if (p.type === "glass") {
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
    this.collapseSound.destroy();
    this.squishSound.destroy();
    this.headLayer.mask = null;
    this.layers.forEach((layer) => layer.destroy(true));
    this.archBitmap.destroy();
    this.archBackingBitmap.destroy();
    this.particles.length = 0;
  }
};
