"use strict";

PrinceJS.WeaponAudio = function (game) {
  this.game = game;
  this.voices = [];
  this.burningVoices = [];
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
  for (let key of ["BurningScreamLow", "BurningScreamHigh"]) {
    this.burningVoices.push({ sound: game.add.audio(key, PrinceJS.WeaponAudio.BURNING_VOLUME), burn: null });
  }

  // Resume only from a real input gesture; a shot fired during the update loop
  // must never queue a backlog of gunfire behind the browser's autoplay lock.
  this.unlockKeys = [Phaser.Keyboard.F, Phaser.Keyboard.CONTROL, Phaser.Keyboard.SHIFT].map((code) =>
    game.input.keyboard.addKey(code)
  );
  this.unlockKeys.forEach((key) => key.onDown.add(this.unlock, this));
  game.input.onDown.add(this.unlock, this);
};

PrinceJS.WeaponAudio.MINIGUN_VOLUME = 0.78;
PrinceJS.WeaponAudio.BURNING_VOLUME = 0.38;

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
    if (!sound.usingWebAudio && !this.game.settings) {
      volume *= sound.volume;
    }
    voice.play("", 0, volume, false, true);
  },

  updateBurning: function (burns, visibleRooms) {
    let sound = this.game.sound;
    if (
      this.destroyed ||
      sound.noAudio ||
      sound.mute ||
      sound.volume <= 0 ||
      sound.touchLocked ||
      (sound.usingWebAudio && sound.context.state !== "running")
    ) {
      this.stopBurning();
      return;
    }
    let audible = burns.filter(
      (burn) =>
        burn.phase !== "charred" &&
        burn.age < PrinceJS.BurningEnemyEffects.DURATION &&
        burn.enemy.visible !== false &&
        (!visibleRooms || visibleRooms.includes(burn.room))
    );
    // Only these two reusable sounds may scream. A crowd never allocates more
    // voices or queues cries for guards who have already stopped burning.
    for (let voice of this.burningVoices) {
      if (voice.burn && (!audible.includes(voice.burn) || !voice.sound.isPlaying)) {
        this.stopBurningVoice(voice);
      }
    }
    for (let voice of this.burningVoices) {
      if (voice.burn || !this.game.cache.isSoundReady(voice.sound.key)) {
        continue;
      }
      let burn = audible.find(
        (candidate) =>
          candidate.age >= (candidate.nextScreamAt || 0) &&
          !this.burningVoices.some((other) => other.burn === candidate)
      );
      if (!burn) {
        continue;
      }
      let volume = PrinceJS.WeaponAudio.BURNING_VOLUME * (sound.usingWebAudio || this.game.settings ? 1 : sound.volume);
      voice.sound.play("", 0, volume, false, true);
      if (sound.usingWebAudio && voice.sound._sound) {
        let source = voice.sound._sound;
        let onEnded = source.onended;
        source.onended = () => {
          // Phaser's handler uses the mutable Sound._sound field. A delayed
          // event from a replaced source must never end its successor.
          if (voice.sound._sound === source && onEnded) {
            onEnded();
          }
        };
      }
      if (voice.sound.isPlaying) {
        voice.burn = burn;
        // A breath between cries, using burn time so pause does not create a
        // backlog. The alternate pool voice has a different original timbre.
        burn.nextScreamAt = burn.age + voice.sound.totalDuration + 0.25;
      }
    }
  },

  stopBurningVoice: function (voice) {
    // Phaser 2.6 stop() leaves BufferSource.onended attached. Detach before
    // stop, since this pooled Sound may be reassigned in the very same frame.
    if (this.game.sound.usingWebAudio && voice.sound._sound) {
      voice.sound._sound.onended = null;
    }
    voice.sound.stop();
    voice.burn = null;
  },

  stopBurning: function () {
    for (let voice of this.burningVoices) {
      if (voice.burn || voice.sound.isPlaying) {
        this.stopBurningVoice(voice);
      }
      voice.burn = null;
    }
  },

  destroy: function () {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.stopBurning();
    if (this.unlockKeys) {
      this.unlockKeys.forEach((key) => key.onDown.remove(this.unlock, this));
      this.game.input.onDown.remove(this.unlock, this);
    }
    this.voices.concat(this.burningVoices.map((voice) => voice.sound)).forEach((voice) => {
      voice.destroy();
      // Phaser 2.6 destroys the source but leaves its gain node connected.
      if (voice.gainNode) {
        voice.gainNode.disconnect();
      }
    });
    this.voices.length = 0;
    this.burningVoices.length = 0;
  }
};
