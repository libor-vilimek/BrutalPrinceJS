"use strict";

// Browser integration fixture. The production entry point remains unchanged.
const gameFrame = document.getElementById("game");
const output = document.getElementById("results");
const pause = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
let testGame;
let busy = false;

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
    if (testGame && testGame.cache && testGame.cache.checkJSONKey("kid-anims") && !testGame.load.isLoading) {
      testGame.stage.disableVisibilityChange = true;
      testGame.paused = false;
      if (testGame.state.current !== "Game") {
        testGame.state.start("Game");
      }
      await pause(1000);
      testGame.input.reset(false);
      return;
    }
    await pause(100);
  }
  throw new Error("Game did not load");
}

function placeKid(room, x, row, direction) {
  const state = gameState();
  const kid = state.kid;
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
    gameState().restartLevel(true);
    await pause(1100);
    testGame.input.reset(false);
    let state = gameState();
    check(!state.kid.hasMinigun && !state.minigun.pickup.collected, "Fresh spawn has a ground pickup");
    check(state.minigun.pickup.worldY === state.kid.baseY + state.kid.charY, "Pickup is on the spawn landing floor");
    const keyR = state.kid.keyR;
    state.kid.keyR = () => true;
    for (let i = 0; i < 40 && !state.kid.hasMinigun; i++) {
      await pause(50);
    }
    state.kid.keyR = keyR;
    await pause(800);
    check(
      state.kid.hasMinigun && state.minigun.pickup.collected,
      "Walking from spawn collects the minigun (x=" +
        state.kid.charX +
        ", action=" +
        state.kid.action +
        ", paused=" +
        testGame.paused +
        ")"
    );
    check(state.minigun.effects.getMuzzle().visible, "Pickup animation equips the weapon");
    placeKid(21, 42, 0, 1);
    const guard = state.enemies.find((enemy) => enemy.room === 21);
    check(guard.alive && guard.health > 0, "Target guard starts alive");
    state.minigun.fireKey.isDown = true;
    await pause(1300);
    state.minigun.fireKey.isDown = false;
    check(!guard.alive && guard.health === 0, "Held fire kills a real guard");
    check(state.minigun.effects.shots >= 10, "Held fire emits repeated shots");
    check(state.minigun.effects.casings.length >= 30, "Firing ejects brass casings");
    state.weaponToggleKey.onDown.dispatch();
    state.minigun.fireKey.isDown = true;
    const shots = state.minigun.effects.shots;
    await pause(400);
    check(state.kid.hasMinigun && !state.kid.minigunEquipped, "Ctrl holsters without losing inventory");
    check(
      !state.minigun.effects.getMuzzle().visible && !state.minigun.effects.weapon.visible,
      "Holstered minigun is invisible"
    );
    check(state.minigun.effects.shots === shots, "Holstered minigun cannot fire");
    state.weaponToggleKey.onDown.dispatch();
    await pause(600);
    check(state.kid.minigunEquipped && state.minigun.effects.shots > shots, "Ctrl re-equips and firing resumes");
    state.minigun.fireKey.isDown = false;
    placeKid(21, 63, 0, -1);
    state.minigun.fireKey.isDown = true;
    await pause(400);
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
    const rocketPickup = state.rocketLauncher.pickup;
    const rocketRoom = state.level.rooms[rocketPickup.room];
    placeKid(rocketPickup.room, ((rocketPickup.worldX - rocketRoom.x * 320) * 140) / 320, 1, 1);
    await pause(650);
    check(
      state.kid.hasRocketLauncher && state.kid.rocketLauncherEquipped,
      "Ground launcher pickup equips the rockets " +
        JSON.stringify({
          x: state.kid.charX,
          y: state.kid.charY,
          room: state.kid.room,
          baseX: state.kid.baseX,
          baseY: state.kid.baseY,
          action: state.kid.action,
          fall: state.kid.inFallDown,
          jump: state.kid.inJumpUp,
          pickup: rocketPickup
        })
    );
    placeKid(3, 42, 1, 1);
    const rocketGuard = state.enemies.find((enemy) => enemy.room === 3);
    check(rocketGuard.alive, "Rocket target starts alive");
    state.weaponFireKey.isDown = true;
    await pause(1500);
    state.weaponFireKey.isDown = false;
    check(!rocketGuard.alive && rocketGuard.health === 0, "A real rocket impact kills the target");
    state.selectWeapon("minigun");
    check(
      state.kid.minigunEquipped && !state.kid.rocketLauncherEquipped,
      "Weapon selection draws only the selected weapon"
    );
    const oldGun = state.minigun;
    state.restartLevel(true);
    await pause(1100);
    state = gameState();
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
  const state = gameState();
  if (!state.kid.hasMinigun) {
    placeKid(state.minigun.pickup.room, ((state.minigun.pickup.worldX - state.kid.baseX) * 140) / 320, 1, 1);
    await pause(600);
  }
  placeKid(21, 49, 0, 1);
  if (!state.kid.minigunEquipped) {
    state.minigun.toggleEquipped();
  }
  state.minigun.fireKey.isDown = true;
  state.weaponAudio.unlock();
  output.textContent = "Sustained fire preview. Ctrl toggles holster; Stop firing releases the trigger.";
}

document.getElementById("run").addEventListener("click", combatChecks);
document.getElementById("preview").addEventListener("click", preview);
document.getElementById("rockets").addEventListener("click", async () => {
  await ready();
  const state = gameState();
  if (!state.kid.hasRocketLauncher) {
    const pickup = state.rocketLauncher.pickup;
    const room = state.level.rooms[pickup.room];
    placeKid(pickup.room, ((pickup.worldX - room.x * 320) * 140) / 320, 1, 1);
    await pause(600);
  }
  placeKid(21, 49, 0, 1);
  state.selectWeapon("rocketLauncher");
  state.weaponFireKey.isDown = true;
  output.textContent = "Rocket preview: smoke trails, impact explosions, and area damage.";
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
document.getElementById("toggle").addEventListener("click", () => gameState().weaponToggleKey.onDown.dispatch());
document.getElementById("inspect").addEventListener("click", () => {
  const state = gameState();
  output.textContent = JSON.stringify(
    {
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
      launcherPickup: state.rocketLauncher.pickup,
      launcherOwned: state.kid.hasRocketLauncher,
      equipped: state.kid.activeWeapon,
      shots: state.minigun.effects.shots,
      audioShots: state.weaponAudio.shots,
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
});
gameFrame.addEventListener("load", () =>
  ready().then(() => {
    output.textContent = "Ready to run browser checks.";
  })
);
