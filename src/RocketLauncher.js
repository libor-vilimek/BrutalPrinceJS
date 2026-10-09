"use strict";

PrinceJS.RocketLauncher = function (delegate, direction) {
  PrinceJS.RocketLauncherAction.call(this, delegate, direction, {
    id: "rocketLauncher",
    label: "ROCKETS",
    owned: "hasRocketLauncher",
    equipped: "rocketLauncherEquipped",
    effects: PrinceJS.RocketLauncherEffects,
    pickupRadius: 10,
    interval: 0.7,
    speed: 90,
    acceleration: 900,
    maxSpeed: 720,
    // Cover the launch room and the entire next room, even when firing from the far edge.
    range: 720,
    lifetime: 4,
    maxProjectiles: 8
  });
};

PrinceJS.RocketLauncher.prototype = Object.create(PrinceJS.RocketLauncherAction.prototype);
PrinceJS.RocketLauncher.prototype.constructor = PrinceJS.RocketLauncher;

PrinceJS.RocketLauncher.prototype.findPickup = function (direction) {
  let pickup = PrinceJS.RangedWeapon.prototype.findPickup.call(this, direction);
  if (PrinceJS.currentLevel === 2 && this.level.number === 2 && this.kid.room === 5) {
    let room = this.level.rooms[11];
    let tile = room && this.level.getTileAt(8, 1, 11);
    if (tile && tile.element === PrinceJS.Level.TILE_FLOOR) {
      // After the ledge/whip encounter: four rooms left and one room above
      // the entrance. Keep the tube visible on plain floor in this corridor.
      pickup.room = 11;
      pickup.worldX = room.x * PrinceJS.ROOM_WIDTH + 8 * PrinceJS.BLOCK_WIDTH + 16;
      pickup.worldY = room.y * PrinceJS.ROOM_HEIGHT + PrinceJS.Utils.convertBlockYtoY(1) + 3;
    }
  }
  if (PrinceJS.currentLevel === 3 && this.level.number === 3 && this.kid.room === 9) {
    let room = this.level.rooms[9];
    let tile = this.level.getTileAt(8, 2, 9);
    if (tile.element === PrinceJS.Level.TILE_FLOOR) {
      // The introductory turn starts inside the arrival doorway. Leave the tube
      // in clear view on the plain floor beyond its pillars and wall torch.
      pickup.worldX = room.x * PrinceJS.ROOM_WIDTH + 8 * PrinceJS.BLOCK_WIDTH + 16;
      pickup.worldY = room.y * PrinceJS.ROOM_HEIGHT + PrinceJS.Utils.convertBlockYtoY(2) + 3;
    }
  }
  return pickup;
};

PrinceJS.RocketLauncher.prototype.updateEffects = function (delta) {
  this.effects.update(delta, this.bullets);
};

PrinceJS.RocketLauncher.prototype.drawBullets = function () {};

PrinceJS.RocketLauncher.prototype.flightDistance = function (age) {
  let accelerationTime = (this.spec.maxSpeed - this.spec.speed) / this.spec.acceleration;
  let accelerating = Math.min(age, accelerationTime);
  return (
    this.spec.speed * accelerating +
    0.5 * this.spec.acceleration * accelerating * accelerating +
    this.spec.maxSpeed * Math.max(0, age - accelerationTime)
  );
};

PrinceJS.RocketLauncher.prototype.advanceBullets = function (delta) {
  this.bullets = this.bullets.filter((rocket) => {
    let flightTime = Math.min(delta, Math.max(0, rocket.life));
    let age = rocket.age || 0;
    let travelled = rocket.distance || 0;
    let distance = Math.min(
      this.spec.range - travelled,
      this.flightDistance(age + flightTime) - this.flightDistance(age)
    );
    rocket.life = Math.max(0, rocket.life - delta);
    rocket.age = age + flightTime;
    rocket.speed = Math.min(this.spec.maxSpeed, this.spec.speed + this.spec.acceleration * rocket.age);
    rocket.distance = travelled + distance;
    // Sweep the final partial frame too, so a wall at the end of the range is still breached.
    if (!this.advanceBullet(rocket, distance)) {
      return false;
    }
    if (rocket.life === 0 || rocket.distance >= this.spec.range) {
      this.impact(rocket);
      return false;
    }
    return true;
  });
};

PrinceJS.RocketLauncher.prototype.impact = function (rocket, directHit, obstacle) {
  this.effects.explode(rocket.x, rocket.y);
  this.playExplosionSound();
  for (let enemy of this.delegate.enemies) {
    if (!enemy.alive || !enemy.active || !enemy.visible || enemy.charFrame === undefined) {
      continue;
    }
    let bounds = enemy.getCharBounds();
    let targetX = Math.max(enemy.baseX + bounds.x, Math.min(rocket.x, enemy.baseX + bounds.x + bounds.width));
    let targetY = Math.max(enemy.baseY + bounds.y, Math.min(rocket.y, enemy.baseY + bounds.y + bounds.height));
    let distance = Math.hypot(targetX - rocket.x, targetY - rocket.y);
    if (enemy !== directHit && (distance > 58 || !this.blastCanReach(rocket, targetX, targetY))) {
      continue;
    }
    let damage = enemy === directHit ? 5 : distance < 28 ? 4 : 2;
    for (let i = 0; i < damage && enemy.alive; i++) {
      this.hitEnemy(enemy, rocket);
    }
  }
  // Evaluate splash against the intact wall, then leave an opening for the next shot and the Prince.
  if (obstacle) {
    this.level.destroyBarrier(obstacle, rocket);
  }
};

PrinceJS.RocketLauncher.prototype.obstacleAt = function (rocket, room) {
  let obstacle = PrinceJS.RangedWeapon.prototype.obstacleAt.call(this, rocket, room);
  if (obstacle) {
    return obstacle;
  }
  let column = Math.floor((rocket.x - room.x * PrinceJS.ROOM_WIDTH) / PrinceJS.BLOCK_WIDTH);
  let row = Math.floor((rocket.y - room.y * PrinceJS.ROOM_HEIGHT) / PrinceJS.BLOCK_HEIGHT);
  let tile = this.level.getTileAt(column, row, rocket.room);
  if (tile.element === PrinceJS.Level.TILE_EXIT_LEFT) {
    tile = this.level.getTileAt(column + 1, row, rocket.room);
  }
  // Arrival doorways never intercept rockets; even an open exit has a facade to shatter.
  return tile.element === PrinceJS.Level.TILE_EXIT_RIGHT &&
    tile.doorRole !== "entrance" &&
    !tile.destroyedByRocket &&
    (!tile.open || tile.doorRole === "exit")
    ? tile
    : null;
};

PrinceJS.RocketLauncher.prototype.blastCanReach = function (rocket, x, y) {
  let distance = Math.hypot(x - rocket.x, y - rocket.y);
  let steps = Math.max(1, Math.ceil(distance / 2));
  for (let i = 1; i <= steps; i++) {
    let point = { x: rocket.x + ((x - rocket.x) * i) / steps, y: rocket.y + ((y - rocket.y) * i) / steps };
    let roomId = Object.keys(this.level.rooms).find((id) => {
      let room = this.level.rooms[id];
      return (
        Math.floor(point.x / PrinceJS.ROOM_WIDTH) === room.x && Math.floor(point.y / PrinceJS.ROOM_HEIGHT) === room.y
      );
    });
    point.room = roomId;
    if (!roomId || this.blockedAt(point, this.level.rooms[roomId])) {
      return false;
    }
    let room = this.level.rooms[roomId];
    let localY = point.y - room.y * PrinceJS.ROOM_HEIGHT;
    let row = Math.floor(localY / PrinceJS.BLOCK_HEIGHT);
    let tile = this.level.getTileAt(
      Math.floor((point.x - room.x * PrinceJS.ROOM_WIDTH) / PrinceJS.BLOCK_WIDTH),
      row,
      roomId
    );
    if (localY % PrinceJS.BLOCK_HEIGHT >= 53 && tile.isWalkable()) {
      return false;
    }
  }
  return true;
};

PrinceJS.RocketLauncher.prototype.playShotSound = function () {
  this.game.sound.play("LooseFloorShakes3", 0.7);
};

PrinceJS.RocketLauncher.prototype.playExplosionSound = function () {
  this.game.sound.play("LooseFloorLands", 0.9);
};
