// Web Audio helpers for the synthesized character sounds (no audio files).
// One AudioContext is shared and created on the first play. Nothing here touches Web Audio at import time,
// so tests can import this module under plain Node.

/** A sound. It schedules its nodes into `out` from `t0`. Every recipe ends within VOICE_LIFE_MS. */
export type Recipe = (ac: BaseAudioContext, out: AudioNode, t0: number) => void;

/** A recipe that is playing live. stop() cuts it off (match end, scene shutdown). */
export interface Voice {
  stop(): void;
}

/** Attack and decay in seconds, sustain as a fraction of the peak, release in seconds. */
export interface Adsr {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export const PLUCK: Adsr = { attack: 0.002, decay: 0.08, sustain: 0, release: 0.04 };
export const SWELL: Adsr = { attack: 0.08, decay: 0.1, sustain: 0.7, release: 0.15 };

/** Longest recipe is about 4 s (the machao cast with its hoof loop). */
const VOICE_LIFE_MS = 5000;

let shared: AudioContext | null = null;
const voices = new Set<Voice>();
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function sharedContext(): AudioContext | null {
  if (shared) return shared;
  const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  shared = new Ctor();
  return shared;
}

/** Per-call master: a gain at `volume` into a limiter-like compressor, then the output. */
export function masterChain(
  ac: AudioContext | OfflineAudioContext,
  volume: number,
): { input: GainNode; comp: DynamicsCompressorNode } {
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.knee.value = 3;
  comp.ratio.value = 12;
  comp.attack.value = 0.002;
  comp.release.value = 0.1;
  comp.connect(ac.destination);
  const input = ac.createGain();
  input.gain.value = volume;
  input.connect(comp);
  return { input, comp };
}

/** Plays a recipe on the shared context at `volume` (0..1). Returns null when Web Audio is unavailable. */
export function playRecipe(recipe: Recipe, volume: number): Voice | null {
  const ac = sharedContext();
  if (!ac) return null;
  if (ac.state === 'suspended') void ac.resume();
  const { input, comp } = masterChain(ac, volume);
  recipe(ac, input, ac.currentTime + 0.01);
  const voice: Voice = {
    stop: () => {
      comp.disconnect();
      voices.delete(voice);
    },
  };
  voices.add(voice);
  setTimeout(() => voices.delete(voice), VOICE_LIFE_MS);
  return voice;
}

/** Cuts off every live recipe. */
export function stopAllVoices(): void {
  for (const v of [...voices]) v.stop();
}

/** Deterministic white noise (same WAV every render). */
function noiseBuffer(ac: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ac);
  if (!buf) {
    buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 1;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 1073741823.5) - 1;
    }
    noiseCache.set(ac, buf);
  }
  return buf;
}

/** Shapes a gain param: ADSR over `dur`, peaking at `peak`. Attack and decay are capped at 30% of dur each. */
export function envelope(g: AudioParam, t0: number, dur: number, peak: number, env: Adsr): void {
  const end = t0 + dur;
  const attackEnd = t0 + Math.min(env.attack, dur * 0.3);
  const decayEnd = attackEnd + Math.min(env.decay, dur * 0.3);
  const sustain = peak * env.sustain;
  const releaseStart = Math.max(decayEnd, end - env.release);
  g.setValueAtTime(0, t0);
  g.linearRampToValueAtTime(peak, attackEnd);
  g.linearRampToValueAtTime(sustain, decayEnd);
  g.setValueAtTime(sustain, releaseStart);
  g.linearRampToValueAtTime(0, end);
}

export interface ToneOpts {
  type: OscillatorType;
  f: number;
  fEnd?: number;
  t0: number;
  dur: number;
  peak: number;
  env: Adsr;
}

/** An oscillator with an optional exponential pitch glide from f to fEnd. */
export function tone(ac: BaseAudioContext, out: AudioNode, o: ToneOpts): void {
  const osc = ac.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.f, o.t0);
  if (o.fEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(o.fEnd, o.t0 + o.dur);
  const g = ac.createGain();
  envelope(g.gain, o.t0, o.dur, o.peak, o.env);
  osc.connect(g).connect(out);
  osc.start(o.t0);
  osc.stop(o.t0 + o.dur + 0.02);
}

export interface NoiseOpts {
  t0: number;
  dur: number;
  peak: number;
  env: Adsr;
  filter: BiquadFilterType;
  f: number;
  fEnd?: number;
  q?: number;
}

/** White noise through one biquad (frequency optionally swept from f to fEnd), shaped by an envelope. */
export function noiseBurst(ac: BaseAudioContext, out: AudioNode, o: NoiseOpts): void {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  src.loop = true;
  const filter = ac.createBiquadFilter();
  filter.type = o.filter;
  filter.frequency.setValueAtTime(o.f, o.t0);
  if (o.fEnd !== undefined) filter.frequency.exponentialRampToValueAtTime(o.fEnd, o.t0 + o.dur);
  filter.Q.value = o.q ?? 1;
  const g = ac.createGain();
  envelope(g.gain, o.t0, o.dur, o.peak, o.env);
  src.connect(filter).connect(g).connect(out);
  src.start(o.t0);
  src.stop(o.t0 + o.dur + 0.02);
}

/** A soft breath (the 'h' of a shout). */
export function breath(ac: BaseAudioContext, out: AudioNode, t0: number, dur: number, peak: number): void {
  noiseBurst(ac, out, { t0, dur, peak, env: PLUCK, filter: 'bandpass', f: 1400, q: 0.8 });
}

/** A slow sine wobble added into `target` (a gain or frequency param). `depth` is the swing in the param's units. */
export function wobble(ac: BaseAudioContext, target: AudioParam, rateHz: number, depth: number, t0: number, dur: number): void {
  const osc = ac.createOscillator();
  osc.frequency.value = rateHz;
  const amount = ac.createGain();
  amount.gain.value = depth;
  osc.connect(amount).connect(target);
  osc.start(t0);
  osc.stop(t0 + dur);
}

export type Vowel = 'a' | 'o' | 'e';

/** Formant centre frequencies (Hz) for each vowel; the three bands are mixed at 1, 0.5 and 0.25. */
const FORMANTS: Record<Vowel, readonly number[]> = {
  a: [800, 1150, 2900],
  o: [450, 800, 2830],
  e: [400, 1700, 2600],
};
const FORMANT_GAIN = [2, 1, 0.5];

export interface VoiceOpts {
  t0: number;
  dur: number;
  f0: number;
  f1?: number;
  vowel: Vowel;
  peak: number;
  /** 0..1 waveshaper drive (a rougher, harsher voice). */
  rough?: number;
  /** Vibrato depth as a fraction of f0 (default 1.5%). */
  vib?: number;
  /** Vibrato rate in Hz (default 5.5). */
  vibRate?: number;
}

/**
 * A wordless voice: a sawtooth at f0 (with vibrato and a pitch glide to f1) run through three parallel
 * bandpass filters at the vowel's formants. Used for the war cries.
 */
export function formantVoice(ac: BaseAudioContext, out: AudioNode, o: VoiceOpts): void {
  const end = o.t0 + o.dur;
  const f1 = o.f1 ?? o.f0;
  const src = ac.createOscillator();
  src.type = 'sawtooth';
  src.frequency.setValueAtTime(o.f0, o.t0);
  if (f1 !== o.f0) src.frequency.exponentialRampToValueAtTime(f1, end);
  wobble(ac, src.frequency, o.vibRate ?? 5.5, o.f0 * (o.vib ?? 0.015), o.t0, o.dur);

  let body: AudioNode = src;
  if (o.rough) {
    const shaper = ac.createWaveShaper();
    shaper.curve = drive(o.rough);
    shaper.oversample = '2x';
    src.connect(shaper);
    body = shaper;
  }
  const gate = ac.createGain();
  envelope(gate.gain, o.t0, o.dur, o.peak, { attack: 0.02, decay: 0.12, sustain: 0.8, release: 0.12 });
  gate.connect(out);
  FORMANTS[o.vowel].forEach((freq, i) => {
    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = 8;
    const level = ac.createGain();
    level.gain.value = FORMANT_GAIN[i];
    body.connect(band).connect(level).connect(gate);
  });
  src.start(o.t0);
  src.stop(end + 0.05);
}

/** Tanh soft clip curve; higher amount = more grit. */
function drive(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const k = 1 + amount * 8;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

export interface FmOpts {
  t0: number;
  dur: number;
  f: number;
  f1?: number;
  /** Modulator frequency as a multiple of the carrier. */
  ratio: number;
  /** Modulation depth in Hz at t0 and at the end (exponential glide). */
  index: number;
  indexEnd?: number;
  peak: number;
  env: Adsr;
}

/** Two-operator FM tone (bells, whinnies). */
export function fmTone(ac: BaseAudioContext, out: AudioNode, o: FmOpts): void {
  const end = o.t0 + o.dur;
  const f1 = o.f1 ?? o.f;
  const car = ac.createOscillator();
  car.frequency.setValueAtTime(o.f, o.t0);
  if (f1 !== o.f) car.frequency.exponentialRampToValueAtTime(f1, end);
  const mod = ac.createOscillator();
  mod.frequency.setValueAtTime(o.f * o.ratio, o.t0);
  if (f1 !== o.f) mod.frequency.exponentialRampToValueAtTime(f1 * o.ratio, end);
  const depth = ac.createGain();
  depth.gain.setValueAtTime(o.index, o.t0);
  if (o.indexEnd !== undefined && o.indexEnd !== o.index) depth.gain.exponentialRampToValueAtTime(o.indexEnd, end);
  mod.connect(depth).connect(car.frequency);
  const g = ac.createGain();
  envelope(g.gain, o.t0, o.dur, o.peak, o.env);
  car.connect(g).connect(out);
  car.start(o.t0);
  mod.start(o.t0);
  car.stop(end + 0.02);
  mod.stop(end + 0.02);
}
