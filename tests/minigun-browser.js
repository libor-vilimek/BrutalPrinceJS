"use strict";

// Browser integration fixture. The production entry point remains unchanged.
const gameFrame = document.getElementById("game");
const output = document.getElementById("results");
const testAudio = document.getElementById("test-audio");
const pause = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
let testGame;
let busy = false;

testAudio.addEventListener("change", () => {
  if (testGame && testGame.sound) {
    testGame.sound.mute = !testAudio.checked;
  }
});

function report(text) {
  output.textContent += text + "\n";
}

function check(condition, description) {
  if (!condition) {
    throw new Error(description);
  }
  report("PASS: " + description);
}

function gameState() {
  return testGame.state.getCurrentState();
}

async function ready() {
  for (let i = 0; i < 100; i++) {
    const games = gameFrame.contentWindow.Phaser && gameFrame.contentWindow.Phaser.GAMES;
    testGame = games && games[0];
    if (testGame && testGame.sound) {
      testGame.sound.mute = !testAudio.checked;
    }
    if (testGame && testGame.cache && testGame.cache.checkJSONKey("kid-anims") && !testGame.load.isLoading) {
      testGame.stage.disableVisibilityChange = true;
      testGame.paused = false;
      if (testGame.state.current !== "Game") {
        testGame.state.start("Game");
      }
      await pause(1000);
      await settleOpeningIntro();
      testGame.input.reset(false);
      return;
    }
    await pause(100);
  }
  throw new Error("Game did not load");
}

async function settleOpeningIntro() {
  for (let i = 0; i < 100; i++) {
    const torches = gameState().twinTorches;
    if (!torches || (!torches.introPending && torches.actionStage !== "intro")) {
      return;
    }
    await pause(50);
  }
  throw new Error("The starting torch collection did not finish");
}

async function meleeFireChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  let keyR;
  let kid;
  try {
    let state = await loadMission(1);
    quietEnemies(state);
    kid = state.kid;
    check(
      kid.hasTwinTorches && kid.activeWeapon === "twinTorches",
      "Torches are automatically owned and selected first"
    );
    check(
      state.twinTorches.introDone &&
        state.twinTorches.introTorches.length === 2 &&
        state.twinTorches.introTorches.every(({ tile, captured }) => captured && tile.taken && !tile.tileChild.visible),
      "The real starting sequence removes both wall torches and tucks them away"
    );
    check(!kid.specialAction && !kid.cropRect, "Opening collection restores movement and the native Prince sprite");
    const start = testGame.cache.getJSON("level").prince;
    const startRoom = state.level.rooms[start.room];
    check(
      kid.room === start.room &&
        kid.baseX === startRoom.x * 320 &&
        kid.baseY === startRoom.y * 189 + 3 &&
        kid.charX === state.twinTorches.introStartX &&
        kid.charBlockX === 0 &&
        kid.charBlockY === 1 &&
        !kid.inFallDown,
      "The complete opening returns to the real starting landing without drifting through neighboring walls"
    );
    placeKid(2, 70, 1, 1);
    state.selectWeapon("twinTorches");
    const targets = state.enemies.filter((enemy) => enemy.alive && enemy.baseCharName === "guard").slice(0, 2);
    targets.forEach((enemy, index) => {
      placeGuard(enemy, 2, index ? 16 : 13, index ? -1 : 1);
      enemy.health = 4;
    });
    const startX = kid.charX;
    const health = kid.health;
    state.weaponCtrlKey.isDown = true;
    state.weaponCtrlKey.onDown.dispatch();
    await pause(90);
    check(state.twinTorches.actionStage === "drawing", "Ctrl starts the vulnerable two-torch draw");
    kid.stabbed();
    check(
      kid.health === health - 1 &&
        state.twinTorches.actionStage === "drawing" &&
        kid.specialAction.owner === state.twinTorches,
      "A native sword hit during draw costs one life without interrupting the animation"
    );
    keyR = kid.keyR;
    kid.keyR = () => true;
    for (let i = 0; i < 50 && targets.some((enemy) => enemy.alive); i++) {
      await pause(25);
    }
    check(state.twinTorches.isSpinning() && kid.charX === startX, "Held Ctrl completes the draw and spins in place");
    check(
      targets.every((enemy) => !enemy.alive && enemy.health === 0 && enemy.burningDeath),
      "Both guards within the sweep are killed immediately and start burning"
    );
    const spinHealth = kid.health;
    kid.stabbed();
    check(kid.health === spinHealth, "Spinning deflects native sword strikes");
    kid.keyR = keyR;
    keyR = null;
    const burns = targets.map((enemy) => enemy.burningDeath);
    const positions = burns.map((burn) => burn.x);
    state.weaponCtrlKey.isDown = false;
    state.weaponCtrlKey.onUp.dispatch();
    await pause(100);
    check(
      state.twinTorches.actionStage === "holstering" && kid.specialAction,
      "Release locks the Prince while stowing both torches"
    );
    await pause(1100);
    check(
      burns.every((burn, index) => burn.x !== positions[index] && burn.age < 5 && burn.flames.visible),
      "Already dead guards keep running with visible fire and smoke"
    );
    for (let i = 0; i < 100 && burns.some((burn) => burn.phase !== "charred"); i++) {
      await pause(60);
    }
    check(
      burns.every((burn) => burn.age >= 5 && burn.phase === "charred" && !burn.flames.visible),
      "At five seconds the performance finishes with persistent charred bodies"
    );
    check(!kid.specialAction && !kid.cropRect, "Stowing restores normal controls and the original sprite");
    state = await loadMission(2);
    quietEnemies(state);
    check(
      !state.kid.hasWhip && state.whip.effects.ground.visible && state.whip.pickup.room === state.kid.room,
      "The whip is visible beside the level-two arrival door"
    );
    await walkUntil(() => state.kid.hasWhip, "Walking right from the level-two start collects the whip");
    check(
      state.kid.activeWeapon === "twinTorches" && !state.whip.effects.ground.visible,
      "Pickup unlocks the X whip and hides its floor art while keeping torches selected"
    );
    state = await loadMission(3);
    quietEnemies(state);
    check(
      !state.kid.hasRocketLauncher && state.rocketLauncher.effects.ground.visible,
      "Level three starts with a visible launcher to collect"
    );
    testGame.input.keyboard.addKey(gameFrame.contentWindow.Phaser.Keyboard.FOUR).onDown.dispatch();
    check(state.kid.activeWeapon === "twinTorches", "Key four cannot select the launcher before pickup");
    await walkUntil(() => state.kid.hasRocketLauncher, "Walking from the real level-three start picks up the launcher");
    check(
      state.kid.activeWeapon === "rocketLauncher" && !state.rocketLauncher.effects.ground.visible,
      "The collected launcher is selected and its pickup disappears"
    );
    state = await loadMission(4);
    check(
      state.kid.hasRocketLauncher && state.kid.hasWhip && state.kid.hasTwinTorches,
      "Later levels retain automatic weapons and select the basic torches"
    );
    report("ALL TORCH, BURN AND PICKUP CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    if (keyR) {
      kid.keyR = keyR;
    }
    gameState().weaponFireKey.isDown = gameState().weaponCtrlKey.isDown = false;
    busy = false;
  }
}

async function prepareWhipLedge(directlyBelow = false) {
  const state = await loadMission(2);
  quietEnemies(state);
  await collectWeapon(state.whip);
  const roomId = directlyBelow ? 16 : 7;
  placeKid(roomId, 77, 1, 1);
  const room = state.level.rooms[roomId];
  const kid = state.kid;
  kid.charX += ((room.x * 320 + 176 - state.whip.position(kid).x) * 140) / 320;
  kid.updateBlockXY();
  kid.updateCharPosition();
  const target = state.enemies.find((enemy) => enemy.alive && enemy.baseCharName === "guard");
  placeGuard(target, roomId, directlyBelow ? 5 : 6, -1);
  target.charX += ((room.x * 320 + (directlyBelow ? 176 : 208) - state.whip.position(target).x) * 140) / 320;
  target.updateBlockXY();
  target.updateCharPosition();
  target.health = 4;
  const snag = state.whip.findSnag(target);
  check(
    snag && snag.gap.column === (directlyBelow ? 6 : 5),
    directlyBelow
      ? "Standing directly underneath reaches the upper ankle around both corners of the actual floor"
      : "The whip reaches the upper ankle around the actual open ledge"
  );
  return { state, target };
}

async function whipChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    let state;
    let target;
    for (let directlyBelow of [false, true]) {
      ({ state, target } = await prepareWhipLedge(directlyBelow));
      const selected = state.kid.activeWeapon;
      check(!state.weapons.includes(state.whip), "The whip is separate from the numbered weapon inventory");
      let damage = 0;
      target.onDamageLife.add((amount) => (damage += amount));
      state.whipKey.isDown = true;
      state.whipKey.onDown.dispatch();
      for (let i = 0; i < 60 && !target.whipState; i++) {
        await pause(25);
      }
      check(
        target.whipState && state.whip.pulledEnemies.has(target),
        "X catches the upper guard's ankle without selecting another weapon"
      );
      state.whipKey.isDown = false;
      const kid = state.kid;
      const x = kid.charX;
      const keyR = kid.keyR;
      try {
        kid.keyR = () => true;
        state.weaponCtrlKey.isDown = true;
        state.selectWeapon("molotov");
        await pause(100);
        check(
          state.whip.actionStage === "cracking" &&
            state.whip.effects.tether &&
            state.whip.effects.tether.enemy === target &&
            state.whip.effects.cord.visible,
          "Releasing X after the catch keeps the full swing and visible ankle tether"
        );
        check(
          kid.specialAction &&
            kid.specialAction.owner === state.whip &&
            kid.charX === x &&
            kid.activeWeapon === selected,
          "Movement, Ctrl attacks and weapon selection cannot interrupt the caught swing"
        );
      } finally {
        kid.keyR = keyR;
        state.weaponCtrlKey.isDown = false;
      }
      for (let i = 0; i < 80 && target.alive && target.whipState && target.whipState.phase !== "recovering"; i++) {
        await pause(25);
      }
      check(
        target.alive && target.whipState && target.whipState.phase === "recovering" && target.charBlockY === 1,
        "The guard is dragged over the edge and lands face first on the lower floor"
      );
      check(target.health === 3 && damage === 1, "Even this short native fall removes exactly one life");
      await pause(200);
      check(target.whipState && !target.swordDrawn, "The stunned guard cannot attack while getting up");
      for (let i = 0; i < 80 && target.whipState; i++) {
        await pause(25);
      }
      check(
        !target.whipState && target.alive && target.health === 3,
        "Recovery releases the guard without repeating fall damage"
      );
      check(state.kid.activeWeapon === selected, "Using X preserves the previously selected main weapon");
      check(
        state.whip.cracks === 1 && !kid.specialAction && !kid.cropRect && !state.whip.effects.cord.visible,
        "The completed pull stows once and restores normal controls and the original Prince sprite"
      );
    }
    quietEnemies(state);
    placeKid(7, 35, 1, 1);
    state.selectWeapon("minigun");
    const ordinary = state.enemies.find((enemy) => enemy.alive && enemy !== target && enemy.baseCharName === "guard");
    placeGuard(ordinary, 7, 13, -1);
    ordinary.health = 4;
    state.whipKey.onDown.dispatch();
    for (let i = 0; i < 100 && ordinary.health === 4; i++) {
      await pause(20);
    }
    check(ordinary.health === 3 && !ordinary.whipState, "A quick X tap deals one ordinary same-floor whip strike");
    await pause(300);
    check(
      state.kid.activeWeapon === "minigun" && !state.kid.specialAction && !state.kid.cropRect,
      "The tap finishes stowing and restores movement with the minigun still selected"
    );
    report("ALL WHIP ATTACK AND LEDGE PULL CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    gameState().whipKey.isDown = false;
    gameState().weaponFireKey.isDown = gameState().weaponCtrlKey.isDown = false;
    busy = false;
  }
}

async function kickChecks(preview = false) {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    const state = await loadMission(4);
    quietEnemies(state);
    let strip;
    for (const [id, room] of Object.entries(state.level.rooms)) {
      for (let row = 0; row < 3 && !strip; row++) {
        for (let column = 0; column <= 3 && !strip; column++) {
          if (
            Array.from({ length: 7 }, (_, i) => state.level.getTileAt(column + i, row, Number(id))).every(
              (tile) => tile.isSafeWalkable() && !tile.isBarrier() && !tile.isExitDoor() && tile.element !== 11
            )
          ) {
            strip = { room: Number(id), row, column };
          }
        }
      }
      if (strip) {
        break;
      }
    }
    check(strip, "A real seven-tile corridor is available for the domino");
    placeKid(strip.room, (strip.column + 1) * 14, strip.row, 1);
    state.kickKey.onDown.dispatch();
    check(
      state.kick.actionStage === "kicking" && state.kick.effects.pose.visible,
      "C visibly kicks even in an empty corridor"
    );
    await pause(1150);
    check(!state.kid.specialAction && !state.kid.cropRect, "An empty kick finishes and restores normal movement");
    const guards = state.enemies.filter((enemy) => enemy.alive && enemy.baseCharName === "guard").slice(0, 4);
    const arrange = async (direction) => {
      state.minigun.bullets.length = 0;
      quietEnemies(state);
      placeKid(strip.room, (strip.column + (direction === 1 ? 1 : 7)) * 14, strip.row, direction);
      await watchCamera(state, () => !state.roomCamera.transition);
      guards.forEach((enemy, i) => {
        state.kick.releaseEnemy(enemy);
        placeGuard(enemy, strip.room, strip.row * 10 + strip.column + (direction === 1 ? i + 1 : 5 - i), -direction);
        enemy.health = 4;
      });
    };
    for (const direction of [1, -1]) {
      await arrange(direction);
      state.selectWeapon("minigun");
      state.minigun.beginDraw();
      if (direction === -1) {
        state.minigun.beginHolster();
      }
      state.kick.cooldown = 0;
      state.kick.launchCount = 0;
      state.kick.random = () => 0.5;
      state.kickKey.onDown.dispatch();
      check(
        state.kid.specialAction && state.kid.specialAction.type === "kick",
        "C immediately interrupts drawing/stowing"
      );
      check(
        guards.every((enemy) => !enemy.kickState),
        "A readable wind-up precedes the roundhouse contact"
      );
      check(
        !state.minigun.effects.weapon.visible && !state.minigun.effects.head.visible,
        "The interrupted gun and its pose are hidden"
      );
      if (preview) {
        await pause(240);
        testGame.paused = true;
        report(
          "C: slower protected roundhouse. One guard flies and can topple one more; blood is cosmetic. X still uses the whip."
        );
        return;
      }
      const health = state.kid.health;
      state.kid.stabbed();
      await pause(400);
      state.kid.stabbed();
      await pause(550);
      state.kid.stabbed();
      check(state.kid.health === health, "Sword hits cannot hurt the Prince during wind-up, spin or follow-through");
      // Unhit guards can still attack when the spin ends. Isolate the follow-up
      // draw check to the two fallen guards whose recovery it is testing.
      guards.filter((enemy) => !enemy.kickState).forEach((enemy) => {
        enemy.setInactive();
        enemy.setInvisible();
      });
      await pause(250);
      check(
        guards[0].kickState &&
          !guards[0].kickState.secondary &&
          guards.filter((enemy) => enemy.kickState).length === 2 &&
          guards.slice(1).filter((enemy) => enemy.kickState && enemy.kickState.secondary).length === 1,
        "One guard is kicked directly and its body topples exactly one more facing " + direction
      );
      check(
        guards
          .slice(1)
          .every(
            (enemy) => !enemy.kickState || (enemy.kickState.secondary && !enemy.kickState.sprite && enemy.alpha === 1)
          ),
        "Secondary victims fall with their native sprite instead of becoming more flying projectiles"
      );
      check(
        guards.every((enemy) => enemy.health === 4),
        "Every guard retains all HP (" + guards.map((enemy) => enemy.health).join(", ") + ")"
      );
      check(
        !state.kid.specialAction && !state.kid.cropRect && state.kid.activeWeapon === "minigun",
        "The full Prince sprite and selected weapon are restored"
      );
      state.weaponCtrlKey.isDown = true;
      await pause(480);
      check(
        state.minigun.actionStage === "firing",
        "There is enough recovery time to draw and fire the selected weapon"
      );
      state.weaponCtrlKey.isDown = false;
      state.minigun.cancelAction();
    }
    const prepared = await prepareMolotov();
    const ledgeState = prepared.state;
    const kid = ledgeState.kid;
    try {
      const target = ledgeState.enemies.find((enemy) => enemy.alive && enemy.baseCharName === "guard");
      placeGuard(target, 1, 11, 1);
      target.health = 4;
      const startY = kid.baseY + kid.charY;
      ledgeState.kickKey.onDown.dispatch();
      await pause(300);
      check(
        kid.baseY + kid.charY === startY - 63 && !/hang|climb/.test(kid.action),
        "C finishes a real threatened ledge climb in under 0.3 seconds"
      );
      check(target.health === 4 && kid.alive, "The emergency climb preserves enemy HP and the Prince survives");
    } finally {
      kid.keyS = prepared.keyS;
    }
    report("ALL ROUNDHOUSE AND FLYING GUARD CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    gameState().weaponCtrlKey.isDown = gameState().weaponFireKey.isDown = false;
    busy = false;
  }
}

async function torchPreview() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    const state = await loadMission(1);
    quietEnemies(state);
    placeKid(2, 70, 1, 1);
    state.selectWeapon("twinTorches");
    state.enemies
      .filter((enemy) => enemy.alive && enemy.baseCharName === "guard")
      .slice(0, 2)
      .forEach((enemy, index) => {
        placeGuard(enemy, 2, index ? 16 : 13, index ? -1 : 1);
        enemy.health = 4;
      });
    state.weaponCtrlKey.isDown = true;
    for (let i = 0; i < 60 && !state.twinTorches.isSpinning(); i++) {
      await pause(25);
    }
    check(state.twinTorches.isSpinning(), "Both torches are spinning around the original Prince");
    await pause(350);
    testGame.paused = true;
    report(
      "Torches and burning guards. Resume to see the five-second panic run. Hold Ctrl/F to spin; release to stow. 1 torches, 2 molotov, 3 minigun, 4 rockets; X whip."
    );
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    busy = false;
  }
}

async function whipPreview() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    const { state, target } = await prepareWhipLedge(true);
    state.whipKey.isDown = true;
    state.whipKey.onDown.dispatch();
    for (let i = 0; i < 80 && !target.whipState; i++) {
      await pause(20);
    }
    check(target.whipState, "The whip catches the guard above the actual gap");
    await pause(70);
    testGame.paused = true;
    state.whipKey.isDown = false;
    report(
      "Whip around the guard's ankle. Resume to pull him into the gap, lose one life on the short fall and recover before fighting again."
    );
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    busy = false;
  }
}

async function doorBloodPreview() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    const state = await loadMission(3);
    quietEnemies(state);
    const room = state.level.rooms[6];
    const x = room.x * 320;
    const y = room.y * 189 + 126;
    state.bloodEffects.burst(x + 132, y + 22, 6, { count: 36, vx: 220, vy: 0 });
    await pause(350);
    const layer = state.bloodEffects.decalRooms.get(6);
    check(
      layer &&
        layer.background &&
        layer.background.drawnPixelCount > 0 &&
        layer.background.sprite.parent === state.level.back,
      "Blood on the actual next-level door is painted in the scenery behind the Prince"
    );
    const cache = layer.background;
    const revision = cache.revision;
    placeKid(2, 49, 1, 1);
    await pause(200);
    placeKid(6, 61, 2, 1);
    await watchCamera(state, () => !state.roomCamera.transition);
    check(
      layer.background === cache && cache.revision === revision,
      "Leaving and returning preserves the same door stains"
    );
    // Let Phaser render the vertical camera cut before freezing the preview.
    await pause(100);
    testGame.paused = true;
    report(
      "The Prince stands in front of the bloody exit. Door ink stays behind him; the floor lip and surrounding stone keep their normal layers."
    );
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    busy = false;
  }
}

function placeKid(room, x, row, direction) {
  const state = gameState();
  const kid = state.kid;
  state.weaponFireKey.isDown = false;
  state.weaponCtrlKey.isDown = false;
  state.whipKey.isDown = false;
  state.kickKey.isDown = false;
  state.kick.cancelAction();
  if (state.whip) {
    state.whip.cancelAction();
  }
  for (const weapon of state.weapons) {
    weapon.cancelAction();
  }
  if (state.jetpack && kid.specialAction && kid.specialAction.owner === state.jetpack) {
    state.jetpack.toggle();
  }
  kid.room = room;
  kid.charX = x;
  kid.charY = (row + 1) * 63 - 10;
  kid.charBlockX = Math.floor((x - 7) / 14);
  kid.charBlockY = row;
  if (kid.charFace !== direction) {
    kid.changeFace();
  }
  kid.action = "stand";
  kid.charXVel = kid.charYVel = 0;
  kid.inFallDown = kid.inJumpUp = false;
  kid.updateBase();
  kid.processCommand();
  kid.updateCharPosition();
  state.changeRoom(room);
}

async function combatChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    await ready();
    let state = await freshLevel(1);
    // Keep these original weapon scenarios deterministic; the separate horde checks exercise reinforcements.
    for (const enemy of state.enemies.filter((enemy) => enemy.reinforcement)) {
      enemy.setInactive();
      enemy.setInvisible();
    }
    check(!state.kid.hasMinigun && !state.minigun.pickup.collected, "Fresh spawn has a ground pickup");
    check(state.kid.health === 10 && state.ui.playerHPActive === 10, "The Prince and HUD start with ten health");
    check(
      !state.rocketLauncher &&
        state.weapons.map((weapon) => weapon.spec.id).join(",") === "twinTorches,molotov,minigun",
      "Mission one lists the starting torches, molotov and minigun"
    );
    state.selectWeapon("rocketLauncher");
    check(!state.kid.hasRocketLauncher && !state.kid.rocketLauncherEquipped, "Rocket selection cannot unlock it early");
    const below = state.level.rooms[state.kid.room].links.down;
    const secondRoom = state.level.rooms[below];
    check(state.minigun.pickup.room === below, "Minigun waits in the second room below the starting screen");
    check(
      state.minigun.pickup.worldX === secondRoom.x * 320 + 240 &&
        state.minigun.pickup.worldY === secondRoom.y * 189 + 119 &&
        state.level.getTileAt(7, 1, below).element === 1,
      "Minigun is clearly positioned on plain floor between columns on the right of the second room"
    );
    check(
      state.molotov.pickup.worldY === state.kid.baseY + 116,
      "Only the molotov remains on the upper starting floor"
    );
    await collectWeapon(state.minigun);
    check(!state.minigun.effects.weapon.visible, "Collected minigun stays hidden until fire is held");
    placeKid(21, 42, 0, 1);
    const guard = state.enemies.find((enemy) => enemy.room === 21);
    check(guard.alive && guard.health > 0, "Target guard starts alive");
    state.minigun.fireKey.isDown = true;
    await pause(1300);
    state.minigun.fireKey.isDown = false;
    check(!guard.alive && guard.health === 0, "Held fire kills a real guard");
    check(state.minigun.effects.shots >= 10, "Held fire emits repeated shots");
    check(state.minigun.effects.casings.length >= 30, "Firing ejects brass casings");
    state.weaponFireKey.isDown = false;
    state.weaponCtrlKey.isDown = true;
    state.weaponCtrlKey.onDown.dispatch();
    const shots = state.minigun.effects.shots;
    await pause(900);
    check(
      state.kid.minigunEquipped && state.minigun.effects.shots > shots,
      "Holding Ctrl fires the selected gun directly"
    );
    state.weaponCtrlKey.isDown = false;
    await pause(100);
    check(
      state.minigun.actionStage === "holstering" && state.kid.specialAction,
      "Releasing Ctrl starts a locked stowing animation"
    );
    await pause(350);
    check(
      !state.minigun.effects.weapon.visible && !state.kid.specialAction,
      "Stowing finishes before the gun disappears and movement resumes"
    );
    state.weaponCtrlKey.isDown = true;
    state.weaponCtrlKey.onDown.dispatch();
    await pause(800);
    check(
      state.kid.minigunEquipped && state.minigun.effects.shots > shots,
      "Pressing Ctrl again fires without holstering inventory"
    );
    state.weaponCtrlKey.isDown = false;
    placeKid(21, 63, 0, -1);
    state.minigun.fireKey.isDown = true;
    await pause(800);
    check(
      state.minigun.bullets.some((bullet) => bullet.direction === -1),
      "Left-facing fire sends bullets left"
    );
    state.minigun.fireKey.isDown = false;
    await pause(2500);
    const shells = state.minigun.effects.casings.length;
    const roomShells = state.minigun.effects.casingRooms[21].settled.length;
    placeKid(3, 42, 1, 1);
    await pause(200);
    placeKid(21, 42, 0, 1);
    check(state.minigun.effects.casings.length === shells, "All brass survives room travel");
    check(state.minigun.effects.casingRooms[21].settled.length >= roomShells, "Room piles remain on return");
    state = await freshLevel(3);
    quietEnemies(state);
    await collectWeapon(state.rocketLauncher);
    state.selectWeapon("rocketLauncher");
    check(
      state.kid.hasRocketLauncher && state.kid.rocketLauncherEquipped,
      "Mission three's collected launcher can be selected"
    );
    placeKid(13, 28, 2, 1);
    const rocketGuard = state.enemies.find((enemy) => enemy.reinforcement);
    placeGuard(rocketGuard, 13, 27);
    check(rocketGuard.alive, "Rocket target starts alive");
    state.weaponFireKey.isDown = true;
    await pause(1500);
    state.weaponFireKey.isDown = false;
    check(!rocketGuard.alive && rocketGuard.health === 0, "A real rocket impact kills the target");
    await pause(120);
    check(
      state.rocketLauncher.actionStage === "holstering" && state.kid.specialAction,
      "Releasing rockets starts a locked stowing animation"
    );
    await pause(260);
    check(!state.rocketLauncher.effects.weapon.visible, "The launcher is hidden after fire is released");
    state = await loadMission(13);
    quietEnemies(state);
    state.selectWeapon("rocketLauncher");
    state.toggleJetpack();
    await pause(350);
    state.weaponFireKey.isDown = true;
    const rocketShots = state.rocketLauncher.effects.shots;
    await pause(200);
    check(
      !state.rocketLauncher.effects.weapon.visible && state.rocketLauncher.effects.shots === rocketShots,
      "The selected launcher stays hidden and cannot fire while the Prince holds jetpack straps"
    );
    state.weaponFireKey.isDown = false;
    state.toggleJetpack();
    await collectWeapon(state.minigun);
    state.selectWeapon("minigun");
    check(
      state.kid.minigunEquipped && !state.kid.rocketLauncherEquipped,
      "Weapon selection draws only the selected weapon"
    );
    const oldGun = state.minigun;
    state = await freshLevel(1);
    check(oldGun.destroyed && oldGun.bullets.length === 0, "Restart cleans up old weapon and projectiles");
    check(!state.kid.hasMinigun && !state.minigun.pickup.collected, "Restart restores the ground pickup");
    report("ALL BROWSER CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    if (gameState().minigun) {
      gameState().minigun.fireKey.isDown = false;
    }
    busy = false;
  }
}

async function preview() {
  await ready();
  const state = await freshLevel(1);
  quietEnemies(state);
  if (!state.kid.hasMinigun) {
    await collectWeapon(state.minigun);
  }
  placeKid(21, 49, 0, 1);
  if (!state.kid.minigunEquipped) {
    state.minigun.toggleEquipped();
  }
  state.minigun.fireKey.isDown = true;
  state.weaponAudio.unlock();
  await pause(650);
  output.textContent = "Sustained fire preview. Hold Ctrl or F to fire; Shift keeps slow steps and ledge grabs.";
}

async function freshLevel(number) {
  const state = gameState();
  const expected =
    state.level.number < number
      ? state.level.number + 1
      : state.level.number > number
        ? state.level.number - 1
        : number;
  // Skip cutscenes with one state transition, so a second reset cannot remove the new world's timer.
  const reset = state.reset;
  state.reset = function () {
    reset.call(this, true);
  };
  try {
    if (state.level.number < number) {
      state.nextLevel(undefined, true, true);
    } else if (state.level.number > number) {
      state.previousLevel(undefined, true);
    } else {
      state.restartLevel(true);
    }
  } finally {
    state.reset = reset;
  }
  for (let i = 0; i < 60; i++) {
    await pause(100);
    if (testGame.state.current === "Game" && gameState().level && gameState().level.number === expected) {
      await pause(900);
      await settleOpeningIntro();
      testGame.input.reset(false);
      if (expected !== number) {
        return freshLevel(number);
      }
      return gameState();
    }
  }
  throw new Error("Mission " + number + " did not load");
}

async function loadMission(number) {
  const loaded = new Promise((resolve) => gameFrame.addEventListener("load", resolve, { once: true }));
  gameFrame.src = "../index.html?level=" + number + "&width=800";
  await loaded;
  await ready();
  return gameState();
}

async function campaignChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    for (const number of [...Array.from({ length: 14 }, (_, i) => i + 1), 99]) {
      const state = await loadMission(number);
      const guards = state.enemies.filter((enemy) => enemy.reinforcement);
      check(
        guards.length > 0 && guards.every((enemy) => Number.isFinite(enemy.health) && enemy.health > 0),
        "Level " + number + " has " + guards.length + " real reinforcements with valid health"
      );
      check(
        state.kid.hasMolotov === number >= 2 &&
          state.kid.hasMinigun === number >= 2 &&
          state.kid.hasRocketLauncher === number >= 4 &&
          state.kid.hasWhip === number >= 3 &&
          state.kid.hasTwinTorches,
        "Level " + number + " grants the correct weapons immediately"
      );
      check(
        !!state.molotov && !!state.rocketLauncher === number >= 2,
        "Level " + number + " has the correct controllers"
      );
      check(
        state.kid.hasJetpack === number >= 13 &&
          !state.jetpack.active &&
          !state.kid.jetpackEquipped &&
          !!state.jetpack.pickup === (number === 12) &&
          state.jetpack.effects.pickupGraphic.visible === (number === 12),
        "Level " + number + " starts with the correct jetpack ownership and pickup"
      );
      if (number >= 2) {
        check(
          state.kid.activeWeapon === "twinTorches" &&
            state.weapons.every(
              (weapon) =>
                !weapon.pickup ||
                (weapon.pickup.collected === !!state.kid[weapon.spec.owned] &&
                  weapon.effects.ground.visible === !state.kid[weapon.spec.owned])
            ),
          "Level " + number + " selects torches and only shows the pickups still needed"
        );
      }
      state.ui.showRemainingMinutes(true);
      check(
        state.ui.text.text === "600 MINUTES LEFT" &&
          new URLSearchParams(gameFrame.contentWindow.location.search).get("time") === "600",
        "Level " + number + " displays and saves the full 600-minute clock"
      );
    }
    const state = await loadMission(4);
    quietEnemies(state);
    const keys = gameFrame.contentWindow.Phaser.Keyboard;
    for (const [code, id] of [
      [keys.ONE, "twinTorches"],
      [keys.TWO, "molotov"],
      [keys.THREE, "minigun"],
      [keys.FOUR, "rocketLauncher"]
    ]) {
      testGame.input.keyboard.addKey(code).onDown.dispatch();
      check(state.kid.activeWeapon === id, "Key " + String.fromCharCode(code) + " selects the owned " + id);
    }
    testGame.input.keyboard.addKey(keys.FIVE).onDown.dispatch();
    check(state.kid.activeWeapon === "rocketLauncher", "Key 5 no longer selects a whip");
    state.whipKey.onDown.dispatch();
    check(
      state.whip.actionStage === "drawing" && state.kid.activeWeapon === "rocketLauncher",
      "A quick X key event starts the whip without changing the selected launcher"
    );
    for (let i = 0; i < 80 && state.kid.specialAction; i++) {
      await pause(25);
    }
    check(state.whip.actionStage === "hidden", "The X tap completes one swing and stows the whip");
    const oldWhip = state.whip;
    const oldWeapons = [...state.weapons];
    await freshLevel(4);
    check(
      oldWeapons.every((weapon) => weapon.destroyed) &&
        oldWhip.destroyed &&
        gameState().whip !== oldWhip &&
        gameState().kid.hasWhip &&
        gameState().weapons.every((weapon) => !weapon.pickup || weapon.pickup.collected),
      "Restart cleans up controllers and restores all level-four weapons"
    );
    report("ALL CAMPAIGN LOADOUT AND CLOCK CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    busy = false;
  }
}

async function jetpackProgressionChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  let savedKeys;
  try {
    for (const number of [1, 11]) {
      const state = await loadMission(number);
      quietEnemies(state);
      testGame.input.keyboard.addKey(gameFrame.contentWindow.Phaser.Keyboard.J).onDown.dispatch();
      check(
        !state.kid.hasJetpack && !state.jetpack.active && !state.jetpack.pickup,
        "J cannot activate an unavailable jetpack in level " + number
      );
    }
    let state = await loadMission(12);
    quietEnemies(state);
    const pickup = state.jetpack.pickup;
    const startRoom = state.level.rooms[state.kid.room];
    check(
      pickup &&
        pickup.room === state.kid.room &&
        Math.abs(pickup.worldX - state.kid.baseX - (state.kid.charX * 320) / 140) < 80 &&
        pickup.worldY === startRoom.y * 189 + 182 &&
        state.jetpack.effects.pickupGraphic.visible &&
        !state.kid.hasJetpack,
      "The uncollected jetpack is clearly visible beside the native level-twelve start"
    );
    const jKey = testGame.input.keyboard.addKey(gameFrame.contentWindow.Phaser.Keyboard.J);
    jKey.onDown.dispatch();
    check(!state.jetpack.active, "J stays blocked before collecting the level-twelve pickup");
    await walkUntil(
      () => state.kid.hasJetpack,
      "Walking from the actual start collects the nearby jetpack",
      Math.sign(pickup.worldX - state.kid.baseX - (state.kid.charX * 320) / 140)
    );
    check(
      pickup.collected && !state.jetpack.effects.pickupGraphic.visible && !state.jetpack.active,
      "Collection hides the pickup and leaves the pack unequipped"
    );
    const startY = state.kid.baseY + state.kid.charY;
    jKey.onDown.dispatch();
    savedKeys = { kid: state.kid, keyU: state.kid.keyU };
    state.kid.keyU = () => true;
    await pause(650);
    check(
      state.jetpack.active && state.kid.specialAction && state.kid.specialAction.owner === state.jetpack,
      "The actual J binding equips the collected jetpack"
    );
    check(state.kid.baseY + state.kid.charY < startY - 8, "Up flies above the starting floor");
    check(
      state.jetpack.effects.pack.visible && state.jetpack.effects.grip.visible && state.jetpack.effects.head.visible,
      "Flight reuses the original steel pack and both strap grips"
    );
    state.kid.keyU = savedKeys.keyU;
    savedKeys = null;
    await pause(200);
    const hoverY = state.kid.baseY + state.kid.charY;
    const shots = state.minigun.effects.shots;
    state.weaponCtrlKey.isDown = true;
    state.weaponCtrlKey.onDown.dispatch();
    await pause(200);
    check(
      Math.abs(state.kid.baseY + state.kid.charY - hoverY) < 5 && state.minigun.effects.shots === shots,
      "Hover remains stable and holding the straps prevents firing"
    );
    state.weaponCtrlKey.isDown = false;
    jKey.onDown.dispatch();
    await pause(700);
    check(
      !state.jetpack.active && !state.kid.specialAction && state.kid.alive,
      "J removes the pack for a safe landing"
    );
    const oldPack = state.jetpack;
    state = await freshLevel(12);
    quietEnemies(state);
    check(
      oldPack.destroyed && !state.kid.hasJetpack && state.jetpack.effects.pickupGraphic.visible,
      "Restarting level twelve cleans up flight and restores its pickup"
    );
    for (const number of [13, 14, 99]) {
      state = await loadMission(number);
      quietEnemies(state);
      check(
        state.kid.hasJetpack && !state.jetpack.active && !state.jetpack.pickup && !state.kid.jetpackEquipped,
        "Level " + number + " grants the jetpack immediately without starting flight"
      );
      testGame.input.keyboard.addKey(gameFrame.contentWindow.Phaser.Keyboard.J).onDown.dispatch();
      check(state.jetpack.active, "J can immediately equip the automatic level " + number + " jetpack");
    }
    state = await loadMission(13);
    state = await freshLevel(13);
    check(state.kid.hasJetpack && !state.jetpack.active, "Restart retains automatic ownership with the pack removed");
    report("ALL JETPACK PROGRESSION CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    if (savedKeys) {
      savedKeys.kid.keyU = savedKeys.keyU;
    }
    gameState().weaponFireKey.isDown = gameState().weaponCtrlKey.isDown = false;
    busy = false;
  }
}

async function wallFireChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    const state = await loadMission(1);
    quietEnemies(state);
    await collectWeapon(state.molotov);
    placeKid(1, 56, 1, 1);
    const wall = state.level.getTileAt(5, 1, 1);
    const room = state.level.rooms[1];
    state.weaponCtrlKey.isDown = true;
    state.weaponCtrlKey.onDown.dispatch();
    await pause(80);
    check(state.molotov.throwState.phase === "charging", "A ground throw still charges until release");
    state.weaponCtrlKey.isDown = false;
    state.weaponCtrlKey.onUp.dispatch();
    for (let i = 0; i < 60 && !state.molotov.fires.some((fire) => fire.kind === "wall"); i++) {
      await pause(30);
    }
    const attached = state.molotov.fires.find((fire) => fire.kind === "wall");
    check(
      attached && attached.tile === wall && attached.normalX === -1 && attached.x === room.x * 320 + 160,
      "The actual thrown bottle ignites the exposed native wall face"
    );
    check(state.molotov.oils.length > 0, "Burning oil falls from the wall impact");
    for (let i = 0; i < 60 && !state.molotov.fires.some((fire) => fire.kind !== "wall"); i++) {
      await pause(30);
    }
    check(
      state.molotov.fires.some(
        (fire) =>
          fire.kind !== "wall" &&
          fire.room === 1 &&
          fire.column === 4 &&
          fire.row === 2 &&
          fire.y === room.y * 189 + 182
      ),
      "The oil falls through the real gap and burns on the lower floor beneath the wall"
    );
    check(state.molotov.fires.includes(attached), "The wall and lower floor burn together");
    report("ALL MOLOTOV WALL FIRE CHECKS PASSED");
    testGame.paused = true;
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    if (gameState().weaponCtrlKey) {
      gameState().weaponCtrlKey.isDown = false;
    }
    busy = false;
  }
}

async function blastExit(state) {
  await collectWeapon(state.rocketLauncher);
  state.selectWeapon("rocketLauncher");
  const door = state.level.exitDoors.find((item) => item.room === 6);
  placeKid(6, 42, 2, 1);
  await fireUntil(() => door.destroyedByRocket, "A real rocket shatters the next-level exit");
  check(
    door.open && state.level.exitDoorOpen && door.damageAnimation.fragments.length === 16,
    "The blasted door is open with native fragments and its level trigger intact"
  );
  const before = door.damageAnimation.fragments.map((fragment) => fragment.sprite.y);
  await pause(240);
  check(
    door.damageAnimation.fragments.some((fragment, i) => fragment.sprite.y !== before[i]),
    "Door fragments fly during the destruction animation"
  );
  await pause(1800);
  check(
    door.damageAnimation.fragments.every((fragment) => fragment.settled) && door.damagedFacade.visible,
    "Fragments settle beside the permanently damaged facade"
  );
  return door;
}

async function exitDoorChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  let impact;
  let state;
  let keyU;
  let reset;
  try {
    state = await loadMission(3);
    quietEnemies(state);
    await collectWeapon(state.rocketLauncher);
    state.selectWeapon("rocketLauncher");
    const entrance = state.level.entranceDoors[0];
    check(
      entrance.room === 9 && entrance.leftTile.doorRole === "entrance" && entrance.doorRole === "entrance",
      "Both halves of the real arrival door are identified as the entrance"
    );
    placeKid(9, 28, 2, 1);
    await pause(700);
    impact = state.rocketLauncher.impact;
    let entranceHits = 0;
    state.rocketLauncher.impact = function (rocket, enemy, obstacle) {
      if (obstacle === entrance || obstacle === entrance.leftTile) {
        entranceHits++;
      }
      return impact.call(this, rocket, enemy, obstacle);
    };
    await fireUntil(() => entranceHits > 0, "A real rocket strikes the closed arrival door");
    state.rocketLauncher.impact = impact;
    check(
      !entrance.destroyedByRocket && !entrance.damageAnimation && !state.level.exitDoorOpen,
      "Arrival-door panels and the next-level trigger remain unchanged after the explosion"
    );
    await pause(400);
    const door = await blastExit(state);
    const settled = JSON.stringify(
      door.damageAnimation.fragments.map(({ sprite }) => [sprite.x, sprite.y, sprite.angle])
    );
    placeKid(9, 28, 2, 1);
    await pause(200);
    placeKid(6, 42, 2, 1);
    await pause(200);
    check(
      JSON.stringify(door.damageAnimation.fragments.map(({ sprite }) => [sprite.x, sprite.y, sprite.angle])) ===
        settled,
      "The damaged doorway and settled pieces persist after leaving and returning"
    );
    placeKid(6, 56, 2, 1);
    keyU = state.kid.keyU;
    reset = state.reset;
    // Keep the native stair/level transition and skip only its story cutscene.
    state.reset = function () {
      reset.call(this, true);
    };
    state.kid.keyU = () => true;
    for (
      let i = 0;
      i < 350 && !(testGame.state.current === "Game" && gameState().level && gameState().level.number === 4);
      i++
    ) {
      await pause(60);
    }
    check(
      gameState().level && gameState().level.number === 4,
      "Up uses the real broken stairs and advances to level four"
    );
    report("ALL ROCKET EXIT DOOR CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
    if (state) {
      report(
        JSON.stringify({
          room: state.kid.room,
          x: state.kid.charX,
          y: state.kid.charY,
          action: state.kid.action,
          health: state.kid.health
        })
      );
    }
  } finally {
    if (state) {
      state.rocketLauncher.impact = impact || state.rocketLauncher.impact;
      state.weaponFireKey.isDown = state.weaponCtrlKey.isDown = false;
      if (keyU) {
        state.kid.keyU = keyU;
      }
      if (reset) {
        state.reset = reset;
      }
    }
    busy = false;
  }
}

async function fireUntil(predicate, description) {
  const state = gameState();
  state.weaponFireKey.isDown = true;
  for (let i = 0; i < 40 && !predicate(); i++) {
    await pause(50);
  }
  state.weaponFireKey.isDown = false;
  check(predicate(), description);
}

async function collectWeapon(weapon) {
  if (gameState().kid[weapon.spec.owned]) {
    check(
      weapon.pickup.collected && weapon.effects.collected,
      "The " + weapon.spec.id + " is already available without collecting"
    );
    return;
  }
  const room = gameState().level.rooms[weapon.pickup.room];
  const x = ((weapon.pickup.worldX - room.x * 320) * 140) / 320;
  const row = Math.floor((weapon.pickup.worldY - room.y * 189) / 63);
  placeKid(weapon.pickup.room, x, row, 1);
  await pause(650);
  check(
    gameState().kid[weapon.spec.owned],
    "Walking over the " + weapon.spec.id + (weapon.spec.id === "whip" ? " unlocks X" : " equips it")
  );
}

async function collectJetpack(state) {
  if (state.kid.hasJetpack) {
    return;
  }
  const pickup = state.jetpack.pickup;
  const room = state.level.rooms[pickup.room];
  placeKid(
    pickup.room,
    ((pickup.worldX - room.x * 320) * 140) / 320,
    Math.floor((pickup.worldY - room.y * 189) / 63),
    1
  );
  await pause(500);
  check(state.kid.hasJetpack && !state.jetpack.active, "The level-twelve ground pickup enables the jetpack");
}

async function jumpToFirstLanding(state) {
  const kid = state.kid;
  const keyR = kid.keyR;
  const keyU = kid.keyU;
  placeKid(1, 42, 1, 1);
  kid.keyR = kid.keyU = () => true;
  try {
    await pause(160);
    kid.keyR = keyR;
    kid.keyU = keyU;
    for (let i = 0; i < 60 && (kid.charBlockY !== 2 || kid.inFallDown || kid.inJumpUp) && kid.alive; i++) {
      await pause(50);
    }
    check(
      kid.alive && kid.charBlockY === 2 && !kid.hasMinigun,
      "The first real jump lands on the starting screen's lower platform without a gun " +
        JSON.stringify({ x: kid.charX, y: kid.charY, action: kid.action })
    );
  } finally {
    kid.keyR = keyR;
    kid.keyU = keyU;
  }
}

async function prepareOpeningEncounter() {
  const state = await freshLevel(1);
  const kid = state.kid;
  const pickup = state.molotov.pickup;
  const room = state.level.rooms[pickup.room];
  const row = Math.floor((pickup.worldY - room.y * 189) / 63);
  placeKid(pickup.room, ((pickup.worldX - room.x * 320) * 140) / 320, row, 1);
  await pause(450);
  check(
    kid.hasTwinTorches && kid.hasMolotov && !kid.hasMinigun,
    "Torches and molotov are available before the first gun"
  );
  await jumpToFirstLanding(state);
  await walkUntil(() => kid.charX >= 105, "Crossing the loose floor reaches the safe ledge beside the shaft");
  for (let i = 0; i < 30 && state.level.getTileAt(6, 2, 1).element !== 0; i++) {
    await pause(80);
  }
  check(state.level.getTileAt(6, 2, 1).element === 0, "The real loose board opens the shaft into room two");
  // Align the native standing feet with tile seven before the ledge animation.
  placeKid(1, 115, 2, 1);
  const keyS = kid.keyS;
  kid.keyS = () => true;
  try {
    kid.climbdown();
    for (let i = 0; i < 35 && !["hang", "hangstraight"].includes(kid.action); i++) {
      await pause(80);
    }
    check(
      ["hang", "hangstraight"].includes(kid.action),
      "The Prince hangs above the first encounter using a real climb-down"
    );
    const targets = state.enemies.filter((enemy) => enemy.room === state.minigun.pickup.room);
    check(
      targets.length === 2 && targets.every((enemy) => enemy.alive && enemy.health === 2),
      "Only two guards wait under the drop"
    );
    check(
      targets.every((enemy) => enemy.opponent !== kid || !enemy.startFight),
      "Guards on the lower floor do not hunt the hanging Prince above them"
    );
    return { state, targets, keyS };
  } catch (error) {
    kid.keyS = keyS;
    throw error;
  }
}

async function openingChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  let prepared;
  let soundPlay;
  try {
    await ready();
    prepared = await prepareOpeningEncounter();
    const { state, targets } = prepared;
    const heard = [];
    soundPlay = testGame.sound.play;
    testGame.sound.play = function (key, ...args) {
      heard.push(key);
      return soundPlay.call(this, key, ...args);
    };
    state.weaponCtrlKey.isDown = true;
    state.weaponCtrlKey.onDown.dispatch();
    await pause(100);
    check(
      state.molotov.throwState && state.molotov.throwState.phase === "throwing" && !state.kid.hasMinigun,
      "Pressing Ctrl starts the original hanging ignition and downward throw immediately"
    );
    state.weaponCtrlKey.isDown = false;
    state.weaponCtrlKey.onUp.dispatch();
    check(state.molotov.throwState.phase === "throwing", "Releasing Ctrl does not cancel the hanging throw");
    for (let i = 0; i < 40 && !state.molotov.fires.length; i++) {
      await pause(60);
    }
    check(
      state.molotov.fires.some((fire) => fire.room === state.minigun.pickup.room),
      "The bottle lands on the actual lower-room floor"
    );
    for (let i = 0; i < 100 && targets.some((enemy) => enemy.alive); i++) {
      await pause(60);
    }
    check(
      targets.every((enemy) => !enemy.alive && enemy.health === 0 && enemy.burningDeath),
      "The dropped molotov immediately kills and ignites both real guards in the room below"
    );
    await pause(500);
    check(!heard.some((key) => ["Victory", "JaffarDead"].includes(key)), "Enemy deaths play no kill jingle");
    state.kid.keyS = prepared.keyS;
    state.kid.shiftKey.isDown = false;
    for (
      let i = 0;
      i < 60 && (state.kid.room !== 2 || state.kid.inFallDown || /hang|fall|land/.test(state.kid.action));
      i++
    ) {
      await pause(60);
    }
    check(
      state.kid.alive && state.kid.room === 2 && state.kid.charBlockY === 1,
      "Releasing the ledge lands safely beside the right-hand minigun"
    );
    // This ledge route now lands within the right-hand pickup's native radius.
    // The earlier assertion ensures it was not collected while still hanging.
    check(
      state.kid.hasMinigun && state.minigun.pickup.collected,
      "The nearby minigun is collected upon landing, after the molotov encounter"
    );
    check(!state.minigun.effects.weapon.visible, "The collected gun stays hidden until firing");
    const shots = state.minigun.effects.shots;
    state.weaponCtrlKey.isDown = true;
    await pause(850);
    state.weaponCtrlKey.isDown = false;
    check(state.minigun.effects.shots > shots, "Ctrl now draws and fires the newly collected minigun");
    await pause(400);
    report("ALL OPENING PROGRESSION CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
    if (prepared) {
      const kid = prepared.state.kid;
      report(
        JSON.stringify({
          health: kid.health,
          alive: kid.alive,
          room: kid.room,
          x: kid.charX,
          y: kid.charY,
          action: kid.action
        })
      );
    }
  } finally {
    if (prepared) {
      prepared.state.kid.keyS = prepared.keyS;
    }
    if (soundPlay) {
      testGame.sound.play = soundPlay;
    }
    gameState().weaponCtrlKey.isDown = false;
    busy = false;
  }
}

async function openingPreview() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  let prepared;
  try {
    await ready();
    prepared = await prepareOpeningEncounter();
    await watchCamera(prepared.state, () => !prepared.state.roomCamera.transition);
    testGame.paused = true;
    report(
      "Opening: two torches are collected automatically, the molotov stays upstairs, and the glowing minigun waits beside two guards below. Hold Shift to keep hanging, select 2 and press Ctrl to drop a bottle. Keys 1/2/3/4 select torches/molotov/minigun/rockets; X uses the whip."
    );
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    if (prepared) {
      prepared.state.kid.keyS = prepared.keyS;
    }
    busy = false;
  }
}

async function walkUntil(predicate, description, direction = 1) {
  const kid = gameState().kid;
  const key = direction === -1 ? "keyL" : "keyR";
  const originalKey = kid[key];
  kid[key] = () => true;
  try {
    for (let i = 0; i < 80 && !predicate(); i++) {
      await pause(50);
    }
    check(predicate(), description);
  } finally {
    kid[key] = originalKey;
  }
  await pause(300);
}

async function pickupChecks(previewLevel = 0) {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    let state = await loadMission(previewLevel || 1);
    quietEnemies(state);
    if (previewLevel) {
      if (previewLevel === 1) {
        placeKid(2, 70, 1, 1);
      }
      await watchCamera(state, () => !state.roomCamera.transition);
      await pause(100);
      testGame.paused = true;
      report(
        previewLevel === 1
          ? "Minigun on the right, on clear floor between the columns."
          : "Launcher on the left of the arrival doors; whip on the right."
      );
      return;
    }
    let pickup = state.minigun.pickup;
    let room = state.level.rooms[2];
    check(
      pickup.room === 2 && pickup.worldX === room.x * 320 + 240 && state.level.getTileAt(7, 1, 2).element === 1,
      "Level-one minigun is on clear right-hand floor, outside the columns"
    );
    state = await loadMission(2);
    quietEnemies(state);
    pickup = state.rocketLauncher.pickup;
    room = state.level.rooms[5];
    check(
      !state.kid.hasRocketLauncher &&
        pickup.room === 5 &&
        pickup.worldX === room.x * 320 + 48 &&
        state.rocketLauncher.effects.ground.visible,
      "Level-two launcher is visible on the left of the starting doors"
    );
    check(!state.kid.hasWhip && state.whip.effects.ground.visible, "The whip remains available beside the same doors");
    await walkUntil(() => state.kid.hasRocketLauncher, "Walking left from the real start collects the launcher", -1);
    check(
      state.kid.activeWeapon === "rocketLauncher" && !state.rocketLauncher.effects.ground.visible,
      "The collected launcher is usable and its pickup disappears"
    );
    state = await freshLevel(3);
    check(
      state.kid.hasRocketLauncher && !state.rocketLauncher.effects.ground.visible,
      "Level progression retains the collected launcher"
    );
    state = await freshLevel(3);
    check(state.kid.hasRocketLauncher, "Restarting level three retains equipment brought into it");
    state = await loadMission(3);
    check(
      !state.kid.hasRocketLauncher && state.rocketLauncher.effects.ground.visible,
      "A fresh level-three start still offers the fallback pickup"
    );
    report("ALL PICKUP AND CARRY-OVER CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    busy = false;
  }
}

async function brassChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    const state = await loadMission(3);
    quietEnemies(state);
    state.selectWeapon("minigun");
    placeKid(13, 70, 2, 1);
    await watchCamera(state, () => !state.roomCamera.transition);
    const effects = state.minigun.effects;
    const muzzle = effects.getMuzzle();
    const emit = (count) => {
      for (let i = 0; i < count; i++) {
        effects.shot(muzzle.x, muzzle.y, muzzle.direction);
      }
    };
    const cachePixels = () =>
      (effects.casingRooms[13]?.batches || []).map((batch) => {
        const canvas = batch.graphics._cachedSprite && batch.graphics._cachedSprite.buffer.canvas;
        check(canvas && canvas.width > 1 && canvas.height > 1, "A settled batch has a nonempty bitmap");
        const bytes = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        let pixels = 0,
          hash = 2166136261;
        for (let i = 0; i < bytes.length; i++) {
          hash = Math.imul(hash ^ bytes[i], 16777619) >>> 0;
          if (i % 4 === 3 && bytes[i]) {
            pixels++;
          }
        }
        return { pixels, hash, width: canvas.width, height: canvas.height };
      });
    emit(160);
    await pause(180);
    placeKid(5, 35, 2, 1);
    await pause(3400);
    const away = cachePixels();
    check(
      away.length === 10 && away.every((batch) => batch.pixels > 0),
      "Every depth still contains actual brass pixels after settling offscreen"
    );
    const count = effects.casings.length;
    placeKid(13, 70, 2, 1);
    await watchCamera(state, () => !state.roomCamera.transition);
    const returned = cachePixels();
    check(
      JSON.stringify(returned) === JSON.stringify(away) && effects.casings.length === count,
      "Returning preserves the exact cached pixels and every casing"
    );
    emit(20);
    await pause(120);
    placeKid(5, 35, 2, 1);
    await pause(3400);
    check(
      effects.casings.length > count && cachePixels().every((batch) => batch.pixels > 0),
      "Adding more brass and leaving again cannot blank the growing pile"
    );
    placeKid(13, 70, 2, 1);
    await watchCamera(state, () => !state.roomCamera.transition);
    await pause(100);
    testGame.paused = true;
    report("ALL PERSISTENT BRASS PIXEL CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    busy = false;
  }
}

async function burningAudioChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  const state = gameState();
  try {
    check(testAudio.checked, "Sound was explicitly enabled for this audio test");
    testGame.paused = false;
    state.weaponAudio.unlock();
    for (let i = 0; i < 30 && testGame.sound.context && testGame.sound.context.state !== "running"; i++) {
      await pause(20);
    }
    check(
      !testGame.sound.usingWebAudio || testGame.sound.context.state === "running",
      "Audio is unlocked by the test button gesture"
    );
    quietEnemies(state);
    placeKid(2, 70, 1, 1);
    await watchCamera(state, () => !state.roomCamera.transition);
    const guards = state.enemies.filter((enemy) => enemy.alive && enemy.baseCharName === "guard").slice(0, 6);
    guards.forEach((enemy, i) => {
      placeGuard(enemy, 2, 12 + i, i % 2 ? 1 : -1);
      state.burningEnemyEffects.ignite(enemy);
    });
    let peak = 0;
    for (let i = 0; i < 115; i++) {
      await pause(50);
      const voices = state.weaponAudio.burningVoices.filter((voice) => voice.sound.isPlaying);
      peak = Math.max(peak, voices.length);
      if (voices.length > 2) {
        throw new Error("More than two overlapping burning screams");
      }
    }
    check(peak === 2, "Six burning guards use at most two simultaneous real audio voices");
    check(
      state.weaponAudio.burningVoices.every((voice) => !voice.sound.isPlaying && !voice.burn),
      "All voices stop when the burns finish"
    );
    report("ALL BURNING AUDIO CHECKS PASSED — SOUND MUTED AGAIN");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    testAudio.checked = false;
    testGame.sound.mute = true;
    state.weaponAudio.stopBurning();
    busy = false;
  }
}

async function featureChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    await ready();
    for (const number of [1, 2]) {
      const state = await freshLevel(number);
      await pause(1500);
      const spawnRoom = testGame.cache.getJSON("level").prince.room;
      check(state.enemies.length >= 100, "Mission " + number + " has " + state.enemies.length + " soldiers");
      check(
        state.enemies.filter((enemy) => enemy.reinforcement).every((enemy) => enemy.alive),
        "Mission " + number + " reinforcements keep safe footing before combat"
      );
      check(!state.enemies.some((enemy) => enemy.room === spawnRoom), "Mission " + number + " spawn room is clear");
      check(!state.kid.hasSword && !state.kid.sword.visible, "Mission " + number + " starts without a sword");
      check(state.kid.alive && state.minigun.pickup, "Minigun is available safely");
      check(!!state.rocketLauncher === number >= 2, "Rocket launcher becomes collectible from mission two");
      check(state.kid.health === 10 && state.ui.playerHPActive === 10, "Mission starts with ten health points");
      if (number === 1) {
        state.kid.stabbed();
        await pause(500);
        check(
          state.kid.health === 9 && state.ui.playerHPActive === 9 && state.kid.alive,
          "An unarmed stab removes exactly one health point"
        );
        check(state.kid.action === "stand" && !state.kid.swordDrawn, "The Prince recovers to ordinary movement");
      }
    }
    let state = gameState();
    // Keep collision and animation real, but let this controlled fixture survive the crowd.
    state.kid.damageLife = () => {};
    placeKid(11, 70, 1, 1);
    await pause(900);
    const fighters = state.enemies.filter((enemy) => enemy.room === 11 && enemy.opponent === state.kid);
    check(fighters.length > 1, "Multiple soldiers in the room simultaneously track the Prince");
    check(!state.kid.swordDrawn && !state.kid.sword.visible, "Nearby soldiers cannot activate the Prince's sword");
    state.kid.engarde();
    state.kid.strike();
    check(!state.kid.swordDrawn && state.kid.action !== "strike", "Direct sword actions remain disabled");

    // Isolate terrain checks from enemy damage and projectile interception.
    state = await loadMission(3);
    quietEnemies(state);
    await collectWeapon(state.rocketLauncher);
    state.selectWeapon("rocketLauncher");
    placeKid(5, 35, 2, 1);
    check(state.level.getTileAt(3, 2, 5).element === 20, "Wall initially blocks the corridor");
    await fireUntil(
      () => state.level.getTileAt(3, 2, 5).element !== 20,
      "A real rocket turns the wall into an opening"
    );
    check(state.level.getTileAt(3, 2, 5).isWalkable(), "Destroyed wall retains a walkable floor");
    await walkUntil(() => state.kid.charX > 49, "The Prince runs through the destroyed wall");
    placeKid(13, 70, 2, 1);
    placeKid(5, 35, 2, 1);
    check(!state.level.getTileAt(3, 2, 5).isBarrier(), "Wall opening persists after a room change");

    placeKid(2, 119, 0, 1);
    check(state.level.getTileAt(9, 0, 2).element === 4, "Gate initially exists");
    state.level.getTileAt(9, 0, 2).drop();
    await pause(600);
    await fireUntil(() => state.level.getTileAt(9, 0, 2).element !== 4, "A real rocket destroys the gate");
    await walkUntil(() => state.kid.charX > 133, "The Prince runs through the destroyed gate");

    const exit = state.level.getTileAt(4, 2, 6);
    placeKid(6, 42, 2, 1);
    check(!exit.open, "Level exit starts closed");
    await fireUntil(() => exit.open, "Rockets open the exit door while retaining the level exit");

    await collectWeapon(state.minigun);
    state.selectWeapon("minigun");
    placeKid(13, 70, 2, 1);
    const effects = state.minigun.effects;
    const muzzle = effects.getMuzzle();
    for (let i = 0; i < 300; i++) {
      effects.shot(muzzle.x, muzzle.y, muzzle.direction);
      effects.update(1 / 60, false);
    }
    for (let i = 0; i < 500; i++) {
      effects.update(1 / 60, false);
    }
    const layers = new Set(effects.casings.map((casing) => casing.depthLayer));
    check(layers.size === 10, "Spent casings occupy all ten floor-depth layers");
    check(effects.casings.length >= 900, "The large pile retains every emitted casing");
    const settled = effects.casings.filter((casing) => casing.settled);
    check(settled.length >= 850, "Ten-layer casings settle into persistent cached piles");
    const shellCount = effects.casings.length;
    const settledCount = effects.casingRooms[13].settled.length;
    placeKid(5, 35, 2, 1);
    await pause(200);
    placeKid(13, 70, 2, 1);
    check(effects.casings.length === shellCount, "No shells disappear when returning to the room");
    check(effects.casingRooms[13].settled.length >= settledCount, "Every settled depth layer survives room travel");
    report("ALL HORDE AND DESTRUCTION CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    if (gameState().weaponFireKey) {
      gameState().weaponFireKey.isDown = false;
    }
    busy = false;
  }
}

function quietEnemies(state) {
  for (const enemy of state.enemies) {
    enemy.setInactive();
    enemy.setInvisible();
  }
}

function arrangeGoreTargets(state, room, row, positions, health = 1) {
  const targets = state.enemies
    .filter((enemy) => enemy.alive && enemy.baseCharName === "guard")
    .slice(0, positions.length);
  state.hordeEnabled = false;
  targets.forEach((enemy, i) => {
    enemy.room = room;
    enemy.charX = positions[i];
    enemy.charY = (row + 1) * 63 - 10;
    enemy.charXVel = enemy.charYVel = 0;
    enemy.charBlockX = Math.floor((positions[i] - 7) / 14);
    enemy.charBlockY = row;
    enemy.inFallDown = enemy.inJumpUp = false;
    if (enemy.charFace !== -1) {
      enemy.changeFace();
    }
    enemy.action = "stand";
    enemy.health = health;
    enemy.swordDrawn = false;
    enemy.updateBehaviour = () => {};
    enemy.fixtureDeathSignals = 0;
    enemy.onDead.add(() => enemy.fixtureDeathSignals++);
    enemy.setActive();
    enemy.updateBase();
    enemy.processCommand();
    enemy.updateCharPosition();
    enemy.updateSwordPosition();
  });
  return targets;
}

async function prepareGore(weapon, positions) {
  await ready();
  const state = await freshLevel(weapon === "minigun" ? 1 : 3);
  quietEnemies(state);
  state.kid.damageLife = () => {};
  await collectWeapon(state[weapon]);
  state.selectWeapon(weapon);
  const room = weapon === "minigun" ? 2 : 13;
  const row = weapon === "minigun" ? 1 : 2;
  placeKid(room, 28, row, 1);
  state.enemyDeathEffects.variantOffset = 0;
  const targets = arrangeGoreTargets(state, room, row, positions);
  return { state, targets };
}

async function shootGoreTargets(state, targets) {
  state.weaponFireKey.isDown = true;
  for (let i = 0; i < 100 && targets.some((enemy) => enemy.alive); i++) {
    await pause(40);
  }
  state.weaponFireKey.isDown = false;
  check(
    targets.every((enemy) => !enemy.alive),
    "Real shots kill every staged guard"
  );
}

async function goreChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    let { state, targets } = await prepareGore("minigun", [63, 77, 91, 105, 119]);
    await shootGoreTargets(state, targets);
    check(
      new Set(state.enemyDeathEffects.deaths.map((death) => death.variant)).size === 5,
      "Minigun produces five distinct death animations"
    );
    check(
      state.enemyDeathEffects.parts.some((part) => part.part === "head") &&
        state.enemyDeathEffects.parts.some((part) => part.part === "arm"),
      "Severed heads and arms use the native guard sprites"
    );
    await pause(3400);
    check(
      targets.every((enemy) => enemy.fixtureDeathSignals === 1),
      "Each original death callback still fires exactly once"
    );
    check(
      targets.every((enemy) => enemy.alpha === 0 && enemy.sword.alpha === 0),
      "Native bodies and swords do not duplicate custom corpses"
    );
    check(
      state.bloodEffects.stainCount > 25 && state.bloodEffects.decalRooms.size > 0,
      "Blood impacts leave persistent floor and wall stains"
    );
    check(
      state.bloodEffects.depthCounts.filter((count) => count > 0).length === 10,
      "Blood settles across all ten floor depth layers"
    );
    check(state.bloodEffects.foregroundStainCount > 0, "Nearby foreground masonry catches blood drips");
    check(state.bloodEffects.masonryCounts.pillar > 0, "Blood spatters the walk-through pillar faces");
    check(
      state.bloodEffects.masonryCounts.above > 0 && state.bloodEffects.masonryCounts.below > 0,
      "Blood reaches real masonry both above and below the walking floor"
    );
    const pieces = state.enemyDeathEffects.parts.map((piece) => ({ piece, x: piece.x, y: piece.y }));
    check(
      pieces.every(({ piece }) => piece.settled),
      "All body pieces settle on actual terrain"
    );
    const stains = state.bloodEffects.stainCount;
    const decalLayers = [...state.bloodEffects.decalRooms.values()];
    check(
      decalLayers.every((layer) => layer.sprite.parent === state.level.front) &&
        decalLayers.every((layer) =>
          [...layer.floorDepths.values()].every((depth) => depth.sprite.parent === state.level.back)
        ),
      "Wall and pillar stains render over stone while floor stains stay below actors"
    );
    const bloodImages = decalLayers
      .flatMap((layer) => [layer, ...layer.floorDepths.values()])
      .map((layer) => ({
        layer,
        bitmap: layer.bitmap,
        sprite: layer.sprite,
        revision: layer.revision,
        pixels: layer.bitmap.canvas.toDataURL()
      }));
    placeKid(3, 49, 1, 1);
    await pause(650);
    placeKid(2, 49, 1, -1);
    await pause(650);
    check(
      state.bloodEffects.stainCount === stains && decalLayers.every((layer) => !layer.sprite.destroyed),
      "Blood stains remain after leaving and returning to the room"
    );
    check(
      bloodImages.every(
        ({ layer, bitmap, sprite, revision, pixels }) =>
          layer.bitmap === bitmap &&
          layer.sprite === sprite &&
          layer.revision === revision &&
          layer.bitmap.canvas.toDataURL() === pixels
      ),
      "Every cached blood layer retains identical pixels without repainting"
    );
    check(
      pieces.every(({ piece, x, y }) => piece.x === x && piece.y === y),
      "Settled body pieces remain in their world positions"
    );
    const oldBlood = state.bloodEffects;
    const oldDeaths = state.enemyDeathEffects;
    ({ state, targets } = await prepareGore("rocketLauncher", [70, 84, 98]));
    check(oldBlood.destroyed && oldDeaths.destroyed, "Changing level clears old blood and corpse graphics");
    await shootGoreTargets(state, targets);
    check(
      state.enemyDeathEffects.deaths.length === 3 &&
        state.enemyDeathEffects.deaths.every((death) => death.parts.length === 6),
      "Rocket kills propel six anatomical parts per guard"
    );
    check(
      state.enemyDeathEffects.parts.some((part) => Math.abs(part.vx) > 150 || Math.abs(part.spin) > 2),
      "Explosion pieces fly and spin with visible impulses"
    );
    await pause(3400);
    check(
      state.bloodEffects.stainCount > 25 && state.enemyDeathEffects.parts.every((part) => part.settled),
      "Rocket fragments land and retain blood stains on the environment"
    );
    check(
      targets.every((enemy) => enemy.fixtureDeathSignals === 1),
      "Rocket deaths keep the original callbacks exactly once"
    );
    state = await freshLevel(1);
    check(
      state.bloodEffects.stainCount === 0 && state.enemyDeathEffects.parts.length === 0,
      "Restart restores a clean level"
    );
    report("ALL BLOOD AND DEATH CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    if (gameState().weaponFireKey) {
      gameState().weaponFireKey.isDown = false;
    }
    busy = false;
  }
}

async function deathPreview(weapon, settled = false) {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    const { state, targets } = await prepareGore(weapon, weapon === "minigun" ? [63, 77, 91, 105, 119] : [70, 84, 98]);
    await shootGoreTargets(state, targets);
    await pause(settled ? 3500 : weapon === "minigun" ? 250 : 110);
    testGame.paused = true;
    report(
      settled
        ? "Permanent blood: ten floor depths, irregular splashes and drips on pillars and walls above/below the floor. All stains retain identical pixels when revisiting rooms."
        : weapon === "minigun"
          ? "Five minigun deaths: flying face hit, torn arm, waist split, spinning head and leg collapse. Resume to see fragments land and stains persist."
          : "Rocket blast: native heads, torsos, arms and legs tumble through the corridor with blood trails. Resume to see permanent floor and wall stains."
    );
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    busy = false;
  }
}

async function prepareMolotov() {
  const state = await freshLevel(1);
  quietEnemies(state);
  const pickup = state.molotov.pickup;
  const room = state.level.rooms[pickup.room];
  const row = Math.floor((pickup.worldY - room.y * 189) / 63);
  placeKid(pickup.room, ((pickup.worldX - room.x * 320) * 140) / 320, row, 1);
  await pause(500);
  check(state.kid.hasMolotov, "The bottle on the first starting screen can be collected");
  placeKid(1, 49, 1, -1);
  const keyS = state.kid.keyS;
  state.kid.keyS = () => true;
  state.kid.climbdown();
  for (let i = 0; i < 30 && !["hang", "hangstraight"].includes(state.kid.action); i++) {
    await pause(80);
  }
  check(["hang", "hangstraight"].includes(state.kid.action), "A real climb-down reaches the hanging pose");
  return { state, keyS };
}

async function observeMolotovThrow(state, room, x, hold, up = false, direction = 1) {
  placeKid(room, x, 1, direction);
  state.selectWeapon("molotov");
  const kid = state.kid;
  const keyU = kid.keyU;
  const shatter = state.molotov.effects.shatter;
  const impacts = [];
  let flight;
  state.molotov.effects.shatter = function (impactX, impactY, burning) {
    impacts.push({ x: impactX, y: impactY, burning });
    return shatter.call(this, impactX, impactY, burning);
  };
  try {
    state.weaponCtrlKey.isDown = true;
    state.weaponCtrlKey.onDown.dispatch();
    kid.keyU = () => up;
    const startX = kid.charX;
    await pause(hold);
    check(
      state.molotov.throwState &&
        state.molotov.throwState.phase === "charging" &&
        !state.molotov.throwState.lighterLit &&
        kid.charX === startX,
      "Held molotov stays unlit and keeps the Prince planted"
    );
    const throwState = state.molotov.throwState;
    const launch = state.molotov.effects.getThrowPoint(throwState);
    const charge = throwState.charge;
    state.weaponCtrlKey.isDown = false;
    state.weaponCtrlKey.onUp.dispatch();
    check(
      throwState.phase === "throwing" && throwState.aimUp === up,
      "Release captures aim and begins the lighting sequence"
    );
    for (let i = 0; i < 140 && !impacts.length; i++) {
      await pause(25);
      const bottle = state.molotov.bottles[0];
      if (bottle && !flight) {
        flight = { vx: bottle.vx, aimUp: bottle.aimUp, charge: bottle.charge };
      }
    }
    check(impacts.length === 1, "The real thrown bottle stops at one environment contact");
    for (let i = 0; i < 100 && (kid.specialAction || kid.cropRect || state.molotov.effects.head.visible); i++) {
      await pause(25);
    }
    check(
      !kid.specialAction && !kid.cropRect && !state.molotov.effects.head.visible,
      "Throwing restores the native Prince sprite and movement" +
        (kid.specialAction || kid.cropRect || state.molotov.effects.head.visible
          ? ": " +
            JSON.stringify({
              stage: state.molotov.actionStage,
              action: kid.specialAction && kid.specialAction.type,
              crop: kid.cropRect,
              head: state.molotov.effects.head.visible
            })
          : "")
    );
    return { launch, charge, flight, impact: impacts[0], range: Math.abs(impacts[0].x - launch.x) };
  } finally {
    kid.keyU = keyU;
    state.weaponCtrlKey.isDown = false;
    state.molotov.effects.shatter = shatter;
  }
}

async function chargedMolotovChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    await ready();
    const state = await freshLevel(1);
    quietEnemies(state);
    await collectWeapon(state.molotov);
    check(
      state.kid.activeWeapon === "molotov" && state.weapons[1] === state.molotov,
      "Molotov is the selected second inventory weapon"
    );
    await collectWeapon(state.minigun);
    const keyboard = gameFrame.contentWindow.Phaser.Keyboard;
    testGame.input.keyboard.addKey(keyboard.TWO).onDown.dispatch();
    check(state.kid.molotovEquipped && !state.kid.minigunEquipped, "Number 2 selects molotov exclusively");
    testGame.input.keyboard.addKey(keyboard.THREE).onDown.dispatch();
    check(state.kid.minigunEquipped && !state.kid.molotovEquipped, "Number 3 selects minigun exclusively");
    const short = await observeMolotovThrow(state, 20, 28, 100);
    const long = await observeMolotovThrow(state, 20, 28, 1600);
    check(
      short.impact.burning && long.impact.burning && long.range > short.range + 100 && long.charge > short.charge,
      "A fully charged 30-degree throw travels substantially farther on the real map: " +
        Math.round(short.range) +
        " versus " +
        Math.round(long.range) +
        " pixels"
    );
    const high = await observeMolotovThrow(state, 2, 49, 1600, true);
    const roof = state.level.rooms[2].y * 189 + 63;
    check(
      high.flight &&
        high.flight.aimUp &&
        high.impact.burning &&
        high.impact.y >= roof &&
        high.impact.y <= roof + 8 &&
        !state.molotov.bottles.length,
      "Holding Up launches a high arc that shatters against the native ceiling without passing through it"
    );
    await pause(650);
    check(
      state.molotov.fires.some((fire) => fire.room === 2 && fire.row === 1 && fire.y === roof + 56) &&
        !state.molotov.fires.some((fire) => fire.room === 2 && fire.y < roof),
      "Burning oil falls below the ceiling and lights the actual floor, without painting fire atop the roof"
    );
    const left = await observeMolotovThrow(state, 20, 98, 800, false, -1);
    check(
      left.flight && left.flight.vx < 0 && left.impact.x < left.launch.x,
      "Facing left mirrors the charged throw correctly"
    );
    report("ALL CHARGED MOLOTOV CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    busy = false;
  }
}

function placeGuard(enemy, room, location, direction = -1) {
  enemy.room = room;
  enemy.charY = (Math.floor(location / 10) + 1) * 63 - 10;
  enemy.charXVel = enemy.charYVel = 0;
  enemy.inFallDown = enemy.inJumpUp = false;
  enemy.opponent = null;
  enemy.startFight = false;
  enemy.action = "stand";
  enemy.swordDrawn = false;
  if (enemy.charFace !== direction) {
    enemy.changeFace();
  }
  enemy.setActive();
  enemy.processCommand();
  enemy.room = room;
  enemy.updateBase();
  enemy.charX = (location % 10) * 14 + 14 + (enemy.charFfoot - enemy.charFdx) * enemy.charFace;
  enemy.updateBlockXY();
  enemy.updateCharPosition();
  enemy.updateSwordPosition();
}

async function worldUpdateChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    await ready();
    let state = await freshLevel(1);
    quietEnemies(state);
    const loose = state.level.getTileAt(6, 2, 1);
    const stone = state.level.getTileAt(8, 2, 1);
    const blood = state.bloodEffects;
    const room = state.level.rooms[1];
    const floorY = room.y * 189 + 182;
    for (const tile of [loose, stone]) {
      for (let depth = 0; depth < 10; depth++) {
        blood.stain(
          { room: 1, tile, x: room.x * 320 + tile.roomX * 32 + 16, y: floorY, normalY: -1 },
          { size: 2, vx: 0, depthLayer: depth }
        );
      }
    }
    const removed = blood.surfacePixels.get(loose);
    const retained = blood.surfacePixels.get(stone);
    check(
      removed && retained && removed.size > 1,
      "Blood coats the loose board and intact neighboring stone across multiple layers"
    );
    const pixels = (surface) =>
      [...surface].flatMap(([cache, owned]) =>
        [...owned].map((pixel) => ({
          cache,
          pixel,
          rgba: [
            ...cache.bitmap.ctx.getImageData(pixel % cache.bitmap.width, Math.floor(pixel / cache.bitmap.width), 1, 1)
              .data
          ]
        }))
      );
    const droppedPixels = pixels(removed);
    const stonePixels = pixels(retained);
    loose.shake(true);
    for (let i = 0; i < 30 && state.level.getTileAt(6, 2, 1) === loose; i++) {
      await pause(80);
    }
    check(
      state.level.getTileAt(6, 2, 1).element === 0 && !blood.surfacePixels.has(loose),
      "The native falling-board event removes that board's blood ownership"
    );
    check(
      droppedPixels.every(
        ({ cache, pixel }) =>
          cache.bitmap.ctx.getImageData(pixel % cache.bitmap.width, Math.floor(pixel / cache.bitmap.width), 1, 1)
            .data[3] === 0
      ),
      "All blood pixels on the dropped board disappear from every cache"
    );
    check(
      stonePixels.every(({ cache, pixel, rgba }) =>
        [
          ...cache.bitmap.ctx.getImageData(pixel % cache.bitmap.width, Math.floor(pixel / cache.bitmap.width), 1, 1)
            .data
        ].every((value, i) => value === rgba[i])
      ),
      "Blood on intact stone keeps exactly the same pixels"
    );

    state = await freshLevel(1);
    quietEnemies(state);
    const guard = state.enemies.find((enemy) => enemy.room === 2);
    placeKid(2, 70, 1, -1);
    placeGuard(guard, 2, 17);
    const distance = () =>
      Math.abs(
        guard.baseX +
          Math.floor((guard.charX * 320) / 140) -
          state.kid.baseX -
          Math.floor((state.kid.charX * 320) / 140)
      );
    const before = distance();
    await pause(1000);
    check(
      !state.kid.hasMinigun && guard.opponent === state.kid && guard.startFight && distance() < before - 12,
      "A visible reachable guard starts hunting an unarmed Prince immediately"
    );

    state = await freshLevel(2);
    quietEnemies(state);
    const blocked = state.enemies.find((enemy) => enemy.baseCharName === "guard");
    const gate = state.level.getTileAt(5, 1, 13);
    placeKid(13, 42, 1, 1);
    gate.drop();
    await pause(650);
    placeGuard(blocked, 13, 18);
    const blockedX = blocked.charX;
    await pause(700);
    check(
      !blocked.startFight && blocked.charX === blockedX,
      "A closed native gate prevents pursuit through the barrier"
    );
    gate.raise();
    for (let i = 0; i < 50 && !blocked.startFight; i++) {
      await pause(80);
    }
    check(
      blocked.startFight && blocked.opponent === state.kid,
      "The guard begins hunting as soon as the raised gate opens a route"
    );
    report("ALL PURSUIT AND FALLING BLOOD CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    busy = false;
  }
}

async function actionChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  let savedKeys = null;
  try {
    await ready();
    let state = await freshLevel(1);
    quietEnemies(state);
    await collectWeapon(state.minigun);
    check(!state.minigun.effects.weapon.visible, "The selected minigun is hidden while idle");
    placeKid(21, 49, 0, 1);
    const kid = state.kid;
    const keyR = kid.keyR;
    kid.shiftKey.isDown = true;
    kid.keyR = () => true;
    const stepX = kid.charX;
    const stepShots = state.minigun.effects.shots;
    savedKeys = { kid, keyR };
    await pause(400);
    check(kid.charX > stepX && !kid.specialAction, "Shift and Right preserve slow movement with a collected minigun");
    check(
      state.minigun.effects.shots === stepShots && !state.minigun.effects.weapon.visible,
      "Shift never draws or fires the gun"
    );
    kid.keyR = keyR;
    kid.shiftKey.isDown = false;
    await pause(500);
    state.weaponCtrlKey.isDown = true;
    state.weaponCtrlKey.onDown.dispatch();
    await pause(130);
    const x = kid.charX;
    const shots = state.minigun.effects.shots;
    kid.keyR = () => true;
    savedKeys = { kid, keyR };
    await pause(170);
    check(kid.specialAction && kid.specialAction.owner === state.minigun, "Drawing the minigun locks the Prince");
    check(kid.charX === x && state.minigun.effects.shots === shots, "Moving cannot interrupt the draw or fire early");
    await pause(500);
    check(
      state.minigun.effects.shots > shots && kid.charX === x,
      "Two-handed sustained fire holds the Prince in place"
    );
    state.weaponCtrlKey.isDown = false;
    const releaseShots = state.minigun.effects.shots;
    await pause(120);
    check(
      kid.specialAction && state.minigun.actionStage === "holstering" && kid.charX === x,
      "Releasing fire keeps movement locked while the Prince puts the gun back"
    );
    check(
      state.minigun.effects.shots === releaseShots && state.minigun.effects.weapon.visible,
      "The gun moves toward the back without firing another shot"
    );
    await pause(250);
    check(
      !kid.specialAction && !state.minigun.effects.weapon.visible,
      "Finishing the stow hides the gun and unlocks movement"
    );
    check(
      !kid.cropRect && !state.minigun.effects.head.visible,
      "Releasing fire restores the complete original Prince sprite"
    );
    // The original run-start animation has four stationary frames before its first step.
    await pause(450);
    check(kid.charX > x, "Held movement resumes after stowing finishes");
    kid.keyR = keyR;
    savedKeys = null;

    const prepared = await prepareMolotov();
    state = prepared.state;
    savedKeys = { kid: state.kid, keyS: prepared.keyS };
    const hangX = state.kid.charX;
    const hangY = state.kid.charY;
    state.weaponCtrlKey.isDown = true;
    state.weaponCtrlKey.onDown.dispatch();
    await pause(100);
    check(
      state.kid.specialAction &&
        state.kid.specialAction.owner === state.molotov &&
        state.molotov.throwState.phase === "throwing" &&
        !state.molotov.bottles.length,
      "Pressing Ctrl immediately starts the original hanging throw"
    );
    state.weaponCtrlKey.isDown = false;
    state.weaponCtrlKey.onUp.dispatch();
    await pause(300);
    check(
      state.kid.charX === hangX && state.kid.charY === hangY,
      "The Prince stays attached during the lighter and bottle sequence"
    );
    await pause(450);
    check(!state.kid.specialAction && state.kid.alpha === 1, "The quick throw restores the ordinary Prince sprite");
    check(
      state.molotov.bottles.length + state.molotov.fires.length > 0,
      "The thrown bottle falls and creates real ground fire"
    );
    check(["hang", "hangstraight"].includes(state.kid.action), "The Prince keeps his ledge after throwing");
    state.kid.keyS = prepared.keyS;
    savedKeys = null;

    state = await loadMission(12);
    quietEnemies(state);
    await collectJetpack(state);
    const startY = state.kid.charY;
    state.toggleJetpack();
    const keyU = state.kid.keyU;
    state.kid.keyU = () => true;
    savedKeys = { kid: state.kid, keyU };
    await pause(650);
    check(state.kid.specialAction && state.kid.specialAction.owner === state.jetpack, "J activates the jetpack");
    check(state.kid.charY < startY - 8, "Up flies above the original floor");
    check(
      state.kid.cropRect && state.jetpack.effects.head.visible,
      "Flight replaces the original arms with two strap grips"
    );
    state.kid.keyU = keyU;
    savedKeys = null;
    await pause(200);
    const hoverY = state.kid.charY;
    await pause(200);
    check(Math.abs(state.kid.charY - hoverY) < 5, "Releasing the arrows keeps a stable hover");
    state.weaponFireKey.isDown = true;
    const flightShots = state.minigun.effects.shots;
    await pause(200);
    check(state.minigun.effects.shots === flightShots, "Holding the straps prevents firing during flight");
    state.weaponFireKey.isDown = false;
    state.toggleJetpack();
    await pause(700);
    check(!state.kid.specialAction && state.kid.alive, "J removes the pack and restores ordinary landing safely");
    check(
      !state.kid.cropRect && !state.jetpack.effects.head.visible,
      "Removing the pack restores the complete native sprite"
    );
    const oldPack = state.jetpack;
    const oldBottle = state.molotov;
    state = await freshLevel(12);
    check(oldPack.destroyed && oldBottle.destroyed, "Restart cleans up both new controllers");
    state = await loadMission(1);
    check(!state.kid.hasMolotov && !state.kid.specialAction, "Restart restores pickup and controls");
    report("ALL NEW ACTION CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    if (savedKeys) {
      for (const name of ["keyR", "keyS", "keyU"]) {
        if (savedKeys[name]) {
          savedKeys.kid[name] = savedKeys[name];
        }
      }
    }
    gameState().weaponFireKey.isDown = false;
    gameState().weaponCtrlKey.isDown = false;
    gameState().kid.shiftKey.isDown = false;
    busy = false;
  }
}

function roomFramed(state, id = state.kid.room) {
  const room = state.level.rooms[id];
  const scale = testGame.world.scale.x;
  const epsilon = 0.000001;
  const left = room.x * 320 * scale - testGame.camera.x;
  const top = room.y * 189 * scale - testGame.camera.y;
  return (
    left >= -epsilon &&
    left + 320 * scale <= testGame.width + epsilon &&
    top >= -epsilon &&
    top + 189 * scale <= testGame.height - 16 + epsilon
  );
}

function cameraSample(state) {
  return {
    x: testGame.camera.x,
    y: testGame.camera.y,
    room: state.kid.room,
    kidX: state.kid.baseX + (state.kid.charX * 320) / 140,
    fullRoom: roomFramed(state),
    hudX: state.ui.layer.worldTransform.tx,
    hudY: state.ui.layer.worldTransform.ty
  };
}

async function watchCamera(state, until, timeout = 4500) {
  const samples = [cameraSample(state)];
  const deadline = window.performance.now() + timeout;
  while (!until()) {
    if (window.performance.now() > deadline) {
      throw new Error("Camera travel timed out: " + JSON.stringify(samples.at(-1)));
    }
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    samples.push(cameraSample(state));
  }
  return samples;
}

function checkHorizontalSamples(samples, description) {
  check(
    samples.every((sample, i) => i === 0 || Math.abs(sample.x - samples[i - 1].x) < 80),
    description + ": no room-width camera jump"
  );
  check(
    samples.every((sample) => sample.y === samples[0].y),
    description + ": vertical camera stays fixed"
  );
  check(
    samples.every(
      (sample) => Math.abs(sample.hudX - samples[0].hudX) < 2 && Math.abs(sample.hudY - samples[0].hudY) < 2
    ),
    description + ": health display stays fixed on screen"
  );
}

function cameraControls(kid) {
  const originals = { keyL: kid.keyL, keyR: kid.keyR, keyU: kid.keyU, keyD: kid.keyD };
  const held = { left: false, right: false, up: false, down: false };
  kid.keyL = () => held.left;
  kid.keyR = () => held.right;
  kid.keyU = () => held.up;
  kid.keyD = () => held.down;
  held.restore = () => Object.assign(kid, originals);
  return held;
}

async function cameraChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  let controls;
  try {
    await ready();
    let state = await freshLevel(1);
    quietEnemies(state);
    placeKid(7, 49, 1, 1);
    check(testGame.world.scale.x === 1.4, "Gameplay is zoomed out by 30 percent");
    check(state.roomCamera.paddingX >= 64, "The centered room includes at least two tiles of each side neighbor");
    check(roomFramed(state), "The complete primary room fits above the health display");
    check(
      state.roomCamera.isRoomVisible(17) && state.roomCamera.isRoomVisible(14),
      "The rooms directly above and below are partly visible"
    );
    check(
      Math.abs(state.ui.layer.width * testGame.world.scale.x - 640) < 0.1 &&
        Math.abs(state.ui.layer.height * testGame.world.scale.y - 16) < 0.1,
      "The health display retains its original width and size at the new zoom"
    );
    placeKid(2, 98, 1, 1);
    await watchCamera(state, () => !state.roomCamera.transition);
    controls = cameraControls(state.kid);
    controls.right = true;
    const right = await watchCamera(state, () => state.kid.room === 3);
    const origin = state.roomCamera.roomLeft(2) * state.roomCamera.scale;
    check(
      right.some((sample) => sample.room === 2 && sample.x > origin + 10),
      "Camera reveals the right neighbor before the Prince crosses the boundary"
    );
    check(
      right.filter((sample) => sample.room === 2).every((sample) => sample.fullRoom),
      "The departing room remains fully visible throughout the edge preview" +
        (right.some((sample) => sample.room === 2 && !sample.fullRoom)
          ? ": " +
            JSON.stringify({
              room: state.level.rooms[2].x + "," + state.level.rooms[2].y,
              sample: right.find((sample) => sample.room === 2 && !sample.fullRoom),
              scale: testGame.world.scale.x
            })
          : "")
    );
    checkHorizontalSamples(right, "Running right through a room boundary");
    controls.right = false;
    await watchCamera(state, () => !state.roomCamera.transition);
    check(roomFramed(state, 3), "Stopping inside the right neighbor still completes its full room frame");
    controls.left = true;
    const left = await watchCamera(state, () => state.kid.room === 2 && state.kid.charX < 60);
    check(left.at(-1).x < left[0].x, "Camera follows the Prince back to the left");
    checkHorizontalSamples(left, "Running left through a room boundary");
    controls.left = false;
    await watchCamera(state, () => !state.roomCamera.transition);
    check(roomFramed(state, 2), "Returning left completes the previous room's full frame");
    controls.restore();

    state = await freshLevel(1);
    quietEnemies(state);
    placeKid(2, 105, 1, 1);
    // Grant a test pack to isolate camera physics from campaign inventory progression.
    state.kid.hasJetpack = true;
    check(state.jetpack.toggle(), "Jetpack activates for the scrolling flight check");
    controls = cameraControls(state.kid);
    controls.right = true;
    const flightRight = await watchCamera(state, () => state.kid.room === 3);
    checkHorizontalSamples(flightRight, "Flying right through a room boundary");
    controls.right = false;
    await watchCamera(state, () => !state.roomCamera.transition);
    check(roomFramed(state, 3), "Hovering just inside a neighbor completes its full frame");
    controls.left = true;
    const flightLeft = await watchCamera(state, () => state.kid.room === 2 && state.kid.charX < 100);
    checkHorizontalSamples(flightLeft, "Flying left through a room boundary");
    check(state.jetpack.active && state.kid.alive, "Jetpack remains active across horizontal room travel");
    controls.restore();

    // An existing open shaft joins room 22's bottom row to room 15's top row.
    placeKid(22, 49, 2, 1);
    check(state.jetpack.toggle(), "Jetpack activates in the existing vertical shaft");
    controls = cameraControls(state.kid);
    controls.down = true;
    const upperY = testGame.camera.y;
    const lowerY = Math.round((189 - state.roomCamera.paddingY) * state.roomCamera.scale);
    const down = await watchCamera(state, () => state.kid.room === 15);
    check(
      down.every((sample) => sample.y === upperY || sample.y === lowerY) && down.at(-1).y === lowerY,
      "Flying down still cuts directly to the next floor"
    );
    controls.down = false;
    controls.up = true;
    const up = await watchCamera(state, () => state.kid.room === 22);
    check(
      up.every((sample) => sample.y === lowerY || sample.y === upperY) && up.at(-1).y === upperY,
      "Flying up still cuts directly to the previous floor"
    );
    controls.restore();
    controls = null;

    state = await freshLevel(1);
    quietEnemies(state);
    check(state.roomCamera.room === state.kid.room, "Restart resets the camera to the new starting room");
    check(state.ui.layer.fixedToCamera, "HUD retains Phaser's camera attachment after restart");
    check(testGame.world.scale.x === 1.4 && roomFramed(state), "Restart preserves zoom and the full starting room");
    report("ALL CAMERA CHECKS PASSED");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    if (controls) {
      controls.restore();
    }
    busy = false;
  }
}

async function cameraPreview() {
  if (busy) {
    return;
  }
  busy = true;
  let controls;
  try {
    await ready();
    const state = await freshLevel(1);
    quietEnemies(state);
    placeKid(20, 98, 1, 1);
    controls = cameraControls(state.kid);
    controls.right = true;
    await watchCamera(state, () => !state.roomCamera.transition);
    await watchCamera(state, () => state.kid.room === 7);
    controls.right = false;
    await watchCamera(state, () => !state.roomCamera.transition);
    controls.restore();
    controls = null;
    testGame.paused = true;
    output.textContent =
      "30% zoom: room 7 fully framed, with wider previews of neighboring rooms. The pan finishes even after stopping at the entrance.";
  } catch (error) {
    output.textContent = "FAIL: " + error.message;
  } finally {
    if (controls) {
      controls.restore();
    }
    busy = false;
  }
}

document.getElementById("camera").addEventListener("click", cameraChecks);
document.getElementById("scroll-preview").addEventListener("click", cameraPreview);

document.getElementById("boundary-preview").addEventListener("click", async () => {
  await ready();
  const state = await freshLevel(1);
  quietEnemies(state);
  placeKid(1, 35, 1, 1);
  await watchCamera(state, () => !state.roomCamera.transition);
  testGame.paused = true;
  output.textContent =
    "The starting screen provides two torches and the molotov. Drop through the loose-floor shaft to the two guards and the minigun in the next room below.";
});
document.getElementById("run").addEventListener("click", combatChecks);
document.getElementById("melee-fire").addEventListener("click", meleeFireChecks);
document.getElementById("whip-check").addEventListener("click", whipChecks);
document.getElementById("kick-check").addEventListener("click", () => kickChecks());
document.getElementById("kick-preview").addEventListener("click", () => kickChecks(true));
document.getElementById("pickup-check").addEventListener("click", () => pickupChecks());
document.getElementById("pickup-preview-one").addEventListener("click", () => pickupChecks(1));
document.getElementById("pickup-preview-two").addEventListener("click", () => pickupChecks(2));
document.getElementById("brass-check").addEventListener("click", brassChecks);
document.getElementById("burn-audio-check").addEventListener("click", burningAudioChecks);
document.getElementById("torch-preview").addEventListener("click", torchPreview);
document.getElementById("whip-preview").addEventListener("click", whipPreview);
document.getElementById("door-blood").addEventListener("click", doorBloodPreview);
document.getElementById("features").addEventListener("click", featureChecks);
document.getElementById("actions").addEventListener("click", actionChecks);
document.getElementById("charged-molotov").addEventListener("click", chargedMolotovChecks);
document.getElementById("world-updates").addEventListener("click", worldUpdateChecks);
document.getElementById("campaign").addEventListener("click", campaignChecks);
document.getElementById("jetpack-progression").addEventListener("click", jetpackProgressionChecks);
document.getElementById("wall-fire").addEventListener("click", wallFireChecks);
document.getElementById("exit-doors").addEventListener("click", exitDoorChecks);
document.getElementById("exit-preview").addEventListener("click", async () => {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    const state = await loadMission(3);
    quietEnemies(state);
    await blastExit(state);
    state.ui.showRemainingMinutes(true);
    testGame.paused = true;
    report(
      "The next-level exit is shattered and remains usable. The arrival door is protected. Weapon keys: 1 torches, 2 molotov, 3 minigun, 4 rockets; X whip; 600-minute clock."
    );
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    busy = false;
  }
});
document.getElementById("opening").addEventListener("click", openingChecks);
document.getElementById("opening-preview").addEventListener("click", openingPreview);
document.getElementById("gore").addEventListener("click", goreChecks);
document.getElementById("minigun-deaths").addEventListener("click", () => deathPreview("minigun"));
document.getElementById("rocket-deaths").addEventListener("click", () => deathPreview("rocketLauncher"));
document.getElementById("blood-preview").addEventListener("click", () => deathPreview("minigun", true));
document.getElementById("palace-walls").addEventListener("click", async () => {
  await ready();
  const state = await freshLevel(4);
  quietEnemies(state);
  await watchCamera(state, () => !state.roomCamera.transition);
  testGame.paused = true;
  output.textContent =
    "Palace masonry: brick colors and mortar courses align between mapped rooms. Unmapped areas stay empty.";
});

document.getElementById("molotov").addEventListener("click", async () => {
  await ready();
  const state = await freshLevel(1);
  quietEnemies(state);
  await collectWeapon(state.molotov);
  placeKid(20, 42, 1, 1);
  state.weaponCtrlKey.isDown = true;
  state.weaponCtrlKey.onDown.dispatch();
  await pause(1600);
  testGame.paused = true;
  output.textContent =
    "Molotov fully charged and unlit. Resume game, then Hold / release Ctrl to light and throw. Up selects a 70-degree arc; otherwise 30 degrees. Weapon keys: 1 torches, 2 molotov, 3 minigun, 4 rockets; X whip.";
});

document.getElementById("jetpack").addEventListener("click", async () => {
  await ready();
  const state = await loadMission(12);
  quietEnemies(state);
  await collectJetpack(state);
  state.toggleJetpack();
  const keyU = state.kid.keyU;
  state.kid.keyU = () => true;
  await pause(600);
  state.kid.keyU = keyU;
  await pause(200);
  testGame.paused = true;
  output.textContent =
    "Jetpack preview paused in flight. Resume game lets you fly with the arrows; J removes the pack.";
});

document.getElementById("jetpack-pickup").addEventListener("click", async () => {
  if (busy) {
    return;
  }
  busy = true;
  try {
    const state = await loadMission(12);
    quietEnemies(state);
    state.ui.showRemainingMinutes(true);
    testGame.paused = true;
    output.textContent =
      "Level 12: the steel jetpack with a J tag waits just right of the starting Prince. Walk over it, then J equips/removes it; arrows fly. From level 13 onward it is automatically owned.";
  } finally {
    busy = false;
  }
});

document.getElementById("resume").addEventListener("click", () => {
  testGame.paused = false;
});
document.getElementById("preview").addEventListener("click", preview);
document.getElementById("holster").addEventListener("click", async () => {
  await preview();
  const state = gameState();
  state.weaponFireKey.isDown = state.weaponCtrlKey.isDown = false;
  await pause(160);
  testGame.paused = true;
  output.textContent = "Stowing preview paused halfway. Resume game finishes the 0.32-second movement lock.";
});
document.getElementById("rockets").addEventListener("click", async () => {
  await ready();
  const state = await freshLevel(3);
  if (!state.kid.hasRocketLauncher) {
    const pickup = state.rocketLauncher.pickup;
    const room = state.level.rooms[pickup.room];
    placeKid(
      pickup.room,
      ((pickup.worldX - room.x * 320) * 140) / 320,
      Math.floor((pickup.worldY - room.y * 189) / 63),
      1
    );
    await pause(600);
  }
  quietEnemies(state);
  placeKid(13, 98, 2, -1);
  state.selectWeapon("rocketLauncher");
  state.weaponFireKey.isDown = true;
  for (let i = 0; i < 100 && !state.rocketLauncher.effects.shots; i++) {
    await pause(10);
  }
  await pause(45);
  testGame.paused = true;
  output.textContent =
    "Rocket launcher: quick shoulder draw, both hands on the tube, native hair and small mouth, yellow shot lighting. Rockets accelerate from 90 to 720 px/s in 0.7 seconds.";
});
document.getElementById("piles").addEventListener("click", async () => {
  await preview();
  const state = gameState();
  state.weaponFireKey.isDown = false;
  const effects = state.minigun.effects;
  const muzzle = effects.getMuzzle();
  for (let i = 0; i < 300; i++) {
    effects.shot(muzzle.x, muzzle.y, muzzle.direction);
    effects.update(1 / 60, false);
  }
  await pause(3500);
  output.textContent = effects.casings.length + " permanent shells. Leave the room and return: the pile remains.";
});
document.getElementById("toggle").addEventListener("click", () => {
  const key = gameState().weaponCtrlKey;
  key.isDown = !key.isDown;
  if (key.isDown) {
    key.onDown.dispatch();
  } else {
    key.onUp.dispatch();
  }
});
document.getElementById("inspect").addEventListener("click", () => {
  const state = gameState();
  output.textContent = JSON.stringify(
    {
      level: state.level.number,
      soldiers: {
        total: state.enemies.length,
        alive: state.enemies.filter((enemy) => enemy.alive).length,
        tracking: state.enemies.filter((enemy) => enemy.opponent === state.kid).length,
        fallen: state.enemies
          .filter((enemy) => !enemy.alive)
          .map((enemy) => ({
            id: enemy.id,
            reinforcement: enemy.reinforcement,
            room: enemy.room,
            x: enemy.charX,
            y: enemy.charY,
            column: enemy.charBlockX,
            row: enemy.charBlockY,
            action: enemy.action,
            tile: state.level.getTileAt(enemy.charBlockX, enemy.charBlockY, enemy.room).element
          }))
      },
      player: {
        x: state.kid.charX,
        y: state.kid.charY,
        baseX: state.kid.baseX,
        baseY: state.kid.baseY,
        room: state.kid.room,
        action: state.kid.action,
        alive: state.kid.alive,
        fall: state.kid.inFallDown,
        jump: state.kid.inJumpUp
      },
      health: state.kid.health,
      maxHealth: state.kid.maxHealth,
      launcherPickup: state.rocketLauncher && state.rocketLauncher.pickup,
      launcherOwned: state.kid.hasRocketLauncher,
      launcherEquipped: state.kid.rocketLauncherEquipped,
      launcherMuzzle: state.rocketLauncher && state.rocketLauncher.effects.getMuzzle(),
      rocketShots: state.rocketLauncher ? state.rocketLauncher.effects.shots : 0,
      equipped: state.kid.activeWeapon,
      shots: state.minigun.effects.shots,
      casings: state.minigun.effects.casings.length,
      depthLayers: new Set(state.minigun.effects.casings.map((casing) => casing.depthLayer)).size,
      audioShots: state.weaponAudio.shots,
      audioMuted: testGame.sound.mute,
      audioState: testGame.sound.context && testGame.sound.context.state,
      audioLocked: testGame.sound.touchLocked,
      audioReady: testGame.cache.isSoundReady("MinigunFire"),
      paused: testGame.paused
    },
    null,
    2
  );
});
document.getElementById("stop").addEventListener("click", () => {
  gameState().minigun.fireKey.isDown = false;
  gameState().weaponCtrlKey.isDown = false;
});
gameFrame.addEventListener("load", () => {
  if (!busy) {
    ready().then(() => {
      if (!busy) {
        output.textContent = "Ready to run browser checks.";
      }
    });
  }
});
