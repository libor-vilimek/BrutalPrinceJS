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
  }
];
