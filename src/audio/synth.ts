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

/** `shout` is the battle-cry bus: hard limiter and +6 dB makeup. `sfx` is the normal master. */
export type Bus = 'sfx' | 'shout';

/** Per-call master: a gain at `volume` into a limiter-like compressor, then the output. */
export function masterChain(
  ac: AudioContext | OfflineAudioContext,
  volume: number,
  bus: Bus = 'sfx',
): { input: GainNode; comp: DynamicsCompressorNode } {
  const comp = ac.createDynamicsCompressor();
  if (bus === 'shout') {
    comp.threshold.value = -6;
    comp.knee.value = 0;
    comp.ratio.value = 20;
    comp.attack.value = 0.003;
    comp.release.value = 0.06;
  } else {
    comp.threshold.value = -6;
    comp.knee.value = 3;
    comp.ratio.value = 12;
    comp.attack.value = 0.002;
    comp.release.value = 0.1;
  }
  // The compressor's automatic makeup puts loud peaks near 0 dBFS, so the shout bus is trimmed to a -2.5 dBFS ceiling.
  const trim = ac.createGain();
  trim.gain.value = bus === 'shout' ? 0.75 : 1;
  comp.connect(trim).connect(ac.destination);
  const input = ac.createGain();
  // The shout bus is made hot so its compressor works hard and sets the level.
  input.gain.value = bus === 'shout' ? volume * 2 : volume;
  input.connect(comp);
  return { input, comp };
}

/** Plays a recipe on the shared context at `volume` (0..1). Returns null when Web Audio is unavailable. */
export function playRecipe(recipe: Recipe, volume: number, bus: Bus = 'sfx'): Voice | null {
  const ac = sharedContext();
  if (!ac) return null;
  if (ac.state === 'suspended') void ac.resume();
  const { input, comp } = masterChain(ac, volume, bus);
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

export type WarVowel = 'a' | 'o' | 'e' | 'u';
/** The plosive that opens a cry: 'h' breath, 'k' hard click, 'g' throaty. */
export type WarOnset = 'h' | 'k' | 'g';

export interface WarCryOpts {
  t0: number;
  /** Whole cry in seconds, including the final fall. */
  dur: number;
  /** Pitch at the onset; rises to fPeak over the first 80 ms, then falls to fEnd over the last `fall` seconds. */
  f0: number;
  fPeak: number;
  fEnd: number;
  /** Vowel before and after `switchAt` (fraction of dur, default 0.4). */
  vowels: readonly [WarVowel, WarVowel];
  switchAt?: number;
  onset: WarOnset;
  /** Level into the saturator. The shout bus limiter sets the final level. */
  peak: number;
  /** Saturation drive, 0..1. */
  grit: number;
  /** Pitch wander depth as a fraction of the pitch (0.045 = ±4.5%). */
  jitter: number;
  /** Rasp noise level relative to peak. */
  rasp: number;
  /** Sub-octave voice level relative to peak. */
  sub: number;
  /** Presence peak gain at 2 kHz in dB (default 6). */
  presenceDb?: number;
  /** Length of the final fall in seconds (default 0.3). */
  fall?: number;
  /** Amplitude envelope (default CRY_ENV). */
  env?: Adsr;
  /** Length of the plosive or aspiration before the voices, in seconds (default 0.045). */
  lead?: number;
  /** Lowpass cutoff in Hz on the tonal voices after the saturator (a glottal-like source). Off by default. */
  lowpass?: number;
  /** Level of the three tonal voices relative to the default (1). */
  voice?: number;
  /** Amplitude wander depth (default 0.18, about ±18%). */
  shimmer?: number;
  /** Breathy voice: white noise through the same vowel formants, level relative to peak. 0 = none (default). */
  breath?: number;
  /** Multiplies every vowel formant frequency (1.2 approximates a female throat). Default 1. */
  formantScale?: number;
}

const CRY_ENV: Adsr = { attack: 0.01, decay: 0.08, sustain: 0.9, release: 0.22 };
const CRY_ONSET_ENV: Adsr = { attack: 0.002, decay: 0.03, sustain: 0.2, release: 0.02 };
/** The plosive noise starts this long before the voices. */
const CRY_LEAD = 0.045;
const CRY_RISE = 0.08;
/** Three stacked voices: detune in cents and onset delay in seconds. */
const CRY_VOICES = [
  { cents: -18, delay: 0.006 },
  { cents: 18, delay: 0.014 },
  { cents: 0, delay: 0 },
] as const;
const CRY_ONSET: Record<WarOnset, { filter: BiquadFilterType; f: number; q: number }> = {
  h: { filter: 'bandpass', f: 1400, q: 0.8 },
  k: { filter: 'bandpass', f: 2200, q: 1.2 },
  g: { filter: 'lowpass', f: 600, q: 0.7 },
};
/** Shouted vowels with a high first formant (bright, open). */
const WAR_FORMANTS: Record<WarVowel, readonly number[]> = {
  a: [850, 1250, 2600],
  o: [550, 900, 2400],
  e: [500, 1800, 2700],
  u: [380, 750, 2400],
};
const WAR_FORMANT_GAIN = [1, 0.5, 0.3];

/** Runs `input` through the two shouted vowels, crossfading from the first to the second at switchAt. */
function vowelBanks(
  ac: BaseAudioContext,
  input: AudioNode,
  t0: number,
  switchAt: number,
  vowels: readonly [WarVowel, WarVowel],
  scale: number,
): GainNode {
  const formants = ac.createGain();
  const fades = [
    { vowel: vowels[0], from: 1, to: 0 },
    { vowel: vowels[1], from: 0, to: 1 },
  ];
  for (const { vowel, from, to } of fades) {
    const bank = ac.createGain();
    bank.gain.setValueAtTime(from, t0);
    bank.gain.setValueAtTime(from, switchAt);
    bank.gain.linearRampToValueAtTime(to, switchAt + 0.06);
    WAR_FORMANTS[vowel].forEach((freq, k) => {
      const band = ac.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = freq * scale;
      band.Q.value = 6;
      const bandLevel = ac.createGain();
      bandLevel.gain.value = WAR_FORMANT_GAIN[k];
      input.connect(band).connect(bandLevel).connect(bank);
    });
    bank.connect(formants);
  }
  return formants;
}

const wanderCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Deterministic slow random wander (under ~50 Hz), scaled to a standard deviation of 1/3 (peaks near ±1). */
function wanderBuffer(ac: BaseAudioContext): AudioBuffer {
  let buf = wanderCache.get(ac);
  if (!buf) {
    const len = ac.sampleRate * 2;
    buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    const a = 1 - Math.exp((-2 * Math.PI * 50) / ac.sampleRate);
    let seed = 7;
    let y1 = 0;
    let y2 = 0;
    let sumSq = 0;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      y1 += a * (seed / 1073741823.5 - 1 - y1);
      y2 += a * (y1 - y2);
      data[i] = y2;
      sumSq += y2 * y2;
    }
    const scale = 1 / (3 * Math.sqrt(sumSq / len));
    for (let i = 0; i < len; i++) data[i] *= scale;
    wanderCache.set(ac, buf);
  }
  return buf;
}

/** A looping wander signal starting `offset` seconds into the buffer, so each voice wanders on its own. */
function wanderSource(ac: BaseAudioContext, offset: number, t0: number, dur: number): AudioBufferSourceNode {
  const src = ac.createBufferSource();
  src.buffer = wanderBuffer(ac);
  src.loop = true;
  src.start(t0, offset);
  src.stop(t0 + dur + 0.02);
  return src;
}

/** Pitch glide: f0 to fPeak over the rise, hold, then a fall to fEnd from fallStart to end. */
function pitchContour(
  p: AudioParam,
  f: { f0: number; fPeak: number; fEnd: number },
  vs: number,
  rise: number,
  fallStart: number,
  end: number,
): void {
  p.setValueAtTime(f.f0, vs);
  p.exponentialRampToValueAtTime(f.fPeak, vs + rise);
  p.setValueAtTime(f.fPeak, fallStart);
  p.exponentialRampToValueAtTime(f.fEnd, end);
}

/**
 * Battlefield space for a cry: a dry path, a 115 ms slapback at -10 dB and a tiny room of two short feedback
 * delays. Feed the returned node; everything ends in `out`.
 */
export function battleSpace(ac: BaseAudioContext, out: AudioNode): AudioNode {
  const input = ac.createGain();
  input.connect(out);
  const slap = ac.createDelay(0.2);
  slap.delayTime.value = 0.115;
  const slapLevel = ac.createGain();
  slapLevel.gain.value = 0.32;
  input.connect(slap).connect(slapLevel).connect(out);
  for (const [time, feedback, level] of [[0.029, 0.35, 0.22], [0.043, 0.3, 0.16]] as const) {
    const room = ac.createDelay(0.2);
    room.delayTime.value = time;
    const fb = ac.createGain();
    fb.gain.value = feedback;
    const roomLevel = ac.createGain();
    roomLevel.gain.value = level;
    input.connect(room);
    room.connect(fb).connect(room);
    room.connect(roomLevel).connect(out);
  }
  return input;
}

/**
 * A battle cry from one throat: a plosive, then three detuned, slightly delayed sawtooth voices with pitch wander,
 * amplitude wander and a hard saturator, each through the shouted vowel formants (crossfading at switchAt).
 * A sub-octave sine adds chest, a bandpass noise adds rasp, and a 2 kHz presence peak brings it forward.
 * The pitch rises into the note and falls at the end, where the wander grows into a fry tail.
 */
export function warCry(ac: BaseAudioContext, out: AudioNode, o: WarCryOpts): void {
  const end = o.t0 + o.dur;
  const lead = o.lead ?? CRY_LEAD;
  const start = o.t0 + lead;
  const env = o.env ?? CRY_ENV;
  const fall = o.fall ?? 0.3;
  const rise = Math.min(CRY_RISE, o.dur * 0.4);
  const switchAt = o.t0 + o.dur * (o.switchAt ?? 0.4);
  const scale = o.formantScale ?? 1;
  const onset = CRY_ONSET[o.onset];
  const pitch = { f0: o.f0, fPeak: o.fPeak, fEnd: o.fEnd };

  noiseBurst(ac, out, {
    t0: o.t0, dur: lead + 0.01, peak: o.peak * 0.6, env: CRY_ONSET_ENV,
    filter: onset.filter, f: onset.f, q: onset.q,
  });

  const mix = ac.createGain();
  const presence = ac.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 2000;
  presence.Q.value = 0.9;
  presence.gain.value = o.presenceDb ?? 6;
  mix.connect(presence).connect(out);

  CRY_VOICES.forEach((v, i) => {
    const vs = start + v.delay;
    const fallStart = Math.min(end, Math.max(vs + rise, end - fall));
    const src = ac.createOscillator();
    src.type = 'sawtooth';
    src.detune.value = v.cents;
    pitchContour(src.frequency, pitch, vs, rise, fallStart, end);
    wobble(ac, src.frequency, 5.5, o.fPeak * 0.012, vs, end - vs);
    // Pitch wander, growing 3x over the fall (the fry tail).
    const depth = ac.createGain();
    const jitterHz = o.fPeak * o.jitter;
    depth.gain.setValueAtTime(jitterHz, vs);
    depth.gain.setValueAtTime(jitterHz, fallStart);
    depth.gain.linearRampToValueAtTime(jitterHz * 3, end);
    wanderSource(ac, i * 0.37, vs, end - vs).connect(depth).connect(src.frequency);

    const level = ac.createGain();
    level.gain.value = o.peak * 0.4 * (o.voice ?? 1);
    const shaper = ac.createWaveShaper();
    shaper.curve = drive(o.grit);
    shaper.oversample = '2x';
    src.connect(level).connect(shaper);
    let body: AudioNode = shaper;
    if (o.lowpass !== undefined) {
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lowpass;
      body = shaper.connect(lp);
    }

    const formants = vowelBanks(ac, body, o.t0, switchAt, o.vowels, scale);
    // Amplitude wander (shimmer), multiplied on top of the envelope.
    const gate = ac.createGain();
    envelope(gate.gain, vs, end - vs, 1, env);
    const amp = ac.createGain();
    const ampDepth = ac.createGain();
    ampDepth.gain.value = o.shimmer ?? 0.18;
    wanderSource(ac, i * 0.37 + 0.19, vs, end - vs).connect(ampDepth).connect(amp.gain);
    formants.connect(gate).connect(amp).connect(mix);
    src.start(vs);
    src.stop(end + 0.02);
  });

  if (o.breath) {
    // Whispered voice: white noise through the same crossfading vowel formants, from the first sample.
    const hiss = ac.createBufferSource();
    hiss.buffer = noiseBuffer(ac);
    hiss.loop = true;
    const hissGate = ac.createGain();
    envelope(hissGate.gain, o.t0, end - o.t0, o.peak * o.breath, env);
    vowelBanks(ac, hiss, o.t0, switchAt, o.vowels, scale).connect(hissGate).connect(mix);
    hiss.start(o.t0);
    hiss.stop(end + 0.02);
  }

  noiseBurst(ac, mix, {
    t0: start, dur: end - start, peak: o.peak * o.rasp, env, filter: 'bandpass', f: 2500, q: 1.2,
  });

  if (o.sub > 0) {
    const subVoice = ac.createOscillator();
    subVoice.type = 'sine';
    const fallStart = Math.min(end, Math.max(start + rise, end - fall));
    pitchContour(subVoice.frequency, { f0: o.f0 / 2, fPeak: o.fPeak / 2, fEnd: o.fEnd / 2 }, start, rise, fallStart, end);
    const subGate = ac.createGain();
    envelope(subGate.gain, start, end - start, o.peak * o.sub, env);
    subVoice.connect(subGate).connect(mix);
    subVoice.start(start);
    subVoice.stop(end + 0.02);
  }
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
