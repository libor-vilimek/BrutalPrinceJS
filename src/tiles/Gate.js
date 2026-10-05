"use strict";

PrinceJS.Tile.Gate = function (game, modifier, type) {
  PrinceJS.Tile.Base.call(this, game, PrinceJS.Level.TILE_GATE, modifier, type);

  this.onFastDrop = new Phaser.Signal();

  this.posY = -modifier * 46;

  this.tileChildBack = this.game.make.sprite(0, 0, this.key, this.key + "_gate");
  this.tileChildBack.crop(
    new Phaser.Rectangle(0, -this.posY, this.tileChildBack.width, this.tileChildBack.height + this.posY)
  );
  this.back.addChild(this.tileChildBack);

  this.tileChildFront = this.game.make.sprite(32, 16, this.key, this.key + "_gate_fg");
  this.tileChildFront.crop(
    new Phaser.Rectangle(0, -this.posY, this.tileChildFront.width, this.tileChildFront.height + this.posY)
  );
  this.front.addChild(this.tileChildFront);

  this.state = modifier;
  this.step = 0;
  this.closedFast = false;

  this.setCanMute(true);
};

PrinceJS.Tile.Gate.STATE_CLOSED = 0;
PrinceJS.Tile.Gate.STATE_OPEN = 1;
PrinceJS.Tile.Gate.STATE_RAISING = 2;
PrinceJS.Tile.Gate.STATE_DROPPING = 3;
PrinceJS.Tile.Gate.STATE_FAST_DROPPING = 4;
PrinceJS.Tile.Gate.STATE_WAITING = 5;

PrinceJS.Tile.Gate.prototype = Object.create(PrinceJS.Tile.Base.prototype);
PrinceJS.Tile.Gate.prototype.constructor = PrinceJS.Tile.Gate;

let syncSoundGatesRaise = new Set();
let syncSoundGatesDrop = new Set();

PrinceJS.Tile.Gate.reset = function () {
  syncSoundGatesRaise.clear();
  syncSoundGatesDrop.clear();
};

PrinceJS.Tile.Gate.prototype.update = function () {
  let gateBack = this.tileChildBack;
  let gateFront = this.tileChildFront;
  let closeSound;

  switch (this.state) {
    case PrinceJS.Tile.Gate.STATE_CLOSED:
    case PrinceJS.Tile.Gate.STATE_OPEN:
      syncSoundGatesRaise.delete(this);
      syncSoundGatesDrop.delete(this);
      break;

    case PrinceJS.Tile.Gate.STATE_RAISING:
      if (this.posY === -47) {
        this.state = PrinceJS.Tile.Gate.STATE_WAITING;
        this.step = 0;
        if (this.soundActive) {
          this.game.sound.play("GateStopsAtTop");
        }
      } else {
        this.posY -= 1;
        gateBack.crop(new Phaser.Rectangle(0, -this.posY, gateBack.width, gateBack.height));
        gateFront.crop(new Phaser.Rectangle(0, -this.posY, gateFront.width, gateFront.height));
        if (this.posY % 2 === 0) {
          if (
            this.soundActive &&
            (syncSoundGatesRaise.size === 0 || syncSoundGatesRaise.values().next().value === this)
          ) {
            this.game.sound.play("GateRising");
            syncSoundGatesRaise.add(this);
          }
        }
      }
      break;

    case PrinceJS.Tile.Gate.STATE_WAITING:
      syncSoundGatesRaise.delete(this);
      syncSoundGatesDrop.delete(this);
      this.step++;
      if (this.step === 50) {
        this.state = PrinceJS.Tile.Gate.STATE_DROPPING;
        this.step = 0;
      }
      break;

    case PrinceJS.Tile.Gate.STATE_DROPPING:
      if (!this.step) {
        this.posY += 1;
        gateBack.crop(new Phaser.Rectangle(0, -this.posY, gateBack.width, gateBack.height + 1));
        gateFront.crop(new Phaser.Rectangle(0, -this.posY, gateFront.width, gateFront.height + 1));
        if (this.posY >= 0) {
          this.posY = 0;
          gateBack.crop(null);
          gateFront.crop(null);
          this.state = PrinceJS.Tile.Gate.STATE_CLOSED;
          if (this.soundActive) {
            this.game.sound.play("GateStopsAtTop");
          }
        } else {
          if (
            this.soundActive &&
            (syncSoundGatesDrop.size === 0 || syncSoundGatesDrop.values().next().value === this)
          ) {
            this.game.sound.play("GateComingDownSlow");
            syncSoundGatesDrop.add(this);
          }
        }
        this.step++;
      } else {
        this.step = (this.step + 1) % 4;
      }
      break;

    case PrinceJS.Tile.Gate.STATE_FAST_DROPPING:
      closeSound = this.posY < -1;
      this.posY += 10;
      gateBack.crop(new Phaser.Rectangle(0, -this.posY, gateBack.width, gateBack.height + 10));
      gateFront.crop(new Phaser.Rectangle(0, -this.posY, gateFront.width, gateFront.height + 10));
      if (this.posY >= 0) {
        this.posY = 0;
        gateBack.crop(null);
        gateBack.crop(null);
        gateFront.crop(null);
        this.state = PrinceJS.Tile.Gate.STATE_CLOSED;
        if (closeSound) {
          this.game.sound.play("GateReachesBottomClang");
          this.onFastDrop.dispatch(this);
        }
      }
      break;
  }
};

PrinceJS.Tile.Gate.prototype.raise = function (stuck) {
  if (this.closedFast && stuck) {
    return;
  }
  this.step = 0;
  if (
    this.state !== PrinceJS.Tile.Gate.STATE_WAITING &&
    this.state !== PrinceJS.Tile.Gate.STATE_FAST_DROPPING &&
    this.state !== PrinceJS.Tile.Gate.STATE_RAISING
  ) {
    this.state = PrinceJS.Tile.Gate.STATE_RAISING;
    this.closedFast = false;
  }
};

PrinceJS.Tile.Gate.prototype.drop = function () {
  if (this.state !== PrinceJS.Tile.Gate.STATE_FAST_DROPPING) {
    this.state = PrinceJS.Tile.Gate.STATE_FAST_DROPPING;
    this.closedFast = true;
  }
};

PrinceJS.Tile.Gate.prototype.getBounds = function () {
  let bounds = new Phaser.Rectangle(0, 0, 0, 0);

  bounds.height = 63 - 10 + this.posY - 4;
  bounds.width = 4;
  bounds.x = this.roomX * 32 + 40;
  bounds.y = this.roomY * 63;

  return bounds;
};

PrinceJS.Tile.Gate.prototype.getBoundsAbs = function () {
  return new Phaser.Rectangle(this.x, this.y, this.width, 63 + this.posY);
};

PrinceJS.Tile.Gate.prototype.canCross = function (height) {
  return Math.abs(this.posY) > height;
};

PrinceJS.Tile.Gate.prototype.isVisible = function (visible) {
  if (this.canMute && this.soundActive !== visible) {
    this.soundActive = visible;
    if (!this.soundActive) {
      syncSoundGatesRaise.delete(this);
      syncSoundGatesDrop.delete(this);
    }
  }
};

PrinceJS.Tile.Gate.prototype.setCanMute = function (canMute) {
  this.canMute = canMute;
  this.soundActive = !this.canMute;
};

PrinceJS.Tile.Gate.prototype.destroy = function () {
  syncSoundGatesRaise.delete(this);
  syncSoundGatesDrop.delete(this);
  this.onFastDrop.dispose();
  PrinceJS.Tile.Base.prototype.destroy.call(this);
};
