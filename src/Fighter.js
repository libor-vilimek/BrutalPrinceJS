"use strict";

PrinceJS.Fighter = function (game, level, location, direction, room, key, animKey) {
  this.level = level;
  this.room = room;

  this.charBlockX = location % 10;
  this.charBlockY = Math.floor(location / 10);

  let x = PrinceJS.Utils.convertBlockXtoX(this.charBlockX);
  let y = PrinceJS.Utils.convertBlockYtoY(this.charBlockY);

  PrinceJS.Actor.call(this, game, x, y, direction, key, animKey);

  this.charXVel = 0;
  this.charYVel = 0;
  this.actionCode = 1;

  this.charSword = true;

  this.flee = false;
  this.allowAdvance = true;
  this.allowRetreat = true;
  this.allowBlock = true;
  this.allowStrike = true;
  this.inJumpUp = false;
  this.inFallDown = false;
  this.inFloat = false;
  this.inFloatTimeoutCancel = null;
  this.fallingBlocks = 0;

  this.swordFrame = 0;
  this.swordDx = 0;
  this.swordDy = 0;

  if (this.charName !== "skeleton") {
    this.splash = this.game.make.sprite(0, 0, "general", (this.baseCharName || this.charName) + "-splash");
    this.splash.anchor.set(0, 1);
    this.splash.x = -6;
    this.splash.y = -15;
    this.splash.visible = false;
    this.addChild(this.splash);
    this.splashTimer = 0;
  }

  if (this.charName === "skeleton") {
    this.sword = this.game.make.sprite(0, 0, "sword");
  } else {
    this.sword = this.game.make.sprite(0, 0, "general");
  }
  this.sword.scale.x *= -this.charFace;
  this.sword.anchor.setTo(0, 1);

  this.game.add.existing(this.sword);

  this.hasSword = true;
  this.sword.z = 21;

  this.updateBase();

  this.swordAnims = this.game.cache.getJSON("sword-anims");

  this.registerCommand(0xf8, this.CMD_SETFALL); // 248
  this.registerCommand(0xf9, this.CMD_ACT); // 249
  this.registerCommand(0xf6, this.CMD_DIE); // 246

  this.opponent = null;
  this.active = true;
  this.startFight = true;

  this.health = 3;
  this.alive = true;
  this.swordDrawn = false;
  this.blocked = false;
  this.sneakUp = true;

  this.onInitLife = new Phaser.Signal();
  this.onDamageLife = new Phaser.Signal();
  this.onDead = new Phaser.Signal();
  this.onStrikeBlocked = new Phaser.Signal();
  this.onEnemyStrike = new Phaser.Signal();
  this.onChangeRoom = new Phaser.Signal();
};

PrinceJS.Fighter.GRAVITY = 3;
PrinceJS.Fighter.GRAVITY_FLOAT = 1;
PrinceJS.Fighter.TOP_SPEED = 33;
PrinceJS.Fighter.TOP_SPEED_FLOAT = 4;

PrinceJS.Fighter.prototype = Object.create(PrinceJS.Actor.prototype);
PrinceJS.Fighter.prototype.constructor = PrinceJS.Fighter;

PrinceJS.Fighter.prototype.CMD_SETFALL = function (data) {
  this.charXVel = data.p1 * this.charFace;
  this.charYVel = data.p2;
};

PrinceJS.Fighter.prototype.CMD_DIE = function (data) {
  this.alive = false;
  this.swordDrawn = false;
  this.showSplash();
  this.proceedOnDead();
  if (this.baseCharName === "jaffar") {
    PrinceJS.Utils.delayed(() => {
      if (!this.game) {
        return;
      }
      PrinceJS.Utils.flashWhiteVizierVictory(this.game);
    }, 200);
  }
};

PrinceJS.Fighter.prototype.CMD_ACT = function (data) {
  this.actionCode = data.p1;
  if (data.p1 === 1) {
    this.charXVel = 0;
    this.charYVel = 0;
  }
};

PrinceJS.Fighter.prototype.CMD_FRAME = function (data) {
  this.charFrame = data.p1;
  this.updateCharFrame();
  this.updateSwordFrame();
  this.updateBlockXY();
  this.processing = false;
};

PrinceJS.Fighter.prototype.changeFace = function () {
  this.charFace *= -1;
  this.scale.x *= -1;
  this.sword.scale.x *= -1;

  if (this.delegate) {
    this.delegate.syncFace(this);
  }
};

PrinceJS.Fighter.prototype.updateBase = function () {
  if (this.level.rooms[this.room]) {
    this.baseX = this.level.rooms[this.room].x * PrinceJS.ROOM_WIDTH;
    this.baseY = this.level.rooms[this.room].y * PrinceJS.ROOM_HEIGHT + 3;
  }
};

PrinceJS.Fighter.prototype.updateSwordFrame = function () {
  let framedef = this.anims.framedef[this.charFrame];

  this.charSword = typeof framedef.fsword !== "undefined";

  if (this.charSword) {
    let stab = this.swordAnims.swordtab[framedef.fsword - 1];
    this.swordFrame = stab.id;
    this.swordDx = stab.dx;
    this.swordDy = stab.dy;
  }
};

PrinceJS.Fighter.prototype.updateBlockXY = function () {
  let footX = this.charX + this.charFdx * this.charFace - this.charFfoot * this.charFace;
  let footY = this.charY + this.charFdy;
  this.charBlockX = PrinceJS.Utils.convertXtoBlockX(footX);
  let charBlockYBefore = this.charBlockY;
  this.charBlockY = Math.min(PrinceJS.Utils.convertYtoBlockY(footY), 2);
  this.updateFallingBlocks(this.charBlockY, charBlockYBefore);

  if (["climbup", "climbdown"].includes(this.action)) {
    return;
  }
  if (this.charBlockX < 0) {
    if (this.action === "highjump" && this.faceR()) {
      return;
    }
    if (this.level.rooms[this.room]) {
      let leftRoom = this.level.rooms[this.room].links.left;
      if (leftRoom > 0) {
        this.charX += 140;
        this.baseX -= 320;
        this.charBlockX = 9;
        this.room = leftRoom;
        if (this.charName === "kid") {
          this.onChangeRoom.dispatch(this.room, 0);
        }
      }
    }
  } else if (this.charBlockX > 9) {
    if (this.action === "highjump" && this.faceL()) {
      return;
    }
    if (this.level.rooms[this.room]) {
      let rightRoom = this.level.rooms[this.room].links.right;
      if (rightRoom > 0) {
        this.charX -= 140;
        this.baseX += 320;
        this.charBlockX = 0;
        this.room = rightRoom;
        if (this.charName === "kid") {
          this.onChangeRoom.dispatch(this.room, 0);
        }
      }
    }
  }
};

PrinceJS.Fighter.prototype.updateFallingBlocks = function (charBlockY, charBlockYBefore) {
  if (!this.inFallDown) {
    return;
  }
  if (charBlockY !== charBlockYBefore) {
    this.fallingBlocks++;
    if (this.charName === "kid" && this.fallingBlocks === 5) {
      this.game.sound.play("FallingFloorLands");
    }
  }
};

PrinceJS.Fighter.prototype.updateActor = function () {
  this.updateSplash();
  this.processCommand();
  this.updateAcceleration();
  this.updateVelocity();
  this.checkFight();
  this.checkRoomChange();
  this.updateCharPosition();
  this.updateSwordPosition();
  this.maskAndCrop();
};

PrinceJS.Fighter.prototype.checkFight = function () {
  if (this.opponent === null) {
    return;
  }

  if (
    this.charName !== "kid" &&
    this.active &&
    this.action === "stand" &&
    this.isOpponentInSameRoom() &&
    !this.facingOpponent() &&
    this.x > 0 &&
    this.opponent.x > 0 &&
    Math.abs(this.x - this.opponent.x) >= 20 &&
    !(this.sneakUp && this.opponent.sneaks())
  ) {
    this.turn();
  }

  if (!this.startFight) {
    return;
  }

  if (this.blocked && this.action !== "strike") {
    this.retreat();
    this.processCommand();
    this.blocked = false;
    return;
  }

  let distance = this.opponentDistance();
  if (distance === -999) {
    return;
  }

  switch (this.action) {
    case "engarde":
      if (!this.opponent.alive) {
        this.sheathe();
        this.opponent = null;
      } else if (distance < -4) {
        if (!this.facingOpponent()) {
          this.turnengarde();
        }
        if (this.opponent.opponent !== null && !this.opponent.facingOpponent()) {
          this.opponent.turnengarde();
        }
      }
      break;

    case "strike":
      if (this.charBlockY !== this.opponent.charBlockY) {
        return;
      }
      if (this.opponent.action === "climbstairs") {
        return;
      }
      if (!this.frameID(153, 154) && !this.frameID(3, 4)) {
        return;
      }

      if (!this.opponent.frameID(150) && !this.opponent.frameID(0)) {
        if (this.frameID(154) || this.frameID(4)) {
          let minHurtDistance = this.opponent.swordDrawn ? 12 : 8;
          let maxHurtDistance = 29 + (this.opponent.baseCharName === "fatguard" ? 2 : 0);
          if ((distance >= minHurtDistance || distance <= 0) && distance <= maxHurtDistance) {
            this.opponent.stabbed();
          }
        }
      } else {
        if (this.charFrame !== "kid") {
          this.game.sound.play("SwordClash");
        }

        this.opponent.blocked = true;
        this.action = "blockedstrike";
        this.processCommand();
        this.onStrikeBlocked.dispatch();
      }
      break;
  }
};

PrinceJS.Fighter.prototype.updateSwordPosition = function () {
  if (this.charSword) {
    this.sword.frameName = "sword" + this.swordFrame;
    this.sword.x = this.x + this.swordDx * this.charFace;
    this.sword.y = this.y + this.swordDy;
  }

  this.sword.visible = this.active && this.charSword;
};

PrinceJS.Fighter.prototype.opponentOnSameLevel = function () {
  return this.opponent && this.opponent.charBlockY === this.charBlockY;
};

PrinceJS.Fighter.prototype.opponentOnSameTile = function () {
  return this.opponent && this.charBlockX === this.opponent.charBlockX && this.charBlockY === this.opponent.charBlockY;
};

PrinceJS.Fighter.prototype.opponentOnSameTileBelow = function () {
  return (
    this.opponent && this.charBlockX === this.opponent.charBlockX && this.charBlockY + 1 === this.opponent.charBlockY
  );
};

PrinceJS.Fighter.prototype.opponentOnNextTileBelow = function () {
  return (
    this.opponent &&
    this.charBlockX + 1 === this.opponent.charBlockX &&
    this.charBlockY + 1 === this.opponent.charBlockY
  );
};

PrinceJS.Fighter.prototype.opponentDistance = function () {
  if (!this.opponentOnSameLevel()) {
    return 999 * (this.canWalkOnNextTile() ? 1 : -1);
  }

  let inSameRoom = this.opponentInSameRoom(this.opponent, this.room);
  let inRoomLeft = this.opponentNearRoomLeft(this.opponent, this.room, true);
  let inRoomRight = this.opponentNearRoomRight(this.opponent, this.room, true);
  if (!(inSameRoom || inRoomLeft || inRoomRight)) {
    return 999;
  }

  let distanceRoomOffset = 0;
  if (!inSameRoom) {
    if (inRoomLeft) {
      distanceRoomOffset = -150 * this.charFace;
    } else if (inRoomRight) {
      distanceRoomOffset = 150 * this.charFace;
    }
  }

  let maxCharBlockX = (this.opponent.charX - this.charX) * this.charFace;
  if (maxCharBlockX >= 0 && this.charFace !== this.opponent.charFace) {
    maxCharBlockX += 13;
  }

  return maxCharBlockX + distanceRoomOffset;
};

PrinceJS.Fighter.prototype.updateVelocity = function () {
  this.charX += this.charXVel;
  this.charY += this.charYVel;
};

PrinceJS.Fighter.prototype.updateAcceleration = function () {
  if (this.actionCode === 4) {
    if (this.inFloat) {
      this.charYVel += PrinceJS.Fighter.GRAVITY_FLOAT;
      if (this.charYVel > PrinceJS.Fighter.TOP_SPEED_FLOAT) {
        this.charYVel = PrinceJS.Fighter.TOP_SPEED_FLOAT;
      }
    } else {
      this.charYVel += PrinceJS.Fighter.GRAVITY;
      if (this.charYVel > PrinceJS.Fighter.TOP_SPEED) {
        this.charYVel = PrinceJS.Fighter.TOP_SPEED;
      }
    }
  }
};

PrinceJS.Fighter.prototype.alignToFloor = function () {};

PrinceJS.Fighter.prototype.stand = function () {
  this.action = "stand";
  this.processCommand();
};

PrinceJS.Fighter.prototype.turn = function () {
  this.action = "turn";
  this.charX -= this.charFace * 12;
  this.processCommand();
};

PrinceJS.Fighter.prototype.engarde = function () {
  if (!this.hasSword) {
    return false;
  }
  if (this.nearBarrier()) {
    return false;
  }

  this.action = "engarde";
  this.swordDrawn = true;
  this.flee = false;
  this.alignToFloor();

  if (this.charName === "kid") {
    this.game.sound.play("UnsheatheSword");
  }

  if (this.onInitLife) {
    this.onInitLife.dispatch(this);
  }
  return true;
};

PrinceJS.Fighter.prototype.turnengarde = function () {
  if (!this.hasSword) {
    return;
  }
  if (this.flee) {
    return;
  }
  if (["turnengarde"].includes(this.action)) {
    return;
  }
  if (!["stand", "engarde", "advance", "retreat"].includes(this.action)) {
    return;
  }
  if (!this.opponentOnSameLevel()) {
    return;
  }
  let begin = this.charName === "kid" && this.action === "stand" && Math.abs(this.opponentDistance()) > 10;
  this.action = (begin ? "begin" : "") + "turnengarde";
  if (!this.swordDrawn && this.charName === "kid") {
    this.game.sound.play("UnsheatheSword");
  }
  this.swordDrawn = true;
  this.alignToFloor();
};

PrinceJS.Fighter.prototype.sheathe = function () {
  if (!this.swordDrawn) {
    return;
  }
  this.action = "resheathe";
  this.swordDrawn = false;
  this.flee = false;
};

PrinceJS.Fighter.prototype.retreat = function () {
  if (this.frameID(158) || this.frameID(170) || this.frameID(8) || this.frameID(20, 21)) {
    this.action = "retreat";
    this.allowRetreat = false;
  }
};

PrinceJS.Fighter.prototype.advance = function () {
  if (this.action === "stand") {
    this.engarde();
    return;
  }

  if (this.frameID(158) || this.frameID(171) || this.frameID(8) || this.frameID(20, 21)) {
    this.action = "advance";
    this.allowAdvance = false;
  }
};

PrinceJS.Fighter.prototype.strike = function () {
  if (!this.opponentOnSameLevel() && this.charName !== "kid") {
    return;
  }

  if (this.charName === "kid" && this.frameID(157, 158)) {
    this.game.sound.play("StabAir");
  }

  if (
    this.frameID(157, 158) ||
    this.frameID(165) ||
    this.frameID(170, 171) ||
    this.frameID(7, 8) ||
    this.frameID(20, 21) ||
    this.frameID(15)
  ) {
    this.action = "strike";
    this.allowStrike = false;
  } else {
    if (this.frameID(150) || this.frameID(161) || this.frameID(0) || this.blocked) {
      this.action = "blocktostrike";
      this.allowStrike = false;
      this.blocked = false;
    }
  }
  this.opponent.onEnemyStrike.dispatch();
};

PrinceJS.Fighter.prototype.block = function () {
  if (!this.opponentOnSameLevel()) {
    return;
  }

  if (this.frameID(8) || this.frameID(20, 21) || this.frameID(18) || this.frameID(15)) {
    if (this.opponentDistance() >= 32) {
      return this.retreat();
    }
    if (!this.opponent.frameID(152) && !this.opponent.frameID(2)) {
      return;
    }
    this.action = "block";
  } else {
    if (!this.frameID(17)) {
      return;
    }
    this.action = "striketoblock";
  }

  this.allowBlock = false;
};

PrinceJS.Fighter.prototype.stabbed = function () {
  if (!this.alive) {
    return;
  }

  if (this.charName === "kid") {
    this.game.sound.play("StabbedByOpponent");
  } else {
    this.game.sound.play("StabOpponent");
  }

  if (this.health === 0) {
    return;
  }

  this.charY = PrinceJS.Utils.convertBlockYtoY(this.charBlockY);

  if (this.charName !== "skeleton") {
    this.damageLife();
  }

  if (this.health === 0) {
    this.action = "stabkill";
  } else if (this.charName === "kid" && !this.swordDrawn) {
    // Recover to ordinary movement; the sword recoil animation returns to a combat stance.
    this.charXVel = this.charYVel = 0;
    this.inFallDown = this.inJumpUp = false;
    this.pickupPotion = this.pickupSword = false;
    this.allowCrawl = true;
    this.action = "bump";
  } else {
    this.action = "stabbed";
  }

  this.showSplash();
};

PrinceJS.Fighter.prototype.bringAboveOpponent = function () {
  if (!this.opponent) {
    return;
  }
  let group = this.game.world;
  let opponentIndex = group.getIndex(this.opponent);
  if (opponentIndex >= 0 && group.getIndex(this) < opponentIndex) {
    group.remove(this, false, true);
    group.add(this, true, opponentIndex);
  }
};

PrinceJS.Fighter.prototype.opponentNextRoom = function (opponent, room) {
  return (
    this.opponentInSameRoom(opponent, room) ||
    this.opponentInRoomLeft(opponent, room) ||
    this.opponentInRoomRight(opponent, room)
  );
};

PrinceJS.Fighter.prototype.opponentInSameRoom = function (opponent, room) {
  return opponent && opponent.room === room;
};

PrinceJS.Fighter.prototype.opponentInRoomLeft = function (opponent, room) {
  return (
    this.level.rooms[room] &&
    this.level.rooms[room].links.left > 0 &&
    opponent &&
    opponent.room === this.level.rooms[room].links.left
  );
};

PrinceJS.Fighter.prototype.opponentInRoomRight = function (opponent, room) {
  return (
    this.level.rooms[room] &&
    this.level.rooms[room].links.right > 0 &&
    opponent &&
    opponent.room === this.level.rooms[room].links.right
  );
};

PrinceJS.Fighter.prototype.opponentCloseRoom = function (opponent, room) {
  return (
    (opponent && opponent.room === room) ||
    this.opponentCloseRoomLeft(opponent, room) ||
    this.opponentCloseRoomRight(opponent, room)
  );
};

PrinceJS.Fighter.prototype.opponentCloseRoomLeft = function (opponent, room) {
  return (
    this.level.rooms[room] &&
    this.level.rooms[room].links.left > 0 &&
    opponent &&
    opponent.room === this.level.rooms[room].links.left &&
    opponent.charBlockX >= 9
  );
};

PrinceJS.Fighter.prototype.opponentCloseRoomRight = function (opponent, room) {
  return (
    this.level.rooms[room] &&
    this.level.rooms[room].links.right > 0 &&
    opponent &&
    opponent.room === this.level.rooms[room].links.right &&
    this.charBlockX >= 9
  );
};

PrinceJS.Fighter.prototype.opponentNearRoom = function (opponent, room, full = false) {
  return (
    this.opponentInSameRoom(opponent, room) ||
    this.opponentNearRoomLeft(opponent, room, full) ||
    this.opponentNearRoomRight(opponent, room, full)
  );
};

PrinceJS.Fighter.prototype.opponentNearRoomLeft = function (opponent, room, full = false) {
  return (
    this.level.rooms[room] &&
    this.level.rooms[room].links.left > 0 &&
    this.canSeeRoomLeft(room) &&
    opponent &&
    opponent.room === this.level.rooms[room].links.left &&
    (full || opponent.charBlockX >= 8 || this.charBlockX <= 0)
  );
};

PrinceJS.Fighter.prototype.opponentNearRoomRight = function (opponent, room, full = false) {
  return (
    this.level.rooms[room] &&
    this.level.rooms[room].links.right > 0 &&
    this.canSeeRoomRight(room) &&
    opponent &&
    opponent.room === this.level.rooms[room].links.right &&
    (full || opponent.charBlockX <= 0 || this.charBlockX >= 8)
  );
};

PrinceJS.Fighter.prototype.canSeeRoomRight = function (room) {
  let rightRoom = this.level.rooms[room] && this.level.rooms[room].links.right;
  if (rightRoom > 0) {
    let tile = this.level.getTileAt(9, this.charBlockY, room);
    let tileR = this.level.getTileAt(0, this.charBlockY, rightRoom);
    return !tile.isSeeBarrier() && !tileR.isSeeBarrier();
  }
  return false;
};

PrinceJS.Fighter.prototype.canSeeRoomLeft = function (room) {
  let leftRoom = this.level.rooms[room] && this.level.rooms[room].links.left;
  if (leftRoom > 0) {
    let tile = this.level.getTileAt(0, this.charBlockY, room);
    let tileL = this.level.getTileAt(9, this.charBlockY, leftRoom);
    return !tile.isSeeBarrier() && !tileL.isSeeBarrier();
  }
  return false;
};

PrinceJS.Fighter.prototype.facingOpponent = function () {
  return (this.faceL() && this.opponent.x <= this.x) || (this.faceR() && this.opponent.x >= this.x);
};

PrinceJS.Fighter.prototype.canSeeOpponent = function (below = false) {
  if (this.opponent === null || !this.opponent.alive || !this.opponent.active) {
    return false;
  }

  if (!(this.opponent.charBlockY === this.charBlockY || (below && this.opponent.charBlockY === this.charBlockY + 1))) {
    return false;
  }

  if (!(this.x > 0 && this.opponent.x > 0)) {
    return false;
  }

  return (
    this.opponentNearRoom(this.opponent, this.room) ||
    this.opponentNearRoom(this, this.opponent.room) ||
    (Math.abs(this.opponent.x - this.x) <= 160 && Math.abs(this.opponent.y - this.y) <= 70)
  );
};

PrinceJS.Fighter.prototype.isOpponentInSameRoom = function () {
  return this.opponentInSameRoom(this.opponent, this.room);
};

PrinceJS.Fighter.prototype.nearBarrier = function (charBlockX, charBlockY, walk = false, turn = false) {
  charBlockX = charBlockX || this.charBlockX;
  charBlockY = charBlockY || this.charBlockY;

  let tile = this.level.getTileAt(charBlockX, charBlockY, this.room);
  let tileF = this.level.getTileAt(charBlockX + this.charFace, charBlockY, this.room);

  return (
    tileF.element === PrinceJS.Level.TILE_WALL ||
    !this.canCrossGate(tile, walk, turn) ||
    (tile.element === PrinceJS.Level.TILE_TAPESTRY && this.faceR()) ||
    (tileF.element === PrinceJS.Level.TILE_TAPESTRY && this.faceL()) ||
    (tileF.element === PrinceJS.Level.TILE_TAPESTRY_TOP && this.faceL())
  );
};

PrinceJS.Fighter.prototype.canCrossGate = function (tile, walk = false, turn = false) {
  let tileF = this.level.getTileAt(tile.roomX + this.charFace, tile.roomY, this.room);
  if (!tileF) {
    return false;
  }
  return !(
    (tileF.element === PrinceJS.Level.TILE_GATE &&
      ((!turn && this.faceL()) || (turn && this.faceR())) &&
      !tileF.canCross(this.height) &&
      (!walk || this.centerX + 5 > tile.centerX)) ||
    (tile.element === PrinceJS.Level.TILE_GATE &&
      ((!turn && this.faceR()) || (turn && this.faceL())) &&
      !tile.canCross(this.height) &&
      (!walk || this.centerX - 5 < tile.centerX))
  );
};

PrinceJS.Fighter.prototype.standsOnTile = function (tile) {
  let floorTile = this.level.getTileAt(tile.roomX, tile.roomY, tile.room);
  let fighterTile = this.level.getTileAt(this.charBlockX, this.charBlockY, this.room);
  return floorTile === fighterTile;
};

PrinceJS.Fighter.prototype.canWalkOnTile = function (charBlockX, charBlockY, room, turn = false) {
  let tile = this.level.getTileAt(charBlockX, charBlockY, room);
  if (!this.canCrossGate(tile, true, turn)) {
    return false;
  }
  if (tile.element === PrinceJS.Level.TILE_CHOPPER) {
    if (this.faceR()) {
      return this.x > tile.x + 15 && this.opponent.x > tile.x + 15;
    }
    return false;
  }
  return tile.isSafeWalkable() || this.standsOnTile(tile);
};

PrinceJS.Fighter.prototype.canWalkOnNextTile = function () {
  let charBlockX = PrinceJS.Utils.convertXtoBlockX(this.charX + this.charFdx * this.charFace);
  let tileF = this.level.getTileAt(charBlockX + this.charFace, this.charBlockY, this.room);
  if (tileF.isSafeWalkable()) {
    return true;
  }
  if (this.charBlockY < 2) {
    let tileBF = this.level.getTileAt(charBlockX + this.charFace, this.charBlockY + 1, this.room);
    if (tileBF.isSafeWalkable()) {
      return true;
    }
  }
  return false;
};

PrinceJS.Fighter.prototype.canReachOpponent = function (below = false, turn = false) {
  if (!this.canSeeOpponent(below)) {
    return false;
  }

  let hasNoBarrier = this.checkPathToOpponent(
    this.centerX,
    this.opponent,
    this.charBlockX,
    this.charBlockY,
    this.room,
    (charBlockX, charBlockY, room) => {
      let tile = this.level.getTileAt(charBlockX, charBlockY, room);
      let tileF = this.level.getTileAt(tile.roomX + this.charFace * (turn ? -1 : 1), tile.roomY, this.room);
      return {
        value: this.canCrossGate(tile, true, turn) && !(tile.isBarrierWalk() || tileF.isBarrierWalk())
      };
    }
  );

  if (hasNoBarrier && Math.abs(this.opponentDistance()) < 40) {
    return true;
  }

  return this.checkPathToOpponent(
    this.centerX,
    this.opponent,
    this.charBlockX,
    this.charBlockY,
    this.room,
    (charBlockX, charBlockY, room) => {
      if (this.canWalkOnTile(charBlockX, charBlockY, room, turn)) {
        return {
          value: true
        };
      }
      let tile = this.level.getTileAt(charBlockX, charBlockY, room);
      if (below && tile.isSpace() && charBlockY < 2 && this.opponent.charBlockY === charBlockY + 1) {
        return {
          value: this.checkPathToOpponent(
            tile.centerX,
            this.opponent,
            charBlockX,
            charBlockY + 1,
            room,
            (charBlockX, charBlockY, room) => {
              return {
                value: this.canWalkOnTile(charBlockX, charBlockY, room, turn)
              };
            }
          ),
          stop: true
        };
      }
      return {
        value: false
      };
    }
  );
};

PrinceJS.Fighter.prototype.checkPathToOpponent = function (x, opponent, charBlockX, charBlockY, room, callback) {
  let result = { value: false };
  let maxCharBlockX = opponent.charBlockX + (room === opponent.room ? 0 : 10);
  let minCharBlockX = opponent.charBlockX - (room === opponent.room ? 0 : 10);
  if (opponent.isHanging()) {
    if (opponent.faceR()) {
      maxCharBlockX += 1;
    } else if (opponent.faceL()) {
      minCharBlockX -= 1;
    }
  }
  if (x <= opponent.centerX) {
    if (charBlockX > maxCharBlockX) {
      charBlockX = maxCharBlockX;
    }
    while (charBlockX <= maxCharBlockX) {
      if (charBlockX === 10) {
        if (this.level.rooms[room]) {
          room = this.level.rooms[room].links.right;
        } else {
          return false;
        }
      }
      result = callback(charBlockX % 10, charBlockY, room);
      if (!result.value || result.stop) {
        return result.value;
      }
      charBlockX++;
    }
  } else {
    if (charBlockX < minCharBlockX) {
      charBlockX = minCharBlockX;
    }
    while (charBlockX >= minCharBlockX) {
      if (charBlockX === -1) {
        if (this.level.rooms[room]) {
          room = this.level.rooms[room].links.left;
        } else {
          return false;
        }
      }
      result = callback((10 + charBlockX) % 10, charBlockY, room);
      if (!result.value || result.stop) {
        return result.value;
      }
      charBlockX--;
    }
  }
  return result.value;
};

PrinceJS.Fighter.prototype.isHanging = function () {
  return ["hang", "hangstraight", "climbup", "climbdown", "hangdrop", "jumphanglong"].includes(this.action);
};

PrinceJS.Fighter.prototype.tintSplash = function (color) {
  if (this.charName === "skeleton") {
    return;
  }
  this.splash.tint = color;
};

PrinceJS.Fighter.prototype.hideSplash = function () {
  if (this.charName === "skeleton") {
    return;
  }
  this.splash.visible = false;
};

PrinceJS.Fighter.prototype.showSplash = function () {
  if (this.charName === "skeleton") {
    return;
  }
  if (["dropdead", "falldead", "impale", "halve"].includes(this.action)) {
    return;
  }
  this.splash.visible = true;
  this.splashTimer = 2;
};

PrinceJS.Fighter.prototype.updateSplash = function () {
  if (this.charName === "skeleton") {
    return;
  }

  if (this.splashTimer > 0) {
    this.splashTimer--;
    if (this.splashTimer === 0) {
      this.splash.visible = false;
      this.splash.y = -15;
    }
  }
};

PrinceJS.Fighter.prototype.setSneakUp = function (state) {
  this.sneakUp = state;
};

PrinceJS.Fighter.prototype.checkButton = function () {
  if (this.charFcheck) {
    let tile = this.level.getTileAt(this.charBlockX, this.charBlockY, this.room);
    switch (tile.element) {
      case PrinceJS.Level.TILE_RAISE_BUTTON:
      case PrinceJS.Level.TILE_DROP_BUTTON:
        tile.push();
        break;
    }
  }
};

PrinceJS.Fighter.prototype.checkFloor = function () {
  if (!this.visible) {
    return;
  }
  let tile = this.level.getTileAt(this.charBlockX, this.charBlockY, this.room);
  let tileF = this.level.getTileAt(this.charBlockX + this.charFace, this.charBlockY, this.room);
  let tileR = this.level.getTileAt(this.charBlockX - this.charFace, this.charBlockY, this.room);

  let checkCharFcheck = this.charFcheck;
  if (["advance", "retreat"].includes(this.action)) {
    checkCharFcheck = true;
    if (this.action === "advance" && !tileF.isSpace()) {
      checkCharFcheck = false;
    } else if (this.action === "retreat" && !tileR.isSpace()) {
      checkCharFcheck = false;
    }
  }

  if ([PrinceJS.Level.TILE_WALL].includes(tile.element)) {
    tile = this.level.getTileAt(this.charBlockX + this.charFace, this.charBlockY, this.room);
  }

  switch (this.actionCode) {
    case 0: // stand
    case 1: // move
    case 5: // bump
      this.inFallDown = false;
      if (checkCharFcheck) {
        switch (tile.element) {
          case PrinceJS.Level.TILE_SPACE:
          case PrinceJS.Level.TILE_TOP_BIG_PILLAR:
          case PrinceJS.Level.TILE_TAPESTRY_TOP:
            if (!this.alive || this.actionCode === 5 || ["strike"].includes(this.action)) {
              return;
            }
            this.startFall();
            break;

          case PrinceJS.Level.TILE_LOOSE_BOARD:
            tile.shake(true);
            break;

          case PrinceJS.Level.TILE_SPIKES:
            tile.raise();
            break;
        }
      }
      break;

    case 4: // freefall
      this.inFallDown = true;
      this.checkFall(tile);
      break;
  }
};

PrinceJS.Fighter.prototype.checkFall = function (tile) {
  let charBlockY = this.charBlockY;
  if (this.charY + 6 >= PrinceJS.Utils.convertBlockYtoY(charBlockY)) {
    tile = this.level.getTileAt(this.charBlockX, charBlockY, this.room);
    if (tile.isWalkable()) {
      this.land();
    } else {
      this.level.maskTile(this.charBlockX + 1, charBlockY, this.room, this);
      if (tile.isFreeFallBarrier()) {
        this.charX -= (tile.isBarrierLeft() ? 10 : 5) * this.charFace;
        this.updateBlockXY();
        tile = this.level.getTileAt(this.charBlockX, charBlockY, this.room);
        if (tile.isWalkable()) {
          this.land();
        }
      }
    }
  }
};

PrinceJS.Fighter.prototype.checkRoomChange = function () {
  if (this.charY > 192) {
    this.charY -= 192;
    this.baseY += 189;
    if (this.level.rooms[this.room]) {
      this.room = this.level.rooms[this.room].links.down;
    }
  }
};

PrinceJS.Fighter.prototype.startFall = function () {
  this.fallingBlocks = 0;
  this.inFallDown = true;

  let act = "stepfall";
  if (["retreat"].includes(this.action) || this.swordDrawn) {
    this.charX += 10 * this.charFace * (this.action === "advance" ? 1 : -1);
    this.level.maskTile(this.charBlockX + this.charFace, this.charBlockY, this.room, this);
  } else {
    this.level.maskTile(this.charBlockX + 1, this.charBlockY, this.room, this);
  }
  this.swordDrawn = false;
  this.action = act;
  this.processCommand();
};

PrinceJS.Fighter.prototype.stopFall = function () {
  this.fallingBlocks = 0;
  this.inFallDown = false;
  this.swordDrawn = false;
};

PrinceJS.Fighter.prototype.land = function () {
  this.charY = PrinceJS.Utils.convertBlockYtoY(this.charBlockY);
  this.charXVel = 0;
  this.charYVel = 0;

  let fallingBlocks = this.fallingBlocks;
  if (["skeleton", "shadow"].includes(this.charName)) {
    fallingBlocks = 1;
  }
  this.stopFall();

  let tile = this.level.getTileAt(this.charBlockX, this.charBlockY, this.room);
  if (tile.element === PrinceJS.Level.TILE_SPIKES) {
    this.game.sound.play("SpikedBySpikes"); // HardLandingSplat
    this.alignToTile(tile);
    this.dieSpikes();
  } else if (this.alive) {
    switch (fallingBlocks) {
      case 0:
      case 1:
        this.action = this.charName === "shadow" ? "softlandStandup" : "stand";
        break;
      default:
        this.game.sound.play("FreeFallLand");
        this.die("falldead");
        break;
    }
  }
  this.processCommand();

  if (this.sneakUp) {
    this.sneakUp = false;
    PrinceJS.Utils.delayed(() => {
      this.sneakUp = true;
    }, 250);
  }
};

PrinceJS.Fighter.prototype.distanceToEdge = function () {
  if (this.faceR()) {
    return PrinceJS.Utils.convertBlockXtoX(this.charBlockX + 1) - 1 - this.charX - this.charFdx + this.charFfoot;
  } else {
    return this.charX + this.charFdx + this.charFfoot - PrinceJS.Utils.convertBlockXtoX(this.charBlockX);
  }
};

PrinceJS.Fighter.prototype.distanceToFloor = function () {
  return PrinceJS.Utils.convertBlockYtoY(this.charBlockY) - this.charY - this.charFdy;
};

PrinceJS.Fighter.prototype.distanceToTopFloor = function () {
  return PrinceJS.Utils.convertBlockYtoY(this.charBlockY - 1) - this.charY - this.charFdy;
};

PrinceJS.Fighter.prototype.checkSpikes = function () {
  if (this.distanceToEdge() < 5) {
    this.trySpikes(this.charBlockX + this.charFace, this.charBlockY);
  }
  this.trySpikes(this.charBlockX, this.charBlockY);
};

PrinceJS.Fighter.prototype.inSpikeDistance = function (tile) {
  return true;
};

PrinceJS.Fighter.prototype.trySpikes = function (x, y) {
  while (y < 3) {
    let tile = this.level.getTileAt(x, y, this.room);
    if (tile.element === PrinceJS.Level.TILE_SPIKES) {
      tile.raise();
    }
    if ([PrinceJS.Level.TILE_WALL].includes(tile.element)) {
      return;
    }
    y++;
  }
};

PrinceJS.Fighter.prototype.checkChoppers = function () {
  if (this.charName === "kid") {
    this.level.activateChopper(-1, this.charBlockY, this.room);
    if (this.level.rooms[this.room]) {
      let rightRoom = this.level.rooms[this.room].links.right;
      if (this.charBlockX === 9 && this.charX > 130 && rightRoom > 0) {
        this.level.activateChopper(-1, this.charBlockY, rightRoom);
      }
    }
    if (this.level.rooms[this.room]) {
      let leftRoom = this.level.rooms[this.room].links.left;
      if (this.charBlockX === 0 && this.charX < 5 && leftRoom > 0) {
        this.level.activateChopper(-1, this.charBlockY, leftRoom);
      }
    }
  }
  this.tryChoppers(this.charBlockX, this.charBlockY);
};

PrinceJS.Fighter.prototype.chopDistance = function (tile) {
  let offsetX = -16;
  return tile.centerX - this.centerX + offsetX;
};

PrinceJS.Fighter.prototype.inChopDistance = function (tile) {
  return Math.abs(this.chopDistance(tile)) < 6 + (this.swordDrawn ? 10 : 0);
};

PrinceJS.Fighter.prototype.nearChopDistance = function (tile) {
  return Math.abs(this.chopDistance(tile)) <= 16;
};

PrinceJS.Fighter.prototype.tryChoppers = function (x, y) {
  if (this.charName === "skeleton") {
    return;
  }

  let tile = this.level.getTileAt(x, y, this.room);
  if (tile.element === PrinceJS.Level.TILE_CHOPPER) {
    this.tryChopperTile(x, y, tile);
  }
  tile = this.level.getTileAt(x + 1, y, this.room);
  if (tile.element === PrinceJS.Level.TILE_CHOPPER) {
    this.tryChopperTile(x, y, tile);
  }
};

PrinceJS.Fighter.prototype.tryChopperTile = function (x, y, tile) {
  if (tile.element === PrinceJS.Level.TILE_CHOPPER && tile.step >= 1 && tile.step <= 3) {
    if (this.inChopDistance(tile) && this.action !== "turn") {
      tile.showBlood();
      if (this.alive) {
        this.dieChopper();
        this.game.sound.play("HalvedByChopper");
        this.alignToTile(tile);
        this.charX += this.faceL() ? -5 : -9;
        if (this.charName === "kid") {
          PrinceJS.Utils.flashRedDamage(this.game);
        }
      }
    }
  }
};

PrinceJS.Fighter.prototype.chopperDistance = function (x, y) {
  if (this.charName === "skeleton") {
    return;
  }

  let tile = this.level.getTileAt(x, y, this.room);
  if (tile.element === PrinceJS.Level.TILE_CHOPPER) {
    if (this.nearChopDistance(tile)) {
      return this.chopDistance(tile);
    }
  }
  tile = this.level.getTileAt(x + 1, y, this.room);
  if (tile.element === PrinceJS.Level.TILE_CHOPPER) {
    if (this.nearChopDistance(tile)) {
      return this.chopDistance(tile);
    }
  }
  return 999;
};

PrinceJS.Fighter.prototype.dodgeChoppers = function () {
  let chopperDistance = this.chopperDistance(this.charBlockX, this.charBlockY);
  if (chopperDistance >= 13 && chopperDistance <= 16) {
    this.charX -= 16 - chopperDistance;
  } else if (chopperDistance >= -16 && chopperDistance <= -13) {
    this.charX += chopperDistance - -16;
  }
  this.updateCharPosition();
};

PrinceJS.Fighter.prototype.dieSpikes = function () {
  if (!this.alive || this.charName === "skeleton") {
    return;
  }

  this.die();
  this.action = "impale";
};

PrinceJS.Fighter.prototype.dieChopper = function () {
  if (!this.alive || this.charName === "skeleton") {
    return;
  }

  this.die();
  this.action = "halve";
};

PrinceJS.Fighter.prototype.damageLife = function () {
  if (!this.alive || this.charName === "skeleton") {
    return;
  }

  if (this.charName === "shadow") {
    PrinceJS.Utils.flashRedDamage(this.game);
  }
  this.showSplash();
  if (this.health > 1) {
    this.health -= 1;
    this.onDamageLife.dispatch(1);
    if (this.active && this.charName === "shadow" && this.opponent) {
      this.opponent.damageLife();
    }
  } else {
    this.die();
    if (this.active && this.charName === "shadow" && this.opponent) {
      this.opponent.die();
    }
  }
};

PrinceJS.Fighter.prototype.die = function (action) {
  if (!this.alive) {
    return;
  }
  if (this.charName === "skeleton") {
    this.action = "stand";
    return;
  }

  let damage = this.health;
  this.health -= damage;
  this.onDamageLife.dispatch(damage);

  this.action = action || "dropdead";
  this.alive = false;
  this.swordDrawn = false;
  this.hideSplash();
  this.bringAboveOpponent();
};

PrinceJS.Fighter.prototype.inLooseFloorDistance = function (tile) {
  return !!tile;
};

PrinceJS.Fighter.prototype.checkLooseFloor = function (tile) {};

PrinceJS.Fighter.prototype.proceedOnDead = function () {
  this.onDead.dispatch();
};

PrinceJS.Fighter.prototype.moveR = function (extended = true) {
  if (["stoop", "bump", "stand", "turn", "turnengarde", "strike"].includes(this.action)) {
    return false;
  }
  if (extended && ["engarde"].includes(this.action)) {
    return false;
  }
  return (
    (this.faceL() && ["retreat", "stabbed"].includes(this.action)) ||
    (this.faceR() && !["retreat", "stabbed"].includes(this.action))
  );
};

PrinceJS.Fighter.prototype.moveL = function (extended = true) {
  if (["stoop", "bump", "stand", "turn", "turnengarde", "strike"].includes(this.action)) {
    return false;
  }
  if (extended && ["engarde"].includes(this.action)) {
    return false;
  }
  return (
    (this.faceR() && ["retreat", "stabbed"].includes(this.action)) ||
    (this.faceL() && !["retreat", "stabbed"].includes(this.action))
  );
};

PrinceJS.Fighter.prototype.sneaks = function () {
  return (
    [
      "stoop",
      "stand",
      "standup",
      "turn",
      "jumpbackhang",
      "jumphanglong",
      "hang",
      "hangstraight",
      "hangdrop",
      "climbup",
      "climbdown",
      "testfoot"
    ].includes(this.action) || this.action.startsWith("step")
  );
};

PrinceJS.Fighter.prototype.getCharBounds = function () {
  let f = this.game.cache.getFrameData(this.charName).getFrameByName(this.charName + "-" + this.charFrame);
  let x = PrinceJS.Utils.convertX(this.charX + this.charFdx * this.charFace);
  let y = this.charY + this.charFdy - f.height;
  let w = f.width;
  let h = f.height;
  if (this.faceR()) {
    x -= f.width - 5;
  }
  if ((this.charFood && this.faceL()) || (!this.charFood && this.faceR())) {
    x += 1;
  }
  if (["runturn"].includes(this.action)) {
    w += 2;
  }
  if (this.charFrame === 38) {
    w += 5;
  }
  return new Phaser.Rectangle(x, y, w, h);
};

PrinceJS.Fighter.prototype.alignToTile = function (tile) {
  if (this.faceL()) {
    this.charX = PrinceJS.Utils.convertBlockXtoX(tile.roomX) - 2;
  } else {
    this.charX = PrinceJS.Utils.convertBlockXtoX(tile.roomX + 1) + 1;
  }
  this.charY = PrinceJS.Utils.convertBlockYtoY(tile.roomY);
  this.room = tile.room;
  this.updateBase();
  this.maskAndCrop();
  this.inJumpUp = false;
};

PrinceJS.Fighter.prototype.alignToFloor = function () {
  let tile = this.level.getTileAt(this.charBlockX, this.charBlockY, this.room);
  if (tile.roomY >= 0) {
    this.charY = PrinceJS.Utils.convertBlockYtoY(tile.roomY);
  }
  this.inJumpUp = false;
  this.maskAndCrop();
};

PrinceJS.Fighter.prototype.maskAndCrop = function () {
  if (this.frameID(16) || this.frameID(21) || this.frameID(35)) {
    this.level.unMaskTile(this);
  }
};
