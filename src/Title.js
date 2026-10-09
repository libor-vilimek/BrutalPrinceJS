"use strict";

PrinceJS.Title = function (game) {
  this.tick = 0;
};

PrinceJS.Title.prototype = {
  preload: function () {},

  create: function () {
    this.stopMusic();

    this.tick = 0;

    this.game.world.setBounds(0, 0, PrinceJS.SCREEN_WIDTH, PrinceJS.SCREEN_HEIGHT);

    this.back = this.game.add.image(0, 0, "title", "main_background");
    this.back.alpha = 0;

    this.tween1 = this.game.add.tween(this.back).to({ alpha: 1 }, 2000, Phaser.Easing.Linear.None, false, 0, 0, false);

    this.tween1.onComplete.add(() => {
      this.game.sound.play("PrologueA");
    });

    this.presents = this.game.add.image(this.world.centerX, this.world.centerY + 29.5, "title", "presents");
    this.presents.anchor.setTo(0.5, 0.5);
    this.presents.visible = false;

    this.author = this.game.add.image(this.world.centerX - 3, this.world.centerY + 37, "title", "author");
    this.author.anchor.setTo(0.5, 0.5);
    this.author.visible = false;

    this.prince = this.game.add.image(0, 0, "title", "prince");
    this.prince.visible = false;
    this.createBrutalTitle();

    this.textBack = this.game.add.image(0, this.world.height, "title", "in_the_absence");
    this.textBack.anchor.setTo(0, 1);

    this.cropRect = new Phaser.Rectangle(0, 0, 0, this.textBack.height);
    this.tween2 = this.game.add
      .tween(this.cropRect)
      .to({ width: this.textBack.width }, 200, Phaser.Easing.Linear.None, false, 0, 0, false);
    this.textBack.crop(this.cropRect);

    this.tween3 = this.game.add
      .tween(this.textBack)
      .to({ alpha: 0 }, 2000, Phaser.Easing.Linear.None, false, 0, 0, false);
    this.tween3.onComplete.add(() => {
      PrinceJS.Utils.delayed(() => {
        this.cutscene();
      }, 3500);
    });

    this.input.keyboard.onDownCallback = this.play.bind(this);
  },

  createBrutalTitle: function () {
    this.brutalBitmap = this.game.add.bitmapData(224, 60);
    const context = this.brutalBitmap.ctx;
    context.font = 'bold 60px Georgia, "Times New Roman", serif';
    context.textAlign = "center";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#260008";
    context.strokeText("Brutal", 112, 54, 208);
    const red = context.createLinearGradient(0, 10, 0, 56);
    red.addColorStop(0, "#ff6650");
    red.addColorStop(0.25, "#ff3030");
    red.addColorStop(0.6, "#df101b");
    red.addColorStop(1, "#89000b");
    context.fillStyle = red;
    context.fillText("Brutal", 112, 54, 208);
    this.brutalBitmap.dirty = true;

    this.brutal = this.game.make.image((PrinceJS.SCREEN_WIDTH - 224) / 2, 18, this.brutalBitmap);
    // Inherit the original logo's visibility and stay behind the story text wipe.
    this.prince.addChild(this.brutal);
    this.brutalBlood = this.game.make.graphics(0, 0);
    this.brutal.addChild(this.brutalBlood);
    this.brutalElapsed = 0;
    this.brutalDrips = [];

    // Attach every stream to actual ink, including when the serif fallback is used.
    const pixels = context.getImageData(0, 0, 224, 60).data;
    for (let x = 10; x < 214; x += 9) {
      for (let y = 57; y >= 45; y--) {
        const pixel = (y * 224 + x) * 4;
        if (pixels[pixel + 3] > 160 && pixels[pixel] > 100 && pixels[pixel + 1] < 70) {
          const index = this.brutalDrips.length;
          this.brutalDrips.push({ x, y, length: 7 + ((index * 7) % 11), period: 2.1 + (index % 5) * 0.31 });
          break;
        }
      }
    }
    this.updateBrutalTitle(0);
  },

  updateBrutalTitle: function (dt) {
    this.brutalElapsed += dt;
    const blood = this.brutalBlood;
    blood.clear();
    this.brutalDrips.forEach((drip, index) => {
      const phase = ((this.brutalElapsed + index * 0.37) % drip.period) / drip.period;
      const length = Math.round(drip.length * (0.55 + 0.45 * Math.min(1, phase / 0.75)));
      blood.beginFill(0x390009);
      blood.drawRect(drip.x - 1, drip.y, 3, length + 1);
      blood.endFill();
      blood.beginFill(0xb30816);
      blood.drawRect(drip.x, drip.y - 1, 2, 3);
      blood.drawRect(drip.x, drip.y, 1, length);
      blood.drawRect(drip.x - 1, drip.y + length - 1, 3, 2);
      blood.endFill();
      blood.beginFill(0xf12b32);
      blood.drawRect(drip.x, drip.y + 1, 1, Math.max(1, length - 3));
      blood.endFill();
      if (phase > 0.75) {
        const fall = (phase - 0.75) / 0.25;
        const y = drip.y + drip.length + 3 + Math.round(fall * fall * 8);
        blood.beginFill(0xcf1020, 1 - fall);
        blood.drawRect(drip.x, y, 2, 3);
        blood.endFill();
      }
    });
  },

  update: function () {
    switch (this.tick) {
      case 0:
        this.tween1.start();
        break;
      case 250:
        this.presents.visible = true;
        break;
      case 450:
        this.presents.visible = false;
        break;
      case 530:
        this.author.visible = true;
        break;
      case 730:
        this.author.visible = false;
        break;
      case 1030:
        this.prince.visible = true;
        break;
      case 1600:
        this.tween2.start();
        this.game.sound.play("PrologueB");
        break;
      case 2250:
        this.back.visible = false;
        this.prince.visible = false;
        this.tween3.start();
        break;
    }

    if (this.prince.visible) {
      this.updateBrutalTitle(Math.min(this.game.time.elapsedMS, 100) / 1000);
    }

    this.tick++;
    this.textBack.updateCrop();

    if (PrinceJS.Utils.continueGame(this.game)) {
      this.play();
    }
  },

  play: function () {
    this.stopMusic();
    this.input.keyboard.onDownCallback = null;
    this.state.start("Game");
  },

  cutscene: function () {
    this.stopMusic();
    this.input.keyboard.onDownCallback = null;
    this.state.start("Cutscene");
  },

  shutdown: function () {
    this.brutal.destroy();
    this.brutalBitmap.destroy();
    this.brutalDrips = [];
  },

  stopMusic: function () {
    this.game.sound.stopAll();
  }
};
