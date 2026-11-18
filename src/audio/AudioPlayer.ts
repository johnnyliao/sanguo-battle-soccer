import { SOUNDS, soundsForEvent, type SimEvent } from './sounds';

export type PlayFn = (params: number[]) => void;

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

export class AudioPlayer {
  muted = false;
  volume = 0.5;
  private readonly play: PlayFn;

  constructor(play: PlayFn = defaultZzfxPlay) {
    this.play = play;
  }

  handleEvents(events: SimEvent[]): void {
    if (this.muted) return;
    const seen = new Set<string>();
    for (const event of events) {
      for (const cue of soundsForEvent(event)) {
        if (seen.has(cue.name)) continue;
        seen.add(cue.name);
        const base = SOUNDS[cue.name];
        if (!base) continue;
        const params = [...base];
        params[0] = base[0] * this.volume * cue.volume;
        this.play(params);
      }
    }
  }
}
