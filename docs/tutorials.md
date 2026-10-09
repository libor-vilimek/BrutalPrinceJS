# Tutorials

The tutorial is an expanding collection of short, contextual lessons. Each lesson pauses the game behind an amber panel with Persian-inspired geometric ornaments, explains one new mechanic, and displays the key needed to try it. A fresh press of a displayed key closes the panel, resumes play, and performs that input. Other keys, Escape, and clicks on the backdrop do not dismiss it. The displayed keycaps also work as touch/mouse buttons. Tab cycles through them without leaving the panel.

## Current contents

| Lesson                | When it appears                                                                      | Accepted input                              | Assistance                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| The twin flames       | Level 1, after collecting both wall torches                                          | Ctrl / F; keycap; controller B / Y / L / ZL | 1,800 ms for drawing and spinning                                                                      |
| Trust your grip       | Level 1, after the guided walk to the opened shaft                                   | Shift + Down together; combined keycap      | Holds both keys until the native climb-down reaches a hanging pose; keeps the grip for the next lesson |
| A gift for the guards | Hanging over the two guards in room 2                                                | Ctrl / F; keycap                            | Selects the already collected molotov and keeps the grip through its real hanging throw                |
| Choose your firepower | Entering room 3 to the right with the minigun                                        | 3; keycap                                   | Selects the gun, even if already selected; shows illustrated 1 / 2 / 3 inventory cards                 |
| Let the barrels sing  | After selecting the minigun                                                          | Ctrl / F; keycap                            | 2,300 ms for drawing and a sustained burst                                                             |
| Bring him down        | Level 2, room 1 (third room left), when an upper guard's ankle is actually reachable | X; keycap                                   | 550 ms; the normal whip finishes the caught pull after release                                         |
| A heavier answer      | Collecting the relocated launcher in level 2, room 11                                | 4; keycap                                   | Selects the launcher and shows its inventory card                                                      |
| Clear a path          | After selecting the launcher                                                         | Ctrl / F; keycap                            | 1,000 ms for drawing and the first rocket                                                              |

The torch lesson explains that holding the attack key draws both torches and spins in place to ignite nearby enemies, and releasing it stows them. Its first attempt needs only a tap. The lesson uses the regular torch controls, reach, damage rules, animations and inventory.

One guard stands beside the opening torches, facing away from the Prince. He does not turn, approach or attack, so the collection and first draw finish without losing health. The guard stands one tile farther right than the original tutorial placement. After taking the second torch, the Prince retreats only half a tile, finishing near local x = 61: the guard stays within the unchanged torch reach, and the molotov still waits to be collected. The assisted spin ignites the guard through the normal fire attack and burning death animation. This guard is a deliberate exception to the usual guard pursuit behavior; the other enemies remain reactive.

The target is defined in `assets/maps/level1.json`, in room 1 at location 13, facing right (`direction: 1`) with `active: false`. The existing inactive-enemy setting disables his combat reactions while leaving him visible and vulnerable to the torches. `burnRoute: "opening-shaft"` gives only this guard a deterministic panic route: run into the opening, land on the lower shelf, stand on its loose board until it falls, then fall through the real room link. Terrain collision, the board's shaking, gravity and the five-second burning lifetime remain normal. Other burning guards keep their usual panic movement. Restarting the level restores the passive target and floor.

After the first spin is stowed, the player keeps control, collects the existing molotov pickup and jumps down one floor. [TutorialSequence.js](../src/TutorialSequence.js) waits until the Prince has landed on the lower shelf beside the shaft (room 1, row 2, column 4 or 5) with the bottle collected. It then briefly guides him to the shaft and turns his back to the edge. The Shift + Down lesson performs the native climb-down. Its assisted grip carries across the molotov prompt and throw, then releases unless the player is physically holding Shift. Movement, pickups and floor destruction all use their normal game mechanics. After a restart, an unfinished route waits for the restored guard to burn and the player to jump down again.

The minigun remains on its existing floor in room 2. The next selection lesson waits for the player to move right into room 3. Its two nearest entrance soldiers (locations 13 and 14) are omitted; the first remaining soldier starts at location 15, leaving five clear columns for the normal draw animation. The whip stays beside the entrance of level 2; its lesson calls the real `whip.findSnag(enemy)` geometry check in room 1, so enemies behind solid floors or outside reach cannot trigger it. The launcher has moved from the entrance to clear floor at room 11, column 8, row 1: four rooms left and one map row above the start, beyond the whip encounter. Its approach is clear of generated crowds. The level-3 fallback, level-4 automatic ownership and cross-level inventory rules are unchanged.

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
- A key entry may include `modifiers: [Phaser.Keyboard.SHIFT]`. It then represents a chord with its primary `code`: both keys must be down, in either press order. The displayed combined keycap sends the same complete chord for touch/mouse users.
- `category`, `instruction`, and `hint` are optional text. All lesson text is inserted as text, not HTML. Keep it concise for small screens.
- `holdMs` is optional and defaults to zero. A zero-length hold still delivers the normal key-down signal, a rendered gameplay update, and a native actor update (which runs every 80 ms). This prevents a short movement key press from disappearing between actor ticks. Set a positive value when the taught sequence requires continued input, including the time to draw a weapon before using it.
- `holdUntil(state)` optionally waits for an actual animation outcome as well as `holdMs`. Always pair it with `maxHoldMs`, a bounded timeout that releases assistance if the expected action cannot finish. `onAccept(state, tutorial)` prepares the real action before key-down; `onComplete(state, tutorial)` runs only when the expected outcome was reached. The ledge lesson uses `tutorial.holdKey(SHIFT)` and `releaseHeldKey(SHIFT)` to carry a temporary grip between lessons.
- `inventory` lists weapon IDs for illustrated number-key cards: `twinTorches`, `molotov`, `minigun`, `rocketLauncher`. The illustrations are crisp vector versions of the in-game equipment.
- Optional `gamepadButtons` lists equivalent controller buttons. Pressing one after opening the panel performs the first configured keyboard input. A controller button held before the panel appears must be released first.
- `when(state)` is checked during gameplay. Wait for a safe, useful moment: do not interrupt an intro, pickup, fall or story sequence. Ensure the demonstrated input can actually work. The controller also rejects dead, hidden or inactive actors, finished games and already paused games.

For explicit scripted triggers, `state.tutorial.show(lesson)` returns whether the panel opened. It applies the same eligibility guards and completion tracking, but the caller is responsible for the contextual condition normally supplied by `when`.

## Input and pause behavior

[Tutorial.js](../src/Tutorial.js) owns the lesson lifecycle and input capture. It uses Phaser's pause, so actors, enemies, hazards, projectiles, camera movement and animation updates stop together. The campaign countdown also freezes exactly, without rounding to a minute. The tutorial owns this pause until the required input; switching tabs cannot dismiss it. Existing user mute settings are preserved.

The accepted input uses the existing Phaser keys and their normal signals. Assistance delays an early key release for the requested number of **simulation milliseconds**. It uses the same 50 ms maximum frame step as weapon controllers, so a slow frame cannot consume an entire demonstration. A physically held keyboard key remains held after this minimum duration; the player still releases it normally. Repeated key-down events cannot duplicate the initial action. Focus loss, ordinary pausing, death and level shutdown clear assistance, carried grip and guided input, so they cannot leak into later play. The guided walk uses the native step and turn animations before actor updates; the game remains live throughout. The emergency kick on C interrupts that walk, and global shortcuts remain available.

Phaser pause does not suspend native JavaScript `setTimeout` callbacks. Existing story sequences use those callbacks, so choose lesson triggers outside such sequences; future lessons that need to interrupt one must make its timers pause-aware first.

[TutorialOverlay.js](../src/TutorialOverlay.js) owns the accessible dialog and keycaps. [tutorial.css](../assets/web/tutorial.css) supplies the responsive orange parchment, layered border and vector ornaments. It sits above the game canvas, independent of camera zoom, screen flipping and blood/effect layers. Small viewports keep the controls reachable inside the panel without adding page scrollbars.

## Verification

Run `npm test`. Open [tests/tutorial-browser.html](../tests/tutorial-browser.html) through the local server. **Run tutorial checks** covers the controller, pause, wrong keys, first spin, restart and level transition. **Run campaign lessons** plays the complete first-level route, including the actual loose floor, player-controlled bottle pickup and jump, guidance after landing, chord, hanging molotov and minigun. It verifies that waiting upstairs never starts guidance. It then checks the entrance whip pickup and uses test checkpoints on the real level-2 map to exercise an existing upper guard, the relocated launcher and their lessons. These checkpoints skip travelling between distant rooms; the lower whip corridor represents an already cleared encounter, while the upper guards, local attacks and pickups remain real. **Preview weapon cards** follows the first-level route and stops at the minigun selection panel. **Inspect state** reports the current route and actor positions. Existing combat browser checks suppress tutorial prompts so their scenarios retain control of input. Keep audio off while testing.
