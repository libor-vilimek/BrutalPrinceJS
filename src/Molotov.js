"use strict";

// A hanging action, rather than a selectable gun: Ctrl drops the bottle beneath the Prince.
PrinceJS.Molotov = function (delegate, direction) {
  this.delegate = delegate;
  this.game = delegate.game;
  this.level = delegate.level;
  this.kid = delegate.kid;
  this.pickup = this.findPickup(direction);
  this.pickup.collected = !!this.kid.hasMolotov;
  this.effects = new PrinceJS.MolotovEffects(this.game, this.kid, this.pickup);
  this.bottles = [];
  this.fires = [];
  this.burnCooldowns = new Map();
  this.throwState = null;
  this.cooldown = 0;
  this.destroyed = false;
};

PrinceJS.Molotov.THROW_DURATION = 0.98;
PrinceJS.Molotov.RELEASE_TIME = 0.82;
PrinceJS.Molotov.FIRE_DURATION = 5.2;

PrinceJS.Molotov.prototype = {
  findPickup: function (direction) {
    let pickup = PrinceJS.RangedWeapon.prototype.findPickup.call(this, direction);
    let room = this.level.rooms[pickup.room];
    let row = Math.floor((pickup.worldY - room.y * PrinceJS.ROOM_HEIGHT) / PrinceJS.BLOCK_HEIGHT);
    let occupied = (this.delegate.weapons || []).map((weapon) => weapon.pickup);
    if (this.delegate.minigun && !occupied.includes(this.delegate.minigun.pickup)) {
      occupied.push(this.delegate.minigun.pickup);
    }
    // Use the visible starting floor; move beside it only when another pickup occupies that spot.
    for (let offset of [0, direction * 32, -direction * 32, direction * 64, -direction * 64]) {
      let x = pickup.worldX + offset;
      let column = Math.floor((x - room.x * PrinceJS.ROOM_WIDTH) / PrinceJS.BLOCK_WIDTH);
      let tile = this.level.getTileAt(column, row, pickup.room);
      if (
        column >= 0 &&
        column < 10 &&
        tile.isSafeWalkable() &&
        !tile.isBarrier() &&
        ![
          PrinceJS.Level.TILE_SPIKES,
          PrinceJS.Level.TILE_POTION,
          PrinceJS.Level.TILE_SWORD,
          PrinceJS.Level.TILE_SKELETON,
          PrinceJS.Level.TILE_EXIT_LEFT,
          PrinceJS.Level.TILE_EXIT_RIGHT
        ].includes(tile.element) &&
        !occupied.some((item) => item && Math.abs(item.worldX - x) < 25 && Math.abs(item.worldY - pickup.worldY) < 8)
      ) {
        pickup.worldX = x;
        break;
      }
    }
    return pickup;
  },

  checkPickup: function () {
    let kid = this.kid;
    if (
      this.pickup.collected ||
      !kid.alive ||
      !kid.visible ||
      !kid.active ||
      kid.specialAction ||
      kid.inFallDown ||
      kid.inJumpUp ||
      /hang|climb|jump|fall/.test(kid.action)
    ) {
      return;
    }
    let x = kid.baseX + PrinceJS.Utils.convertX(kid.charX);
    let y = kid.baseY + kid.charY;
    if (Math.abs(x - this.pickup.worldX) > 17 || Math.abs(y - this.pickup.worldY) > 7) {
      return;
    }
    kid.hasMolotov = this.pickup.collected = true;
    this.effects.collect();
    this.game.sound.play("UnsheatheSword", 0.5);
    this.delegate.ui.showText("MOLOTOV - HANG + CTRL TO DROP", "weapon");
    this.delegate.ui.hideTextTimer = 85;
  },

  throwFromHang: function () {
    let kid = this.kid;
    if (
      this.destroyed ||
      this.throwState ||
      this.cooldown > 0 ||
      !kid.hasMolotov ||
      !kid.alive ||
      !kid.active ||
      !kid.visible ||
      kid.inFallDown ||
      !["hang", "hangstraight"].includes(kid.action) ||
      !kid.beginSpecialAction(this, "molotov")
    ) {
      return false;
    }
    this.throwState = {
      time: 0,
      released: false,
      lighterLit: false,
      action: kid.action,
      room: kid.room,
      x: kid.charX,
      y: kid.charY,
      direction: kid.charFace,
      frame: kid.charFrame
    };
    kid.setSpecialActionFrame(91);
    this.effects.beginThrow();
    return true;
  },

  updateThrow: function (delta) {
    let state = this.throwState;
    if (!state) {
      return;
    }
    let kid = this.kid;
    if (
      !kid.specialAction ||
      kid.specialAction.owner !== this ||
      !kid.alive ||
      !kid.active ||
      !kid.visible ||
      kid.action !== state.action ||
      kid.room !== state.room ||
      kid.charX !== state.x ||
      kid.charY !== state.y ||
      kid.charFace !== state.direction
    ) {
      this.finishThrow();
      return;
    }
    state.time += delta;
    if (!state.lighterLit && state.time >= 0.27) {
      state.lighterLit = true;
      this.game.sound.play("FloorButton", 0.25);
    }
    if (!state.released && state.time >= PrinceJS.Molotov.RELEASE_TIME) {
      state.released = true;
      let point = this.effects.getDropPoint();
      // Unlimited bottles after the pickup, with a bounded number of live projectiles.
      if (this.bottles.length < 12) {
        this.bottles.push({ room: kid.room, x: point.x, y: point.y, vy: 65, life: 6, age: 0 });
      }
      this.game.sound.play("StabAir", 0.35);
    }
    if (state.time >= PrinceJS.Molotov.THROW_DURATION) {
      this.finishThrow();
    }
  },

  finishThrow: function () {
    let state = this.throwState;
    if (!state) {
      return;
    }
    let kid = this.kid;
    if (kid.specialAction && kid.specialAction.owner === this) {
      if (kid.alive && kid.action === state.action && state.frame !== undefined) {
        kid.setSpecialActionFrame(state.frame);
      }
      kid.endSpecialAction(this);
    }
    this.effects.finishThrow();
    this.throwState = null;
    this.cooldown = 0.18;
  },

  resolveRoom: function (point) {
    // Follow actual links. A nearby room in the map must not catch a bottle through an unlinked boundary.
    for (let i = 0; i < 8; i++) {
      let room = this.level.rooms[point.room];
      if (!room) {
        return null;
      }
      let next;
      if (point.x < room.x * PrinceJS.ROOM_WIDTH) {
        next = room.links.left;
      } else if (point.x >= (room.x + 1) * PrinceJS.ROOM_WIDTH) {
        next = room.links.right;
      } else if (point.y >= (room.y + 1) * PrinceJS.ROOM_HEIGHT) {
        next = room.links.down;
      } else if (point.y < room.y * PrinceJS.ROOM_HEIGHT) {
        next = room.links.up;
      } else {
        return room;
      }
      if (!this.level.rooms[next]) {
        return null;
      }
      point.room = next;
    }
    return null;
  },

  advanceBottle: function (bottle, distance) {
    let steps = Math.max(1, Math.ceil(distance / 2));
    let step = distance / steps;
    for (let i = 0; i < steps; i++) {
      let previousY = bottle.y;
      bottle.y += step;
      let room = this.resolveRoom(bottle);
      if (!room) {
        return false;
      }
      let obstacle = PrinceJS.RangedWeapon.prototype.obstacleAt.call(this, bottle, room);
      if (obstacle) {
        this.effects.shatter(bottle.x, previousY, false);
        return false;
      }
      let column = Math.floor((bottle.x - room.x * PrinceJS.ROOM_WIDTH) / PrinceJS.BLOCK_WIDTH);
      let row = Math.floor((bottle.y - room.y * PrinceJS.ROOM_HEIGHT) / PrinceJS.BLOCK_HEIGHT);
      let tile = this.level.getTileAt(column, row, bottle.room);
      let floorY = room.y * PrinceJS.ROOM_HEIGHT + PrinceJS.Utils.convertBlockYtoY(row) + 3;
      if (tile.isWalkable() && previousY + 5 <= floorY && bottle.y + 5 >= floorY) {
        this.ignite(bottle, column, row, floorY);
        return false;
      }
    }
    return true;
  },

  ignite: function (bottle, column, row, floorY) {
    this.effects.shatter(bottle.x, floorY - 3, true);
    this.game.sound.play("LooseFloorLands", 0.4);
    if (this.fires.length >= 16) {
      this.fires.shift();
    }
    this.fires.push({
      room: bottle.room,
      column: column,
      row: row,
      x: bottle.x,
      y: floorY,
      age: 0,
      life: PrinceJS.Molotov.FIRE_DURATION,
      radius: 27
    });
  },

  fireCanReach: function (fire, x, y) {
    let sourceY = fire.y - 12;
    let distance = Math.hypot(x - fire.x, y - sourceY);
    let steps = Math.max(1, Math.ceil(distance / 2));
    let point = { room: fire.room, x: fire.x, y: sourceY };
    for (let i = 0; i <= steps; i++) {
      point.x = fire.x + ((x - fire.x) * i) / steps;
      point.y = sourceY + ((y - sourceY) * i) / steps;
      let room = this.resolveRoom(point);
      if (!room || PrinceJS.RangedWeapon.prototype.obstacleAt.call(this, point, room)) {
        return false;
      }
      let row = Math.floor((point.y - room.y * PrinceJS.ROOM_HEIGHT) / PrinceJS.BLOCK_HEIGHT);
      let column = Math.floor((point.x - room.x * PrinceJS.ROOM_WIDTH) / PrinceJS.BLOCK_WIDTH);
      let tile = this.level.getTileAt(column, row, point.room);
      let floorY = room.y * PrinceJS.ROOM_HEIGHT + PrinceJS.Utils.convertBlockYtoY(row) + 3;
      if (tile.isWalkable() && point.y >= floorY) {
        return false;
      }
    }
    return true;
  },

  updateFires: function (delta) {
    for (let [enemy, cooldown] of this.burnCooldowns) {
      cooldown -= delta;
      if (cooldown <= 0 || !enemy.alive) {
        this.burnCooldowns.delete(enemy);
      } else {
        this.burnCooldowns.set(enemy, cooldown);
      }
    }
    this.fires = this.fires.filter((fire) => {
      fire.life -= delta;
      fire.age += delta;
      let tile = this.level.getTileAt(fire.column, fire.row, fire.room);
      if (fire.life <= 0 || !tile || !tile.isWalkable()) {
        return false;
      }
      for (let enemy of this.delegate.enemies) {
        if (
          !enemy.alive ||
          !enemy.active ||
          !enemy.visible ||
          enemy.charFrame === undefined ||
          this.burnCooldowns.has(enemy)
        ) {
          continue;
        }
        let bounds = enemy.getCharBounds();
        let left = enemy.baseX + bounds.x;
        let top = enemy.baseY + bounds.y;
        let targetX = Math.max(left, Math.min(fire.x, left + bounds.width));
        let targetY = Math.max(top, Math.min(fire.y - 12, top + bounds.height));
        if (
          Math.abs(targetX - fire.x) <= fire.radius &&
          top <= fire.y + 1 &&
          top + bounds.height >= fire.y - 22 &&
          this.fireCanReach(fire, targetX, targetY)
        ) {
          PrinceJS.RangedWeapon.prototype.hitEnemy.call(this, enemy);
          this.effects.singe(targetX, targetY);
          // Overlapping pools share a cadence, so repeated bottles cannot deal one hit per render frame.
          this.burnCooldowns.set(enemy, 0.45);
        }
      }
      return true;
    });
  },

  update: function (delta) {
    if (this.destroyed) {
      return;
    }
    delta = Math.max(0, Math.min(Number(delta) || 0, 0.05));
    this.cooldown = Math.max(0, this.cooldown - delta);
    this.checkPickup();
    this.updateThrow(delta);
    this.bottles = this.bottles.filter((bottle) => {
      bottle.age += delta;
      bottle.life -= delta;
      bottle.vy = Math.min(350, bottle.vy + 420 * delta);
      return bottle.life > 0 && this.advanceBottle(bottle, bottle.vy * delta);
    });
    this.updateFires(delta);
    this.effects.update(delta, this.throwState, this.bottles, this.fires);
  },

  destroy: function () {
    if (this.destroyed) {
      return;
    }
    this.finishThrow();
    this.destroyed = true;
    this.bottles.length = 0;
    this.fires.length = 0;
    this.burnCooldowns.clear();
    this.effects.destroy();
  }
};

PrinceJS.Molotov.prototype.constructor = PrinceJS.Molotov;
