"use strict";

// Lessons describe their own trigger and key. The controller only pauses,
// forwards the requested input, and extends a short press in simulation time.
PrinceJS.Tutorial = function (delegate) {
  this.delegate = delegate;
  this.game = delegate.game;
  this.lessons = PrinceJS.TutorialLessons;
  this.completed = PrinceJS.completedTutorials;
  this.active = null;
  this.assist = null;
  this.downKeys = new Set();
  this.destroyed = false;
  this.overlay = new PrinceJS.TutorialOverlay((code) => this.accept(code, false));
  this.keyDown = this.onKeyDown.bind(this);
  this.keyUp = this.onKeyUp.bind(this);
  this.blur = this.onBlur.bind(this);
  window.addEventListener("keydown", this.keyDown, true);
  window.addEventListener("keyup", this.keyUp, true);
  window.addEventListener("blur", this.blur);
};

PrinceJS.Tutorial.prototype = {
  show: function (lesson) {
    const kid = this.delegate.kid;
    if (
      this.destroyed ||
      this.active ||
      this.assist ||
      this.game.paused ||
      this.completed.has(lesson.id) ||
      !kid.alive ||
      !kid.active ||
      !kid.visible ||
      this.delegate.pressButtonToNext ||
      PrinceJS.endTime
    ) {
      return false;
    }
    this.active = lesson;
    this.pauseTime = new Date();
    this.startTime = PrinceJS.startTime;
    PrinceJS.tutorialPauseTime = this.pauseTime;
    this.gamepadDown = this.isGamepadDown();
    this.game.input.reset(false);
    this.keyboardEnabled = this.game.input.keyboard.enabled;
    this.game.input.keyboard.enabled = false;
    this.game.paused = true;
    this.overlay.show(lesson);
    return true;
  },

  consume: function (event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  },

  onKeyDown: function (event) {
    const wasDown = this.downKeys.has(event.keyCode);
    this.downKeys.add(event.keyCode);
    if (this.active) {
      this.consume(event);
      if (event.keyCode === Phaser.Keyboard.TAB) {
        this.overlay.focusKey(event.shiftKey ? -1 : 1);
      } else if (!wasDown && !event.repeat && !event.altKey && !event.metaKey) {
        this.accept(event.keyCode, true);
      }
    } else if (this.assist && this.assist.code === event.keyCode) {
      // Phaser still sees the original press; a re-press during assistance must
      // not duplicate edge-triggered actions, but must keep its real hold.
      this.assist.physicalDown = true;
      this.consume(event);
    }
  },

  onKeyUp: function (event) {
    this.downKeys.delete(event.keyCode);
    if (this.active) {
      this.consume(event);
    } else if (this.assist && this.assist.code === event.keyCode) {
      this.assist.physicalDown = false;
      this.consume(event);
    }
  },

  accept: function (code, physicalDown) {
    const lesson = this.active;
    if (!lesson || !lesson.keys.some((key) => key.code === code)) {
      return false;
    }
    this.completed.add(lesson.id);
    this.resume();
    const key = this.game.input.keyboard.addKey(code);
    this.assist = { code, key, physicalDown, remaining: Math.max(0, lesson.holdMs || 0) / 1000, worldUpdated: false };
    // Use the real Phaser key signals as well as isDown. No parallel weapon,
    // movement or animation implementation is needed for a new lesson.
    key.processKeyDown({ keyCode: code, ctrlKey: code === 17, shiftKey: code === 16, altKey: false });
    return true;
  },

  resume: function () {
    if (!this.active) {
      return;
    }
    if (PrinceJS.startTime && PrinceJS.startTime === this.startTime) {
      PrinceJS.startTime = new Date(PrinceJS.startTime.getTime() + Date.now() - this.pauseTime.getTime());
    }
    if (PrinceJS.tutorialPauseTime === this.pauseTime) {
      PrinceJS.tutorialPauseTime = null;
    }
    this.overlay.hide();
    this.game.input.keyboard.enabled = this.keyboardEnabled;
    // Keep active set while Phaser dispatches onResume, so the ordinary pause
    // handler cannot round the countdown to a saved whole minute.
    this.game.paused = false;
    this.active = null;
  },

  update: function (delta) {
    if (this.destroyed || this.active || this.game.paused) {
      return;
    }
    if (!this.delegate.kid.alive || !this.delegate.kid.active || !this.delegate.kid.visible) {
      this.cancelAssist();
      return;
    }
    if (this.assist) {
      // Match equipment controllers' simulation step cap, even on a slow tab.
      // Weapons poll per frame, while the native actor polls every 80 ms. A tap
      // must reach both clocks before its release, even with holdMs set to zero.
      this.assist.remaining -= Math.max(0, Math.min(Number(delta) || 0, 0.05));
      if (this.assist.remaining <= 0 && this.assist.worldUpdated) {
        const assist = this.assist;
        this.assist = null;
        if (!assist.physicalDown) {
          assist.key.processKeyUp({ keyCode: assist.code, ctrlKey: false, shiftKey: false, altKey: false });
        }
      }
      return;
    }
    const lesson = this.lessons.find((item) => !this.completed.has(item.id) && item.when(this.delegate));
    if (lesson) {
      this.show(lesson);
    }
  },

  isGamepadDown: function () {
    const buttons = this.active && this.active.gamepadButtons;
    return !!(buttons && PrinceJS.Utils.gamepadButtonDownCheck(this.game, buttons));
  },

  worldUpdated: function () {
    if (this.assist) {
      this.assist.worldUpdated = true;
    }
  },

  pauseUpdate: function () {
    if (!this.active || !this.active.gamepadButtons) {
      return;
    }
    // Phaser normally stops polling pads while paused. Poll only input here.
    this.game.input.gamepad.update();
    const down = this.isGamepadDown();
    if (down && !this.gamepadDown) {
      this.accept(this.active.keys[0].code, false);
    }
    this.gamepadDown = down;
  },

  cancelAssist: function () {
    if (this.assist) {
      // Cleanup must not fire release actions (e.g. a molotov) after death or
      // into a different level. The live controller handles stowing on resume.
      this.assist.key.reset(false);
      this.assist = null;
    }
  },

  onBlur: function () {
    this.downKeys.clear();
    this.cancelAssist();
  },

  destroy: function () {
    if (this.destroyed) {
      return;
    }
    this.cancelAssist();
    this.resume();
    this.destroyed = true;
    window.removeEventListener("keydown", this.keyDown, true);
    window.removeEventListener("keyup", this.keyUp, true);
    window.removeEventListener("blur", this.blur);
    this.overlay.destroy();
    this.downKeys.clear();
  }
};
