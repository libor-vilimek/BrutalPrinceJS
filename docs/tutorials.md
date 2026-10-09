# Tutorials

The tutorial is an expanding collection of short, contextual lessons. Each lesson pauses the game behind an amber panel with Persian-inspired geometric ornaments, explains one new mechanic, and displays the key needed to try it. A fresh press of a displayed key closes the panel, resumes play, and performs that input. Other keys, Escape, and clicks on the backdrop do not dismiss it. The displayed keycaps also work as touch/mouse buttons. Tab cycles through them without leaving the panel.

## Current contents

| Lesson          | When it appears                                                                                                     | Accepted input                                           | Assisted hold                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| The twin flames | Level 1, after the opening wall-torch collection, when the Prince is standing and ready to use the selected torches | Ctrl or F; the keycap buttons; controller B / Y / L / ZL | 1,800 ms of gameplay, covering the draw and a full spin |

The torch lesson explains that holding the attack key draws both torches and spins in place to ignite nearby enemies, and releasing it stows them. Its first attempt needs only a tap. The regular torch controls, reach, damage rules, animations, inventory and opening collection are unchanged.

Completed lessons stay completed through level restarts and level changes in the current game session. Starting a new game or reloading the page resets tutorial progress. Progress is not stored in the saved URL or browser storage.

## Adding a lesson

Add an entry to `PrinceJS.TutorialLessons` in [src/TutorialLessons.js](../src/TutorialLessons.js). Keep the list in the desired priority order. Only the first eligible, incomplete entry opens, and another cannot interrupt an active lesson or its assisted input.

```js
{
  id: "unique-stable-id",
  category: "Movement",
  title: "A short lesson title",
  description: "Explain the new mechanic in one or two short sentences.",
  instruction: "Explain how to use the displayed key during normal play.",
  hint: "Explain any assistance supplied on this first attempt.",
  keys: [{ code: Phaser.Keyboard.UP, label: "↑" }],
  holdMs: 0,
  when: function (state) {
    // Supply a real contextual condition: correct location, owned equipment,
    // required selected weapon, and an actor state in which the input works.
    return state.kid.action === "stand" && /* your trigger */ false;
  }
}
```

- `id`, `title`, `description`, `keys`, and `when(state)` define the lesson. IDs must be unique. Each key entry has a Phaser key code and a human-readable label; entries are alternatives, not a key combination.
- `category`, `instruction`, and `hint` are optional text. All lesson text is inserted as text, not HTML. Keep it concise for small screens.
- `holdMs` is optional and defaults to zero. A zero-length hold still delivers the normal key-down signal, a rendered gameplay update, and a native actor update (which runs every 80 ms). This prevents a short movement key press from disappearing between actor ticks. Set a positive value when the taught sequence requires continued input, including the time to draw a weapon before using it.
- Optional `gamepadButtons` lists equivalent controller buttons. Pressing one after opening the panel performs the first configured keyboard input. A controller button held before the panel appears must be released first.
- `when(state)` is checked during gameplay. Wait for a safe, useful moment: do not interrupt an intro, pickup, fall or story sequence. Ensure the demonstrated input can actually work. The controller also rejects dead, hidden or inactive actors, finished games and already paused games.

For explicit scripted triggers, `state.tutorial.show(lesson)` returns whether the panel opened. It applies the same eligibility guards and completion tracking, but the caller is responsible for the contextual condition normally supplied by `when`.

## Input and pause behavior

[Tutorial.js](../src/Tutorial.js) owns the lesson lifecycle and input capture. It uses Phaser's pause, so actors, enemies, hazards, projectiles, camera movement and animation updates stop together. The campaign countdown also freezes exactly, without rounding to a minute. The tutorial owns this pause until the required input; switching tabs cannot dismiss it. Existing user mute settings are preserved.

The accepted input uses the existing Phaser key and its normal signals. Assistance delays an early key release for the requested number of **simulation milliseconds**. It uses the same 50 ms maximum frame step as weapon controllers, so a slow frame cannot consume an entire demonstration. A physically held keyboard key remains held after this minimum duration; the player still releases it normally. Repeated key-down events cannot duplicate the initial action. Focus loss, ordinary pausing, death and level shutdown clear assistance, so it cannot leak into later play.

Phaser pause does not suspend native JavaScript `setTimeout` callbacks. Existing story sequences use those callbacks, so choose lesson triggers outside such sequences; future lessons that need to interrupt one must make its timers pause-aware first.

[TutorialOverlay.js](../src/TutorialOverlay.js) owns the accessible dialog and keycaps. [tutorial.css](../assets/web/tutorial.css) supplies the responsive orange parchment, layered border and vector ornaments. It sits above the game canvas, independent of camera zoom, screen flipping and blood/effect layers. Small viewports keep the controls reachable inside the panel without adding page scrollbars.

## Verification

Run `npm test`. Open [tests/tutorial-browser.html](../tests/tutorial-browser.html) through the local server for a muted browser check of the real opening, pause, wrong keys, assisted torch draw/spin/stow, restart and level transition. The page also allows replaying the first lesson and inspecting its responsive layout. Existing combat browser checks suppress tutorial prompts so their scenarios retain control of input. Keep audio off while testing.
