"use strict";

// Original voiced, formant-shaped retro cries, made without recordings or
// external samples. Rebuild with `node tools/generate-burning-screams.js`.
const fs = require("node:fs");
const path = require("node:path");
const rate = 22050;
const tau = 2 * Math.PI;

function resonator(frequency, bandwidth) {
  const radius = Math.exp((-Math.PI * bandwidth) / rate);
  const a = 2 * radius * Math.cos((tau * frequency) / rate);
  const b = radius * radius;
  let previous = 0;
  let older = 0;
  return (input) => {
    const output = (1 - radius) * input + a * previous - b * older;
    older = previous;
    previous = output;
    return output;
  };
}

function createCry(name, pitch, duration, seed) {
  const count = Math.round(duration * rate);
  const samples = new Float64Array(count);
  const mouth = [resonator(790, 120), resonator(1190, 155), resonator(2670, 230)];
  const throat = resonator(430, 240);
  const formantGains = [0.66, 0.56, 0.3];
  let phase = 0;
  let previousSource = 0;
  let breath = 0;
  let dc = 0;
  let peak = 0;
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const noise = (seed >>> 0) / 2147483648 - 1;
    breath += 0.34 * (noise - breath);
    // A startled upward break into a ragged sustained open-mouth "aaagh".
    // Slow bends, fast tremor and a subharmonic keep it from being a siren.
    const contour = 0.82 + 0.51 * (1 - Math.exp(-t * 13)) - (0.26 * t) / duration;
    const vibrato = 1 + 0.031 * Math.sin(tau * 6.7 * t) + 0.014 * Math.sin(tau * 39 * t);
    phase += (pitch * contour * vibrato) / rate;
    const cycle = phase % 1;
    const glottis = cycle < 0.48 ? Math.sin((Math.PI * cycle) / 0.48) ** 1.5 : 0;
    const source = glottis * (0.83 + 0.17 * Math.sin(Math.PI * phase));
    const excitation = (source - previousSource) * 11 + breath * 0.085;
    previousSource = source;
    let vowel = mouth.reduce((sum, filter, index) => sum + filter(excitation) * formantGains[index], 0);
    vowel += throat(excitation) * 0.2;
    const start = Math.min(1, t / 0.065);
    const end = Math.min(1, (duration - t) / 0.24);
    const strain = 0.82 + 0.1 * Math.sin(tau * 8.2 * t) + 0.08 * Math.sin(tau * 18.4 * t);
    const gasp = 1 - 0.53 * Math.exp(-(((t - duration * 0.7) / 0.05) ** 2));
    const envelope = start * end * strain * gasp;
    const dry = Math.tanh(vowel * 1.75) * envelope;
    // Subtle palace reflection belongs to the same sound voice, so it cannot
    // evade the two-cry cap or survive stop()/level shutdown.
    const echo = i > 1323 ? samples[i - 1323] * 0.105 : 0;
    const value = dry + echo;
    dc += 0.008 * (value - dc);
    samples[i] = (value - dc) * Math.min(1, (count - i - 1) / 330);
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const wav = Buffer.alloc(44 + count * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    wav.writeInt16LE(Math.round((samples[i] / peak) * 0.84 * 32767), 44 + i * 2);
  }
  const destination = path.resolve(__dirname, "../assets/sfx/burning-scream-" + name + ".wav");
  fs.writeFileSync(destination, wav);
  return { destination, duration, peak: 0.84, bytes: wav.length };
}

process.stdout.write(
  JSON.stringify([createCry("low", 238, 1.48, 0x4255524e), createCry("high", 307, 1.63, 0x5343524d)]) + "\n"
);
