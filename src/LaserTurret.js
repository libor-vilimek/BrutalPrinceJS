"use strict";

// The shadow's gate in the original level 6 has its own point defence.
PrinceJS.LaserTurret = function (delegate, gate) {
  this.level = delegate.level;
  this.gate = gate;
  this.room = gate.room;
  let room = this.level.rooms[this.room];
  this.x = room.x * PrinceJS.ROOM_WIDTH + gate.getBounds().x + 2;
  this.y = room.y * PrinceJS.ROOM_HEIGHT + gate.roomY * PrinceJS.BLOCK_HEIGHT - 14;
  this.aim = 0.5;
  this.shots = [];
  this.graphics = delegate.game.add.graphics(0, 0);
  this.graphics.z = 31;
  this.draw();
};

PrinceJS.LaserTurret.create = function (delegate) {
  if (PrinceJS.currentLevel !== 6 || delegate.level.number !== 6 || !delegate.specialEvents) {
    return null;
  }
  let gate = delegate.level.getTileAt(2, 1, 1);
  return gate && gate.element === PrinceJS.Level.TILE_GATE ? new PrinceJS.LaserTurret(delegate, gate) : null;
};

PrinceJS.LaserTurret.prototype = {
  intercept: function (rocket) {
    if (this.destroyed || rocket.room !== this.room) {
      return false;
    }
    let room = this.level.rooms[this.room];
    let row = Math.floor((rocket.y - room.y * PrinceJS.ROOM_HEIGHT) / PrinceJS.BLOCK_HEIGHT);
    let offset = rocket.x - this.x;
    if (row !== this.gate.roomY || Math.abs(offset) > 96 || (offset * rocket.direction > 0 && Math.abs(offset) > 4)) {
      return false;
    }
    this.aim = Math.atan2(rocket.y - this.y, offset);
    this.shots.push({ x: rocket.x, y: rocket.y, age: 0 });
    this.draw();
    // Disintegrate the rocket without its damaging blast or a gate collision.
    return true;
  },

  update: function (delta) {
    if (this.destroyed) {
      return;
    }
    for (let shot of this.shots) {
      shot.age += Math.max(0, Math.min(delta, 0.05));
    }
    this.shots = this.shots.filter((shot) => shot.age < 0.3);
    this.draw();
  },

  draw: function () {
    let g = this.graphics;
    g.clear();
    const rect = (color, x, y, width, height, alpha = 1) => {
      g.beginFill(color, alpha);
      g.drawRect(Math.round(x), Math.round(y), width, height);
      g.endFill();
    };
    let x = this.x;
    let y = this.y;
    // Compact steel housing, brass mounting plate and a cyan emitter.
    rect(0x362b29, x - 13, y - 14, 26, 6);
    rect(0xc49a56, x - 12, y - 14, 24, 2);
    rect(0x83959a, x - 4, y - 8, 8, 7);
    rect(0x172b38, x - 10, y - 4, 20, 11);
    rect(0x5b707c, x - 9, y - 4, 18, 3);
    rect(0xa1b7bd, x - 7, y - 3, 5, 1);
    rect(0x37c7db, x - 7, y + 3, 3, 2);
    let tipX = Math.round(x + Math.cos(this.aim) * 13);
    let tipY = Math.round(y + Math.sin(this.aim) * 13);
    g.lineStyle(6, 0x172b38, 1);
    g.moveTo(x, y);
    g.lineTo(tipX, tipY);
    g.lineStyle(2, 0x9bb4bf, 1);
    g.moveTo(x, y - 1);
    g.lineTo(tipX, tipY - 1);
    g.lineStyle(0);
    rect(0x8ef9ff, tipX - 1, tipY - 1, 3, 3);
    for (let shot of this.shots) {
      let fade = 1 - shot.age / 0.3;
      if (shot.age < 0.16) {
        g.lineStyle(3, 0x18d9ee, fade * 0.65);
        g.moveTo(x, y);
        g.lineTo(shot.x, shot.y);
        g.lineStyle(1, 0xe4ffff, fade);
        g.moveTo(x, y);
        g.lineTo(shot.x, shot.y);
        g.lineStyle(0);
      }
      rect(0xffffff, shot.x - 2, shot.y - 2, 4, 4, fade);
      for (let i = 0; i < 8; i++) {
        let angle = (i * Math.PI) / 4;
        let radius = 3 + shot.age * (28 + (i % 3) * 12);
        rect(
          i % 2 ? 0xffb454 : 0x8ef9ff,
          shot.x + Math.cos(angle) * radius,
          shot.y + Math.sin(angle) * radius + shot.age * shot.age * 80,
          2,
          2,
          fade
        );
      }
    }
  },

  destroy: function () {
    this.destroyed = true;
    this.shots = [];
    this.graphics.destroy();
  }
};
