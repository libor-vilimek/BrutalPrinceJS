"use strict";

// All positions are logical world pixels, before the game's world scale is applied.
PrinceJS.MinigunEffects = function (game, kid, pickup) {
  this.game = game;
  this.kid = kid;
  this.pickup = pickup;
  this.collected = !!pickup.collected;
  this.elapsed = 0;
  this.collectTime = 0;
  this.flashTime = 0;
  this.recoil = 0;
  this.spin = 0;
  this.spinSpeed = 0;
  this.shots = 0;
  this.destroyed = false;

  this.ground = game.add.graphics(0, 0);
  this.light = game.add.graphics(0, 0);
  this.weapon = game.add.graphics(0, 0);
  this.casingLayer = game.add.graphics(0, 0);
  this.debris = game.add.graphics(0, 0);
  this.flash = game.add.graphics(0, 0);
  this.ground.z = 22;
  this.light.z = 23;
  this.weapon.z = 24;
  this.casingLayer.z = 26;
  this.debris.z = 27;
  this.flash.z = 28;

  // Brass lasts for the whole level. Only moving casings take part in frame physics.
  this.casings = [];
  this.activeCasings = [];
  this.casingRooms = {};
  this.pileColumns = {};
  this.casingSupports = {};
  this.casingSupportCheck = 0;
  this.dirtyCasingBatches = [];
  this.casingRoomGrid = {};
  this.casingFloorColumns = {};
  this.casingWorldBottom = 0;
  this.buildCasingFloors();

  // Short-lived sparks, smoke, and pickup glitter still share a bounded pool.
  this.particles = [];
  this.particleCursor = 0;
  for (let i = 0; i < 160; i++) {
    this.particles.push({ life: 0 });
  }
  this.update(0, false);
};

PrinceJS.MinigunEffects.prototype.getPose = function () {
  let kid = this.kid;
  let action = kid.action || "stand";
  let direction = kid.charFace === -1 ? -1 : 1;
  let crouched = /stoop|crawl|land|standup/.test(action);
  let running = /run|step|advance|retreat/.test(action);
  let bob = running ? Math.round(Math.sin((kid.charFrame || 0) * 1.8)) : 0;
  let floorY = kid.baseY + kid.charY;
  let visible =
    kid.alive !== false &&
    kid.active !== false &&
    kid.visible !== false &&
    kid.exists !== false &&
    kid.minigunEquipped !== false &&
    !/hang|climb|drink|pickupsword|rdiveroll|stabkill|dropdead|impale|halve|falldead/.test(action);

  return {
    x: kid.baseX + PrinceJS.Utils.convertX(kid.charX),
    y: floorY - (crouched ? 13 : 24) + bob,
    floorY: floorY,
    direction: direction,
    visible: visible
  };
};

PrinceJS.MinigunEffects.prototype.getMuzzle = function () {
  let pose = this.getPose();
  return {
    x: Math.round(pose.x + (18 - Math.round(this.recoil)) * pose.direction),
    y: Math.round(pose.y),
    direction: pose.direction,
    visible: this.collected && this.collectTime === 0 && pose.visible
  };
};

PrinceJS.MinigunEffects.prototype.collect = function () {
  if (this.destroyed || this.collected) {
    return;
  }
  this.collected = this.pickup.collected = true;
  this.collectTime = 0.42;
  for (let i = 0; i < 22; i++) {
    let angle = (i / 22) * Math.PI * 2;
    let speed = 16 + Math.random() * 35;
    this.emit(
      "glitter",
      this.pickup.worldX,
      this.pickup.worldY - 6,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed - 25,
      0.35 + Math.random() * 0.35,
      i % 3 === 0 ? 0xfff7b0 : 0xffce36,
      this.pickup.worldY
    );
  }
};

PrinceJS.MinigunEffects.prototype.shot = function (worldX, worldY, direction) {
  if (this.destroyed || !this.collected || this.kid.minigunEquipped === false) {
    return;
  }
  this.flashTime = 0.075;
  this.recoil = 1;
  this.spinSpeed = Math.max(this.spinSpeed, 23);
  this.shots++;
  let pose = this.getPose();

  // The ejection port sits behind the barrel cluster; casings scatter over both sides.
  for (let i = 0; i < 3; i++) {
    this.emitCasing(
      worldX - 17 * direction,
      worldY + 1,
      -direction * (28 + Math.random() * 65) + (Math.random() - 0.5) * 62,
      -45 - Math.random() * 86,
      i === 0 ? 0xffdb70 : 0xdba43f,
      pose.floorY
    );
  }
  for (let i = 0; i < 2; i++) {
    this.emit(
      "spark",
      worldX,
      worldY,
      direction * (55 + Math.random() * 80),
      (Math.random() - 0.5) * 60,
      0.09 + Math.random() * 0.12,
      i ? 0xffa629 : 0xffed86,
      pose.floorY
    );
  }
  if (this.shots % 2 === 0) {
    this.emit("smoke", worldX, worldY - 2, direction * 15, -14, 0.38, 0xac9876, pose.floorY);
  }
};

PrinceJS.MinigunEffects.prototype.impact = function (worldX, worldY, enemyHit) {
  if (this.destroyed) {
    return;
  }
  for (let i = 0; i < 7; i++) {
    let angle = Math.random() * Math.PI * 2;
    let speed = 18 + Math.random() * 65;
    let color = enemyHit ? (i % 3 === 0 ? 0xffb465 : 0xb83f2d) : i % 2 ? 0xffdd69 : 0xfff3b7;
    this.emit(
      "spark",
      worldX,
      worldY,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed - 12,
      0.12 + Math.random() * 0.18,
      color,
      worldY + 24
    );
  }
};

PrinceJS.MinigunEffects.prototype.emit = function (type, x, y, vx, vy, life, color, floorY) {
  let particle = this.particles[this.particleCursor];
  this.particleCursor = (this.particleCursor + 1) % this.particles.length;
  particle.type = type;
  particle.x = x;
  particle.y = y;
  particle.vx = vx;
  particle.vy = vy;
  particle.life = particle.maxLife = life;
  particle.color = color;
  particle.floorY = floorY;
  particle.rotation = Math.random() * Math.PI * 2;
  particle.spin = (Math.random() - 0.5) * 28;
  particle.bounces = 0;
};

PrinceJS.MinigunEffects.prototype.buildCasingFloors = function () {
  let rooms = this.kid.level && this.kid.level.rooms;
  if (!rooms) {
    return;
  }
  Object.keys(rooms).forEach((id) => {
    let room = rooms[id];
    if (!room) {
      return;
    }
    this.casingRoomGrid[room.x + "," + room.y] = id;
    this.casingWorldBottom = Math.max(this.casingWorldBottom, (room.y + 1) * 189);
    for (let column = 0; column < 10; column++) {
      let worldColumn = room.x * 10 + column;
      let floors = this.casingFloorColumns[worldColumn] || (this.casingFloorColumns[worldColumn] = []);
      for (let row = 0; row < 3; row++) {
        floors.push({ room: id, column: column, row: row, floorY: room.y * 189 + (row + 1) * 63 - 7 });
      }
    }
  });
  Object.keys(this.casingFloorColumns).forEach((column) => {
    this.casingFloorColumns[column].sort((a, b) => a.floorY - b.floorY);
  });
};

PrinceJS.MinigunEffects.prototype.emitCasing = function (x, y, vx, vy, color, floorY) {
  let tilted = Math.random() < 0.25;
  let casing = {
    x: x,
    y: y,
    vx: vx,
    vy: vy,
    color: color,
    floorY: floorY,
    room: this.kid.room || this.pickup.room || 0,
    width: tilted ? 2 : 3,
    height: tilted ? 3 : 2,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 28,
    bounces: 0,
    rolling: false,
    rollTime: 0,
    settled: false,
    dormant: false
  };
  this.casings.push(casing);
  this.activeCasings.push(casing);
  return casing;
};

PrinceJS.MinigunEffects.prototype.casingTile = function (floor) {
  let room = this.kid.level && this.kid.level.rooms[floor.room];
  return room && room.tiles[floor.row * 10 + floor.column];
};

PrinceJS.MinigunEffects.prototype.casingFloorWalkable = function (floor) {
  let tile = this.casingTile(floor);
  return (
    !!tile &&
    (typeof tile.isWalkable === "function" ? tile.isWalkable() : ![0, 9, 12, 20, 26, 27, 28, 29].includes(tile.element))
  );
};

PrinceJS.MinigunEffects.prototype.casingPileHeight = function (floorY, x, width) {
  let columns = this.pileColumns[floorY];
  let height = 0;
  if (columns) {
    for (let pixel = Math.round(x); pixel < Math.round(x) + width; pixel++) {
      height = Math.max(height, columns[pixel] || 0);
    }
  }
  return height;
};

PrinceJS.MinigunEffects.prototype.findCasingSupport = function (casing, previousBottom, nextBottom) {
  let candidates = this.casingFloorColumns[Math.floor((casing.x + casing.width / 2) / 32)];
  let fallback = !(this.kid.level && this.kid.level.rooms);
  if (fallback) {
    candidates = [{ room: casing.room, row: 0, column: 0, floorY: casing.floorY }];
  }
  if (!candidates) {
    return null;
  }
  let support = null;
  for (let i = 0; i < candidates.length; i++) {
    let floor = candidates[i];
    if (floor.floorY < previousBottom - 1 || (!fallback && !this.casingFloorWalkable(floor))) {
      continue;
    }
    let surfaceY = floor.floorY - this.casingPileHeight(floor.floorY, casing.x, casing.width);
    if (surfaceY <= nextBottom && (!support || surfaceY < support.y)) {
      support = { room: floor.room, row: floor.row, column: floor.column, floorY: floor.floorY, y: surfaceY };
    }
  }
  return support;
};

PrinceJS.MinigunEffects.prototype.casingSurfaceAt = function (x, width, floorY) {
  if (this.kid.level && this.kid.level.rooms) {
    let floors = this.casingFloorColumns[Math.floor((x + width / 2) / 32)] || [];
    let floor = floors.find((candidate) => candidate.floorY === floorY);
    if (!floor || (this.casingTile(floor) && this.casingTile(floor).element === 20)) {
      return -Infinity;
    }
    if (!this.casingFloorWalkable(floor)) {
      return floorY + 20;
    }
  }
  return floorY - this.casingPileHeight(floorY, x, width);
};

PrinceJS.MinigunEffects.prototype.moveCasing = function (casing, dt) {
  let nextX = casing.x + casing.vx * dt;
  if (this.kid.level && this.kid.level.rooms) {
    let roomX = Math.floor((nextX + casing.width / 2) / 320);
    let roomY = Math.floor(casing.y / 189);
    let id = this.casingRoomGrid[roomX + "," + roomY];
    let room = this.kid.level.rooms[id];
    if (room) {
      let column = Math.floor((nextX + casing.width / 2 - roomX * 320) / 32);
      let row = Math.min(2, Math.max(0, Math.floor((casing.y - roomY * 189 + 7) / 63)));
      let tile = room.tiles[row * 10 + column];
      if (tile && tile.element !== 20) {
        casing.x = nextX;
        casing.room = id;
      } else {
        casing.vx *= -0.4;
      }
    } else {
      casing.vx *= -0.4;
    }
  } else {
    casing.x = nextX;
  }
};

PrinceJS.MinigunEffects.prototype.getCasingRoom = function (id) {
  if (!this.casingRooms[id]) {
    let room = this.kid.level && this.kid.level.rooms[id];
    this.casingRooms[id] = {
      x: room ? room.x * 320 : 0,
      y: room ? room.y * 189 : 0,
      settled: [],
      batches: []
    };
  }
  return this.casingRooms[id];
};

PrinceJS.MinigunEffects.prototype.drawCasing = function (graphics, casing, x, y, moving) {
  let horizontal = Math.abs(Math.cos(casing.rotation)) > 0.55;
  let width = moving ? (horizontal ? 3 : 1) : casing.width;
  let height = moving ? (horizontal ? 1 : 3) : casing.height - 1;
  this.rect(graphics, 0x684825, x, y + 1, width, height);
  this.rect(graphics, casing.color, x, y, width, height);
  this.rect(graphics, 0xffec99, x, y, 1, 1);
};

PrinceJS.MinigunEffects.prototype.dirtyCasingBatch = function (batch) {
  if (!batch.dirty) {
    // Phaser 2's Graphics setter cannot disable a cache that has never existed.
    if (batch.graphics.cacheAsBitmap) {
      batch.graphics.cacheAsBitmap = false;
    }
    batch.dirty = true;
    this.dirtyCasingBatches.push(batch);
  }
};

PrinceJS.MinigunEffects.prototype.settleCasing = function (casing, support) {
  casing.x = Math.round(casing.x);
  casing.y = Math.round(support.y - casing.height);
  casing.vx = casing.vy = casing.spin = 0;
  casing.settled = true;
  casing.room = support.room;
  casing.floorY = support.floorY;
  casing.floorRow = support.row;
  casing.floorColumn = support.column;
  let supportKey = support.room + ":" + support.row + ":" + support.column;
  let group = this.casingSupports[supportKey];
  if (!group) {
    group = { room: support.room, row: support.row, column: support.column, floorY: support.floorY, casings: [] };
    this.casingSupports[supportKey] = group;
  }
  group.casings.push(casing);
  let columns = this.pileColumns[support.floorY] || (this.pileColumns[support.floorY] = {});
  for (let pixel = casing.x; pixel < casing.x + casing.width; pixel++) {
    columns[pixel] = Math.max(columns[pixel] || 0, support.floorY - casing.y);
  }

  let room = this.getCasingRoom(support.room);
  room.settled.push(casing);
  let batch = room.batches[room.batches.length - 1];
  if (!batch || batch.casings.length >= 128) {
    let graphics = this.game.add.graphics(room.x, room.y);
    this.casingLayer.addChild(graphics);
    graphics.autoCull = true;
    batch = { graphics: graphics, casings: [], dirty: false };
    room.batches.push(batch);
  }
  this.dirtyCasingBatch(batch);
  batch.casings.push(casing);
  casing.batch = batch;
  this.drawCasing(batch.graphics, casing, casing.x - room.x, casing.y - room.y, false);
};

PrinceJS.MinigunEffects.prototype.checkCasingFloors = function (dt) {
  this.casingSupportCheck -= dt;
  if (this.casingSupportCheck > 0 || !(this.kid.level && this.kid.level.rooms)) {
    return;
  }
  this.casingSupportCheck = 0.25;
  let changedRows = {};
  Object.keys(this.casingSupports).forEach((key) => {
    let group = this.casingSupports[key];
    if (this.casingFloorWalkable(group)) {
      return;
    }
    // A loose board can disappear underneath an old pile, including in an offscreen room.
    let changedBatches = [];
    group.casings.forEach((casing) => {
      casing.settled = false;
      casing.rolling = false;
      casing.rollTime = casing.bounces = 0;
      casing.vy = 12;
      casing.vx = (Math.random() - 0.5) * 10;
      casing.spin = (Math.random() - 0.5) * 12;
      this.activeCasings.push(casing);
      if (changedBatches.indexOf(casing.batch) < 0) {
        changedBatches.push(casing.batch);
      }
    });
    let room = this.casingRooms[group.room];
    room.settled = room.settled.filter((casing) => casing.settled);
    changedBatches.forEach((batch) => {
      this.dirtyCasingBatch(batch);
      batch.casings = batch.casings.filter((casing) => casing.settled);
      batch.graphics.clear();
      batch.casings.forEach((casing) => {
        this.drawCasing(batch.graphics, casing, casing.x - room.x, casing.y - room.y, false);
      });
    });
    changedRows[group.floorY] = true;
    delete this.casingSupports[key];
  });
  Object.keys(changedRows).forEach((floorY) => {
    let columns = (this.pileColumns[floorY] = {});
    Object.keys(this.casingRooms).forEach((id) => {
      this.casingRooms[id].settled.forEach((casing) => {
        if (casing.floorY === Number(floorY)) {
          for (let pixel = casing.x; pixel < casing.x + casing.width; pixel++) {
            columns[pixel] = Math.max(columns[pixel] || 0, casing.floorY - casing.y);
          }
        }
      });
    });
  });
};

PrinceJS.MinigunEffects.prototype.updateCasings = function (dt) {
  this.checkCasingFloors(dt);
  for (let i = this.activeCasings.length - 1; i >= 0; i--) {
    let casing = this.activeCasings[i];
    let previousBottom = casing.y + casing.height;
    this.moveCasing(casing, dt);
    casing.y += casing.vy * dt;
    casing.vy = Math.min(350, casing.vy + 250 * dt);
    casing.rotation += casing.spin * dt;
    if (casing.rolling) {
      casing.rollTime += dt;
    }
    let support = casing.vy >= 0 ? this.findCasingSupport(casing, previousBottom, casing.y + casing.height) : null;
    if (support) {
      casing.y = support.y - casing.height;
      if (casing.bounces < 2 && casing.vy > 24) {
        casing.vy *= -0.32;
        casing.vx *= 0.58;
        casing.spin *= 0.65;
        casing.bounces++;
      } else {
        casing.rolling = true;
        let left = this.casingSurfaceAt(casing.x - 3, casing.width, support.floorY);
        let right = this.casingSurfaceAt(casing.x + 3, casing.width, support.floorY);
        let lower = Math.max(left, right);
        if (lower > support.y + 2 && casing.rollTime < 1.2) {
          let direction = left === right ? (casing.vx < 0 ? -1 : 1) : left > right ? -1 : 1;
          casing.vx = direction * Math.min(35, 12 + lower - support.y);
          casing.vy = 0;
          casing.spin = direction * 7;
        } else if (Math.abs(casing.vx) > 8) {
          casing.vx *= Math.max(0, 1 - dt * 12);
          casing.vy = 0;
        } else {
          this.settleCasing(casing, support);
          this.activeCasings.splice(i, 1);
          continue;
        }
      }
    }

    // A shell that falls out of the mapped level stays recorded, without endless offscreen physics.
    if (this.casingWorldBottom && casing.y > this.casingWorldBottom + 189) {
      casing.dormant = true;
      this.activeCasings.splice(i, 1);
      continue;
    }
    this.drawCasing(this.debris, casing, casing.x, casing.y, true);
  }
  for (let i = 0; i < this.dirtyCasingBatches.length; i++) {
    let batch = this.dirtyCasingBatches[i];
    if (batch.casings.length) {
      batch.graphics.cacheAsBitmap = true;
    }
    batch.dirty = false;
  }
  this.dirtyCasingBatches.length = 0;
};

PrinceJS.MinigunEffects.prototype.rect = function (graphics, color, x, y, width, height, alpha) {
  graphics.beginFill(color, alpha === undefined ? 1 : alpha);
  graphics.drawRect(Math.round(x), Math.round(y), width, height);
  graphics.endFill();
};

PrinceJS.MinigunEffects.prototype.drawWeapon = function (graphics, held) {
  // Round the smaller geometry itself so every edge remains on the pixel grid.
  let rect = (color, x, y, width, height) => {
    let left = Math.round(x * 0.68);
    let top = Math.round(y * 0.68);
    this.rect(
      graphics,
      color,
      left,
      top,
      Math.max(1, Math.round((x + width) * 0.68) - left),
      Math.max(1, Math.round((y + height) * 0.68) - top)
    );
  };
  let barrelPhase = Math.floor(this.spin) % 3;
  let beltOffset = this.spinSpeed > 5 ? Math.floor(this.spin * 2) % 2 : 0;

  // Dark silhouette, steel receiver, ammunition drum, and the exposed rotating barrels.
  rect(0x111a22, -12, -6, 22, 13);
  rect(0x111a22, 7, -5, 18, 10);
  rect(0x111a22, -10, 4, 9, 7);
  rect(0x283640, -11, -5, 18, 10);
  rect(0x74878c, -10, -5, 15, 2);
  rect(0x44555c, -11, -2, 16, 7);
  rect(0x92a1a0, -9, -4, 5, 1);
  rect(0x1a2832, -9, 4, 7, 6);
  rect(0x55666b, -8, 5, 5, 4);
  rect(0x26353d, -10, 7, 2, 2);
  rect(0x151f27, -3, -9, 8, 4);
  rect(0x718184, -2, -9, 6, 1);
  rect(0x131e27, -1, -7, 4, 3);
  rect(0x95a29e, -1, -3, 6, 2);
  rect(0x203039, 3, 1, 3, 3);
  rect(0x111a22, 9, 4, 5, 5);
  rect(0x51636a, 10, 5, 3, 3);

  rect(0x233039, 7, -4, 16, 8);
  for (let barrel = 0; barrel < 3; barrel++) {
    let y = -3 + barrel * 3;
    rect(barrel === barrelPhase ? 0xb8c4b9 : 0x71858a, 8, y, 15, 1);
    rect(0x101b23, 8, y + 1, 15, 1);
  }
  rect(0x455a64, 10, -5, 3, 10);
  rect(0x8ea09e, 10, -5, 3, 2);
  rect(0x263941, 10, 2, 3, 3);
  rect(0x344852, 21, -5, 3, 10);
  rect(0xa4b3ac, 21, -5, 3, 2);
  rect(0x0c131c, 24, -4, 2, 8);
  rect(0x8b9c9f, 24, -3 + barrelPhase * 2, 1, 2);

  // A hanging, animated brass belt makes the silhouette recognizably a minigun.
  for (let link = 0; link < 5; link++) {
    let x = -8 - Math.floor(link / 2);
    let y = 2 + link * 2 + beltOffset;
    rect(0x573c1f, x - 1, y, 5, 2);
    rect(0xd7a747, x, y, 3, 1);
    rect(0xffd573, x, y, 1, 1);
  }
  rect(0xd8a33b, -5, -1, 2, 2);
  rect(0xc86e36, -3, 2, 2, 1);

  if (held) {
    // Sleeves and hands bridge the original Prince sprite into a two-handed grip.
    rect(0xc7c7a1, -13, 0, 4, 6);
    rect(0xf3efc6, -12, 0, 3, 4);
    rect(0xf4f2cc, -10, 5, 10, 3);
    rect(0xffca91, -1, 4, 4, 4);
    rect(0xd99169, -1, 7, 4, 1);
    rect(0xe2ddb6, 3, 7, 10, 2);
    rect(0xffce98, 11, 4, 4, 4);
    rect(0xe5a170, 13, 4, 2, 2);
  }
};

PrinceJS.MinigunEffects.prototype.drawGround = function () {
  let graphics = this.ground;
  graphics.clear();
  graphics.visible = !this.collected;
  if (this.collected) {
    return;
  }
  graphics.x = Math.round(this.pickup.worldX);
  graphics.y = Math.round(this.pickup.worldY - 9);
  let pulse = 0.65 + Math.sin(this.elapsed * 3.5) * 0.2;
  this.rect(graphics, 0x000000, -11, 8, 30, 2, 0.6);
  this.rect(graphics, 0xdba931, -8, 7, 25, 2, pulse * 0.35);
  this.drawWeapon(graphics, false);
  let letters = {
    M: [5, 7, 7, 5, 5],
    I: [7, 2, 2, 2, 7],
    N: [5, 7, 7, 7, 5],
    G: [7, 4, 5, 5, 7],
    U: [5, 5, 5, 5, 7]
  };
  let label = "MINIGUN";
  this.rect(graphics, 0x111822, -12, -22, 33, 9, 0.85);
  for (let letter = 0; letter < label.length; letter++) {
    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < 3; column++) {
        if (letters[label[letter]][row] & (4 >> column)) {
          this.rect(graphics, 0xffd87b, -9 + letter * 4 + column, -20 + row, 1, 1);
        }
      }
    }
  }
  let glintY = -10 + Math.round(Math.sin(this.elapsed * 3));
  this.rect(graphics, 0xffce47, 2, glintY - 2, 1, 7, pulse);
  this.rect(graphics, 0xffce47, -1, glintY + 1, 7, 1, pulse);
  this.rect(graphics, 0xfff6bb, 2, glintY, 1, 3, pulse);
  if (Math.sin(this.elapsed * 2.8) > 0.4) {
    this.rect(graphics, 0xffe27a, 14, -8, 1, 1, pulse);
    this.rect(graphics, 0xffe27a, -10, -1, 1, 1, pulse);
  }
};

PrinceJS.MinigunEffects.prototype.drawFlash = function (muzzle) {
  this.light.clear();
  this.flash.clear();
  if (!muzzle.visible || this.flashTime <= 0) {
    return;
  }

  let intensity = Math.min(1, this.flashTime / 0.04);
  let light = this.light;
  light.x = muzzle.x;
  light.y = muzzle.y;
  light.scale.x = muzzle.direction;
  let halos = [
    [64, 0.055],
    [46, 0.075],
    [30, 0.11],
    [17, 0.19]
  ];
  for (let i = 0; i < halos.length; i++) {
    light.beginFill(0xffd42c, halos[i][1] * intensity);
    light.drawCircle(3, 0, halos[i][0]);
    light.endFill();
  }
  light.beginFill(0xffd957, 0.075 * intensity);
  light.drawPolygon([0, -5, 44, -18, 56, -9, 56, 10, 44, 18, 0, 5]);
  light.endFill();

  let flash = this.flash;
  flash.x = muzzle.x;
  flash.y = muzzle.y;
  flash.scale.x = muzzle.direction;
  let stretch = this.shots % 2 ? 3 : 0;
  flash.beginFill(0xf79820, intensity);
  flash.drawPolygon([
    -2,
    -3,
    4,
    -4,
    7,
    -8,
    9,
    -4,
    16 + stretch,
    -6,
    13,
    -1,
    23 + stretch,
    1,
    14,
    4,
    17,
    8,
    9,
    5,
    6,
    9,
    3,
    4,
    -2,
    3
  ]);
  flash.endFill();
  flash.beginFill(0xffdd37, intensity);
  flash.drawPolygon([-2, -2, 7, -3, 12, -5, 10, -1, 20 + stretch, 1, 10, 3, 11, 5, 5, 3, -2, 2]);
  flash.endFill();
  this.rect(flash, 0xffffd0, -1, -1, 12 + stretch, 3, intensity);
  this.rect(flash, 0xffffff, -1, 0, 7, 1, intensity);
};

PrinceJS.MinigunEffects.prototype.updateParticles = function (dt) {
  let graphics = this.debris;
  graphics.clear();
  for (let i = 0; i < this.particles.length; i++) {
    let particle = this.particles[i];
    if (particle.life <= 0) {
      continue;
    }
    particle.life -= dt;
    if (particle.life <= 0) {
      continue;
    }
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.rotation += particle.spin * dt;
    particle.vy += (particle.type === "spark" ? 110 : 0) * dt;

    let alpha = Math.min(1, particle.life / 0.25);
    if (particle.type === "smoke") {
      let size = particle.life < particle.maxLife / 2 ? 3 : 2;
      this.rect(graphics, particle.color, particle.x, particle.y, size, size, alpha * 0.28);
    } else {
      let size = particle.type === "glitter" && particle.life > 0.3 ? 2 : 1;
      this.rect(graphics, particle.color, particle.x, particle.y, size, size, alpha);
    }
  }
};

PrinceJS.MinigunEffects.prototype.update = function (deltaSeconds, firing) {
  if (this.destroyed) {
    return;
  }
  let dt = Math.max(0, Math.min(Number(deltaSeconds) || 0, 0.05));
  this.elapsed += dt;
  this.flashTime = Math.max(0, this.flashTime - dt);
  this.collectTime = Math.max(0, this.collectTime - dt);
  this.recoil = Math.max(0, this.recoil - dt * 35);
  let pose = this.getPose();
  firing = firing && this.collected && pose.visible;
  if (!pose.visible) {
    this.flashTime = this.recoil = 0;
  }
  this.spinSpeed += ((firing ? 30 : 0) - this.spinSpeed) * Math.min(1, dt * (firing ? 14 : 4));
  this.spin += this.spinSpeed * dt;
  this.drawGround();

  this.weapon.clear();
  this.weapon.visible = this.collected && pose.visible;
  if (this.weapon.visible) {
    let x = pose.x - Math.round(this.recoil) * pose.direction;
    let y = pose.y;
    if (this.collectTime > 0) {
      let progress = 1 - this.collectTime / 0.42;
      let ease = 1 - Math.pow(1 - progress, 3);
      x = this.pickup.worldX + (x - this.pickup.worldX) * ease;
      y = this.pickup.worldY - 9 + (y - this.pickup.worldY + 9) * ease - Math.sin(progress * Math.PI) * 13;
    }
    this.weapon.x = Math.round(x);
    this.weapon.y = Math.round(y);
    this.weapon.scale.x = pose.direction;
    this.drawWeapon(this.weapon, this.collectTime < 0.12);
  }

  this.drawFlash(this.getMuzzle());
  this.updateParticles(dt);
  this.updateCasings(dt);
};

PrinceJS.MinigunEffects.prototype.destroy = function () {
  if (this.destroyed) {
    return;
  }
  this.destroyed = true;
  [this.ground, this.light, this.weapon, this.casingLayer, this.debris, this.flash].forEach((graphics) =>
    graphics.destroy()
  );
  this.particles.length = 0;
  this.casings.length = 0;
  this.activeCasings.length = 0;
  this.casingRooms = {};
  this.pileColumns = {};
  this.casingSupports = {};
  this.dirtyCasingBatches.length = 0;
};
