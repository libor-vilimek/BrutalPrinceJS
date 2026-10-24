"use strict";

// This realm never starts Boot, Game, GameSettings, campaign maps or Statistics.
// Boot.js supplies the shared constants only; all demo objects live in this state.
PrinceJS.Init();

const demos = new Set([
  "casings",
  "deep-casings",
  "tutorial-torches",
  "tutorial-inventory",
  "tutorial-ledge",
  "finale",
  "epilogue"
]);
const requestedDemo = new URLSearchParams(window.location.search).get("demo");
const preview = {
  id: demos.has(requestedDemo) ? requestedDemo : "casings",
  ready: false,
  paused: false,
  autoWalk: true,
  elapsed: 0,
  keys: new Set(),

  report: function (message) {
    if (message !== undefined) {
      this.message = message;
    }
    window.parent.postMessage(
      {
        type: "prince-preview-status",
        id: this.id,
        ready: this.ready,
        elapsed: this.elapsed,
        duration: this.id === "finale" ? PrinceJS.Finale.TIMES.end : null,
        paused: this.paused,
        message: this.message
      },
      window.location.origin
    );
  },

  preload: function () {
    this.game.sound.mute = true;
    this.game.sound.volume = 0;
    this.load.onFileError.add((key) => this.report("Could not load " + key + ". Reload this preview."));
    for (const key of ["kid", "palace", "general", "princess", "jaffar", "cutscene", "title"]) {
      this.load.atlasJSONHash(key, `/assets/gfx/${key}.png`, `/assets/gfx/${key}.json`);
    }
    this.load.json("kid-anims", "/assets/anims/kid.json");
    this.load.bitmapFont("font", "/assets/font/prince_0.png", "/assets/font/prince.fnt");
  },

  create: function () {
    this.game.time.desiredFps = 60;
    this.game.forceSingleUpdate = false;
    this.game.stage.disableVisibilityChange = true;
    this.game.renderer.renderSession.roundPixels = true;
    this.game.canvas.tabIndex = 0;
    this.scale.scaleMode = Phaser.ScaleManager.SHOW_ALL;
    this.scale.pageAlignHorizontally = this.scale.pageAlignVertically = true;
    this.scale.parentIsWindow = false;
    this.scale.refresh();
    this.ready = true;
    this.select(this.id);
  },

  clear: function () {
    if (this.overlay) {
      this.overlay.destroy();
    }
    if (this.finale) {
      this.finale.destroy();
    }
    if (this.epilogue) {
      this.epilogue.destroyBrutalEpilogue();
    }
    if (this.casings) {
      this.casings.destroy();
    }
    if (this.level) {
      this.level.dummyWall.destroy();
    }
    this.overlay = this.finale = this.epilogue = this.casings = this.scene = this.lesson = null;
    this.level = this.kid = null;
    this.keys.clear();
    this.world.removeAll(true);
    this.world.scale.setTo(2);
    this.world.setBounds(0, 0, 640, 400);
    this.game.camera.setPosition(0, 0);
    this.elapsed = this.actorClock = this.sceneClock = this.reportClock = 0;
    this.paused = false;
  },

  select: function (id) {
    if (!demos.has(id)) {
      return;
    }
    this.id = id;
    if (!this.ready) {
      return;
    }
    this.clear();
    if (id === "finale") {
      this.scene = new PrinceJS.Scene(this.game);
      this.finale = new PrinceJS.Finale(this.game, this.scene);
      this.report("Full ending · dragging Jaffar, blood trail, window, dance and a falling ceiling arch fragment.");
    } else if (id === "epilogue") {
      this.epilogue = Object.assign(Object.create(PrinceJS.EndTitle.prototype), { game: this.game });
      this.epilogue.createBrutalEpilogue();
      this.report("The final story page · BRUTAL Prince of Persia, with animated blood.");
    } else {
      this.buildCasingStage(id === "deep-casings");
      if (id.startsWith("tutorial-")) {
        this.showLesson(id);
      } else {
        this.report("Walking from low to high piles · uncheck Auto-walk to use Left / Right inside the preview.");
      }
    }
    this.world.sort("z");
  },

  buildCasingStage: function (deep) {
    this.level = new PrinceJS.Level(this.game, 0, "Casing preview", PrinceJS.Level.TYPE_PALACE);
    this.level.rooms[1] = { x: 0, y: 0, links: {}, tiles: [] };
    const ceiling = this.game.make.sprite(0, 0, "cutscene", "room");
    ceiling.crop(new Phaser.Rectangle(0, 0, 320, 90));
    this.level.back.add(ceiling);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 10; column++) {
        this.level.addTile(
          column,
          row,
          1,
          new PrinceJS.Tile.Base(this.game, row === 2 ? 1 : 0, 0, PrinceJS.Level.TYPE_PALACE)
        );
      }
    }
    this.kid = new PrinceJS.Actor(this.game, 14, 179, 1, "kid");
    Object.assign(this.kid, {
      baseY: 3,
      room: 1,
      level: this.level,
      alive: true,
      active: true,
      minigunEquipped: false
    });
    this.kid.action = "step14";
    this.kid.updateActor();
    this.casings = new PrinceJS.MinigunEffects(this.game, this.kid, { room: 1, collected: true });
    const heights = deep ? [12, 22, 34, 42] : [4, 10, 20, 32];
    if (!this.id.startsWith("tutorial-")) {
      heights.forEach((height, index) => {
        const x = 80 + index * 61;
        this.seedPile(x, height, index);
        const label = this.game.add.bitmapText(x, 112, "font", ["LOW", "MEDIUM", "HIGH", "DEEP"][index], 8);
        label.anchor.setTo(0.5, 0);
        label.z = 18;
      });
    }
    this.casings.activeCasings.length = 0;
    this.casings.updateCasings(0);
  },

  seedPile: function (center, height, pile) {
    const random = new Phaser.RandomDataGenerator(["casing-preview-" + pile]);
    for (let depth = 0; depth < 10; depth++) {
      let peak = 0;
      // Scatter actual spent shells around the center. Use the renderer's real
      // same-lane support, dimensions and shading instead of solid mound art.
      for (let count = 0; peak < height && count < height * 20; count++) {
        const x = center + (random.frac() + random.frac() + random.frac() - 1.5) * 17;
        const casing = this.casings.emitCasing(x, 160, 0, 0, 0xffdb70, 182, depth);
        this.casings.settleCasing(casing, {
          room: 1,
          row: 2,
          column: Math.floor(casing.x / 32),
          floorY: 182,
          y: 182 - this.casings.casingPileHeight(182, casing.x, casing.width, depth)
        });
        peak = Math.max(peak, 182 - casing.y);
      }
    }
  },

  showLesson: function (id) {
    const lessonId = {
      "tutorial-torches": "twin-torches",
      "tutorial-inventory": "minigun-select",
      "tutorial-ledge": "ledge-hang"
    }[id];
    const requestedLesson = new URLSearchParams(window.location.search).get("lesson");
    this.lesson = PrinceJS.TutorialLessons.find((lesson) => lesson.id === (requestedLesson || lessonId));
    this.lesson ||= PrinceJS.TutorialLessons.find((lesson) => lesson.id === lessonId);
    this.overlay = new PrinceJS.TutorialOverlay(() => this.confirmLesson(), this.game);
    this.overlay.show(this.lesson);
    this.report("Original tutorial text, bitmap lettering and mosaic · press the shown key or click its button.");
  },

  confirmLesson: function () {
    this.overlay.hide();
    this.lesson = null;
    this.report("Tutorial confirmed. Replay reopens it; choose another preview from the categories.");
  },

  seek: function (time) {
    if (this.id !== "finale" || !Number.isFinite(time)) {
      return;
    }
    this.select("finale");
    const target = Math.max(0, Math.min(PrinceJS.Finale.TIMES.end, time));
    while (this.finale.elapsed < target - 0.000001) {
      this.finale.update(Math.min(1 / 60, target - this.finale.elapsed));
    }
    this.elapsed = this.finale.elapsed;
    this.paused = true;
    this.report("Paused ending · Resume plays from this moment.");
  },

  update: function () {
    if (!this.ready || this.paused || this.lesson) {
      return;
    }
    const dt = this.game.time.physicsElapsed;
    this.elapsed += dt;
    if (this.finale) {
      this.finale.update(dt);
      this.elapsed = this.finale.elapsed;
      this.sceneClock += dt;
      if (this.sceneClock >= 0.12) {
        this.scene.update();
        this.sceneClock -= 0.12;
      }
      if (this.finale.complete) {
        this.paused = true;
        this.report("Ending complete · Replay to watch again.");
      }
    } else if (this.epilogue) {
      this.epilogue.updateBrutalEpilogue(dt);
    } else if (this.kid) {
      const left = this.keys.has(Phaser.Keyboard.LEFT),
        right = this.keys.has(Phaser.Keyboard.RIGHT);
      const walking = this.autoWalk || left || right;
      if (left !== right) {
        const direction = left ? -1 : 1;
        if (this.kid.charFace !== direction) {
          this.kid.changeFace();
        }
      }
      this.actorClock += dt;
      if (this.actorClock >= 0.08) {
        this.actorClock -= 0.08;
        if (this.kid.action === "stand" && walking) {
          this.kid.action = "step14";
        }
        if (!walking) {
          this.kid.action = "stand";
        }
        this.kid.updateActor();
        if ((this.kid.charX > 128 && this.kid.charFace > 0) || (this.kid.charX < 12 && this.kid.charFace < 0)) {
          this.kid.changeFace();
        }
      }
      this.casings.updateCasings(dt);
    }
    this.reportClock += dt;
    if (this.reportClock >= 0.1) {
      this.reportClock = 0;
      this.report();
    }
  }
};

window.addEventListener("message", (event) => {
  if (
    event.source !== window.parent ||
    event.origin !== window.location.origin ||
    event.data?.type !== "prince-preview-control"
  ) {
    return;
  }
  const { action, value } = event.data;
  if (action === "select") {
    preview.select(value);
  } else if (action === "pause") {
    preview.paused = !!value;
    preview.report();
  } else if (action === "auto-walk") {
    preview.autoWalk = !!value;
  } else if (action === "seek") {
    preview.seek(value);
  }
});
window.addEventListener("keydown", (event) => {
  preview.keys.add(event.keyCode);
  if (preview.lesson) {
    event.preventDefault();
    if (event.keyCode === Phaser.Keyboard.TAB) {
      preview.overlay.focusKey(event.shiftKey ? -1 : 1);
    } else if (
      preview.lesson.keys.some((key) => [...(key.modifiers || []), key.code].every((code) => preview.keys.has(code)))
    ) {
      preview.confirmLesson();
    }
  } else if ([Phaser.Keyboard.LEFT, Phaser.Keyboard.RIGHT].includes(event.keyCode)) {
    event.preventDefault();
  }
});
window.addEventListener("keyup", (event) => preview.keys.delete(event.keyCode));
window.addEventListener("blur", () => preview.keys.clear());
window.addEventListener("pagehide", () => preview.ready && preview.clear());
window.PrincePreview = preview;
const previewGame = new Phaser.Game(640, 400, Phaser.CANVAS, "canvas", preview, false, false);
