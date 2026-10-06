"use strict";

// Death commands still belong to the original enemy. Only its drawing is replaced.
PrinceJS.EnemyDeathEffects = function (delegate) {
  this.delegate = delegate;
  this.game = delegate.game;
  this.level = delegate.level;
  this.physics = new PrinceJS.GorePhysics(this.level);
  this.layer = this.game.add.graphics(0, 0);
  this.layer.z = 21;
  this.parts = [];
  this.movingParts = [];
  this.deaths = [];
  this.replacedEnemies = [];
  this.variantOffset = Math.floor(Math.random() * 5);
  this.minigunKills = 0;
  this.supportTime = 0;
  this.destroyed = false;
};

PrinceJS.EnemyDeathEffects.prototype.random = function () {
  return Math.random();
};

PrinceJS.EnemyDeathEffects.prototype.pose = function (enemy) {
  let bounds = enemy.getCharBounds();
  let atlas = enemy.charName;
  let data = this.game.cache.getFrameData(atlas);
  let frame = data.getFrameByName(atlas + "-29");
  return {
    x: enemy.baseX + bounds.x + bounds.width / 2,
    y: enemy.baseY + enemy.charY + (enemy.charFdy || 0),
    room: enemy.room,
    direction: enemy.charFace === -1 ? -1 : 1,
    atlas: atlas,
    frame: frame,
    width: frame.width,
    height: frame.height
  };
};

PrinceJS.EnemyDeathEffects.prototype.kill = function (enemy, impact) {
  if (
    this.destroyed ||
    !enemy ||
    enemy.alive !== false ||
    enemy.charName === "skeleton" ||
    enemy.charName === "shadow" ||
    enemy.baseCharName === "shadow" ||
    this.replacedEnemies.some((entry) => entry.enemy === enemy)
  ) {
    return null;
  }
  let result;
  if (impact.weapon === "rocketLauncher" && this.spawnRocketDeath) {
    result = this.spawnRocketDeath(enemy, impact);
  } else if (impact.weapon === "minigun") {
    result = this.spawnMinigunDeath(enemy, impact);
  } else {
    return null;
  }
  // visible is intentionally untouched: shadow events and CMD_DIE still run normally.
  this.replacedEnemies.push({ enemy: enemy, alpha: enemy.alpha, swordAlpha: enemy.sword && enemy.sword.alpha });
  this.suppressNative(enemy);
  let death = { enemy: enemy, weapon: impact.weapon, variant: result.variant, parts: result.parts };
  this.deaths.push(death);
  return death;
};

PrinceJS.EnemyDeathEffects.prototype.suppressNative = function (enemy) {
  enemy.alpha = 0;
  if (enemy.sword) {
    enemy.sword.alpha = 0;
  }
  if (enemy.splash) {
    enemy.splash.visible = false;
  }
};

PrinceJS.EnemyDeathEffects.prototype.anatomy = function (pose, part, side) {
  let width = pose.width;
  let height = pose.height;
  let neck = Math.round(height * 0.2);
  let waist = Math.round(height * 0.6);
  let arm = Math.max(2, Math.round(width * 0.22));
  let half = Math.floor(width / 2);
  switch (part) {
    case "head":
      return { x: 0, y: 0, width: width, height: neck };
    case "torso":
      return { x: arm, y: neck, width: width - arm * 2, height: waist - neck };
    case "arm":
      // In death frame 29 the visible front arm bends across the coat, ending at the skin-coloured hand.
      return side
        ? { x: width - arm, y: neck + 2, width: arm, height: waist - neck - 2 }
        : {
            x: Math.round(width * 0.21),
            y: Math.round(height * 0.35),
            width: Math.round(width * 0.36),
            height: Math.round(height * 0.3)
          };
    case "leg":
      return { x: side ? half : 0, y: waist, width: side ? width - half : half, height: height - waist };
    case "upperBody":
      return { x: 0, y: 0, width: width, height: waist };
    case "lowerBody":
      return { x: 0, y: waist, width: width, height: height - waist };
    default:
      return { x: 0, y: 0, width: width, height: height };
  }
};

PrinceJS.EnemyDeathEffects.prototype.nativeSprite = function (pose, rect) {
  let sprite = this.game.make.sprite(0, 0, pose.atlas, pose.atlas + "-29");
  sprite.anchor.setTo(0.5, 0.5);
  if (rect) {
    sprite.crop(new Phaser.Rectangle(rect.x, rect.y, rect.width, rect.height));
  }
  return sprite;
};

PrinceJS.EnemyDeathEffects.prototype.createVisual = function (pose, options, rect) {
  // The already-sorted layer keeps newly killed guards behind foreground masonry and the HUD.
  let visual = this.game.make.graphics(0, 0);
  this.layer.addChild(visual);
  visual.scale.x = -pose.direction;
  if (options.part === "body" && options.missing && options.missing.length) {
    let missing = options.missing.map((name) => {
      let part = name.replace(/[01]$/, "");
      return this.anatomy(pose, part, name.endsWith("1") ? 1 : 0);
    });
    let columns = [
      ...new Set([0, pose.width, ...missing.flatMap((source) => [source.x, source.x + source.width])])
    ].sort((a, b) => a - b);
    let rows = [
      ...new Set([0, pose.height, ...missing.flatMap((source) => [source.y, source.y + source.height])])
    ].sort((a, b) => a - b);
    for (let x = 0; x < columns.length - 1; x++) {
      for (let y = 0; y < rows.length - 1; y++) {
        let source = { x: columns[x], y: rows[y], width: columns[x + 1] - columns[x], height: rows[y + 1] - rows[y] };
        if (
          missing.some(
            (removed) =>
              source.x >= removed.x &&
              source.x < removed.x + removed.width &&
              source.y >= removed.y &&
              source.y < removed.y + removed.height
          )
        ) {
          continue;
        }
        let sprite = this.nativeSprite(pose, source);
        sprite.x = source.x + source.width / 2 - pose.width / 2;
        sprite.y = source.y + source.height / 2 - pose.height / 2;
        visual.addChild(sprite);
      }
    }
  } else {
    let sprite = this.nativeSprite(pose, options.part === "body" ? null : rect);
    visual.addChild(sprite);
    visual.nativeBody = options.part === "body" ? sprite : null;
  }
  // Thin dark-red cut edges share the native guard palette instead of a separate art style.
  if (options.part !== "body" || (options.missing && options.missing.length)) {
    let cuts = this.game.make.graphics(0, 0);
    let wound = (x, y, width, height) => {
      cuts.beginFill(0x5d1118, 1);
      cuts.drawRect(x, y, width, height);
      cuts.endFill();
      cuts.beginFill(0xb3212e, 1);
      cuts.drawRect(x + (width > 2 ? 1 : 0), y, Math.max(1, width - (width > 2 ? 2 : 0)), 1);
      cuts.endFill();
    };
    if (options.part === "body") {
      options.missing.forEach((name) => {
        let part = name.replace(/[01]$/, "");
        let removed = this.anatomy(pose, part, name.endsWith("1") ? 1 : 0);
        if (part === "arm") {
          let x = name.endsWith("1") ? removed.x - 2 : removed.x + removed.width;
          wound(x - pose.width / 2, removed.y - pose.height / 2, 2, 8);
        } else {
          let y = part === "head" ? removed.height : removed.y;
          wound(removed.x - pose.width / 2, y - pose.height / 2, removed.width, 2);
        }
      });
    } else {
      let cutY = options.part === "head" || options.part === "upperBody" ? rect.height / 2 - 2 : -rect.height / 2;
      wound(-rect.width / 2, cutY, rect.width, 2);
    }
    visual.addChild(cuts);
  }
  return visual;
};

PrinceJS.EnemyDeathEffects.prototype.spawnPart = function (enemy, impact, options) {
  let pose = this.pose(enemy);
  let rect = this.anatomy(pose, options.part, options.side || 0);
  let piece = {
    x: options.x === undefined ? pose.x - pose.direction * (rect.x + rect.width / 2 - pose.width / 2) : options.x,
    y: options.y === undefined ? pose.y - pose.height + rect.y + rect.height / 2 : options.y,
    vx: options.vx || 0,
    vy: options.vy || 0,
    room: pose.room,
    radius: options.part === "body" ? 6 : Math.max(2, Math.min(6, rect.width / 2)),
    rotation: options.rotation || 0,
    spin: options.spin || 0,
    bounceX: options.bounceX === undefined ? 0.22 : options.bounceX,
    bounceY: options.bounceY === undefined ? 0.18 : options.bounceY,
    friction: options.friction === undefined ? 175 : options.friction,
    part: options.part,
    side: options.side || 0,
    missing: options.missing || [],
    width: rect.width,
    height: rect.height,
    atlas: pose.atlas,
    nativeDirection: pose.direction,
    age: 0,
    bloodTime: 0,
    bleed: options.bleed !== false,
    settled: false,
    grounded: false,
    bounces: 0,
    sprite: this.createVisual(pose, options, rect)
  };
  this.parts.push(piece);
  this.movingParts.push(piece);
  this.placeVisual(piece);
  return piece;
};

PrinceJS.EnemyDeathEffects.prototype.spawnMinigunDeath = function (enemy, impact) {
  let pose = this.pose(enemy);
  let direction = impact.direction === -1 ? -1 : 1;
  let variant = (this.variantOffset + this.minigunKills++) % 5;
  let parts = [];
  let jitter = this.random() * 32;
  let spawn = (options) => {
    parts.push(this.spawnPart(enemy, impact, options));
  };
  let name;
  if (variant === 0) {
    name = "face-kick";
    spawn({ part: "body", vx: direction * (270 + jitter), vy: -126, spin: direction * 6.5 });
  } else if (variant === 1) {
    name = "shoulder-tear";
    spawn({ part: "body", missing: ["arm0"], vx: direction * (172 + jitter), vy: -75, spin: direction * 5.2 });
    spawn({ part: "arm", side: 0, vx: direction * (300 + jitter), vy: -154, spin: -direction * 19 });
  } else if (variant === 2) {
    name = "waist-split";
    spawn({ part: "upperBody", vx: direction * (208 + jitter), vy: -124, spin: direction * 9 });
    spawn({ part: "lowerBody", vx: direction * (98 + jitter), vy: -58, spin: -direction * 7 });
  } else if (variant === 3) {
    name = "head-spin";
    spawn({ part: "body", missing: ["head"], vx: direction * (158 + jitter), vy: -70, spin: direction * 4.7 });
    spawn({ part: "head", vx: direction * (288 + jitter), vy: -178, spin: -direction * 17 });
  } else {
    name = "knee-collapse";
    spawn({ part: "body", missing: ["leg0"], vx: direction * (76 + jitter), vy: -40, spin: direction * 8 });
    spawn({ part: "leg", side: 0, vx: -direction * (112 + jitter), vy: -102, spin: direction * 14 });
  }
  if (this.delegate.bloodEffects) {
    this.delegate.bloodEffects.burst(pose.x, variant === 0 ? pose.y - pose.height + 5 : impact.y, pose.room, {
      direction: direction,
      strength: variant === 0 ? 1.3 : 1,
      count: variant === 0 ? 18 : 12,
      vx: direction * 70,
      vy: -30
    });
  }
  return { variant: name, parts: parts };
};

PrinceJS.EnemyDeathEffects.prototype.blood = function (piece, contact) {
  let blood = this.delegate.bloodEffects;
  if (!blood || !piece.bleed) {
    return;
  }
  blood.burst(contact ? contact.x : piece.x, contact ? contact.y - 1 : piece.y, contact ? contact.room : piece.room, {
    direction: piece.vx < 0 ? -1 : 1,
    strength: contact ? 0.6 : 0.22,
    count: contact ? 7 : 1,
    vx: piece.vx * 0.18,
    vy: contact ? -32 : 8
  });
};

PrinceJS.EnemyDeathEffects.prototype.settle = function (piece) {
  piece.settled = true;
  piece.vx = piece.vy = piece.spin = 0;
  if (piece.part === "body" && !piece.missing.length) {
    let frame = this.game.cache.getFrameData(piece.atlas).getFrameByName(piece.atlas + "-35");
    if (frame) {
      let floorY = piece.y + piece.radius;
      piece.radius = frame.height / 2;
      piece.y = floorY - piece.radius;
      piece.width = frame.width;
      piece.height = frame.height;
      piece.sprite.nativeBody.frameName = piece.atlas + "-35";
      piece.rotation = 0;
    }
  } else {
    let orientation = piece.rotation < 0 ? -1 : 1;
    piece.rotation = orientation * Math.PI * 0.5;
  }
  this.placeVisual(piece);
};

PrinceJS.EnemyDeathEffects.prototype.placeVisual = function (piece) {
  piece.sprite.x = Math.round(piece.x);
  piece.sprite.y = Math.round(piece.y);
  piece.sprite.rotation = piece.rotation;
};

PrinceJS.EnemyDeathEffects.prototype.update = function (delta) {
  if (this.destroyed) {
    return;
  }
  delta = Math.max(0, Math.min(Number(delta) || 0, 0.05));
  this.replacedEnemies.forEach((entry) => this.suppressNative(entry.enemy));
  this.supportTime += delta;
  if (this.supportTime >= 0.3) {
    this.supportTime = 0;
    // Only a support probe is needed for sleeping pieces after a rocket removes their floor.
    this.parts.forEach((piece) => {
      if (!piece.settled) {
        return;
      }
      let result = this.physics.step(piece, 0, { gravity: 0 });
      if (!result.supported) {
        piece.settled = false;
        piece.grounded = false;
        this.movingParts.push(piece);
      }
    });
  }
  this.movingParts = this.movingParts.filter((piece) => {
    let previousVx = piece.vx;
    let previousVy = piece.vy;
    let result = this.physics.step(piece, delta, {
      gravity: 340,
      bounceX: piece.bounceX,
      bounceY: piece.bounceY,
      friction: piece.friction
    });
    piece.age += delta;
    piece.bloodTime += delta;
    piece.rotation += piece.spin * delta;
    if (result.grounded) {
      piece.spin *= Math.max(0, 1 - delta * 9);
    }
    if (piece.age < 1.4 && piece.bloodTime >= 0.1 && Math.abs(piece.vx) + Math.abs(piece.vy) > 20) {
      piece.bloodTime = 0;
      this.blood(piece);
    }
    if (result.contacts.length && Math.abs(previousVx) + Math.abs(previousVy) > 70 && piece.bounces < 4) {
      piece.bounces++;
      this.blood(piece, result.contacts[0]);
      piece.spin *= -0.45;
    }
    if (result.grounded && Math.abs(piece.vx) < 4 && Math.abs(piece.vy) < 1) {
      this.settle(piece);
      return false;
    }
    this.placeVisual(piece);
    return true;
  });
};

PrinceJS.EnemyDeathEffects.prototype.destroy = function () {
  if (this.destroyed) {
    return;
  }
  this.destroyed = true;
  this.parts.forEach((piece) => piece.sprite.destroy(true));
  this.layer.destroy(true);
  this.replacedEnemies.forEach((entry) => {
    entry.enemy.alpha = entry.alpha;
    if (entry.enemy.sword) {
      entry.enemy.sword.alpha = entry.swordAlpha;
    }
  });
  this.parts = [];
  this.movingParts = [];
  this.deaths = [];
  this.replacedEnemies = [];
};
