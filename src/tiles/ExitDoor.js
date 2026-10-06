"use strict";

PrinceJS.Tile.ExitDoor = function (game, modifier, type, open = false, doorRole = "exit") {
  PrinceJS.Tile.Base.call(this, game, PrinceJS.Level.TILE_EXIT_RIGHT, modifier, type);
  this.doorRole = doorRole;

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
  if (this.destroyedByRocket) {
    this.updateRocketDamage();
    return;
  }
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

PrinceJS.Tile.ExitDoor.prototype.blastOpen = function (impact) {
  if (this.doorRole === "entrance" || this.destroyedByRocket) {
    return false;
  }
  this.destroyedByRocket = true;
  this.open = true;
  this.tileChildBack.visible = false;
  this.tileChildFront.visible = false;
  this.createRocketDamage(impact);
  return true;
};

PrinceJS.Tile.ExitDoor.prototype.createRocketDamage = function (impact) {
  // Pieces reuse the native lattice and doorway atlas: turquoise in the dungeon,
  // blue and gold in the palace. The stairs and their real exit tile stay intact.
  this.damagedFacade = this.game.make.graphics(0, 0);
  this.back.addChild(this.damagedFacade);
  this.damageRubble = this.game.make.graphics(0, 0);
  this.front.addChild(this.damageRubble);
  this.damageDust = this.game.make.graphics(0, 0);
  this.front.addChild(this.damageDust);
  this.damageAnimation = { time: 0, fragments: [], dust: [] };
  let direction = impact && impact.direction === -1 ? -1 : 1;
  let palace = this.type === PrinceJS.Level.TYPE_PALACE;
  let stone = palace ? 0xc39851 : 0x637b8a;
  let light = palace ? 0xe3b96b : 0x9aaab5;
  let lattice = palace ? 0x345590 : 0x327d82;
  let rect = (graphics, color, x, y, width, height, alpha = 1) => {
    graphics.beginFill(color, alpha);
    graphics.drawRect(x, y, width, height);
    graphics.endFill();
  };
  let nativePiece = (parent, frame, source, x, y, angle, tint) => {
    let piece = this.game.make.sprite(x, y, this.key, this.key + frame);
    piece.crop(new Phaser.Rectangle(...source));
    piece.angle = angle;
    piece.tint = tint;
    parent.addChild(piece);
    return piece;
  };
  // Crooked remnants of both jambs and a split lintel frame the clear stairs.
  nativePiece(this.damagedFacade, "_door_fg", [0, 0, 19, 11], -2, 1, -7, 0xa6aaa4);
  nativePiece(this.damagedFacade, "_door_fg", [30, 0, 28, 10], 31, 4, 6, 0xbac2b3);
  nativePiece(this.damagedFacade, "_door_fg", [0, 15, 6, 42], 0, 18, -4, 0x899991);
  nativePiece(this.damagedFacade, "_door_fg", [52, 22, 7, 38], 53, 23, 7, 0x95a697);
  nativePiece(this.damagedFacade, "_door", [1, 12, 9, 30], 5, 37, -22, 0x6f8982);
  nativePiece(this.damagedFacade, "_door", [27, 18, 10, 24], 43, 42, 26, 0x71837e);
  // Soot, fresh chipped edges and branching cracks remain after smoke clears.
  for (let [x, y, width, height] of [
    [-3, 13, 8, 8],
    [3, 25, 5, 7],
    [47, 13, 8, 6],
    [50, 38, 9, 10],
    [17, 1, 11, 5]
  ]) {
    rect(this.damagedFacade, 0x182126, x - 2, y - 2, width + 4, height + 4, 0.55);
    rect(this.damagedFacade, stone, x, y, width, height);
    rect(this.damagedFacade, light, x, y, width, 1);
  }
  for (let [x, y, angle] of [
    [-3, 8, -0.4],
    [49, 24, 0.4],
    [27, 2, 0.7]
  ]) {
    for (let step = 0; step < 8; step++) {
      rect(this.damagedFacade, 0x20282b, x + Math.round(step * angle), y + step * 2, 2, 3);
    }
  }
  for (let i = 0; i < 18; i++) {
    let x = -12 + ((i * 13) % 81);
    let y = 65 + (i % 4);
    rect(this.damageRubble, i % 3 ? stone : lattice, x, y, 3 + (i % 5), 2 + (i % 3));
    rect(this.damageRubble, light, x, y, 2, 1);
  }
  // A short, bounded burst of actual panel shards scatters and settles in place.
  for (let i = 0; i < 16; i++) {
    let x = 10 + (i % 4) * 9;
    let y = 16 + Math.floor(i / 4) * 11;
    let piece = nativePiece(this.damageRubble, "_door", [(i % 4) * 9, Math.floor(i / 4) * 11, 6, 8], x, y, 0, 0xb6c5ac);
    this.damageAnimation.fragments.push({
      sprite: piece,
      x,
      y,
      vx: direction * (25 + (i % 5) * 20) + (i % 2 ? 24 : -24),
      vy: -50 - (i % 4) * 21,
      spin: (i % 2 ? 1 : -1) * (160 + i * 13),
      bounced: false,
      settled: false
    });
  }
  for (let i = 0; i < 22; i++) {
    this.damageAnimation.dust.push({
      x: 6 + ((i * 11) % 48),
      y: 15 + ((i * 7) % 45),
      vx: direction * (15 + (i % 5) * 12),
      vy: -18 - (i % 4) * 9,
      life: 0.45 + (i % 6) * 0.08,
      color: i % 2 ? light : stone
    });
  }
};

PrinceJS.Tile.ExitDoor.prototype.updateRocketDamage = function () {
  let animation = this.damageAnimation;
  if (!animation || animation.time >= 1.6) {
    return;
  }
  // Trobs share the native 80 ms world tick with the Prince and all doors.
  let delta = 0.08;
  animation.time += delta;
  for (let fragment of animation.fragments) {
    if (fragment.settled) {
      continue;
    }
    fragment.vy += 260 * delta;
    fragment.x += fragment.vx * delta;
    fragment.y += fragment.vy * delta;
    fragment.sprite.angle += fragment.spin * delta;
    if (fragment.y >= 65) {
      fragment.y = 65;
      if (!fragment.bounced) {
        fragment.bounced = true;
        fragment.vy = -fragment.vy * 0.22;
        fragment.vx *= 0.45;
        fragment.spin *= 0.3;
      } else {
        fragment.settled = true;
      }
    }
    fragment.sprite.x = Math.round(fragment.x);
    fragment.sprite.y = Math.round(fragment.y);
  }
  this.damageDust.clear();
  for (let dust of animation.dust) {
    dust.life -= delta;
    if (dust.life <= 0) {
      continue;
    }
    dust.x += dust.vx * delta;
    dust.y += dust.vy * delta;
    this.damageDust.beginFill(dust.color, Math.min(0.5, dust.life));
    this.damageDust.drawRect(Math.round(dust.x), Math.round(dust.y), 4, 3);
    this.damageDust.endFill();
  }
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
