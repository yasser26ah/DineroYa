// Banda sonora original para el tráiler de DineroYa.
// Sintetizada a mano: sin samples ni licencias de terceros.
import fs from 'node:fs';
import path from 'node:path';

const SR = 44100;
const DURATION = 28.5;
const N = Math.floor(SR * DURATION);
const left = new Float32Array(N);
const right = new Float32Array(N);

// Ruido determinista (LCG) para que el render sea reproducible.
let seed = 123456789;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 0xffffffff) * 2 - 1;
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const add = (t, value, pan = 0) => {
  const i = Math.floor(t * SR);
  if (i < 0 || i >= N) return;
  const l = Math.cos(((pan + 1) * Math.PI) / 4);
  const r = Math.sin(((pan + 1) * Math.PI) / 4);
  left[i] += value * l;
  right[i] += value * r;
};

const addNoise = (t0, dur, gain, pan, filter, shape = (p) => p) => {
  let lp = 0;
  const start = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  for (let k = 0; k < len; k++) {
    const i = start + k;
    if (i < 0 || i >= N) continue;
    const p = k / len;
    const n = rnd();
    lp += (n - lp) * filter;
    const v = (n - lp) * gain * shape(p);
    const l = Math.cos(((pan + 1) * Math.PI) / 4);
    const r = Math.sin(((pan + 1) * Math.PI) / 4);
    left[i] += v * l;
    right[i] += v * r;
  }
};

// --- Instrumentos -----------------------------------------------------------

const kick = (t, gain = 0.9) => {
  const dur = 0.42;
  for (let k = 0; k < dur * SR; k++) {
    const p = k / (dur * SR);
    const f = 132 * Math.exp(-p * 11) + 46;
    const env = Math.exp(-p * 9);
    add(t + k / SR, Math.sin((2 * Math.PI * f * k) / SR) * env * gain);
  }
  addNoise(t, 0.012, 0.5 * gain, 0, 0.9);
};

const clap = (t, gain = 0.35) => {
  addNoise(t, 0.16, gain, -0.1, 0.55, (p) => Math.exp(-p * 9));
  addNoise(t + 0.012, 0.12, gain * 0.7, 0.1, 0.5, (p) => Math.exp(-p * 12));
};

const hat = (t, gain = 0.16, open = false) => {
  const dur = open ? 0.14 : 0.045;
  addNoise(t, dur, gain, 0.35, 0.95, (p) => Math.exp(-p * (open ? 6 : 18)));
};

const bass = (t, freq, dur, gain = 0.4) => {
  let lp = 0;
  for (let k = 0; k < dur * SR; k++) {
    const p = k / (dur * SR);
    const f = freq * (1 + 0.004 * Math.sin(2 * Math.PI * 5 * p));
    const saw = 2 * ((t + k / SR) * f % 1) - 1;
    lp += (saw - lp) * 0.09;
    const env = Math.min(1, p * 60) * Math.exp(-p * 2.2);
    add(t + k / SR, lp * env * gain);
  }
};

const chord = (t, freqs, dur, gain = 0.12) => {
  freqs.forEach((f0, idx) => {
    let lp = 0;
    for (let k = 0; k < dur * SR; k++) {
      const p = k / (dur * SR);
      const det = 1 + (idx - 1) * 0.0035;
      const saw = 2 * (((t + k / SR) * f0 * det) % 1) - 1;
      lp += (saw - lp) * 0.12;
      const env = Math.min(1, p * 14) * Math.exp(-p * 1.5);
      add(t + k / SR, lp * env * gain, (idx - 1) * 0.4);
    }
  });
};

const pluck = (t, freq, gain = 0.14) => {
  for (let k = 0; k < 0.3 * SR; k++) {
    const p = k / (0.3 * SR);
    const env = Math.exp(-p * 12);
    add(t + k / SR, Math.sin((2 * Math.PI * freq * k) / SR) * env * gain, 0.25);
  }
};

const impact = (t, gain = 1) => {
  const dur = 1.6;
  for (let k = 0; k < dur * SR; k++) {
    const p = k / (dur * SR);
    const f = 96 * Math.exp(-p * 5) + 30;
    add(t + k / SR, Math.sin((2 * Math.PI * f * k) / SR) * Math.exp(-p * 2.4) * gain * 0.9);
  }
  addNoise(t, 0.9, 0.5 * gain, 0, 0.35, (p) => Math.exp(-p * 4));
};

const whoosh = (t, gain = 0.3, panFrom = -0.6) => {
  const dur = 0.42;
  addNoise(t, dur, gain, panFrom, 0.75, (p) => Math.sin(Math.PI * p) ** 2);
};

const riser = (t0, t1, gain = 0.3) => {
  const dur = t1 - t0;
  for (let k = 0; k < dur * SR; k++) {
    const p = k / (dur * SR);
    const f = 180 * Math.pow(9, p);
    add(t0 + k / SR, Math.sin((2 * Math.PI * f * k) / SR) * p * p * gain * 0.35);
  }
  addNoise(t0, dur, gain, 0.2, 0.9, (p) => p * p);
};

const coin = (t) => {
  [1568, 2093, 2637].forEach((f, i) => {
    for (let k = 0; k < 0.35 * SR; k++) {
      const p = k / (0.35 * SR);
      add(t + i * 0.03 + k / SR, Math.sin((2 * Math.PI * f * k) / SR) * Math.exp(-p * 9) * 0.14, 0.2 - i * 0.15);
    }
  });
};

const tick = (t, gain = 0.12) => addNoise(t, 0.02, gain, -0.2, 0.98, (p) => Math.exp(-p * 20));

// --- Arreglo ----------------------------------------------------------------

const BPM = 126;
const beat = 60 / BPM; // 0.476 s

const chordAm = [110, 164.81, 220];
const chordF = [87.31, 130.81, 174.61];
const chordC = [130.81, 196, 261.63];
const chordG = [98, 146.83, 196];
const progression = [chordAm, chordF, chordC, chordG];

// Ambiente inicial: drone y tensión
for (let k = 0; k < 7.2 * SR; k++) {
  const p = k / (7.2 * SR);
  const drone = Math.sin((2 * Math.PI * 55 * k) / SR) * 0.08 * Math.min(1, p * 6);
  const fifth = Math.sin((2 * Math.PI * 82.5 * k) / SR) * 0.04 * Math.min(1, p * 4);
  add(k / SR, drone + fifth);
  add(k / SR, drone * 0.7, 0.5);
}

for (let t = 1.0; t < 6.9; t += beat / 2) tick(t, 0.05);
for (let t = 3.2; t < 6.9; t += beat * 2) kick(t, 0.5);
riser(6.0, 7.0, 0.34);

// Groove principal
const grooveEnd = 24.8;
for (let t = 7.0, bar = 0; t < grooveEnd - 0.2; t += beat, bar++) {
  kick(t, 0.85);
  if (bar % 4 === 1 || bar % 4 === 3) clap(t, 0.3);
  hat(t + beat / 2, 0.13);
  hat(t + beat / 4, 0.06);
  if (bar % 8 === 7) hat(t + beat * 0.75, 0.1, true);

  // Bajo: corcheas con nota raíz del compás
  const chordIdx = Math.floor((t - 7.0) / (beat * 8)) % progression.length;
  const root = progression[chordIdx][0] / 2;
  bass(t, root, beat * 0.45, 0.26);
  bass(t + beat / 2, root * 1.5, beat * 0.4, 0.18);

  // Acordes al inicio de cada compás
  if (bar % 4 === 0) {
    chord(t, progression[chordIdx], beat * 3.4, 0.1);
  }
}

// Detalles por escena
whoosh(7.0, 0.34);
impact(7.0, 0.85);

// Pago registrado (13.6 s)
coin(13.55);
pluck(13.55, 1046.5, 0.12);

// Detalle de la lista de cobranza (15.0–18.4)
[15.0, 15.24, 15.48, 15.72].forEach((t, i) => pluck(t, 523.25 * (1 + i * 0.25), 0.09));

// Caja / arqueo (18.4)
impact(18.4, 0.45);
whoosh(18.3, 0.24, 0.5);
pluck(18.7, 1318.5, 0.1);

// Portal del cliente (21.8)
whoosh(21.7, 0.26, -0.5);
coin(22.5);

// Build final y cierre (24.8)
riser(23.4, 24.8, 0.4);
impact(24.8, 1);
chord(24.8, [220, 329.63, 440, 659.25], 3.0, 0.13);
kick(24.8, 1);
[0, 0.12, 0.26, 0.42].forEach((d, i) => pluck(25.0 + d, [880, 1108.7, 1318.5, 1760][i], 0.1));

// Transiciones
[3.2, 11.4, 15.0, 21.8].forEach((t) => { whoosh(t - 0.1, 0.22); impact(t, 0.5); });

// --- Mezcla y masterización --------------------------------------------------

let peak = 0;
for (let i = 0; i < N; i++) {
  const fadeOut = i > 27.4 * SR ? Math.max(0, 1 - (i - 27.4 * SR) / (1.1 * SR)) : 1;
  left[i] = Math.tanh(left[i] * 1.15) * fadeOut;
  right[i] = Math.tanh(right[i] * 1.15) * fadeOut;
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}

const normalize = peak > 0 ? 0.92 / peak : 1;
const bytes = Buffer.alloc(44 + N * 4);
bytes.write('RIFF', 0);
bytes.writeUInt32LE(36 + N * 4, 4);
bytes.write('WAVE', 8);
bytes.write('fmt ', 12);
bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20);
bytes.writeUInt16LE(2, 22);
bytes.writeUInt32LE(SR, 24);
bytes.writeUInt32LE(SR * 4, 28);
bytes.writeUInt16LE(4, 32);
bytes.writeUInt16LE(16, 34);
bytes.write('data', 36);
bytes.writeUInt32LE(N * 4, 40);

let offset = 44;
let sumSq = 0;
for (let i = 0; i < N; i++) {
  const l = clamp(left[i] * normalize, -1, 1);
  const r = clamp(right[i] * normalize, -1, 1);
  sumSq += l * l + r * r;
  bytes.writeInt16LE(Math.round(l * 32767), offset); offset += 2;
  bytes.writeInt16LE(Math.round(r * 32767), offset); offset += 2;
}

const outDir = path.join(process.cwd(), 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'track.wav'), bytes);

const rms = Math.sqrt(sumSq / (N * 2));
console.log(`track.wav generado: ${DURATION}s · peak normalizado · RMS ${(20 * Math.log10(rms)).toFixed(1)} dBFS`);
