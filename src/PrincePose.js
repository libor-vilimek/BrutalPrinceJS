"use strict";

// Native kid-15 palette and proportions, shared by the new equipment poses.
PrinceJS.PrincePose = {
  HEAD_HEIGHT: 8, // Stop after the native neck/collar, before the old shoulder and arm pixels.
  UPPER_ARM: 8,
  FOREARM: 7,
  colors: { cloth: 0xffffdd, clothShade: 0xddbbaa, skin: 0xdd8866, skinShade: 0xbb7766 },

  arm: function (shoulder, target, bend, projection = 1) {
    let dx = target.x - shoulder.x;
    let dy = target.y - shoulder.y;
    let distance = Math.hypot(dx, dy);
    // Depth turns shorten the projected limbs instead of folding full-length arms into loops.
    let upper = this.UPPER_ARM * projection;
    let lower = this.FOREARM * projection;
    let reach = Math.max(Math.abs(lower - upper) + 0.01, Math.min(upper + lower - 0.15, distance));
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

  drawTorso: function (graphics, top, bottom, center = -6, twist = 0, turn = 1, light) {
    // Arm-free silhouette traced from kid-15: sloping shoulders, a narrow chest and the native waist.
    const rows = [
      [-4, 5],
      [-5, 6],
      [-5, 7],
      [-5, 7],
      [-5, 7],
      [-5, 8],
      [-5, 8],
      [-5, 8],
      [-5, 9],
      [-5, 9],
      [-5, 9],
      [-5, 8],
      [-5, 8],
      [-5, 8],
      [-5, 8],
      [-5, 8],
      [-5, 8]
    ];
    const color = (value) => (light ? light(value) : value);
    for (let y = top; y < bottom; y++) {
      let t = (y - top) / (bottom - top);
      let [left, width] = rows[Math.min(rows.length - 1, Math.floor(t * rows.length))];
      let x = center + left + twist * (1 - t);
      // Smoothly broaden the chest when the shoulders turn toward the viewer.
      x -= (1 - Math.abs(turn)) * 1.5;
      width += Math.round((1 - Math.abs(turn)) * 3);
      graphics.beginFill(color(this.colors.clothShade), 1);
      graphics.drawRect(Math.round(x), y, width, 1);
      graphics.endFill();
      graphics.beginFill(color(this.colors.cloth), 1);
      graphics.drawRect(Math.round(x) + 1, y, width - 1, 1);
      graphics.endFill();
    }
  },

  drawCrouchedLegs: function (graphics, light) {
    // kid-109's bent legs only. A rectangular bottom crop also contains its old supporting hand.
    const rows = [
      "FFFFGGGGGGG",
      "FFGGGGGGGGG",
      "GGGGGGGGGGG",
      "GGGGGGGGGGF",
      "GGGGFFGGGF.",
      "GGGGCCFF...",
      "GFFFCCCC...",
      "....CCCC...",
      "....CCC....",
      "..CCC......"
    ];
    const palette = { G: this.colors.cloth, F: this.colors.clothShade, C: this.colors.skin };
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === ".") {
          continue;
        }
        let fill = palette[row[x]];
        graphics.beginFill(light ? light(fill) : fill, 1);
        graphics.drawRect(-10 - x, y - 10, 1, 1);
        graphics.endFill();
      }
    });
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
    // Bare arms taper at the wrists; the torso supplies the shoulder opening.
    for (let [from, to] of [
      [arm.shoulder, arm.elbow],
      [arm.elbow, arm.hand]
    ]) {
      limb(from, to, colors.skinShade, 3);
      limb(from, to, colors.skin, 2);
    }
    rect(colors.skinShade, arm.hand.x - 1, arm.hand.y - 1, 3, 2);
    rect(colors.skin, arm.hand.x - 1, arm.hand.y - 1, 2, 2);
  }
};
