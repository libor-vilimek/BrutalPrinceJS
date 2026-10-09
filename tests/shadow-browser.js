"use strict";

/* global busy:writable, output, testGame, gameState, loadMission, placeKid, pause, check, report */

function quietShadowRoomGuards(state) {
  for (const enemy of state.enemies) {
    if (enemy !== state.shadow) {
      enemy.setInactive();
      enemy.setInvisible();
    }
  }
  testGame.sound.mute = true;
}

async function prepareTurretRoom() {
  const state = await loadMission(6);
  quietShadowRoomGuards(state);
  placeKid(1, 119, 1, -1);
  state.selectWeapon("rocketLauncher");
  return state;
}

async function preparePeacefulShadow() {
  const state = await loadMission(12);
  quietShadowRoomGuards(state);
  placeKid(15, 77, 0, -1);
  state.checkLevelLogic();
  check(state.shadow.active && state.kid.opponentSync, "The appearing shadow immediately shares damage");
  placeKid(15, 63, 0, -1);
  for (let i = 0; i < 100; i++) {
    if (state.shadow.room === 15 && state.shadow.charBlockY === 0 && !state.shadow.inFallDown) {
      return state;
    }
    await pause(50);
  }
  throw new Error("The shadow did not land in its original encounter room");
}

async function shadowRoomChecks() {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    let state = await prepareTurretRoom();
    const turret = state.laserTurret;
    const gate = state.level.getTileAt(2, 1, 1);
    const intercept = turret.intercept.bind(turret);
    let intercepted = 0;
    turret.intercept = (rocket) => {
      const hit = intercept(rocket);
      if (hit) {
        intercepted++;
      }
      return hit;
    };
    state.weaponCtrlKey.isDown = true;
    for (let i = 0; i < 100 && intercepted < 3; i++) {
      await pause(50);
    }
    state.weaponCtrlKey.isDown = false;
    await pause(500);
    check(intercepted >= 3, "The real shoulder animation fires repeated rockets into the laser defence");
    check(state.level.getTileAt(2, 1, 1) === gate, "The shadow's actual gate survives repeated rockets");
    check(!state.kid.specialAction && !state.kid.cropRect, "Rocket stowing restores movement and the native sprite");
    check(turret.graphics.z > state.level.front.z, "The turret and beam remain visible above the gate artwork");
    gate.raise();
    for (let i = 0; i < 50; i++) {
      gate.update();
    }
    check(gate.canCross(40), "The protected gate still opens normally");
    placeKid(1, 72, 2, -1);
    state.kid.charY = 186;
    state.checkLevelLogic();
    for (let i = 0; i < 100 && gameState().level?.number !== 7; i++) {
      await pause(50);
    }
    state = gameState();
    check(state.level.number === 7, "The shadow room's plunge still advances to level 7");
    check(turret.destroyed && !state.laserTurret, "Changing levels removes the turret and its effects");
    check(state.kid.hasRocketLauncher && state.kid.hasMinigun, "The level transition preserves the weapon inventory");

    state = await preparePeacefulShadow();
    const health = state.kid.health;
    let swordHidden = true;
    for (let i = 0; i < 40; i++) {
      await pause(50);
      swordHidden = swordHidden && !state.shadow.swordDrawn && !state.shadow.sword.visible;
    }
    check(swordHidden, "The shadow keeps its sword hidden throughout the encounter");
    check(state.kid.health === health, "Standing in front of the shadow causes no sword damage");
    const maxHealth = state.kid.maxHealth;
    state.kid.cursors.left.isDown = true;
    for (let i = 0; i < 80 && !state.level.shadowMerge; i++) {
      await pause(50);
    }
    state.kid.cursors.left.isDown = false;
    check(state.level.shadowMerge && !state.shadow.visible, "Walking into the active shadow merges without surrender");
    check(state.kid.alive && state.kid.maxHealth === maxHealth + 1, "Merging gives the original extra life");
    check(
      state.level.leapOfFaithSetup && state.level.getTileAt(0, 0, 2).hidden,
      "Merging enables the invisible bridge"
    );
    await pause(2600);
    check(!state.kid.shadowOverlay.visible, "The merge flash completes and restores the original Prince");

    state = await preparePeacefulShadow();
    state.selectWeapon("minigun");
    state.weaponCtrlKey.isDown = true;
    for (let i = 0; i < 100 && state.shadow.alive; i++) {
      await pause(50);
    }
    state.weaponCtrlKey.isDown = false;
    check(!state.shadow.alive && !state.kid.alive, "Shooting the peaceful shadow dead still kills the Prince");
    report("All shadow room checks passed. Audio remained muted.");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    if (testGame?.sound) {
      testGame.sound.mute = true;
    }
    busy = false;
  }
}

document.getElementById("shadow-rooms").addEventListener("click", shadowRoomChecks);
document.getElementById("turret-preview").addEventListener("click", async () => {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    const state = await prepareTurretRoom();
    state.weaponCtrlKey.isDown = true;
    for (let i = 0; i < 100 && !state.laserTurret.shots.length; i++) {
      await pause(20);
    }
    state.weaponCtrlKey.isDown = false;
    check(state.laserTurret.shots.length > 0, "Laser destroys the rocket before it reaches the shadow's gate");
    testGame.paused = true;
    report("Paused at interception. Audio muted.");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    busy = false;
  }
});
document.getElementById("shadow-preview").addEventListener("click", async () => {
  if (busy) {
    return;
  }
  busy = true;
  output.textContent = "";
  try {
    await preparePeacefulShadow();
    report("Level 12: walk left into the peaceful shadow to merge. Audio muted.");
  } catch (error) {
    report("FAIL: " + error.message);
  } finally {
    busy = false;
  }
});
