import { SOUNDS, soundsForEvent, type SimEvent, type SoundCue } from './sounds';
import { cueBus, SYNTH_RECIPES } from './characterSounds';
import { playRecipe, stopAllVoices } from './synth';

export type PlayFn = (params: number[]) => void;
/** Plays one synthesized cue (a SYNTH_RECIPES key) at a volume 0..1. */
export type SynthFn = (name: string, volume: number) => void;
/** Character id of a player index, or undefined when unknown. */
export type CharIdOf = (playerIdx: number) => string | undefined;
/** Owner player index of a summon rider, or undefined when the rider is gone. */
export type RiderOwnerOf = (riderId: number) => number | undefined;

/** Minimum gap between two shouts of the same character. */
export const SHOUT_GAP_MS = 1500;
/** Minimum gap between two heal shimmers: Cao Cao's blade waves can heal several times a second. */
export const HEAL_GAP_MS = 250;

/** Minimum gap between two plays of the same cue (0 = no limit). */
function minGapMs(name: string): number {
  if (name.endsWith('.shout')) return SHOUT_GAP_MS;
  if (name === 'caocao.slashHeal') return HEAL_GAP_MS;
  return 0;
}

// Loaded lazily: importing zzfx creates an AudioContext at module load,
// which must not happen in non-browser environments (tests).
export function defaultZzfxPlay(params: number[]): void {
  try {
    void import('zzfx')
      .then((m) => m.zzfx(...params))
      .catch(() => {});
  } catch {
    // Audio is optional; ignore playback failures.
  }
}

export function defaultSynthPlay(name: string, volume: number): void {
  const recipe = SYNTH_RECIPES[name];
  if (recipe) playRecipe(recipe, volume, cueBus(name));
}

/**
 * The character behind an event: the player's, the attacker's for hits, the owner's for rider events,
 * and the caster's for ice pulses and ends (looked up by field id).
 */
function eventCharId(
  e: SimEvent,
  fieldOwners: ReadonlyMap<number, number>,
  charIdOf?: CharIdOf,
  riderOwnerOf?: RiderOwnerOf,
): string | undefined {
  if (!charIdOf) return undefined;
  let idx: number | undefined;
  if (e.type === 'riderSpawn' || e.type === 'riderHit' || e.type === 'riderEnd') {
    idx = typeof e.riderId === 'number' ? riderOwnerOf?.(e.riderId) : undefined;
  } else if (e.type === 'hit') {
    idx = typeof e.attackerIdx === 'number' ? e.attackerIdx : undefined;
  } else if (e.type === 'icePulse' || e.type === 'iceEnd') {
    idx = typeof e.fieldId === 'number' ? fieldOwners.get(e.fieldId) : undefined;
  } else {
    idx = typeof e.playerIdx === 'number' ? e.playerIdx : undefined;
  }
  return idx === undefined ? undefined : charIdOf(idx);
}

export class AudioPlayer {
  muted = false;
  volume = 0.5;
  private readonly play: PlayFn;
  private readonly synth: SynthFn;
  private readonly now: () => number;
  private readonly lastPlayed = new Map<string, number>();
  /** Caster player index of each live ice field, keyed by field id. */
  private readonly fieldOwners = new Map<number, number>();

  constructor(
    play: PlayFn = defaultZzfxPlay,
    synth: SynthFn = defaultSynthPlay,
    now: () => number = () => performance.now(),
  ) {
    this.play = play;
    this.synth = synth;
    this.now = now;
  }

  /**
   * Plays the sounds for one tick's events. charIdOf and riderOwnerOf let Shu characters use their own
   * sounds; without them every event uses the generic table.
   */
  handleEvents(events: SimEvent[], charIdOf?: CharIdOf, riderOwnerOf?: RiderOwnerOf): void {
    if (this.muted) return;
    const seen = new Set<string>();
    for (const event of events) {
      if (event.type === 'matchEnd') this.stop();
      const charId = eventCharId(event, this.fieldOwners, charIdOf, riderOwnerOf);
      if (event.type === 'iceStart' && typeof event.fieldId === 'number' && typeof event.playerIdx === 'number') {
        this.fieldOwners.set(event.fieldId, event.playerIdx);
      }
      if (event.type === 'iceEnd' && typeof event.fieldId === 'number') this.fieldOwners.delete(event.fieldId);
      for (const cue of soundsForEvent(event, charId)) {
        if (seen.has(cue.name)) continue;
        seen.add(cue.name);
        if (SYNTH_RECIPES[cue.name]) {
          this.playSynth(cue);
          continue;
        }
        const base = SOUNDS[cue.name];
        if (!base) continue;
        const params = [...base];
        params[0] = base[0] * this.volume * cue.volume;
        this.play(params);
      }
    }
  }

  /** Cuts off the synthesized sounds still playing (a hoof loop, a long engine). */
  stop(): void {
    stopAllVoices();
  }

  private playSynth(cue: SoundCue): void {
    const gap = minGapMs(cue.name);
    if (gap > 0) {
      const t = this.now();
      const last = this.lastPlayed.get(cue.name);
      if (last !== undefined && t - last < gap) return;
      this.lastPlayed.set(cue.name, t);
    }
    this.synth(cue.name, this.volume * cue.volume);
  }
}
