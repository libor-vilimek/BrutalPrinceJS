"use strict";

PrinceJS.Enemy = function (game, level, location, direction, room, skill, color, key, id) {
  this.baseCharName = key;
  if (key === "guard") {
    key = "guard-" + color;
  }
  PrinceJS.Fighter.call(this, game, level, location, direction, room, key, key === "shadow" ? "shadow" : "fighter");

  this.id = id;
  this.charX += direction * 7;

  this.strikeProbability = PrinceJS.Utils.applyStrength(PrinceJS.Enemy.STRIKE_PROBABILITY[skill]);
  this.restrikeProbability = PrinceJS.Utils.applyStrength(PrinceJS.Enemy.RESTRIKE_PROBABILITY[skill]);
  this.blockProbability = PrinceJS.Utils.applyStrength(PrinceJS.Enemy.BLOCK_PROBABILITY[skill]);
  this.impairblockProbability = PrinceJS.Utils.applyStrength(PrinceJS.Enemy.IMPAIRBLOCK_PROBABILITY[skill]);
  this.advanceProbability = PrinceJS.Utils.applyStrength(PrinceJS.Enemy.ADVANCE_PROBABILITY[skill]);

  this.refracTimer = 0;
  this.blockTimer = 0;
  this.strikeTimer = 0;
  this.lookBelow = false;
  this.startFight = false;

  this.health = PrinceJS.Enemy.EXTRA_STRENGTH[skill] + PrinceJS.Enemy.STRENGTH[this.level.number];

  this.charSkill = skill;
  this.charColor = color;

  this.onDamageLife.add(this.resetRefracTimer, this);
  this.onStrikeBlocked.add(this.resetBlockTimer, this);
  this.onEnemyStrike.add(this.resetStrikeTimer, this);

  if (this.charColor > 0) {
    this.tintSplash(PrinceJS.Enemy.COLOR[this.charColor - 1]);
  }
};

PrinceJS.Enemy.STRIKE_PROBABILITY = [61, 100, 61, 61, 61, 40, 100, 150, 0, 48, 32, 48]; // 220 -> 150
PrinceJS.Enemy.RESTRIKE_PROBABILITY = [0, 0, 0, 5, 5, 175, 16, 8, 0, 255, 255, 150];
PrinceJS.Enemy.BLOCK_PROBABILITY = [0, 150, 150, 200, 200, 255, 200, 250, 0, 255, 255, 255];
PrinceJS.Enemy.IMPAIRBLOCK_PROBABILITY = [0, 61, 61, 100, 100, 145, 100, 250, 0, 145, 255, 175];
PrinceJS.Enemy.ADVANCE_PROBABILITY = [255, 200, 200, 200, 255, 255, 200, 0, 0, 255, 100, 100];
PrinceJS.Enemy.REFRAC_TIMER = [16, 16, 16, 16, 8, 8, 8, 8, 0, 8, 0, 0];
PrinceJS.Enemy.EXTRA_STRENGTH = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
PrinceJS.Enemy.STRENGTH = [4, 3, 3, 3, 3, 4, 5, 4, 4, 5, 5, 5, 4, 6, 10, 0];
PrinceJS.Enemy.COLOR = [0x4890fc, 0xa83000, 0xfc5000, 0x0c9000, 0x5a00fc, 0xc858fc, 0xfcfc00];

PrinceJS.Enemy.prototype = Object.create(PrinceJS.Fighter.prototype);
PrinceJS.Enemy.prototype.constructor = PrinceJS.Enemy;

PrinceJS.Enemy.prototype.updateActor = function () {
  if (this.burningDeath) {
    // A guard is already dead in combat; its fire performance owns motion and
    // has dispatched the native death command exactly once.
    return;
  }
  if (this.whipState && this.whipState.owner.updateEnemyActor(this)) {
    return;
  }
  this.updateSplash();
  this.updateBehaviour();
  this.processCommand();
  this.updateAcceleration();
  this.updateVelocity();
  this.checkFight();
  this.checkSpikes();
  this.checkChoppers();
  this.checkBarrier();
  this.checkButton();
  this.checkFloor();
  this.checkRoomChange();
  this.updateCharPosition();
  this.updateSwordPosition();
  this.maskAndCrop();
};

PrinceJS.Enemy.prototype.CMD_TAP = function (data) {
  if (this.charName !== "shadow" || !this.visible) {
    return;
  }
  if (["softLand"].includes(this.action)) {
    return;
  }
  if (data.p1 === 1) {
    this.game.sound.play("Footsteps");
  } else if (data.p1 === 2) {
    this.game.sound.play("BumpIntoWallHard");
  }
};

PrinceJS.Enemy.prototype.updateBehaviour = function () {
  if (this.isProactiveGuard()) {
    let state = this.game && this.game.state && this.game.state.getCurrentState();
    let opponent = state && state.level === this.level ? state.kid : this.opponent;
    let camera = state && state.level === this.level ? state.roomCamera : null;
    if (!this.canHuntOpponent(opponent, camera)) {
      this.opponent = null;
      this.startFight = false;
      if (this.alive && this.swordDrawn && ["engarde", "advance", "retreat", "turnengarde"].includes(this.action)) {
        this.swordDrawn = false;
        this.stand();
      }
      return;
    }
    this.opponent = opponent;
    this.startFight = true;
    this.meet = true;
  }
  if (this.opponent === null || !this.alive) {
    return;
  }
  if (!this.opponent.alive) {
    return;
  }
  if (this.willStartFight()) {
    PrinceJS.Utils.delayed(
      () => {
        if (this.willStartFight()) {
          this.startFight = true;
        }
      },
      this.baseCharName === "jaffar" ? 2300 : 500
    );
  }

  if (this.refracTimer > 0) {
    this.refracTimer--;
  }
  if (this.blockTimer > 0) {
    this.blockTimer--;
  }
  if (this.strikeTimer > 0) {
    this.strikeTimer--;
  }

  if (
    this.action === "stabbed" ||
    this.action === "stabkill" ||
    this.action === "dropdead" ||
    this.action === "stepfall"
  ) {
    return;
  }

  let distance = this.opponentDistance();
  if (distance === -999) {
    return;
  }

  if (this.swordDrawn) {
    if (distance >= 35) {
      this.oppTooFar(distance);
    } else if (distance < -20) {
      this.turnengarde();
    } else if (distance < 12) {
      this.oppTooClose(distance);
    } else {
      this.oppInRange(distance);
    }
  } else {
    if (this.canReachOpponent(this.lookBelow) || this.canSeeOpponent(this.lookBelow)) {
      if (this.isProactiveGuard() && !this.facingOpponent()) {
        if (this.action === "stand") {
          this.turn();
        }
      } else if (!this.sneakUp || this.facingOpponent()) {
        this.engarde();
      }
    }
  }
};

PrinceJS.Enemy.prototype.isProactiveGuard = function () {
  return ["guard", "fatguard"].includes(this.baseCharName);
};

PrinceJS.Enemy.prototype.isHuntVisible = function (camera) {
  if (!this.visible) {
    return false;
  }
  if (!camera) {
    return true;
  }
  if (!camera.isRoomVisible(this.room)) {
    return false;
  }
  let room = this.level.rooms[this.room];
  let view = camera.camera;
  if (!view || !camera.scale || !Number.isFinite(camera.viewWidth)) {
    return true;
  }
  let x = room.x * PrinceJS.ROOM_WIDTH + PrinceJS.Utils.convertX(this.charX + (this.charFdx || 0) * this.charFace);
  let y = room.y * PrinceJS.ROOM_HEIGHT + 3 + this.charY + (this.charFdy || 0);
  let width = this.width || 32;
  let height = this.height || 40;
  let left = x - (this.charFace > 0 ? width - 5 : 0);
  let top = view.y / camera.scale;
  let viewLeft = view.x / camera.scale;
  return (
    left < viewLeft + camera.viewWidth && left + width > viewLeft && y - height < top + camera.viewHeight && y > top
  );
};

PrinceJS.Enemy.prototype.canHuntOpponent = function (opponent, camera) {
  if (!this.alive || !this.active || !opponent || !opponent.alive || !this.isHuntVisible(camera)) {
    return false;
  }
  return this.hasHuntPath(opponent);
};

PrinceJS.Enemy.prototype.hasHuntPath = function (opponent) {
  let room = this.level.rooms[this.room];
  let targetRoom = opponent && this.level.rooms[opponent.room];
  if (!room || !targetRoom || room.y * 3 + this.charBlockY !== targetRoom.y * 3 + opponent.charBlockY) {
    return false;
  }
  // Guards walk a continuous floor; they cannot jump gaps or climb to the Prince's ledge.
  let direction = Math.sign(targetRoom.x * 10 + opponent.charBlockX - room.x * 10 - this.charBlockX) || 1;
  let roomId = this.room;
  let column = this.charBlockX;
  let row = this.charBlockY;
  let remaining = Math.abs(targetRoom.x * 10 + opponent.charBlockX - room.x * 10 - column) + 1;
  while (remaining-- > 0) {
    if (column < 0 || column > 9) {
      let link = direction < 0 ? "left" : "right";
      let opposite = direction < 0 ? "right" : "left";
      let nextId = room.links[link];
      let next = this.level.rooms[nextId];
      if (!next || next.y !== room.y || next.x !== room.x + direction || next.links[opposite] !== roomId) {
        return false;
      }
      room = next;
      roomId = nextId;
      column = (column + 10) % 10;
    }
    let tile = this.level.getTileAt(column, row, roomId);
    if (!tile || !tile.isSafeWalkable()) {
      return false;
    }
    if (tile.element === PrinceJS.Level.TILE_GATE) {
      if (!tile.canCross(this.height || 40)) {
        return false;
      }
    } else if (tile.isBarrier()) {
      return false;
    }
    if (roomId === opponent.room && column === opponent.charBlockX) {
      return true;
    }
    column += direction;
  }
  return false;
};

PrinceJS.Enemy.prototype.opponentOnSameLevel = function () {
  if (!this.isProactiveGuard()) {
    return PrinceJS.Fighter.prototype.opponentOnSameLevel.call(this);
  }
  let room = this.level.rooms[this.room];
  let targetRoom = this.opponent && this.level.rooms[this.opponent.room];
  return !!(room && targetRoom && room.y * 3 + this.charBlockY === targetRoom.y * 3 + this.opponent.charBlockY);
};

PrinceJS.Enemy.prototype.opponentDistance = function () {
  if (!this.isProactiveGuard()) {
    return PrinceJS.Fighter.prototype.opponentDistance.call(this);
  }
  if (!this.opponentOnSameLevel()) {
    return -999;
  }
  let room = this.level.rooms[this.room];
  let targetRoom = this.level.rooms[this.opponent.room];
  let distance = ((targetRoom.x - room.x) * 140 + this.opponent.charX - this.charX) * this.charFace;
  if (distance >= 0 && this.charFace !== this.opponent.charFace) {
    distance += 13;
  }
  return distance;
};

PrinceJS.Enemy.prototype.canReachOpponent = function (below = false, turn = false) {
  if (this.isProactiveGuard()) {
    return this.hasHuntPath(this.opponent);
  }
  return PrinceJS.Fighter.prototype.canReachOpponent.call(this, below, turn);
};

PrinceJS.Enemy.prototype.canSeeOpponent = function (below = false) {
  if (this.isProactiveGuard()) {
    return this.hasHuntPath(this.opponent);
  }
  return PrinceJS.Fighter.prototype.canSeeOpponent.call(this, below);
};

PrinceJS.Enemy.prototype.willStartFight = function () {
  return (
    this.active &&
    !this.startFight &&
    (this.opponentCloseRoom(this.opponent, this.room) || Math.abs(this.opponentDistance()) < 35)
  );
};

PrinceJS.Enemy.prototype.enemyAdvance = function () {
  if (!this.startFight) {
    return;
  }

  if (!this.canReachOpponent(this.lookBelow) && !this.canSeeOpponent(this.lookBelow)) {
    this.swordDrawn = false;
    this.stand();
    return;
  }

  let tile = this.level.getTileAt(this.charBlockX, this.charBlockY, this.room);
  if (tile.isSpace() && !["advance", "retreat", "strike"].includes(this.action)) {
    this.startFall();
    return;
  }

  let tileF = this.level.getTileAt(this.charBlockX + this.charFace, this.charBlockY, this.room);
  let tileR = this.level.getTileAt(this.charBlockX - this.charFace, this.charBlockY, this.room);
  if (this.canWalkSafely(tileF, true)) {
    this.advance();
  } else {
    if (this.canWalkSafely(tileR)) {
      this.retreat();
    }
  }
};

PrinceJS.Enemy.prototype.canWalkSafely = function (tile, below = false) {
  if (tile.isSafeWalkable()) {
    return true;
  }
  if (below && tile.isSpace() && tile.roomY < 2 && this.opponent.charBlockY === tile.roomY + 1) {
    tile = this.level.getTileAt(tile.roomX, tile.roomY + 1, tile.room);
    return tile.isSafeWalkable();
  }
  return false;
};

PrinceJS.Enemy.prototype.engarde = function () {
  if (!this.hasSword) {
    return;
  }
  if (!this.startFight) {
    return;
  }

  this.lookBelow = true;
  PrinceJS.Fighter.prototype.engarde.call(this);
};

PrinceJS.Enemy.prototype.retreat = function () {
  if (!this.canReachOpponent(this.lookBelow)) {
    return;
  }
  if (this.nearBarrier(this.charBlockX, this.charBlockY, true)) {
    return;
  }

  if (!this.opponent.opponent) {
    this.opponent.opponent = this;
  }

  if (
    !this.action.includes("turn") &&
    !this.opponent.action.includes("turn") &&
    !this.facingOpponent() &&
    this.charFace === this.opponent.charFace &&
    this.opponentOnSameLevel()
  ) {
    this.turnengarde();
    return;
  }

  let tileR = this.level.getTileAt(this.charBlockX - this.charFace, this.charBlockY, this.room);
  if (this.canWalkSafely(tileR)) {
    PrinceJS.Fighter.prototype.retreat.call(this);
  }
};

PrinceJS.Enemy.prototype.advance = function () {
  if (!this.canReachOpponent(this.lookBelow)) {
    return;
  }
  if (this.nearBarrier(this.charBlockX, this.charBlockY, true)) {
    return;
  }

  if (!this.opponent.opponent) {
    this.opponent.opponent = this;
  }

  let tileF = this.level.getTileAt(this.charBlockX + this.charFace, this.charBlockY, this.room);
  let tileFF = this.level.getTileAt(this.charBlockX + 2 * this.charFace, this.charBlockY, this.room);
  if (this.canWalkSafely(tileF, true) && (!this.opponent.isHanging() || this.canWalkSafely(tileFF, true))) {
    PrinceJS.Fighter.prototype.advance.call(this);
  }
};

PrinceJS.Enemy.prototype.oppTooFar = function (distance) {
  if (this.refracTimer !== 0) {
    return;
  }
  if (this.opponent.action === "running" && distance < 40) {
    this.strike();
    return;
  }
  if (this.opponent.action === "runjump" && distance < 50) {
    this.strike();
    return;
  }

  this.enemyAdvance();
};

PrinceJS.Enemy.prototype.oppTooClose = function () {
  if (this.charFace === this.opponent.charFace || !["engarde", "advance", "retreat"].includes(this.opponent.action)) {
    this.retreat();
  } else {
    this.advance();
  }
};

PrinceJS.Enemy.prototype.oppInRange = function (distance) {
  if (!this.opponent.swordDrawn) {
    if (this.refracTimer === 0) {
      if (distance <= 25) {
        this.strike();
      } else {
        this.advance();
      }
    }
  } else {
    this.oppInRangeArmed(distance);
  }
};

PrinceJS.Enemy.prototype.oppInRangeArmed = function (distance) {
  if (!this.opponentOnSameLevel()) {
    return;
  }
  if (distance < 10 || distance >= 28) {
    this.tryAdvance();
  } else {
    this.tryBlock();
    if (this.refracTimer === 0) {
      if (distance < 12) {
        this.tryAdvance();
      } else {
        this.tryStrike();
      }
    }
  }
};

PrinceJS.Enemy.prototype.tryAdvance = function () {
  if (this.charSkill === 0 || this.strikeTimer === 0) {
    if (this.advanceProbability > this.game.rnd.between(0, 254)) {
      this.advance();
    }
  }
};

PrinceJS.Enemy.prototype.tryBlock = function () {
  if (
    this.opponent.frameID(152, 153) ||
    this.opponent.frameID(162) ||
    this.opponent.frameID(2, 3) ||
    this.opponent.frameID(12)
  ) {
    if (this.blockTimer !== 0) {
      if (this.impairblockProbability > this.game.rnd.between(0, 254)) {
        this.block();
      }
    } else {
      if (this.blockProbability > this.game.rnd.between(0, 254)) {
        this.block();
      }
    }
  }
};

PrinceJS.Enemy.prototype.tryStrike = function () {
  if (
    this.opponent.frameID(169) ||
    this.opponent.frameID(151) ||
    this.opponent.frameID(19) ||
    this.opponent.frameID(1)
  ) {
    return;
  }
  if (this.frameID(150)) {
    if (this.restrikeProbability > this.game.rnd.between(0, 254)) {
      this.strike();
    }
  } else {
    if (this.strikeProbability > this.game.rnd.between(0, 254)) {
      this.strike();
    }
  }
};

PrinceJS.Enemy.prototype.resetRefracTimer = function () {
  this.refracTimer = PrinceJS.Enemy.REFRAC_TIMER[this.charSkill];
};

PrinceJS.Enemy.prototype.resetBlockTimer = function () {
  this.blockTimer = 4;
};

PrinceJS.Enemy.prototype.resetStrikeTimer = function () {
  this.strikeTimer = 15;
};

PrinceJS.Enemy.prototype.fastsheathe = function () {
  if (this.charName === "shadow") {
    this.setInactive();
    this.action = "fastsheathe";
    this.swordDrawn = false;
  }
};

PrinceJS.Enemy.prototype.setVisible = function () {
  this.visible = true;
  this.sword.visible = true;
};

PrinceJS.Enemy.prototype.setInvisible = function () {
  this.visible = false;
  this.sword.visible = false;
};

PrinceJS.Enemy.prototype.setActive = function () {
  this.setVisible();
  this.active = true;
  if (this.charName === "skeleton") {
    this.action = "arise";
  }
};

PrinceJS.Enemy.prototype.setInactive = function () {
  this.active = false;
  this.startFight = false;
  if (this.charName === "skeleton") {
    this.action = "laydown";
  }
};

PrinceJS.Enemy.prototype.checkBarrier = function () {
  if (!this.alive || this.charName === "shadow") {
    return;
  }
  if (["stand", "turn", "stepfall", "freefall"].includes(this.action)) {
    return;
  }

  let tile = this.level.getTileAt(this.charBlockX, this.charBlockY, this.room);
  if (this.moveR() && tile.isBarrier()) {
    if (tile.intersects(this.getCharBounds())) {
      this.bump(tile);
    }
  } else {
    let blockX = PrinceJS.Utils.convertXtoBlockX(this.charX + this.charFdx * this.charFace - 12);
    let tileNext = this.level.getTileAt(blockX, this.charBlockY, this.room);
    if (tileNext.isBarrier()) {
      switch (tileNext.element) {
        case PrinceJS.Level.TILE_WALL:
          this.bump(tileNext);
          break;
        case PrinceJS.Level.TILE_GATE:
        case PrinceJS.Level.TILE_TAPESTRY:
        case PrinceJS.Level.TILE_TAPESTRY_TOP:
          if (tileNext.intersects(this.getCharBounds())) {
            this.bump(tileNext);
          }
          break;
      }
    }
  }
};

PrinceJS.Enemy.prototype.bump = function (tile) {
  if (this.moveR()) {
    this.charX -= 2;
  } else if (this.moveL()) {
    this.charX += 10;
  } else {
    this.charX += 5 * (this.centerX > tile.centerX ? 1 : -1);
  }
  this.updateBlockXY();
  this.action = "bump";
};

PrinceJS.Enemy.prototype.appearOutOfMirror = function (mirror) {
  this.charX = PrinceJS.Utils.convertBlockXtoX(mirror.roomX) + 20;
  this.charY = PrinceJS.Utils.convertBlockYtoY(mirror.roomY) - 14;
  this.action = "runjumpdown";
  this.charFrame = 42;
  this.updateBlockXY();
  this.updateCharPosition();
  this.processCommand();
  this.setVisible();
};
