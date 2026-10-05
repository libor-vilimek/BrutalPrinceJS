"use strict";

// Positions use logical world pixels, before the game's world scale is applied.
PrinceJS.RocketLauncherEffects = function (game, kid, pickup) {
  this.game = game;
  this.kid = kid;
  this.pickup = pickup;
  this.collected = !!pickup.collected;
  this.elapsed = 0;
  this.collectTime = 0;
  this.flashTime = 0;
  this.recoil = 0;
  this.shots = 0;
  this.destroyed = false;

  this.ground = game.add.graphics(0, 0);
  this.light = game.add.graphics(0, 0);
  this.weapon = game.add.graphics(0, 0);
  this.smoke = game.add.graphics(0, 0);
  this.projectiles = game.add.graphics(0, 0);
  this.debris = game.add.graphics(0, 0);
  this.fire = game.add.graphics(0, 0);
  this.ground.z = 22;
  this.light.z = 23;
  this.weapon.z = 24;
  this.smoke.z = 25;
  this.projectiles.z = 26;
  this.debris.z = 27;
  this.fire.z = 28;

  // Only transient fire, smoke, and rocket fragments use these bounded pools.
  this.particles = [];
  this.particleCursor = 0;
  for (let i = 0; i < 280; i++) {
    this.particles.push({ life: 0 });
  }
  this.blasts = [];
  this.blastCursor = 0;
  for (let i = 0; i < 12; i++) {
    this.blasts.push({ life: 0 });
  }
  this.trails = Object.create(null);
  this.update(0, []);
};

PrinceJS.RocketLauncherEffects.prototype.getPose = function () {
  let kid = this.kid;
  let action = kid.action || "stand";
  let crouched = /stoop|crawl|land|standup/.test(action);
  let running = /run|step|advance|retreat/.test(action);
  let bob = running ? Math.round(Math.sin((kid.charFrame || 0) * 1.8)) : 0;
  return {
    x: kid.baseX + PrinceJS.Utils.convertX(kid.charX),
    y: kid.baseY + kid.charY - (crouched ? 13 : 24) + bob,
    direction: kid.charFace === -1 ? -1 : 1,
    visible:
      kid.alive !== false &&
      kid.active !== false &&
      kid.visible !== false &&
      kid.exists !== false &&
      kid.hasRocketLauncher !== false &&
      kid.rocketLauncherEquipped === true &&
      !/hang|climb|drink|pickupsword|rdiveroll|stabkill|dropdead|impale|halve|falldead/.test(action)
  };
};

PrinceJS.RocketLauncherEffects.prototype.getMuzzle = function () {
  let pose = this.getPose();
  return {
    x: Math.round(pose.x + (18 - Math.round(this.recoil)) * pose.direction),
    y: Math.round(pose.y),
    direction: pose.direction,
    visible: !this.destroyed && this.collected && this.collectTime === 0 && pose.visible
  };
};

PrinceJS.RocketLauncherEffects.prototype.rect = function (graphics, color, x, y, width, height, alpha) {
  graphics.beginFill(color, alpha === undefined ? 1 : alpha);
  graphics.drawRect(Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  graphics.endFill();
};

PrinceJS.RocketLauncherEffects.prototype.circle = function (graphics, color, x, y, diameter, alpha) {
  graphics.beginFill(color, alpha === undefined ? 1 : alpha);
  graphics.drawCircle(Math.round(x), Math.round(y), Math.round(diameter));
  graphics.endFill();
};

PrinceJS.RocketLauncherEffects.prototype.emit = function (type, x, y, vx, vy, life, color, size) {
  let particle = this.particles[this.particleCursor];
  this.particleCursor = (this.particleCursor + 1) % this.particles.length;
  particle.type = type;
  particle.x = x;
  particle.y = y;
  particle.vx = vx;
  particle.vy = vy;
  particle.life = particle.maxLife = life;
  particle.color = color;
  particle.size = size;
  particle.phase = Math.random() * Math.PI * 2;
};

PrinceJS.RocketLauncherEffects.prototype.collect = function () {
  if (this.destroyed || this.collected) {
    return;
  }
  this.collected = this.pickup.collected = true;
  this.collectTime = 0.42;
  for (let i = 0; i < 24; i++) {
    let angle = (i / 24) * Math.PI * 2;
    let speed = 22 + Math.random() * 26;
    this.emit(
      "spark",
      this.pickup.worldX,
      this.pickup.worldY - 7,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed - 26,
      0.32 + Math.random() * 0.32,
      i % 3 ? 0xffbe56 : 0xfff4c4,
      i % 4 ? 1 : 2
    );
  }
};

PrinceJS.RocketLauncherEffects.prototype.shot = function (worldX, worldY, direction) {
  if (this.destroyed || !this.collected || !this.getPose().visible) {
    return;
  }
  this.flashTime = 0.13;
  this.recoil = 2;
  this.shots++;
  for (let i = 0; i < 16; i++) {
    let backblast = i > 5;
    let x = worldX - (backblast ? 31 : 0) * direction;
    let travel = direction * (backblast ? -1 : 1);
    this.emit(
      i % 3 ? "smoke" : "spark",
      x,
      worldY + (Math.random() - 0.5) * 4,
      travel * (18 + Math.random() * 58),
      (Math.random() - 0.5) * 38 - 12,
      i % 3 ? 0.45 + Math.random() * 0.3 : 0.16 + Math.random() * 0.12,
      i % 3 ? 0xb7a080 : 0xffd862,
      i % 3 ? 3 : 1
    );
  }
};

PrinceJS.RocketLauncherEffects.prototype.explode = function (worldX, worldY) {
  if (this.destroyed) {
    return;
  }
  let blast = this.blasts[this.blastCursor];
  this.blastCursor = (this.blastCursor + 1) % this.blasts.length;
  blast.x = worldX;
  blast.y = worldY;
  blast.life = blast.maxLife = 0.58;
  blast.phase = Math.random() * Math.PI * 2;

  for (let i = 0; i < 46; i++) {
    let angle = (i / 46) * Math.PI * 2 + Math.random() * 0.35;
    let smoke = i % 3 === 0;
    let chunk = !smoke && i % 4 === 0;
    let speed = smoke ? 20 + Math.random() * 39 : 40 + Math.random() * 125;
    this.emit(
      smoke ? "smoke" : chunk ? "chunk" : "ember",
      worldX + Math.cos(angle) * 4,
      worldY + Math.sin(angle) * 4,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed - (smoke ? 16 : 34),
      smoke ? 1.1 + Math.random() * 0.7 : 0.35 + Math.random() * 0.5,
      smoke ? (i % 2 ? 0x6f655d : 0x9d8b73) : chunk ? 0x6d5440 : i % 2 ? 0xffbc39 : 0xffeb97,
      smoke ? 5 + Math.random() * 4 : chunk ? 2 + Math.random() * 2 : 1 + (i % 2)
    );
  }
};

PrinceJS.RocketLauncherEffects.prototype.drawWeapon = function (graphics, held) {
  let rect = (color, x, y, width, height) => this.rect(graphics, color, x, y, width, height);

  // A compact olive tube, flared steel ends, red warhead collar, and flip-up sight.
  rect(0x111b20, -14, -4, 32, 9);
  rect(0x162023, -14, -5, 4, 11);
  rect(0x58615a, -13, -4, 3, 9);
  rect(0x9ca58b, -13, -4, 3, 2);
  rect(0x293637, -13, 2, 3, 3);
  rect(0x4a5b39, -10, -3, 24, 7);
  rect(0x899762, -10, -3, 24, 2);
  rect(0xb4b886, -8, -3, 8, 1);
  rect(0x657847, -10, -1, 23, 3);
  rect(0x37482e, -10, 2, 24, 2);
  rect(0x263731, -7, -4, 3, 9);
  rect(0x84946a, -7, -3, 3, 2);
  rect(0x934a39, 9, -3, 3, 7);
  rect(0xe48657, 9, -3, 3, 2);
  rect(0x6c342e, 9, 2, 3, 2);
  rect(0x202c31, 13, -5, 5, 11);
  rect(0x97a3a0, 14, -4, 3, 2);
  rect(0x617472, 14, -2, 3, 5);
  rect(0x394b4c, 14, 3, 3, 2);
  rect(0x101719, 17, -3, 1, 7);
  rect(0xffbd5c, 17, -1, 1, 2);
  rect(0x152127, -2, -7, 5, 3);
  rect(0x788882, -1, -7, 3, 1);
  rect(0xdc8953, 1, -6, 1, 1);
  rect(0x19262a, -3, 4, 4, 5);
  rect(0x4d5544, -2, 4, 2, 4);
  rect(0x19262a, 5, 4, 4, 3);
  rect(0xd5bd60, 1, -1, 3, 1);
  rect(0x1b2d2b, 1, 1, 4, 1);

  if (held) {
    // Sleeves and small hands join the existing Prince sprite to the two grips.
    rect(0xc4c29a, -11, 3, 5, 4);
    rect(0xf2edc4, -10, 3, 3, 3);
    rect(0xf3efc8, -8, 6, 7, 2);
    rect(0xffca95, -2, 4, 3, 4);
    rect(0xd9936d, -2, 7, 3, 1);
    rect(0xe4ddb3, 1, 8, 7, 2);
    rect(0xffcd97, 6, 4, 3, 4);
    rect(0xda9568, 8, 5, 1, 3);
  }
};

PrinceJS.RocketLauncherEffects.prototype.drawGround = function () {
  let graphics = this.ground;
  graphics.clear();
  graphics.visible = !this.collected;
  if (this.collected) {
    return;
  }
  graphics.x = Math.round(this.pickup.worldX);
  graphics.y = Math.round(this.pickup.worldY - 9);
  let pulse = 0.72 + Math.sin(this.elapsed * 3) * 0.18;
  this.rect(graphics, 0x000000, -15, 9, 35, 2, 0.58);
  this.rect(graphics, 0xe2993b, -13, 8, 30, 2, pulse * 0.3);
  this.drawWeapon(graphics, false);

  let letters = {
    R: [6, 5, 6, 5, 5],
    O: [7, 5, 5, 5, 7],
    C: [7, 4, 4, 4, 7],
    K: [5, 5, 6, 5, 5],
    E: [7, 4, 6, 4, 7],
    T: [7, 2, 2, 2, 2],
    S: [7, 4, 7, 1, 7]
  };
  let label = "ROCKETS";
  this.rect(graphics, 0x171d21, -14, -22, 33, 9, 0.88);
  for (let letter = 0; letter < label.length; letter++) {
    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < 3; column++) {
        if (letters[label[letter]][row] & (4 >> column)) {
          this.rect(graphics, 0xffc881, -11 + letter * 4 + column, -20 + row, 1, 1);
        }
      }
    }
  }
  let glintY = -9 + Math.round(Math.sin(this.elapsed * 3.3));
  this.rect(graphics, 0xffbb50, 10, glintY - 2, 1, 5, pulse);
  this.rect(graphics, 0xffbb50, 8, glintY, 5, 1, pulse);
  this.rect(graphics, 0xfff4c1, 10, glintY, 1, 1, pulse);
};

PrinceJS.RocketLauncherEffects.prototype.drawRocket = function (rocket) {
  let graphics = this.projectiles;
  let x = Math.round(rocket.x);
  let y = Math.round(rocket.y);
  let direction = rocket.direction === -1 ? -1 : 1;
  let age = Number(rocket.age) || this.elapsed;
  let flameLength = 11 + (Math.floor(age * 40) % 3) * 3;
  let rect = (color, offsetX, offsetY, width, height, alpha) =>
    this.rect(graphics, color, x + (direction === 1 ? offsetX : -offsetX - width), y + offsetY, width, height, alpha);

  this.circle(this.light, 0xffaf2e, x - 9 * direction, y, 23, 0.1);
  this.circle(this.light, 0xffd04c, x - 8 * direction, y, 13, 0.17);
  rect(0xd45c29, -flameLength - 6, -1, flameLength, 3, 0.78);
  rect(0xffaa29, -flameLength - 2, -2, flameLength - 3, 5, 0.85);
  rect(0xffe771, -13, -1, 8, 3);
  rect(0xffffdc, -9, 0, 5, 1);
  rect(0x15212a, -6, -3, 10, 6);
  rect(0x657e77, -5, -2, 9, 4);
  rect(0xc4c6a4, -4, -2, 7, 1);
  rect(0x354c47, -4, 1, 7, 1);
  rect(0x202f35, -7, -4, 3, 8);
  rect(0xa1ada0, -7, -3, 2, 2);
  rect(0x697b71, -7, 2, 2, 2);
  rect(0xa84431, 2, -2, 3, 4);
  rect(0xf79161, 2, -2, 3, 1);
  rect(0xce6245, 5, -1, 2, 2);
  rect(0xffc480, 7, 0, 1, 1);
};

PrinceJS.RocketLauncherEffects.prototype.updateRockets = function (dt, rockets) {
  this.projectiles.clear();
  let nextTrails = Object.create(null);
  for (let i = 0; i < rockets.length; i++) {
    let rocket = rockets[i];
    if (!Number.isFinite(rocket.x) || !Number.isFinite(rocket.y)) {
      continue;
    }
    let direction = rocket.direction === -1 ? -1 : 1;
    let trail = this.trails[rocket.id] || { time: 0, x: rocket.x, y: rocket.y };
    trail.time += dt;
    let count = Math.min(3, Math.floor(trail.time / 0.026));
    trail.time -= count * 0.026;
    for (let sample = 1; sample <= count; sample++) {
      let fraction = sample / count;
      this.emit(
        "smoke",
        trail.x + (rocket.x - trail.x) * fraction - 10 * direction,
        trail.y + (rocket.y - trail.y) * fraction + (Math.random() - 0.5) * 3,
        -direction * (6 + Math.random() * 10),
        -5 - Math.random() * 9,
        0.55 + Math.random() * 0.28,
        sample % 2 ? 0x9a917f : 0xb4a486,
        3 + Math.random() * 2
      );
    }
    trail.x = rocket.x;
    trail.y = rocket.y;
    nextTrails[rocket.id] = trail;
    this.drawRocket(rocket);
  }
  this.trails = nextTrails;
};

PrinceJS.RocketLauncherEffects.prototype.drawFlash = function () {
  let muzzle = this.getMuzzle();
  if (!muzzle.visible || this.flashTime <= 0) {
    return;
  }
  let intensity = Math.min(1, this.flashTime / 0.07);
  let x = muzzle.x;
  let y = muzzle.y;
  let direction = muzzle.direction;
  this.circle(this.light, 0xffb634, x, y, 70, intensity * 0.055);
  this.circle(this.light, 0xffda55, x, y, 37, intensity * 0.14);
  this.circle(this.light, 0xffdc60, x - 34 * direction, y, 35, intensity * 0.08);
  let polygon = (color, points, alpha) => {
    this.fire.beginFill(color, alpha);
    this.fire.drawPolygon(points.map((value, index) => Math.round(index % 2 ? y + value : x + value * direction)));
    this.fire.endFill();
  };
  polygon(0xee7726, [-2, -4, 8, -6, 6, -3, 16, 0, 7, 3, 10, 5, -2, 4], intensity);
  polygon(0xffde60, [-1, -2, 5, -3, 11, 0, 5, 3, -1, 2], intensity);
  polygon(0xffffcd, [0, -1, 8, 0, 0, 1], intensity);
  polygon(0xee8b31, [-32, -2, -39, -5, -37, -1, -45, 1, -37, 4, -32, 2], intensity * 0.75);
};

PrinceJS.RocketLauncherEffects.prototype.updateParticles = function (dt) {
  this.smoke.clear();
  this.debris.clear();
  for (let i = 0; i < this.particles.length; i++) {
    let particle = this.particles[i];
    particle.life = Math.max(0, particle.life - dt);
    if (particle.life === 0) {
      continue;
    }
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    let progress = 1 - particle.life / particle.maxLife;
    let alpha = Math.min(1, particle.life / 0.22);
    if (particle.type === "smoke") {
      particle.vx *= Math.max(0, 1 - dt * 1.2);
      particle.vy -= dt * 5;
      let size = Math.round(particle.size + progress * particle.size * 1.7);
      // Overlapping stepped blocks retain the chunky pixel-art smoke silhouette.
      this.rect(
        this.smoke,
        particle.color,
        particle.x - size / 2,
        particle.y - size / 3,
        size,
        size * 0.66,
        alpha * 0.25
      );
      this.rect(
        this.smoke,
        particle.color,
        particle.x - size / 3,
        particle.y - size / 2,
        size * 0.66,
        size,
        alpha * 0.22
      );
    } else {
      particle.vy += dt * (particle.type === "chunk" ? 200 : 70);
      if (particle.type === "chunk") {
        let size = Math.round(particle.size);
        this.rect(this.debris, 0x251f20, particle.x, particle.y + 1, size, size, alpha);
        this.rect(this.debris, particle.color, particle.x, particle.y, size, size, alpha);
        this.rect(this.debris, progress < 0.4 ? 0xffa53c : 0xb39a70, particle.x, particle.y, size, 1, alpha);
      } else {
        if (particle.type === "ember") {
          this.rect(
            this.debris,
            0xe96928,
            particle.x - particle.vx * 0.016,
            particle.y - particle.vy * 0.016,
            2,
            2,
            alpha * 0.5
          );
        }
        this.rect(this.debris, particle.color, particle.x, particle.y, particle.size, particle.size, alpha);
      }
    }
  }
};

PrinceJS.RocketLauncherEffects.prototype.updateBlasts = function (dt) {
  for (let i = 0; i < this.blasts.length; i++) {
    let blast = this.blasts[i];
    blast.life = Math.max(0, blast.life - dt);
    if (blast.life === 0) {
      continue;
    }
    let age = blast.maxLife - blast.life;
    let progress = age / blast.maxLife;
    let fade = Math.min(1, blast.life / 0.2);
    let radius = 9 + Math.min(1, age / 0.16) * 23;
    let x = blast.x;
    let y = blast.y - progress * 7;
    this.circle(this.light, 0xff982d, x, y, 124, fade * (1 - progress) * 0.12);
    this.circle(this.light, 0xffd65a, x, y, 85, fade * (1 - progress) * 0.14);

    // A fast expanding ring surrounds the layered, irregular fireball.
    this.fire.lineStyle(progress < 0.3 ? 2 : 1, progress < 0.3 ? 0xffeb9a : 0xffaa45, (1 - progress) * 0.65);
    this.fire.drawCircle(Math.round(x), Math.round(blast.y), Math.round(18 + progress * 93));
    this.fire.lineStyle(0);
    for (let lobe = 0; lobe < 7; lobe++) {
      let angle = (lobe / 7) * Math.PI * 2 + blast.phase;
      let offset = radius * 0.54;
      let lx = x + Math.cos(angle) * offset;
      let ly = y + Math.sin(angle) * offset;
      let size = radius * (0.8 + Math.sin(lobe * 2.1 + blast.phase) * 0.13);
      this.circle(this.fire, progress < 0.4 ? 0xc65227 : 0x784b32, lx, ly, size, fade * 0.8);
      this.circle(this.fire, progress < 0.45 ? 0xff902a : 0xda6d29, lx - 1, ly - 1, size * 0.74, fade * 0.9);
      if (progress < 0.65) {
        this.circle(this.fire, 0xffc540, lx - 1, ly - 2, size * 0.48, fade * (1 - progress));
      }
    }
    this.circle(this.fire, progress < 0.4 ? 0xffbc32 : 0xdc6b28, x, y, radius * 1.28, fade);
    if (age < 0.24) {
      let white = 1 - age / 0.24;
      this.circle(this.fire, 0xffec8a, x, y, radius * 1.05, white);
      this.circle(this.fire, 0xffffdb, x, y, radius * 0.72, white);
      this.rect(this.fire, 0xffffff, x - radius * 0.26, y - 2, radius * 0.52, 4, white);
    }
  }
};

PrinceJS.RocketLauncherEffects.prototype.update = function (deltaSeconds, rockets) {
  if (this.destroyed) {
    return;
  }
  let dt = Math.max(0, Math.min(Number(deltaSeconds) || 0, 0.05));
  this.elapsed += dt;
  this.collectTime = Math.max(0, this.collectTime - dt);
  this.flashTime = Math.max(0, this.flashTime - dt);
  this.recoil = Math.max(0, this.recoil - dt * 13);
  this.light.clear();
  this.fire.clear();
  this.drawGround();

  let pose = this.getPose();
  this.weapon.clear();
  this.weapon.visible = this.collected && pose.visible;
  if (this.weapon.visible) {
    let x = pose.x - Math.round(this.recoil) * pose.direction;
    let y = pose.y;
    if (this.collectTime > 0) {
      let progress = 1 - this.collectTime / 0.42;
      let ease = 1 - Math.pow(1 - progress, 3);
      x = this.pickup.worldX + (x - this.pickup.worldX) * ease;
      y = this.pickup.worldY - 9 + (y - this.pickup.worldY + 9) * ease - Math.sin(progress * Math.PI) * 14;
    }
    this.weapon.x = Math.round(x);
    this.weapon.y = Math.round(y);
    this.weapon.scale.x = pose.direction;
    this.drawWeapon(this.weapon, this.collectTime < 0.12);
  } else {
    this.flashTime = this.recoil = 0;
  }

  this.updateRockets(dt, Array.isArray(rockets) ? rockets : []);
  this.updateParticles(dt);
  this.drawFlash();
  this.updateBlasts(dt);
};

PrinceJS.RocketLauncherEffects.prototype.destroy = function () {
  if (this.destroyed) {
    return;
  }
  this.destroyed = true;
  [this.ground, this.light, this.weapon, this.smoke, this.projectiles, this.debris, this.fire].forEach((graphics) =>
    graphics.destroy()
  );
  this.particles.length = 0;
  this.blasts.length = 0;
  this.trails = Object.create(null);
};
