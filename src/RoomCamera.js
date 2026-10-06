"use strict";

PrinceJS.RoomCamera = function (delegate) {
  this.delegate = delegate;
  this.camera = delegate.game.camera;
  this.level = delegate.level;
  this.room = null;
  this.rooms = [];
  this.x = 0;
  this.y = 0;
  this.minX = 0;
  this.maxX = 0;
  this.leftMargin = PrinceJS.ROOM_WIDTH * 0.3;
  this.rightMargin = PrinceJS.ROOM_WIDTH * 0.7;
};

PrinceJS.RoomCamera.prototype = {
  setRoom: function (id) {
    let room = this.level.rooms[id];
    if (!room) {
      return;
    }
    // Only a new floor or a disconnected part of the map needs a camera cut.
    let cut = this.room === null || this.y !== room.y || !this.rooms.includes(id);
    let rooms = [id];
    for (let direction of ["left", "right"]) {
      let current = room;
      let step = direction === "left" ? -1 : 1;
      while (this.level.rooms[current.links[direction]]) {
        let nextId = current.links[direction];
        let next = this.level.rooms[nextId];
        if (rooms.includes(nextId) || next.y !== room.y || next.x !== current.x + step) {
          break;
        }
        if (step < 0) {
          rooms.unshift(nextId);
        } else {
          rooms.push(nextId);
        }
        current = next;
      }
    }
    this.rooms = rooms;
    this.minX = this.level.rooms[rooms[0]].x * PrinceJS.ROOM_WIDTH;
    this.maxX = this.level.rooms[rooms[rooms.length - 1]].x * PrinceJS.ROOM_WIDTH;
    this.room = id;
    this.y = room.y;
    if (cut) {
      this.x = room.x * PrinceJS.ROOM_WIDTH;
    }
    this.x = this.clamp(this.x);
    this.apply();
  },

  clamp: function (x) {
    return Math.max(this.minX, Math.min(this.maxX, x));
  },

  update: function (delta) {
    let kid = this.delegate.kid;
    let room = kid && this.level.rooms[kid.room];
    if (this.delegate.blockCamera || !room || room.y !== this.y || kid.exists === false) {
      return;
    }
    // Track the actor's base position, not the frame's shifting arms and feet.
    let worldX = kid.baseX + (kid.charX * PrinceJS.ROOM_WIDTH) / 140;
    let screenX = worldX - this.x;
    let target = this.x;
    if (screenX < this.leftMargin) {
      target = worldX - this.leftMargin;
    } else if (screenX > this.rightMargin) {
      target = worldX - this.rightMargin;
    }
    let dt = Math.max(0, Math.min(Number(delta) || 0, 0.05));
    this.x += (this.clamp(target) - this.x) * (1 - Math.exp(-12 * dt));
    this.x = this.clamp(this.x);
    this.apply();
  },

  apply: function () {
    // Keep subpixel progress internally so Phaser's pixel rounding cannot stall a slow pan.
    this.camera.x = Math.round(this.x * PrinceJS.SCALE_FACTOR);
    this.camera.y = this.y * PrinceJS.ROOM_HEIGHT * PrinceJS.SCALE_FACTOR;
  },

  visibleRooms: function () {
    let left = this.camera.x / PrinceJS.SCALE_FACTOR;
    let right = left + PrinceJS.ROOM_WIDTH;
    return this.rooms.filter((id) => {
      let x = this.level.rooms[id].x * PrinceJS.ROOM_WIDTH;
      return x < right && x + PrinceJS.ROOM_WIDTH > left;
    });
  },

  isRoomVisible: function (id) {
    return this.visibleRooms().includes(id);
  }
};

PrinceJS.RoomCamera.prototype.constructor = PrinceJS.RoomCamera;
