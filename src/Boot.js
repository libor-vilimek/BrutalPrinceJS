"use strict";

let PrinceJS = {};

PrinceJS.SCALE_FACTOR = 2;

PrinceJS.SCREEN_WIDTH = 320;
PrinceJS.SCREEN_HEIGHT = 200;

PrinceJS.WORLD_WIDTH = PrinceJS.SCREEN_WIDTH * PrinceJS.SCALE_FACTOR;
PrinceJS.WORLD_HEIGHT = PrinceJS.SCREEN_HEIGHT * PrinceJS.SCALE_FACTOR;
PrinceJS.WORLD_RATIO = PrinceJS.WORLD_WIDTH / PrinceJS.WORLD_HEIGHT;

PrinceJS.BLOCK_WIDTH = 32;
PrinceJS.BLOCK_HEIGHT = 63;

PrinceJS.ROOM_HEIGHT = PrinceJS.BLOCK_HEIGHT * 3;
PrinceJS.ROOM_WIDTH = PrinceJS.SCREEN_WIDTH;

PrinceJS.UI_HEIGHT = 8;
PrinceJS.TIME_LIMIT = 600;

PrinceJS.SKIP_TITLE = false;
PrinceJS.SKIP_CUTSCENES = false;

PrinceJS.Init = function () {
  PrinceJS.currentLevel = 1;
  PrinceJS.maxHealth = 10;
  PrinceJS.currentHealth = null;
  PrinceJS.minutes = PrinceJS.TIME_LIMIT;
  PrinceJS.startTime = undefined;
  PrinceJS.endTime = undefined;
  PrinceJS.strength = 100;
  PrinceJS.screenWidth = 0;
  PrinceJS.shortcut = false;
  PrinceJS.danger = null;
  PrinceJS.skipShowLevel = false;
};

PrinceJS.Gamepad = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  L: 4,
  R: 5,
  ZL: 6,
  ZR: 7,
  Minus: 8,
  Plus: 9,
  DPadU: 12,
  DPadD: 13,
  DPadL: 14,
  DPadR: 15,
  Axis: {
    LX: 0,
    LY: 1,
    RX: 2,
    RY: 3
  }
};

PrinceJS.Restart = function () {
  PrinceJS.Utils.clearQuery();
  PrinceJS.Init();
  PrinceJS.Utils.applyQuery();
};

PrinceJS.Boot = function () {
  PrinceJS.Init();
};

PrinceJS.Boot.prototype = {
  preload: function () {
    this.load.bitmapFont("font", "assets/font/prince_0.png", "assets/font/prince.fnt");
  },

  create: function () {
    this.world.scale.set(PrinceJS.SCALE_FACTOR);
    this.state.start("Preloader");

    PrinceJS.Utils.applyQuery();
    PrinceJS.Utils.applyScreenWidth();
  }
};
