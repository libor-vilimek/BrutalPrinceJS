"use strict";

PrinceJS.EndTitle = function (game) {
  this.tick = 0;
};

PrinceJS.EndTitle.prototype = {
  preload: function () {
    this.game.load.audio("Epilogue", "assets/music/22_Epilogue.mp3");
  },

  create: function () {
    this.stopMusic();

    this.tick = 0;
    this.game.world.alpha = 1;

    this.game.world.setBounds(0, 0, PrinceJS.SCREEN_WIDTH, PrinceJS.SCREEN_HEIGHT);

    this.game.sound.play("Epilogue");

    this.createBrutalEpilogue();
    this.back.alpha = 0;

    this.tween1 = this.game.add.tween(this.back).to({ alpha: 1 }, 2000, Phaser.Easing.Linear.None, false, 0, 0, false);

    this.textBack = this.game.add.image(0, this.world.height, "title", "main_background");
    this.textBack.anchor.setTo(0, 1);

    this.cropRect = new Phaser.Rectangle(0, 0, 0, this.textBack.height);
    this.tween2 = this.game.add
      .tween(this.cropRect)
      .to({ width: this.textBack.width }, 200, Phaser.Easing.Linear.None, false, 0, 0, false);
    this.textBack.crop(this.cropRect);

    this.tween3 = this.game.add
      .tween(this.textBack)
      .to({ alpha: 0 }, 2000, Phaser.Easing.Linear.None, false, 0, 0, false);
    this.tween3.onComplete.add(this.next, this);

    this.input.keyboard.onDownCallback = null;
    this.inputDelay = PrinceJS.Utils.delayedCancelable(() => {
      this.input.keyboard.onDownCallback = this.next.bind(this);
    }, 1000);
  },

  createBrutalEpilogue: function () {
    this.brutalEpilogueBitmap = this.game.add.bitmapData(320, 200);
    const context = this.brutalEpilogueBitmap.ctx;
    context.imageSmoothingEnabled = false;
    const source = this.game.make.image(0, 0, "title", "the_tyrant");
    this.brutalEpilogueBitmap.draw(source, 0, 0);
    source.destroy();
    const original = context.getImageData(0, 0, 320, 200).data;

    // Reuse the actual story ink and its dither, leaving the mosaic and drop cap intact.
    // Four slightly closer lines make room for the new final title without losing a word.
    context.fillStyle = "#000000";
    context.fillRect(18, 79, 284, 95);
    const color = original.slice((94 * 320 + 20) * 4, (94 * 320 + 20) * 4 + 3);
    context.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    for (let y = 79; y < 174; y++) {
      for (let x = 18 + (y % 2); x < 302; x += 2) {
        context.fillRect(x, y, 1, 1);
      }
    }
    const copyInk = (sx, sy, width, height, dx, dy) => {
      context.fillStyle = "#ffffff";
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = ((sy + y) * 320 + sx + x) * 4;
          if (original[index] > 200 && original[index + 1] > 200 && original[index + 2] > 200) {
            context.fillRect(dx + x, dy + y, 1, 1);
          }
        }
      }
    };
    [
      [82, 80],
      [99, 94],
      [116, 108],
      [133, 122]
    ].forEach(([from, to]) => {
      copyInk(20, from, 280, 14, 20, to);
    });
    copyInk(34, 150, 104, 10, 108, 138);
    copyInk(144, 150, 135, 10, 132, 155);

    // A small, deliberately drawn serif alphabet keeps every edge on the native pixel grid.
    const letters = [
      ["11110", "01011", "01011", "01110", "01011", "01011", "11110"],
      ["11110", "01011", "01011", "01110", "01010", "01011", "11011"],
      ["11011", "01010", "01010", "01010", "01010", "01010", "01110"],
      ["11111", "10101", "00100", "00100", "00100", "00100", "01110"],
      ["00100", "01110", "01010", "01010", "11111", "11011", "11011"],
      ["11100", "01000", "01000", "01000", "01001", "01001", "11111"]
    ];
    const ink = [];
    letters.forEach((letter, index) => {
      letter.forEach((row, y) => {
        [...row].forEach((pixel, x) => {
          if (pixel === "1") {
            ink.push({ x: 54 + index * 12 + x * 2, y: 152 + y * 2 });
          }
        });
      });
    });
    context.fillStyle = "#390009";
    ink.forEach((pixel) => context.fillRect(pixel.x - 1, pixel.y - 1, 4, 4));
    ink.forEach((pixel) => {
      context.fillStyle = pixel.y < 158 ? "#f12b32" : pixel.y < 162 ? "#cf1020" : "#b30816";
      context.fillRect(pixel.x, pixel.y, 2, 2);
    });
    this.brutalEpilogueBitmap.dirty = true;
    this.back = this.game.add.image(0, 0, this.brutalEpilogueBitmap);
    this.brutalBlood = this.game.make.graphics(0, 0);
    this.back.addChild(this.brutalBlood);
    this.brutalElapsed = 0;
    this.brutalDrips = [];
    const pixels = context.getImageData(0, 0, 320, 200).data;
    for (let x = 56; x < 122; x += 7) {
      for (let y = 165; y >= 159; y--) {
        const index = (y * 320 + x) * 4;
        if (pixels[index] > 140 && pixels[index + 1] < 50 && pixels[index + 2] < 70) {
          const drip = this.brutalDrips.length;
          this.brutalDrips.push({ x, y, length: Math.min(5 + (drip % 3), 171 - y), period: 1.8 + (drip % 4) * 0.33 });
          break;
        }
      }
    }
    this.updateBrutalEpilogue(0);
  },

  updateBrutalEpilogue: function (dt) {
    this.brutalElapsed += Math.max(0, dt || 0);
    const blood = this.brutalBlood;
    blood.clear();
    this.brutalDrips.forEach((drip, index) => {
      const phase = ((this.brutalElapsed + index * 0.37) % drip.period) / drip.period;
      const length = Math.round(drip.length * (0.4 + 0.6 * Math.min(1, phase / 0.7)));
      blood.beginFill(0x390009);
      blood.drawRect(drip.x - 1, drip.y, 3, length + 1);
      blood.endFill();
      blood.beginFill(0xb30816);
      blood.drawRect(drip.x, drip.y, 1, length);
      blood.drawRect(drip.x, drip.y + length - 1, 2, 2);
      blood.endFill();
      blood.beginFill(0xf12b32);
      blood.drawRect(drip.x, drip.y, 1, Math.max(1, length - 2));
      blood.endFill();
      if (phase > 0.7) {
        const fall = (phase - 0.7) / 0.3;
        const y = drip.y + length + Math.round(fall * fall * 3);
        if (y < 173) {
          blood.beginFill(0xcf1020, 1 - fall);
          blood.drawRect(drip.x, y, 1, Math.min(2, 174 - y));
          blood.endFill();
        }
      }
    });
  },

  destroyBrutalEpilogue: function () {
    if (this.brutalEpilogueBitmap) {
      this.back.destroy();
      this.brutalEpilogueBitmap.destroy();
    }
    this.brutalEpilogueBitmap = this.brutalBlood = null;
    this.brutalDrips = [];
  },

  update: function () {
    switch (this.tick) {
      case 100:
        this.tween1.start();
        break;
      case 1250:
        this.tween2.start();
        break;
      case 7250:
        this.back.visible = false;
        this.tween3.start();
        break;
    }

    this.tick++;
    this.textBack.updateCrop();
    if (this.back.visible) {
      this.updateBrutalEpilogue(this.game.time.physicsElapsed);
    }

    if (PrinceJS.Utils.continueGame(this.game)) {
      this.next();
    }
  },

  next: function () {
    this.input.keyboard.onDownCallback = null;
    this.state.start("Title");
  },

  shutdown: function () {
    this.inputDelay?.cancel();
    this.input.keyboard.onDownCallback = null;
    this.destroyBrutalEpilogue();
  },

  stopMusic: function () {
    this.game.sound.stopAll();
  }
};
