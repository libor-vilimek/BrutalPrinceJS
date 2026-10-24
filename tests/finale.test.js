"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture() {
  const graphics = (x = 0, y = 0, key, frameName) => ({
    x,
    y,
    key,
    frameName,
    visible: true,
    children: [],
    shapes: [],
    scale: { x: 1, y: 1 },
    anchor: {
      x: 0,
      y: 0,
      setTo(x, y = x) {
        this.x = x;
        this.y = y;
      }
    },
    clear() {
      this.shapes = [];
    },
    beginFill(color) {
      this.color = color;
    },
    endFill() {},
    drawRect(...args) {
      this.shapes.push({ color: this.color, args });
    },
    drawPolygon(...args) {
      this.shapes.push({ color: this.color, args });
    },
    crop(rect) {
      this.cropRect = rect;
    },
    addChild(child) {
      this.children.push(child);
    },
    destroy() {
      this.destroyed = true;
      this.children.forEach((child) => child.destroy());
    }
  });
  const sounds = [];
  const tweens = [];
  const removed = [];
  const cutsceneFrames = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../assets/gfx/cutscene.json"), "utf8")
  ).frames;
  const game = {
    cache: {
      getFrameByName(key, name) {
        return cutsceneFrames[name].frame;
      },
      getImage() {
        return {};
      }
    },
    sound: { noAudio: true, mute: true, volume: 0, stopAll() {}, play() {} },
    make: { graphics, sprite: graphics },
    add: {
      graphics,
      bitmapData(width, height) {
        const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
        const bitmap = {
          width,
          height,
          pixels,
          ctx: {
            fillRect() {},
            drawImage(...args) {
              bitmap.source = args;
            },
            getImageData() {
              return { data: pixels };
            },
            putImageData() {}
          },
          destroy() {
            this.destroyed = true;
          }
        };
        return bitmap;
      },
      audio() {
        const sound = {
          played: 0,
          play() {
            this.played++;
          },
          destroy() {
            this.destroyed = true;
          }
        };
        sounds.push(sound);
        return sound;
      },
      tween() {
        const tween = {
          to() {
            return this;
          },
          onComplete: {
            addOnce(fn) {
              tween.complete = fn;
            }
          }
        };
        tweens.push(tween);
        return tween;
      }
    },
    time: {
      events: {
        remove(timer) {
          removed.push(timer);
        }
      }
    },
    tweens: {
      remove(tween) {
        tween.removed = true;
      }
    }
  };
  const PrinceJS = { currentLevel: 15 };
  let restarts = 0;
  PrinceJS.Restart = () => restarts++;
  const context = vm.createContext({
    PrinceJS,
    Phaser: {
      Rectangle: function (x, y, width, height) {
        Object.assign(this, { x, y, width, height });
      },
      Easing: { Linear: { None: 0 } }
    }
  });
  for (const file of ["PrincePose", "MinigunEffects", "WeaponAudio", "FinaleEffects", "Finale", "Cutscene"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  const sourcePillar = graphics(59, 120, "cutscene", "room_pillar");
  const scene = {
    front: {
      children: [sourcePillar, graphics(240, 120, "cutscene", "room_pillar"), graphics(0, 0, "cover")],
      addChildAt(child, index) {
        this.children.splice(index, 0, child);
      }
    }
  };
  const finale = new PrinceJS.Finale(game, scene);
  const advance = (time, dt = 1 / 60) => {
    while (finale.elapsed < time - 1e-8) {
      finale.update(Math.min(dt, time - finale.elapsed));
    }
  };
  return { PrinceJS, game, scene, finale, advance, sourcePillar, sounds, tweens, removed, restarts: () => restarts };
}

test("the Prince drags native Jaffar by his ankle, releases the foot, then walks to the head and kicks it off", () => {
  const { PrinceJS, finale, advance } = fixture();
  const times = PrinceJS.Finale.TIMES;
  const arrival = finale.pose(3);
  assert.ok(arrival.prince.x > PrinceJS.Finale.STAGE.princeX);
  assert.equal(arrival.body.held, true);
  assert.equal(arrival.body.dragging, true);
  assert.ok(arrival.body.x > arrival.prince.x, "the corpse trails behind the Prince walking left");
  assert.ok(Math.abs(arrival.body.floorContact.y - PrinceJS.Finale.STAGE.floorY) < 1e-9);
  assert.ok(arrival.body.rotation > 0 && arrival.body.rotation < 0.3, "only the held ankle rises off the floor");
  assert.equal(arrival.body.headAttached, true);
  assert.equal(arrival.head.visible, false, "the head stays attached to the dragged native corpse");
  assert.equal(arrival.prince.firing, false);
  assert.equal(finale.pose(4.2).prince.x, finale.pose(4.6).prince.x);
  const lowering = finale.pose(times.release - 0.01);
  assert.ok(Math.abs(lowering.body.y - 165) < 0.1);
  const approach = finale.pose((times.stepOver + times.stand) / 2);
  assert.equal(approach.body.held, false);
  assert.equal(approach.prince.facing, 1);
  assert.ok(approach.prince.x > finale.pose(times.stop).prince.x);
  assert.ok(approach.prince.x < PrinceJS.Finale.STAGE.princeX);
  const grounded = finale.pose(times.stand);
  assert.equal(grounded.body.held, false);
  assert.equal(grounded.body.headAttached, true);
  assert.equal(grounded.body.y, 165);
  assert.equal(grounded.prince.facing, -1);
  assert.equal(grounded.prince.x, PrinceJS.Finale.STAGE.princeX);
  assert.equal(grounded.body.x, approach.body.x, "repositioning never slides or teleports the released body");
  const kicked = finale.pose(times.kick + 0.12);
  assert.ok(kicked.head.x < grounded.head.x);
  assert.ok(kicked.head.y < grounded.head.y);
  assert.equal(kicked.body.headAttached, false);
  assert.equal(kicked.head.visible, true);
  const before = finale.pose(times.kick - 0.0001).prince.kick;
  assert.ok(Math.abs(before - finale.pose(times.kick).prince.kick) < 0.001, "kick extension is continuous at contact");
  assert.equal(finale.effects.jaffarBody.key, "jaffar");
  assert.equal(finale.effects.jaffarBody.frameName, "jaffar-35");
  assert.equal(finale.effects.attachedHead.cropRect.x, 33);
  assert.equal(finale.effects.jaffar.cropRect.x, 33, "the flying head is the same original turban and face");
  advance(times.kick - 0.01);
  assert.equal(finale.effects.attachedHead.visible, true);
  advance(times.kick + 0.01);
  assert.equal(finale.effects.attachedHead.visible, false);
  assert.equal(finale.effects.headLayer.visible, true);
});

test("the pulling hand stays on the ankle and the corpse leaves a continuous permanent blood trail", () => {
  const { PrinceJS, finale, advance } = fixture();
  const effects = finale.effects;
  const drawing = effects.arm;
  let pullingHand;
  effects.arm = function (g, shoulder, target, bend, princess) {
    if (g === this.prince && bend === 1) {
      pullingHand = PrinceJS.PrincePose.arm(shoulder, target, bend).hand;
    }
    drawing.call(this, g, shoulder, target, bend, princess);
  };
  for (const time of [1.8, 2.8, 3.9, 4.55, 4.79]) {
    advance(time);
    const pose = finale.pose(time);
    assert.ok(Math.abs(pose.body.floorContact.y - 165) < 1e-9, "the head never lifts off the ground");
    assert.ok(
      Math.hypot(
        pose.prince.x + pullingHand.x * pose.prince.facing - pose.body.grip.x,
        pose.prince.y + pullingHand.y - pose.body.grip.y
      ) < 1,
      "the original arm proportions still reach the ankle"
    );
  }
  const trail = JSON.stringify(effects.bloodTrail.shapes);
  assert.ok(effects.bloodTrail.shapes.length > 350, "dragging leaves a long visible floor smear");
  const covered = effects.bloodTrail.shapes.filter(({ color }) => color === 0x650f25).map(({ args }) => args[0]);
  assert.deepEqual(
    covered,
    Array.from({ length: 320 - effects.dragBloodX }, (_, i) => 319 - i)
  );
  assert.ok(effects.bloodTrail.z < effects.bodyLayer.z && effects.bodyLayer.z < effects.prince.z);
  advance(18);
  assert.equal(JSON.stringify(effects.bloodTrail.shapes), trail, "the dance and falling stone never erase the trail");
  for (const dt of [1 / 30, 1 / 144]) {
    const other = fixture();
    other.advance(4.79, dt);
    assert.equal(JSON.stringify(other.finale.effects.bloodTrail.shapes), trail, "trail edges do not depend on fps");
  }
});

test("the Princess turns her native head toward the Prince as he passes, without turning her body or hiding her head", () => {
  const { finale } = fixture();
  const effects = finale.effects;
  const head = effects.princessHead;
  const right = finale.pose(2.3);
  const left = finale.pose(3);
  assert.ok(right.prince.x > right.princess.x && right.princess.look > 0);
  assert.ok(left.prince.x < left.princess.x && left.princess.look < 0);
  effects.render(right);
  assert.equal(head.scale.x, -1, "the native head is mirrored to face the arriving Prince on the right");
  effects.render(left);
  assert.equal(head.scale.x, 1, "she follows him to the left after he passes");
  let turningFrames = 0;
  for (let time = 2.5; time < 2.9; time += 0.01) {
    const pose = finale.pose(time);
    effects.render(pose);
    assert.ok(Math.abs(head.scale.x) >= 0.35);
    assert.equal(head.y, -31, "the neck stays attached through the turn");
    assert.equal(effects.princess.x, 200);
    assert.equal(effects.princess.scale.x, 1);
    if (Math.abs(pose.princess.look) < 1) {
      turningFrames++;
    }
  }
  assert.ok(turningFrames > 5, "the head visibly turns over several frames");
  assert.equal(head, effects.princessHead);
});

test("the kicked head clips to the window aperture, fully exits and leaves persistent broken glass and blood", () => {
  const { PrinceJS, finale, advance, sounds } = fixture();
  const times = PrinceJS.Finale.TIMES;
  const hit = finale.pose(times.glass).head;
  assert.ok(Math.abs(hit.x - 22) < 1e-9);
  assert.ok(Math.abs(hit.y - 112) < 1e-9);
  advance(times.glass - 0.01);
  assert.equal(finale.windowBroken, false);
  assert.equal(sounds[1].played, 1);
  advance(times.glass + 0.01);
  assert.equal(finale.windowBroken, true);
  assert.equal(sounds[0].played, 1);
  assert.ok(finale.effects.particles.some((p) => p.type === "glass"));
  assert.equal(finale.effects.headLayer.mask, finale.effects.windowMask);
  assert.equal(finale.effects.windowMask.isMask, true, "the clipping shape never paints over the window");
  assert.equal(finale.effects.windowMask.visible, true, "the mask inherits the actual world's scaling transform");
  assert.equal(
    finale.effects.headLayer.mask,
    finale.effects.windowMask,
    "the mask stays bound before and after crossing"
  );
  assert.ok(
    finale.effects.windowMask.shapes.every((shape) => shape.args.length === 4),
    "one rectangle batch supports Canvas and this version's WebGL stencil mask"
  );
  const brokenPane = JSON.stringify(finale.effects.glass.shapes);
  advance(times.outside);
  assert.equal(finale.effects.headLayer.visible, false, "the head cannot remain visible on the outside wall");
  advance(12);
  assert.equal(finale.effects.headLayer.visible, false);
  assert.equal(sounds[0].played, 1);
  assert.equal(sounds[1].played, 1);
  assert.equal(JSON.stringify(finale.effects.glass.shapes), brokenPane);
  assert.ok(finale.effects.bloodOnFloor);
  assert.ok(finale.effects.floor.shapes.length > 10);
});

test("the Prince fires first, then the Princess draws and fires both rifles while they dance", () => {
  const { PrinceJS, finale, advance } = fixture();
  const times = PrinceJS.Finale.TIMES;
  const shots = [];
  const shoot = finale.effects.shoot.bind(finale.effects);
  finale.effects.shoot = (gun, index) => {
    shots.push({ time: finale.elapsed, index, ...gun });
    shoot(gun, index);
  };
  advance(times.princeFire - 0.01);
  assert.equal(shots.length, 0);
  advance(times.princessDraw);
  assert.ok(shots.length > 0);
  assert.ok(shots.every((s) => s.index === 0));
  assert.ok(finale.pose(9.9).princess.draw > 0 && finale.pose(9.9).princess.draw < 1);
  advance(14);
  assert.deepEqual([...new Set(shots.map((s) => s.index))].sort(), [0, 1, 2]);
  assert.ok(shots.filter((s) => s.index > 0).every((s) => s.time >= times.princessFire));
  for (const gun of shots) {
    assert.equal(gun.visible, true);
    assert.ok(gun.dy < -0.7, "every muzzle points into the ceiling, away from both people");
    const distance = Math.hypot(gun.target.x - gun.x, gun.target.y - gun.y);
    assert.ok(Math.abs(gun.x + gun.dx * distance - gun.target.x) < 0.001, "tracers actually hit the damaged support");
    assert.ok(Math.abs(gun.y + gun.dy * distance - gun.target.y) < 0.001);
    assert.ok(gun.target.y > 10 && gun.target.y < 60, "hits follow real upper masonry, not an arbitrary ceiling strip");
  }
  assert.notEqual(finale.pose(10).prince.step, finale.pose(10.2).prince.step);
  assert.notEqual(finale.pose(11).princess.sway, finale.pose(11.2).princess.sway);
  assert.ok(finale.effects.particles.length < 180, "active effects stay bounded");
  assert.ok(
    finale.effects.prince.z < 30 && finale.effects.princess.z < 30,
    "both actors remain behind original foreground pillars"
  );
});

test("shots crack the supports, release a native arch fragment, and crush Jaffar while every pillar stays upright", () => {
  const { PrinceJS, finale, advance, sourcePillar, scene, sounds } = fixture();
  const times = PrinceJS.Finale.TIMES;
  advance(12.2);
  assert.ok(finale.effects.pillars.every((pillar) => pillar.hits > 0));
  assert.ok(finale.effects.pillars.every((pillar) => pillar.chips > 0));
  assert.ok(finale.effects.particles.some((particle) => particle.type === "stone"));
  assert.ok(finale.effects.pillarDamage.shapes.length > 30);
  assert.equal(finale.effects.fallingArch.visible, false);
  assert.equal(finale.effects.archHole.visible, false);
  advance(times.archFall + 0.6);
  assert.equal(sourcePillar.visible, true);
  assert.equal(finale.effects.fallingArch.visible, true);
  assert.equal(finale.effects.archHole.visible, true, "the detached piece leaves a hole in the actual ceiling arch");
  assert.equal(finale.effects.archDetached, true);
  assert.equal(finale.effects.archSprite.key, finale.effects.archBitmap);
  assert.equal(finale.effects.bodyCrushed, undefined);
  advance(times.archImpact + 0.02);
  assert.equal(finale.effects.bodyCrushed, true);
  assert.equal(finale.effects.bodyLayer.scale.y, 0.38);
  assert.ok(finale.effects.particles.filter((particle) => particle.type === "blood").length >= 24);
  assert.equal(sounds[2].played, 1);
  assert.equal(sounds[3].played, 1);
  const fragment = finale.effects.fallingArch;
  const body = finale.pose(times.archImpact).body;
  const arch = PrinceJS.Finale.ARCH;
  assert.ok(fragment.x >= body.x && fragment.x <= body.x + 33, "the heavy stone lands on the actual corpse");
  const bottom = Math.max(
    ...arch.outline.map(
      ([x, y]) =>
        fragment.y +
        Math.sin(fragment.rotation) * (x - Math.floor(arch.width / 2)) +
        Math.cos(fragment.rotation) * (y - Math.floor(arch.height / 2))
    )
  );
  assert.ok(bottom >= 160 && bottom <= 168);
  assert.equal(scene.front.children.at(-1).key, "cover", "the fade still covers the falling stone");
  assert.ok(scene.front.children.indexOf(finale.effects.pillarDamage) < scene.front.children.indexOf(fragment));
  advance(18);
  assert.equal(sounds[2].played, 1);
  assert.equal(sounds[3].played, 1);
  const pillars = scene.front.children.filter((child) => child.frameName === "room_pillar");
  assert.equal(pillars.length, 2);
  assert.ok(pillars.every((pillar) => pillar.visible));
  assert.deepEqual(
    pillars.map((pillar) => [pillar.x, pillar.y]),
    [
      [59, 120],
      [240, 120]
    ]
  );
  finale.destroy();
  assert.equal(sourcePillar.visible, true);
  assert.equal(finale.effects.archBitmap.destroyed, true);
  assert.equal(finale.effects.archBackingBitmap.destroyed, true);
  assert.ok(sounds.every((sound) => sound.destroyed));
});

test("the arch stone starts at its source pixels, accelerates downward, and never removes or moves a pillar", () => {
  const { PrinceJS, finale, advance, sourcePillar } = fixture();
  const arch = PrinceJS.Finale.ARCH;
  const times = PrinceJS.Finale.TIMES;
  const sourceX = arch.x + Math.floor(arch.width / 2);
  const sourceY = arch.y + Math.floor(arch.height / 2);
  const bitmap = finale.effects.archBitmap;
  assert.equal(bitmap.width, arch.width);
  assert.equal(bitmap.height, arch.height);
  assert.ok(
    bitmap.pixels.some((value, index) => index % 4 === 3 && value === 0),
    "the native piece has an irregular transparent outline"
  );
  assert.ok(bitmap.pixels.filter((value, index) => index % 4 === 3 && value > 0).length > 300);
  const frame = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/gfx/cutscene.json"), "utf8")).frames.room
    .frame;
  assert.deepEqual(bitmap.source.slice(1, 5), [frame.x + arch.x, frame.y + arch.y, arch.width, arch.height]);
  advance(times.archFall - 0.01);
  assert.equal(finale.effects.archHole.visible, false);
  advance(times.archFall + 0.0001);
  assert.ok(Math.abs(finale.effects.fallingArch.x - sourceX) < 0.001);
  assert.ok(Math.abs(finale.effects.fallingArch.y - sourceY) < 0.001);
  assert.equal(finale.effects.archHole.visible, true);
  assert.ok(
    finale.effects.archFracture.shapes.every(
      ({ args: [x, y, width, height] }) =>
        x >= arch.x && y >= arch.y && x + width <= arch.x + arch.width && y + height <= arch.y + arch.height
    )
  );
  const first = finale.pose(times.archFall + 0.3).arch;
  const second = finale.pose(times.archFall + 0.6).arch;
  assert.ok(
    Math.abs(second.y - sourceY - 4 * (first.y - sourceY)) < 1e-8,
    "vertical motion follows gravity rather than a sideways topple"
  );
  for (const time of [14.3, 14.9, 15.4, 18]) {
    advance(time);
    assert.equal(sourcePillar.visible, true);
    assert.deepEqual([sourcePillar.x, sourcePillar.y], [59, 120]);
    assert.equal(finale.effects.archBitmap, bitmap, "one intact native texture remains throughout the fall");
  }
  const aim = finale.pose(15.4).princess.aims[0];
  assert.ok(aim.x > arch.x + arch.width, "later shots hit the surviving arch instead of the new hole");
});

test("the opening reveals the native inner arch through the exact missing fragment, with only narrow fracture edges", () => {
  const { PrinceJS, finale, advance } = fixture();
  const arch = PrinceJS.Finale.ARCH;
  const effects = finale.effects;
  const backing = effects.archBackingBitmap;
  const frame = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/gfx/cutscene.json"), "utf8")).frames.room
    .frame;
  assert.deepEqual(backing.source.slice(1, 5), [
    frame.x + arch.backing.x,
    frame.y + arch.backing.y,
    arch.width,
    arch.height
  ]);
  assert.equal(effects.archBacking.key, backing, "the exposed layer uses native room artwork");
  assert.deepEqual([effects.archBacking.x, effects.archBacking.y], [arch.x, arch.y]);
  assert.deepEqual(
    [...backing.pixels.filter((value, index) => index % 4 === 3)],
    [...effects.archBitmap.pixels.filter((value, index) => index % 4 === 3)],
    "the backing covers precisely the stone's footprint and leaves adjacent masonry untouched"
  );
  assert.ok(effects.archFracture.shapes.length > 20);
  assert.ok(effects.archFracture.shapes.every(({ args: [, , width, height] }) => width === 1 && height === 1));
  assert.deepEqual(effects.archHole.children, [effects.archBacking, effects.archFracture]);
  assert.equal(effects.archHole.shapes.length, 0, "no solid dark polygon covers the exposed room layer");
  assert.equal(effects.archHole.visible, false);
  advance(PrinceJS.Finale.TIMES.archImpact + 0.1);
  assert.equal(effects.archHole.visible, true);
  assert.ok(effects.archHole.z < effects.prince.z && effects.archHole.z < effects.fallingArch.z);
});

test("cinematic timing is stable at low and high frame rates, and long frames do not skip the action", () => {
  for (const dt of [1 / 30, 1 / 144]) {
    const { finale, advance, sounds } = fixture();
    advance(20.1, dt);
    assert.equal(finale.complete, true);
    assert.equal(sounds[0].played, 1);
    assert.equal(sounds[1].played, 1);
  }
  const { finale } = fixture();
  finale.update(10);
  assert.ok(finale.elapsed <= 0.101);
  assert.equal(finale.complete, false);
  finale.destroy();
  const time = finale.elapsed;
  finale.update(1);
  finale.destroy();
  assert.equal(finale.elapsed, time);
  assert.ok(finale.effects.layers.every((layer) => layer.destroyed));
});

function cutscene(f) {
  const transitions = [];
  const state = Object.assign(Object.create(f.PrinceJS.Cutscene.prototype), {
    game: f.game,
    world: { sort() {} },
    input: { keyboard: {} },
    state: {
      start(name) {
        transitions.push(name);
      }
    }
  });
  state.reset();
  state.scene = { update() {} };
  state.cover = { alpha: 1 };
  state.program = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/cutscenes/scene15.json"), "utf8")).program;
  state.executeProgram();
  state.updateScene();
  return { state, transitions };
}

test("the real scene program waits for the whole celebration, then fades into the original epilogue", () => {
  const f = fixture();
  const { state, transitions } = cutscene(f);
  for (let i = 0; i < 300; i++) {
    state.updateScene();
  }
  assert.equal(transitions.length, 0);
  assert.equal(state.ending, false);
  while (!state.finale.complete) {
    state.finale.update(0.1);
  }
  state.updateScene();
  state.updateScene();
  assert.equal(state.ending, true);
  assert.equal(transitions.length, 0);
  f.tweens.at(-1).complete();
  assert.deepEqual(transitions, ["EndTitle"]);
  assert.equal(f.restarts(), 1);
});

test("skipping during the closing fade destroys the cinematic and prevents a second state change", () => {
  const f = fixture();
  const { state, transitions } = cutscene(f);
  state.endCutscene();
  const pendingFade = f.tweens.at(-1);
  const effects = state.finale.effects;
  state.continue();
  state.shutdown();
  pendingFade.complete();
  assert.deepEqual(transitions, ["EndTitle"]);
  assert.equal(f.restarts(), 1);
  assert.equal(state.finale, null);
  assert.ok(effects.layers.every((layer) => layer.destroyed));
  assert.ok(f.tweens.every((tween) => tween.removed));
});

test("earlier story scenes retain their original skip destinations", () => {
  for (const [level, destination] of [
    [1, "Game"],
    [2, "Game"],
    [16, "Title"],
    [90, "Game"]
  ]) {
    const f = fixture();
    const { state, transitions } = cutscene(f);
    f.PrinceJS.currentLevel = level;
    state.continue();
    assert.deepEqual(transitions, [destination]);
  }
});

test("a missing custom cutscene still falls through into its playable level", () => {
  const f = fixture();
  const { state, transitions } = cutscene(f);
  f.PrinceJS.currentLevel = 90;
  state.next();
  assert.deepEqual(transitions, ["Game"]);
});
