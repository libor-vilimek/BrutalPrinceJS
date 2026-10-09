"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture({ saved, mobile = false, blocked = false, audioTag = false } = {}) {
  const storage = new Map(saved === undefined ? [] : [["brutal-prince-settings-v1", saved]]);
  const signal = () => ({
    listeners: [],
    add(fn) {
      this.listeners.push(fn);
    },
    dispatch() {
      this.listeners.forEach((fn) => fn());
    }
  });
  const gain = () => ({
    gain: { value: 1 },
    connect(node) {
      this.output = node;
    },
    disconnect() {
      this.output = null;
    }
  });
  function Sound(key, volume = 1) {
    Object.assign(this, {
      key,
      _volume: volume,
      usingWebAudio: !audioTag,
      usingAudioTag: audioTag,
      gainNode: gain(),
      _sound: { volume },
      onPlay: signal(),
      onResume: signal(),
      onMute: signal()
    });
  }
  Object.defineProperty(Sound.prototype, "volume", {
    get() {
      return this._volume;
    },
    set(value) {
      this._volume = value;
      this._sound.volume = value;
    }
  });
  const game = {
    sound: {
      volume: 1,
      usingWebAudio: !audioTag,
      context: { createGain: gain },
      masterGain: gain(),
      _sounds: [],
      add(key, volume) {
        const sound = new Sound(key, volume);
        this._sounds.push(sound);
        return sound;
      }
    }
  };
  const PrinceJS = {};
  const context = vm.createContext({
    PrinceJS,
    Phaser: { Sound },
    window: {
      navigator: { userAgent: mobile ? "Mozilla iPhone Mobile" : "Mozilla Windows" },
      matchMedia: () => ({ matches: false }),
      localStorage: {
        getItem(key) {
          if (blocked) {
            throw new Error("blocked");
          }
          return storage.get(key) || null;
        },
        setItem(key, value) {
          if (blocked) {
            throw new Error("blocked");
          }
          storage.set(key, value);
        }
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/GameSettings.js"), "utf8"), context);
  return { PrinceJS, game, storage, settings: new PrinceJS.GameSettings(game) };
}

test("mobile touch default and explicit saved overrides do not depend on viewport orientation", () => {
  assert.equal(fixture().settings.values.touch, false);
  assert.equal(fixture({ mobile: true }).settings.values.touch, true);
  assert.equal(fixture({ mobile: true, saved: '{"touch":false}' }).settings.values.touch, false);
  assert.equal(fixture({ saved: '{"touch":true}' }).settings.values.touch, true);
});

test("preferences clamp volumes, ignore malformed fields and survive storage denial", () => {
  const f = fixture({ saved: '{"sound":8,"music":-3,"touch":"yes","soundMuted":true}' });
  assert.equal(f.settings.values.sound, 1);
  assert.equal(f.settings.values.music, 0);
  assert.equal(f.settings.values.touch, false);
  f.settings.set("sound", 0.35);
  f.settings.set("music", 0.62);
  assert.equal(JSON.parse(f.storage.get(f.PrinceJS.GameSettings.STORAGE_KEY)).sound, 0.35);
  assert.equal(fixture({ saved: "{bad json" }).settings.values.music, 1);
  const denied = fixture({ blocked: true });
  denied.settings.set("touch", true);
  assert.equal(denied.settings.values.touch, true);
});

test("separate audio buses immediately control current and new sounds without changing per-voice volume", () => {
  const { game, settings } = fixture();
  const music = game.sound.add("PrologueA", 0.8);
  const shot = game.sound.add("MinigunFire", 0.78);
  settings.set("music", 0.4);
  settings.set("sound", 0.25);
  assert.equal(music.gainNode.output.gain.value, 0.4);
  assert.equal(shot.gainNode.output.gain.value, 0.25);
  assert.equal(shot.volume, 0.78);
  settings.set("soundMuted", true);
  assert.equal(shot.gainNode.output.gain.value, 0);
  assert.equal(music.gainNode.output.gain.value, 0.4);
  assert.equal(game.sound.add("BurningScreamLow", 0.38).gainNode.output.gain.value, 0);
  settings.set("soundMuted", false);
  assert.equal(shot.gainNode.output.gain.value, 0.25);
  assert.equal(shot.gainNode.output.output, game.sound.masterGain);
});

test("audio-tag fallback preserves logical voice volumes through replays, mute and resume", () => {
  const { game, settings } = fixture({ audioTag: true });
  const shot = game.sound.add("MinigunFire", 0.8);
  const music = game.sound.add("Victory", 0.5);
  settings.set("sound", 0.25);
  for (let i = 0; i < 10; i++) {
    shot.volume = 0.8;
    shot.onPlay.dispatch();
    assert.equal(shot._sound.volume, 0.2);
    assert.equal(shot.volume, 0.8);
  }
  settings.set("soundMuted", true);
  assert.equal(shot._sound.volume, 0);
  assert.equal(music._sound.volume, 0.5);
  settings.set("soundMuted", false);
  shot.onResume.dispatch();
  assert.equal(shot._sound.volume, 0.2);
  game.sound.volume = 0.5;
  settings.applyAudio();
  assert.equal(shot._sound.volume, 0.1, "category gain combines with the engine's master gain exactly once");
  game.sound.volume = 0;
  settings.set("sound", 1);
  assert.equal(shot._sound.volume, 0, "a slider must not override master volume zero");
  game.sound.mute = true;
  settings.set("sound", 1);
  assert.equal(shot._sound.volume, 0, "settings must not override the engine's pause/test mute");
});

test("every loaded music cue is in the music channel and all SFX remain effects", () => {
  const { PrinceJS } = fixture();
  for (const file of ["Preloader", "Game", "Cutscene", "EndTitle"]) {
    const source = fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8");
    for (const [, key, folder] of source.matchAll(/load\.audio\("([^"]+)", "assets\/(music|sfx)\//g)) {
      assert.equal(PrinceJS.GameSettings.MUSIC.has(key), folder === "music", key);
    }
  }
});
