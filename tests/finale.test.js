"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture() {
  const graphics = () => ({
    x: 0,
    y: 0,
    visible: true,
    children: [],
    shapes: [],
    scale: { x: 1, y: 1 },
    anchor: { setTo() {} },
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
    crop() {},
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
  const game = {
    sound: { noAudio: true, mute: true, volume: 0, stopAll() {}, play() {} },
    make: { graphics, sprite: graphics },
    add: {
      graphics,
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
    Phaser: { Rectangle: function () {}, Easing: { Linear: { None: 0 } } }
  });
  for (const file of ["PrincePose", "MinigunEffects", "WeaponAudio", "FinaleEffects", "Finale", "Cutscene"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  const finale = new PrinceJS.Finale(game, {});
  const advance = (time, dt = 1 / 60) => {
    while (finale.elapsed < time - 1e-8) {
      finale.update(Math.min(dt, time - finale.elapsed));
    }
  };
  return { PrinceJS, game, finale, advance, sounds, tweens, removed, restarts: () => restarts };
}

test("the Prince stops, puts the carried head on the floor and only then kicks it", () => {
  const { finale } = fixture();
  const arrival = finale.pose(3);
  assert.ok(arrival.prince.x > 154);
  assert.equal(arrival.headHeld, true);
  assert.equal(arrival.prince.firing, false);
  assert.equal(finale.pose(4.2).prince.x, finale.pose(4.6).prince.x);
  const placing = finale.pose(5.39);
  assert.ok(Math.abs(placing.head.y - 159) < 0.1);
  const grounded = finale.pose(6);
  assert.equal(grounded.headHeld, false);
  assert.equal(grounded.headGrounded, true);
  assert.equal(grounded.head.y, 159);
  const kicked = finale.pose(6.6);
  assert.ok(kicked.head.x < grounded.head.x);
  assert.ok(kicked.head.y < grounded.head.y);
  assert.equal(kicked.headGrounded, false);
  const before = finale.pose(6.48 - 0.0001).prince.kick;
  assert.ok(Math.abs(before - finale.pose(6.48).prince.kick) < 0.001, "kick extension is continuous at contact");
});

test("the head hits the actual pane once, exits and leaves broken glass and floor blood", () => {
  const { finale, advance, sounds } = fixture();
  const hit = finale.pose(7.12).head;
  assert.ok(Math.abs(hit.x - 22) < 1e-9);
  assert.ok(Math.abs(hit.y - 112) < 1e-9);
  advance(7.1);
  assert.equal(finale.windowBroken, false);
  assert.equal(sounds[1].played, 1);
  advance(7.2);
  assert.equal(finale.windowBroken, true);
  assert.equal(sounds[0].played, 1);
  assert.ok(finale.effects.particles.some((p) => p.type === "glass"));
  const brokenPane = JSON.stringify(finale.effects.glass.shapes);
  advance(12);
  assert.equal(finale.effects.headLayer.visible, false);
  assert.equal(sounds[0].played, 1);
  assert.equal(sounds[1].played, 1);
  assert.equal(JSON.stringify(finale.effects.glass.shapes), brokenPane);
  assert.ok(finale.effects.bloodOnFloor);
  assert.ok(finale.effects.floor.shapes.length > 10);
});

test("the Prince fires first, then the Princess draws and fires both rifles while they dance", () => {
  const { finale, advance } = fixture();
  const shots = [];
  const shoot = finale.effects.shoot.bind(finale.effects);
  finale.effects.shoot = (gun, index) => {
    shots.push({ time: finale.elapsed, index, ...gun });
    shoot(gun, index);
  };
  advance(8.3);
  assert.equal(shots.length, 0);
  advance(8.7);
  assert.ok(shots.length > 0);
  assert.ok(shots.every((s) => s.index === 0));
  assert.ok(finale.pose(9.1).princess.draw > 0 && finale.pose(9.1).princess.draw < 1);
  advance(14);
  assert.deepEqual([...new Set(shots.map((s) => s.index))].sort(), [0, 1, 2]);
  assert.ok(shots.filter((s) => s.index > 0).every((s) => s.time >= 9.5));
  for (const gun of shots) {
    assert.equal(gun.visible, true);
    assert.ok(gun.dy < -0.7, "every muzzle points into the ceiling, away from both people");
    const ceilingX = gun.x + (gun.dx * (gun.y - 24)) / -gun.dy;
    assert.ok(ceilingX > 75 && ceilingX < 260);
  }
  assert.notEqual(finale.pose(10).prince.step, finale.pose(10.2).prince.step);
  assert.notEqual(finale.pose(10).princess.sway, finale.pose(10.2).princess.sway);
  assert.ok(finale.effects.particles.length < 180, "active effects stay bounded");
  assert.ok(
    finale.effects.prince.z < 30 && finale.effects.princess.z < 30,
    "both actors remain behind original foreground pillars"
  );
});

test("cinematic timing is stable at low and high frame rates, and long frames do not skip the action", () => {
  for (const dt of [1 / 30, 1 / 144]) {
    const { finale, advance, sounds } = fixture();
    advance(17.6, dt);
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
