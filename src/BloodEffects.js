"use strict";

PrinceJS.BloodEffects = function (delegate) {
  this.delegate = delegate;
  this.game = delegate.game;
  this.level = delegate.level;
  this.physics = new PrinceJS.GorePhysics(this.level);
  this.particles = [];
  this.decalRooms = new Map();
  this.stainCount = 0;
  this.depthCounts = Array(10).fill(0);
  this.depthCursor = 0;
  this.foregroundStainCount = 0;
  this.masonryCounts = { pillar: 0, above: 0, below: 0 };
  this.drawnPixelCount = 0;
  this.textureMasks = new WeakMap();
  this.maskBitmap = null;
  this.maxParticles = 1000;
  this.spray = this.game.add.graphics(0, 0);
  this.spray.z = 29.5;
};

PrinceJS.BloodEffects.prototype = {
  hit: function (enemy, impact) {
    if (this.destroyed || !enemy || ["skeleton", "shadow"].includes(enemy.charName)) {
      return;
    }
    let x = impact.x;
    let y = impact.y;
    let rocket = impact.weapon === "rocketLauncher";
    if (rocket && enemy.getCharBounds) {
      let bounds = enemy.getCharBounds();
      let left = enemy.baseX + bounds.x;
      let top = enemy.baseY + bounds.y;
      x = Math.max(left + 1, Math.min(x, left + bounds.width - 1));
      y = Math.max(top + 2, Math.min(y, top + bounds.height - 2));
    }
    let direction = rocket ? Math.sign(x - impact.x) || impact.direction : impact.direction;
    this.burst(x, y, enemy.room, {
      direction,
      count: rocket ? 24 : 11,
      strength: rocket ? 1.65 : 1
    });
    let room = this.level.rooms[enemy.room];
    if (room) {
      let row = Number.isFinite(enemy.charBlockY)
        ? enemy.charBlockY
        : Math.floor((y - room.y * PrinceJS.ROOM_HEIGHT) / PrinceJS.BLOCK_HEIGHT);
      let floorY = room.y * PrinceJS.ROOM_HEIGHT + (row + 1) * PrinceJS.BLOCK_HEIGHT - 7;
      this.splashMasonry(x, y, enemy.room, floorY, direction, rocket ? 1.65 : 1);
    }
  },

  burst: function (x, y, room, options = {}) {
    if (this.destroyed || !this.level.rooms[room]) {
      return;
    }
    let strength = Math.max(0.15, Number(options.strength) || 1);
    let direction = Math.sign(options.direction) || 1;
    let count = Math.max(0, Math.min(Math.floor(options.count === undefined ? 12 : options.count), 80));
    count = Math.min(count, this.maxParticles - this.particles.length);
    for (let i = 0; i < count; i++) {
      let vx = options.vx === undefined ? direction * (55 + Math.random() * 95) * strength : Number(options.vx) || 0;
      let vy = options.vy === undefined ? -(25 + Math.random() * 100) * strength : Number(options.vy) || 0;
      let depthLayer =
        options.depthLayer === undefined ? this.depthCursor : Math.max(0, Math.min(9, Math.floor(options.depthLayer)));
      this.depthCursor = (this.depthCursor + 7) % 10;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 2,
        y: y + (Math.random() - 0.5) * 3,
        vx: vx + (Math.random() - 0.5) * 85 * strength,
        vy: vy + (Math.random() - 0.5) * 45 * strength,
        room,
        radius: i % 4 === 0 ? 1.5 : 1,
        age: 0,
        life: 10,
        size: i % 4 === 0 ? 2 : 1,
        depthLayer,
        color: i % 3 === 0 ? 0xea3c35 : i % 3 === 1 ? 0xb82227 : 0x7a101b
      });
    }
  },

  roomDecals: function (id) {
    let layer = this.decalRooms.get(id);
    if (layer) {
      return layer;
    }
    let room = this.level.rooms[id];
    if (!room) {
      return null;
    }
    // Real tile fronts overlap their cells; room-edge overhangs remain drawable.
    let padding = 32;
    let bitmap = this.game.add.bitmapData(PrinceJS.ROOM_WIDTH + padding * 2, PrinceJS.ROOM_HEIGHT + padding * 2);
    bitmap.smoothed = false;
    let x = room.x * PrinceJS.ROOM_WIDTH - padding;
    let y = room.y * PrinceJS.ROOM_HEIGHT - padding;
    let sprite = this.game.add.sprite(x, y, bitmap);
    sprite.smoothed = false;
    sprite.z = 30.5;
    if (this.level.front && this.level.front.add) {
      // Phaser sort rewrites world z values to child indices. Keeping ink inside
      // the terrain group guarantees it stays above stone even in crowded rooms.
      this.level.front.add(sprite);
    }
    layer = {
      bitmap,
      sprite,
      x,
      y,
      stainCount: 0,
      depthCounts: Array(10).fill(0),
      floorDepths: new Map(),
      foregroundStainCount: 0,
      drawnPixelCount: 0,
      revision: 0
    };
    this.decalRooms.set(id, layer);
    if (!this.level.front && this.game.world && this.game.world.sort) {
      this.game.world.sort("z");
    }
    return layer;
  },

  floorDepth: function (layer, depth) {
    let floor = layer.floorDepths.get(depth);
    if (!floor) {
      let bitmap = this.game.add.bitmapData(layer.bitmap.width, layer.bitmap.height);
      bitmap.smoothed = false;
      let sprite = this.game.add.sprite(layer.x, layer.y, bitmap);
      sprite.smoothed = false;
      // Floor blood is behind feet and bodies; blood on tile fronts is above them.
      sprite.z = 19.5 + depth * 0.01;
      if (this.level.back && this.level.back.add) {
        sprite.bloodDepth = depth;
        this.level.back.add(sprite);
        let index = this.level.back.children.findIndex(
          (child) => child !== sprite && child.bloodDepth !== undefined && child.bloodDepth > depth
        );
        if (index >= 0) {
          this.level.back.setChildIndex(sprite, index);
        }
      }
      floor = { bitmap, sprite, depthLayer: depth, revision: 0, drawnPixelCount: 0 };
      layer.floorDepths.set(depth, floor);
      if (!this.level.back && this.game.world && this.game.world.sort) {
        this.game.world.sort("z");
      }
    }
    return floor;
  },

  depthOffset: function (depth) {
    let y = Math.max(0, Math.min(9, depth)) - 5;
    return { x: -y * 2, y };
  },

  depthColor: function (color, depth) {
    let value = Number.parseInt(color.slice(1), 16);
    let brightness = 0.72 + Math.max(0, Math.min(9, depth)) * (0.28 / 9);
    let red = Math.round(((value >> 16) & 255) * brightness);
    let green = Math.round(((value >> 8) & 255) * brightness);
    let blue = Math.round((value & 255) * brightness);
    return "#" + ((red << 16) | (green << 8) | blue).toString(16).padStart(6, "0");
  },

  textureMask: function (sprite) {
    let texture = sprite && sprite.texture;
    let source = texture && texture.baseTexture && texture.baseTexture.source;
    let crop = texture && texture.crop;
    if (!source || !crop || !crop.width || !crop.height || !this.game.make || !this.game.make.bitmapData) {
      return null;
    }
    let masks = this.textureMasks.get(source);
    if (!masks) {
      masks = new Map();
      this.textureMasks.set(source, masks);
    }
    let key = [crop.x, crop.y, crop.width, crop.height].join(":");
    if (masks.has(key)) {
      return masks.get(key);
    }
    if (!this.maskBitmap) {
      this.maskBitmap = this.game.make.bitmapData(crop.width, crop.height);
    } else {
      this.maskBitmap.resize(crop.width, crop.height);
    }
    let ctx = this.maskBitmap.ctx;
    ctx.clearRect(0, 0, crop.width, crop.height);
    ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    let rgba = ctx.getImageData(0, 0, crop.width, crop.height).data;
    let alpha = new Uint8Array(crop.width * crop.height);
    for (let i = 0; i < alpha.length; i++) {
      alpha[i] = rgba[i * 4 + 3];
    }
    let mask = { width: crop.width, height: crop.height, alpha };
    masks.set(key, mask);
    return mask;
  },

  terrain: function (contact, radius = 36, verticalRadius = 20) {
    let result = { sprites: [], fallback: [] };
    let addSprite = (sprite, x, y, foreground, tile) => {
      if (!sprite || sprite.visible === false || sprite.exists === false) {
        return false;
      }
      let mask = this.textureMask(sprite);
      if (mask) {
        let scaleX = sprite.scale ? sprite.scale.x : 1;
        let scaleY = sprite.scale ? sprite.scale.y : 1;
        result.sprites.push({
          x: x - (sprite.anchor ? sprite.anchor.x : 0) * mask.width * scaleX,
          y: y - (sprite.anchor ? sprite.anchor.y : 0) * mask.height * scaleY,
          scaleX,
          scaleY,
          mask,
          foreground,
          tile
        });
      }
      let found = !!mask;
      for (let child of sprite.children || []) {
        found = addSprite(child, x + child.x, y + child.y, foreground, tile) || found;
      }
      return found;
    };
    for (let id of this.physics.nearbyRooms({
      room: contact.room,
      x: contact.x,
      y: contact.y,
      radius: Math.max(radius, verticalRadius)
    })) {
      let room = this.level.rooms[id];
      for (let tile of room.tiles) {
        if (!tile || tile === this.level.dummyWall || tile.element === PrinceJS.Level.TILE_SPACE) {
          continue;
        }
        let x = room.x * PrinceJS.ROOM_WIDTH + tile.roomX * PrinceJS.BLOCK_WIDTH;
        let y = room.y * PrinceJS.ROOM_HEIGHT + tile.roomY * PrinceJS.BLOCK_HEIGHT - 13;
        if (
          x > contact.x + radius ||
          x + 60 < contact.x - radius ||
          y > contact.y + verticalRadius ||
          y + 79 < contact.y - verticalRadius
        ) {
          continue;
        }
        let native = addSprite(tile.back, x, y, false, tile);
        native = addSprite(tile.front, x, y, true, tile) || native;
        if (!native) {
          // Geometry remains useful for editor/test levels that have no texture atlas.
          result.fallback.push({ tile, x, y: y + 13 });
        }
      }
    }
    return result;
  },

  materialAt: function (terrain, x, y) {
    let background = false;
    for (let sprite of terrain.sprites) {
      let localX = Math.floor((x - sprite.x) / sprite.scaleX);
      let localY = Math.floor((y - sprite.y) / sprite.scaleY);
      if (
        localX >= 0 &&
        localY >= 0 &&
        localX < sprite.mask.width &&
        localY < sprite.mask.height &&
        sprite.mask.alpha[localY * sprite.mask.width + localX] > 32
      ) {
        if (sprite.foreground) {
          return "foreground";
        }
        background = true;
      }
    }
    for (let entry of terrain.fallback) {
      let tile = entry.tile;
      if (tile.element === PrinceJS.Level.TILE_WALL) {
        if (x >= entry.x && x < entry.x + 32 && y >= entry.y && y < entry.y + 63) {
          return "foreground";
        }
      } else {
        if (tile.isBarrier() && tile.getBounds) {
          let bounds = tile.getBounds();
          let room = this.level.rooms[tile.room];
          let left = room.x * PrinceJS.ROOM_WIDTH + bounds.x;
          let top = room.y * PrinceJS.ROOM_HEIGHT + bounds.y + 3;
          if (x >= left && x < left + bounds.width && y >= top && y < top + bounds.height) {
            return "foreground";
          }
        }
        if (tile.isWalkable()) {
          let floorY = entry.y + PrinceJS.BLOCK_HEIGHT - 7;
          if (y >= floorY + 7 && y < floorY + 10 && x >= entry.x - 14 && x < entry.x + 18) {
            return "foreground";
          }
          let left = entry.x - (y - floorY) * 2;
          if (y >= floorY - 6 && y < floorY + 7 && x >= left && x < left + 32) {
            background = true;
          }
        }
      }
    }
    return background ? "background" : null;
  },

  paint: function (layer, terrain, x, y, width, height, color, depth, foregroundOnly) {
    let counts = { floor: 0, foreground: 0 };
    for (let row = Math.floor(y); row < Math.floor(y) + height; row++) {
      let start = Math.floor(x);
      let end = start + width;
      for (let column = start; column < end; ) {
        let material = this.materialAt(terrain, column, row);
        if (!material || (foregroundOnly && material !== "foreground")) {
          column++;
          continue;
        }
        let run = column + 1;
        while (run < end && this.materialAt(terrain, run, row) === material) {
          run++;
        }
        let floor = material === "background" && depth !== undefined ? this.floorDepth(layer, depth) : null;
        let bitmap = floor ? floor.bitmap : layer.bitmap;
        bitmap.ctx.fillStyle = color;
        bitmap.ctx.fillRect(column - layer.x, row - layer.y, run - column, 1);
        bitmap.dirty = true;
        let pixels = run - column;
        if (floor) {
          floor.drawnPixelCount += pixels;
          counts.floor += pixels;
        } else {
          counts.foreground += pixels;
        }
        column = run;
      }
    }
    return counts;
  },

  splashMasonry: function (x, y, room, floorY, direction, strength) {
    // Pillars are walk-through scenery. Project a little spray onto their native
    // artwork and the stone courses above/below the floor, without adding barriers.
    let reach = Math.min(112, 78 * strength + 12);
    let terrain = this.terrain({ x, y, room }, reach, reach);
    let surfaces = new Map();
    for (let entry of [...terrain.sprites, ...terrain.fallback]) {
      let tile = entry.tile;
      if (
        ![
          PrinceJS.Level.TILE_PILLAR,
          PrinceJS.Level.TILE_BOTTOM_BIG_PILLAR,
          PrinceJS.Level.TILE_TOP_BIG_PILLAR,
          PrinceJS.Level.TILE_LATTICE_PILLAR,
          PrinceJS.Level.TILE_WALL
        ].includes(tile.element)
      ) {
        continue;
      }
      if (!surfaces.has(tile)) {
        surfaces.set(tile, { sprites: [], fallback: [] });
      }
      surfaces.get(tile)[entry.mask ? "sprites" : "fallback"].push(entry);
    }
    direction = Math.sign(direction) || 1;
    let targets = {
      pillar: { x: x + direction * 14, y: y + (Math.random() - 0.5) * 14 },
      above: { x: x + direction * (14 + Math.random() * 20), y: y - 28 - Math.random() * 18 },
      below: { x: x + direction * (14 + Math.random() * 20), y: floorY + 16 + Math.random() * 14 }
    };
    let nearest = {};
    for (let [tile, surface] of surfaces) {
      let tileRoom = this.level.rooms[tile.room];
      let left = tileRoom.x * PrinceJS.ROOM_WIDTH + tile.roomX * PrinceJS.BLOCK_WIDTH;
      let top = tileRoom.y * PrinceJS.ROOM_HEIGHT + tile.roomY * PrinceJS.BLOCK_HEIGHT;
      let kind = "pillar";
      if (tile.element === PrinceJS.Level.TILE_WALL) {
        let floorTop = floorY - PrinceJS.BLOCK_HEIGHT + 7;
        if (top === floorTop) {
          continue;
        }
        kind = top < floorTop ? "above" : "below";
      }
      let target = targets[kind];
      let bottom = kind === "pillar" && tile.isWalkable() ? top + 47 : top + 66;
      for (let py = Math.ceil(Math.max(top - 13, y - reach)); py < Math.min(bottom, y + reach); py += 2) {
        for (let px = Math.ceil(Math.max(left, x - reach)); px < Math.min(left + 60, x + reach); px += 2) {
          if ((px - x) ** 2 + (py - y) ** 2 > reach ** 2 || !this.materialAt(surface, px, py)) {
            continue;
          }
          let score = (px - target.x) ** 2 + (py - target.y) ** 2 + (direction * (px - x) < -8 ? 144 : 0);
          if (!nearest[kind] || score < nearest[kind].score) {
            nearest[kind] = { x: px, y: py, tile, terrain: surface, score };
          }
        }
      }
    }
    for (let kind of Object.keys(nearest)) {
      this.masonryStain(nearest[kind], kind, strength);
    }
  },

  masonryStain: function (contact, kind, strength) {
    let layer = this.roomDecals(contact.tile.room);
    // Move the center a few pixels inside the visible face so narrow pillars
    // get a small rounded splash instead of only half a mark at their edge.
    for (let axis of ["x", "y"]) {
      let opaque = (offset) =>
        this.materialAt(
          contact.terrain,
          contact.x + (axis === "x" ? offset : 0),
          contact.y + (axis === "y" ? offset : 0)
        );
      if (!opaque(-3) && opaque(3)) {
        contact[axis] += 3;
      } else if (!opaque(3) && opaque(-3)) {
        contact[axis] -= 3;
      }
    }
    let pixels = 0;
    let draw = (dx, dy, width, height, color) => {
      let counts = this.paint(layer, contact.terrain, contact.x + dx, contact.y + dy, width, height, color);
      pixels += counts.foreground;
    };
    let radius = Math.min(5, 3 + Math.floor(strength));
    for (let dy = -radius; dy <= radius; dy++) {
      let width = Math.max(2, Math.round(Math.sqrt(radius * radius - dy * dy) * 2));
      let dx = -Math.floor(width / 2) + (dy % 3 === 0 ? 1 : 0);
      draw(dx, dy, width, 1, "#65121e");
      if (width > 3 && Math.abs(dy) < radius - 1) {
        draw(dx + 1, dy, width - 2, 1, "#a42630");
      }
    }
    draw(-1, -2, 2, 2, "#d5423c");
    draw(-2, radius - 1, 2, 5 + Math.floor(Math.random() * 6), "#761421");
    draw(2, radius, 1, 3 + Math.floor(Math.random() * 5), "#a12630");
    for (let i = 0; i < 5; i++) {
      let dx = Math.round((Math.random() - 0.5) * 22);
      let dy = Math.round((Math.random() - 0.5) * 18);
      draw(dx, dy, (i % 2) + 1, i % 3 === 0 ? 2 : 1, i % 2 ? "#b63036" : "#7f1926");
    }
    if (pixels) {
      layer.stainCount++;
      layer.foregroundStainCount++;
      layer.revision++;
      layer.drawnPixelCount += pixels;
      this.stainCount++;
      this.foregroundStainCount++;
      this.drawnPixelCount += pixels;
      this.masonryCounts[kind]++;
    }
  },

  stain: function (contact, particle) {
    // An absent room has no visible surface to stain.
    if (contact.tile === this.level.dummyWall) {
      return;
    }
    let layer = this.roomDecals(contact.room);
    if (!layer) {
      return;
    }
    let terrain = this.terrain(contact);
    let depth = particle.depthLayer === undefined ? this.depthCursor : particle.depthLayer;
    depth = Math.max(0, Math.min(9, depth));
    let counts = { floor: 0, foreground: 0 };
    let draw = (dx, dy, width, height, color, floorDepth, foregroundOnly) => {
      let painted = this.paint(
        layer,
        terrain,
        contact.x + dx,
        contact.y + dy,
        width,
        height,
        color,
        floorDepth,
        foregroundOnly
      );
      counts.floor += painted.floor;
      counts.foreground += painted.foreground;
    };
    if (contact.normalX) {
      let inside = -contact.normalX;
      let width = particle.size === 2 ? 7 : 4;
      let dx = inside > 0 ? 0 : -width;
      draw(dx, -5, width, 11, "#620c16");
      draw(inside > 0 ? 1 : -3, -3, 2, 6, "#ab1c28");
      draw(inside > 0 ? 1 : -2, 3, 1, 8, "#7a1220");
      draw(inside > 0 ? 0 : -1, -1, 1, 3, "#d33635");
      draw(dx + Math.floor(Math.random() * width), -8, 1, 2, "#981b25");
      draw(inside * 10 - 1, -7, 2, 2, "#a42630", undefined, true);
      draw(inside * 13 - 1, 3, 2, 3, "#81141f", undefined, true);
    } else if (contact.normalY === -1) {
      // Use the same ten diagonal floor lanes as spent brass. Native alpha
      // separates the top plane from the foreground lip and surrounding masonry.
      let offset = this.depthOffset(depth);
      let width = particle.size === 2 ? 14 : 8;
      draw(offset.x - width / 2, offset.y, width, 2, this.depthColor("#690d18", depth), depth);
      draw(offset.x - width / 2 + 1, offset.y, width - 2, 1, this.depthColor("#b42a32", depth), depth);
      draw(offset.x - width / 2 + 2, offset.y - 1, Math.max(2, width - 5), 1, this.depthColor("#e04741", depth), depth);
      draw(offset.x + width / 2 + 2, offset.y, 1, 1, this.depthColor("#a22630", depth), depth);
      // A narrow runnel spills over the visible front face, without filling its
      // transparent underside or painting the black void below a missing room.
      draw(-14, 7, particle.size === 2 ? 3 : 2, 5, "#7a1420", undefined, true);
      draw(-13, 7, 1, 3, "#b52c35", undefined, true);
      draw(-6, 8, 2, 2, "#9a2330", undefined, true);
      draw((particle.vx < 0 ? -1 : 1) * 12 - 1, -5, 2, 5, "#8f202c", undefined, true);
    } else {
      draw(-5, -4, 10, 4, "#650d19");
      draw(-3, -2, 6, 2, "#ad2330");
      draw(-1, -1, 2, 1, "#dd393b");
    }
    if (!counts.floor && !counts.foreground) {
      return;
    }
    layer.stainCount++;
    layer.revision++;
    layer.drawnPixelCount += counts.floor + counts.foreground;
    this.drawnPixelCount += counts.floor + counts.foreground;
    if (contact.normalY === -1) {
      layer.depthCounts[depth]++;
      this.depthCounts[depth]++;
      let floor = layer.floorDepths.get(depth);
      if (floor) {
        floor.revision++;
      }
    }
    if (counts.foreground) {
      layer.foregroundStainCount++;
      this.foregroundStainCount++;
    }
    this.stainCount++;
  },

  update: function (delta) {
    if (this.destroyed) {
      return;
    }
    delta = Math.max(0, Math.min(Number(delta) || 0, 0.05));
    this.particles = this.particles.filter((particle) => {
      particle.age += delta;
      particle.life -= delta;
      let result = this.physics.step(particle, delta, { gravity: 360, friction: 0 });
      if (result.contacts.length) {
        this.stain(result.contacts[0], particle);
        return false;
      }
      return !result.invalid && particle.life > 0;
    });
    this.spray.clear();
    for (let particle of this.particles) {
      let x = Math.round(particle.x);
      let y = Math.round(particle.y);
      let length = Math.min(4, Math.max(particle.size, Math.ceil(Math.abs(particle.vx) / 90)));
      this.spray.beginFill(particle.color, 1);
      this.spray.drawRect(x - (particle.vx > 0 ? length : 0), y, length, particle.size);
      this.spray.endFill();
    }
  },

  destroy: function () {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.particles.length = 0;
    for (let layer of this.decalRooms.values()) {
      for (let floor of layer.floorDepths.values()) {
        floor.sprite.destroy();
        floor.bitmap.destroy();
      }
      layer.floorDepths.clear();
      layer.sprite.destroy();
      layer.bitmap.destroy();
    }
    this.decalRooms.clear();
    this.stainCount = 0;
    this.depthCounts.fill(0);
    this.foregroundStainCount = this.drawnPixelCount = 0;
    this.masonryCounts = { pillar: 0, above: 0, below: 0 };
    this.textureMasks = new WeakMap();
    if (this.maskBitmap) {
      this.maskBitmap.destroy();
      this.maskBitmap = null;
    }
    this.spray.destroy();
  }
};

PrinceJS.BloodEffects.prototype.constructor = PrinceJS.BloodEffects;
