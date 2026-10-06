"use strict";

PrinceJS.MolotovBallistics = {
  MAX_CHARGE: 1.5,
  MIN_SPEED: 110,
  MAX_SPEED: 355,
  GRAVITY: 420,
  RADIUS: 5,

  createBottle: function (controller, state, point) {
    let charge = Math.max(0, Math.min(this.MAX_CHARGE, Number(state.charge) || 0));
    let direction = state.direction < 0 ? -1 : 1;
    let angle = ((state.aimUp ? 70 : 30) * Math.PI) / 180;
    let speed = this.MIN_SPEED + ((this.MAX_SPEED - this.MIN_SPEED) * charge) / this.MAX_CHARGE;
    let drop = state.hanging && !state.aimUp && charge < 0.18;
    return {
      room: controller.kid.room,
      x: point.x,
      y: point.y,
      vx: drop ? 0 : Math.cos(angle) * speed * direction,
      vy: drop ? 65 : -Math.sin(angle) * speed,
      direction: direction,
      charge: charge,
      aimUp: !!state.aimUp,
      radius: this.RADIUS,
      age: 0,
      life: 6
    };
  },

  intersect: function (from, to, surface, radius) {
    let entry = 0;
    let exit = 1;
    let normalX = 0;
    let normalY = 0;
    for (let axis of ["x", "y"]) {
      let minimum = (axis === "x" ? surface.left : surface.top) - radius;
      let maximum = (axis === "x" ? surface.right : surface.bottom) + radius;
      let distance = to[axis] - from[axis];
      if (Math.abs(distance) < 0.000001) {
        if (from[axis] <= minimum || from[axis] >= maximum) {
          return null;
        }
        continue;
      }
      let near = (minimum - from[axis]) / distance;
      let far = (maximum - from[axis]) / distance;
      if (near > far) {
        [near, far] = [far, near];
      }
      if (near >= entry) {
        entry = near;
        normalX = axis === "x" ? -Math.sign(distance) : 0;
        normalY = axis === "y" ? -Math.sign(distance) : 0;
      }
      exit = Math.min(exit, far);
      if (entry > exit || exit <= 0.000001) {
        return null;
      }
    }
    return entry <= 1 ? { time: entry, normalX: normalX, normalY: normalY, surface: surface } : null;
  },

  advanceBottle: function (controller, bottle, delta) {
    delta = Number(delta);
    if (!Number.isFinite(delta) || delta < 0) {
      delta = 0;
    }
    bottle.age += delta;
    bottle.life -= delta;
    if (bottle.life <= 0 || !controller.level.rooms[bottle.room]) {
      return false;
    }
    bottle.vx = Number(bottle.vx) || 0;
    bottle.vy = Number(bottle.vy) || 0;
    let radius = bottle.radius || this.RADIUS;
    if (!controller.bottlePhysics || controller.bottlePhysics.level !== controller.level) {
      controller.bottlePhysics = new PrinceJS.GorePhysics(controller.level);
    }
    // Short curved sweeps stop even a fully charged throw at a four-pixel gate.
    let steps = Math.max(1, Math.ceil(((Math.hypot(bottle.vx, bottle.vy) + this.GRAVITY * delta) * delta) / 2));
    let step = delta / steps;
    for (let i = 0; i < steps; i++) {
      let from = { room: bottle.room, x: bottle.x, y: bottle.y };
      let to = {
        x: bottle.x + bottle.vx * step,
        y: bottle.y + bottle.vy * step + (this.GRAVITY * step * step) / 2
      };
      let near = {
        room: bottle.room,
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2,
        radius: radius + 2
      };
      let contact = null;
      for (let surface of controller.bottlePhysics.surfaces(near)) {
        let hit = this.intersect(from, to, surface, radius);
        if (hit && (!contact || hit.time < contact.time)) {
          contact = hit;
        }
      }
      bottle.vy += this.GRAVITY * step;
      if (contact) {
        bottle.x = from.x + (to.x - from.x) * contact.time;
        bottle.y = from.y + (to.y - from.y) * contact.time;
        let surface = contact.surface;
        bottle.room = surface.room;
        if (
          surface.kind === "floor" &&
          contact.normalY < 0 &&
          surface.tile &&
          Number.isInteger(surface.tile.roomX) &&
          Number.isInteger(surface.tile.roomY) &&
          surface.tile.isWalkable()
        ) {
          // Keep the oil on its supporting tile when the bottle clips a ledge corner.
          bottle.x = Math.max(surface.left + 0.01, Math.min(surface.right - 0.01, bottle.x));
          controller.ignite(bottle, surface.tile.roomX, surface.tile.roomY, surface.top);
        } else {
          controller.effects.shatter(bottle.x, bottle.y, false);
        }
        return false;
      }
      bottle.x = to.x;
      bottle.y = to.y;
      if (!controller.resolveRoom(bottle)) {
        Object.assign(bottle, from);
        controller.effects.shatter(bottle.x, bottle.y, false);
        return false;
      }
    }
    return true;
  }
};
