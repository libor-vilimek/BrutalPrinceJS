"use strict";

// Cosmetic body pieces and blood use the same physical surfaces as the level.
// Coordinates are unscaled world pixels, so effects keep moving across room links.
PrinceJS.GorePhysics = function (level) {
  this.level = level;
};

PrinceJS.GorePhysics.prototype = {
  resolveRoom: function (point) {
    for (let i = 0; i < 16; i++) {
      let room = this.level.rooms[point.room];
      if (!room) {
        return null;
      }
      let next;
      if (point.x < room.x * PrinceJS.ROOM_WIDTH) {
        next = room.links.left;
      } else if (point.x >= (room.x + 1) * PrinceJS.ROOM_WIDTH) {
        next = room.links.right;
      } else if (point.y < room.y * PrinceJS.ROOM_HEIGHT) {
        next = room.links.up;
      } else if (point.y >= (room.y + 1) * PrinceJS.ROOM_HEIGHT) {
        next = room.links.down;
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

  nearbyRooms: function (piece) {
    let radius = Math.max(1, Number(piece.radius) || 1) + 3;
    let found = new Set();
    let visit = (id, depth) => {
      let room = this.level.rooms[id];
      if (!room || found.has(id)) {
        return;
      }
      let left = room.x * PrinceJS.ROOM_WIDTH;
      let top = room.y * PrinceJS.ROOM_HEIGHT;
      if (
        piece.x + radius < left ||
        piece.x - radius > left + PrinceJS.ROOM_WIDTH ||
        piece.y + radius < top ||
        piece.y - radius > top + PrinceJS.ROOM_HEIGHT
      ) {
        return;
      }
      found.add(id);
      if (depth > 0) {
        for (let direction of ["left", "right", "up", "down"]) {
          visit(room.links[direction], depth - 1);
        }
      }
    };
    visit(piece.room, 2);
    return [...found];
  },

  surfaces: function (piece) {
    let surfaces = [];
    let radius = Math.max(1, Number(piece.radius) || 1) + 3;
    for (let id of this.nearbyRooms(piece)) {
      let room = this.level.rooms[id];
      let originX = room.x * PrinceJS.ROOM_WIDTH;
      let originY = room.y * PrinceJS.ROOM_HEIGHT;
      let rect = (left, top, width, height, tile, kind) => {
        surfaces.push({ left, top, right: left + width, bottom: top + height, tile, room: id, kind });
      };
      // Missing links are sealed. A room elsewhere in the grid is not an opening.
      if (!this.level.rooms[room.links.left]) {
        rect(originX - 4, originY, 4, PrinceJS.ROOM_HEIGHT, this.level.dummyWall, "wall");
      }
      if (!this.level.rooms[room.links.right]) {
        rect(originX + PrinceJS.ROOM_WIDTH, originY, 4, PrinceJS.ROOM_HEIGHT, this.level.dummyWall, "wall");
      }
      if (!this.level.rooms[room.links.up]) {
        rect(originX, originY - 4, PrinceJS.ROOM_WIDTH, 4, this.level.dummyWall, "ceiling");
      }
      if (!this.level.rooms[room.links.down]) {
        rect(originX, originY + PrinceJS.ROOM_HEIGHT, PrinceJS.ROOM_WIDTH, 4, this.level.dummyWall, "floor");
      }
      let firstColumn = Math.max(0, Math.floor((piece.x - radius - originX) / PrinceJS.BLOCK_WIDTH) - 1);
      let lastColumn = Math.min(9, Math.floor((piece.x + radius - originX) / PrinceJS.BLOCK_WIDTH));
      let firstRow = Math.max(0, Math.floor((piece.y - radius - originY) / PrinceJS.BLOCK_HEIGHT) - 1);
      let lastRow = Math.min(2, Math.floor((piece.y + radius - originY) / PrinceJS.BLOCK_HEIGHT) + 1);
      for (let row = firstRow; row <= lastRow; row++) {
        for (let column = firstColumn; column <= lastColumn; column++) {
          let tile = this.level.getTileAt(column, row, id);
          if (!tile) {
            continue;
          }
          let left = originX + column * PrinceJS.BLOCK_WIDTH;
          let top = originY + row * PrinceJS.BLOCK_HEIGHT;
          if (tile.element === PrinceJS.Level.TILE_WALL) {
            rect(left, top, PrinceJS.BLOCK_WIDTH, PrinceJS.BLOCK_HEIGHT, tile, "wall");
            continue;
          }
          if (tile.isWalkable()) {
            rect(left, top + PrinceJS.BLOCK_HEIGHT - 7, PrinceJS.BLOCK_WIDTH, 7, tile, "floor");
          }
          if (tile.isBarrier() && tile.getBounds) {
            let bounds = tile.getBounds();
            if (bounds.width > 0 && bounds.height > 0) {
              rect(originX + bounds.x, originY + bounds.y + 3, bounds.width, bounds.height, tile, "barrier");
            }
          }
          if (tile.element === PrinceJS.Level.TILE_EXIT_RIGHT && !tile.destroyedByRocket && !tile.open) {
            rect(left + 10, top + 3, 12, PrinceJS.BLOCK_HEIGHT - 10, tile, "barrier");
          }
        }
      }
    }
    return surfaces;
  },

  supportAt: function (piece) {
    let radius = Math.max(1, Number(piece.radius) || 1);
    return this.surfaces(piece).find(
      (surface) =>
        Math.abs(piece.y + radius - surface.top) <= 0.35 &&
        piece.x + radius > surface.left + 0.01 &&
        piece.x - radius < surface.right - 0.01
    );
  },

  projectInside: function (piece, contacts, bounceX, bounceY) {
    // Impact trails can be emitted exactly on a wall face. Move their radius out
    // of the material first instead of letting them originate inside the wall.
    let radius = Math.max(1, Number(piece.radius) || 1);
    for (let i = 0; i < 16; i++) {
      let correction = null;
      for (let surface of this.surfaces(piece)) {
        if (
          piece.x + radius <= surface.left + 0.001 ||
          piece.x - radius >= surface.right - 0.001 ||
          piece.y + radius <= surface.top + 0.001 ||
          piece.y - radius >= surface.bottom - 0.001
        ) {
          continue;
        }
        let candidates = [
          { amount: piece.x + radius - surface.left, normalX: -1, normalY: 0 },
          { amount: surface.right - piece.x + radius, normalX: 1, normalY: 0 },
          { amount: piece.y + radius - surface.top, normalX: 0, normalY: -1 },
          { amount: surface.bottom - piece.y + radius, normalX: 0, normalY: 1 }
        ];
        for (let candidate of candidates) {
          if (!correction || candidate.amount < correction.amount) {
            correction = Object.assign({ surface }, candidate);
          }
        }
      }
      if (!correction) {
        return;
      }
      piece.x += correction.amount * correction.normalX;
      piece.y += correction.amount * correction.normalY;
      let surface = correction.surface;
      contacts.push({
        x: piece.x - correction.normalX * radius,
        y: piece.y - correction.normalY * radius,
        normalX: correction.normalX,
        normalY: correction.normalY,
        room: surface.room,
        tile: surface.tile,
        kind: surface.kind,
        surface
      });
      if (correction.normalX && piece.vx * correction.normalX < 0) {
        piece.vx *= -bounceX;
      }
      if (correction.normalY && piece.vy * correction.normalY < 0) {
        piece.vy *= -bounceY;
      }
    }
  },

  moveAxis: function (piece, distance, axis, contacts, bounce) {
    if (!distance) {
      return;
    }
    let radius = Math.max(1, Number(piece.radius) || 1);
    let previous = piece[axis];
    let target = previous + distance;
    let nearest = null;
    for (let surface of this.surfaces(piece)) {
      let low = axis === "x" ? surface.left : surface.top;
      let high = axis === "x" ? surface.right : surface.bottom;
      let across = axis === "x" ? piece.y : piece.x;
      let acrossLow = axis === "x" ? surface.top : surface.left;
      let acrossHigh = axis === "x" ? surface.bottom : surface.right;
      if (across + radius <= acrossLow + 0.001 || across - radius >= acrossHigh - 0.001) {
        continue;
      }
      let hit =
        distance > 0
          ? previous + radius <= low + 0.001 && target + radius >= low
          : previous - radius >= high - 0.001 && target - radius <= high;
      if (hit) {
        let coordinate = distance > 0 ? low - radius : high + radius;
        if (!nearest || Math.abs(coordinate - previous) < Math.abs(nearest.coordinate - previous)) {
          nearest = { coordinate, surface };
        }
      }
    }
    if (nearest) {
      piece[axis] = nearest.coordinate;
      let normal = distance > 0 ? -1 : 1;
      let surface = nearest.surface;
      let contact = {
        x: axis === "x" ? piece.x - normal * radius : Math.max(surface.left, Math.min(piece.x, surface.right)),
        y: axis === "y" ? piece.y - normal * radius : Math.max(surface.top, Math.min(piece.y, surface.bottom)),
        normalX: axis === "x" ? normal : 0,
        normalY: axis === "y" ? normal : 0,
        room: surface.room,
        tile: surface.tile,
        kind: surface.kind,
        surface
      };
      if (
        !contacts.some(
          (previousContact) =>
            previousContact.tile === contact.tile &&
            previousContact.room === contact.room &&
            previousContact.normalX === contact.normalX &&
            previousContact.normalY === contact.normalY
        )
      ) {
        contacts.push(contact);
      }
      let velocity = axis === "x" ? "vx" : "vy";
      piece[velocity] *= -bounce;
      if (Math.abs(piece[velocity]) < (axis === "x" ? 3 : 18)) {
        piece[velocity] = 0;
      }
    } else {
      piece[axis] = target;
    }
    this.resolveRoom(piece);
  },

  step: function (piece, delta, options = {}) {
    let contacts = [];
    delta = Math.max(0, Math.min(Number(delta) || 0, 1));
    piece.vx = Number(piece.vx) || 0;
    piece.vy = Number(piece.vy) || 0;
    let gravity = options.gravity === undefined ? 340 : Number(options.gravity) || 0;
    let bounceX = Math.max(0, Math.min(Number(options.bounceX) || 0, 1));
    let bounceY = Math.max(0, Math.min(Number(options.bounceY) || 0, 1));
    let friction = Math.max(0, options.friction === undefined ? 220 : Number(options.friction) || 0);
    this.resolveRoom(piece);
    this.projectInside(piece, contacts, bounceX, bounceY);
    if (!this.resolveRoom(piece)) {
      return { contacts, grounded: false, supported: false, invalid: true };
    }
    let steps = Math.max(
      1,
      Math.ceil(((Math.abs(piece.vx) + Math.abs(piece.vy) + Math.abs(gravity) * delta) * delta) / 2)
    );
    let dt = delta / steps;
    for (let i = 0; i < steps; i++) {
      this.moveAxis(piece, piece.vx * dt, "x", contacts, bounceX);
      let distanceY = piece.vy * dt + gravity * dt * dt * 0.5;
      piece.vy += gravity * dt;
      this.moveAxis(piece, distanceY, "y", contacts, bounceY);
      if (piece.vy === 0 && friction > 0 && this.supportAt(piece)) {
        piece.vx = Math.sign(piece.vx) * Math.max(0, Math.abs(piece.vx) - friction * dt);
      }
    }
    let supported = !!this.supportAt(piece);
    piece.grounded = supported && piece.vy === 0;
    return { contacts, grounded: piece.grounded, supported };
  }
};

PrinceJS.GorePhysics.prototype.constructor = PrinceJS.GorePhysics;
