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
  state.weaponFireKey.isDown = false;
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
    check(!state.rocketLauncher && state.weapons.length === 1, "Mission one has no rocket launcher or rocket graphics");
    state.selectWeapon("rocketLauncher");
    check(!state.kid.hasRocketLauncher && !state.kid.rocketLauncherEquipped, "Rocket selection cannot unlock it early");
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
    await pause(900);
    check(state.kid.minigunEquipped && state.minigun.effects.shots > shots, "Ctrl re-equips and firing resumes");
    state.minigun.fireKey.isDown = false;
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
    state = await freshLevel(2);
    for (const enemy of state.enemies.filter((enemy) => enemy.reinforcement)) {
      enemy.setInactive();
      enemy.setInvisible();
    }
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
    placeKid(11, 98, 1, -1);
    const rocketGuard = state.enemies.find((enemy) => enemy.room === 11 && !enemy.reinforcement);
    check(rocketGuard.alive, "Rocket target starts alive");
    state.weaponFireKey.isDown = true;
    await pause(1500);
    state.weaponFireKey.isDown = false;
    check(!rocketGuard.alive && rocketGuard.health === 0, "A real rocket impact kills the target");
    await pause(120);
    check(!state.rocketLauncher.effects.weapon.visible, "The launcher is hidden after fire is released");
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
    placeKid(state.minigun.pickup.room, ((state.minigun.pickup.worldX - state.kid.baseX) * 140) / 320, 1, 1);
    await pause(600);
  }
  placeKid(21, 49, 0, 1);
  if (!state.kid.minigunEquipped) {
    state.minigun.toggleEquipped();
  }
  state.minigun.fireKey.isDown = true;
  state.weaponAudio.unlock();
  await pause(650);
  output.textContent = "Sustained fire preview. Ctrl toggles holster; Stop firing releases the trigger.";
}

async function freshLevel(number) {
  const state = gameState();
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
    if (testGame.state.current === "Game" && gameState().level && gameState().level.number === number) {
      await pause(900);
      testGame.input.reset(false);
      return gameState();
    }
  }
  throw new Error("Mission " + number + " did not load");
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
  const room = gameState().level.rooms[weapon.pickup.room];
  const x = ((weapon.pickup.worldX - room.x * 320) * 140) / 320;
  const row = Math.floor((weapon.pickup.worldY - room.y * 189) / 63);
  placeKid(weapon.pickup.room, x, row, 1);
  await pause(650);
  check(gameState().kid[weapon.spec.owned], "Walking over the " + weapon.spec.id + " equips it");
}

async function walkUntil(predicate, description) {
  const kid = gameState().kid;
  const keyR = kid.keyR;
  kid.keyR = () => true;
  try {
    for (let i = 0; i < 40 && !predicate(); i++) {
      await pause(50);
    }
    check(predicate(), description);
  } finally {
    kid.keyR = keyR;
  }
  await pause(300);
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
      check(!!state.rocketLauncher === number >= 2, "Rocket launcher unlocks at mission two");
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
    const state = gameState();
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
    for (const enemy of state.enemies) {
      enemy.setInactive();
      enemy.setInvisible();
    }
    await collectWeapon(state.rocketLauncher);
    state.selectWeapon("rocketLauncher");
    placeKid(18, 91, 2, 1);
    check(state.level.getTileAt(8, 2, 18).element === 20, "Wall initially blocks the corridor");
    await fireUntil(
      () => state.level.getTileAt(8, 2, 18).element !== 20,
      "A real rocket turns the wall into an opening"
    );
    check(state.level.getTileAt(8, 2, 18).isWalkable(), "Destroyed wall retains a walkable floor");
    await walkUntil(() => state.kid.charX > 117, "The Prince runs through the destroyed wall");
    placeKid(11, 70, 1, 1);
    placeKid(18, 91, 2, 1);
    check(!state.level.getTileAt(8, 2, 18).isBarrier(), "Wall opening persists after a room change");

    placeKid(13, 49, 1, 1);
    check(state.level.getTileAt(5, 1, 13).element === 4, "Gate initially exists");
    state.level.getTileAt(5, 1, 13).drop();
    await pause(600);
    await fireUntil(() => state.level.getTileAt(5, 1, 13).element !== 4, "A real rocket destroys the gate");
    await walkUntil(() => state.kid.charX > 87, "The Prince runs through the destroyed gate");

    const exit = state.level.getTileAt(4, 1, 23);
    placeKid(23, 28, 1, 1);
    check(!exit.open, "Level exit starts closed");
    await fireUntil(() => exit.open, "Rockets open the exit door while retaining the level exit");

    await collectWeapon(state.minigun);
    state.selectWeapon("minigun");
    placeKid(11, 70, 1, 1);
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
    const settledCount = effects.casingRooms[11].settled.length;
    placeKid(18, 70, 2, 1);
    await pause(200);
    placeKid(11, 70, 1, 1);
    check(effects.casings.length === shellCount, "No shells disappear when returning to the room");
    check(effects.casingRooms[11].settled.length >= settledCount, "Every settled depth layer survives room travel");
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
    const kid = state.kid;
    const keyR = kid.keyR;
    state.weaponFireKey.isDown = true;
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
    state.weaponFireKey.isDown = false;
    kid.keyR = keyR;
    savedKeys = null;
    await pause(120);
    check(
      !kid.specialAction && !state.minigun.effects.weapon.visible,
      "Releasing fire hides the gun and unlocks movement"
    );

    const prepared = await prepareMolotov();
    state = prepared.state;
    savedKeys = { kid: state.kid, keyS: prepared.keyS };
    const hangX = state.kid.charX;
    const hangY = state.kid.charY;
    state.weaponToggleKey.onDown.dispatch();
    await pause(150);
    check(state.kid.specialAction && state.kid.specialAction.owner === state.molotov, "Ctrl starts the hanging throw");
    await pause(430);
    check(
      state.kid.charX === hangX && state.kid.charY === hangY,
      "The Prince stays attached during the lighter and bottle sequence"
    );
    await pause(550);
    check(!state.kid.specialAction && state.kid.alpha === 1, "The quick throw restores the ordinary Prince sprite");
    check(
      state.molotov.bottles.length + state.molotov.fires.length > 0,
      "The thrown bottle falls and creates real ground fire"
    );
    check(["hang", "hangstraight"].includes(state.kid.action), "The Prince keeps his ledge after throwing");
    state.kid.keyS = prepared.keyS;
    savedKeys = null;

    placeKid(1, 35, 1, 1);
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
    state = await freshLevel(1);
    check(oldPack.destroyed && oldBottle.destroyed, "Restart cleans up both new controllers");
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
    busy = false;
  }
}

document.getElementById("run").addEventListener("click", combatChecks);
document.getElementById("features").addEventListener("click", featureChecks);
document.getElementById("actions").addEventListener("click", actionChecks);

document.getElementById("molotov").addEventListener("click", async () => {
  await ready();
  const { state, keyS } = await prepareMolotov();
  state.weaponToggleKey.onDown.dispatch();
  await pause(630);
  testGame.paused = true;
  state.kid.keyS = keyS;
  output.textContent = "Molotov preview paused at ignition. Resume game continues the quick drop below the ledge.";
});

document.getElementById("jetpack").addEventListener("click", async () => {
  await ready();
  const state = await freshLevel(1);
  quietEnemies(state);
  placeKid(1, 35, 1, 1);
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

document.getElementById("resume").addEventListener("click", () => {
  testGame.paused = false;
});
document.getElementById("preview").addEventListener("click", preview);
document.getElementById("rockets").addEventListener("click", async () => {
  await ready();
  const state = await freshLevel(2);
  if (!state.kid.hasRocketLauncher) {
    const pickup = state.rocketLauncher.pickup;
    const room = state.level.rooms[pickup.room];
    placeKid(pickup.room, ((pickup.worldX - room.x * 320) * 140) / 320, 1, 1);
    await pause(600);
  }
  placeKid(11, 98, 1, -1);
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
