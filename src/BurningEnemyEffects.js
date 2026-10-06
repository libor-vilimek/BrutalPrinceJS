"use strict";

// Fire kills combat immediately; the native guard then spends five seconds in a
// separate death performance. World-space feet use the same floor/link geometry
// as flying body parts, so a panicking guard can run straight off an actual edge.
PrinceJS.BurningEnemyEffects = function (delegate) {
  this.delegate = delegate;
  this.game = delegate.game;
  this.level = delegate.level;
  this.physics = new PrinceJS.GorePhysics(this.level);
  this.layer = this.game.add.graphics(0, 0);
  this.layer.z = 21;
  this.burns = [];
  this.movingBurns = [];
  this.supportTime = 0;
  this.destroyed = false;
};

PrinceJS.BurningEnemyEffects.DURATION = 5;

PrinceJS.BurningEnemyEffects.prototype = {
  random: function () {
    return Math.random();
  },

  ignite: function (enemy, impact = {}) {
    if (
      this.destroyed ||
      !enemy ||
      !enemy.alive ||
      enemy.burningDeath ||
      ["skeleton", "shadow"].includes(enemy.charName) ||
      ["skeleton", "shadow"].includes(enemy.baseCharName) ||
      !this.level.rooms[enemy.room]
    ) {
      return null;
    }
    let bounds = enemy.getCharBounds();
    let feet = enemy.baseY + enemy.charY + (enemy.charFdy || 0);
    let direction = impact.direction === -1 ? -1 : impact.direction === 1 ? 1 : enemy.charFace === -1 ? -1 : 1;
    let visual = this.game.make.graphics(0, 0);
    let smoke = this.game.make.graphics(0, 0);
    let body = this.game.make.sprite(0, 0, enemy.charName, enemy.charName + "-13");
    body.anchor.setTo(0.5, 1);
    let flames = this.game.make.graphics(0, 0);
    visual.addChild(smoke);
    visual.addChild(body);
    visual.addChild(flames);
    this.layer.addChild(visual);
    let burn = {
      enemy: enemy,
      weapon: impact.weapon || "fire",
      x: enemy.baseX + bounds.x + bounds.width / 2,
      y: feet - 3,
      radius: 3,
      vx: direction * 76,
      vy: 0,
      room: enemy.room,
      direction: direction,
      age: 0,
      phase: "burning",
      turnTime: 0.75 + this.random() * 0.3,
      turns: 0,
      speed: 70 + this.random() * 16,
      height: bounds.height,
      grounded: false,
      settled: false,
      trap: null,
      alpha: enemy.alpha,
      swordAlpha: enemy.sword && enemy.sword.alpha,
      frames: this.game.cache.getFrameData(enemy.charName),
      body: body,
      visual: visual,
      smoke: smoke,
      flames: flames
    };
    // die() owns the health signal; CMD_DIE owns the native death/vizier events.
    // The actor tick is suspended below, so its sequence cannot repeat CMD_DIE.
    enemy.die();
    if (typeof enemy.CMD_DIE === "function") {
      enemy.CMD_DIE({});
    } else if (typeof enemy.proceedOnDead === "function") {
      enemy.proceedOnDead();
    }
    enemy.opponent = null;
    enemy.startFight = false;
    enemy.charXVel = enemy.charYVel = 0;
    enemy.burningDeath = burn;
    this.burns.push(burn);
    this.movingBurns.push(burn);
    this.suppressNative(burn);
    this.render(burn);
    return burn;
  },

  suppressNative: function (burn) {
    let enemy = burn.enemy;
    enemy.alpha = 0;
    if (enemy.sword) {
      enemy.sword.alpha = 0;
    }
    if (enemy.splash) {
      enemy.splash.visible = false;
    }
  },

  reverse: function (burn) {
    burn.direction *= -1;
    burn.turnTime = 0.65 + this.random() * 0.65;
    burn.turns++;
  },

  bodyBlocked: function (burn, delta) {
    let feet = burn.y + burn.radius;
    let probe = {
      x: burn.x + burn.direction * (7 + burn.speed * delta),
      y: feet - burn.height / 2,
      room: burn.room,
      radius: burn.height / 2
    };
    let left = Math.min(burn.x, probe.x) - 5;
    let right = Math.max(burn.x, probe.x) + 5;
    return this.physics
      .surfaces(probe)
      .some(
        (surface) =>
          ["wall", "barrier"].includes(surface.kind) &&
          right > surface.left &&
          left < surface.right &&
          (burn.direction > 0 ? surface.left >= burn.x - 5 : surface.right <= burn.x + 5) &&
          feet - 1 > surface.top &&
          feet - burn.height + 3 < surface.bottom
      );
  },

  trapAt: function (burn, result) {
    if (burn.trap) {
      return;
    }
    let room = this.level.rooms[burn.room];
    if (!room) {
      return;
    }
    let feet = burn.y + burn.radius;
    let row = Math.floor((feet - room.y * PrinceJS.ROOM_HEIGHT) / PrinceJS.BLOCK_HEIGHT);
    let column = Math.floor((burn.x - room.x * PrinceJS.ROOM_WIDTH) / PrinceJS.BLOCK_WIDTH);
    let tile = this.level.getTileAt(column, row, burn.room);
    if (tile.element === PrinceJS.Level.TILE_SPIKES && tile.mortal !== false && result.grounded) {
      if (tile.raise) {
        tile.raise();
      }
      burn.trap = "impaled";
    } else {
      for (let offset of [0, 1]) {
        let chopper = this.level.getTileAt(column + offset, row, burn.room);
        let blade = room.x * PrinceJS.ROOM_WIDTH + (column + offset) * PrinceJS.BLOCK_WIDTH + 16;
        if (
          chopper.element === PrinceJS.Level.TILE_CHOPPER &&
          chopper.step >= 1 &&
          chopper.step <= 3 &&
          Math.abs(blade - burn.x) <= 9
        ) {
          burn.trap = "halved";
          tile = chopper;
          if (tile.showBlood) {
            tile.showBlood();
          }
          break;
        }
      }
    }
    if (!burn.trap) {
      return;
    }
    burn.vx = 0;
    burn.enemy.action = burn.trap === "impaled" ? "impale" : "halve";
    if (this.delegate.bloodEffects) {
      this.delegate.bloodEffects.burst(burn.x, feet - 12, burn.room, {
        direction: burn.direction,
        count: 12,
        strength: 0.65,
        vx: burn.direction * 22,
        vy: -38
      });
    }
  },

  touchSupport: function (burn, result) {
    if (!result.grounded || burn.phase !== "burning") {
      return;
    }
    let room = this.level.rooms[burn.room];
    if (!room) {
      return;
    }
    let column = Math.floor((burn.x - room.x * PrinceJS.ROOM_WIDTH) / PrinceJS.BLOCK_WIDTH);
    let row = Math.floor((burn.y + burn.radius - room.y * PrinceJS.ROOM_HEIGHT) / PrinceJS.BLOCK_HEIGHT);
    let tile = this.level.getTileAt(column, row, burn.room);
    if (tile.element === PrinceJS.Level.TILE_LOOSE_BOARD && tile.shake) {
      tile.shake(true);
    } else if (
      [PrinceJS.Level.TILE_RAISE_BUTTON, PrinceJS.Level.TILE_DROP_BUTTON].includes(tile.element) &&
      tile.push
    ) {
      tile.push();
    }
  },

  syncActor: function (burn, frame) {
    let enemy = burn.enemy;
    let room = this.level.rooms[burn.room];
    if (room) {
      enemy.room = burn.room;
      enemy.baseX = room.x * PrinceJS.ROOM_WIDTH;
      enemy.baseY = room.y * PrinceJS.ROOM_HEIGHT + 3;
      enemy.charX = ((burn.x - enemy.baseX) * 140) / PrinceJS.ROOM_WIDTH;
      enemy.charY = burn.y + burn.radius - enemy.baseY;
      enemy.charBlockX = Math.max(0, Math.min(9, Math.floor((burn.x - enemy.baseX) / PrinceJS.BLOCK_WIDTH)));
      enemy.charBlockY = Math.max(0, Math.min(2, Math.floor(enemy.charY / PrinceJS.BLOCK_HEIGHT)));
    }
    enemy.charFrame = frame;
    enemy.charFace = burn.direction;
    enemy.charFdy = 0;
    enemy.charXVel = enemy.charYVel = 0;
    enemy.x = burn.x;
    enemy.y = burn.y + burn.radius;
    this.suppressNative(burn);
  },

  rect: function (graphics, color, x, y, width, height, alpha = 1) {
    graphics.beginFill(color, alpha);
    graphics.drawRect(Math.round(x), Math.round(y), width, height);
    graphics.endFill();
  },

  flame: function (graphics, x, y, size, phase, alpha) {
    let height = Math.round(size + Math.sin(phase) * size * 0.25);
    this.rect(graphics, 0xd54e1c, x - 3, y - height + 2, 6, height, alpha);
    this.rect(graphics, 0xffa52b, x - 2, y - height, 4, height, alpha);
    this.rect(graphics, 0xffdc68, x - 1, y - height + 3, 2, Math.max(2, height - 3), alpha);
    this.rect(graphics, 0xfff8c0, x, y - 3, 1, 3, alpha);
  },

  render: function (burn) {
    let collapsing = burn.age >= PrinceJS.BurningEnemyEffects.DURATION - 0.35;
    let finished = burn.phase === "charred";
    let frame;
    if (burn.trap) {
      frame = burn.trap === "impaled" ? 27 : 28;
    } else if (finished) {
      frame = 35;
    } else if (collapsing) {
      frame = [29, 30, 31, 32, 33][Math.min(4, Math.floor((burn.age - 4.65) / 0.07))];
    } else {
      frame = burn.grounded ? [13, 14, 15, 14][Math.floor(burn.age * 15) % 4] : 23;
    }
    // Jaffar has no spike/chopper frames in the original atlas. Keep his own
    // dying/prone artwork for those traps instead of requesting a missing frame.
    if (!burn.frames.getFrameByName(burn.enemy.charName + "-" + frame)) {
      frame = finished ? 35 : 29;
    }
    burn.body.frameName = burn.enemy.charName + "-" + frame;
    burn.body.scale.x = -burn.direction;
    burn.body.rotation = finished || burn.trap ? 0 : burn.direction * (0.08 + Math.sin(burn.age * 25) * 0.035);
    burn.body.tint = finished ? 0x51413a : Math.floor(burn.age * 17) % 3 === 0 ? 0xffd389 : 0xd99561;
    burn.visual.x = Math.round(burn.x);
    burn.visual.y = Math.round(burn.y + burn.radius);
    burn.visual.visible = burn.enemy.visible;
    burn.smoke.clear();
    burn.flames.clear();
    burn.flames.visible = !finished;
    if (!finished) {
      let height = collapsing && !burn.trap ? Math.max(10, burn.height * (1 - (burn.age - 4.65) * 1.7)) : burn.height;
      let phase = burn.age * 22;
      // Leave gaps between the tongues so the actual guard's face, coat and
      // alternating legs remain readable through the same pixel fire palette.
      for (let i = 0; i < 7; i++) {
        let x = (i % 3) * 5 - 5 + Math.sin(phase + i * 3) * 1.5;
        let y = -3 - Math.floor(i / 3) * (height / 3);
        this.flame(burn.flames, x, y, 5 + (i % 3) * 2, phase + i * 2, 0.72 + (i % 2) * 0.22);
      }
      for (let i = 0; i < 5; i++) {
        let rise = ((burn.age * 26 + i * 11) % 44) / 44;
        let x = Math.sin(i * 4 + burn.age * 3) * (3 + rise * 7) - burn.direction * rise * 7;
        this.rect(burn.smoke, 0x393333, x, -height - rise * 33, 3 + Math.floor(rise * 3), 3, (1 - rise) * 0.48);
        this.rect(burn.flames, i % 2 ? 0xffdd68 : 0xff9334, x, -height + 5 - rise * 24, 1, 2, 1 - rise);
      }
    }
    this.syncActor(burn, frame);
  },

  step: function (burn, delta) {
    burn.age += delta;
    if (burn.age + 0.00001 >= PrinceJS.BurningEnemyEffects.DURATION) {
      burn.phase = "charred";
    } else if (!burn.trap && burn.age >= PrinceJS.BurningEnemyEffects.DURATION - 0.35) {
      burn.phase = "collapsing";
    }
    if (burn.phase === "burning" && !burn.trap) {
      burn.turnTime -= delta;
      if (burn.turnTime <= 0 || this.bodyBlocked(burn, delta)) {
        this.reverse(burn);
      }
      burn.vx = burn.direction * burn.speed * (burn.grounded ? 1 : 0.7);
    } else if (burn.trap) {
      burn.vx = 0;
    }
    let result = this.physics.step(burn, delta, {
      gravity: 340,
      bounceX: 0,
      bounceY: 0,
      friction: burn.phase === "burning" && !burn.trap ? 0 : 245
    });
    if (result.invalid) {
      burn.phase = "charred";
      burn.settled = true;
      this.render(burn);
      return false;
    }
    if (burn.phase === "burning" && !burn.trap && result.contacts.some((contact) => contact.normalX)) {
      this.reverse(burn);
    }
    this.touchSupport(burn, result);
    this.trapAt(burn, result);
    if (burn.phase === "charred" && result.grounded && Math.abs(burn.vx) < 1) {
      burn.vx = burn.vy = 0;
      burn.settled = true;
    }
    this.render(burn);
    return !burn.settled;
  },

  update: function (delta) {
    if (this.destroyed) {
      return;
    }
    delta = Math.max(0, Math.min(Number(delta) || 0, 0.05));
    this.supportTime += delta;
    if (this.supportTime >= 0.3) {
      this.supportTime = 0;
      for (let burn of this.burns) {
        if (burn.settled && !this.physics.step(burn, 0, { gravity: 0 }).supported) {
          burn.settled = false;
          burn.grounded = false;
          this.movingBurns.push(burn);
        }
      }
    }
    this.movingBurns = this.movingBurns.filter((burn) => this.step(burn, delta));
  },

  destroy: function () {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    for (let burn of this.burns) {
      let enemy = burn.enemy;
      delete enemy.burningDeath;
      enemy.alpha = burn.alpha;
      if (enemy.sword) {
        enemy.sword.alpha = burn.swordAlpha;
      }
      // A retained actor resumes after its native death command, not before it.
      enemy.action = burn.trap === "impaled" ? "impale" : burn.trap === "halved" ? "halve" : "dropdead";
      enemy._seqpointer = burn.trap === "impaled" ? 5 : burn.trap === "halved" ? 3 : 9;
    }
    this.layer.destroy(true);
    this.burns = [];
    this.movingBurns = [];
  }
};

PrinceJS.BurningEnemyEffects.prototype.constructor = PrinceJS.BurningEnemyEffects;
