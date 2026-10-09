"use strict";

// A separate emergency action: it never selects a weapon or deals weapon damage.
PrinceJS.Kick = function (delegate) {
  this.delegate = delegate;
  this.game = delegate.game;
  this.level = delegate.level;
  this.kid = delegate.kid;
  this.key = delegate.kickKey;
  this.physics = new PrinceJS.GorePhysics(this.level);
  this.effects = new PrinceJS.KickEffects(this.game, this.kid);
  this.actionStage = "hidden";
  this.elapsed = this.cooldown = this.pending = this.fastTime = 0;
  this.enemies = new Set();
  this.launchCount = Math.floor(Math.random() * 5);
};

PrinceJS.Kick.RANGE = 32;
PrinceJS.Kick.NEAR = 144;
PrinceJS.Kick.ANIMATION_SPEED = 0.8;
PrinceJS.Kick.DURATION = 0.84 / PrinceJS.Kick.ANIMATION_SPEED;
PrinceJS.Kick.COOLDOWN = 1.02 / PrinceJS.Kick.ANIMATION_SPEED;
PrinceJS.Kick.RECOVERY = 2;
PrinceJS.Kick.TOPPLE_DURATION = 0.38;

PrinceJS.Kick.prototype = {
  // Share the whip's tested world/foot geometry, including gates and room links.
  position: PrinceJS.Whip.prototype.position,
  tileAt: PrinceJS.Whip.prototype.tileAt,
  lineClear: PrinceJS.Whip.prototype.lineClear,
  syncEnemy: PrinceJS.Whip.prototype.syncEnemy,

  random: function () {
    return Math.random();
  },

  handleMeleeHit: function () {
    return (
      !this.destroyed &&
      this.actionStage === "kicking" &&
      this.elapsed < PrinceJS.Kick.DURATION &&
      this.kid.alive &&
      this.kid.active &&
      this.kid.visible &&
      this.kid.action === "stand" &&
      !this.kid.inFallDown &&
      this.kid.specialAction &&
      this.kid.specialAction.owner === this
    );
  },

  canTarget: function (enemy) {
    return (
      enemy &&
      enemy.alive &&
      enemy.active &&
      enemy.visible &&
      enemy.health > 0 &&
      !enemy.burningDeath &&
      !enemy.whipState &&
      !enemy.kickState &&
      !enemy.inFallDown &&
      !enemy.inJumpUp &&
      this.level.rooms[enemy.room] &&
      !["skeleton", "shadow"].includes(enemy.baseCharName || enemy.charName)
    );
  },

  canPrepare: function () {
    let kid = this.kid;
    return (
      kid.alive &&
      kid.active &&
      kid.visible &&
      !kid.inFallDown &&
      !kid.inJumpUp &&
      (!kid.specialAction || kid.specialAction.type !== "jetpack") &&
      !/dead|impale|halve|climbstairs|jump|fall/.test(kid.action)
    );
  },

  threatOrigin: function () {
    let kid = this.kid;
    let foot = this.position(kid);
    if (["hang", "hangstraight", "climbup", "climbdown"].includes(kid.action)) {
      // Before CHY the climbing root is below the destination, afterwards it is on it.
      let raised =
        kid.action === "climbup" &&
        kid.anims.sequence.climbup.slice(0, kid._seqpointer).some((command) => command.cmd === 250 && command.p1 < 0);
      let row = Math.floor(kid.charY / PrinceJS.BLOCK_HEIGHT) - (raised ? 0 : 1);
      foot.y = kid.baseY + PrinceJS.Utils.convertBlockYtoY(row);
      foot.x += kid.charFace * 12;
      if (!this.physics.resolveRoom(foot)) {
        return null;
      }
    }
    return foot;
  },

  targets: function (origin, range, forward) {
    if (!origin) {
      return [];
    }
    return (this.delegate.enemies || [])
      .filter((enemy) => {
        if (!this.canTarget(enemy)) {
          return false;
        }
        let foot = this.position(enemy);
        let dx = (foot.x - origin.x) * this.kid.charFace;
        return (
          Math.abs(foot.y - origin.y) < 14 &&
          Math.abs(dx) <= range &&
          (!forward || dx >= -8) &&
          this.lineClear(
            { x: origin.x, y: origin.y - 25, room: origin.room },
            { x: foot.x, y: foot.y - 25, room: foot.room }
          )
        );
      })
      .sort((a, b) => Math.abs(this.position(a).x - origin.x) - Math.abs(this.position(b).x - origin.x));
  },

  request: function () {
    if (!this.destroyed && this.cooldown === 0 && this.canPrepare()) {
      this.pending = 0.65;
      this.prepare(0);
    }
  },

  prepare: function (dt) {
    let kid = this.kid;
    if (!this.canPrepare()) {
      return;
    }
    if (!this.targets(this.threatOrigin(), PrinceJS.Kick.NEAR, false).length) {
      // An empty kick is still a proper visible action. Only a nearby threat
      // permits skipping weapon sequences or accelerating native animations.
      if (
        !kid.specialAction &&
        !kid.pickupPotion &&
        !kid.pickupSword &&
        (["stand", "startrun", "running", "runstop", "crawl"].includes(kid.action) ||
          /^step\d+$/.test(kid.action) ||
          (kid.action === "stoop" && kid.charFrame === 109))
      ) {
        this.begin();
      }
      return;
    }
    let action = kid.specialAction;
    if (action) {
      // Complete the opening's actual pickups before cancelling its visual sequence.
      if (action.owner.actionStage === "intro" && action.owner.updateIntro) {
        action.owner.updateIntro(PrinceJS.TwinTorches.INTRO_DURATION);
      } else if (action.owner.cancelAction) {
        action.owner.cancelAction();
      }
      if (kid.specialAction) {
        return;
      }
    }
    if (["hang", "hangstraight"].includes(kid.action)) {
      kid.climbup();
    }
    // Run the real animation commands faster, preserving CHX/CHY, room changes,
    // facing, pickup effects and masks. Never teleport to an assumed ledge.
    const finishing =
      /^(climbup|climbdown|climbfail|standup|turn|runturn|turnrun|bump|blocked|stabbed|drinkpotion|stoop)$/;
    this.fastTime += dt * 8;
    while (finishing.test(kid.action) && this.fastTime >= 0.08 && kid.alive && !kid.inFallDown) {
      this.fastTime -= 0.08;
      kid.updateBehaviour();
      kid.processCommand();
      kid.checkSpikes();
      kid.checkChoppers();
      kid.checkButton();
      kid.checkFloor();
      kid.checkRoomChange();
      kid.updateCharPosition();
      kid.maskAndCrop();
      // A crouch held by Down is a valid launch pose, not an endless animation.
      if (kid.action === "stoop" && kid.charFrame === 109 && !kid.pickupPotion) {
        break;
      }
    }
    if (kid.pickupPotion || kid.pickupSword || /climb|hang/.test(kid.action) || !this.canPrepare()) {
      return;
    }
    if (!finishing.test(kid.action) || (kid.action === "stoop" && kid.charFrame === 109)) {
      this.begin();
    }
  },

  begin: function () {
    let kid = this.kid;
    if (!kid.beginSpecialAction(this, "kick")) {
      return false;
    }
    kid.action = "stand";
    kid.actionCode = 0;
    kid.setSpecialActionFrame(15);
    kid.updateBlockXY();
    this.actionStage = "kicking";
    this.elapsed = this.pending = this.fastTime = 0;
    this.cooldown = PrinceJS.Kick.COOLDOWN;
    this.chain = new Set();
    this.game.sound.play("StabAir", 0.35);
    this.effects.update(0, this);
    return true;
  },

  update: function (delta) {
    if (this.destroyed) {
      return;
    }
    let dt = Math.max(0, Math.min(Number(delta) || 0, 0.05));
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.pending = Math.max(0, this.pending - dt);
    for (let enemy of this.enemies) {
      if (!enemy.alive || enemy.burningDeath || enemy.exists === false) {
        this.releaseEnemy(enemy);
      } else {
        this.advanceEnemy(enemy, dt);
      }
    }
    if (this.actionStage === "kicking") {
      this.elapsed += dt;
      if (
        this.elapsed >= PrinceJS.Kick.DURATION ||
        !this.canPrepare() ||
        !this.kid.specialAction ||
        this.kid.specialAction.owner !== this ||
        this.kid.action !== "stand"
      ) {
        this.cancelAction();
      } else {
        this.sweep();
      }
    } else if (
      this.cooldown === 0 &&
      (this.pending > 0 || (this.key && this.key.isDown) || this.game.touchControls?.isDown(67))
    ) {
      this.prepare(dt);
    } else {
      this.fastTime = 0;
    }
    this.effects.update(dt, this);
  },

  cancelAction: function () {
    this.kid.endSpecialAction(this);
    this.actionStage = "hidden";
    this.effects.hide();
  },

  sweep: function () {
    // Both arcs share one direct hit, including targets arriving later in the spin.
    if (this.chain.size > 0) {
      return;
    }
    let time = this.elapsed * PrinceJS.Kick.ANIMATION_SPEED;
    let front = time >= 0.14 && time <= 0.34;
    let back = time >= 0.39 && time <= 0.65;
    if (!front && !back) {
      return;
    }
    let origin = this.position(this.kid);
    for (let enemy of this.targets(origin, PrinceJS.Kick.RANGE, false)) {
      let dx = this.position(enemy).x - origin.x;
      if (dx * this.kid.charFace >= 0 !== front || this.chain.has(enemy)) {
        continue;
      }
      this.knockDown(enemy, Math.sign(dx) || this.kid.charFace, 1, this.chain);
      break;
    }
  },

  knockDown: function (enemy, direction, strength, chain, secondary = false) {
    if (!this.canTarget(enemy) || chain.has(enemy) || chain.size >= (secondary ? 2 : 1)) {
      return;
    }
    chain.add(enemy);
    // Stratified launch styles guarantee variety even in a tightly packed crowd;
    // jitter keeps the same guard from performing the same stunt every time.
    const styles = [
      { speed: 390, lift: 120, spin: 5 }, // low flying carpet
      { speed: 190, lift: 280, spin: -9 }, // surprised backflip
      { speed: 305, lift: 210, spin: 12 }, // cartwheel
      { speed: 250, lift: 165, spin: -5 },
      { speed: 440, lift: 175, spin: 8 }
    ];
    let style = secondary ? { speed: 65, lift: 0, spin: 0 } : styles[this.launchCount++ % styles.length];
    let foot = this.position(enemy);
    let state = {
      owner: this,
      phase: secondary ? "toppling" : "airborne",
      secondary,
      elapsed: 0,
      position: foot,
      direction,
      chain,
      launchFloor: foot.y,
      recovery: PrinceJS.Kick.RECOVERY + this.random() * 0.45,
      alpha: enemy.alpha,
      bounceCount: 0,
      impactTime: 0,
      trailTime: 0,
      x: foot.x,
      y: foot.y - 20,
      room: foot.room,
      radius: 18,
      vx: direction * style.speed * (0.88 + this.random() * 0.24) * strength,
      vy: -style.lift * (0.9 + this.random() * 0.2),
      spin: direction * style.spin,
      rotation: 0,
      friction: secondary ? 600 : 330 + this.random() * 240,
      bounceX: secondary ? 0 : 0.35 + this.random() * 0.2
    };
    enemy.kickState = state;
    enemy.action = "stand";
    enemy.actionCode = 0;
    enemy.charXVel = enemy.charYVel = 0;
    enemy.swordDrawn = enemy.charSword = false;
    enemy.sword.visible = false;
    enemy.opponent = this.kid;
    this.enemies.add(enemy);
    if (secondary && enemy.charFace === direction) {
      enemy.changeFace();
    }
    if (!secondary) {
      this.effects.launch(enemy, state);
    }
    this.syncEnemy(enemy, foot, secondary ? 16 : 31);
    enemy.alpha = secondary ? state.alpha : 0;
    if (this.delegate.bloodEffects) {
      this.delegate.bloodEffects.hit(enemy, { weapon: "kick", x: foot.x, y: foot.y - 27, room: foot.room, direction });
    }
    this.effects.impact(foot.x, foot.y - 24, direction);
    // One per direct sweep, not a noisy sound for every domino victim.
    if (chain.size === 1) {
      this.game.sound.play("BumpIntoWallSoft", 0.45);
    }
  },

  recover: function (enemy, floorY) {
    let state = enemy.kickState;
    state.phase = "recovering";
    state.elapsed = 0;
    state.position = { x: state.x, y: floorY, room: state.room };
    this.effects.release(enemy, state);
    enemy.alpha = state.alpha;
    enemy.action = "stand";
    enemy.actionCode = 0;
    enemy.inFallDown = false;
    enemy.charXVel = enemy.charYVel = 0;
    this.syncEnemy(enemy, state.position, 35);
    this.effects.dust(state.x, floorY);
  },

  updateEnemyActor: function (enemy) {
    // Motion runs at render speed. The native 80 ms loop only yields combat AI.
    if (!enemy.kickState || enemy.kickState.owner !== this) {
      return false;
    }
    if (this.destroyed || !enemy.alive || enemy.burningDeath || !this.level.rooms[enemy.room]) {
      this.releaseEnemy(enemy);
      return false;
    }
    enemy.updateSplash();
    enemy.sword.visible = false;
    return true;
  },

  advanceEnemy: function (enemy, dt) {
    let state = enemy.kickState;
    state.elapsed += dt;
    state.impactTime = Math.max(0, state.impactTime - dt);
    if (state.phase === "recovering") {
      let frames = [35, 33, 31, 29, 24, 16];
      let progress = Math.max(0, (state.elapsed - state.recovery + 0.6) / 0.6);
      this.syncEnemy(enemy, state.position, frames[Math.min(5, Math.floor(progress * 6))]);
      enemy.checkSpikes();
      enemy.checkChoppers();
      enemy.checkButton();
      if (!enemy.alive || enemy.burningDeath) {
        this.releaseEnemy(enemy);
        return;
      }
      let support = this.tileAt(state.position.x, state.position.y - 2, state.position.room);
      if (support && !support.tile.isWalkable()) {
        state.phase = state.secondary ? "toppling" : "airborne";
        state.elapsed = 0;
        state.x = state.position.x;
        state.y = state.position.y - 20;
        state.room = state.position.room;
        state.vx = state.vy = 0;
        state.launchFloor = state.position.y;
        state.rotation = 0;
        if (!state.secondary) {
          this.effects.launch(enemy, state);
          enemy.alpha = 0;
        }
      } else if (state.elapsed >= state.recovery) {
        this.releaseEnemy(enemy);
        enemy.action = "stand";
        enemy.processCommand();
        enemy.startFight = true;
      }
      return;
    }
    // Short sweeps catch thin gates and body-to-body hits at the fastest launch.
    let steps = Math.max(1, Math.ceil(((Math.abs(state.vx) + Math.abs(state.vy)) * dt) / 3));
    for (let i = 0; i < steps && enemy.kickState === state && state.phase !== "recovering"; i++) {
      let beforeSpeed = Math.abs(state.vx) + Math.abs(state.vy);
      let result = this.physics.step(state, dt / steps, {
        gravity: 620,
        bounceX: state.bounceX,
        bounceY: !state.secondary && state.bounceCount < 1 ? 0.22 : 0,
        friction: state.friction
      });
      if (result.invalid || !this.level.rooms[state.room]) {
        enemy.die("falldead");
        this.releaseEnemy(enemy);
        return;
      }
      state.rotation += (state.spin * dt) / steps;
      state.position = { x: state.x, y: state.y + 18, room: state.room };
      let frame = state.secondary
        ? [16, 24, 29, 31, 33, 35][Math.min(5, Math.floor((state.elapsed / PrinceJS.Kick.TOPPLE_DURATION) * 6))]
        : 31;
      this.syncEnemy(enemy, state.position, frame);
      enemy.alpha = state.secondary ? state.alpha : 0;
      enemy.checkChoppers();
      if (!enemy.alive) {
        this.releaseEnemy(enemy);
        return;
      }
      // Each spin permits one body impact in total, even across later frames,
      // bounces or another spin. The secondary victim never passes it onward.
      for (let other of state.secondary || state.chain.size >= 2 ? [] : this.delegate.enemies || []) {
        if (!this.canTarget(other) || state.chain.has(other) || beforeSpeed < 80) {
          continue;
        }
        let foot = this.position(other);
        if (
          Math.abs(foot.x - state.x) <= 22 &&
          Math.abs(foot.y - 20 - state.y) <= 25 &&
          this.lineClear({ x: state.x, y: state.y, room: state.room }, { x: foot.x, y: foot.y - 20, room: foot.room })
        ) {
          this.knockDown(other, Math.sign(state.vx) || state.direction, 1, state.chain, true);
          // The incoming body loses momentum without launching another missile.
          state.vx *= 0.8;
          state.spin *= -0.75;
          break;
        }
      }
      for (let contact of result.contacts) {
        if (contact.normalY === -1) {
          // Count only a drop below the original platform, not height added by a launch.
          if (
            contact.y - state.launchFloor > PrinceJS.BLOCK_HEIGHT * 1.5 ||
            contact.tile.element === PrinceJS.Level.TILE_SPIKES
          ) {
            this.syncEnemy(enemy, { x: state.x, y: contact.y, room: state.room }, 35);
            this.releaseEnemy(enemy);
            if (contact.tile.element === PrinceJS.Level.TILE_SPIKES) {
              enemy.dieSpikes();
            } else {
              enemy.die("falldead");
            }
            return;
          }
          if (state.bounceCount === 0) {
            state.bounceCount++;
            state.vx *= 0.7 + this.random() * 0.15;
            state.spin *= -0.5;
          }
        }
        if (beforeSpeed > 80 && state.impactTime === 0) {
          state.impactTime = 0.12;
          this.effects.dust(contact.x, contact.y);
          if (contact.normalX) {
            state.spin *= -0.65;
          }
          if (this.delegate.bloodEffects) {
            this.delegate.bloodEffects.burst(contact.x, contact.y - 2, state.room, {
              direction: Math.sign(state.vx) || state.direction,
              count: 4,
              strength: 0.55
            });
          }
        }
      }
      if (
        result.grounded &&
        Math.abs(state.vx) < 18 &&
        (!state.secondary || state.elapsed >= PrinceJS.Kick.TOPPLE_DURATION)
      ) {
        this.recover(enemy, state.y + state.radius);
      }
    }
    if (state.phase === "airborne") {
      state.trailTime += dt;
      if (state.trailTime > 0.09 && state.elapsed < 0.7 && this.delegate.bloodEffects) {
        state.trailTime = 0;
        this.delegate.bloodEffects.burst(state.x, state.y, state.room, {
          count: 1,
          strength: 0.35,
          vx: state.vx * 0.12,
          vy: -20
        });
      }
      this.effects.fly(enemy, state);
    }
  },

  releaseEnemy: function (enemy) {
    let state = enemy.kickState;
    if (state && state.owner === this) {
      this.effects.release(enemy, state);
      // Fire/gun deaths may have taken ownership of native-sprite suppression.
      let replaced =
        this.delegate.enemyDeathEffects &&
        this.delegate.enemyDeathEffects.replacedEnemies.some((entry) => entry.enemy === enemy);
      if (!enemy.burningDeath && !replaced) {
        enemy.alpha = state.alpha;
      }
      delete enemy.kickState;
    }
    this.enemies.delete(enemy);
  },
  destroy: function () {
    this.cancelAction();
    for (let enemy of this.enemies) {
      this.releaseEnemy(enemy);
    }
    this.destroyed = true;
    this.effects.destroy();
  }
};
