"use strict";

PrinceJS.WeaponAudio = function (game) {
  this.game = game;
  this.voices = [];
  this.nextVoice = 0;
  this.shots = 0;
  this.destroyed = false;

  if (game.sound.noAudio) {
    return;
  }

  // Web Audio voices can overlap the mechanical/reverb tail without allocating
  // a new Phaser.Sound on every bullet. The audio-tag fallback shares one tag.
  let count = game.sound.usingWebAudio ? 6 : 1;
  for (let i = 0; i < count; i++) {
    this.voices.push(game.add.audio("MinigunFire", PrinceJS.WeaponAudio.MINIGUN_VOLUME));
  }

  // Resume only from a real input gesture; a shot fired during the update loop
  // must never queue a backlog of gunfire behind the browser's autoplay lock.
  this.unlockKeys = [Phaser.Keyboard.F, Phaser.Keyboard.SHIFT].map((code) => game.input.keyboard.addKey(code));
  this.unlockKeys.forEach((key) => key.onDown.add(this.unlock, this));
  game.input.onDown.add(this.unlock, this);
};

PrinceJS.WeaponAudio.MINIGUN_VOLUME = 0.78;

PrinceJS.WeaponAudio.prototype = {
  unlock: function () {
    let sound = this.game.sound;
    let context = sound.context;
    if (this.destroyed || sound.noAudio || sound.mute || !context || context.state !== "suspended") {
      return;
    }
    // Modern browsers return a Promise. A rejected gesture must remain silent
    // and may be retried on the next input, never reported as an uncaught error.
    let resumed = context.resume();
    if (resumed && resumed.catch) {
      resumed.catch(() => {});
    }
  },

  minigunShot: function () {
    let sound = this.game.sound;
    if (
      this.destroyed ||
      !this.voices.length ||
      sound.noAudio ||
      sound.mute ||
      sound.volume <= 0 ||
      sound.touchLocked ||
      !this.game.cache.isSoundReady("MinigunFire") ||
      (sound.usingWebAudio && sound.context.state !== "running")
    ) {
      return;
    }

    let voice = this.voices[this.nextVoice];
    this.nextVoice = (this.nextVoice + 1) % this.voices.length;
    // A small repeating accent gives the stream a mechanical rhythm without
    // changing the cadence or drowning out every other sound in the game.
    let accent = [1, 0.94, 0.98, 0.92][this.shots++ % 4];
    let volume = PrinceJS.WeaponAudio.MINIGUN_VOLUME * accent;
    if (!sound.usingWebAudio) {
      volume *= sound.volume;
    }
    voice.play("", 0, volume, false, true);
  },

  destroy: function () {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    if (this.unlockKeys) {
      this.unlockKeys.forEach((key) => key.onDown.remove(this.unlock, this));
      this.game.input.onDown.remove(this.unlock, this);
    }
    this.voices.forEach((voice) => {
      voice.destroy();
      // Phaser 2.6 destroys the source but leaves its gain node connected.
      if (voice.gainNode) {
        voice.gainNode.disconnect();
      }
    });
    this.voices.length = 0;
  }
};
