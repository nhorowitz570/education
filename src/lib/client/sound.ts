// A few small sounds, synthesised rather than sampled so they stay tiny and
// tuned to each other: soft mallet tones on one pentatonic scale, quiet, with
// a little air behind them. Off unless the learner turns them on (You → Sound).

export type Cue = 'solid' | 'partial' | 'complete' | 'levelup' | 'tap';

let enabled = false;
let ctx: AudioContext | null = null;
let out: GainNode | null = null;

export function setSound(on: boolean) {
  enabled = on;
  if (on) unlock();
}

// Browsers only start audio from a gesture, so the context is created (or
// resumed) on the next tap once sound is on.
function unlock() {
  if (typeof window === 'undefined') return;
  const start = () => {
    ensure();
    void ctx?.resume();
  };
  window.addEventListener('pointerdown', start, { once: true, capture: true });
  window.addEventListener('keydown', start, { once: true, capture: true });
}

function ensure() {
  if (ctx || typeof AudioContext === 'undefined') return ctx;
  ctx = new AudioContext();
  // Master: gentle low-pass so nothing is shrill, then a short feedback delay
  // mixed in quietly for a sense of room.
  const master = ctx.createGain();
  master.gain.value = 0.55;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 4200;
  tone.Q.value = 0.4;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.11;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.22;
  const wet = ctx.createGain();
  wet.gain.value = 0.16;
  out = ctx.createGain();
  out.connect(tone);
  tone.connect(master);
  tone.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(master);
  master.connect(ctx.destination);
  return ctx;
}

// One mallet strike: a sine fundamental with a quieter, faster-decaying
// overtone, the way a marimba bar rings.
function strike(freq: number, at: number, { gain = 0.16, decay = 0.9, bell = false } = {}) {
  if (!ctx || !out) return;
  const partials = bell
    ? [
        [1, 1, decay],
        [2.76, 0.18, decay * 0.45],
        [5.4, 0.05, decay * 0.25],
      ]
    : [
        [1, 1, decay],
        [3.93, 0.12, decay * 0.3],
      ];
  for (const [ratio, level, length] of partials) {
    const osc = ctx.createOscillator(),
      env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain * level, at + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(env);
    env.connect(out);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }
}

// C major pentatonic, from C5.
const N = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.51, G6: 1567.98 };

export function play(cue: Cue) {
  if (!enabled) return;
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const t = c.currentTime + 0.02;
  switch (cue) {
    case 'tap':
      strike(N.G6, t, { gain: 0.05, decay: 0.12 });
      break;
    case 'solid':
      strike(N.E5 * 2, t, { gain: 0.11, decay: 0.5 });
      strike(N.G6, t + 0.075, { gain: 0.1, decay: 0.7 });
      break;
    case 'partial':
      strike(N.A5, t, { gain: 0.09, decay: 0.55 });
      break;
    case 'complete':
      [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => strike(f, t + i * 0.09, { gain: 0.13 - i * 0.012, decay: 1.4, bell: true }));
      strike(N.E6, t + 0.42, { gain: 0.05, decay: 1.6, bell: true });
      break;
    case 'levelup':
      [N.G5, N.C6, N.E6, N.G6].forEach((f, i) => strike(f, t + i * 0.07, { gain: 0.1, decay: 1.1, bell: true }));
      break;
  }
}
