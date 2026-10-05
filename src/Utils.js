"use strict";

PrinceJS.Utils = {
  convertX: function (x) {
    return Math.floor((x * 320) / 140);
  },

  convertXtoBlockX: function (x) {
    return Math.floor((x - 7) / 14);
  },

  convertYtoBlockY: function (y) {
    return Math.floor(y / PrinceJS.BLOCK_HEIGHT);
  },

  convertBlockXtoX: function (block) {
    return block * 14 + 7;
  },

  convertBlockYtoY: function (block) {
    return (block + 1) * PrinceJS.BLOCK_HEIGHT - 10;
  },

  delayed: function (fn, millis) {
    return new Promise((resolve) => {
      setTimeout(() => {
        Promise.resolve()
          .then(() => {
            return fn && fn();
          })
          .then((result) => {
            resolve(result);
          });
      }, millis);
    });
  },

  delayedCancelable: function (fn, millis) {
    let timeout;
    return {
      cancel: () => {
        clearTimeout(timeout);
      },
      promise: new Promise((resolve) => {
        timeout = setTimeout(() => {
          Promise.resolve()
            .then(() => {
              return fn && fn();
            })
            .then((result) => {
              resolve(result);
            });
        }, millis);
      })
    };
  },

  perform: function (fn, millis) {
    return new Promise((resolve) => {
      let result = fn && fn();
      setTimeout(() => {
        resolve(result);
      }, millis);
    });
  },

  flashScreen: function (game, count, color, time) {
    for (let i = 0; i < count * 2; i++) {
      PrinceJS.Utils.delayed(() => {
        game.stage.backgroundColor = i % 2 === 0 ? color : 0x000000;
        PrinceJS.InterfaceCurrent.flash(game.stage.backgroundColor);
      }, time * i);
    }
  },

  flashPattern: function (game, color, pattern) {
    return pattern.reduce((promise, time) => {
      return promise.then(() => {
        PrinceJS.Utils.flashScreen(game, 1, color, time);
        return PrinceJS.Utils.delayed(undefined, 4 * time);
      });
    }, Promise.resolve());
  },

  flashRedDamage: function (game) {
    PrinceJS.Utils.flashPattern(game, PrinceJS.Level.FLASH_RED, [25]);
  },

  flashRedPotion: function (game) {
    PrinceJS.Utils.flashPattern(game, PrinceJS.Level.FLASH_RED, [50, 25, 25]);
  },

  flashGreenPotion: function (game) {
    PrinceJS.Utils.flashPattern(game, PrinceJS.Level.FLASH_GREEN, [50, 25, 25]);
  },

  flashYellowSword: function (game) {
    PrinceJS.Utils.flashPattern(game, PrinceJS.Level.FLASH_YELLOW, [50, 25, 25, 50, 25, 25, 25]);
  },

  flashWhiteShadowMerge: function (game) {
    PrinceJS.Utils.flashPattern(
      game,
      PrinceJS.Level.FLASH_WHITE,
      [50, 25, 25, 50, 25, 25, 25, 50, 25, 25, 50, 25, 25, 25]
    );
  },

  flashWhiteVizierVictory: function (game) {
    PrinceJS.Utils.flashPattern(game, PrinceJS.Level.FLASH_WHITE, [25, 25, 100, 100, 50, 50, 25, 25, 50]);
  },

  random: function (max) {
    return Math.floor(Math.random() * Math.floor(max));
  },

  continueGame: function (game) {
    return PrinceJS.Utils.pointerPressed(game) || PrinceJS.Utils.gamepadAnyPressed(game);
  },

  gamepadButtonPressedCheck: function (game, buttons, name = "default") {
    if (this[`_${name}Pressed`]) {
      return false;
    }
    let pressed = false;
    let pad = game.input.gamepad.pad1;
    if (pad && pad.connected) {
      if (!buttons) {
        buttons = Object.keys(pad._rawPad.buttons).map((button) => parseInt(button));
      }
      for (let button of buttons) {
        if (pad.justPressed(button)) {
          pressed = true;
        }
      }
    }
    if (pressed) {
      this[`_${name}Pressed`] = true;
      PrinceJS.Utils.delayed(() => {
        this[`_${name}Pressed`] = false;
      }, 500);
    }
    return pressed;
  },

  gamepadButtonDownCheck: function (game, buttons) {
    let pad = game.input.gamepad.pad1;
    if (pad && pad.connected) {
      if (!buttons) {
        buttons = Object.keys(pad._rawPad.buttons).map((button) => parseInt(button));
      }
      for (let button of buttons) {
        if (pad.isDown(button)) {
          return true;
        }
      }
    }
    return false;
  },

  gamepadAxisCheck: function (game, axes, comparison) {
    let pad = game.input.gamepad.pad1;
    if (pad && pad.connected) {
      for (let axis of axes) {
        if (comparison === "<" && pad.axis(axis) < -0.75) {
          return true;
        } else if (comparison === ">" && pad.axis(axis) > 0.75) {
          return true;
        }
      }
    }
    return false;
  },

  gamepadAnyPressed: function (game) {
    return PrinceJS.Utils.gamepadButtonPressedCheck(game);
  },

  gamepadUpPressed: function (game) {
    return (
      PrinceJS.Utils.gamepadButtonDownCheck(game, [
        PrinceJS.Gamepad.A,
        PrinceJS.Gamepad.R,
        PrinceJS.Gamepad.ZR,
        PrinceJS.Gamepad.DPadU
      ]) || PrinceJS.Utils.gamepadAxisCheck(game, [PrinceJS.Gamepad.Axis.LY, PrinceJS.Gamepad.Axis.RY], "<")
    );
  },

  gamepadDownPressed: function (game) {
    return (
      PrinceJS.Utils.gamepadButtonDownCheck(game, [PrinceJS.Gamepad.DPadD]) ||
      PrinceJS.Utils.gamepadAxisCheck(game, [PrinceJS.Gamepad.Axis.LY, PrinceJS.Gamepad.Axis.RY], ">")
    );
  },

  gamepadLeftPressed: function (game) {
    return (
      PrinceJS.Utils.gamepadButtonDownCheck(game, [PrinceJS.Gamepad.DPadL]) ||
      PrinceJS.Utils.gamepadAxisCheck(game, [PrinceJS.Gamepad.Axis.LX, PrinceJS.Gamepad.Axis.RX], "<")
    );
  },

  gamepadRightPressed: function (game) {
    return (
      PrinceJS.Utils.gamepadButtonDownCheck(game, [PrinceJS.Gamepad.DPadR]) ||
      PrinceJS.Utils.gamepadAxisCheck(game, [PrinceJS.Gamepad.Axis.LX, PrinceJS.Gamepad.Axis.RX], ">")
    );
  },

  gamepadActionPressed: function (game) {
    return PrinceJS.Utils.gamepadButtonDownCheck(game, [
      PrinceJS.Gamepad.B,
      PrinceJS.Gamepad.Y,
      PrinceJS.Gamepad.L,
      PrinceJS.Gamepad.ZL
    ]);
  },

  gamepadInfoPressed: function (game) {
    return PrinceJS.Utils.gamepadButtonPressedCheck(game, [PrinceJS.Gamepad.X], "info");
  },

  gamepadPreviousPressed: function (game) {
    return PrinceJS.Utils.gamepadButtonPressedCheck(game, [PrinceJS.Gamepad.Minus], "previous");
  },

  gamepadNextPressed: function (game) {
    return PrinceJS.Utils.gamepadButtonPressedCheck(game, [PrinceJS.Gamepad.Plus], "next");
  },

  pointerPressed: function (game) {
    let pointerPressed = this._pointerPressed;
    this._pointerPressed = PrinceJS.Utils.pointerDown(game);
    return pointerPressed && !this._pointerPressed;
  },

  pointerDown: function (game) {
    if (game.input.activePointer.leftButton && game.input.activePointer.leftButton.isDown) {
      return true;
    }
    if (game.input.activePointer.isDown) {
      return true;
    }
    if (game.input.pointer1.isDown) {
      return true;
    }
    return game.input.pointer2.isDown;
  },

  effectivePointer: function (game) {
    let width = document.getElementsByTagName("canvas")[0].getBoundingClientRect().width;
    let height = document.getElementsByTagName("canvas")[0].getBoundingClientRect().height;
    let size = PrinceJS.Utils.effectiveScreenSize(game);
    let x =
      game.input.activePointer.x ||
      (game.input.pointer1.isDown && game.input.pointer1.x) ||
      (game.input.pointer2.isDown && game.input.pointer2.x) ||
      0;
    let y =
      game.input.activePointer.y ||
      (game.input.pointer1.isDown && game.input.pointer1.y) ||
      (game.input.pointer2.isDown && game.input.pointer2.y) ||
      0;
    return {
      x: x - (width - size.width) / 2,
      y: y - (height - size.height) / 2
    };
  },

  effectiveScreenSize: function (game) {
    let width = document.getElementsByTagName("canvas")[0].getBoundingClientRect().width;
    let height = document.getElementsByTagName("canvas")[0].getBoundingClientRect().height;
    if (width / height >= PrinceJS.WORLD_RATIO) {
      return {
        width: height * PrinceJS.WORLD_RATIO,
        height
      };
    } else {
      return {
        width,
        height: width / PrinceJS.WORLD_RATIO
      };
    }
  },

  gameContainer: function () {
    return document.getElementById("gameContainer");
  },

  resetFlipScreen: function () {
    PrinceJS.Utils.gameContainer().classList.remove("flipped");
  },

  toggleFlipScreen: function () {
    PrinceJS.Utils.gameContainer().classList.toggle("flipped");
  },

  isScreenFlipped: function () {
    return PrinceJS.Utils.gameContainer().classList.contains("flipped");
  },

  setRemainingMinutesTo15() {
    if (PrinceJS.Utils.getRemainingMinutes() > 15) {
      PrinceJS.Utils.minutes = 15;
      let date = new Date();
      date.setMinutes(date.getMinutes() - (60 - PrinceJS.Utils.minutes));
      PrinceJS.startTime = date;
      PrinceJS.Utils.updateQuery();
    }
  },

  resetRemainingMinutesTo60() {
    PrinceJS.Utils.minutes = 60;
    PrinceJS.startTime = undefined;
    PrinceJS.endTime = undefined;
    PrinceJS.Utils.updateQuery();
  },

  getDeltaTime: function () {
    if (!PrinceJS.startTime) {
      return {
        minutes: -1,
        seconds: -1
      };
    }
    let diff = (PrinceJS.endTime || new Date()).getTime() - PrinceJS.startTime.getTime();
    let minutes = Math.floor(diff / 60000);
    let seconds = Math.floor(diff / 1000) % 60;
    return { minutes, seconds };
  },

  getRemainingMinutes: function () {
    let deltaTime = PrinceJS.Utils.getDeltaTime();
    return Math.min(60, Math.max(0, 60 - deltaTime.minutes));
  },

  getRemainingSeconds: function () {
    let deltaTime = PrinceJS.Utils.getDeltaTime();
    return Math.min(60, Math.max(0, 60 - deltaTime.seconds));
  },

  applyStrength: function (value) {
    if (PrinceJS.strength >= 0 && PrinceJS.strength < 100) {
      return Math.ceil((value * PrinceJS.strength) / 100);
    }
    return value;
  },

  applyQuery: function () {
    let query = new URLSearchParams(window.location.search);
    if (query.get("level") || query.get("l")) {
      let queryLevel = parseInt(query.get("level") || query.get("l"), 10);
      if ((!isNaN(queryLevel) && queryLevel >= 1 && queryLevel <= 14) || queryLevel >= 90) {
        PrinceJS.currentLevel = queryLevel;
      }
    }
    // Health is fixed at ten in this version; older saved health/h values must not reduce it.
    if (query.get("time") || query.get("t")) {
      let queryTime = parseInt(query.get("time") || query.get("t"), 10);
      if (!isNaN(queryTime) && queryTime >= 1 && queryTime <= 60) {
        PrinceJS.minutes = queryTime;
      }
    }
    if (query.get("strength") || query.get("s")) {
      let queryStrength = parseInt(query.get("strength") || query.get("s"), 10);
      if (!isNaN(queryStrength) && queryStrength >= 0 && queryStrength <= 100) {
        PrinceJS.strength = queryStrength;
      }
    }
    if (query.get("width") || query.get("w")) {
      let queryWidth = parseInt(query.get("width") || query.get("w"), 10);
      if (!isNaN(queryWidth) && queryWidth > 0) {
        PrinceJS.screenWidth = queryWidth;
      }
    }

    if (query.get("shortcut") || query.get("_")) {
      PrinceJS.shortcut = (query.get("shortcut") || query.get("_")) === "true";
    }
  },

  applyScreenWidth() {
    if (PrinceJS.screenWidth > 0) {
      PrinceJS.Utils.gameContainer().style["max-width"] = PrinceJS.screenWidth + "px";
    }
  },

  updateQuery: function () {
    PrinceJS.minutes = PrinceJS.Utils.getRemainingMinutes();
    if (PrinceJS.shortcut) {
      PrinceJS.Utils.setHistoryState({
        l: PrinceJS.currentLevel,
        h: PrinceJS.maxHealth,
        t: PrinceJS.minutes,
        s: PrinceJS.strength,
        w: PrinceJS.screenWidth,
        _: true
      });
    } else {
      PrinceJS.Utils.setHistoryState({
        level: PrinceJS.currentLevel,
        health: PrinceJS.maxHealth,
        time: PrinceJS.minutes,
        strength: PrinceJS.strength,
        width: PrinceJS.screenWidth
      });
    }
  },

  restoreQuery: function () {
    if (PrinceJS.Utils.getRemainingMinutes() < PrinceJS.minutes) {
      let date = new Date();
      date.setMinutes(date.getMinutes() - (60 - PrinceJS.minutes));
      PrinceJS.startTime = date;
    }
  },

  clearQuery: function () {
    if (PrinceJS.shortcut) {
      PrinceJS.Utils.setHistoryState({
        s: PrinceJS.strength,
        w: PrinceJS.screenWidth,
        _: true
      });
    } else {
      PrinceJS.Utils.setHistoryState({
        strength: PrinceJS.strength,
        width: PrinceJS.screenWidth
      });
    }
  },

  setHistoryState(state) {
    history.replaceState(
      null,
      null,
      "?" +
        Object.keys(state)
          .map((key) => key + "=" + state[key])
          .join("&")
    );
  }
};
