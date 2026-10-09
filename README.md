# Prince of Persia (JS) - princejs.com

Prince of Persia reimplementation written in HTML5 / JavaScript (MS-DOS version)

Project decisions and contribution guidance: [ruleset.md](ruleset.md) and [AGENTS.md](AGENTS.md).

## Play Online

- Browser: https://princejs.com
- Keyboard
  - `Cursor keys`: Movement
    - `Left / Right key`: Move Left/Right, Advance/Retreat
    - `Up key`: Jump, Climb Up
    - `Down key`: Crouch, Crawl, Climb Down
  - `SHIFT`: Walk slowly, Drink Potion, Grab Edge
  - `CTRL / F`: Hold to spin torches, draw and fire a gun, or charge a molotov and release to throw
  - `CTRL / F` with molotov selected while hanging: Immediately light and drop it below
  - `1 / 2 / 3 / 4`: Select torches / molotov / minigun / rocket launcher when owned
  - `X`: Use the whip directly when owned; tap for one strike or hold for repeated lashes; caught ankle pulls finish after release
  - `C`: Roundhouse kick; speeds up climbing and interrupts weapon animations near enemies, then performs a protected spin that launches one guard, whose body can topple one more, without HP damage (hold to repeat)
  - `J`: Equip/activate the jetpack, or remove it; fly with the cursor keys
  - `SPACE`: Show Remaining Time
  - `ENTER`: Continue Game
- Mouse
  - See Touch Controls for Mobile
- Game Controller
  - `Left / Right Stick, DPad`: Movement
    - `Left / Right`: Move Left/Right, Advance/Retreat
    - `Up`: Jump, Climb Up
    - `Down`: Crouch, Crawl, Climb Down
  - `A / R / ZR Button`: Jump, Climb Up
  - `B / Y / L / ZL Button`: Drink Potion, Grab Edge, Fire Equipped Weapon
  - `X`: (1x) Show Remaining Time, (2x) Restart Level
  - `Minus Button`: Previous Level
  - `Plus Button`: Next Level
  - `Any`: Continue Game

## Camera

Gameplay uses 70% zoom, framing the complete current room with more than two extra tile columns on each side and a glimpse of the rooms above and below. Approaching a side exit gently expands the preview to more than four columns of the next room; entering it finishes a short smooth pan to frame the complete new room, even when the Prince stops just inside the entrance. Transitions up or down still cut immediately. The health display stays fixed at its original size, and gates and choppers in all partially visible neighboring rooms remain audible. Menus and cutscenes keep their original zoom.

## Weapons and Jetpack

The Prince starts with 10 health points. Large red potions increase maximum health by one without a ten-point cap and refill it completely; the increased maximum carries into the next level and is restored from saved URLs. Above ten, the HUD shows the exact current/maximum count beside a life icon. Small red potions recover exactly one point up to that maximum; levels 1–13 contain 56 additional recovery bottles on permanent floors away from traps and story scenes. Hold `SHIFT` beside a bottle to drink it. Each enemy sword hit removes one point, including when the Prince has no weapon drawn; a surviving hit briefly staggers him before normal movement resumes.

A fixed opening animation takes the two real wall torches from the first level's starting screen and tucks them away. The Prince briefly steps beside each socket, grips its handle with a bent arm and returns to his landing position. Torches are always owned and selected initially. The molotov remains on the upper starting platform. The minigun waits on plain floor on the right of the room below (the second screen), between the columns where it stays clearly visible; two guards nearby introduce the molotov before collecting the gun. Walk over a pickup to collect it. From level 2 onward the Prince automatically owns the molotov and minigun. In level 2, the whip waits to the left of the starting Prince, directly beside the rocket launcher at the arrival door; walking left collects both. The whip is automatically owned from level 3 onward. Collected equipment carries into the next level; level 3 still offers a launcher near the entrance if it was missed, and level 4 onward grants it automatically. Restarting restores the equipment brought into that level and resets pickups collected during the current attempt. Granted weapons have no visible pickup; idle weapons stay tucked away.

All equipment poses retain the original Prince's pale clothes, bare arms, small ochre-haired head and short neckline. Torch and molotov animations keep the native clothing palette; gun muzzle flashes still briefly light him yellow. Arms bend at the elbows and keep the original proportions.

Select `1` and hold `CTRL` or `F` to draw both torches and spin in place. The sweep reaches farther than enemy swords and ignites every reachable nearby guard. The compact arm motion retains the same wide fire trail and attack reach. Sword hits can remove a life during the opening or draw animation without interrupting a surviving Prince; spinning blocks sword hits. Releasing the trigger stows both torches before movement resumes. A burning enemy immediately stops fighting and counts as dead, then runs frantically for five seconds through real rooms, gaps and traps before leaving a persistent charred body. Burning guards have two alternating rough vocal screams, with a hard limit of two overlapping burning voices. Only burns in the camera's visible rooms can be heard; charring, leaving the view, muting and level cleanup stop their voices. Ordinary kills still have no death jingle.

After collecting the whip, press `X` for one strike or hold it to lash repeatedly. The whip is a separate action outside the numbered weapon inventory: collecting or using it keeps the selected main weapon. It deals ordinary weapon damage to nearby enemies. A guard standing just above the Prince near an open ledge can instead be caught by the ankle and dragged into the gap, including when the Prince stands directly underneath facing either way. Once an ankle is caught, releasing `X` lets the full pull and swing finish before stowing the whip; holding `X` also waits for that pull before starting the next swing. The Prince stays in place, with movement, other weapon attacks and weapon selection locked until stowing finishes; the emergency kick exception below still applies. The guard's fall and recovery continue independently. The cord automatically wraps around the floor's open edge within its reach; solid floors, walls and closed gates still block it. Even a short fall removes one life and leaves the guard face down before a slow recovery; longer falls and traps retain their native fatal behavior.

Hold `CTRL` or `F` to fire in the direction the Prince faces. Press `2` for molotov, `3` for minigun or `4` for rocket launcher when owned; all stay in your inventory. Guns are hidden while idle. The minigun starts with a quick reach behind the back and draw animation, then the Prince braces it with both hands. Drawing, firing and stowing lock movement. Releasing fire stops shots immediately, then the Prince puts the minigun behind his back and lowers his hands in a 0.32-second animation before movement resumes. A new trigger press waits for stowing to finish and draws again; weapon selection cannot skip it. Releasing an incomplete draw reverses that shorter part of the motion. Its head and ochre hair use the original Prince sprite at native size, with a small clenched smile. Muzzle flashes light his face and clothes yellow. The Prince's sword is disabled, including automatic sword combat near enemies. `SHIFT` keeps ordinary slow walking, potion pickups and ledge grabs without drawing a gun. The touch action area and controller action buttons can also fire; potion pickups keep priority on those inputs. Both guns have unlimited ammunition; firing stops during jumps, climbing, item animations, and jetpack flight.

A molotov pickup remains on the upper platform of the first level's starting screen. Collect it and select `2`. On the ground, hold `CTRL` or `F` to charge the distance, then release to light and throw it. Holding Up selects a 70-degree arc instead of the normal 30 degrees. Wall and ceiling impacts shatter the bottle and drop burning oil onto the real floor below; walls also keep attached flames. Hold a ledge with `SHIFT`, then press `CTRL` or `F`: the Prince immediately keeps one hand on the ledge while quickly taking out a lighter, holding its flame in his mouth, lighting the bottle and dropping it straight below. The sequence takes about a second. Ground fire instantly kills and ignites enemies; collected molotovs have unlimited ammunition.

Press `C` for a roundhouse kick, available from level 1 without a pickup. The Prince performs the spin on open ground even when there is nobody to hit. With a reachable enemy nearby, it also speeds up the real climb and other ground animations eightfold and cancels weapon drawing, attacking or stowing, including the whip, without changing the selected weapon. This is the explicit exception to the usual animation locks described above. The opening torch pickup completes both actual wall captures before yielding. The Prince pivots on one foot through a slower 1.05-second spin and is protected against enemy sword hits throughout its wind-up and follow-through. Holding C repeats it at most once per 1.275 seconds. Nearby for the emergency animation bypass means 144 world pixels on the same reachable floor (the destination floor during a climb); the actual kick only reaches 32 pixels (one tile), with contact windows approximately 0.18–0.43 seconds in front and 0.49–0.81 seconds behind. A spin directly hits at most one guard across both windows.

Directly kicked guards scatter in varied low skids, high arcs and cartwheels, with blood bursts and wall bounces. Each directly kicked body can knock down at most one additional guard through actual body contact, for a maximum of two victims per kick. That secondary victim only falls backward a short distance and cannot knock down anyone else. Launch strength, angle, rotation and slide distance vary between kicks. After landing, guards see little orbiting stars and spend 2–2.45 seconds recovering without attacking. Kicks, body impacts, launch height and short falls cause no HP loss; blood is cosmetic. Native traps and fatal drops still apply. Floors, ceilings, walls, closed gates and room links constrain flight. No enemy means no animation bypass. Death, freefall, jetpack flight and story exits retain their normal behavior; skeleton and shadow mechanics are preserved. The whip remains on X with its existing ledge pull and damage.

The jetpack first appears beside the starting Prince in level 12. Walk over it to collect it; from level 13 onward it is automatically owned. Press `J` to equip and activate it. The Prince holds both straps and flies with the cursor keys; releasing the keys lets him hover. Flying upward into a loose floor smashes it with his head, immediately opening a passage while the broken slab falls. Solid walls, gates, floors and ceilings still block him, and he can fly through connected room openings. Press `J` again to remove the pack and resume ordinary movement or falling. Collection and level entry leave the pack removed until J is pressed.

The minigun fires rapid bullets with a bright yellow muzzle flash, heavy firing audio, and brass casings. Spent casings stay for the entire level, bounce on floors, and stack into growing piles across ten depth layers on the floor. Each layer piles independently, and every pile remains when you leave and revisit rooms. Restarting the level clears its piles and restores the pickups.

The rocket launcher has a quick 0.46-second shoulder draw, a braced two-handed firing pose with yellow flash lighting, and a 0.34-second stow. These animations lock movement like the minigun and preserve the original Prince's head and hair. Rockets accelerate noticeably from 90 to 720 pixels per second in 0.7 seconds, leave fiery smoke trails and explode on impact, dealing damage to nearby enemies. Their 720-pixel range covers the launch room and the entire next room. Each rocket can blast a wall or gate into walkable rubble, and repeated shots can tunnel through a solid adjacent room. Exit doors stay open when blasted, preserving the level exit. Openings persist when revisiting rooms. Intact walls shield enemies from the first blast; later shots can pass through the breach. Bullets and blasts trigger guards' normal deaths, and special enemies retain their original rules.

Blasting the next-level exit also tears its native door panels and stonework into flying fragments. They settle around a permanently cracked, scorched doorway that still leads to the next level. Both halves of the arrival door remain protected from rocket damage; rockets pass straight through without impact or explosion, whether the arrival door is open or closed.

Wall courses, textures and palace brick colors follow world coordinates, so walls in neighboring rooms fit together. Areas without room data stay empty. Linked neighboring rooms remain visible through their entrances. The game fits the visible browser viewport without scrollbars and preserves its aspect ratio when the window changes size.

Shooting guards sprays blood onto floors, walls, gates and ceilings. Blood spreads across ten floor depth layers, with splashes and drips on nearby front masonry. Cached stains retain the same pixels for the entire level, including when leaving and revisiting rooms. Blood on an exit facade stays behind the Prince; blood on a falling board disappears when its supporting floor drops. Minigun deaths alternate between a tumbling face hit that throws the body several tiles back, a torn arm, a waist split, a spinning severed head and a leg collapse. Rocket kills scatter the head, torso, arms and legs outward with three variations of lift and spin. Bodies and fragments collide with real terrain, cross linked room boundaries, leave blood trails, bounce, slide and stay where they settle. Restarting or changing the level clears stains and remains. The original enemy health, death callbacks and story behavior still run; skeletons and the shadow keep their special rules.

Every native and bundled custom level adds crowds of soldiers on safe permanent floors, while starting areas, hazards and story puzzle routes stay clear. The first two missions have 154 and 183 additional soldiers respectively. Nearby soldiers react independently and pursue a visible Prince they can reach on the same floor; the enemy health display follows the nearest relevant opponent. Skeleton, shadow and Jaffar story events keep their original actors.

Run `npm test` for camera, weapon collision and inventory tests. Open `http://localhost:8080/tests/minigun-browser.html` after starting the local server for the browser playtest, including running and flying through room boundaries in both directions. Use `http://localhost:8080/tests/prince-animation-browser.html` to compare the original Prince with the equipment poses at 3× native size, scrub the animations and check either facing direction.

## Play Mobile

- Browser: https://princejs.com
  - Use Landscape Mode
  - Single Tab
  - Disable Landscape Tab Bar in Browser Settings
- Add to Home Screen to start as Fullscreen App
- Reduced difficulty (50%):
  - https://princejs.com?strength=50
- Touch Controls (tap/drag area on screen, fight mode in brackets):

  ![Mobile](assets/web/mobile.svg)
  - Dragging can be used to trigger continuous move sequences, e.g.
    - _Run Jump_: Tap Left or Right -> Hold -> Drag in Left or Right corner
    - _Jump Grab_: (Run) Jump -> Hold -> Drag to Center (Shift)

- Weapons
  - _Shift_: Fire the equipped weapon

## Play on Apple Watch

- Mail/Message
  - Send mail or message to yourself with body: https://princejs.com
  - On Apple Watch open Mail or Message app
  - Click included link to open Browser
- Siri
  - Tell Siri 'princejs.com' on Apple Watch
  - Watch out for correct localized pronunciation
- Play using Touch Controls as on Mobile

## Play GitHub Version

- Browser: https://oklemenz.github.io/PrinceJS

## Play Locally

- Install [Node.js](https://nodejs.org)
- Clone: `https://github.com/oklemenz/PrinceJS.git`
- Terminal:
  - `npm install`
  - `npm start`
- Browser: Open the local address printed by `npm start`, usually `http://localhost:8080`. If another server already uses that port, the new server uses the next available port.

The local server serves this checkout directly with browser caching disabled; no build is needed. If the game was opened before this setting changed, restart the server and press `Ctrl+F5` once to clear the previously cached version. The online links above point to the original game, not this local version.

## Deploy to Heroku

Deploy the repository with Heroku's Node.js buildpack and include both `package.json` and `package-lock.json`. Heroku runs `npm start` automatically; no build step or Procfile is needed. The server binds to `0.0.0.0` and reads the port from Heroku's `PORT` environment variable.

`http-server` is a runtime dependency because it serves the game in production. Keep it under `dependencies`: Heroku removes `devDependencies` before starting the app, which otherwise causes `http-server: not found` and an H10 crash. After changing dependencies, redeploy so Heroku installs the updated lockfile.

## Options

Url parameters are leveraged to save game state automatically (shortcut in brackets)

- `level (l)`: Current Level (1-14, default: 1)
- `health (h)`: Max Health (default/minimum: 10; larger saved values restore potion bonuses)
- `time (t)`: Remaining Minutes (1-600, default: 600)
- `strength (s)`: Guard Strength in "%" (0-100, default: 100)
- `width (w)`: Game Width in "px" (default: 0 (fit to screen))
- `shortcut (_)`: Write url in shortcut version (default: false)

Default url looks as follows:

http://127.0.0.1:8080?level=1&health=10&time=600&strength=100&width=0

Default shortcut url looks as follows:

http://127.0.0.1:8080?l=1&h=10&t=600&s=100&w=0&_=true

Manual adjustments of url parameters is possible as preset options.

## Custom Levels

Apoplexy (https://apoplexy.github.io/apoplexysite/) can be used to build custom
levels.
Custom levels can be played performing the following steps.

### Single Conversion

- Save level as XML file in Apoplexy, e.g. `./xml/level1.xml`
- Call convert script, e.g. `npm run convert .../xml/level1.xml`
  - A JSON file is placed at `/assets/maps/`, e.g. `/assets/maps/level101.json`
- Custom level ids starts beyond 100, e.g. `level1.xml` gets id `101`, etc.
  - An optional second parameter can be used to control level offset
  - e.g. `npm run convert .../xml/level1.xml 200` generates `/assets/maps/level201.json`
- Start game locally with `npm start` and open game in browser
- Change Url and set parameter `level` to the respective id, e.g. `level=101`
- Note: No special events are supported

### Batch Conversion

- Place level files into folder `/converter/<xxx>`, where `<xxx>` stands for the offset (default: 100)
  - e.g. `/converter/100`: place all levels starting with 100 offset
- Execute `npm run convert`
- Corresponding JSON files are placed at `/assets/maps/`

### Level Numbers

Converted levels from https://www.popot.org/custom_levels.php:

- [99](https://princejs.com?level=99&strength=50): Chamber Play (own)
- [100](https://princejs.com?level=100&strength=50): Tower of Revenge (own)
- [101-114](https://princejs.com?level=101&strength=50): Prince of Persia Revisited ([source](https://www.popot.org/custom_levels.php?mod=0000163))
- [115-128](https://princejs.com?level=115&strength=50): Jaffar's House ([source](https://www.popot.org/custom_levels.php?mod=0000220))
- [129-142](https://princejs.com?level=129&strength=50): Ipank's Levels ([source](https://www.popot.org/custom_levels.php?mod=0000151))
- [143-156](https://princejs.com?level=143&strength=50): Barre's Alternative ([source](https://www.popot.org/custom_levels.php?mod=0000189))
- [157-170](https://princejs.com?level=157&strength=50): Miracles Don't Exist ([source](https://www.popot.org/custom_levels.php?mod=0000098))
- [171-184](https://princejs.com?level=171&strength=50): Babylon Tower Climb ([source](https://www.popot.org/custom_levels.php?mod=0000109))
- [185-198](https://princejs.com?level=185&strength=50): Lost in Errors ([source](https://www.popot.org/custom_levels.php?mod=0000144))
- [199-212](https://princejs.com?level=199&strength=50): Story Retold ([source](https://www.popot.org/custom_levels.php?mod=0000146))
- [213-226](https://princejs.com?level=213&strength=50): Prince of Persia Guard Revolt ([source](https://www.popot.org/custom_levels.php?mod=0000162))
- [227-240](https://princejs.com?level=227&strength=50): Return of Prince ([source](https://www.popot.org/custom_levels.php?mod=0000207))
- [241-254](https://princejs.com?level=241&strength=50): The Sequel ([source](https://www.popot.org/custom_levels.php?mod=0000273))
- [255-268](https://princejs.com?level=255&strength=50): Nahemsan ([source](https://www.popot.org/custom_levels.php?mod=0000272))
- [269-282](https://princejs.com?level=269&strength=50): 4-Rooms Levelset ([source](https://www.popot.org/custom_levels.php?mod=0000052))
- [283-296](https://princejs.com?level=283&strength=50): Repetition of Time ([source](https://www.popot.org/custom_levels.php?mod=0000010))
- [297-310](https://princejs.com?level=297&strength=50): Same Story Different Version ([source](https://www.popot.org/custom_levels.php?mod=0000276))

### Level Walkthrough

- **Level 99:** https://youtu.be/Aj3tfAaXD4c

![Level 99 - Chamber Play](assets/web/level99.gif)

- **Level 100:** https://youtu.be/PAHACXdWQ_M

![Level 100 - Tower of Revenge](assets/web/level100.gif)

## Credits

- https://github.com/ultrabolido ([PrinceJS](https://github.com/ultrabolido/PrinceJS))
- https://github.com/jmechner ([Prince-of-Persia-Apple-II](https://github.com/jmechner/Prince-of-Persia-Apple-II))
