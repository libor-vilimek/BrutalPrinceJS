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
async function continueCutscene() {
  // Use the real skip input after the cutscene enables it. Starting Game
  // directly lets its delayed keyboard callback overwrite gameplay later.
  await until(
    () => game.state.current === "Cutscene" && state().scene && game.input.keyboard.onDownCallback,
    "cutscene skip input"
  );
  tap(13);
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
    // The longer campaign flow has its own checks below. Keep these focused
    // controller tests at the first landing after the demonstration.
    s.tutorial.sequence = null;
    check(
      s.twinTorches.introDone && s.twinTorches.introTorches.every((torch) => torch.captured && torch.tile.taken),
      "Both actual wall torches are collected before the lesson"
    );
    check(game.paused && s.kid.action === "stand" && !s.kid.specialAction, "Lesson pauses at a usable standing pose");
    const targets = s.enemies.filter((enemy) => enemy.room === s.kid.room && enemy.charBlockY === s.kid.charBlockY);
    const target = targets[0];
    check(targets.length === 1 && target.alive && target.visible, "One live guard waits on the torch landing");
    check(
      !target.active && target.action === "stand" && target.charX > s.kid.charX && target.charFace === 1,
      "The opening guard faces away and does not react to the Prince"
    );
    check(s.twinTorches.canReach(target), "The waiting guard is within the first torch spin's reach");
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
    const retryTarget = s.enemies.find((enemy) => enemy.room === s.kid.room && enemy.charBlockY === s.kid.charBlockY);
    check(
      retryTarget &&
        retryTarget.alive &&
        !retryTarget.active &&
        retryTarget.charFace === 1 &&
        s.kid.health === s.kid.maxHealth,
      "A retry restores the passive guard and the opening still costs no health"
    );
    check(
      !frame.contentDocument.querySelector(".tutorial-overlay:not([hidden])"),
      "No old overlay remains after restart"
    );
    s.nextLevel(1, true, true);
    await continueCutscene();
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
document.getElementById("inspect").addEventListener("click", () => {
  const s = state();
  if (!s.tutorial) {
    results.textContent += "No active game. Replay the opening to inspect its tutorial.\n";
    return;
  }
  results.textContent +=
    JSON.stringify(
      {
        lesson: s.tutorial.active && s.tutorial.active.id,
        sequence: s.tutorial.sequence && s.tutorial.sequence.stage,
        prince: {
          room: s.kid.room,
          x: s.kid.charX,
          y: s.kid.charY,
          column: s.kid.charBlockX,
          row: s.kid.charBlockY,
          face: s.kid.charFace,
          action: s.kid.action,
          health: s.kid.health,
          molotov: s.kid.hasMolotov
        },
        board: s.level.getTileAt(6, 2, 1).element,
        burns: s.burningEnemyEffects.burns.map((burn) => ({
          x: burn.x,
          y: burn.y,
          room: burn.room,
          age: burn.age,
          stage: burn.route && burn.route.stage,
          grounded: burn.grounded
        }))
      },
      null,
      2
    ) + "\n";
});
async function runCampaign(preview = false) {
  if (busy) {
    return;
  }
  busy = true;
  results.textContent = "";
  try {
    await replay();
    let s = state();
    const target = s.enemies.find((enemy) => enemy.burnRoute === "opening-shaft");
    const guards = s.enemies.filter((enemy) => enemy.room === 2 && enemy.reinforcement);
    check(target && guards.length === 2, "The opening has its torch target and two molotov targets");
    tap(17);
    await until(() => target.burningDeath, "first ignition");
    await until(() => !s.tutorial.assist && !s.kid.specialAction && s.kid.action === "stand", "torch stow");
    const upperX = s.kid.charX;
    await until(() => s.level.getTileAt(6, 2, 1).element === 0 && target.room === 2, "burning guard opens the shaft");
    check(
      s.level.getTileAt(6, 2, 1).element === 0 && target.room === 2,
      "The burning guard runs through the real loose floor and falls into the next room"
    );
    check(
      !s.tutorial.sequence.guiding && s.kid.charBlockY === 1 && s.kid.charX === upperX,
      "The Prince stays on the upper platform under player control after the torch lesson"
    );
    key("keydown", 16);
    key("keydown", 39, { shiftKey: true });
    await until(() => s.kid.hasMolotov, "player walks over the bottle");
    key("keyup", 39, { shiftKey: true });
    key("keyup", 16);
    await until(() => s.kid.action === "stand", "player finishes the step");
    check(!s.tutorial.sequence.guiding && s.kid.charBlockY === 1, "Collecting the bottle does not trigger guidance");
    key("keydown", 39);
    key("keydown", 38);
    await until(() => s.kid.action === "standjump", "player starts the jump");
    key("keyup", 38);
    key("keyup", 39);
    check(!s.tutorial.sequence.guiding, "The player's jump begins without tutorial control");
    await until(() => s.tutorial.active && s.tutorial.active.id === "ledge-hang", "guided walk after landing", 15000);
    check(
      s.kid.hasMolotov && s.kid.health === s.kid.maxHealth,
      "After the player's jump, guidance reaches the edge without losing health or the collected bottle"
    );
    tap(40);
    check(s.tutorial.active.id === "ledge-hang", "Down alone cannot confirm the Shift + Down lesson");
    key("keydown", 16);
    key("keydown", 40, { shiftKey: true });
    key("keyup", 40, { shiftKey: true });
    key("keyup", 16);
    await until(() => s.tutorial.active && s.tutorial.active.id === "ledge-molotov", "real climb down");
    check(["hang", "hangstraight"].includes(s.kid.action), "Shift + Down really hangs the Prince over the shaft");
    check(
      guards.every((enemy) => enemy.alive && enemy.visible),
      "Both molotov targets are visible and alive below"
    );
    tap(17);
    await until(() => s.molotov.bottles.length > 0, "hanging bottle release");
    check(s.molotov.throwState.hanging, "Ctrl performs the real one-handed hanging throw");
    await until(() => guards.every((enemy) => !enemy.alive && enemy.burningDeath), "both guards ignite");
    check(
      guards.every((enemy) => enemy.burningDeath.weapon === "molotov"),
      "The real molotov ignites both guards below"
    );
    await until(() => !s.kid.specialAction && s.kid.action === "stand" && s.kid.room === 2, "landing after the throw");
    key("keydown", 39);
    await until(() => s.tutorial.active && s.tutorial.active.id === "minigun-select", "minigun room entry", 15000);
    key("keyup", 39);
    check(s.kid.hasMinigun && s.kid.room === 3, "Walking right collects the minigun and enters the next room");
    check(
      frame.contentDocument.querySelectorAll(".tutorial-weapon").length === 3,
      "The weapon lesson shows pictures and number keys for torches, molotovs and minigun"
    );
    if (preview) {
      results.textContent =
        "Weapon-card preview reached through the real opening, hanging throw and minigun pickup. Press 3 to continue. Sound stays disabled.";
      return;
    }
    tap(51);
    await until(() => s.tutorial.active && s.tutorial.active.id === "minigun-fire", "minigun firing lesson");
    const shots = s.minigun.effects.shots;
    tap(17);
    await until(() => s.minigun.effects.shots >= shots + 10, "assisted minigun burst");
    await until(() => !s.tutorial.assist && !s.kid.specialAction, "minigun stow");
    check(!s.weaponCtrlKey.isDown && s.kid.activeWeapon === "minigun", "The burst ends and keeps the selected gun");
    results.textContent += "All level-one campaign lessons passed.\n";
    s.nextLevel(1, true, true);
    await continueCutscene();
    await until(() => state().level && state().level.number === 2 && state().tutorial, "second level");
    s = state();
    key("keydown", 37);
    await until(() => s.kid.hasWhip, "collect the entrance whip");
    key("keyup", 37);
    check(
      !s.kid.hasRocketLauncher && s.rocketLauncher.pickup.room === 11,
      "Only the whip is collected at the entrance; rockets wait in the later corridor"
    );
    // Jump between distant test checkpoints, retaining the real map, actors,
    // collected inventory and tutorial state. Local actions remain native.
    // The checkpoint represents having fought through the lower corridor;
    // leave the upper guards untouched for the actual ledge demonstration.
    for (const enemy of s.enemies.filter((enemy) => enemy.room === 1 && enemy.charBlockY === 1)) {
      enemy.setInactive();
    }
    placePrince(1, 70, 1, -1);
    const snag = s.enemies.find((enemy) => s.whip.findSnag(enemy));
    check(snag, "An existing guard above the third room left can really be caught around the ledge");
    const beforeWhip = s.kid.activeWeapon;
    await until(() => s.tutorial.active && s.tutorial.active.id === "whip-pull", "whip lesson");
    tap(88);
    await until(() => snag.whipState, "real ankle catch");
    await until(
      () => !snag.alive || (snag.whipState && ["falling", "recovering"].includes(snag.whipState.phase)),
      "guard pulled into the gap"
    );
    check(s.kid.activeWeapon === beforeWhip, "X pulls the guard without switching the selected weapon");
    await until(() => !s.kid.specialAction, "whip stow");
    placePrince(11, 133, 1, -1);
    key("keydown", 37);
    await until(() => s.tutorial.active && s.tutorial.active.id === "rockets-select", "rocket pickup lesson");
    key("keyup", 37);
    check(
      s.kid.hasRocketLauncher && s.rocketLauncher.pickup.collected,
      "Walking over the relocated launcher collects the real pickup"
    );
    tap(52);
    await until(() => s.tutorial.active && s.tutorial.active.id === "rockets-fire", "rocket firing lesson");
    const rockets = s.rocketLauncher.effects.shots;
    tap(17);
    await until(() => s.rocketLauncher.effects.shots > rockets, "real rocket launch", 3000).catch((error) => {
      results.textContent +=
        JSON.stringify({
          health: s.kid.health,
          action: s.kid.action,
          weapon: s.kid.activeWeapon,
          stage: s.rocketLauncher.actionStage,
          held: s.weaponCtrlKey.isDown,
          enemies: s.enemies
            .filter((enemy) => enemy.room === 11 && enemy.alive)
            .map((enemy) => [enemy.charX, enemy.action, enemy.active])
        }) + "\n";
      throw error;
    });
    await until(() => !s.tutorial.assist && !s.kid.specialAction, "rocket stow");
    check(
      !s.weaponCtrlKey.isDown && s.kid.activeWeapon === "rocketLauncher",
      "The rocket lesson releases its assisted input"
    );
    check(game.sound.mute && game.sound.volume === 0, "All campaign lessons preserve muted sound");
    game.paused = true;
    results.textContent += "All campaign tutorial checks passed.\n";
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
document.getElementById("campaign").addEventListener("click", () => runCampaign());
document.getElementById("cards").addEventListener("click", () => runCampaign(true));
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
        if (!busy) {
          results.textContent = error.message;
        }
      });
  }
});

function placePrince(room, x, row, face) {
  const s = state();
  game.input.reset(false);
  const kid = s.kid;
  kid.room = room;
  kid.charX = x;
  kid.charY = (row + 1) * 63 - 10;
  kid.charBlockX = Math.floor((x - 7) / 14);
  kid.charBlockY = row;
  if (kid.charFace !== face) {
    kid.changeFace();
  }
  kid.action = "stand";
  kid.charXVel = kid.charYVel = 0;
  kid.inFallDown = kid.inJumpUp = false;
  kid.updateBase();
  kid.processCommand();
  kid.updateCharPosition();
  s.changeRoom(room);
}
