"use strict";

PrinceJS.Cutscene = function (game) {
  this.scene;
};

PrinceJS.Cutscene.STATE_SETUP = 0;
PrinceJS.Cutscene.STATE_READY = 1;
PrinceJS.Cutscene.STATE_WAITING = 2;
PrinceJS.Cutscene.STATE_RUNNING = 3;

PrinceJS.Cutscene.prototype = {
  preload: function () {
    this.game.load.image("cover", "assets/gfx/cover.png");
    switch (PrinceJS.currentLevel) {
      case 1:
        this.game.load.audio("Princess", "assets/music/03_Princess.mp3");
        this.game.load.audio("Jaffar", "assets/music/04_Jaffar.mp3");
        this.game.load.audio("Heartbeat", "assets/music/05_Heartbeat.mp3");
        break;
      case 2:
      case 4:
      case 6:
      case 12:
        this.game.load.audio("Heartbeat2", "assets/music/12_Heartbeat_2.mp3");
        break;
      case 8:
      case 9:
        this.game.load.audio("Timer", "assets/music/17_Timer.mp3");
        break;
      case 15:
        this.game.load.audio("Embrace", "assets/music/21_Embrace.mp3");
        break;
      case 16:
        this.game.load.audio("TragicEnd", "assets/music/18_Tragic_End.mp3");
        break;
    }
    this.load.json("cutscene", "assets/cutscenes/scene" + PrinceJS.currentLevel + ".json");
  },

  create: function () {
    this.reset();

    let cutscene = this.game.cache.getJSON("cutscene");
    if (!cutscene) {
      this.next();
      return;
    }
    this.program = cutscene.program;

    this.scene = new PrinceJS.Scene(this.game);

    this.cover = this.game.add.sprite(0, 0, "cover");
    this.scene.front.addChild(this.cover);

    this.executeProgram();

    this.input.keyboard.onDownCallback = null;
    this.inputTimer = this.game.time.events.add(1000, () => {
      this.input.keyboard.onDownCallback = this.continue.bind(this);
    });

    this.sceneTimer = this.game.time.events.loop(120, this.updateScene, this);
  },

  executeProgram: function () {
    if (this.sceneState === PrinceJS.Cutscene.STATE_WAITING) {
      if (this.waitingForFinale) {
        if (this.finale.complete) {
          this.waitingForFinale = false;
          this.sceneState = PrinceJS.Cutscene.STATE_READY;
        }
        return;
      }
      this.waitingTime--;
      if (this.waitingTime === 0) {
        this.sceneState = PrinceJS.Cutscene.STATE_READY;
      }
      return;
    }

    while (this.sceneState === PrinceJS.Cutscene.STATE_SETUP || this.sceneState === PrinceJS.Cutscene.STATE_RUNNING) {
      let opcode = this.program[this.pc];
      let actor;
      switch (opcode.i) {
        case "FINALE":
          this.finale = new PrinceJS.Finale(this.game, this.scene);
          break;

        case "WAIT_FINALE":
          this.waitingForFinale = true;
          this.sceneState = PrinceJS.Cutscene.STATE_WAITING;
          break;

        case "START":
          this.world.sort("z");
          this.sceneState = PrinceJS.Cutscene.STATE_READY;
          if (opcode.p1 === 0) {
            this.fadeOut(1);
          } else {
            this.fadeIn();
          }
          break;

        case "END":
          this.endCutscene(opcode.p1 !== 0);
          this.sceneState = PrinceJS.Cutscene.STATE_WAITING;
          this.waitingTime = 1000;
          break;

        case "ACTION":
          actor = this.actors[opcode.p1];
          actor.action = opcode.p2;
          break;

        case "ADD_ACTOR":
          actor = new PrinceJS.Actor(this.game, opcode.p3, opcode.p4, opcode.p5, opcode.p2);
          this.actors[opcode.p1] = actor;
          break;

        case "REM_ACTOR":
          this.actors[opcode.p1].kill();
          break;

        case "ADD_OBJECT":
          this.objects[opcode.p1] = new PrinceJS.Tile.Clock(this.game, opcode.p3, opcode.p4, opcode.p2);
          this.scene.addObject(this.objects[opcode.p1]);
          break;

        case "START_OBJECT":
          this.objects[opcode.p1].activate();
          break;

        case "EFFECT":
          this.scene.effect();
          break;

        case "WAIT":
          this.sceneState = PrinceJS.Cutscene.STATE_WAITING;
          this.waitingTime = opcode.p1;
          break;

        case "MUSIC":
          this.stopMusic();
          this.game.sound.play(opcode.p2);
          break;

        case "SOUND":
          this.game.sound.play(opcode.p2);
          break;

        case "FADEIN":
          this.fadeIn(opcode.p1 * 120);
          break;

        case "FADEOUT":
          this.fadeOut(opcode.p1 * 120);
          break;
      }
      this.pc++;
    }
  },

  update: function () {
    if (this.finale) {
      this.finale.update(this.game.time.elapsedMS / 1000);
    }
    if (PrinceJS.Utils.continueGame(this.game)) {
      this.continue();
    }
  },

  updateScene: function () {
    if (this.sceneState === PrinceJS.Cutscene.STATE_RUNNING) {
      return;
    } else if (this.sceneState === PrinceJS.Cutscene.STATE_READY) {
      this.sceneState = PrinceJS.Cutscene.STATE_RUNNING;
    }
    this.executeProgram();
    this.scene.update();

    for (let i = 0; i < this.actors.length; i++) {
      this.actors[i].updateActor();
    }
  },

  endCutscene: function (fadeOut = true) {
    if (this.ending || this.leaving) {
      return;
    }
    this.ending = true;
    if (fadeOut) {
      this.fadeOut(2000, () => {
        this.next();
      });
    } else {
      this.next();
    }
  },

  continue: function () {
    if (PrinceJS.currentLevel < 15) {
      this.play();
    } else {
      this.next();
    }
  },

  play: function () {
    if (this.leaving) {
      return;
    }
    this.leaving = true;
    this.stopMusic();
    this.input.keyboard.onDownCallback = null;
    this.state.start("Game");
  },

  next: function () {
    if (this.leaving) {
      return;
    }
    if ([1, 15, 16].includes(PrinceJS.currentLevel)) {
      this.leaving = true;
    }
    this.input.keyboard.onDownCallback = null;
    if (PrinceJS.currentLevel === 1) {
      this.state.start("Credits");
    } else if (PrinceJS.currentLevel === 15) {
      PrinceJS.Restart();
      this.state.start("EndTitle");
    } else if (PrinceJS.currentLevel === 16) {
      PrinceJS.Restart();
      this.state.start("Title");
    } else {
      this.play();
    }
  },

  reset: function () {
    this.finale = null;
    this.waitingForFinale = false;
    this.ending = false;
    this.leaving = false;
    this.fadeTweens = [];
    this.actors = [];
    this.objects = [];

    this.pc = 0;
    this.waitingTime = 0;
    this.sceneState = PrinceJS.Cutscene.STATE_SETUP;
  },

  stopMusic: function () {
    this.game.sound.stopAll();
  },

  fadeIn: function (duration = 2000, callback) {
    this.fadeTo(0, duration, callback);
  },

  fadeOut: function (duration = 2000, callback) {
    this.fadeTo(1, duration, callback);
  },

  fadeTo: function (alpha, duration, callback) {
    const tween = this.game.add.tween(this.cover).to({ alpha }, 2000, Phaser.Easing.Linear.None, true);
    this.fadeTweens.push(tween);
    if (callback) {
      tween.onComplete.addOnce(() => {
        if (!this.leaving) {
          callback();
        }
      });
    }
  },

  shutdown: function () {
    this.leaving = true;
    this.input.keyboard.onDownCallback = null;
    this.game.time.events.remove(this.inputTimer);
    this.game.time.events.remove(this.sceneTimer);
    this.fadeTweens.forEach((tween) => this.game.tweens.remove(tween));
    if (this.finale) {
      this.finale.destroy();
      this.finale = null;
    }
  }
};
