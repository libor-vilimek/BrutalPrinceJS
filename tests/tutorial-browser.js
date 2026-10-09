"use strict";

const frame = document.getElementById("game");
const results = document.getElementById("results");
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
let game;
let busy = false;

function state() {
  return game.state.getCurrentState();
}
function check(value, label) {
  if (!value) {
    throw new Error(label);
  }
  results.textContent += "PASS: " + label + "\n";
}
async function until(condition, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("Timed out: " + label);
    }
    await wait(20);
  }
}
function key(type, code, extra = {}) {
  frame.contentDocument.activeElement.dispatchEvent(
    new frame.contentWindow.KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      keyCode: code,
      which: code,
      ...extra
    })
  );
}
function tap(code, extra) {
  key("keydown", code, extra);
  key("keyup", code, extra);
}
function snapshot(s) {
  return JSON.stringify([
    s.kid.charX,
    s.kid.charY,
    s.kid.charFrame,
    s.kid.health,
    s.kid.activeWeapon,
    s.currentRoom,
    s.game.camera.x,
    s.game.camera.y,
    s.enemies.map((enemy) => [enemy.charX, enemy.charY, enemy.charFrame, enemy.health])
  ]);
}

async function ready() {
  let started = false;
  await until(() => {
    game = frame.contentWindow.Phaser && frame.contentWindow.Phaser.GAMES[0];
    if (game && game.sound) {
      game.sound.mute = true;
      game.sound.volume = 0;
    }
    if (!game || !game.cache || !game.cache.checkJSONKey("kid-anims") || game.load.isLoading) {
      return false;
    }
    game.stage.disableVisibilityChange = true;
    if (!started && game.state.current !== "Game") {
      started = true;
      game.state.start("Game");
    }
    return state().tutorial && state().tutorial.active;
  }, "opening lesson");
}

async function replay() {
  await new Promise((resolve) => {
    frame.addEventListener("load", resolve, { once: true });
    frame.src = "../index.html?level=1";
  });
  await ready();
}

async function run() {
  if (busy) {
    return;
  }
  busy = true;
  results.textContent = "";
  try {
    await replay();
    let s = state();
    check(
      s.twinTorches.introDone && s.twinTorches.introTorches.every((torch) => torch.captured && torch.tile.taken),
      "Both actual wall torches are collected before the lesson"
    );
    check(game.paused && s.kid.action === "stand" && !s.kid.specialAction, "Lesson pauses at a usable standing pose");
    const target = s.enemies.find((enemy) => enemy.room === s.kid.room && enemy.charBlockY === s.kid.charBlockY);
    check(target && target.alive && target.active && target.visible, "A live guard waits on the torch landing");
    results.textContent += "Opening: health " + s.kid.health + "/" + s.kid.maxHealth +
      ", Prince x=" + s.kid.charX + ", guard x=" + target.charX + ", action=" + target.action + "\n";
    check(s.kid.health === s.kid.maxHealth, "The guard cannot hurt the Prince during the opening collection");
    const frozen = snapshot(s);
    for (const code of [27, 13, 32, 39, 50, 67, 74, 88]) {
      tap(code);
    }
    tap(82, { ctrlKey: true });
    tap(70, { repeat: true });
    await wait(350);
    check(
      game.paused && s.tutorial.active && snapshot(s) === frozen,
      "Wrong keys, shortcuts and repeat leave the world frozen"
    );
    check(!s.weaponCtrlKey.isDown && !s.weaponFireKey.isDown, "Blocked input does not leak to Phaser");
    tap(70);
    check(
      !game.paused && !s.tutorial.active && s.weaponFireKey.isDown,
      "A short F press resumes with an assisted key hold"
    );
    await until(() => s.twinTorches.actionStage === "spinning", "torch drawing");
    check(
      s.kid.specialAction && s.kid.specialAction.owner === s.twinTorches,
      "The real draw reaches the real spinning animation"
    );
    await until(() => s.twinTorches.spinTime > 0.8, "full spin");
    check(target.burningDeath && !target.alive, "The tutorial's first spin ignites the nearby guard");
    check(s.kid.health === s.kid.maxHealth, "The Prince finishes drawing and ignites the guard before being stabbed");
    check(s.weaponFireKey.isDown, "The tap lasts through a visible full spin");
    await until(() => !s.tutorial.assist && s.twinTorches.actionStage === "hidden", "automatic release and stow");
    check(
      !s.weaponFireKey.isDown && !s.kid.specialAction && s.kid.activeWeapon === "twinTorches",
      "Assistance releases and normal stowing restores the same inventory selection"
    );
    check(game.sound.mute && game.sound.volume === 0, "Tutorial resume preserves muted audio");
    s.tutorial.completed.delete("twin-torches");
    await until(() => s.tutorial.active, "second key preview");
    tap(17);
    await until(() => s.twinTorches.actionStage === "spinning", "Ctrl torch draw");
    check(s.weaponCtrlKey.isDown, "Ctrl works through the same assisted path");
    frame.contentWindow.dispatchEvent(new frame.contentWindow.Event("blur"));
    check(!s.tutorial.assist && !s.weaponCtrlKey.isDown, "Focus loss clears an assisted key");
    await until(() => s.twinTorches.actionStage === "hidden", "stow after blur");
    check(
      s.tutorial.show({
        id: "playtest-jump",
        title: "Jump input check",
        description: "This test-only lesson verifies the original movement controls.",
        keys: [{ code: 38, label: "Up" }],
        holdMs: 0
      }),
      "The same tutorial controller accepts a movement lesson without an extended hold"
    );
    tap(38);
    await until(() => s.kid.action !== "stand", "native movement tick");
    await until(() => !s.tutorial.assist, "movement release");
    check(!s.kid.cursors.up.isDown, "A quick Up tap reaches the native actor and then releases");
    const kid = s.kid;
    s.restartLevel(true);
    await until(() => state().kid !== kid && state().tutorial && state().twinTorches.introDone, "level restart");
    s = state();
    check(!s.tutorial.active && s.tutorial.completed.has("twin-torches"), "A retry remembers the completed lesson");
    check(
      !frame.contentDocument.querySelector(".tutorial-overlay:not([hidden])"),
      "No old overlay remains after restart"
    );
    s.nextLevel(1, true, true);
    await until(() => game.state.current === "Cutscene", "level transition");
    game.state.start("Game");
    await until(() => state().level && state().level.number === 2 && state().tutorial, "level 2");
    s = state();
    check(
      s.kid.hasMolotov && s.kid.hasMinigun && s.kid.activeWeapon === "twinTorches",
      "Level progression and normal inventory grants still work"
    );
    check(
      s.tutorial.completed.has("twin-torches") && !s.tutorial.active && !s.tutorial.assist,
      "Progress persists and assisted input does not cross levels"
    );
    check(
      frame.contentDocument.querySelectorAll(".tutorial-overlay").length === 1,
      "Only the current level owns an overlay"
    );
    results.textContent += "All tutorial browser checks passed. Replay opening to inspect the panel.\n";
  } catch (error) {
    results.textContent += "FAIL: " + error.message + "\n";
  } finally {
    if (game && game.sound) {
      game.sound.mute = true;
      game.sound.volume = 0;
    }
    busy = false;
  }
}

document.getElementById("run").addEventListener("click", run);
document.getElementById("replay").addEventListener("click", async () => {
  if (busy) {
    return;
  }
  busy = true;
  try {
    await replay();
    results.textContent = "Press Ctrl or F in the game, or tap its keycap. Sound stays disabled.";
  } catch (error) {
    results.textContent = error.message;
  } finally {
    busy = false;
  }
});
frame.addEventListener("load", () => {
  if (!busy) {
    ready()
      .then(() => {
        if (!busy) {
          results.textContent = "Ready. Inspect the panel, try its key, or run the checks. Sound stays disabled.";
        }
      })
      .catch((error) => {
        results.textContent = error.message;
      });
  }
});
