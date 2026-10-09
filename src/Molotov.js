"use strict";

PrinceJS.Molotov = function (delegate, direction) {
  this.spec = { id: "molotov", label: "MOLOTOV", owned: "hasMolotov", equipped: "molotovEquipped" };
  this.delegate = delegate;
  this.game = delegate.game;
  this.level = delegate.level;
  this.kid = delegate.kid;
  this.pickup = this.findPickup(direction);
  this.pickup.collected = !!this.kid.hasMolotov;
  this.effects = new PrinceJS.MolotovEffects(this.game, this.kid, this.pickup);
  this.fireKey = delegate.weaponFireKey;
  this.ctrlKey = delegate.weaponCtrlKey;
  this.bottles = [];
  this.oils = [];
  this.fires = [];
  this.burnCooldowns = new Map();
  this.throwState = null;
  this.actionStage = "hidden";
  this.triggerWasDown = false;
  this.cooldown = 0;
  this.destroyed = false;
};

PrinceJS.Molotov.MAX_CHARGE = 1.5;
PrinceJS.Molotov.THROW_DURATION = 0.6;
PrinceJS.Molotov.RELEASE_TIME = 0.42;
PrinceJS.Molotov.FIRE_DURATION = 5.2;

PrinceJS.Molotov.prototype = {
  findPickup: function (direction) {
    let pickup = PrinceJS.RangedWeapon.prototype.findPickup.call(this, direction);
    let room = this.level.rooms[pickup.room];
    let row = Math.floor((pickup.worldY - room.y * PrinceJS.ROOM_HEIGHT) / PrinceJS.BLOCK_HEIGHT);
    let occupied = (this.delegate.weapons || []).filter((weapon) => weapon !== this).map((weapon) => weapon.pickup);
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
    this.equip();
    this.effects.collect();
    this.game.sound.play("UnsheatheSword", 0.5);
    this.delegate.ui.showText("2 MOLOTOV - HOLD CTRL/F, RELEASE", "weapon");
    this.delegate.ui.hideTextTimer = 85;
  },

  canSelect: function () {
    let action = this.kid.specialAction;
    if (action && ["holstering", "throwing"].includes(action.owner.actionStage)) {
      return false;
    }
    return !action || action.owner === this || (this.delegate.weapons || [this]).includes(action.owner);
  },

  equip: function () {
    if (this.destroyed || !this.kid.hasMolotov || !this.kid.alive || !this.canSelect()) {
      return false;
    }
    for (let weapon of this.delegate.weapons || [this]) {
      weapon.cancelAction();
      this.kid[weapon.spec.equipped] = false;
    }
    this.kid.molotovEquipped = true;
    this.kid.activeWeapon = this.spec.id;
    if (this.kid.swordDrawn) {
      this.kid.swordDrawn = false;
      this.kid.action = "stand";
    }
    if (this.kid.sword) {
      this.kid.sword.visible = false;
    }
    return true;
  },

  triggerDown: function () {
    if (
      (this.fireKey && this.fireKey.isDown) ||
      (this.ctrlKey && this.ctrlKey.isDown) ||
      this.game.touchControls?.isDown(17)
    ) {
      return true;
    }
    if (typeof this.kid.keyWeaponAction !== "function" || !this.kid.keyWeaponAction()) {
      return false;
    }
    // Touch/gamepad action still takes nearby potions; Shift stays reserved for movement.
    return ![0, this.kid.charFace].some((offset) => {
      let tile = this.level.getTileAt(this.kid.charBlockX + offset, this.kid.charBlockY, this.kid.room);
      return tile.element === PrinceJS.Level.TILE_POTION;
    });
  },

  beginCharge: function () {
    let kid = this.kid;
    if (
      this.destroyed ||
      this.throwState ||
      this.cooldown > 0 ||
      !kid.hasMolotov ||
      !kid.molotovEquipped ||
      kid.activeWeapon !== this.spec.id ||
      !kid.alive ||
      !kid.active ||
      !kid.visible ||
      kid.inFallDown ||
      kid.inJumpUp ||
      !(
        [
          "hang",
          "hangstraight",
          "stand",
          "startrun",
          "running",
          "runstop",
          "turnrun",
          "stoop",
          "standup",
          "crawl"
        ].includes(kid.action) || /^step\d+$/.test(kid.action)
      ) ||
      !kid.beginSpecialAction(this, "molotov")
    ) {
      return false;
    }
    let hanging = ["hang", "hangstraight"].includes(kid.action);
    let crouched = /stoop|crawl/.test(kid.action);
    let frame = hanging ? kid.charFrame : crouched ? 109 : 15;
    if (!hanging) {
      kid.action = crouched ? "stoop" : "stand";
      kid.actionCode = crouched ? 1 : 0;
    }
    this.throwState = {
      phase: "charging",
      time: 0,
      charge: 0,
      aimUp: typeof kid.keyU === "function" && kid.keyU(),
      hanging: hanging,
      crouched: crouched,
      released: false,
      lighterLit: false,
      action: kid.action,
      room: kid.room,
      x: kid.charX,
      y: kid.charY,
      direction: kid.charFace,
      frame: frame
    };
    this.actionStage = "charging";
    kid.setSpecialActionFrame(hanging ? 91 : frame);
    this.effects.beginThrow(this.throwState);
    // A ledge throw keeps the original one-hand lighter sequence and drops immediately.
    if (hanging) {
      this.releaseThrow();
    }
    return true;
  },

  throwFromHang: function () {
    return ["hang", "hangstraight"].includes(this.kid.action) && this.beginCharge();
  },

  releaseThrow: function () {
    let state = this.throwState;
    if (!state || state.phase !== "charging") {
      return false;
    }
    state.phase = this.actionStage = "throwing";
    state.time = 0;
    state.aimUp = !state.hanging && typeof this.kid.keyU === "function" && this.kid.keyU();
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
      !kid.molotovEquipped ||
      kid.activeWeapon !== this.spec.id ||
      kid.action !== state.action ||
      kid.room !== state.room ||
      kid.charX !== state.x ||
      kid.charY !== state.y ||
      kid.charFace !== state.direction
    ) {
      this.finishThrow();
      return;
    }
    if (state.phase === "charging") {
      state.time += delta;
      state.charge = Math.min(PrinceJS.Molotov.MAX_CHARGE, state.charge + delta);
      state.aimUp = typeof kid.keyU === "function" && kid.keyU();
      if (!this.triggerDown()) {
        this.releaseThrow();
      }
      return;
    }
    state.time += delta;
    if (!state.lighterLit && state.time >= 0.12) {
      state.lighterLit = true;
      this.game.sound.play("FloorButton", 0.25);
    }
    if (!state.released && state.time >= PrinceJS.Molotov.RELEASE_TIME) {
      state.released = true;
      let point = this.effects.getThrowPoint(state);
      // Unlimited bottles after the pickup, with a bounded number of live projectiles.
      if (this.bottles.length < 12) {
        this.bottles.push(PrinceJS.MolotovBallistics.createBottle(this, state, point));
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
    this.actionStage = "hidden";
    this.cooldown = 0.18;
  },

  cancelAction: function () {
    this.finishThrow();
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

  advanceBottle: function (bottle, delta) {
    return PrinceJS.MolotovBallistics.advanceBottle(this, bottle, delta);
  },

  ignite: function (bottle, column, row, floorY) {
    if (bottle.oil) {
      this.effects.singe(bottle.x, floorY - 3);
    } else {
      this.effects.shatter(bottle.x, floorY - 3, true);
      this.game.sound.play("LooseFloorLands", 0.4);
    }
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
      radius: bottle.oil ? 21 : 27
    });
  },

  igniteWall: function (bottle, contact) {
    let surface = contact.surface;
    let normal = contact.normalX;
    this.effects.shatter(bottle.x, bottle.y, true);
    this.game.sound.play("LooseFloorLands", 0.4);
    if (this.fires.length >= 16) {
      this.fires.shift();
    }
    this.fires.push({
      kind: "wall",
      room: surface.room,
      column: surface.tile.roomX,
      row: surface.tile.roomY,
      tile: surface.tile,
      surfaceKind: surface.kind,
      normalX: normal,
      x: normal < 0 ? surface.left : surface.right,
      y: Math.max(surface.top + 4, Math.min(surface.bottom - 1, bottle.y)),
      impactY: bottle.y,
      age: 0,
      life: PrinceJS.Molotov.FIRE_DURATION * 0.8,
      radius: 18
    });
    // Burning oil falls on the exposed side. It discovers the real floor beneath,
    // including gaps and linked lower rooms, rather than placing fire through stone.
    for (let i = 0; i < 3 && this.oils.length < 36; i++) {
      this.oils.push({
        room: bottle.room,
        x: bottle.x + normal * i * 2,
        y: bottle.y - i * 3,
        vx: normal * i * 8,
        vy: 45 + i * 12,
        radius: 1.5,
        oil: true,
        age: 0,
        life: 6
      });
    }
  },

  igniteCeiling: function (bottle, contact) {
    this.effects.shatter(bottle.x, bottle.y, true);
    this.game.sound.play("LooseFloorLands", 0.4);
    // Start on the underside, outside the bottle's swept collision surface.
    // Only the falling oil finds a supporting floor; the ceiling never becomes a pool.
    for (let i = 0; i < 3 && this.oils.length < 36; i++) {
      let oil = {
        room: bottle.room,
        x: bottle.x,
        y: Math.max(bottle.y, contact.surface.bottom + 1.52) + i * 0.8,
        vx: (i - 1) * 12,
        vy: 45 + i * 12,
        radius: 1.5,
        oil: true,
        age: 0,
        life: 6
      };
      if (this.resolveRoom(oil)) {
        this.oils.push(oil);
      }
    }
  },

  updateWallFire: function (fire, tile) {
    if (tile !== fire.tile || !tile.isBarrier()) {
      return false;
    }
    if (!this.bottlePhysics || this.bottlePhysics.level !== this.level) {
      this.bottlePhysics = new PrinceJS.GorePhysics(this.level);
    }
    let surface = this.bottlePhysics
      .surfaces({ room: fire.room, x: fire.x, y: fire.impactY, radius: 20 })
      .find((item) => item.tile === tile && item.kind === fire.surfaceKind);
    if (!surface || surface.bottom - surface.top < 6) {
      return false;
    }
    fire.x = fire.normalX < 0 ? surface.left : surface.right;
    fire.y = Math.max(surface.top + 4, Math.min(surface.bottom - 1, fire.impactY));
    fire.top = surface.top;
    fire.bottom = surface.bottom;
    return true;
  },

  fireCanReach: function (fire, x, y) {
    let sourceX = fire.kind === "wall" ? fire.x + fire.normalX * 5 : fire.x;
    let sourceY = fire.kind === "wall" ? fire.y : fire.y - 12;
    let distance = Math.hypot(x - sourceX, y - sourceY);
    let steps = Math.max(1, Math.ceil(distance / 2));
    let point = { room: fire.room, x: sourceX, y: sourceY };
    for (let i = 0; i <= steps; i++) {
      point.x = sourceX + ((x - sourceX) * i) / steps;
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
      let wall = fire.kind === "wall";
      if (fire.life <= 0 || !tile || (wall ? !this.updateWallFire(fire, tile) : !tile.isWalkable())) {
        return false;
      }
      let sourceX = wall ? fire.x + fire.normalX * 5 : fire.x;
      let sourceY = wall ? fire.y : fire.y - 12;
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
        let targetX = Math.max(left, Math.min(sourceX, left + bounds.width));
        let targetY = Math.max(top, Math.min(sourceY, top + bounds.height));
        if (
          Math.abs(targetX - sourceX) <= fire.radius &&
          top <= fire.y + (wall ? 18 : 1) &&
          top + bounds.height >= fire.y - (wall ? 18 : 22) &&
          this.fireCanReach(fire, targetX, targetY)
        ) {
          if (this.delegate.burningEnemyEffects) {
            this.delegate.burningEnemyEffects.ignite(enemy, {
              x: targetX,
              y: targetY,
              room: fire.room,
              direction: this.kid.charFace,
              weapon: "molotov"
            });
          } else {
            PrinceJS.RangedWeapon.prototype.hitEnemy.call(this, enemy);
          }
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
    let requested = this.triggerDown();
    if (requested && !this.triggerWasDown && !this.throwState) {
      this.beginCharge();
    }
    this.triggerWasDown = requested;
    this.updateThrow(delta);
    this.bottles = this.bottles.filter((bottle) => this.advanceBottle(bottle, delta));
    this.oils = this.oils.filter((oil) => this.advanceBottle(oil, delta));
    this.updateFires(delta);
    this.effects.update(delta, this.throwState, this.bottles, this.fires, this.oils);
  },

  destroy: function () {
    if (this.destroyed) {
      return;
    }
    this.finishThrow();
    this.destroyed = true;
    this.bottles.length = 0;
    this.oils.length = 0;
    this.fires.length = 0;
    this.burnCooldowns.clear();
    this.effects.destroy();
  }
};

PrinceJS.Molotov.prototype.constructor = PrinceJS.Molotov;
