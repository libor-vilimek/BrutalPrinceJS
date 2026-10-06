"use strict";

PrinceJS.Interface = function (game, delegate) {
  this.game = game;
  this.delegate = delegate;

  let bmd = this.game.make.bitmapData(PrinceJS.SCREEN_WIDTH, PrinceJS.UI_HEIGHT);
  bmd.fill(0, 0, 0);

  this.layer = this.game.add.sprite(0, (PrinceJS.SCREEN_HEIGHT - PrinceJS.UI_HEIGHT) * PrinceJS.SCALE_FACTOR, bmd);
  this.layer.fixedToCamera = true;
  this.layer.scale.setTo(
    PrinceJS.SCALE_FACTOR / this.game.world.scale.x,
    PrinceJS.SCALE_FACTOR / this.game.world.scale.y
  );

  let bmdRed = this.game.make.bitmapData(PrinceJS.SCREEN_WIDTH, PrinceJS.UI_HEIGHT);
  bmdRed.fill(255, 0, 0);
  this.layerRed = this.game.add.sprite(0, 0, bmdRed);
  this.layerRed.visible = false;
  this.layer.addChild(this.layerRed);
  let bmdGreen = this.game.make.bitmapData(PrinceJS.SCREEN_WIDTH, PrinceJS.UI_HEIGHT);
  bmdGreen.fill(0, 255, 0);
  this.layerGreen = this.game.add.sprite(0, 0, bmdGreen);
  this.layerGreen.visible = false;
  this.layer.addChild(this.layerGreen);
  let bmdYellow = this.game.make.bitmapData(PrinceJS.SCREEN_WIDTH, PrinceJS.UI_HEIGHT);
  bmdYellow.fill(255, 255, 0);
  this.layerYellow = this.game.add.sprite(0, 0, bmdYellow);
  this.layerYellow.visible = false;
  this.layer.addChild(this.layerYellow);
  let bmdWhite = this.game.make.bitmapData(PrinceJS.SCREEN_WIDTH, PrinceJS.UI_HEIGHT);
  bmdWhite.fill(255, 255, 255);
  this.layerWhite = this.game.add.sprite(0, 0, bmdWhite);
  this.layerWhite.visible = false;
  this.layer.addChild(this.layerWhite);

  this.flashMap = {
    [PrinceJS.Level.FLASH_RED]: this.layerRed,
    [PrinceJS.Level.FLASH_GREEN]: this.layerGreen,
    [PrinceJS.Level.FLASH_YELLOW]: this.layerYellow,
    [PrinceJS.Level.FLASH_WHITE]: this.layerWhite
  };

  this.text = this.game.make.bitmapText(PrinceJS.SCREEN_WIDTH * 0.5, (PrinceJS.UI_HEIGHT - 2) * 0.5, "font", "", 16);
  this.text.anchor.setTo(0.5, 0.5);
  this.showTextType = null;
  this.showLevel();

  this.layer.addChild(this.text);

  this.player = null;
  this.playerHPs = [];
  this.playerHPActive = 0;

  this.opp = null;
  this.oppHPs = [];
  this.oppHPActive = 0;

  this.pressButtonToContinueTimer = -1;
  this.hideTextTimer = -1;

  PrinceJS.InterfaceCurrent = this;
};

PrinceJS.Interface.prototype = {
  setPlayerLive: function (actor) {
    this.player = actor;
    this.playerHPActive = this.player.health;
    for (let i = 0; i < this.playerHPActive; i++) {
      this.playerHPs[i] = this.game.add.sprite(i * 7, 2, "general", "kid-live");
      this.layer.addChild(this.playerHPs[i]);
    }
    for (let i = this.playerHPActive; i < this.player.maxHealth; i++) {
      this.playerHPs[i] = this.game.add.sprite(i * 7, 2, "general", "kid-emptylive");
      this.layer.addChild(this.playerHPs[i]);
    }
    this.player.onDamageLife.add(this.damagePlayerLive, this);
    this.player.onRecoverLive.add(this.recoverPlayerLive, this);
    this.player.onAddLive.add(this.addPlayerLive, this);
  },

  damagePlayerLive: function (num) {
    let n = Math.min(this.playerHPActive, num);
    for (let i = 0; i < n; i++) {
      this.playerHPActive--;
      this.playerHPs[this.playerHPActive].frameName = "kid-emptylive";
    }
  },

  recoverPlayerLive: function () {
    this.playerHPs[0].frameName = "kid-live";
    this.playerHPs[this.playerHPActive].frameName = "kid-live";
    this.playerHPActive++;
  },

  addPlayerLive: function () {
    this.playerHPActive = this.playerHPs.length;
    if (this.playerHPs.length < 10) {
      let hp = this.game.add.sprite(this.playerHPActive * 7, 2, "general", "kid-live");
      this.playerHPs[this.playerHPActive] = hp;
      this.layer.addChild(hp);
      this.playerHPActive++;
    }

    for (let i = 0; i < this.playerHPActive; i++) {
      this.playerHPs[i].frameName = "kid-live";
    }
  },

  setOpponentLive: function (actor) {
    if (this.opp === actor) {
      return;
    }
    this.resetOpponentLive();
    this.opp = actor;

    if (!actor || !actor.active || actor.charName === "skeleton") {
      return;
    }

    this.oppHPs = [];
    this.oppHPActive = actor.health;

    for (let i = actor.health; i > 0; i--) {
      this.oppHPs[i - 1] = this.game.add.sprite(
        PrinceJS.SCREEN_WIDTH - i * 7 + 1,
        2,
        "general",
        actor.baseCharName + "-live"
      );
      if (actor.charColor > 0) {
        this.oppHPs[i - 1].tint = PrinceJS.Enemy.COLOR[actor.charColor - 1];
      }
      this.layer.addChild(this.oppHPs[i - 1]);
    }

    actor.onDamageLife.add(this.damageOpponentLive, this);
    actor.onDead.add(this.resetOpponentLive, this);
  },

  resetOpponentLive: function () {
    if (!this.opp) {
      return;
    }

    for (let i = 0; i < this.oppHPs.length; i++) {
      this.oppHPs[i].destroy();
    }
    this.opp.onDamageLife.remove(this.damageOpponentLive, this);
    this.opp.onDead.remove(this.resetOpponentLive, this);
    this.opp = null;
    this.oppHPs = [];
    this.oppHPActive = 0;
  },

  damageOpponentLive: function (num) {
    if (!this.opp || this.opp.charName === "skeleton") {
      return;
    }

    let n = Math.min(this.oppHPActive, num);
    for (let i = 0; i < n; i++) {
      this.oppHPActive--;
      this.oppHPs[this.oppHPActive].visible = false;
    }
  },

  updateUI: function () {
    this.showRegularRemainingTime();

    if (this.playerHPActive === 1) {
      if (this.playerHPs[0].frameName === "kid-live") {
        this.playerHPs[0].frameName = "kid-emptylive";
      } else {
        this.playerHPs[0].frameName = "kid-live";
      }
    }

    if (this.oppHPActive === 1) {
      this.oppHPs[0].visible = !this.oppHPs[0].visible;
    }

    if (this.pressButtonToContinueTimer > -1) {
      this.pressButtonToContinueTimer--;
      if (this.pressButtonToContinueTimer < 70) {
        if (this.pressButtonToContinueTimer % 7 === 0) {
          this.text.visible = !this.text.visible;
          if (this.text.visible) {
            this.game.sound.play("Beep");
          }
        }
      }
    }

    if (this.hideTextTimer > -1) {
      this.hideTextTimer--;
      if (this.hideTextTimer === 0) {
        this.hideText();
      }
    }
  },

  showLevel: function () {
    if (PrinceJS.endTime || PrinceJS.skipShowLevel) {
      return;
    }
    this.showText("LEVEL " + PrinceJS.currentLevel, "level");
    this.hideTextTimer = 25;
    PrinceJS.Utils.delayed(() => {
      if (!this.showTextType || this.showTextType === "level") {
        this.hideText();
        this.showRegularRemainingTime(true);
      }
    }, 2000);
  },

  showRegularRemainingTime: function (force) {
    if (PrinceJS.endTime) {
      return;
    }
    if (PrinceJS.Utils.getRemainingMinutes() === 0) {
      this.showRemainingSeconds();
      this.delegate.timeUp();
      PrinceJS.startTime = null;
    } else if (PrinceJS.Utils.getRemainingMinutes() === 1) {
      this.showRemainingSeconds();
    } else if (
      force ||
      (PrinceJS.Utils.getRemainingMinutes() < 60 &&
        PrinceJS.Utils.getRemainingMinutes() % 5 === 0 &&
        PrinceJS.Utils.getDeltaTime().seconds === 0)
    ) {
      this.showRemainingMinutes(force);
    }
  },

  showRemainingMinutes: function (force) {
    if (this.showTextType && !force) {
      return;
    }
    let minutes = PrinceJS.Utils.getRemainingMinutes();
    this.showText(minutes + (minutes === 1 ? " MINUTE " : " MINUTES ") + "LEFT", "minutes");
    this.hideTextTimer = 30;
  },

  isRemainingMinutesShown: function () {
    return this.showTextType === "minutes";
  },

  isLevelShown: function () {
    return this.showTextType === "level";
  },

  showRemainingSeconds: function () {
    if (["level", "continue", "paused"].includes(this.showTextType)) {
      return;
    }
    let seconds = 0;
    if (PrinceJS.Utils.getRemainingMinutes() > 0) {
      seconds = PrinceJS.Utils.getRemainingSeconds();
    }
    this.showText(seconds + (seconds === 1 ? " SECOND " : " SECONDS ") + "LEFT", "seconds");
  },

  showPressButtonToContinue: function () {
    PrinceJS.Utils.delayed(() => {
      this.showText("Press Button to Continue", "continue");
      this.pressButtonToContinueTimer = 200;
    }, 4000);
  },

  showGamePaused: function () {
    this.showText("GAME PAUSED", "paused");
  },

  showText: function (text, type) {
    this.text.setText(text);
    this.showTextType = type;
    this.hideTextTimer = -1;
  },

  hideText: function () {
    this.text.setText("");
    this.showTextType = null;
    this.hideTextTimer = -1;
  },

  flipped: function () {
    this.text.scale.y *= -1;
    this.text.y = (PrinceJS.UI_HEIGHT - 2) * 0.5;
    if (this.text.scale.y === -1) {
      this.text.y += 2;
    }
  },

  flash: function (flashColor) {
    Object.keys(this.flashMap).forEach((color) => {
      this.flashMap[color].visible = color === String(flashColor);
    });
  }
};
