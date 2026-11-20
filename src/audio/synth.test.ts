import { afterEach, describe, expect, it, vi } from 'vitest';
import { playRecipe } from './synth';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('synth module', () => {
  it('imports without creating an AudioContext', async () => {
    const ctor = vi.fn();
    vi.stubGlobal('AudioContext', ctor);
    await import('./synth');
    await import('./characterSounds');
    await import('./AudioPlayer');
    expect(ctor).not.toHaveBeenCalled();
  });

  it('returns null from playRecipe when Web Audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    expect(playRecipe(() => {}, 0.5)).toBeNull();
  });
});
