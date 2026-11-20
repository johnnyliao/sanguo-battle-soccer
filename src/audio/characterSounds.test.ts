import { describe, expect, it, vi } from 'vitest';
import { AudioPlayer, SHOUT_GAP_MS } from './AudioPlayer';
import { cueBus, SYNTH_RECIPES } from './characterSounds';
import { SOUNDS, soundsForEvent } from './sounds';

const CHARS = ['zhangfei', 'guanyu', 'zhugeliang', 'machao', 'zhaoyun', 'xuchu'];
const charOf = (idx: number) => CHARS[idx];

function setup(clock = { t: 0 }) {
  const play = vi.fn<(params: number[]) => void>();
  const synth = vi.fn<(name: string, volume: number) => void>();
  const player = new AudioPlayer(play, synth, () => clock.t);
  return { play, synth, player, clock };
}

describe('character sound mapping', () => {
  it('plays the Shu attack cue for a Shu attacker', () => {
    expect(soundsForEvent({ type: 'attack', playerIdx: 0, kind: 'punch' }, 'zhangfei')).toEqual([
      { name: 'zhangfei.attack', volume: 1 },
    ]);
  });

  it('keeps the generic whoosh for a non-Shu attacker', () => {
    expect(soundsForEvent({ type: 'attack', playerIdx: 0, kind: 'punch' }, 'xuchu')).toEqual([
      { name: 'whoosh', volume: 1 },
    ]);
    expect(soundsForEvent({ type: 'attack', playerIdx: 0, kind: 'punch' })).toEqual([{ name: 'whoosh', volume: 1 }]);
  });

  it('plays the shout for a Shu special, not the generic special', () => {
    expect(soundsForEvent({ type: 'special', playerIdx: 1, kind: 'lob', name: 'x' }, 'guanyu')).toEqual([
      { name: 'guanyu.shout', volume: 1 },
    ]);
    expect(soundsForEvent({ type: 'special', playerIdx: 0, kind: 'pierce', name: 'x' }, 'xuchu')).toEqual([
      { name: 'special', volume: 1 },
    ]);
  });

  it('plays the horn cast with the shout for Ma Chao', () => {
    expect(soundsForEvent({ type: 'special', playerIdx: 3, kind: 'straight', name: 'x' }, 'machao')).toEqual([
      { name: 'machao.shout', volume: 1 },
      { name: 'machao.cast', volume: 1 },
    ]);
  });

  it('plays the engine cue for a Guan Yu ride start', () => {
    expect(soundsForEvent({ type: 'rideStart', playerIdx: 1, dirX: 1, dirY: 0 }, 'guanyu')).toEqual([
      { name: 'guanyu.rideStart', volume: 1 },
    ]);
  });

  it('plays Zhao Yun the special hit only for a special hit', () => {
    expect(soundsForEvent({ type: 'hit', attackerIdx: 4, victimIdx: 1, kind: 'special', damage: 1 }, 'zhaoyun')).toEqual([
      { name: 'zhaoyun.hit', volume: 1 },
    ]);
    expect(soundsForEvent({ type: 'hit', attackerIdx: 4, victimIdx: 1, kind: 'punch', damage: 1 }, 'zhaoyun')).toEqual([
      { name: 'punch', volume: 1 },
    ]);
  });

  it('keeps punches and tackles by a Shu attacker generic', () => {
    expect(soundsForEvent({ type: 'hit', attackerIdx: 0, victimIdx: 1, kind: 'tackle', damage: 1 }, 'zhangfei')).toEqual([
      { name: 'heavyHit', volume: 1 },
    ]);
  });

  it('gives every mapped Shu cue a synthesized recipe', () => {
    const events = [
      { type: 'attack', playerIdx: 0, kind: 'punch' },
      { type: 'special', playerIdx: 0, kind: 'pierce', name: 'x' },
      { type: 'roar', playerIdx: 0, x: 0, y: 0, radius: 1 },
      { type: 'roarBall', playerIdx: 0, x: 0, y: 0 },
      { type: 'rideStart', playerIdx: 0, dirX: 1, dirY: 0 },
      { type: 'rideHit', playerIdx: 0, victimIdx: 1, x: 0, y: 0 },
      { type: 'rideEnd', playerIdx: 0 },
      { type: 'beamCharge', playerIdx: 0 },
      { type: 'beamStrike', playerIdx: 0, victimIdx: 1 },
      { type: 'beamCancel', playerIdx: 0 },
      { type: 'lungeStart', playerIdx: 0, x: 0, y: 0, dirX: 1, dirY: 0 },
      { type: 'lungeHeal', playerIdx: 0, amount: 1 },
      { type: 'hit', attackerIdx: 0, victimIdx: 1, kind: 'special', damage: 1 },
      { type: 'riderHit', riderId: 1, victimIdx: 1, x: 0, y: 0 },
    ];
    const shu = ['zhangfei', 'guanyu', 'zhugeliang', 'machao', 'zhaoyun'];
    let mapped = 0;
    for (const charId of shu) {
      for (const ev of events) {
        for (const cue of soundsForEvent(ev, charId)) {
          if (!cue.name.startsWith(`${charId}.`)) continue;
          mapped++;
          expect(SYNTH_RECIPES[cue.name], cue.name).toBeTypeOf('function');
        }
      }
    }
    expect(mapped).toBeGreaterThan(0);
  });
});

describe('battle cry recipes', () => {
  it('keeps the old shout as shoutOld for every Shu character', () => {
    for (const charId of CHARS.slice(0, 5)) {
      expect(SYNTH_RECIPES[`${charId}.shoutOld`], charId).toBeTypeOf('function');
    }
  });

  it('routes only the new shouts to the shout bus', () => {
    expect(cueBus('zhangfei.shout')).toBe('shout');
    expect(cueBus('zhangfei.shoutOld')).toBe('sfx');
    expect(cueBus('zhangfei.roar')).toBe('sfx');
  });
});

describe('AudioPlayer character cues', () => {
  it('routes Shu cues to the synth and never to ZzFX', () => {
    const { play, synth, player } = setup();
    player.handleEvents([{ type: 'attack', playerIdx: 0, kind: 'punch' }], charOf);
    expect(synth).toHaveBeenCalledWith('zhangfei.attack', 0.5);
    expect(play).not.toHaveBeenCalled();
  });

  it('uses the generic ZzFX sound when no character lookup is given', () => {
    const { play, synth, player } = setup();
    player.handleEvents([{ type: 'attack', playerIdx: 0, kind: 'punch' }]);
    expect(synth).not.toHaveBeenCalled();
    expect(play.mock.calls[0][0].slice(1)).toEqual(SOUNDS.whoosh.slice(1));
  });

  it('throttles a character shout to once per gap', () => {
    const { synth, player, clock } = setup();
    const special = { type: 'special', playerIdx: 1, kind: 'lob', name: 'x' };
    player.handleEvents([special], charOf);
    clock.t = SHOUT_GAP_MS - 1;
    player.handleEvents([special], charOf);
    expect(synth.mock.calls.filter((c) => c[0] === 'guanyu.shout')).toHaveLength(1);
    clock.t = SHOUT_GAP_MS;
    player.handleEvents([special], charOf);
    expect(synth.mock.calls.filter((c) => c[0] === 'guanyu.shout')).toHaveLength(2);
  });

  it('keeps the throttle per character', () => {
    const { synth, player } = setup();
    player.handleEvents([{ type: 'special', playerIdx: 1, kind: 'lob', name: 'x' }], charOf);
    player.handleEvents([{ type: 'special', playerIdx: 2, kind: 'beam', name: 'x' }], charOf);
    expect(synth.mock.calls.map((c) => c[0])).toEqual(['guanyu.shout', 'zhugeliang.shout']);
  });

  it('resolves rider events through the owner', () => {
    const { synth, player } = setup();
    player.handleEvents(
      [{ type: 'riderHit', riderId: 7, victimIdx: 1, x: 0, y: 0 }],
      charOf,
      (id) => (id === 7 ? 3 : undefined),
    );
    expect(synth).toHaveBeenCalledWith('machao.riderHit', 0.5);
  });

  it('keeps the generic sound for a rider with an unknown owner', () => {
    const { synth, play, player } = setup();
    player.handleEvents([{ type: 'riderHit', riderId: 9, victimIdx: 1, x: 0, y: 0 }], charOf, () => undefined);
    expect(synth).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });
});
