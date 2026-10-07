"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

// These unit tests never create a real audio context or send sound to a device.
function fixture(options = {}) {
  const created = [];
  let maxScreams = 0;
  const signal = () => ({
    listeners: new Set(),
    add(fn) {
      this.listeners.add(fn);
    },
    remove(fn) {
      this.listeners.delete(fn);
    }
  });
  const keys = new Map();
  const ready = new Set(["MinigunFire", "BurningScreamLow", "BurningScreamHigh"]);
  const game = {
    sound: {
      noAudio: false,
      mute: false,
      volume: 1,
      touchLocked: false,
      usingWebAudio: true,
      context: { state: "running" },
      ...options
    },
    cache: { isSoundReady: (key) => ready.has(key) },
    input: {
      onDown: signal(),
      keyboard: {
        addKey(code) {
          if (!keys.has(code)) {
            keys.set(code, { onDown: signal() });
          }
          return keys.get(code);
        }
      }
    },
    add: {
      audio(key, volume) {
        const sound = {
          key,
          volume,
          isPlaying: false,
          elapsed: 0,
          calls: [],
          stops: 0,
          totalDuration: key === "BurningScreamLow" ? 1.48 : key === "BurningScreamHigh" ? 1.63 : 0.32,
          gainNode: {
            disconnect() {
              this.disconnected = true;
            }
          },
          play(...args) {
            this.calls.push(args);
            this.isPlaying = true;
            this.elapsed = 0;
            maxScreams = Math.max(
              maxScreams,
              created.filter((voice) => voice.key.startsWith("Burning") && voice.isPlaying).length
            );
          },
          stop() {
            this.stops++;
            this.isPlaying = false;
          },
          destroy() {
            this.destroyed = true;
            this.isPlaying = false;
          }
        };
        created.push(sound);
        return sound;
      }
    }
  };
  const PrinceJS = { BurningEnemyEffects: { DURATION: 5 } };
  const context = vm.createContext({ PrinceJS, Phaser: { Keyboard: { F: 70, CONTROL: 17, SHIFT: 16 } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "WeaponAudio.js"), "utf8"), context);
  const audio = new PrinceJS.WeaponAudio(game);
  const burn = (room = 1) => ({ room, age: 0, phase: "burning", enemy: { visible: true } });
  const advance = (burns, seconds, rooms = [1]) => {
    for (let time = 0; time < seconds; time += 0.01) {
      for (const sound of created) {
        sound.elapsed += 0.01;
        if (sound.elapsed >= sound.totalDuration) {
          sound.isPlaying = false;
        }
      }
      for (const candidate of burns) {
        candidate.age += 0.01;
        if (candidate.age >= 5) {
          candidate.phase = "charred";
        }
      }
      audio.updateBurning(burns, rooms);
    }
  };
  const screams = () => created.filter((voice) => voice.key.startsWith("Burning"));
  return { PrinceJS, audio, game, ready, burn, advance, screams, created, keys, maxScreams: () => maxScreams };
}

test("igniting a crowd reuses exactly two non-looping screams, never exceeding two simultaneous voices", () => {
  const f = fixture();
  const burns = Array.from({ length: 80 }, () => f.burn());
  // An actual crowd arrives through individual ignite() calls in the same frame.
  for (let count = 1; count <= burns.length; count++) {
    f.audio.updateBurning(burns.slice(0, count), [1]);
  }
  assert.equal(f.screams().length, 2);
  assert.equal(f.audio.burningVoices.filter((voice) => voice.burn).length, 2);
  assert.equal(
    f.screams().reduce((sum, sound) => sum + sound.calls.length, 0),
    2
  );
  f.advance(burns, 4.9);
  assert.equal(f.maxScreams(), 2);
  assert.equal(f.screams().length, 2);
  assert.ok(f.screams().every((sound) => sound.calls.length <= 4));
  assert.ok(f.screams().every((sound) => sound.calls.every((call) => call[2] === 0.38 && call[3] === false)));
  f.advance(burns, 0.11);
  assert.ok(f.screams().every((sound) => !sound.isPlaying));
  assert.ok(f.audio.burningVoices.every((voice) => voice.burn === null));
  const calls = f.screams().map((sound) => sound.calls.length);
  f.advance(burns, 20);
  assert.deepEqual(
    f.screams().map((sound) => sound.calls.length),
    calls,
    "dead cries are never queued"
  );
});

test("one burning guard has one voice with a breath between cries and no per-frame restart", () => {
  const f = fixture();
  const burn = f.burn();
  f.audio.updateBurning([burn], [1]);
  f.advance([burn], 1.4);
  assert.equal(f.screams()[0].calls.length, 1);
  assert.equal(f.screams()[1].calls.length, 0);
  f.advance([burn], 0.2);
  assert.ok(f.screams().every((sound) => !sound.isPlaying));
  f.advance([burn], 0.2);
  assert.equal(f.screams()[0].calls.length, 2);
  assert.equal(f.maxScreams(), 1);
  burn.phase = "charred";
  f.audio.updateBurning([burn], [1]);
  assert.ok(f.screams().every((sound) => !sound.isPlaying));
});

test("leaving the visible rooms releases scream slots for currently visible burning guards", () => {
  const f = fixture();
  const first = f.burn(1);
  const second = f.burn(2);
  const third = f.burn(3);
  const hidden = f.burn(3);
  hidden.enemy.visible = false;
  f.audio.updateBurning([first, second, third, hidden], [1, 2]);
  assert.equal(f.audio.burningVoices[0].burn, first);
  assert.equal(f.audio.burningVoices[1].burn, second);
  f.audio.updateBurning([first, second, third, hidden], [3]);
  assert.equal(f.audio.burningVoices.filter((voice) => voice.burn === third).length, 1);
  assert.equal(f.audio.burningVoices.filter((voice) => voice.burn).length, 1);
  assert.ok(f.screams().every((sound) => sound.stops === 1));
  f.audio.updateBurning([], [3]);
  assert.ok(f.screams().every((sound) => !sound.isPlaying));
});

test("late Phaser source-ended events cannot stop a reused scream voice or leave orphan audio playing", () => {
  const phaser = fs.readFileSync(path.join(__dirname, "..", "lib", "phaser.js"), "utf8");
  const prototype = phaser.slice(phaser.indexOf("Phaser.Sound.prototype = {"));
  const method = (name) => {
    const start = prototype.indexOf("    " + name + ": function");
    const functionStart = prototype.indexOf("function", start);
    const end = prototype.indexOf("\n    },", functionStart) + "\n    }".length;
    return vm.runInNewContext("(" + prototype.slice(functionStart, end) + ")");
  };
  // Exercise the actual shipped Phaser methods against source-node fakes. Its
  // onEndedHandler mutates this._sound, and stop() leaves onended attached.
  const onEnded = method("onEndedHandler");
  const stop = method("stop");
  for (const interruption of ["camera", "mute", "explicit-stop"]) {
    const f = fixture();
    const sources = [];
    for (const sound of f.screams()) {
      Object.assign(sound, {
        usingWebAudio: true,
        paused: false,
        currentMarker: "",
        fadeTween: null,
        onStop: { dispatch() {} },
        stop,
        play() {
          const source = {
            playing: true,
            stop() {
              this.playing = false;
            },
            disconnect() {
              this.disconnected = true;
            },
            onended: onEnded.bind(this)
          };
          this._sound = source;
          this.isPlaying = true;
          sources.push(source);
        }
      });
    }
    const oldBurns = [f.burn(1), f.burn(1)];
    const newBurns = [f.burn(2), f.burn(2)];
    f.audio.updateBurning(oldBurns, [1]);
    const oldSources = f.screams().map((sound) => sound._sound);
    const delayedCallbacks = oldSources.map((source) => source.onended);
    if (interruption === "mute") {
      f.game.sound.mute = true;
      f.audio.updateBurning(oldBurns, [1]);
      f.game.sound.mute = false;
    } else if (interruption === "explicit-stop") {
      f.audio.stopBurning();
    }
    f.audio.updateBurning(newBurns, [2]);
    assert.ok(
      oldSources.every((source) => source.onended === null && !source.playing),
      interruption
    );
    assert.ok(f.screams().every((sound, index) => sound._sound !== oldSources[index] && sound.isPlaying));
    // Even an event callback captured before detachment cannot mutate the
    // replacement source, which keeps both actual and logical voice counts at 2.
    delayedCallbacks.forEach((callback) => callback());
    assert.ok(
      f.screams().every((sound) => sound.isPlaying),
      interruption
    );
    f.audio.updateBurning([...newBurns, f.burn(2), f.burn(2)], [2]);
    assert.equal(sources.filter((source) => source.playing).length, 2, interruption);
    f.audio.stopBurning();
    assert.equal(sources.filter((source) => source.playing).length, 0, interruption);
  }
});

test("mute, zero volume, autoplay lock and suspended audio stop cries without an unlock backlog", () => {
  for (const blocked of ["mute", "volume", "touchLocked", "context"]) {
    const f = fixture();
    const burn = f.burn();
    f.audio.updateBurning([burn], [1]);
    f.game.sound[blocked] = blocked === "volume" ? 0 : blocked === "context" ? { state: "suspended" } : true;
    f.advance([burn], 0.2);
    assert.ok(
      f.screams().every((sound) => !sound.isPlaying),
      blocked
    );
    assert.ok(f.audio.burningVoices.every((voice) => voice.burn === null));
    f.advance([burn], 5);
    Object.assign(f.game.sound, { mute: false, volume: 1, touchLocked: false, context: { state: "running" } });
    f.audio.updateBurning([burn], [1]);
    assert.equal(
      f.screams().reduce((sum, sound) => sum + sound.calls.length, 0),
      1,
      blocked
    );
  }
});

test("unavailable decoded sounds and disabled audio never allocate pending cries", () => {
  const f = fixture();
  f.ready.clear();
  f.audio.updateBurning([f.burn()], [1]);
  assert.ok(f.screams().every((sound) => sound.calls.length === 0));
  const silent = fixture({ noAudio: true });
  silent.audio.updateBurning([silent.burn()], [1]);
  silent.audio.minigunShot();
  assert.equal(silent.created.length, 0);
  assert.doesNotThrow(() => silent.audio.destroy());
});

test("HTML audio fallback respects master volume and the two-cry limit", () => {
  const f = fixture({ usingWebAudio: false, volume: 0.5 });
  const burns = Array.from({ length: 8 }, () => f.burn());
  f.audio.updateBurning(burns, [1]);
  assert.equal(f.maxScreams(), 2);
  assert.ok(f.screams().every((sound) => sound.calls[0][2] === 0.19));
  f.audio.stopBurning();
  assert.ok(f.screams().every((sound) => !sound.isPlaying));
});

test("shutdown stops and destroys both scream voices, disconnects audio nodes, and removes unlock handlers", () => {
  const f = fixture();
  f.audio.updateBurning([f.burn(), f.burn()], [1]);
  f.audio.destroy();
  assert.ok(f.created.every((sound) => sound.destroyed && !sound.isPlaying && sound.gainNode.disconnected));
  assert.equal(f.audio.burningVoices.length, 0);
  assert.equal(f.audio.voices.length, 0);
  assert.equal(f.game.input.onDown.listeners.size, 0);
  assert.ok(Array.from(f.keys.values()).every((key) => key.onDown.listeners.size === 0));
  assert.doesNotThrow(() => f.audio.destroy());
  assert.doesNotThrow(() => f.audio.updateBurning([f.burn()], [1]));
});

test("the two original vocal WAVs have distinct pitches/durations, clean fades, and safe summed headroom", () => {
  const waves = ["low", "high"].map((name) =>
    fs.readFileSync(path.join(__dirname, "..", "assets", "sfx", "burning-scream-" + name + ".wav"))
  );
  assert.notDeepEqual(waves[0], waves[1]);
  for (const wave of waves) {
    assert.equal(wave.toString("ascii", 0, 4), "RIFF");
    assert.equal(wave.toString("ascii", 8, 16), "WAVEfmt ");
    assert.equal(wave.readUInt16LE(20), 1);
    assert.equal(wave.readUInt16LE(22), 1);
    assert.equal(wave.readUInt32LE(24), 22050);
    assert.equal(wave.readUInt16LE(34), 16);
    const samples = Array.from({ length: (wave.length - 44) / 2 }, (_, i) => wave.readInt16LE(44 + i * 2) / 32767);
    const peak = Math.max(...samples.map(Math.abs));
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    assert.ok(peak > 0.83 && peak < 0.85);
    assert.ok(peak * 0.38 * 2 < 0.65);
    assert.ok(rms > 0.1);
    assert.equal(samples[0], 0);
    assert.equal(samples.at(-1), 0);
  }
});
