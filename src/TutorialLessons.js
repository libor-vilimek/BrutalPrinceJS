"use strict";

// Add lessons here; see docs/tutorials.md for triggers, key input and timing.
PrinceJS.TutorialLessons = [
  {
    id: "twin-torches",
    category: "The art of combat",
    title: "The twin flames",
    description: "Your torches are more than a light in the dark. Draw them and spin to set nearby enemies ablaze.",
    instruction: "Hold to spin. Release to put the torches away.",
    hint: "For this first try, one tap carries you through a full spin.",
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
  }
];
