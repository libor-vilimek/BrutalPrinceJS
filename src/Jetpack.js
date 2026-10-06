"use strict";

PrinceJS.Jetpack = function (delegate, direction) {
  this.delegate = delegate;
  this.game = delegate.game;
  this.level = delegate.level;
  this.kid = delegate.kid;
  this.pickup = PrinceJS.currentLevel === 12 ? this.findPickup(direction) : null;
  this.effects = new PrinceJS.JetpackEffects(this.game, this.kid, this.pickup);
  this.active = false;
  this.phase = "off";
  this.elapsed = 0;
  this.velocityX = 0;
  this.velocityY = 0;
  this.halfWidth = 8;
  this.height = 40;
  this.grounded = false;
  this.floorContact = null;
  this.kid.jetpackEquipped = false;
};

PrinceJS.Jetpack.prototype = {
  findPickup: function (direction) {
    let kid = this.kid;
    let room = this.level.rooms[kid.room];
    let column = Math.max(0, Math.min(9, kid.charBlockX));
    let row = kid.charBlockY;
    while (row < 2 && !this.level.getTileAt(column, row, kid.room).isWalkable()) {
      row++;
    }
    let safe = (x) => {
      let tile = this.level.getTileAt(x, row, kid.room);
      return (
        x >= 0 && x < 10 && tile.isSafeWalkable() && !tile.isBarrier() && tile.element !== PrinceJS.Level.TILE_SPIKES
      );
    };
    let occupied = (this.delegate.weapons || [])
      .map((weapon) => weapon.pickup)
      .filter((pickup) => pickup && !pickup.collected);
    let candidates = [];
    let footX = PrinceJS.Utils.convertX(kid.charX);
    let forward = direction === -1 ? -1 : 1;
    for (let x = 0; x < 10; x++) {
      let tile = this.level.getTileAt(x, row, kid.room);
      let localX = x * PrinceJS.BLOCK_WIDTH + 16;
      let localY = PrinceJS.Utils.convertBlockYtoY(row) + 3;
      if (
        !safe(x) ||
        [
          PrinceJS.Level.TILE_EXIT_LEFT,
          PrinceJS.Level.TILE_EXIT_RIGHT,
          PrinceJS.Level.TILE_POTION,
          PrinceJS.Level.TILE_SWORD,
          PrinceJS.Level.TILE_SKELETON
        ].includes(tile.element) ||
        Math.abs(localX - footX) < 24 ||
        occupied.some(
          (pickup) =>
            pickup.room === kid.room &&
            Math.abs(pickup.worldX - room.x * PrinceJS.ROOM_WIDTH - localX) < 25 &&
            Math.abs(pickup.worldY - room.y * PrinceJS.ROOM_HEIGHT - localY) < 8
        )
      ) {
        continue;
      }
      let step = Math.sign(x - column);
      let reachable = true;
      for (let next = column; next !== x; next += step) {
        if (!safe(next)) {
          reachable = false;
          break;
        }
      }
      if (reachable) {
        candidates.push({ x, distance: Math.abs(localX - footX), behind: Math.sign(x - column) !== forward });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || Number(a.behind) - Number(b.behind));
    if (!candidates.length) {
      return null;
    }
    return {
      room: kid.room,
      worldX: room.x * PrinceJS.ROOM_WIDTH + candidates[0].x * PrinceJS.BLOCK_WIDTH + 16,
      worldY: room.y * PrinceJS.ROOM_HEIGHT + PrinceJS.Utils.convertBlockYtoY(row) + 3,
      collected: !!kid.hasJetpack
    };
  },

  checkPickup: function () {
    let kid = this.kid;
    if (
      !this.pickup ||
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
    if (Math.abs(x - this.pickup.worldX) > 17 || Math.abs(y - this.pickup.worldY) > 7) {
      return false;
    }
    kid.hasJetpack = this.pickup.collected = true;
    this.effects.collect();
    this.game.sound.play("UnsheatheSword", 0.5);
    this.showText("JETPACK COLLECTED - J TO EQUIP / ARROWS FLY");
    return true;
  },

  toggle: function () {
    if (this.destroyed) {
      return false;
    }
    if (this.active) {
      this.stop(true);
      this.showText("JETPACK REMOVED - J TO EQUIP");
      return true;
    }
    let kid = this.kid;
    if (
      !kid.hasJetpack ||
      !kid.alive ||
      !kid.active ||
      !kid.visible ||
      kid.exists === false ||
      !this.level.rooms[kid.room] ||
      /drink|pickupsword|climbstairs|fastsheathe/.test(kid.action) ||
      !kid.beginSpecialAction(this, "jetpack")
    ) {
      return false;
    }

    this.position = {
      room: kid.room,
      x: ((kid.charX + kid.charFdx * kid.charFace) * PrinceJS.ROOM_WIDTH) / 140,
      y: kid.charY + kid.charFdy
    };
    this.active = kid.jetpackEquipped = true;
    this.phase = "equipping";
    this.elapsed = this.velocityX = this.velocityY = 0;
    this.health = kid.health;
    this.floorContact = null;
    kid.action = "stand";
    kid.actionCode = 0;
    kid.charXVel = kid.charYVel = 0;
    kid.inFallDown = kid.inJumpUp = false;
    kid.fallingBlocks = 0;
    kid.charSword = kid.swordDrawn = false;
    kid.sword.visible = false;
    kid.crop(null);
    kid.recoverCrop = false;
    this.level.unMaskTile(kid);
    this.syncKid();
    this.grounded = !!this.supportAt(this.position);
    this.effects.update(0, this);
    this.showText("JETPACK - ARROWS FLY / J REMOVE");
    return true;
  },

  showText: function (text) {
    if (this.delegate.ui) {
      this.delegate.ui.showText(text, "weapon");
      this.delegate.ui.hideTextTimer = 40;
    }
  },

  update: function (delta) {
    if (this.destroyed) {
      return;
    }
    let dt = Math.max(0, Math.min(Number(delta) || 0, 0.05));
    this.checkPickup();
    if (this.active) {
      let kid = this.kid;
      if (
        !kid.alive ||
        !kid.active ||
        !kid.visible ||
        kid.exists === false ||
        !kid.specialAction ||
        kid.specialAction.owner !== this
      ) {
        this.stop(false);
      } else if (kid.health < this.health || kid.action !== "stand") {
        this.stop(true);
      } else {
        this.elapsed += dt;
        this.health = kid.health;
        if (this.phase === "equipping" && this.elapsed >= 0.24) {
          this.phase = "flying";
        }
        if (this.phase === "flying") {
          this.fly(dt);
        }
        if (this.active) {
          this.syncKid();
          this.checkFloorContact();
        }
      }
    }
    this.effects.update(dt, this);
  },

  fly: function (dt) {
    let kid = this.kid;
    let horizontal = (kid.keyR() ? 1 : 0) - (kid.keyL() ? 1 : 0);
    let vertical = (kid.keyD() ? 1 : 0) - (kid.keyU() ? 1 : 0);
    let diagonal = horizontal && vertical ? Math.SQRT1_2 : 1;
    // Let go of the arrows to hover. Acceleration keeps takeoff and turning responsive.
    let approach = (value, target) => {
      let change = 620 * dt;
      return value < target ? Math.min(target, value + change) : Math.max(target, value - change);
    };
    this.velocityX = approach(this.velocityX, horizontal * 112 * diagonal);
    this.velocityY = approach(this.velocityY, vertical * 96 * diagonal);
    if (horizontal && kid.charFace !== horizontal) {
      kid.changeFace();
    }
    this.moveAxis("x", this.velocityX * dt);
    this.moveAxis("y", this.velocityY * dt);
    this.grounded = !!this.supportAt(this.position);
  },

  // Two-pixel sweeps and a short bisection prevent tunneling through floors and thin gate posts.
  moveAxis: function (axis, distance) {
    let steps = Math.max(1, Math.ceil(Math.abs(distance) / 2));
    let step = distance / steps;
    for (let i = 0; i < steps; i++) {
      if (step === 0) {
        break;
      }
      let candidate = this.candidatePosition(axis, step);
      if (!candidate || this.blockedAt(candidate)) {
        let safe = 0;
        let blocked = 1;
        for (let j = 0; j < 9; j++) {
          let fraction = (safe + blocked) / 2;
          let partial = this.candidatePosition(axis, step * fraction);
          if (partial && !this.blockedAt(partial)) {
            safe = fraction;
          } else {
            blocked = fraction;
          }
        }
        if (safe > 0) {
          this.setPosition(this.candidatePosition(axis, step * safe));
        }
        if (axis === "x") {
          this.velocityX = 0;
        } else {
          this.velocityY = 0;
        }
        break;
      }
      this.setPosition(candidate);
    }
  },

  candidatePosition: function (axis, distance) {
    let position = Object.assign({}, this.position);
    position[axis] += distance;
    let room = this.level.rooms[position.room];
    if (!room) {
      return null;
    }
    let link;
    // Match the original foot-coordinate room boundaries, including the 16-pixel tile offset.
    if (position.x < 16 || position.x >= PrinceJS.ROOM_WIDTH + 16) {
      link = position.x < 16 ? "left" : "right";
      if (!this.level.rooms[room.links[link]]) {
        return null;
      }
      position.room = room.links[link];
      position.x += link === "left" ? PrinceJS.ROOM_WIDTH : -PrinceJS.ROOM_WIDTH;
      room = this.level.rooms[position.room];
    }
    if (position.y < 0 || position.y >= PrinceJS.ROOM_HEIGHT) {
      link = position.y < 0 ? "up" : "down";
      if (!this.level.rooms[room.links[link]]) {
        return null;
      }
      position.room = room.links[link];
      position.y += link === "up" ? PrinceJS.ROOM_HEIGHT : -PrinceJS.ROOM_HEIGHT;
    }
    return position;
  },

  setPosition: function (position) {
    let previousRoom = this.position.room;
    this.position = position;
    if (previousRoom !== position.room) {
      this.syncKid();
      this.kid.onChangeRoom.dispatch(position.room);
    }
  },

  tileAt: function (column, row, room) {
    return this.level.getTileAt(column, row, room) || this.level.dummyWall;
  },

  blockedAt: function (position) {
    let body = {
      left: position.x - this.halfWidth,
      right: position.x + this.halfWidth,
      top: position.y - this.height,
      bottom: position.y
    };
    let intersects = (left, top, width, height) => {
      return (
        width > 0 &&
        height > 0 &&
        body.right > left &&
        body.left < left + width &&
        body.bottom > top &&
        body.top < top + height
      );
    };
    let leftColumn = Math.floor(body.left / PrinceJS.BLOCK_WIDTH) - 1;
    let rightColumn = Math.floor(body.right / PrinceJS.BLOCK_WIDTH);
    let topRow = Math.floor(body.top / PrinceJS.BLOCK_HEIGHT);
    let bottomRow = Math.floor(body.bottom / PrinceJS.BLOCK_HEIGHT);
    for (let row = topRow; row <= bottomRow; row++) {
      for (let column = leftColumn; column <= rightColumn; column++) {
        let tile = this.tileAt(column, row, position.room);
        let left = column * PrinceJS.BLOCK_WIDTH;
        let top = row * PrinceJS.BLOCK_HEIGHT;
        if (tile.element === PrinceJS.Level.TILE_WALL) {
          if (intersects(left, top, PrinceJS.BLOCK_WIDTH, PrinceJS.BLOCK_HEIGHT)) {
            return true;
          }
          continue;
        }
        if (tile.isWalkable()) {
          let floorY = PrinceJS.Utils.convertBlockYtoY(row);
          if (intersects(left, floorY, PrinceJS.BLOCK_WIDTH, 6)) {
            return true;
          }
        }
        if (tile.isBarrier()) {
          let bounds = tile.getBounds();
          let offsetX = (column - tile.roomX) * PrinceJS.BLOCK_WIDTH;
          let offsetY = (row - tile.roomY) * PrinceJS.BLOCK_HEIGHT;
          if (intersects(bounds.x + offsetX, bounds.y + offsetY, bounds.width, bounds.height)) {
            return true;
          }
        }
      }
    }
    return false;
  },

  supportAt: function (position) {
    if (!position) {
      return null;
    }
    // Use the native foot tile so dropping the pack returns to the normal floor checks cleanly.
    let column = Math.floor((position.x - 16) / PrinceJS.BLOCK_WIDTH);
    let row = Math.round((position.y + 10) / PrinceJS.BLOCK_HEIGHT) - 1;
    let tile = this.tileAt(column, row, position.room);
    let floorY = PrinceJS.Utils.convertBlockYtoY(row);
    if (tile.isWalkable() && Math.abs(position.y - floorY) < 0.3) {
      return { tile: tile, row: row, y: floorY };
    }
    return null;
  },

  checkFloorContact: function () {
    let support = this.supportAt(this.position);
    if (!support) {
      this.floorContact = null;
      return;
    }
    let tile = support.tile;
    let justLanded = this.floorContact !== tile;
    this.floorContact = tile;
    this.grounded = true;
    if (tile.element === PrinceJS.Level.TILE_LOOSE_BOARD) {
      tile.shake(true);
    } else if ([PrinceJS.Level.TILE_RAISE_BUTTON, PrinceJS.Level.TILE_DROP_BUTTON].includes(tile.element)) {
      tile.push();
    } else if (tile.element === PrinceJS.Level.TILE_SPIKES) {
      tile.raise();
      if (justLanded) {
        this.stop(false);
        this.kid.dieSpikes();
        this.game.sound.play("SpikedBySpikes");
      }
    }
  },

  syncKid: function () {
    let kid = this.kid;
    let position = this.position;
    let room = this.level.rooms[position.room];
    kid.room = position.room;
    kid.baseX = room.x * PrinceJS.ROOM_WIDTH;
    kid.baseY = room.y * PrinceJS.ROOM_HEIGHT + 3;
    kid.charX = (position.x * 140) / PrinceJS.ROOM_WIDTH;
    kid.charY = position.y;
    kid.charBlockX = Math.max(0, Math.min(9, Math.floor((position.x - 16) / PrinceJS.BLOCK_WIDTH)));
    kid.charBlockY = Math.max(0, Math.min(2, Math.floor(position.y / PrinceJS.BLOCK_HEIGHT)));
    kid.charXVel = kid.charYVel = 0;
    kid.inFallDown = kid.inJumpUp = false;
    kid.fallingBlocks = 0;
    kid.actionCode = 0;
    // The lifted knees use existing jump-recovery art; overlays add the two-handed strap grip.
    let frame = this.phase === "equipping" || this.grounded ? 15 : this.elapsed % 0.44 < 0.22 ? 32 : 33;
    kid.setSpecialActionFrame(frame);
  },

  stop: function (restorePhysics) {
    let kid = this.kid;
    let ownsAction = kid.specialAction && kid.specialAction.owner === this;
    this.active = kid.jetpackEquipped = false;
    this.phase = "off";
    this.velocityX = this.velocityY = 0;
    if (ownsAction) {
      kid.endSpecialAction(this);
    }
    if (restorePhysics && ownsAction && kid.alive && kid.active && kid.visible) {
      let support = this.supportAt(this.position);
      let preserveSequence = !!support && kid.action !== "stand";
      kid.charXVel = kid.charYVel = 0;
      kid.fallingBlocks = 0;
      kid.inJumpUp = false;
      kid.inFallDown = !support;
      if (support) {
        kid.charY = support.y;
        if (!preserveSequence) {
          kid.action = "stand";
        }
      } else {
        // Walking/stagger sequences assume row-level support and can otherwise suspend an airborne actor.
        kid.action = "freefall";
      }
      if (!preserveSequence) {
        kid.processCommand();
      }
      kid.updateCharPosition();
    }
    this.effects.hide();
  },

  destroy: function () {
    if (this.destroyed) {
      return;
    }
    this.stop(false);
    this.destroyed = true;
    this.effects.destroy();
  }
};
