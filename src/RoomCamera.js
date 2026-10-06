"use strict";

PrinceJS.RoomCamera = function (delegate) {
  this.delegate = delegate;
  this.game = delegate.game;
  this.camera = delegate.game.camera;
  this.level = delegate.level;
  this.originalBounds = this.camera.bounds;
  this.originalScale = { x: this.game.world.scale.x, y: this.game.world.scale.y };
  this.scale = PrinceJS.SCALE_FACTOR * PrinceJS.RoomCamera.ZOOM;
  this.game.world.scale.setTo(this.scale, this.scale);
  // Room framing supplies its own limits, including space beyond the map's outer edges.
  this.camera.bounds = null;
  this.viewWidth = this.camera.width / this.scale;
  this.viewHeight = (this.camera.height - PrinceJS.UI_HEIGHT * PrinceJS.SCALE_FACTOR) / this.scale;
  this.paddingX = (this.viewWidth - PrinceJS.ROOM_WIDTH) / 2;
  this.paddingY = (this.viewHeight - PrinceJS.ROOM_HEIGHT) / 2;
  this.room = null;
  this.rooms = [];
  this.allRooms = Object.keys(this.level.rooms).map(Number);
  this.x = 0;
  this.y = 0;
  this.minX = 0;
  this.maxX = 0;
  this.edgeDistance = PrinceJS.ROOM_WIDTH * 0.25;
  this.transition = null;
  this.transitionDuration = 0.45;
};

PrinceJS.RoomCamera.ZOOM = 0.7;

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
    this.minX = this.roomLeft(rooms[0]);
    this.maxX = this.roomLeft(rooms[rooms.length - 1]);
    this.room = id;
    this.y = room.y;
    if (cut) {
      this.x = this.roomLeft(id);
      this.transition = null;
    } else {
      // Entering a neighbor finishes the pan to that room's full frame, even if the Prince stops.
      this.transition = { from: this.x, to: this.roomLeft(id), elapsed: 0 };
    }
    this.x = this.clamp(this.x);
    this.apply();
  },

  roomLeft: function (id) {
    return this.level.rooms[id].x * PrinceJS.ROOM_WIDTH - this.paddingX;
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
    let dt = Math.max(0, Math.min(Number(delta) || 0, 0.05));
    if (this.transition) {
      let pan = this.transition;
      pan.elapsed += dt;
      let progress = Math.min(1, pan.elapsed / this.transitionDuration);
      let ease = progress * progress * (3 - 2 * progress);
      this.x = pan.from + (pan.to - pan.from) * ease;
      if (progress === 1) {
        this.transition = null;
      }
    } else {
      let primary = this.level.rooms[this.room];
      // Preview only the edge the Prince faces; arrival through the opposite edge keeps the new room centered.
      let localX = kid.baseX + (kid.charX * PrinceJS.ROOM_WIDTH) / 140 - primary.x * PrinceJS.ROOM_WIDTH;
      let preview = 0;
      if (kid.charFace < 0 && localX < this.edgeDistance) {
        preview = -this.paddingX * Math.min(1, (this.edgeDistance - localX) / this.edgeDistance);
      } else if (kid.charFace > 0 && localX > PrinceJS.ROOM_WIDTH - this.edgeDistance) {
        preview = this.paddingX * Math.min(1, (localX - PrinceJS.ROOM_WIDTH + this.edgeDistance) / this.edgeDistance);
      }
      // The preview uses only the extra margin, so the primary room stays fully visible before crossing.
      let target = this.clamp(this.roomLeft(this.room) + preview);
      this.x += (target - this.x) * (1 - Math.exp(-12 * dt));
    }
    this.x = this.clamp(this.x);
    this.apply();
  },

  apply: function () {
    // Keep subpixel progress internally so Phaser's pixel rounding cannot stall a slow pan.
    this.camera.x = Math.round(this.x * this.scale);
    this.camera.y = Math.round((this.y * PrinceJS.ROOM_HEIGHT - this.paddingY) * this.scale);
  },

  visibleRooms: function () {
    let left = this.camera.x / this.scale;
    let right = left + this.viewWidth;
    let top = this.camera.y / this.scale;
    let bottom = top + this.viewHeight;
    return this.allRooms.filter((id) => {
      let room = this.level.rooms[id];
      let x = room.x * PrinceJS.ROOM_WIDTH;
      let y = room.y * PrinceJS.ROOM_HEIGHT;
      return x < right && x + PrinceJS.ROOM_WIDTH > left && y < bottom && y + PrinceJS.ROOM_HEIGHT > top;
    });
  },

  isRoomVisible: function (id) {
    return this.visibleRooms().includes(id);
  },

  destroy: function () {
    this.camera.bounds = this.originalBounds;
    this.game.world.scale.setTo(this.originalScale.x, this.originalScale.y);
  }
};

PrinceJS.RoomCamera.prototype.constructor = PrinceJS.RoomCamera;
