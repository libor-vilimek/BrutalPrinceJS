"use strict";

// Original procedural sound: no samples, external assets, or dependencies.
// Run with `node tools/generate-minigun-sound.js` to rebuild the checked-in WAV.
const fs = require("node:fs");
const path = require("node:path");

const sampleRate = 44100;
const duration = 0.32;
const frameCount = Math.round(sampleRate * duration);
const dry = new Float64Array(frameCount);
const mix = new Float64Array(frameCount);
const tau = 2 * Math.PI;
let randomState = 0x4d494e49;
let low = 0;
let body = 0;
let bite = 0;

function noise() {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 2147483648 - 1;
}

function coefficient(frequency) {
  return 1 - Math.exp((-tau * frequency) / sampleRate);
}

function attack(time, length) {
  return Math.min(1, Math.max(0, time / length));
}

const lowCoefficient = coefficient(190);
const bodyCoefficient = coefficient(1150);
const biteCoefficient = coefficient(5300);

for (let i = 0; i < frameCount; i++) {
  let t = i / sampleRate;
  let white = noise();
  low += lowCoefficient * (white - low);
  body += bodyCoefficient * (white - body);
  bite += biteCoefficient * (white - bite);

  // The report has a very fast pressure crack, an unpitched chesty body, and
  // a brief bass pulse. Keeping the bass short preserves each shot at 15 Hz.
  let crack = (white - bite) * 0.42 * Math.exp(-t / 0.006);
  let report = (bite - low) * 1.22 * Math.exp(-t / 0.021);
  let chest = body * 1.8 * Math.exp(-t / 0.042);
  let bassPhase = tau * (74 * t + 26 * 0.013 * (1 - Math.exp(-t / 0.013)));
  let thump = Math.sin(bassPhase) * 0.72 * Math.exp(-t / 0.034);
  let rumble = low * 1.35 * Math.exp(-t / 0.065);
  let gunshot = (crack + report + chest + thump + rumble) * attack(t, 0.0006);

  // Small staggered breech/belt transients add a hard mechanical character.
  let mechanism = 0;
  for (let click of [0.013, 0.032, 0.057]) {
    let dt = t - click;
    if (dt >= 0) {
      let metal =
        0.05 * Math.sin(tau * 1379 * dt) + 0.033 * Math.sin(tau * 2167 * dt) + 0.024 * Math.sin(tau * 3143 * dt);
      mechanism += (metal + (bite - body) * 0.15) * attack(dt, 0.0005) * Math.exp(-dt / 0.012);
    }
  }
  dry[i] = gunshot + mechanism;
}

// A few early room reflections, softened by distance, leave a short tail when
// the player releases the trigger without turning the stream into a hiss.
const reflections = [
  { time: 0, gain: 1 },
  { time: 0.023, gain: 0.17 },
  { time: 0.047, gain: 0.105 },
  { time: 0.079, gain: 0.062 },
  { time: 0.113, gain: 0.032 }
];
for (let reflection of reflections) {
  let offset = Math.round(reflection.time * sampleRate);
  let reflectedLow = 0;
  for (let i = offset; i < frameCount; i++) {
    reflectedLow += coefficient(2900) * (dry[i - offset] - reflectedLow);
    mix[i] += (offset === 0 ? dry[i] : reflectedLow) * reflection.gain;
  }
}

// Remove subsonic/DC energy, fade the tail to zero, then normalize with real
// headroom. This does not hard-clip or saturate the report.
let dc = 0;
let peak = 0;
const dcCoefficient = coefficient(28);
for (let i = 0; i < frameCount; i++) {
  dc += dcCoefficient * (mix[i] - dc);
  let fade = Math.min(1, (frameCount - i - 1) / (sampleRate * 0.035));
  mix[i] = (mix[i] - dc) * fade;
  peak = Math.max(peak, Math.abs(mix[i]));
}

const normalization = 0.87 / peak;
const wav = Buffer.alloc(44 + frameCount * 2);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(frameCount * 2, 40);
let energy = 0;
for (let i = 0; i < frameCount; i++) {
  mix[i] *= normalization;
  energy += mix[i] * mix[i];
  wav.writeInt16LE(Math.round(mix[i] * 32767), 44 + i * 2);
}

// Validate a sustained burst at the game's minimum shot spacing. Its overlap
// must also leave headroom, not only the individual normalized sound.
const burst = new Float64Array(sampleRate * 3);
const intervalFrames = Math.round(0.065 * sampleRate);
for (let start = 0; start + frameCount < burst.length; start += intervalFrames) {
  for (let i = 0; i < frameCount; i++) {
    burst[start + i] += mix[i] * 0.78;
  }
}
let burstPeak = burst.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
if (burstPeak >= 0.95) {
  throw new Error(`Sustained minigun burst lacks headroom: ${burstPeak}`);
}

const destination = path.resolve(__dirname, "../assets/sfx/minigun-fire.wav");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, wav);
process.stdout.write(
  JSON.stringify({
    destination,
    sampleRate,
    duration,
    channels: 1,
    bitDepth: 16,
    peak: 0.87,
    rms: Math.sqrt(energy / frameCount),
    sustainedBurstPeak: burstPeak,
    bytes: wav.length
  }) + "\n"
);
