"use strict";

// Native kid-15 palette and proportions, shared by the new equipment poses.
PrinceJS.PrincePose = {
  HEAD_HEIGHT: 9, // Includes the original one-pixel neck and shirt collar.
  UPPER_ARM: 8,
  FOREARM: 10,
  colors: { cloth: 0xffffdd, clothShade: 0xddbbaa, skin: 0xdd8866, skinShade: 0xbb7766 },

  arm: function (shoulder, target, bend) {
    let dx = target.x - shoulder.x;
    let dy = target.y - shoulder.y;
    let distance = Math.hypot(dx, dy);
    let upper = this.UPPER_ARM;
    let lower = this.FOREARM;
    let reach = Math.max(lower - upper + 0.01, Math.min(upper + lower - 0.01, distance));
    let ux = distance > 0 ? dx / distance : 0;
    let uy = distance > 0 ? dy / distance : 1;
    let along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
    let across = Math.sqrt(Math.max(0, upper * upper - along * along)) * (bend < 0 ? -1 : 1);
    return {
      shoulder: shoulder,
      elbow: { x: shoulder.x + ux * along - uy * across, y: shoulder.y + uy * along + ux * across },
      hand: { x: shoulder.x + ux * reach, y: shoulder.y + uy * reach }
    };
  },

  drawArm: function (graphics, arm, light) {
    let colors = this.colors;
    let color = (value) => (light ? light(value) : value);
    let rect = (fill, x, y, width, height) => {
      graphics.beginFill(color(fill), 1);
      graphics.drawRect(Math.round(x), Math.round(y), width, height);
      graphics.endFill();
    };
    let limb = (from, to, fill, width) => {
      let steps = Math.max(1, Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))));
      for (let i = 0; i <= steps; i++) {
        rect(
          fill,
          from.x + ((to.x - from.x) * i) / steps - Math.floor(width / 2),
          from.y + ((to.y - from.y) * i) / steps - Math.floor(width / 2),
          width,
          width
        );
      }
    };
    // The original Prince has bare arms, with a small white shoulder opening.
    for (let [from, to] of [
      [arm.shoulder, arm.elbow],
      [arm.elbow, arm.hand]
    ]) {
      limb(from, to, colors.skinShade, 3);
      limb(from, to, colors.skin, 2);
    }
    rect(colors.clothShade, arm.shoulder.x - 1, arm.shoulder.y - 2, 3, 2);
    rect(colors.cloth, arm.shoulder.x, arm.shoulder.y - 2, 2, 2);
    rect(colors.skinShade, arm.hand.x - 1, arm.hand.y - 1, 3, 3);
    rect(colors.skin, arm.hand.x - 1, arm.hand.y - 1, 2, 2);
  }
};
