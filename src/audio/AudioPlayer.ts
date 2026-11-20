import { SOUNDS, soundsForEvent, type SimEvent, type SoundCue } from './sounds';
import { SYNTH_RECIPES } from './characterSounds';
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
  if (recipe) playRecipe(recipe, volume);
}

/** The character behind an event: the player's, the attacker's for hits, the owner's for rider events. */
function eventCharId(e: SimEvent, charIdOf?: CharIdOf, riderOwnerOf?: RiderOwnerOf): string | undefined {
  if (!charIdOf) return undefined;
  let idx: number | undefined;
  if (e.type === 'riderSpawn' || e.type === 'riderHit' || e.type === 'riderEnd') {
    idx = typeof e.riderId === 'number' ? riderOwnerOf?.(e.riderId) : undefined;
  } else if (e.type === 'hit') {
    idx = typeof e.attackerIdx === 'number' ? e.attackerIdx : undefined;
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
  private readonly lastShout = new Map<string, number>();

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
      const charId = eventCharId(event, charIdOf, riderOwnerOf);
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
    if (cue.name.endsWith('.shout')) {
      const t = this.now();
      const last = this.lastShout.get(cue.name);
      if (last !== undefined && t - last < SHOUT_GAP_MS) return;
      this.lastShout.set(cue.name, t);
    }
    this.synth(cue.name, this.volume * cue.volume);
  }
}
