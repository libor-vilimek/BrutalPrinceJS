"use strict";

// Browser preferences survive a new campaign; campaign inventory never lives here.
PrinceJS.GameSettings = function (game) {
  this.game = game;
  this.values = { sound: 1, music: 1, soundMuted: false, musicMuted: false, touch: this.isMobile() };
  try {
    const saved = JSON.parse(window.localStorage.getItem(PrinceJS.GameSettings.STORAGE_KEY));
    for (const key of Object.keys(this.values)) {
      if (saved && typeof saved[key] === typeof this.values[key]) {
        this.values[key] = typeof saved[key] === "number" ? this.clamp(saved[key]) : saved[key];
      }
    }
  } catch (error) {
    // Private browsing or unavailable storage still allows session preferences.
  }
  this.installAudio();
};

PrinceJS.GameSettings.STORAGE_KEY = "brutal-prince-settings-v1";
PrinceJS.GameSettings.MUSIC = new Set([
  "PrologueA",
  "PrologueB",
  "Princess",
  "Jaffar",
  "Heartbeat",
  "Danger",
  "Accident",
  "Potion1",
  "Victory",
  "Prince",
  "Heartbeat2",
  "HeroicDeath",
  "Potion2",
  "TheShadow",
  "Float",
  "Timer",
  "TragicEnd",
  "Jaffar2",
  "JaffarDead",
  "Embrace",
  "Epilogue"
]);

PrinceJS.GameSettings.prototype = {
  isMobile: function () {
    const nav = window.navigator;
    return !!(
      (nav.userAgentData && nav.userAgentData.mobile) ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || "") ||
      (nav.platform === "MacIntel" && nav.maxTouchPoints > 1) ||
      (window.matchMedia && window.matchMedia("(pointer: coarse) and (hover: none)").matches)
    );
  },

  clamp: function (value) {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  },

  set: function (key, value) {
    if (!(key in this.values) || typeof value !== typeof this.values[key]) {
      return;
    }
    this.values[key] = typeof value === "number" ? this.clamp(value) : value;
    try {
      window.localStorage.setItem(PrinceJS.GameSettings.STORAGE_KEY, JSON.stringify(this.values));
    } catch (error) {
      // The current session remains usable when saving is blocked.
    }
    this.applyAudio();
  },

  volume: function (channel) {
    return this.values[channel + "Muted"] ? 0 : this.values[channel];
  },

  installAudio: function () {
    const manager = this.game.sound;
    this.channels = {};
    if (manager.usingWebAudio && manager.context && manager.masterGain) {
      for (const channel of ["sound", "music"]) {
        const gain = manager.context.createGain();
        gain.connect(manager.masterGain);
        this.channels[channel] = gain;
      }
    }
    const settings = this;
    const add = manager.add;
    manager.add = function (...args) {
      const sound = add.apply(this, args);
      const channel = PrinceJS.GameSettings.MUSIC.has(sound.key) ? "music" : "sound";
      sound.settingsChannel = channel;
      if (sound.usingWebAudio && sound.gainNode && settings.channels[channel]) {
        sound.gainNode.disconnect();
        sound.gainNode.connect(settings.channels[channel]);
      } else if (sound.usingAudioTag) {
        // Keep Phaser's logical volume intact so pooled/restarted voices never
        // multiply their volume repeatedly. Scale only the actual audio tag.
        const apply = () => settings.applyAudioTag(sound);
        sound.onPlay.add(apply);
        sound.onResume.add(apply);
        sound.onMute.add(apply);
        const descriptor = Object.getOwnPropertyDescriptor(Phaser.Sound.prototype, "volume");
        Object.defineProperty(sound, "volume", {
          get: () => descriptor.get.call(sound),
          set: (value) => {
            descriptor.set.call(sound, value);
            apply();
          }
        });
      }
      return sound;
    };
    if (manager.onVolumeChange) {
      manager.onVolumeChange.add(this.applyAudio, this);
    }
    this.applyAudio();
  },

  applyAudioTag: function (sound) {
    if (sound._sound) {
      sound._sound.volume =
        sound.mute || this.game.sound.mute
          ? 0
          : this.clamp(sound.volume * this.game.sound.volume * this.volume(sound.settingsChannel));
    }
  },

  applyAudio: function () {
    for (const channel of Object.keys(this.channels)) {
      this.channels[channel].gain.value = this.volume(channel);
    }
    for (const sound of this.game.sound._sounds || []) {
      if (sound.usingAudioTag && sound.settingsChannel) {
        this.applyAudioTag(sound);
      }
    }
  },

  unlockAudio: function () {
    const context = this.game.sound.context;
    if (context && context.state === "suspended") {
      const resumed = context.resume();
      if (resumed && resumed.catch) {
        resumed.catch(() => {});
      }
    }
  }
};
