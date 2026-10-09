"use strict";

// Add lessons here; see docs/tutorials.md for triggers, key input and timing.
PrinceJS.TutorialLessons = [
  {
    id: "twin-torches",
    category: "The art of combat",
    title: "The twin flames",
    description: "Your torches are more than a light in the dark. Draw them and spin to set nearby enemies ablaze.",
    instruction: "Hold to spin. Release to put the torches away.",
    hint: "One tap completes the first spin. Collect the bottle, then jump down one floor.",
    keys: [
      { code: Phaser.Keyboard.CONTROL, label: "Ctrl" },
      { code: Phaser.Keyboard.F, label: "F" }
    ],
    holdMs: 1800,
    gamepadButtons: [PrinceJS.Gamepad.B, PrinceJS.Gamepad.Y, PrinceJS.Gamepad.L, PrinceJS.Gamepad.ZL],
    when: function (state) {
      return (
        PrinceJS.currentLevel === 1 &&
        state.level.number === 1 &&
        state.twinTorches.introDone &&
        !state.twinTorches.introPending &&
        state.kid.action === "stand" &&
        state.twinTorches.canBegin()
      );
    }
  },
  {
    id: "ledge-hang",
    category: "The art of movement",
    title: "Trust your grip",
    description:
      "The burning guard has opened the shaft. Lower yourself from this edge and hold on above the guards below.",
    instruction: "Press Shift + Down together to climb down and hang.",
    hint: "For this lesson, we will keep your grip while you prepare the next move.",
    keys: [{ code: Phaser.Keyboard.DOWN, label: "↓", modifiers: [Phaser.Keyboard.SHIFT] }],
    holdUntil: (state) => ["hang", "hangstraight"].includes(state.kid.action),
    maxHoldMs: 3000,
    onComplete: (state, tutorial) => tutorial.holdKey(Phaser.Keyboard.SHIFT),
    when: (state) => !!(state.tutorial.sequence && state.tutorial.sequence.ledgeReady)
  },
  {
    id: "ledge-molotov",
    category: "Fire from above",
    title: "A gift for the guards",
    description: "Two guards wait below. Keep one hand on the ledge, light a molotov and drop it into their path.",
    instruction: "Press Ctrl to light and drop a molotov. During normal play, hold Shift to keep your grip.",
    hint: "The molotov is weapon 2. We have selected it for this demonstration.",
    keys: [
      { code: Phaser.Keyboard.CONTROL, label: "Ctrl" },
      { code: Phaser.Keyboard.F, label: "F" }
    ],
    inventory: ["molotov"],
    holdMs: 100,
    holdUntil: (state) => !state.molotov.throwState,
    maxHoldMs: 2500,
    onAccept: (state, tutorial) => {
      tutorial.holdKey(Phaser.Keyboard.SHIFT);
      state.selectWeapon("molotov");
    },
    when: (state) =>
      PrinceJS.currentLevel === 1 &&
      state.kid.hasMolotov &&
      state.tutorial.completed.has("ledge-hang") &&
      ["hang", "hangstraight"].includes(state.kid.action) &&
      !state.kid.specialAction &&
      state.molotov.cooldown === 0
  },
  {
    id: "minigun-select",
    category: "Know your weapons",
    title: "Choose your firepower",
    description: "Your minigun is ready. Number keys choose a weapon, even when that weapon is already selected.",
    instruction: "Press 3 to select the minigun.",
    hint: "1 brings back the twin torches. 2 selects your molotovs.",
    inventory: ["twinTorches", "molotov", "minigun"],
    keys: [{ code: Phaser.Keyboard.THREE, label: "3" }],
    when: (state) =>
      PrinceJS.currentLevel === 1 &&
      state.level.number === 1 &&
      state.kid.room === 3 &&
      state.kid.hasMinigun &&
      !state.kid.specialAction &&
      !state.kid.inFallDown &&
      !state.kid.inJumpUp &&
      state.minigun.canSelect()
  },
  {
    id: "minigun-fire",
    category: "The art of combat",
    title: "Let the barrels sing",
    description: "Stand your ground, draw the minigun and sweep the corridor with a burst of fire.",
    instruction: "Hold Ctrl to fire. Release to put the minigun away.",
    hint: "This first tap holds a full burst for you.",
    keys: [
      { code: Phaser.Keyboard.CONTROL, label: "Ctrl" },
      { code: Phaser.Keyboard.F, label: "F" }
    ],
    holdMs: 2300,
    when: (state) =>
      PrinceJS.currentLevel === 1 &&
      state.kid.room === 3 &&
      state.tutorial.completed.has("minigun-select") &&
      state.kid.activeWeapon === "minigun" &&
      state.minigun.canFire() &&
      !state.kid.specialAction
  },
  {
    id: "whip-pull",
    category: "Use the high ground",
    title: "Bring him down",
    description: "That guard's ankle is within reach. Cast your whip around the ledge and pull him into the gap.",
    instruction: "Press X to catch his ankle and pull him down.",
    hint: "Once caught, the pull finishes even after you release X. Your selected weapon stays the same.",
    keys: [{ code: Phaser.Keyboard.X, label: "X" }],
    holdMs: 550,
    when: (state) =>
      PrinceJS.currentLevel === 2 &&
      state.level.number === 2 &&
      state.kid.room === 1 &&
      state.whip &&
      state.whip.canAct() &&
      !state.kid.specialAction &&
      state.enemies.some((enemy) => state.whip.findSnag(enemy))
  },
  {
    id: "upper-ledge-kick",
    category: "Make room to fight",
    title: "A little breathing room",
    description:
      "A roundhouse kick finishes your climb quickly and launches every guard within one tile on either side. Each kicked guard can topple one more, without a further chain.",
    instruction: "Press C for an emergency kick. It can interrupt climbing, drawing or stowing a weapon.",
    hint: "The kick reaches one tile on either side. Your selected weapon stays the same. Reminders appear at most once a minute in level 2.",
    keys: [{ code: Phaser.Keyboard.C, label: "C" }],
    repeatAfterMs: 60000,
    holdMs: 100,
    holdUntil: (state) => state.kick.actionStage === "hidden" && state.kick.pending === 0,
    maxHoldMs: 2000,
    onComplete: (state, tutorial) => {
      if (state.kid.room === 22 && state.kid.charBlockY === 1) {
        tutorial.upperLedgeKickDone = true;
      }
    },
    when: function (state) {
      if (
        PrinceJS.currentLevel !== 2 ||
        state.level.number !== 2 ||
        !state.kick ||
        state.kick.cooldown !== 0 ||
        state.kick.actionStage !== "hidden" ||
        !state.kick.canPrepare()
      ) {
        return false;
      }
      const origin = state.kick.threatOrigin();
      if (
        ["hang", "hangstraight", "climbup", "climbdown", "climbfail", "softland", "medland"].includes(state.kid.action)
      ) {
        // Use the same reachable threats as the emergency kick itself. A guard
        // beyond a wall or on a disconnected floor cannot trigger a reminder.
        return state.kick.targets(origin, PrinceJS.Kick.NEAR, false).length > 0;
      }
      // Keep the original first demonstration on the final upper landing,
      // without repeating prompts merely for standing there afterwards.
      if (state.tutorial.completed.has("upper-ledge-kick") || state.kid.room !== 22 || state.kid.specialAction) {
        return false;
      }
      const room = state.level.rooms[22];
      return !!(
        origin &&
        origin.room === 22 &&
        Math.floor((origin.y - room.y * PrinceJS.ROOM_HEIGHT) / PrinceJS.BLOCK_HEIGHT) === 1 &&
        origin.x < room.x * PrinceJS.ROOM_WIDTH + 64 &&
        state.kick.targets(origin, PrinceJS.Kick.RANGE, false).length
      );
    }
  },
  {
    id: "kick-minigun-select",
    category: "Use the opening",
    title: "Back to the minigun",
    description: "The kick has made some space. Choose your minigun before the guards get back on their feet.",
    instruction: "Press 3 to select the minigun.",
    hint: "C works with any weapon selected. Now switch back to weapon 3.",
    inventory: ["minigun"],
    keys: [{ code: Phaser.Keyboard.THREE, label: "3" }],
    when: (state) =>
      PrinceJS.currentLevel === 2 &&
      state.level.number === 2 &&
      state.kid.room === 22 &&
      state.kid.charBlockY === 1 &&
      state.tutorial.upperLedgeKickDone &&
      state.kick.actionStage === "hidden" &&
      state.kick.pending === 0 &&
      state.kid.hasMinigun &&
      state.kid.action === "stand" &&
      !state.kid.specialAction &&
      !state.kid.inFallDown &&
      !state.kid.inJumpUp &&
      state.minigun.canSelect()
  },
  {
    id: "kick-minigun-fire",
    category: "Use the opening",
    title: "Keep them back",
    description: "Draw the minigun and fire down the corridor while the guards are recovering from your kick.",
    instruction: "Hold Ctrl to fire. Release to put the minigun away.",
    hint: "This tap holds a full burst so you can see the kick and minigun work together.",
    keys: [
      { code: Phaser.Keyboard.CONTROL, label: "Ctrl" },
      { code: Phaser.Keyboard.F, label: "F" }
    ],
    holdMs: 2300,
    when: (state) =>
      PrinceJS.currentLevel === 2 &&
      state.level.number === 2 &&
      state.kid.room === 22 &&
      state.tutorial.completed.has("kick-minigun-select") &&
      state.kid.activeWeapon === "minigun" &&
      !state.kid.specialAction &&
      state.minigun.canFire()
  },
  {
    id: "rockets-select",
    category: "Know your weapons",
    title: "A heavier answer",
    description:
      "The rocket launcher is yours. Its rockets accelerate through the corridor and blast through fragile masonry.",
    instruction: "Press 4 to select the rocket launcher.",
    inventory: ["rocketLauncher"],
    keys: [{ code: Phaser.Keyboard.FOUR, label: "4" }],
    when: (state) =>
      PrinceJS.currentLevel === 2 &&
      state.level.number === 2 &&
      state.kid.room === 11 &&
      state.kid.hasRocketLauncher &&
      !state.kid.specialAction &&
      !state.kid.inFallDown &&
      !state.kid.inJumpUp &&
      state.rocketLauncher.canSelect()
  },
  {
    id: "rockets-fire",
    category: "The art of combat",
    title: "Clear a path",
    description: "Aim down the corridor, shoulder the launcher and send a rocket ahead.",
    instruction: "Hold Ctrl to fire rockets. Release to stow the launcher.",
    hint: "A short press completes the first shot for you.",
    keys: [
      { code: Phaser.Keyboard.CONTROL, label: "Ctrl" },
      { code: Phaser.Keyboard.F, label: "F" }
    ],
    holdMs: 1000,
    when: (state) =>
      PrinceJS.currentLevel === 2 &&
      state.kid.room === 11 &&
      state.tutorial.completed.has("rockets-select") &&
      state.kid.activeWeapon === "rocketLauncher" &&
      state.rocketLauncher.canFire() &&
      !state.kid.specialAction
  },
  {
    id: "rocket-demolition",
    category: "Make your own doorway",
    title: "Break through",
    description:
      "The barrier ahead is in your line of fire. Rockets can turn walls and gates into rubble and blast open the level's exit doors.",
    instruction: "Press Ctrl to fire at the barrier and blast it open.",
    hint: "This tap holds fire until the barrier breaks. A shattered exit still leads to the next level; the entrance door stays protected.",
    keys: [
      { code: Phaser.Keyboard.CONTROL, label: "Ctrl" },
      { code: Phaser.Keyboard.F, label: "F" }
    ],
    holdMs: 100,
    holdUntil: (state) => state.tutorial.sequence.rocketTargetDestroyed(),
    maxHoldMs: 4000,
    when: (state) =>
      PrinceJS.currentLevel === 2 &&
      state.level.number === 2 &&
      state.tutorial.completed.has("rockets-fire") &&
      state.kid.activeWeapon === "rocketLauncher" &&
      !state.kid.specialAction &&
      state.kid.action === "stand" &&
      state.rocketLauncher.canFire() &&
      !!state.tutorial.sequence.findRocketTarget()
  }
];
