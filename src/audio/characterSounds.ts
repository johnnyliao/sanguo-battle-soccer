// Synthesized sound sets for the five Shu characters: normal attack, battle shout, and special stages.
// characterCues maps a sim event to cue names; SYNTH_RECIPES holds the recipe behind each name. No audio files.
import type { SimEvent, SoundCue } from './sounds';
import {
  breath,
  envelope,
  fmTone,
  formantVoice,
  noiseBurst,
  PLUCK,
  SWELL,
  tone,
  wobble,
  type Adsr,
  type Recipe,
} from './synth';

export const SHU_CHARS = ['zhangfei', 'guanyu', 'zhugeliang', 'machao', 'zhaoyun'] as const;
export type ShuId = (typeof SHU_CHARS)[number];

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

const RECIPES: Record<ShuId, Record<string, Recipe>> = {
  zhangfei: {
    attack: (ac, out, t0) => {
      noiseBurst(ac, out, { t0, dur: 0.3, peak: 0.35, env: SWELL, filter: 'bandpass', f: 300, fEnd: 150, q: 1.2 });
      tone(ac, out, { type: 'sine', f: 110, fEnd: 55, t0: t0 + 0.08, dur: 0.22, peak: 0.5, env: PLUCK });
      noiseBurst(ac, out, { t0: t0 + 0.08, dur: 0.05, peak: 0.35, env: PLUCK, filter: 'lowpass', f: 900 });
    },
    shout: (ac, out, t0) => {
      breath(ac, out, t0, 0.07, 0.3);
      formantVoice(ac, out, { t0, dur: 0.34, f0: 98, f1: 92, vowel: 'o', peak: 0.45, rough: 0.5, vib: 0.01 });
      formantVoice(ac, out, { t0: t0 + 0.3, dur: 0.6, f0: 92, f1: 78, vowel: 'a', peak: 0.4, rough: 0.5, vib: 0.012 });
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
    shout: (ac, out, t0) => {
      breath(ac, out, t0, 0.07, 0.25);
      formantVoice(ac, out, { t0, dur: 0.7, f0: 130, f1: 115, vowel: 'a', peak: 0.5, rough: 0.25, vib: 0.01 });
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
    shout: (ac, out, t0) => {
      breath(ac, out, t0, 0.06, 0.2);
      formantVoice(ac, out, { t0, dur: 0.3, f0: 190, f1: 200, vowel: 'e', peak: 0.45, rough: 0.05, vib: 0.012 });
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
    shout: (ac, out, t0) => {
      breath(ac, out, t0, 0.06, 0.2);
      formantVoice(ac, out, { t0, dur: 0.1, f0: 150, vowel: 'e', peak: 0.35, rough: 0.3, vib: 0.02, vibRate: 6.5 });
      formantVoice(ac, out, { t0: t0 + 0.1, dur: 0.55, f0: 150, f1: 170, vowel: 'a', peak: 0.5, rough: 0.3, vib: 0.02, vibRate: 6.5 });
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
    shout: (ac, out, t0) => {
      breath(ac, out, t0, 0.05, 0.25);
      formantVoice(ac, out, { t0, dur: 0.32, f0: 165, vowel: 'a', peak: 0.5, rough: 0.08, vib: 0.01 });
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

/** Every synthesized cue, keyed `<charId>.<stage>`. */
export const SYNTH_RECIPES: Record<string, Recipe> = Object.fromEntries(
  SHU_CHARS.flatMap((c) => Object.entries(RECIPES[c]).map(([stage, recipe]) => [`${c}.${stage}`, recipe] as const)),
);

/**
 * Which stages each Shu character plays for an event key (sim event type, or 'hit' for a special hit).
 * 'special' fires with every special activation: the shout always, plus the cast where there is no
 * more specific start event (machao's horn).
 */
const STAGES: Record<ShuId, Record<string, readonly string[]>> = {
  zhangfei: { attack: ['attack'], special: ['shout'], roar: ['roar'], roarBall: ['roarBall'] },
  guanyu: {
    attack: ['attack'], special: ['shout'], rideStart: ['rideStart'], rideHit: ['rideHit'], rideEnd: ['rideEnd'],
  },
  zhugeliang: {
    attack: ['attack'], special: ['shout'], beamCharge: ['beamCharge'], beamStrike: ['beamStrike'],
    beamCancel: ['beamCancel'],
  },
  machao: { attack: ['attack'], special: ['shout', 'cast'], riderHit: ['riderHit'] },
  zhaoyun: { attack: ['attack'], special: ['shout'], lungeStart: ['lungeStart'], lungeHeal: ['lungeHeal'], hit: ['hit'] },
};

export function isShu(charId: string): charId is ShuId {
  return (SHU_CHARS as readonly string[]).includes(charId);
}

/**
 * Cues for a sim event by a Shu character, or undefined when the generic sounds apply.
 * A 'hit' counts only when it is a special hit (zhaoyun's lunge bump); punches and tackles stay generic.
 * Rider events must be passed with the owner's charId (see AudioPlayer).
 */
export function characterCues(e: SimEvent, charId: string): SoundCue[] | undefined {
  if (!isShu(charId)) return undefined;
  const key = e.type === 'hit' ? (e.kind === 'special' ? 'hit' : undefined) : e.type;
  if (key === undefined) return undefined;
  const stages = STAGES[charId][key];
  if (!stages) return undefined;
  return stages.map((stage) => ({ name: `${charId}.${stage}`, volume: 1 }));
}
