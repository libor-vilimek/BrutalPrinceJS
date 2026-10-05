"use strict";

PrinceJS.Tile.ExitDoor = function (game, modifier, type, open = false) {
  PrinceJS.Tile.Base.call(this, game, PrinceJS.Level.TILE_EXIT_RIGHT, modifier, type);

  this.tileChildBack = this.game.make.sprite(10, 12, this.key, this.key + "_door");
  this.back.addChild(this.tileChildBack);
  if (this.type === PrinceJS.Level.TYPE_PALACE) {
    this.tileChildBack.x -= 3;
  }

  this.tileChildFront = this.game.make.sprite(0, 0, this.key, this.key + "_door_fg");
  this.front.addChild(this.tileChildFront);
  this.tileChildFront.visible = false;

  this.step = 0;

  this.open = open;

  this.heightOpen = 8 + this.type;
  this.heightClose = this.tileChildBack.height;
  this.heightCrop = this.heightClose - this.heightOpen;
  this.initCrop();
};

PrinceJS.Tile.ExitDoor.STATE_OPEN = 0;
PrinceJS.Tile.ExitDoor.STATE_RAISING = 1;
PrinceJS.Tile.ExitDoor.STATE_DROPPING = 2;
PrinceJS.Tile.ExitDoor.STATE_CLOSED = 3;

PrinceJS.Tile.ExitDoor.prototype = Object.create(PrinceJS.Tile.Base.prototype);
PrinceJS.Tile.ExitDoor.prototype.constructor = PrinceJS.Tile.ExitDoor;

PrinceJS.Tile.ExitDoor.prototype.toggleMask = function () {};

PrinceJS.Tile.ExitDoor.prototype.update = function () {
  let door = this.tileChildBack;

  switch (this.state) {
    case PrinceJS.Tile.ExitDoor.STATE_RAISING:
      if (door.height === this.heightOpen) {
        this.open = true;
      } else {
        this.step++;
        door.crop(new Phaser.Rectangle(0, this.step, door.width, door.height));
      }
      break;

    case PrinceJS.Tile.ExitDoor.STATE_DROPPING:
      if (door.height === this.heightClose) {
        this.open = false;
      } else {
        this.step += 15;
        door.crop(new Phaser.Rectangle(0, this.heightCrop - this.step, door.width, door.height + this.step));
      }
      break;
  }
};

PrinceJS.Tile.ExitDoor.prototype.initCrop = function () {
  if (this.open) {
    let door = this.tileChildBack;
    door.crop(new Phaser.Rectangle(0, this.heightCrop, door.width, door.height));
  }
};

PrinceJS.Tile.ExitDoor.prototype.raise = function () {
  if (this.destroyedByRocket) {
    return;
  }
  if (this.state === PrinceJS.Tile.ExitDoor.STATE_CLOSED) {
    this.state = PrinceJS.Tile.ExitDoor.STATE_RAISING;
    this.game.sound.play("ExitDoorOpening");
  }
};

PrinceJS.Tile.ExitDoor.prototype.drop = function () {
  if (this.destroyedByRocket) {
    return;
  }
  if (this.state !== PrinceJS.Tile.ExitDoor.STATE_CLOSED) {
    this.state = PrinceJS.Tile.ExitDoor.STATE_DROPPING;
    this.game.sound.play("EntranceDoorCloses");
  }
};

PrinceJS.Tile.ExitDoor.prototype.mask = function () {
  this.tileChildFront.visible = !this.destroyedByRocket;
};

PrinceJS.Tile.ExitDoor.prototype.blastOpen = function () {
  this.destroyedByRocket = true;
  this.open = true;
  this.tileChildBack.visible = false;
  this.tileChildFront.visible = false;
};

Object.defineProperty(PrinceJS.Tile.ExitDoor.prototype, "open", {
  get: function () {
    return this.state === PrinceJS.Tile.ExitDoor.STATE_OPEN;
  },

  set: function (value) {
    this.state = value ? PrinceJS.Tile.ExitDoor.STATE_OPEN : PrinceJS.Tile.ExitDoor.STATE_CLOSED;
    this.step = 0;
  }
});
