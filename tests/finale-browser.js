"use strict";

const frame = document.getElementById("game");
const status = document.getElementById("status");
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
let game;
let busy = false;

async function until(condition) {
  const deadline = Date.now() + 15000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("Timed out loading the finale");
    }
    await wait(20);
  }
}

async function replay(moment) {
  if (busy) {
    return;
  }
  busy = true;
  try {
    await new Promise((resolve) => {
      frame.addEventListener("load", resolve, { once: true });
      frame.src = "../index.html?level=14";
    });
    await until(() => {
      game = frame.contentWindow.Phaser && frame.contentWindow.Phaser.GAMES[0];
      if (game && game.sound) {
        game.sound.mute = true;
        game.sound.volume = 0;
      }
      return game && game.state.current === "Preloader" && !game.load.isLoading;
    });
    game.stage.disableVisibilityChange = true;
    game.state.start("Game");
    await until(() => game.state.getCurrentState().level && game.state.getCurrentState().kid);
    // Exercise the real last-level transition, including camera and inventory cleanup.
    game.state.getCurrentState().nextLevel(14);
    await until(() => game.state.getCurrentState().finale);
    if (moment !== undefined) {
      const state = game.state.getCurrentState();
      while (state.finale.elapsed < moment - 0.000001) {
        state.finale.update(Math.min(1 / 60, moment - state.finale.elapsed));
      }
      state.cover.alpha = 0;
      state.fadeTweens.forEach((tween) => game.tweens.remove(tween));
      game.paused = true;
    }
    status.textContent =
      moment === undefined ? "Playing · all audio muted" : "Paused at " + moment.toFixed(2) + "s · all audio muted";
  } catch (error) {
    status.textContent = error.stack;
  } finally {
    busy = false;
  }
}

document.getElementById("replay").onclick = () => replay();
document.getElementById("inspect").onclick = () => replay(Number(document.getElementById("moment").value));
document.getElementById("pause").onclick = () => {
  if (game) {
    game.paused = !game.paused;
  }
};
replay();
