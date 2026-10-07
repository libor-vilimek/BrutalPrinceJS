"use strict";

PrinceJS.TwinTorches = function (delegate) {
  this.spec = { id: "twinTorches", label: "TWIN TORCHES", owned: "hasTwinTorches", equipped: "twinTorchesEquipped" };
  this.delegate = delegate;
  this.game = delegate.game;
  this.level = delegate.level;
  this.kid = delegate.kid;
  this.fireKey = delegate.weaponFireKey;
  this.ctrlKey = delegate.weaponCtrlKey;
  this.effects = new PrinceJS.TwinTorchesEffects(this.game, this.kid);
  this.physics = new PrinceJS.GorePhysics(this.level);
  this.actionStage = "hidden";
  this.elapsed = 0;
  this.spinTime = 0;
  this.drawProgress = 0;
  this.introPending = false;
  this.introDone = false;
  this.introTorches = [];
  this.destroyed = false;
};

// Native sword ranges are measured in 140-unit room coordinates (up to 71
// logical world pixels). This sweep reaches beyond even the heavy guard's blade.
PrinceJS.TwinTorches.REACH = 76;
PrinceJS.TwinTorches.DRAW_DURATION = 0.42;
PrinceJS.TwinTorches.HOLSTER_DURATION = 0.26;
PrinceJS.TwinTorches.INTRO_DURATION = 1.5;
PrinceJS.TwinTorches.INTRO_CAPTURES = [0.34, 0.94];

PrinceJS.TwinTorches.introMotion = function (time) {
  let segment =
    time < 0.22 ? [0, 0.22] : time >= 0.56 && time < 0.78 ? [0.56, 0.22] : time >= 1.18 ? [1.18, 0.32] : null;
  let progress = segment ? Math.min(1, (time - segment[0]) / segment[1]) : 0;
  // The native step's complete footfall replaces the old forward/backward shuffle of four frames.
  return { walking: !!segment, frame: segment ? 121 + Math.min(11, Math.floor(progress * 12)) : 15 };
};

PrinceJS.TwinTorches.prototype = {
  canSelect: function () {
    let action = this.kid.specialAction;
    if (this.introPending || this.actionStage === "intro") {
      return false;
    }
    if (action && ["intro", "holstering", "throwing"].includes(action.owner.actionStage)) {
      return false;
    }
    return !action || action.owner === this || (this.delegate.weapons || [this]).includes(action.owner);
  },

  equip: function () {
    if (this.destroyed || !this.kid.hasTwinTorches || !this.kid.alive || !this.canSelect()) {
      return false;
    }
    for (let weapon of this.delegate.weapons || [this]) {
      weapon.cancelAction();
      this.kid[weapon.spec.equipped] = false;
    }
    this.kid.twinTorchesEquipped = true;
    this.kid.activeWeapon = this.spec.id;
    this.kid.swordDrawn = false;
    if (this.kid.sword) {
      this.kid.sword.visible = false;
    }
    return true;
  },

  triggerDown: function () {
    if ((this.fireKey && this.fireKey.isDown) || (this.ctrlKey && this.ctrlKey.isDown)) {
      return true;
    }
    if (typeof this.kid.keyWeaponAction !== "function" || !this.kid.keyWeaponAction()) {
      return false;
    }
    return ![0, this.kid.charFace].some((offset) => {
      let tile = this.level.getTileAt(this.kid.charBlockX + offset, this.kid.charBlockY, this.kid.room);
      return tile.element === PrinceJS.Level.TILE_POTION;
    });
  },

  grounded: function () {
    let kid = this.kid;
    return (
      !kid.inFallDown &&
      !kid.inJumpUp &&
      !/hang|climb|jump|fall|land|bump|stab|impale|halve|dead/.test(kid.action) &&
      this.level.getTileAt(kid.charBlockX, kid.charBlockY, kid.room).isWalkable()
    );
  },

  canBegin: function () {
    let kid = this.kid;
    return (
      kid.hasTwinTorches &&
      kid.twinTorchesEquipped &&
      kid.activeWeapon === this.spec.id &&
      kid.alive &&
      kid.active &&
      kid.visible &&
      !kid.specialAction &&
      !kid.pickupPotion &&
      !kid.pickupSword &&
      this.grounded() &&
      (["stand", "startrun", "running", "runstop", "turnrun", "stoop", "standup", "crawl"].includes(kid.action) ||
        /^step\d+$/.test(kid.action))
    );
  },

  startIntro: function () {
    if (
      this.destroyed ||
      this.introPending ||
      this.introDone ||
      PrinceJS.currentLevel !== 1 ||
      this.level.number !== 1
    ) {
      return false;
    }
    let room = this.level.rooms[this.kid.room];
    if (!room) {
      return false;
    }
    let torches = [];
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 10; column++) {
        let tile = this.level.getTileAt(column, row, this.kid.room);
        if (tile.element === PrinceJS.Level.TILE_TORCH && !tile.taken && typeof tile.takeTorch === "function") {
          torches.push({
            tile: tile,
            row: row,
            x: room.x * PrinceJS.ROOM_WIDTH + column * PrinceJS.BLOCK_WIDTH + 48,
            y: room.y * PrinceJS.ROOM_HEIGHT + row * PrinceJS.BLOCK_HEIGHT + 22,
            captured: false
          });
        }
      }
    }
    // The native opening has two adjacent sockets on its landing. Custom first
    // levels without that pair simply start with the same owned basic weapon.
    let pair = torches.find((first) =>
      torches.some((second) => second !== first && second.row === first.row && Math.abs(second.x - first.x) === 32)
    );
    if (!pair) {
      this.introDone = true;
      return false;
    }
    this.introTorches = [
      pair,
      torches.find((second) => second !== pair && second.row === pair.row && Math.abs(second.x - pair.x) === 32)
    ];
    this.introPending = true;
    return true;
  },

  beginAction: function (stage) {
    if (!this.kid.beginSpecialAction(this, "twinTorches")) {
      return false;
    }
    this.kid.action = "stand";
    this.kid.actionCode = 0;
    this.kid.setSpecialActionFrame(15);
    this.actionStage = stage;
    this.elapsed = 0;
    this.spinTime = 0;
    this.drawProgress = 0;
    if (stage === "intro") {
      this.introStartX = this.kid.charX;
      this.introSteps = this.introTorches.map((torch) => this.safeIntroStep(torch));
    }
    return true;
  },

  safeIntroStep: function (torch) {
    let start = this.kid.baseX + PrinceJS.Utils.convertX(this.kid.charX);
    // Bring the shoulder beside each socket before reaching for its handle.
    let distance = ((torch.x - 2 * this.kid.charFace - start) * 140) / 320;
    let foot = this.kid.charX + (this.kid.charFdx - this.kid.charFfoot) * this.kid.charFace;
    let steps = Math.max(1, Math.ceil((Math.abs(distance) * 320) / 140));
    for (let i = 0; i <= steps; i++) {
      let column = PrinceJS.Utils.convertXtoBlockX(foot + (distance * i) / steps);
      if (column < 0 || column > 9) {
        return 0;
      }
      let tile = this.level.getTileAt(column, this.kid.charBlockY, this.kid.room);
      if (
        !tile.isSafeWalkable() ||
        tile.isBarrier() ||
        [PrinceJS.Level.TILE_SPIKES, PrinceJS.Level.TILE_CHOPPER].includes(tile.element)
      ) {
        return 0;
      }
    }
    return distance;
  },

  validAction: function () {
    let kid = this.kid;
    return (
      kid.specialAction &&
      kid.specialAction.owner === this &&
      kid.alive &&
      kid.active &&
      kid.visible &&
      kid.twinTorchesEquipped &&
      kid.activeWeapon === this.spec.id &&
      kid.action === "stand" &&
      !kid.inFallDown &&
      !kid.inJumpUp
    );
  },

  isSpinning: function () {
    return this.actionStage === "spinning" && this.validAction();
  },

  handleMeleeHit: function () {
    if (!this.validAction()) {
      return false;
    }
    if (this.isSpinning()) {
      // Only enemy sword strikes are deflected. Floor collapse and traps retain
      // their own native damage/death paths throughout the special action.
      return true;
    }
    if (!["intro", "drawing"].includes(this.actionStage)) {
      return false;
    }
    this.game.sound.play("StabbedByOpponent");
    this.kid.damageLife();
    this.effects.hitTime = 0.18;
    if (!this.kid.alive) {
      this.cancelAction();
    }
    return true;
  },

  beginHolster: function () {
    this.holsterFromSpin = this.actionStage === "spinning";
    this.actionStage = "holstering";
    this.holsterProgress = this.drawProgress;
    this.elapsed = 0;
  },

  cancelAction: function () {
    if (this.kid.specialAction && this.kid.specialAction.owner === this) {
      if (this.kid.alive && this.kid.action === "stand") {
        this.kid.setSpecialActionFrame(15);
      }
      this.kid.endSpecialAction(this);
    }
    if (this.actionStage === "intro") {
      this.introPending = false;
      this.introDone = true;
    }
    this.actionStage = "hidden";
    this.elapsed = this.spinTime = this.drawProgress = 0;
    this.effects.hide();
  },

  canReach: function (enemy) {
    let kid = this.kid;
    let x = kid.baseX + PrinceJS.Utils.convertX(kid.charX);
    let y = kid.baseY + kid.charY - 24;
    let enemyX = enemy.baseX + PrinceJS.Utils.convertX(enemy.charX);
    let enemyY = enemy.baseY + enemy.charY - 24;
    let distance = Math.hypot(enemyX - x, (enemyY - y) * 1.6);
    if (distance > PrinceJS.TwinTorches.REACH) {
      return false;
    }
    let point = { room: kid.room, x: x, y: y, radius: 1 };
    let steps = Math.max(1, Math.ceil(distance / 2));
    for (let i = 0; i <= steps; i++) {
      point.x = x + ((enemyX - x) * i) / steps;
      point.y = y + ((enemyY - y) * i) / steps;
      if (!this.physics.resolveRoom(point)) {
        return false;
      }
      if (
        this.physics
          .surfaces(point)
          .some(
            (surface) =>
              point.x >= surface.left && point.x <= surface.right && point.y >= surface.top && point.y <= surface.bottom
          )
      ) {
        return false;
      }
    }
    return point.room === enemy.room;
  },

  igniteNearby: function () {
    let burning = this.delegate.burningEnemyEffects;
    if (!burning) {
      return;
    }
    let kidX = this.kid.baseX + PrinceJS.Utils.convertX(this.kid.charX);
    for (let enemy of this.delegate.enemies || []) {
      if (!enemy.alive || !enemy.visible || !this.canReach(enemy)) {
        continue;
      }
      let enemyX = enemy.baseX + PrinceJS.Utils.convertX(enemy.charX);
      burning.ignite(enemy, {
        x: enemyX,
        y: enemy.baseY + enemy.charY - 24,
        room: enemy.room,
        direction: enemyX >= kidX ? 1 : -1,
        weapon: this.spec.id
      });
    }
  },

  updateIntro: function (delta) {
    this.elapsed += delta;
    let ease = (start, duration) => {
      let amount = Math.max(0, Math.min(1, (this.elapsed - start) / duration));
      return amount * amount * (3 - 2 * amount);
    };
    let first = ease(0, 0.22);
    let second = ease(0.56, 0.22);
    let back = ease(1.18, 0.32);
    this.kid.charX =
      this.introStartX + (this.introSteps[0] * first + (this.introSteps[1] - this.introSteps[0]) * second) * (1 - back);
    // This scripted route moves the standing root. Native walk frames include
    // alternating foot offsets paired with CHX commands we do not execute here.
    // Resolve the floor/room from the root before applying the visual step, or
    // frames 125/126 can falsely cross the left room boundary during pickup.
    this.kid.setSpecialActionFrame(15);
    this.kid.updateBlockXY();
    this.kid.setSpecialActionFrame(PrinceJS.TwinTorches.introMotion(this.elapsed).frame);
    let captures = PrinceJS.TwinTorches.INTRO_CAPTURES;
    for (let i = 0; i < this.introTorches.length; i++) {
      let torch = this.introTorches[i];
      if (!torch.captured && this.elapsed >= captures[i]) {
        torch.captured = true;
        torch.tile.takeTorch();
        this.game.sound.play("Footsteps", 0.3);
      }
    }
    if (this.elapsed >= PrinceJS.TwinTorches.INTRO_DURATION) {
      this.introPending = false;
      this.introDone = true;
      this.cancelAction();
    }
  },

  update: function (delta) {
    if (this.destroyed) {
      return;
    }
    delta = Math.max(0, Math.min(Number(delta) || 0, 0.05));
    if (this.introPending && this.actionStage === "hidden") {
      if (!this.kid.alive || this.kid.room !== this.introTorches[0].tile.room) {
        this.introPending = false;
        this.introDone = true;
      } else if (this.canBegin()) {
        let x = this.kid.baseX + PrinceJS.Utils.convertX(this.kid.charX);
        if (this.introTorches.every((torch) => torch.row === this.kid.charBlockY && Math.abs(torch.x - x) < 70)) {
          this.beginAction("intro");
        } else {
          this.introPending = false;
          this.introDone = true;
        }
      }
    }
    if (this.actionStage !== "hidden" && !this.validAction()) {
      this.cancelAction();
    }
    if (this.actionStage === "intro") {
      this.updateIntro(delta);
    } else {
      let held = this.triggerDown();
      if (this.actionStage === "hidden" && !this.introPending && held && this.canBegin()) {
        this.beginAction("drawing");
      }
      if (["drawing", "spinning"].includes(this.actionStage) && !held) {
        this.beginHolster();
      }
      if (this.actionStage === "drawing") {
        this.elapsed += delta;
        this.drawProgress = Math.min(1, this.elapsed / PrinceJS.TwinTorches.DRAW_DURATION);
        if (this.drawProgress >= 1) {
          this.actionStage = "spinning";
          this.spinTime = 0;
        }
      }
      if (this.actionStage === "spinning") {
        this.spinTime += delta;
        this.igniteNearby();
      }
      if (this.actionStage === "holstering") {
        this.elapsed += delta;
        this.drawProgress =
          this.holsterProgress * Math.max(0, 1 - this.elapsed / PrinceJS.TwinTorches.HOLSTER_DURATION);
        if (this.elapsed >= PrinceJS.TwinTorches.HOLSTER_DURATION) {
          this.cancelAction();
        }
      }
    }
    this.effects.update(delta, this);
  },

  destroy: function () {
    if (this.destroyed) {
      return;
    }
    this.cancelAction();
    this.destroyed = true;
    this.introPending = false;
    this.effects.destroy();
  }
};
