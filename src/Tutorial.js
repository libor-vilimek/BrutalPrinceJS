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
  this.heldKeys = new Set();
  this.destroyed = false;
  this.overlay = new PrinceJS.TutorialOverlay((code) => this.accept(code, false));
  this.sequence = PrinceJS.TutorialSequence ? new PrinceJS.TutorialSequence(delegate, this) : null;
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
        const key = this.active.keys.find((item) => {
          const codes = [...(item.modifiers || []), item.code];
          return codes.includes(event.keyCode) && codes.every((code) => this.downKeys.has(code));
        });
        if (key) {
          this.accept(key.code, true);
        }
      }
    } else if (this.assist && this.assist.entries.some((entry) => entry.code === event.keyCode)) {
      // Phaser still sees the original press; a re-press during assistance must
      // not duplicate edge-triggered actions, but must keep its real hold.
      this.assist.entries.find((entry) => entry.code === event.keyCode).physicalDown = true;
      this.consume(event);
    } else if (this.sequence && this.sequence.guiding && event.keyCode === Phaser.Keyboard.C) {
      // The emergency kick remains available during live guided movement.
      this.sequence.cancel();
    } else if (this.heldKeys.has(event.keyCode) || this.isGuidedKey(event.keyCode)) {
      this.consume(event);
    }
  },

  onKeyUp: function (event) {
    this.downKeys.delete(event.keyCode);
    if (this.active) {
      this.consume(event);
    } else if (this.assist && this.assist.entries.some((entry) => entry.code === event.keyCode)) {
      this.assist.entries.find((entry) => entry.code === event.keyCode).physicalDown = false;
      this.consume(event);
    } else if (this.heldKeys.has(event.keyCode) || this.isGuidedKey(event.keyCode)) {
      this.consume(event);
    }
  },

  isGuidedKey: function (code) {
    // Reserve movement and equipment input, while leaving pause/restart and
    // other global shortcuts available throughout the short live sequence.
    return !!(
      this.sequence &&
      this.sequence.guiding &&
      [16, 17, 37, 38, 39, 40, 49, 50, 51, 52, 70, 74, 88].includes(code)
    );
  },

  accept: function (code, physicalDown) {
    const lesson = this.active;
    if (!lesson || !lesson.keys.some((key) => key.code === code)) {
      return false;
    }
    this.completed.add(lesson.id);
    this.resume();
    if (lesson.onAccept) {
      lesson.onAccept(this.delegate, this);
    }
    const key = this.game.input.keyboard.addKey(code);
    const spec = lesson.keys.find((item) => item.code === code);
    const entries = [...(spec.modifiers || []), code].map((entryCode) => ({
      code: entryCode,
      key: this.game.input.keyboard.addKey(entryCode),
      physicalDown: physicalDown && this.downKeys.has(entryCode)
    }));
    this.assist = {
      code,
      key,
      entries,
      lesson,
      elapsed: 0,
      remaining: Math.max(0, lesson.holdMs || 0) / 1000,
      worldUpdated: false
    };
    // Use the real Phaser key signals as well as isDown. No parallel weapon,
    // movement or animation implementation is needed for a new lesson.
    for (const entry of entries) {
      this.pressKey(entry.code);
    }
    return true;
  },

  pressKey: function (code) {
    this.game.input.keyboard.addKey(code).processKeyDown({
      keyCode: code,
      ctrlKey: code === 17,
      shiftKey: code === 16 || this.heldKeys.has(16),
      altKey: false
    });
  },

  holdKey: function (code) {
    this.heldKeys.add(code);
    this.pressKey(code);
  },

  releaseHeldKey: function (code) {
    if (!this.heldKeys.has(code)) {
      return;
    }
    this.heldKeys.delete(code);
    if (!this.downKeys.has(code)) {
      this.game.input.keyboard.addKey(code).processKeyUp({ keyCode: code });
    }
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
    for (const code of this.heldKeys) {
      this.pressKey(code);
    }
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
      const step = Math.max(0, Math.min(Number(delta) || 0, 0.05));
      this.assist.remaining -= step;
      this.assist.elapsed += step;
      const lesson = this.assist.lesson;
      const reached = !lesson.holdUntil || lesson.holdUntil(this.delegate);
      const expired = lesson.maxHoldMs && this.assist.elapsed * 1000 >= lesson.maxHoldMs;
      if (this.assist.worldUpdated && ((this.assist.remaining <= 0 && reached) || expired)) {
        const assist = this.assist;
        this.assist = null;
        if (reached && lesson.onComplete) {
          lesson.onComplete(this.delegate, this);
        }
        for (const entry of assist.entries) {
          if (!entry.physicalDown && !this.heldKeys.has(entry.code)) {
            entry.key.processKeyUp({ keyCode: entry.code, ctrlKey: false, shiftKey: false, altKey: false });
          }
        }
      }
      return;
    }
    if (this.sequence) {
      this.sequence.update();
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

  beforeWorld: function () {
    if (this.sequence && !this.active && !this.game.paused) {
      this.sequence.beforeWorld();
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
      this.assist.entries.forEach((entry) => entry.key.reset(false));
      this.assist = null;
    }
    for (const code of this.heldKeys) {
      this.game.input.keyboard.addKey(code).reset(false);
    }
    this.heldKeys.clear();
    if (this.sequence) {
      this.sequence.cancel();
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
