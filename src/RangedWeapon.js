"use strict";

PrinceJS.RangedWeapon = function (delegate, direction, spec) {
  this.spec = spec;
  this.delegate = delegate;
  this.game = delegate.game;
  this.level = delegate.level;
  this.kid = delegate.kid;
  this.pickup = this.findPickup(direction);
  this.effects = new spec.effects(this.game, this.kid, this.pickup);
  this.fireKey = delegate.weaponFireKey;
  this.bullets = [];
  this.projectileId = 0;
  this.cooldown = 0;
  this.equipTime = 0;
  this.firing = false;
  this.tracers = this.game.add.graphics(0, 0);
  this.tracers.z = 24;
};

PrinceJS.RangedWeapon.prototype = {
  findPickup: function (direction) {
    let room = this.level.rooms[this.kid.room];
    let column = Math.max(0, Math.min(9, this.kid.charBlockX));
    let row = this.kid.charBlockY;
    // Some levels start in midair. Put the weapon beside the landing, not over the pit.
    while (row < 2 && !this.level.getTileAt(column, row, this.kid.room).isWalkable()) {
      row++;
    }
    let safe = (x, y) => {
      let tile = this.level.getTileAt(x, y, this.kid.room);
      return (
        x >= 0 &&
        x < 10 &&
        tile.isSafeWalkable() &&
        !tile.isBarrier() &&
        ![
          PrinceJS.Level.TILE_SPIKES,
          PrinceJS.Level.TILE_POTION,
          PrinceJS.Level.TILE_SWORD,
          PrinceJS.Level.TILE_SKELETON,
          PrinceJS.Level.TILE_EXIT_LEFT,
          PrinceJS.Level.TILE_EXIT_RIGHT
        ].includes(tile.element)
      );
    };
    let candidates = [column + direction, column - direction, column];
    let chosen = candidates.find((x) => safe(x, row));
    if (chosen === undefined) {
      // Custom spawns can be surrounded by hazards; find the nearest safe floor in their room.
      let floors = [];
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 10; x++) {
          if (safe(x, y)) {
            floors.push({ x, y, distance: Math.abs(x - column) + Math.abs(y - row) * 10 });
          }
        }
      }
      floors.sort((a, b) => a.distance - b.distance);
      if (floors.length) {
        chosen = floors[0].x;
        row = floors[0].y;
      } else {
        chosen = column;
      }
    }
    return {
      room: this.kid.room,
      worldX: room.x * PrinceJS.ROOM_WIDTH + chosen * PrinceJS.BLOCK_WIDTH + 16,
      worldY: room.y * PrinceJS.ROOM_HEIGHT + PrinceJS.Utils.convertBlockYtoY(row) + 3,
      collected: false
    };
  },

  update: function (delta) {
    if (this.destroyed) {
      return;
    }
    delta = Math.max(0, Math.min(delta, 0.05));
    this.cooldown = Math.max(0, this.cooldown - delta);
    this.equipTime = Math.max(0, this.equipTime - delta);
    this.checkPickup();
    let muzzle = this.effects.getMuzzle();
    this.firing = this.canFire() && muzzle.visible !== false && this.triggerDown();
    this.advanceBullets(delta);
    if (this.firing && this.cooldown === 0) {
      this.fire(muzzle);
      this.cooldown = this.spec.interval;
    }
    this.updateEffects(delta);
    this.drawBullets();
  },

  updateEffects: function (delta) {
    this.effects.update(delta, this.firing);
  },

  checkPickup: function () {
    if (
      this.pickup.collected ||
      !this.kid.alive ||
      !this.kid.visible ||
      this.kid.inFallDown ||
      this.kid.inJumpUp ||
      /hang|climb|jump|fall/.test(this.kid.action)
    ) {
      return;
    }
    let x = this.kid.baseX + PrinceJS.Utils.convertX(this.kid.charX);
    let y = this.kid.baseY + this.kid.charY;
    // The Prince can switch room IDs before his feet cross a doorway. Use world proximity.
    if (Math.abs(x - this.pickup.worldX) > this.spec.pickupRadius || Math.abs(y - this.pickup.worldY) > 7) {
      return;
    }
    this.kid[this.spec.owned] = true;
    this.equip();
    this.pickup.collected = true;
    this.equipTime = 0.45;
    this.effects.collect();
    this.game.sound.play("UnsheatheSword");
    this.delegate.ui.showText(this.spec.label + " - F FIRE / CTRL HIDE", "weapon");
    this.delegate.ui.hideTextTimer = 75;
  },

  toggleEquipped: function () {
    if (!this.kid[this.spec.owned] || !this.kid.alive) {
      return;
    }
    if (this.kid[this.spec.equipped]) {
      this.kid[this.spec.equipped] = false;
    } else {
      this.equip();
    }
    this.firing = false;
    this.equipTime = Math.max(this.equipTime, 0.2);
    this.delegate.ui.showText(
      this.spec.label + (this.kid[this.spec.equipped] ? " READY - CTRL TO HIDE" : " HIDDEN - CTRL TO EQUIP"),
      "weapon"
    );
    this.delegate.ui.hideTextTimer = 40;
  },

  equip: function () {
    if (!this.kid[this.spec.owned] || !this.kid.alive) {
      return;
    }
    for (let weapon of this.delegate.weapons || [this]) {
      this.kid[weapon.spec.equipped] = false;
      weapon.firing = false;
    }
    this.kid[this.spec.equipped] = true;
    this.kid.activeWeapon = this.spec.id;
    this.equipTime = Math.max(this.equipTime, 0.2);
    if (this.kid.swordDrawn) {
      this.kid.swordDrawn = false;
      this.kid.action = "stand";
    }
    this.kid.sword.visible = false;
  },

  canFire: function () {
    return (
      this.kid[this.spec.owned] &&
      this.kid[this.spec.equipped] &&
      this.kid.alive &&
      this.kid.visible &&
      this.kid.active &&
      this.equipTime === 0 &&
      !this.kid.inFallDown &&
      !this.kid.inJumpUp &&
      !this.kid.pickupPotion &&
      !this.kid.pickupSword &&
      (["stand", "startrun", "running", "runstop", "turnrun", "stoop", "standup", "crawl"].includes(this.kid.action) ||
        /^step\d+$/.test(this.kid.action))
    );
  },

  triggerDown: function () {
    if (this.fireKey.isDown) {
      return true;
    }
    if (!this.kid.keyS()) {
      return false;
    }
    // Keep the existing action button available for potions.
    return ![0, this.kid.charFace].some((offset) => {
      let tile = this.level.getTileAt(this.kid.charBlockX + offset, this.kid.charBlockY, this.kid.room);
      return tile.element === PrinceJS.Level.TILE_POTION;
    });
  },

  fire: function (muzzle) {
    this.effects.shot(muzzle.x, muzzle.y, muzzle.direction);
    this.playShotSound();
    let bullet = {
      id: this.projectileId++,
      room: this.kid.room,
      x: this.kid.baseX + PrinceJS.Utils.convertX(this.kid.charX),
      y: muzzle.y,
      direction: muzzle.direction,
      life: this.spec.lifetime,
      age: 0
    };
    // Sweep from the body to the muzzle too: a long barrel must not shoot through a nearby wall.
    if (this.advanceBullet(bullet, Math.abs(muzzle.x - bullet.x))) {
      if (this.bullets.length < this.spec.maxProjectiles) {
        this.bullets.push(bullet);
      }
    }
  },

  advanceBullets: function (delta) {
    this.bullets = this.bullets.filter((bullet) => {
      bullet.life -= delta;
      bullet.age += delta;
      return bullet.life > 0 && this.advanceBullet(bullet, this.spec.speed * delta);
    });
  },

  advanceBullet: function (bullet, distance) {
    // Two-pixel sweeps catch thin gates and enemies even during a slow render frame.
    let steps = Math.max(1, Math.ceil(distance / 2));
    let step = (distance / steps) * bullet.direction;
    for (let i = 0; i < steps; i++) {
      let previousX = bullet.x;
      let previousRoom = bullet.room;
      bullet.x += step;
      let room = this.level.rooms[bullet.room];
      if (!room) {
        return false;
      }
      if (bullet.x < room.x * PrinceJS.ROOM_WIDTH || bullet.x >= (room.x + 1) * PrinceJS.ROOM_WIDTH) {
        bullet.room = bullet.x < room.x * PrinceJS.ROOM_WIDTH ? room.links.left : room.links.right;
        room = this.level.rooms[bullet.room];
        if (!room) {
          bullet.x = previousX;
          bullet.room = previousRoom;
          this.impact(bullet);
          return false;
        }
      }
      let obstacle = this.obstacleAt(bullet, room);
      if (obstacle) {
        bullet.x = previousX;
        bullet.room = previousRoom;
        this.impact(bullet, null, obstacle);
        return false;
      }
      for (let enemy of this.delegate.enemies) {
        if (
          !enemy.alive ||
          !enemy.active ||
          !enemy.visible ||
          enemy.room !== bullet.room ||
          enemy.charFrame === undefined
        ) {
          continue;
        }
        let bounds = enemy.getCharBounds();
        let left = enemy.baseX + bounds.x;
        let top = enemy.baseY + bounds.y;
        if (bullet.x >= left && bullet.x <= left + bounds.width && bullet.y >= top && bullet.y <= top + bounds.height) {
          this.impact(bullet, enemy);
          return false;
        }
      }
    }
    return true;
  },

  impact: function (bullet, enemy) {
    if (enemy) {
      this.hitEnemy(enemy);
    }
    this.effects.impact(bullet.x, bullet.y, !!enemy && enemy.charName !== "skeleton");
  },

  blockedAt: function (bullet, room) {
    return !!this.obstacleAt(bullet, room);
  },

  obstacleAt: function (bullet, room) {
    let localX = bullet.x - room.x * PrinceJS.ROOM_WIDTH;
    let localY = bullet.y - room.y * PrinceJS.ROOM_HEIGHT;
    let row = Math.floor(localY / PrinceJS.BLOCK_HEIGHT);
    let column = Math.floor(localX / PrinceJS.BLOCK_WIDTH);
    if (row < 0 || row > 2) {
      return this.level.dummyWall;
    }
    let tile = this.level.getTileAt(column, row, bullet.room);
    if (!tile || tile.element === PrinceJS.Level.TILE_WALL) {
      return tile || this.level.dummyWall;
    }
    // Gate posts sit just beyond their tile. Test the neighboring tile as well.
    for (let x = column - 1; x <= column; x++) {
      let barrier = this.level.getTileAt(x, row, bullet.room);
      if (!barrier || barrier.element === PrinceJS.Level.TILE_WALL || !barrier.isBarrier()) {
        continue;
      }
      let bounds = barrier.getBounds();
      // A tile reached through the left room has coordinates relative to that room.
      let barrierRoom = this.level.rooms[barrier.room];
      if (!barrierRoom) {
        continue;
      }
      let left = barrierRoom.x * PrinceJS.ROOM_WIDTH + bounds.x;
      let top = barrierRoom.y * PrinceJS.ROOM_HEIGHT + bounds.y + 3;
      if (bullet.x >= left && bullet.x <= left + bounds.width && bullet.y >= top && bullet.y <= top + bounds.height) {
        return barrier;
      }
    }
    return null;
  },

  hitEnemy: function (enemy) {
    if (enemy.room === this.kid.room) {
      this.delegate.ui.setOpponentLive(enemy);
    }
    enemy.opponent = this.kid;
    enemy.startFight = true;
    // Preserve the original health signals, death animations, and special enemy rules.
    enemy.damageLife();
    if (enemy.alive && !enemy.inFallDown && !enemy.inJumpUp) {
      enemy.action = "stabbed";
    }
  },

  drawBullets: function () {
    this.tracers.clear();
    for (let bullet of this.bullets) {
      let x = Math.round(bullet.x);
      let y = Math.round(bullet.y);
      this.tracers.beginFill(0xffa52b, 0.45);
      this.tracers.drawRect(x - (bullet.direction > 0 ? 10 : 0), y - 1, 10, 3);
      this.tracers.endFill();
      this.tracers.beginFill(0xfff5ae, 1);
      this.tracers.drawRect(x - (bullet.direction > 0 ? 6 : 0), y, 6, 1);
      this.tracers.endFill();
    }
  },

  playShotSound: function () {},

  destroy: function () {
    this.destroyed = true;
    this.firing = false;
    this.bullets.length = 0;
    this.effects.destroy();
    this.tracers.destroy();
  }
};
