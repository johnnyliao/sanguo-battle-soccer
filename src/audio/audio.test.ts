import { describe, expect, it, vi } from 'vitest';
import { AudioPlayer, SAMPLE_GAP_MS } from './AudioPlayer';
import { SOUNDS, soundsForEvent } from './sounds';

function setup(clock = { t: 0 }) {
  const play = vi.fn<(params: number[]) => void>();
  const samples = { preload: vi.fn(), play: vi.fn<(slot: string, gain: number) => void>(), stop: vi.fn() };
  const player = new AudioPlayer(play, undefined, () => clock.t, samples);
  return { play, samples, player, clock };
}

describe('soundsForEvent', () => {
  it('maps shot kicks to the shot sample and passes to the pass sample', () => {
    expect(soundsForEvent({ type: 'kick', kind: 'shot' })).toEqual([{ name: 'sfx:kick_shot', volume: 1 }]);
    expect(soundsForEvent({ type: 'kick', kind: 'clear' })).toEqual([{ name: 'sfx:kick_shot', volume: 1 }]);
    expect(soundsForEvent({ type: 'kick', kind: 'pass' })).toEqual([{ name: 'sfx:kick_pass', volume: 1 }]);
  });

  it('ignores bounces at or below strength 80', () => {
    expect(soundsForEvent({ type: 'bounce', strength: 80 })).toEqual([]);
    expect(soundsForEvent({ type: 'bounce', strength: 90 })).toEqual([{ name: 'bounce', volume: 0.9 }]);
  });

  it('plays the big special sound for a special activation and for the special ball', () => {
    expect(soundsForEvent({ type: 'special', playerIdx: 0, kind: 'straight', name: 'x' })).toEqual([{ name: 'special', volume: 1 }]);
    expect(soundsForEvent({ type: 'specialShot', playerIdx: 0, kind: 'straight' })).toEqual([{ name: 'special', volume: 1 }]);
  });

  it('plays the goal sound for a scored penalty only', () => {
    expect(soundsForEvent({ type: 'pkResult', team: 0, outcome: 'goal' })).toEqual([{ name: 'sfx:goal', volume: 1 }]);
    expect(soundsForEvent({ type: 'pkResult', team: 1, outcome: 'miss' })).toEqual([]);
    expect(soundsForEvent({ type: 'pkResult', team: 1, outcome: 'save' })).toEqual([]);
  });

  it('returns nothing for pickup and unknown types', () => {
    expect(soundsForEvent({ type: 'pickup' })).toEqual([]);
    expect(soundsForEvent({ type: 'nope' })).toEqual([]);
  });
});

describe('AudioPlayer', () => {
  it('plays the shot sample for a shot kick', () => {
    const { play, samples, player } = setup();
    player.handleEvents([{ type: 'kick', kind: 'shot' }]);
    expect(samples.play).toHaveBeenCalledTimes(1);
    expect(samples.play).toHaveBeenCalledWith('kick_shot', 0.5);
    expect(play).not.toHaveBeenCalled();
  });

  it('plays the goal sample', () => {
    const { play, samples, player } = setup();
    player.handleEvents([{ type: 'goal' }]);
    expect(samples.play).toHaveBeenCalledTimes(1);
    expect(samples.play).toHaveBeenCalledWith('goal', 0.5);
    expect(play).not.toHaveBeenCalled();
  });

  it('plays a generic ZzFX sound for an event without a sample', () => {
    const { play, samples, player } = setup();
    player.handleEvents([{ type: 'whistle', reason: 'kickoff' }]);
    expect(samples.play).not.toHaveBeenCalled();
    expect(play.mock.calls[0][0].slice(1)).toEqual(SOUNDS.whistle.slice(1));
  });

  it('routes a sample cue to the sample player with volume times cue volume, and the gap per cue', () => {
    const { samples, player, clock } = setup();
    player.volume = 0.4;
    player.handleEvents([{ type: 'attack', playerIdx: 0, kind: 'punch' }], () => 'caocao');
    expect(samples.play).toHaveBeenCalledWith('swing_blade', 0.4);
    clock.t = SAMPLE_GAP_MS - 1;
    player.handleEvents([{ type: 'attack', playerIdx: 0, kind: 'punch' }], () => 'caocao');
    expect(samples.play).toHaveBeenCalledTimes(1);
    clock.t = SAMPLE_GAP_MS;
    player.handleEvents([{ type: 'attack', playerIdx: 0, kind: 'punch' }], () => 'caocao');
    expect(samples.play).toHaveBeenCalledTimes(2);
  });

  it('applies the gap per cue, so different samples in one window both play', () => {
    const { samples, player } = setup();
    player.handleEvents([{ type: 'kick', kind: 'shot' }, { type: 'goal' }]);
    player.handleEvents([{ type: 'goal' }]);
    expect(samples.play.mock.calls.map((c) => c[0])).toEqual(['kick_shot', 'goal']);
  });

  it('stops sample voices with stop(), and preloads through preloadSamples()', () => {
    const { samples, player } = setup();
    player.preloadSamples();
    player.stop();
    expect(samples.preload).toHaveBeenCalledTimes(1);
    expect(samples.stop).toHaveBeenCalledTimes(1);
  });

  it('plays no sample when muted', () => {
    const { samples, player } = setup();
    player.muted = true;
    player.handleEvents([{ type: 'goal' }]);
    expect(samples.play).not.toHaveBeenCalled();
  });

  it('plays nothing for pickup', () => {
    const { play, player } = setup();
    player.handleEvents([{ type: 'pickup' }]);
    expect(play).not.toHaveBeenCalled();
  });

  it('plays a repeated hit sound only once per call', () => {
    const { play, player } = setup();
    player.handleEvents([{ type: 'hit', kind: 'punch' }, { type: 'hit', kind: 'punch' }]);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('plays nothing when muted', () => {
    const { play, player } = setup();
    player.muted = true;
    player.handleEvents([{ type: 'goal' }, { type: 'kick', kind: 'shot' }]);
    expect(play).not.toHaveBeenCalled();
  });

  it('scales the first param by volume', () => {
    const { play, player } = setup();
    player.volume = 0.5;
    player.handleEvents([{ type: 'whistle', reason: 'kickoff' }]);
    const half = play.mock.calls[0][0][0];
    player.volume = 1;
    player.handleEvents([{ type: 'whistle', reason: 'kickoff' }]);
    const full = play.mock.calls[1][0][0];
    expect(half).toBeCloseTo(SOUNDS.whistle[0] * 0.5);
    expect(full).toBeCloseTo(SOUNDS.whistle[0]);
  });

  it('ignores unknown event types', () => {
    const { play, player } = setup();
    player.handleEvents([{ type: 'mystery', kind: 'x' }]);
    expect(play).not.toHaveBeenCalled();
  });

  it('keeps bounces below threshold silent', () => {
    const { play, player } = setup();
    player.handleEvents([{ type: 'bounce', strength: 40 }]);
    expect(play).not.toHaveBeenCalled();
  });
});
