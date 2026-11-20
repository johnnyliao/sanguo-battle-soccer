// Synthesized sound sets for the five Shu and five Wei characters: normal attack and special stages.
// characterCues maps a sim event to cue names; SYNTH_RECIPES holds the recipe behind each name. No audio files.
import type { SimEvent, SoundCue } from './sounds';
import {
  battleSpace,
  envelope,
  fmTone,
  formantVoice,
  noiseBurst,
  PLUCK,
  SWELL,
  tone,
  warCry,
  wobble,
  type Adsr,
  type Recipe,
} from './synth';

export const SHU_CHARS = ['zhangfei', 'guanyu', 'zhugeliang', 'machao', 'zhaoyun'] as const;
export type ShuId = (typeof SHU_CHARS)[number];
export const WEI_CHARS = ['xuchu', 'caocao', 'zhenji', 'simayi', 'zhangliao'] as const;
export type WeiId = (typeof WEI_CHARS)[number];
/** Every character with a synthesized set. Wu characters use the generic sounds. */
export const CHAR_SOUND_IDS = [...SHU_CHARS, ...WEI_CHARS] as const;
export type SoundCharId = ShuId | WeiId;

const ENGINE_ENV: Adsr = { attack: 0.03, decay: 0.05, sustain: 0.9, release: 0.12 };

/** Looping engine: a sawtooth glide from f0 to f1 chopped by an LFO and low-passed. */
function engine(
  ac: BaseAudioContext,
  out: AudioNode,
  t0: number,
  dur: number,
  f0: number,
  f1: number,
  peak: number,
  chopHz: number,
  cutoff: number,
): void {
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const chop = ac.createGain();
  chop.gain.value = 0.6;
  wobble(ac, chop.gain, chopHz, 0.4, t0, dur);
  const gate = ac.createGain();
  envelope(gate.gain, t0, dur, peak, ENGINE_ENV);
  const lowpass = ac.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = cutoff;
  osc.connect(chop).connect(gate).connect(lowpass).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** One horse hoof: a low-passed noise tick plus a short 90 Hz blip. */
function hoof(ac: BaseAudioContext, out: AudioNode, t0: number, peak: number): void {
  noiseBurst(ac, out, { t0, dur: 0.05, peak: peak * 0.8, env: PLUCK, filter: 'lowpass', f: 600 });
  tone(ac, out, { type: 'sine', f: 90, fEnd: 60, t0, dur: 0.07, peak, env: PLUCK });
}

/** Chain rattle: `n` short bright metallic ticks spread over `span` seconds at random spacing. */
function chainRattle(ac: BaseAudioContext, out: AudioNode, t0: number, n: number, span: number, peak: number): void {
  let t = t0;
  for (let k = 0; k < n; k++) {
    noiseBurst(ac, out, { t0: t, dur: 0.02, peak, env: PLUCK, filter: 'highpass', f: 3000 });
    tone(ac, out, { type: 'square', f: 2400 + Math.random() * 1200, t0: t, dur: 0.025, peak: peak * 0.4, env: PLUCK });
    t += (span / n) * (0.5 + Math.random());
  }
}

/** A crow's caw ('kaaw'): a raspy saw gliding 600→500 Hz through a 1.6 kHz band, with a brighter 2.8 kHz band. */
function caw(ac: BaseAudioContext, out: AudioNode, t0: number, peak: number): void {
  const env: Adsr = { attack: 0.01, decay: 0.05, sustain: 0.7, release: 0.08 };
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(600, t0);
  osc.frequency.exponentialRampToValueAtTime(500, t0 + 0.3);
  const gate = ac.createGain();
  envelope(gate.gain, t0, 0.3, peak, env);
  for (const [f, q, level] of [[1600, 1.2, 1], [2800, 2, 0.4]] as const) {
    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = f;
    band.Q.value = q;
    const bandLevel = ac.createGain();
    bandLevel.gain.value = level;
    osc.connect(band).connect(bandLevel).connect(gate);
  }
  gate.connect(out);
  osc.start(t0);
  osc.stop(t0 + 0.32);
  noiseBurst(ac, out, { t0, dur: 0.3, peak: peak * 0.3, env, filter: 'bandpass', f: 1600, q: 1 });
}

/** Xu Chu's brutish roar, 'HUAAAH': pitch 80→95→65 Hz, vowel 'u' into 'a'. */
function xuchuRoar(ac: BaseAudioContext, out: AudioNode, t0: number, dur: number, peak: number): void {
  warCry(ac, battleSpace(ac, out), {
    t0, dur, f0: 80, fPeak: 95, fEnd: 65, vowels: ['u', 'a'], switchAt: 0.3, onset: 'h',
    peak, grit: 1, jitter: 0.055, rasp: 0.2, sub: 0.5,
  });
}

const RECIPES: Record<ShuId, Record<string, Recipe>> = {
  zhangfei: {
    attack: (ac, out, t0) => {
      noiseBurst(ac, out, { t0, dur: 0.3, peak: 0.35, env: SWELL, filter: 'bandpass', f: 300, fEnd: 150, q: 1.2 });
      tone(ac, out, { type: 'sine', f: 110, fEnd: 55, t0: t0 + 0.08, dur: 0.22, peak: 0.5, env: PLUCK });
      noiseBurst(ac, out, { t0: t0 + 0.08, dur: 0.05, peak: 0.35, env: PLUCK, filter: 'lowpass', f: 900 });
    },
    roar: (ac, out, t0) => {
      tone(ac, out, {
        type: 'sine', f: 60, fEnd: 30, t0, dur: 0.6, peak: 0.5,
        env: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.3 },
      });
      noiseBurst(ac, out, {
        t0, dur: 0.9, peak: 0.3, env: { attack: 0.05, decay: 0.3, sustain: 0.5, release: 0.4 },
        filter: 'lowpass', f: 400, fEnd: 120,
      });
    },
    roarBall: (ac, out, t0) => {
      tone(ac, out, { type: 'triangle', f: 400, fEnd: 200, t0, dur: 0.05, peak: 0.8, env: PLUCK });
      noiseBurst(ac, out, { t0, dur: 0.04, peak: 0.3, env: PLUCK, filter: 'highpass', f: 1000 });
      noiseBurst(ac, out, { t0: t0 + 0.02, dur: 0.25, peak: 0.3, env: SWELL, filter: 'bandpass', f: 900, fEnd: 300 });
    },
  },
  guanyu: {
    attack: (ac, out, t0) => {
      noiseBurst(ac, out, {
        t0, dur: 0.35, peak: 0.4, env: { attack: 0.06, decay: 0.1, sustain: 0.6, release: 0.15 },
        filter: 'bandpass', f: 900, fEnd: 250, q: 1.5,
      });
      tone(ac, out, { type: 'triangle', f: 1210, t0: t0 + 0.1, dur: 0.5, peak: 0.1, env: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.2 } });
      tone(ac, out, { type: 'triangle', f: 1290, t0: t0 + 0.1, dur: 0.5, peak: 0.1, env: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.2 } });
    },
    rideStart: (ac, out, t0) => {
      engine(ac, out, t0, 0.5, 70, 140, 0.45, 25, 1500);
      noiseBurst(ac, out, { t0: t0 + 0.02, dur: 0.05, peak: 0.45, env: PLUCK, filter: 'lowpass', f: 2000 });
      noiseBurst(ac, out, { t0: t0 + 0.3, dur: 0.05, peak: 0.4, env: PLUCK, filter: 'lowpass', f: 2000 });
      noiseBurst(ac, out, { t0, dur: 0.5, peak: 0.25, env: SWELL, filter: 'bandpass', f: 400, fEnd: 1600, q: 0.8 });
    },
    rideHit: (ac, out, t0) => {
      tone(ac, out, { type: 'sine', f: 90, fEnd: 40, t0, dur: 0.3, peak: 0.5, env: PLUCK });
      noiseBurst(ac, out, { t0, dur: 0.25, peak: 0.35, env: PLUCK, filter: 'lowpass', f: 500 });
      tone(ac, out, { type: 'triangle', f: 1400, t0: t0 + 0.02, dur: 0.4, peak: 0.12, env: PLUCK });
      tone(ac, out, { type: 'triangle', f: 2100, t0: t0 + 0.02, dur: 0.35, peak: 0.06, env: PLUCK });
    },
    rideEnd: (ac, out, t0) => {
      engine(ac, out, t0, 0.6, 120, 55, 0.4, 20, 1000);
    },
  },
  zhugeliang: {
    attack: (ac, out, t0) => {
      noiseBurst(ac, out, {
        t0, dur: 0.15, peak: 0.3, env: { attack: 0.03, decay: 0.05, sustain: 0.4, release: 0.06 },
        filter: 'highpass', f: 2000, fEnd: 3500,
      });
      tone(ac, out, { type: 'sine', f: 1760, t0: t0 + 0.05, dur: 0.3, peak: 0.12, env: PLUCK });
      tone(ac, out, { type: 'sine', f: 2640, t0: t0 + 0.05, dur: 0.2, peak: 0.04, env: PLUCK });
    },
    beamCharge: (ac, out, t0) => {
      const hum = ac.createGain();
      hum.gain.value = 0.85;
      wobble(ac, hum.gain, 6, 0.15, t0, 0.5);
      hum.connect(out);
      tone(ac, hum, { type: 'sine', f: 220, fEnd: 440, t0, dur: 0.5, peak: 0.25, env: SWELL });
      tone(ac, hum, { type: 'sine', f: 330, fEnd: 660, t0, dur: 0.5, peak: 0.12, env: SWELL });
      tone(ac, hum, { type: 'sine', f: 440, fEnd: 880, t0, dur: 0.5, peak: 0.08, env: SWELL });
      fmTone(ac, out, {
        t0: t0 + 0.02, dur: 1.2, f: 880, ratio: 1.4, index: 1320, indexEnd: 1, peak: 0.3,
        env: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.6 },
      });
    },
    beamStrike: (ac, out, t0) => {
      noiseBurst(ac, out, { t0, dur: 0.12, peak: 0.35, env: PLUCK, filter: 'highpass', f: 6000, fEnd: 800, q: 0.7 });
      tone(ac, out, { type: 'square', f: 2000, fEnd: 200, t0, dur: 0.2, peak: 0.15, env: PLUCK });
      tone(ac, out, {
        type: 'sine', f: 90, fEnd: 40, t0: t0 + 0.12, dur: 0.4, peak: 0.5,
        env: { attack: 0.005, decay: 0.15, sustain: 0.2, release: 0.2 },
      });
    },
    beamCancel: (ac, out, t0) => {
      noiseBurst(ac, out, { t0, dur: 0.4, peak: 0.25, env: SWELL, filter: 'bandpass', f: 3000, fEnd: 500, q: 2 });
      tone(ac, out, { type: 'sawtooth', f: 600, fEnd: 120, t0, dur: 0.35, peak: 0.12, env: PLUCK });
    },
  },
  machao: {
    attack: (ac, out, t0) => {
      noiseBurst(ac, out, {
        t0, dur: 0.12, peak: 0.6, env: { attack: 0.01, decay: 0.05, sustain: 0.3, release: 0.05 },
        filter: 'bandpass', f: 1500, fEnd: 2200, q: 1.2,
      });
      tone(ac, out, { type: 'triangle', f: 2600, fEnd: 1800, t0: t0 + 0.04, dur: 0.1, peak: 0.15, env: PLUCK });
    },
    // War horn for 0.9 s, then six hoof strides at 0.5 s apart (3 s of hooves, fading out).
    cast: (ac, out, t0) => {
      const horn = ac.createBiquadFilter();
      horn.type = 'lowpass';
      horn.frequency.value = 900;
      horn.connect(out);
      const hornEnv: Adsr = { attack: 0.15, decay: 0.1, sustain: 0.8, release: 0.2 };
      tone(ac, horn, { type: 'sawtooth', f: 146, t0, dur: 0.9, peak: 0.2, env: hornEnv });
      tone(ac, horn, { type: 'sawtooth', f: 220, t0, dur: 0.9, peak: 0.2, env: hornEnv });
      for (let k = 0; k < 6; k++) {
        const stride = t0 + 0.9 + k * 0.5;
        const level = 0.5 * (1 - (k / 6) * 0.6);
        for (const offset of [0, 1 / 6, 1 / 3]) hoof(ac, out, stride + offset, level);
      }
    },
    riderHit: (ac, out, t0) => {
      tone(ac, out, { type: 'sine', f: 100, fEnd: 45, t0, dur: 0.25, peak: 0.5, env: PLUCK });
      noiseBurst(ac, out, { t0, dur: 0.2, peak: 0.35, env: PLUCK, filter: 'lowpass', f: 600 });
      fmTone(ac, out, {
        t0: t0 + 0.05, dur: 0.25, f: 700, f1: 1100, ratio: 2, index: 60, peak: 0.08,
        env: { attack: 0.03, decay: 0.05, sustain: 0.6, release: 0.1 },
      });
    },
  },
  zhaoyun: {
    attack: (ac, out, t0) => {
      noiseBurst(ac, out, { t0, dur: 0.06, peak: 0.7, env: PLUCK, filter: 'highpass', f: 3000 });
      tone(ac, out, { type: 'triangle', f: 1800, fEnd: 1500, t0, dur: 0.15, peak: 0.4, env: PLUCK });
    },
    lungeStart: (ac, out, t0) => {
      noiseBurst(ac, out, {
        t0, dur: 0.35, peak: 0.4, env: { attack: 0.05, decay: 0.1, sustain: 0.6, release: 0.15 },
        filter: 'bandpass', f: 400, fEnd: 2000, q: 1,
      });
      formantVoice(ac, out, { t0, dur: 0.35, f0: 110, vowel: 'o', peak: 0.25, rough: 0.4, vib: 0.04, vibRate: 18 });
    },
    hit: (ac, out, t0) => {
      tone(ac, out, { type: 'sine', f: 140, fEnd: 50, t0, dur: 0.2, peak: 0.6, env: PLUCK });
      noiseBurst(ac, out, { t0, dur: 0.12, peak: 0.4, env: PLUCK, filter: 'lowpass', f: 900 });
    },
    lungeHeal: (ac, out, t0) => {
      tone(ac, out, {
        type: 'sine', f: 880, fEnd: 1320, t0, dur: 0.3, peak: 0.2,
        env: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.15 },
      });
      tone(ac, out, { type: 'sine', f: 1320, fEnd: 1760, t0: t0 + 0.08, dur: 0.22, peak: 0.1, env: PLUCK });
    },
  },
};

const WEI_RECIPES: Record<WeiId, Record<string, Recipe>> = {
  xuchu: {
    attack: (ac, out, t0) => {
      // Mace swing: a low whoosh falling 250→120 Hz, chain rattles, then the thud.
      noiseBurst(ac, out, {
        t0, dur: 0.22, peak: 0.45, env: { attack: 0.03, decay: 0.08, sustain: 0.6, release: 0.08 },
        filter: 'bandpass', f: 250, fEnd: 120, q: 1,
      });
      chainRattle(ac, out, t0 + 0.04, 4, 0.14, 0.12);
      tone(ac, out, { type: 'sine', f: 80, fEnd: 45, t0: t0 + 0.16, dur: 0.22, peak: 0.6, env: PLUCK });
      noiseBurst(ac, out, { t0: t0 + 0.16, dur: 0.1, peak: 0.3, env: PLUCK, filter: 'lowpass', f: 400 });
    },
    // Tiger growl: a low saw near 70 Hz with an 18 Hz rumble through a 600 Hz lowpass, then a fire whoosh.
    tigerStart: (ac, out, t0) => {
      const body = ac.createBiquadFilter();
      body.type = 'lowpass';
      body.frequency.value = 600;
      body.connect(out);
      const chop = ac.createGain();
      chop.gain.value = 0.6;
      wobble(ac, chop.gain, 18, 0.4, t0, 0.8);
      const gate = ac.createGain();
      envelope(gate.gain, t0, 0.8, 0.75, { attack: 0.1, decay: 0.15, sustain: 0.8, release: 0.2 });
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 70;
      osc.connect(chop).connect(gate).connect(body);
      osc.start(t0);
      osc.stop(t0 + 0.82);
      noiseBurst(ac, out, { t0: t0 + 0.1, dur: 0.6, peak: 0.3, env: SWELL, filter: 'bandpass', f: 600, fEnd: 2400, q: 0.7 });
    },
    // Gulp: a low thump, a double snap of the jaws, then a suck sweeping down.
    tigerSwallow: (ac, out, t0) => {
      tone(ac, out, { type: 'sine', f: 110, fEnd: 50, t0, dur: 0.25, peak: 1.0, env: PLUCK });
      noiseBurst(ac, out, { t0, dur: 0.02, peak: 0.5, env: PLUCK, filter: 'highpass', f: 2500 });
      noiseBurst(ac, out, { t0: t0 + 0.05, dur: 0.02, peak: 0.4, env: PLUCK, filter: 'highpass', f: 2000 });
      noiseBurst(ac, out, { t0: t0 + 0.1, dur: 0.3, peak: 0.35, env: SWELL, filter: 'bandpass', f: 1200, fEnd: 200, q: 1 });
    },
    // Spit: a huge roar, a fire blast (a lowpass sweep up) and a boom.
    tigerSpit: (ac, out, t0) => {
      xuchuRoar(ac, out, t0, 0.9, 0.4);
      noiseBurst(ac, out, { t0: t0 + 0.1, dur: 0.6, peak: 0.45, env: SWELL, filter: 'lowpass', f: 300, fEnd: 1500 });
      tone(ac, out, {
        type: 'sine', f: 60, fEnd: 35, t0: t0 + 0.1, dur: 0.5, peak: 0.6,
        env: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.25 },
      });
    },
    // Roar with a shockwave: the roar, a low boom sweeping down and a rumble of noise.
    tigerRoar: (ac, out, t0) => {
      xuchuRoar(ac, out, t0, 1.0, 0.45);
      tone(ac, out, {
        type: 'sine', f: 80, fEnd: 30, t0, dur: 0.6, peak: 0.7,
        env: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.3 },
      });
      noiseBurst(ac, out, { t0, dur: 0.6, peak: 0.4, env: SWELL, filter: 'lowpass', f: 400, fEnd: 80 });
    },
  },
  caocao: {
    attack: (ac, out, t0) => {
      // Crisp slash: a bright noise band sweeping 4→2 kHz, then the steel ring.
      noiseBurst(ac, out, { t0, dur: 0.12, peak: 1.6, env: PLUCK, filter: 'bandpass', f: 4000, fEnd: 2000, q: 1.2 });
      tone(ac, out, {
        type: 'sine', f: 3100, fEnd: 2900, t0: t0 + 0.01, dur: 0.35, peak: 0.4,
        env: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.1 },
      });
      tone(ac, out, { type: 'sine', f: 4700, t0: t0 + 0.01, dur: 0.25, peak: 0.2, env: PLUCK });
    },
    // Seven-star chime: seven quick FM bells rising over about 0.6 s.
    slashStart: (ac, out, t0) => {
      [523, 587, 659, 784, 880, 1047, 1175].forEach((f, k) => fmTone(ac, out, {
        t0: t0 + k * 0.05, dur: 0.35, f, ratio: 3.5, index: f * 1.5, indexEnd: f * 0.2, peak: 0.5,
        env: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.1 },
      }));
    },
    // One light swing. Pitch and filter are randomised ±8% per swing so a run of 16 does not sound like a machine.
    slashSwing: (ac, out, t0) => {
      const k = 1 + (Math.random() * 2 - 1) * 0.08;
      noiseBurst(ac, out, {
        t0, dur: 0.11, peak: 0.85, env: { attack: 0.01, decay: 0.03, sustain: 0.3, release: 0.05 },
        filter: 'bandpass', f: 1800 * k, fEnd: 3200 * k, q: 1 + Math.random(),
      });
    },
    // Blade-wave hiss: very short and quiet, an airy band falling 3→1.5 kHz.
    slashWave: (ac, out, t0) => {
      noiseBurst(ac, out, {
        t0, dur: 0.14, peak: 0.45, env: { attack: 0.03, decay: 0.05, sustain: 0.4, release: 0.06 },
        filter: 'bandpass', f: 3000, fEnd: 1500, q: 0.8,
      });
    },
    // A blade wave cuts an opponent: a bright crack, then a falling ring.
    slashWaveEnd: (ac, out, t0) => {
      noiseBurst(ac, out, { t0, dur: 0.05, peak: 0.8, env: PLUCK, filter: 'highpass', f: 1500 });
      tone(ac, out, { type: 'sine', f: 900, fEnd: 300, t0, dur: 0.12, peak: 0.5, env: PLUCK });
    },
    // A soft rising shimmer, quiet and under 0.25 s.
    slashHeal: (ac, out, t0) => {
      tone(ac, out, {
        type: 'sine', f: 660, fEnd: 1320, t0, dur: 0.22, peak: 0.22,
        env: { attack: 0.02, decay: 0.08, sustain: 0.3, release: 0.1 },
      });
      tone(ac, out, { type: 'sine', f: 990, fEnd: 1980, t0: t0 + 0.04, dur: 0.18, peak: 0.11, env: PLUCK });
    },
  },
  zhenji: {
    attack: (ac, out, t0) => {
      // Chain-whip crack: a click, a high swish, then a small jingle.
      noiseBurst(ac, out, { t0, dur: 0.012, peak: 1.6, env: PLUCK, filter: 'highpass', f: 4000 });
      noiseBurst(ac, out, {
        t0: t0 + 0.01, dur: 0.14, peak: 1.0, env: { attack: 0.01, decay: 0.05, sustain: 0, release: 0.06 },
        filter: 'bandpass', f: 3000, fEnd: 1500, q: 1.2,
      });
      tone(ac, out, { type: 'sine', f: 2400, t0: t0 + 0.04, dur: 0.1, peak: 0.2, env: PLUCK });
      tone(ac, out, { type: 'sine', f: 3300, t0: t0 + 0.07, dur: 0.08, peak: 0.15, env: PLUCK });
    },
    // Crystalline cast: glassy FM bells falling a fifth over a shimmer of high noise, then the 4 s ice-rain bed:
    // soft high-passed noise with tiny random pings, fading in and out. The field lasts ICE_TICKS (4 s).
    iceStart: (ac, out, t0) => {
      [1760, 1568, 1318].forEach((f, k) => fmTone(ac, out, {
        t0: t0 + k * 0.09, dur: 0.4, f, ratio: 2.76, index: f * 0.8, indexEnd: f * 0.1, peak: 0.3,
        env: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.1 },
      }));
      noiseBurst(ac, out, { t0, dur: 0.5, peak: 0.2, env: SWELL, filter: 'highpass', f: 5000, fEnd: 9000 });
      noiseBurst(ac, out, {
        t0: t0 + 0.2, dur: 3.8, peak: 0.125, env: { attack: 0.8, decay: 0.2, sustain: 0.8, release: 0.9 },
        filter: 'highpass', f: 3000,
      });
      for (let k = 0; k < 24; k++) {
        tone(ac, out, {
          type: 'sine', f: 3000 + Math.random() * 3000, t0: t0 + 0.3 + Math.random() * 3.5, dur: 0.04, peak: 0.1, env: PLUCK,
        });
      }
    },
    // A freeze crackle when the ice hits victims.
    icePulse: (ac, out, t0) => {
      noiseBurst(ac, out, { t0, dur: 0.05, peak: 0.5, env: PLUCK, filter: 'highpass', f: 3000 });
      tone(ac, out, { type: 'sine', f: 1800, fEnd: 900, t0, dur: 0.06, peak: 0.2, env: PLUCK });
      noiseBurst(ac, out, { t0: t0 + 0.03, dur: 0.08, peak: 0.25, env: PLUCK, filter: 'bandpass', f: 4500, q: 2 });
    },
    // Ice shatters: a bright noise burst and several glassy pings.
    iceEnd: (ac, out, t0) => {
      noiseBurst(ac, out, {
        t0, dur: 0.35, peak: 0.35, env: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.1 },
        filter: 'highpass', f: 4000,
      });
      for (const [dt, f] of [[0, 3520], [0.04, 4186], [0.09, 2960], [0.15, 3951], [0.22, 2637]] as const) {
        tone(ac, out, { type: 'sine', f, t0: t0 + dt, dur: 0.3, peak: 0.1, env: PLUCK });
      }
    },
  },
  simayi: {
    attack: (ac, out, t0) => {
      // Fan swish: a band falling 1.2→0.6 kHz, then a dark breathy tail.
      noiseBurst(ac, out, {
        t0, dur: 0.18, peak: 2.0, env: { attack: 0.01, decay: 0.06, sustain: 0.3, release: 0.1 },
        filter: 'bandpass', f: 1200, fEnd: 600, q: 1,
      });
      noiseBurst(ac, out, { t0: t0 + 0.1, dur: 0.25, peak: 0.8, env: SWELL, filter: 'lowpass', f: 500 });
    },
    // Smoky whoosh swelling and falling, then the crow's caw.
    leapStart: (ac, out, t0) => {
      noiseBurst(ac, out, {
        t0, dur: 0.4, peak: 0.7, env: { attack: 0.2, decay: 0.05, sustain: 0.4, release: 0.1 },
        filter: 'bandpass', f: 400, fEnd: 1200, q: 1,
      });
      caw(ac, out, t0 + 0.05, 0.8);
    },
    // Wings: five short filtered-noise flaps about 10 Hz over 0.5 s, and a rising wind.
    leapFly: (ac, out, t0) => {
      for (let k = 0; k < 5; k++) {
        noiseBurst(ac, out, { t0: t0 + k * 0.1, dur: 0.06, peak: 0.5, env: PLUCK, filter: 'bandpass', f: 1500, q: 1 });
      }
      noiseBurst(ac, out, { t0, dur: 0.5, peak: 0.3, env: SWELL, filter: 'bandpass', f: 300, fEnd: 900, q: 0.8 });
    },
    // Heavy landing, an eerie green-flame burst (a band sweeping up with a low boom), and a second caw.
    leapLand: (ac, out, t0) => {
      tone(ac, out, { type: 'sine', f: 90, fEnd: 40, t0, dur: 0.25, peak: 0.9, env: PLUCK });
      noiseBurst(ac, out, { t0, dur: 0.45, peak: 0.3, env: SWELL, filter: 'bandpass', f: 400, fEnd: 1600, q: 1.5 });
      tone(ac, out, {
        type: 'sine', f: 55, fEnd: 30, t0, dur: 0.5, peak: 0.6,
        env: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.2 },
      });
      caw(ac, out, t0 + 0.12, 0.3);
    },
    // Silence on victims: a muffled hush, a lowpassed noise swell.
    hush: (ac, out, t0) => {
      noiseBurst(ac, out, {
        t0, dur: 0.6, peak: 0.6, env: { attack: 0.15, decay: 0.1, sustain: 0.5, release: 0.25 },
        filter: 'lowpass', f: 500,
      });
    },
  },
  zhangliao: {
    attack: (ac, out, t0) => {
      // Double axe chop: two heavy thuds 70 ms apart, and a metallic bite.
      for (const dt of [0, 0.07]) {
        tone(ac, out, { type: 'sine', f: 95, fEnd: 45, t0: t0 + dt, dur: 0.16, peak: 0.6, env: PLUCK });
        noiseBurst(ac, out, { t0: t0 + dt, dur: 0.06, peak: 0.35, env: PLUCK, filter: 'lowpass', f: 900 });
      }
      noiseBurst(ac, out, { t0, dur: 0.05, peak: 0.25, env: PLUCK, filter: 'bandpass', f: 3500, q: 2 });
      tone(ac, out, { type: 'square', f: 1400, fEnd: 900, t0, dur: 0.08, peak: 0.06, env: PLUCK });
    },
    // Terror: a low dissonant drone (saws at 55 and 58 Hz with a tritone 78 Hz above, lowpassed, swelling over 1.2 s),
    // a chain rattle, and a reversed-cymbal swell into a boom. The special event itself is silent for Zhang Liao.
    fear: (ac, out, t0) => {
      const drone = ac.createBiquadFilter();
      drone.type = 'lowpass';
      drone.frequency.value = 400;
      drone.connect(out);
      for (const f of [55, 58, 78]) {
        tone(ac, drone, {
          type: 'sawtooth', f, t0, dur: 1.2, peak: 0.3, env: { attack: 0.8, decay: 0.2, sustain: 0.8, release: 0.25 },
        });
      }
      chainRattle(ac, out, t0 + 0.1, 6, 1.0, 0.15);
      noiseBurst(ac, out, {
        t0, dur: 1.0, peak: 0.2, env: { attack: 0.9, decay: 0.05, sustain: 0, release: 0.05 },
        filter: 'bandpass', f: 800, fEnd: 6000, q: 0.8,
      });
      tone(ac, out, {
        type: 'sine', f: 60, fEnd: 30, t0: t0 + 1.0, dur: 0.5, peak: 0.6,
        env: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.2 },
      });
      noiseBurst(ac, out, { t0: t0 + 1.0, dur: 0.5, peak: 0.4, env: PLUCK, filter: 'lowpass', f: 300 });
    },
  },
};

const ALL_RECIPES: Record<SoundCharId, Record<string, Recipe>> = { ...RECIPES, ...WEI_RECIPES };

/** Every synthesized cue, keyed `<charId>.<stage>`. */
export const SYNTH_RECIPES: Record<string, Recipe> = Object.fromEntries(
  CHAR_SOUND_IDS.flatMap((c) => Object.entries(ALL_RECIPES[c]).map(([stage, recipe]) => [`${c}.${stage}`, recipe] as const)),
);

/**
 * Which stages each character plays for an event key (sim event type, or 'hit' for a special hit,
 * 'leapHush' for a leap landing on victims). Every special has its own start event in the same tick
 * (roar, cast, fear, slashStart, ...), so 'special' itself is silent for Shu and Wei, except Ma Chao's horn.
 */
const STAGES: Record<SoundCharId, Record<string, readonly string[]>> = {
  zhangfei: { attack: ['attack'], roar: ['roar'], roarBall: ['roarBall'] },
  guanyu: {
    attack: ['attack'], rideStart: ['rideStart'], rideHit: ['rideHit'], rideEnd: ['rideEnd'],
  },
  zhugeliang: {
    attack: ['attack'], beamCharge: ['beamCharge'], beamStrike: ['beamStrike'], beamCancel: ['beamCancel'],
  },
  machao: { attack: ['attack'], special: ['cast'], riderHit: ['riderHit'] },
  zhaoyun: { attack: ['attack'], lungeStart: ['lungeStart'], lungeHeal: ['lungeHeal'], hit: ['hit'] },
  xuchu: {
    attack: ['attack'], tigerStart: ['tigerStart'], tigerSwallow: ['tigerSwallow'],
    tigerSpit: ['tigerSpit'], tigerRoar: ['tigerRoar'],
  },
  caocao: {
    attack: ['attack'], slashStart: ['slashStart'], slashSwing: ['slashSwing'],
    slashWave: ['slashWave'], slashWaveEnd: ['slashWaveEnd'], slashHeal: ['slashHeal'],
  },
  zhenji: { attack: ['attack'], iceStart: ['iceStart'], icePulse: ['icePulse'], iceEnd: ['iceEnd'] },
  simayi: {
    attack: ['attack'], leapStart: ['leapStart'], leapFly: ['leapFly'],
    leapLand: ['leapLand'], leapHush: ['hush'],
  },
  zhangliao: { attack: ['attack'], fear: ['fear'] },
};

export function isSynthChar(charId: string): charId is SoundCharId {
  return (CHAR_SOUND_IDS as readonly string[]).includes(charId);
}

function hasVictims(e: SimEvent): boolean {
  return Array.isArray(e.victimIdxs) && e.victimIdxs.length > 0;
}

/**
 * The stage keys an event can trigger. Conditional events: a 'hit' only when special (zhaoyun's lunge bump;
 * punches and tackles stay generic), a blade wave only when it struck, an ice pulse and a leap landing only with victims.
 */
function stageKeys(e: SimEvent): string[] {
  switch (e.type) {
    case 'hit':
      return e.kind === 'special' ? ['hit'] : [];
    case 'slashWaveEnd':
      return typeof e.hitIdx === 'number' && e.hitIdx >= 0 ? ['slashWaveEnd'] : [];
    case 'icePulse':
      return hasVictims(e) ? ['icePulse'] : [];
    case 'leapLand':
      return hasVictims(e) ? ['leapLand', 'leapHush'] : ['leapLand'];
    default:
      return [e.type];
  }
}

/**
 * Cues for a sim event by a synthesized character, or undefined when the generic sounds apply.
 * Rider events must be passed with the owner's charId, and ice events with the field owner's (see AudioPlayer).
 */
export function characterCues(e: SimEvent, charId: string): SoundCue[] | undefined {
  if (!isSynthChar(charId)) return undefined;
  const stages = STAGES[charId];
  const cues = stageKeys(e).flatMap((key) => stages[key] ?? []);
  // A silent special stays silent: it must not fall back to the generic special sound.
  if (cues.length === 0) return e.type === 'special' ? [] : undefined;
  return cues.map((stage) => ({ name: `${charId}.${stage}`, volume: 1 }));
}
