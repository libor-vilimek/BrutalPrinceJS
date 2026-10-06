"use strict";

PrinceJS.Whip = function (delegate, direction) {
  this.spec = { id: "whip", label: "WHIP", owned: "hasWhip", equipped: "whipEquipped" };
  this.delegate = delegate;
  this.game = delegate.game;
  this.level = delegate.level;
  this.kid = delegate.kid;
  this.fireKey = delegate.weaponFireKey;
  this.ctrlKey = delegate.weaponCtrlKey;
  this.physics = new PrinceJS.GorePhysics(this.level);
  this.pickup = this.findPickup(direction);
  this.pickup.collected = !!this.kid.hasWhip;
  this.effects = new PrinceJS.WhipEffects(this.game, this.kid, this.pickup);
  this.actionStage = "hidden";
  this.elapsed = 0;
  this.equipTime = 0;
  this.cooldown = 0;
  this.cracks = 0;
  this.pulledEnemies = new Set();
  this.destroyed = false;
};

PrinceJS.Whip.DRAW_DURATION = 0.25;
PrinceJS.Whip.CRACK_DURATION = 0.48;
PrinceJS.Whip.HIT_TIME = 0.18;
PrinceJS.Whip.RECOVERY_DURATION = 1.45;
PrinceJS.Whip.RANGE = 86;

PrinceJS.Whip.prototype = {
  findPickup: function (direction) {
    let pickup = PrinceJS.RangedWeapon.prototype.findPickup.call(this, direction);
    let entrance = (this.level.entranceDoors || []).find((door) => door.room === this.kid.room);
    let room = this.level.rooms[this.kid.room];
    let row = entrance ? entrance.roomY : this.kid.charBlockY;
    let column = entrance ? entrance.roomX : this.kid.charBlockX;
    let candidates = entrance ? [column + 1, column - 2, column + 2, column - 3] : [];
    for (let candidate of candidates) {
      let tile = this.level.getTileAt(candidate, row, this.kid.room);
      if (
        candidate >= 0 &&
        candidate < 10 &&
        tile.isSafeWalkable() &&
        !tile.isBarrier() &&
        !tile.isExitDoor() &&
        ![PrinceJS.Level.TILE_SPIKES, PrinceJS.Level.TILE_POTION, PrinceJS.Level.TILE_SWORD].includes(tile.element)
      ) {
        pickup.worldX = room.x * PrinceJS.ROOM_WIDTH + candidate * PrinceJS.BLOCK_WIDTH + 16;
        pickup.worldY = room.y * PrinceJS.ROOM_HEIGHT + PrinceJS.Utils.convertBlockYtoY(row) + 3;
        break;
      }
    }
    pickup.column = Math.floor((pickup.worldX - room.x * PrinceJS.ROOM_WIDTH) / PrinceJS.BLOCK_WIDTH);
    pickup.row = Math.floor((pickup.worldY - room.y * PrinceJS.ROOM_HEIGHT) / PrinceJS.BLOCK_HEIGHT);
    return pickup;
  },

  checkPickup: function () {
    let kid = this.kid;
    if (
      this.pickup.collected ||
      !kid.alive ||
      !kid.active ||
      !kid.visible ||
      kid.specialAction ||
      kid.inFallDown ||
      kid.inJumpUp ||
      /hang|climb|jump|fall/.test(kid.action)
    ) {
      return false;
    }
    let x = kid.baseX + PrinceJS.Utils.convertX(kid.charX);
    let y = kid.baseY + kid.charY;
    if (Math.abs(x - this.pickup.worldX) > 12 || Math.abs(y - this.pickup.worldY) > 7) {
      return false;
    }
    kid.hasWhip = this.pickup.collected = true;
    this.equip();
    this.effects.collect();
    this.game.sound.play("UnsheatheSword", 0.5);
    this.delegate.ui.showText("5 WHIP - CTRL/F CRACK / PULL GUARDS OFF LEDGES", "weapon");
    this.delegate.ui.hideTextTimer = 90;
    return true;
  },

  canSelect: PrinceJS.RangedWeapon.prototype.canSelect,
  equip: PrinceJS.RangedWeapon.prototype.equip,
  triggerDown: PrinceJS.RangedWeapon.prototype.triggerDown,

  canAct: function () {
    return this.kid.activeWeapon === this.spec.id && PrinceJS.RangedWeapon.prototype.canFire.call(this);
  },

  beginDraw: function () {
    if (!this.kid.beginSpecialAction(this, "whip")) {
      return false;
    }
    this.kid.action = "stand";
    this.kid.actionCode = 0;
    this.kid.setSpecialActionFrame(15);
    this.actionStage = "drawing";
    this.elapsed = 0;
    return true;
  },

  beginCrack: function () {
    this.actionStage = "cracking";
    this.elapsed = 0;
    this.hitDone = false;
    this.effects.target = null;
    this.effects.tether = null;
    this.cracks++;
  },

  cancelAction: function () {
    if (this.kid.specialAction && this.kid.specialAction.owner === this) {
      this.kid.endSpecialAction(this);
    }
    this.actionStage = "hidden";
    this.elapsed = 0;
    this.firing = false;
    this.effects.target = this.effects.tether = null;
    this.effects.hide();
  },

  update: function (delta) {
    if (this.destroyed) {
      return;
    }
    let dt = Math.max(0, Math.min(Number(delta) || 0, 0.05));
    this.equipTime = Math.max(0, this.equipTime - dt);
    this.checkPickup();
    for (let enemy of this.pulledEnemies) {
      if (!enemy.alive || enemy.burningDeath || enemy.exists === false) {
        this.releaseEnemy(enemy);
      }
    }
    let canAct = this.canAct();
    let requested = canAct && this.triggerDown();
    if (
      this.actionStage !== "hidden" &&
      (!canAct || !this.kid.specialAction || this.kid.specialAction.owner !== this || this.kid.action !== "stand")
    ) {
      this.cancelAction();
      requested = false;
    }
    if (this.actionStage === "hidden" && requested) {
      this.beginDraw();
    }
    this.elapsed += dt;
    if (["drawing", "cracking"].includes(this.actionStage) && !requested) {
      this.actionStage = "holstering";
      this.elapsed = 0;
      this.effects.tether = null;
    }
    if (this.actionStage === "drawing" && this.elapsed >= PrinceJS.Whip.DRAW_DURATION) {
      this.beginCrack();
    }
    if (this.actionStage === "cracking") {
      if (!this.hitDone && this.elapsed >= PrinceJS.Whip.HIT_TIME) {
        this.hitDone = true;
        this.attack();
      }
      if (this.elapsed >= PrinceJS.Whip.CRACK_DURATION) {
        this.beginCrack();
      }
    }
    if (this.actionStage === "holstering" && this.elapsed >= 0.2) {
      this.cancelAction();
    }
    this.firing = this.actionStage === "cracking";
    this.effects.update(dt, this);
  },

  position: function (actor) {
    // Native feet use collision intervals shifted seven actor units (16 world pixels)
    // from the masonry grid. Undo that shift before testing the real ledge geometry.
    return {
      room: actor.room,
      x:
        actor.baseX +
        PrinceJS.Utils.convertX(
          actor.charX + (actor.charFdx || 0) * actor.charFace - (actor.charFfoot || 0) * actor.charFace
        ) -
        16,
      y: actor.baseY + actor.charY + (actor.charFdy || 0)
    };
  },

  tileAt: function (x, y, roomId) {
    let point = { x, y, room: roomId };
    let room = this.physics.resolveRoom(point);
    if (!room) {
      return null;
    }
    let column = Math.floor((x - room.x * PrinceJS.ROOM_WIDTH) / PrinceJS.BLOCK_WIDTH);
    let row = Math.floor((y - room.y * PrinceJS.ROOM_HEIGHT) / PrinceJS.BLOCK_HEIGHT);
    return {
      room: point.room,
      column,
      row,
      left: room.x * PrinceJS.ROOM_WIDTH + column * PrinceJS.BLOCK_WIDTH,
      tile: this.level.getTileAt(column, row, point.room)
    };
  },

  lineClear: function (from, to) {
    let steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2));
    let point = { room: from.room, x: from.x, y: from.y, radius: 1 };
    for (let i = 0; i <= steps; i++) {
      point.x = from.x + ((to.x - from.x) * i) / steps;
      point.y = from.y + ((to.y - from.y) * i) / steps;
      if (!this.physics.resolveRoom(point)) {
        return false;
      }
      for (let surface of this.physics.surfaces(point)) {
        if (
          point.x > surface.left - 0.25 &&
          point.x < surface.right + 0.25 &&
          point.y > surface.top - 0.25 &&
          point.y < surface.bottom + 0.25
        ) {
          return false;
        }
      }
    }
    return true;
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
      !enemy.inFallDown &&
      !enemy.inJumpUp &&
      this.level.rooms[enemy.room]
    );
  },

  findSnag: function (enemy) {
    if (!this.canTarget(enemy) || ["skeleton", "shadow"].includes(enemy.baseCharName || enemy.charName)) {
      return null;
    }
    let kid = this.position(this.kid);
    let foot = this.position(enemy);
    let height = kid.y - foot.y;
    let distance = (foot.x - kid.x) * this.kid.charFace;
    if (height < 35 || height > 104 || distance < -12 || distance > PrinceJS.Whip.RANGE) {
      return null;
    }
    let standing = this.tileAt(foot.x, foot.y - 2, foot.room);
    if (!standing || !standing.tile.isWalkable() || standing.tile.isBarrier()) {
      return null;
    }
    let candidates = [];
    for (let direction of [-1, 1]) {
      for (let offset = 1; offset <= 2; offset++) {
        let next = this.tileAt(standing.left + 16 + direction * offset * 32, foot.y - 2, foot.room);
        if (!next || next.tile.isBarrier()) {
          break;
        }
        if (next.tile.isWalkable()) {
          continue;
        }
        if (!next.tile.isSpace()) {
          break;
        }
        let targetX = next.left + 16;
        let edgeX = next.left + (direction < 0 ? 32 : 0);
        let anchor = { x: edgeX + direction * 3, y: foot.y - 8, room: next.room };
        let hand = { x: kid.x + this.kid.charFace * 7, y: kid.y - 25, room: kid.room };
        let ankle = { x: foot.x, y: foot.y - 8, room: foot.room };
        // The cord travels through the open side of the ledge, then curls over its lip.
        // A straight line through the floor would let it catch guards through a ceiling.
        if (
          Math.abs(foot.x - edgeX) <= 50 &&
          Math.hypot(anchor.x - hand.x, anchor.y - hand.y) <= PrinceJS.Whip.RANGE + 16 &&
          this.lineClear(hand, anchor) &&
          this.lineClear(anchor, ankle)
        ) {
          candidates.push({ enemy, foot, targetX, gap: next, edge: anchor, direction });
        }
        break;
      }
    }
    candidates.sort((a, b) => Math.abs(a.targetX - kid.x) - Math.abs(b.targetX - kid.x));
    return candidates[0] || null;
  },

  attack: function () {
    let kid = this.position(this.kid);
    let snags = (this.delegate.enemies || [])
      .map((enemy) => this.findSnag(enemy))
      .filter(Boolean)
      .sort((a, b) => Math.abs(a.foot.x - kid.x) - Math.abs(b.foot.x - kid.x));
    if (snags.length) {
      this.pullEnemy(snags[0]);
      this.effects.target = snags[0].foot;
      this.effects.tether = snags[0];
    } else {
      let targets = (this.delegate.enemies || [])
        .filter((enemy) => this.canTarget(enemy))
        .map((enemy) => ({ enemy, foot: this.position(enemy) }))
        .filter((target) => {
          let distance = (target.foot.x - kid.x) * this.kid.charFace;
          return (
            Math.abs(target.foot.y - kid.y) < 13 &&
            distance >= -6 &&
            distance <= PrinceJS.Whip.RANGE &&
            this.lineClear(
              { x: kid.x + this.kid.charFace * 6, y: kid.y - 24, room: kid.room },
              { x: target.foot.x, y: target.foot.y - 23, room: target.foot.room }
            )
          );
        })
        .sort((a, b) => Math.abs(a.foot.x - kid.x) - Math.abs(b.foot.x - kid.x));
      if (targets.length) {
        let target = targets[0];
        this.effects.target = { room: target.foot.room, x: target.foot.x, y: target.foot.y - 23 };
        PrinceJS.RangedWeapon.prototype.hitEnemy.call(this, target.enemy, {
          x: target.foot.x,
          y: target.foot.y - 23,
          room: target.foot.room,
          direction: this.kid.charFace
        });
      }
    }
    this.effects.crack();
    this.game.sound.play("SwordClash", 0.3);
  },

  pullEnemy: function (snag) {
    let enemy = snag.enemy;
    let state = {
      owner: this,
      phase: "pulling",
      elapsed: 0,
      startY: snag.foot.y,
      position: Object.assign({}, snag.foot),
      targetX: snag.targetX,
      direction: snag.direction,
      land: enemy.land,
      damaged: false
    };
    state.landHook = function () {
      let fallBlocks = this.fallingBlocks;
      state.land.call(this);
      if (this.whipState === state && this.alive && !this.burningDeath) {
        // The original landing keeps fatal falls and spikes. Only a surviving dragged fall adds this bruise.
        state.owner.landed(this, state, fallBlocks);
      }
    };
    enemy.whipState = state;
    enemy.land = state.landHook;
    enemy.swordDrawn = enemy.charSword = false;
    enemy.charXVel = enemy.charYVel = 0;
    enemy.inJumpUp = false;
    enemy.action = "stand";
    enemy.actionCode = 0;
    enemy.opponent = this.kid;
    this.pulledEnemies.add(enemy);
    if (enemy.room === this.kid.room && this.delegate.ui) {
      this.delegate.ui.setOpponentLive(enemy);
    }
  },

  syncEnemy: function (enemy, position, frame) {
    enemy.room = position.room;
    enemy.updateBase();
    enemy.charFrame = frame;
    enemy.updateCharFrame();
    let room = this.level.rooms[position.room];
    enemy.charX =
      ((position.x + 16 - room.x * PrinceJS.ROOM_WIDTH) * 140) / PrinceJS.ROOM_WIDTH -
      enemy.charFdx * enemy.charFace +
      enemy.charFfoot * enemy.charFace;
    enemy.charY = position.y - room.y * PrinceJS.ROOM_HEIGHT - 3 - enemy.charFdy;
    enemy.updateBlockXY();
    enemy.updateCharPosition();
    enemy.charSword = false;
    enemy.sword.visible = false;
    enemy.maskAndCrop();
  },

  updateEnemyActor: function (enemy) {
    let state = enemy.whipState;
    if (!state || state.owner !== this) {
      return false;
    }
    if (this.destroyed || !enemy.alive || enemy.burningDeath || !this.level.rooms[enemy.room]) {
      this.releaseEnemy(enemy);
      return false;
    }
    let dt = 0.08; // The native actor loop ticks every 80 ms, independently of render speed.
    state.elapsed += dt;
    enemy.updateSplash();
    if (state.phase === "pulling") {
      let distance = Math.min(Math.abs(state.targetX - state.position.x), 170 * dt) * state.direction;
      let steps = Math.max(1, Math.ceil(Math.abs(distance) / 2));
      for (let i = 0; i < steps; i++) {
        let next = { x: state.position.x + distance / steps, y: state.position.y, room: state.position.room };
        if (!this.physics.resolveRoom(next) || !this.dragClear(next)) {
          this.releaseEnemy(enemy);
          enemy.action = "stand";
          return true;
        }
        state.position = next;
      }
      this.syncEnemy(enemy, state.position, 23);
      enemy.checkSpikes();
      enemy.checkChoppers();
      let support = this.tileAt(state.position.x, state.position.y - 2, state.position.room);
      if (enemy.alive && support && !support.tile.isWalkable()) {
        state.phase = "falling";
        state.elapsed = 0;
        enemy.action = "freefall";
        enemy.actionCode = 4;
        enemy.charXVel = 0;
        enemy.charYVel = 2;
        enemy.inFallDown = true;
        enemy.fallingBlocks = 0;
      } else if (Math.abs(state.targetX - state.position.x) < 0.1 || state.elapsed > 1.25) {
        this.releaseEnemy(enemy);
        enemy.action = "stand";
      }
      return true;
    }
    if (state.phase === "falling") {
      // Keep native fall acceleration, collision, room links, death commands and traps; suppress combat AI.
      enemy.processCommand();
      enemy.updateAcceleration();
      // A dragged guard can enter freefall on any pixel, unlike the fixed native stepfall sequence.
      // Sweep its fall so a fast native velocity never skips the landing row or a trap.
      let steps = Math.max(1, Math.ceil(Math.abs(enemy.charYVel) / 4));
      let dx = enemy.charXVel / steps;
      let dy = enemy.charYVel / steps;
      for (let i = 0; i < steps; i++) {
        enemy.charX += dx;
        enemy.charY += dy;
        enemy.updateBlockXY();
        enemy.checkSpikes();
        enemy.checkChoppers();
        enemy.checkBarrier();
        enemy.checkButton();
        enemy.checkFloor();
        enemy.checkRoomChange();
        if (!enemy.alive || !this.level.rooms[enemy.room] || !enemy.whipState || state.phase !== "falling") {
          break;
        }
      }
      enemy.updateCharPosition();
      enemy.updateSwordPosition();
      enemy.sword.visible = false;
      enemy.maskAndCrop();
      if (!enemy.alive || !this.level.rooms[enemy.room]) {
        if (enemy.alive) {
          enemy.die("falldead");
        }
        this.releaseEnemy(enemy);
      }
      return true;
    }
    if (state.phase === "recovering") {
      let frames = [35, 33, 31, 29, 24, 16];
      let progress = Math.max(0, (state.elapsed - 0.85) / (PrinceJS.Whip.RECOVERY_DURATION - 0.85));
      let frame = frames[Math.min(frames.length - 1, Math.floor(progress * frames.length))];
      this.syncEnemy(enemy, state.position, frame);
      enemy.checkSpikes();
      enemy.checkChoppers();
      enemy.checkButton();
      let tile = this.tileAt(state.position.x, state.position.y - 2, state.position.room);
      if (enemy.alive && tile && !tile.tile.isWalkable()) {
        state.phase = "falling";
        enemy.action = "freefall";
        enemy.actionCode = 4;
        enemy.inFallDown = true;
        enemy.fallingBlocks = 0;
        enemy.charYVel = 2;
      } else if (state.elapsed >= PrinceJS.Whip.RECOVERY_DURATION) {
        this.releaseEnemy(enemy);
        enemy.action = "stand";
        enemy.processCommand();
        enemy.startFight = true;
      }
      return true;
    }
    this.releaseEnemy(enemy);
    return false;
  },

  dragClear: function (position) {
    // Check the complete body above the supporting floor; the ankle cannot be dragged through a gate.
    for (let y = position.y - 35; y < position.y - 3; y += 5) {
      for (let x of [position.x - 4, position.x, position.x + 4]) {
        if (!this.lineClear({ x, y, room: position.room }, { x, y, room: position.room })) {
          return false;
        }
      }
    }
    return true;
  },

  landed: function (enemy, state) {
    if (state.damaged) {
      // A falling support can drop a recovering guard again, but this pull only deals its one landing bruise.
      state.phase = "recovering";
      state.elapsed = 0;
      state.position = this.position(enemy);
      return;
    }
    state.damaged = true;
    let previousHealth = enemy.health;
    enemy.damageLife();
    if (this.delegate.bloodEffects && enemy.health < previousHealth) {
      let foot = this.position(enemy);
      this.delegate.bloodEffects.hit(enemy, {
        weapon: "whip",
        x: foot.x + enemy.charFace * 7,
        y: foot.y - 3,
        room: foot.room,
        direction: state.direction
      });
    }
    if (!enemy.alive) {
      enemy.action = "falldead";
      this.releaseEnemy(enemy);
      return;
    }
    state.phase = "recovering";
    state.elapsed = 0;
    state.position = this.position(enemy);
    enemy.action = "stand";
    enemy.actionCode = 0;
    enemy.inFallDown = false;
    enemy.charXVel = enemy.charYVel = 0;
    enemy.swordDrawn = enemy.charSword = false;
    this.effects.landing(state.position);
    this.syncEnemy(enemy, state.position, 35);
  },

  releaseEnemy: function (enemy) {
    let state = enemy.whipState;
    if (state && state.owner === this) {
      if (enemy.land === state.landHook) {
        enemy.land = state.land;
      }
      delete enemy.whipState;
    }
    this.pulledEnemies.delete(enemy);
    if (this.effects.tether && this.effects.tether.enemy === enemy) {
      this.effects.tether = null;
    }
  },

  destroy: function () {
    this.cancelAction();
    for (let enemy of this.pulledEnemies) {
      this.releaseEnemy(enemy);
    }
    this.destroyed = true;
    this.effects.destroy();
  }
};
