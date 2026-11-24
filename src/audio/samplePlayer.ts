/// <reference types="vite/client" />
// Plays the CC0 sample files (public/sfx/<slot>.wav) on the AudioContext shared with synth.ts.
// Nothing here touches Web Audio at import time; the context is only used once play or preload runs.
import { SAMPLE_SLOTS } from './sampleSounds';
import { sharedContext } from './synth';

/** Most sample voices sounding at once. A new one beyond this is dropped. */
export const MAX_SAMPLE_VOICES = 8;

export interface SamplePlayer {
  /** Starts fetching and decoding every sample in the background. Never blocks. */
  preload(): void;
  /** Plays one sample (file sfx/<slot>.wav) at gain (0..1 times the volume). Silent when not loaded. */
  play(slot: string, gain: number): void;
  /** Cuts off every sample still playing. */
  stop(): void;
}

export function sampleUrl(slot: string): string {
  return `${import.meta.env.BASE_URL}sfx/${slot}.wav`;
}

export class WebSamplePlayer implements SamplePlayer {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly voices = new Set<AudioBufferSourceNode>();
  private started = false;

  preload(): void {
    if (this.started) return;
    this.started = true;
    const ac = sharedContext();
    if (!ac) return;
    for (const slot of SAMPLE_SLOTS) {
      this.load(ac, slot).catch(() => {});
    }
  }

  play(slot: string, gain: number): void {
    const ac = sharedContext();
    const buffer = this.buffers.get(slot);
    if (!ac || !buffer || this.voices.size >= MAX_SAMPLE_VOICES) return;
    try {
      if (ac.state === 'suspended') void ac.resume();
      const src = ac.createBufferSource();
      const amp = ac.createGain();
      amp.gain.value = gain;
      src.buffer = buffer;
      src.connect(amp).connect(ac.destination);
      this.voices.add(src);
      src.onended = () => this.voices.delete(src);
      src.start();
    } catch {
      // Audio is optional; ignore playback failures.
    }
  }

  stop(): void {
    for (const src of this.voices) src.stop();
    this.voices.clear();
  }

  private async load(ac: AudioContext, slot: string): Promise<void> {
    const res = await fetch(sampleUrl(slot));
    if (!res.ok) return;
    this.buffers.set(slot, await ac.decodeAudioData(await res.arrayBuffer()));
  }
}
