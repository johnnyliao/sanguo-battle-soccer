import { describe, expect, it, vi } from 'vitest';
import { AudioPlayer } from './AudioPlayer';
import { SOUNDS, soundsForEvent } from './sounds';

function setup() {
  const play = vi.fn<(params: number[]) => void>();
  const player = new AudioPlayer(play);
  return { play, player };
}

describe('soundsForEvent', () => {
  it('maps shot kicks to the strong thump', () => {
    expect(soundsForEvent({ type: 'kick', kind: 'shot' })).toEqual([{ name: 'kickStrong', volume: 1 }]);
    expect(soundsForEvent({ type: 'kick', kind: 'pass' })).toEqual([{ name: 'kickPass', volume: 1 }]);
  });

  it('ignores bounces at or below strength 80', () => {
    expect(soundsForEvent({ type: 'bounce', strength: 80 })).toEqual([]);
    expect(soundsForEvent({ type: 'bounce', strength: 90 })).toEqual([{ name: 'bounce', volume: 0.9 }]);
  });

  it('plays the goal sound for a scored penalty only', () => {
    expect(soundsForEvent({ type: 'pkResult', team: 0, outcome: 'goal' })).toEqual([{ name: 'goal', volume: 1 }]);
    expect(soundsForEvent({ type: 'pkResult', team: 1, outcome: 'miss' })).toEqual([]);
    expect(soundsForEvent({ type: 'pkResult', team: 1, outcome: 'save' })).toEqual([]);
  });

  it('returns nothing for pickup and unknown types', () => {
    expect(soundsForEvent({ type: 'pickup' })).toEqual([]);
    expect(soundsForEvent({ type: 'nope' })).toEqual([]);
  });
});

describe('AudioPlayer', () => {
  it('plays the shot sound for a shot kick', () => {
    const { play, player } = setup();
    player.handleEvents([{ type: 'kick', kind: 'shot' }]);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.calls[0][0].slice(1)).toEqual(SOUNDS.kickStrong.slice(1));
  });

  it('plays the goal sound', () => {
    const { play, player } = setup();
    player.handleEvents([{ type: 'goal' }]);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.calls[0][0].slice(1)).toEqual(SOUNDS.goal.slice(1));
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
    player.handleEvents([{ type: 'goal' }]);
    const half = play.mock.calls[0][0][0];
    player.volume = 1;
    player.handleEvents([{ type: 'goal' }]);
    const full = play.mock.calls[1][0][0];
    expect(half).toBeCloseTo(SOUNDS.goal[0] * 0.5);
    expect(full).toBeCloseTo(SOUNDS.goal[0]);
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
