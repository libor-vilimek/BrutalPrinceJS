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
  state.weaponCtrlKey.isDown = false;
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
    const below = state.level.rooms[state.kid.room].links.down;
    const secondRoom = state.level.rooms[below];
    check(state.minigun.pickup.room === below, "Minigun waits in the second room below the starting screen");
    check(
      state.minigun.pickup.worldX === secondRoom.x * 320 + 48 &&
        state.minigun.pickup.worldY === secondRoom.y * 189 + 119 &&
        state.level.getTileAt(1, 1, below).element === 1,
      "Minigun is clearly positioned on plain floor at the left of the second room"
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
    check(
      state.rocketLauncher.actionStage === "holstering" && state.kid.specialAction,
      "Releasing rockets starts a locked stowing animation"
    );
    await pause(260);
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
      testGame.input.reset(false);
      if (expected !== number) {
        return freshLevel(number);
      }
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
  check(kid.hasMolotov && !kid.hasMinigun, "Only the molotov is collected on the first screen");
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
    state.weaponCtrlKey.onDown.dispatch();
    check(state.molotov.throwState && !state.kid.hasMinigun, "Ctrl throws the first molotov before acquiring any gun");
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
      targets.every((enemy) => !enemy.alive),
      "The dropped molotov burns both real guards in the room below"
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
      state.kid.alive && state.kid.room === 2 && state.kid.charBlockY === 1 && !state.kid.hasMinigun,
      "Releasing the ledge lands safely in the second room without collecting the gun early"
    );
    await walkUntil(
      () => state.kid.hasMinigun,
      "Walking left from the burnt guards picks up the clearly visible minigun",
      -1
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
      "Opening: molotov first, two guards beneath the shaft, and the glowing minigun on clear floor to their left. Hold Shift when resuming to keep hanging; Ctrl drops a bottle."
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
  const state = await freshLevel(weapon === "minigun" ? 1 : 2);
  quietEnemies(state);
  state.kid.damageLife = () => {};
  await collectWeapon(state[weapon]);
  state.selectWeapon(weapon);
  const room = weapon === "minigun" ? 2 : 11;
  placeKid(room, 28, 1, 1);
  state.enemyDeathEffects.variantOffset = 0;
  const targets = arrangeGoreTargets(state, room, 1, positions);
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
    state.weaponCtrlKey.onDown.dispatch();
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
    "The starting screen has only the molotov. Drop through the loose-floor shaft to the two guards and the minigun in the next room below.";
});
document.getElementById("run").addEventListener("click", combatChecks);
document.getElementById("features").addEventListener("click", featureChecks);
document.getElementById("actions").addEventListener("click", actionChecks);
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
  const { state, keyS } = await prepareMolotov();
  state.weaponCtrlKey.onDown.dispatch();
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
  const state = await freshLevel(2);
  if (!state.kid.hasRocketLauncher) {
    const pickup = state.rocketLauncher.pickup;
    const room = state.level.rooms[pickup.room];
    placeKid(pickup.room, ((pickup.worldX - room.x * 320) * 140) / 320, 1, 1);
    await pause(600);
  }
  quietEnemies(state);
  placeKid(11, 98, 1, -1);
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
gameFrame.addEventListener("load", () =>
  ready().then(() => {
    output.textContent = "Ready to run browser checks.";
  })
);
