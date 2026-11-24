import { describe, expect, it, vi } from 'vitest';
import { AudioPlayer, SAMPLE_GAP_MS } from './AudioPlayer';
import { characterCues, SHU_CHARS, SYNTH_RECIPES, WEI_CHARS } from './characterSounds';
import { SOUNDS, soundsForEvent } from './sounds';

const CHARS = ['zhangfei', 'guanyu', 'zhugeliang', 'machao', 'zhaoyun', 'xuchu', 'zhenji'];
const charOf = (idx: number) => CHARS[idx];

function setup(clock = { t: 0 }) {
  const play = vi.fn<(params: number[]) => void>();
  const synth = vi.fn<(name: string, volume: number) => void>();
  const samples = { preload: vi.fn(), play: vi.fn<(slot: string, gain: number) => void>(), stop: vi.fn() };
  const player = new AudioPlayer(play, synth, () => clock.t, samples);
  return { play, synth, samples, player, clock };
}

describe('character sound mapping', () => {
  it('plays the sample swing for a Shu attacker', () => {
    expect(soundsForEvent({ type: 'attack', playerIdx: 0, kind: 'punch' }, 'zhangfei')).toEqual([
      { name: 'sfx:swing_heavy', volume: 1 },
    ]);
  });

  it('keeps the generic whoosh for an unknown attacker', () => {
    expect(soundsForEvent({ type: 'attack', playerIdx: 0, kind: 'punch' }, 'nobody')).toEqual([
      { name: 'whoosh', volume: 1 },
    ]);
    expect(soundsForEvent({ type: 'attack', playerIdx: 0, kind: 'punch' })).toEqual([{ name: 'whoosh', volume: 1 }]);
  });

  it('keeps a Shu special silent, and an unknown character special generic', () => {
    expect(soundsForEvent({ type: 'special', playerIdx: 1, kind: 'lob', name: 'x' }, 'guanyu')).toEqual([]);
    expect(soundsForEvent({ type: 'special', playerIdx: 0, kind: 'pierce', name: 'x' }, 'nobody')).toEqual([
      { name: 'special', volume: 1 },
    ]);
  });

  it('keeps Ma Chao special silent (the summon has its own sample)', () => {
    expect(soundsForEvent({ type: 'special', playerIdx: 3, kind: 'straight', name: 'x' }, 'machao')).toEqual([]);
  });

  it('plays the sample ride for a Guan Yu ride start', () => {
    expect(soundsForEvent({ type: 'rideStart', playerIdx: 1, dirX: 1, dirY: 0 }, 'guanyu')).toEqual([
      { name: 'sfx:guanyu_ride', volume: 1 },
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
        for (const cue of characterCues(ev, charId) ?? []) {
          if (!cue.name.startsWith(`${charId}.`)) continue;
          mapped++;
          expect(SYNTH_RECIPES[cue.name], cue.name).toBeTypeOf('function');
        }
      }
    }
    expect(mapped).toBeGreaterThan(0);
  });
});

describe('Wei character sound mapping', () => {
  const WEI = ['xuchu', 'caocao', 'zhenji', 'simayi', 'zhangliao'] as const;
  // The synth stages themselves (characterCues); soundsForEvent now prefers the sample cues first.
  const names = (charId: string, e: Parameters<typeof soundsForEvent>[0]) =>
    (characterCues(e, charId) ?? []).map((c) => c.name);

  it('plays each Wei attack cue for its attacker', () => {
    for (const charId of WEI) {
      expect(names(charId, { type: 'attack', playerIdx: 0, kind: 'punch' }), charId).toEqual([`${charId}.attack`]);
    }
  });

  it('plays no sound for a Wei special (its start event carries the sound)', () => {
    for (const charId of WEI) {
      expect(names(charId, { type: 'special', playerIdx: 0, kind: 'pierce', name: 'x' }), charId).toEqual([]);
    }
  });

  it('plays no shout for a special of any Shu or Wei character, and no shout recipe exists', () => {
    for (const charId of [...SHU_CHARS, ...WEI_CHARS]) {
      const cues = names(charId, { type: 'special', playerIdx: 0, kind: 'pierce', name: 'x' });
      expect(cues.filter((n) => /shout/i.test(n)), charId).toEqual([]);
    }
    expect(Object.keys(SYNTH_RECIPES).filter((k) => /shout/i.test(k))).toEqual([]);
  });

  it('maps each Xu Chu tiger event to its stage', () => {
    const playerIdx = 0;
    expect(names('xuchu', { type: 'tigerStart', playerIdx })).toEqual(['xuchu.tigerStart']);
    expect(names('xuchu', { type: 'tigerSwallow', playerIdx, x: 0, y: 0 })).toEqual(['xuchu.tigerSwallow']);
    expect(names('xuchu', { type: 'tigerSpit', playerIdx })).toEqual(['xuchu.tigerSpit']);
    expect(names('xuchu', { type: 'tigerRoar', playerIdx, victimIdxs: [1] })).toEqual(['xuchu.tigerRoar']);
  });

  it('maps each Cao Cao slash event, cutting only on a wave that struck', () => {
    const playerIdx = 0;
    expect(names('caocao', { type: 'slashStart', playerIdx })).toEqual(['caocao.slashStart']);
    expect(names('caocao', { type: 'slashSwing', playerIdx, dirX: 1, dirY: 0 })).toEqual(['caocao.slashSwing']);
    expect(names('caocao', { type: 'slashWave', playerIdx, waveId: 1, x: 0, y: 0, dirX: 1, dirY: 0 })).toEqual([
      'caocao.slashWave',
    ]);
    expect(names('caocao', { type: 'slashWaveEnd', waveId: 1, x: 0, y: 0, hitIdx: 2 })).toEqual(['caocao.slashWaveEnd']);
    expect(names('caocao', { type: 'slashWaveEnd', waveId: 1, x: 0, y: 0, hitIdx: -1 })).toEqual([]);
    expect(names('caocao', { type: 'slashHeal', playerIdx, amount: 1 })).toEqual(['caocao.slashHeal']);
  });

  it('maps each Zhen Ji ice event', () => {
    const playerIdx = 0;
    expect(names('zhenji', { type: 'iceStart', playerIdx, fieldId: 1, x: 0, y: 0, radius: 110 })).toEqual([
      'zhenji.iceStart',
    ]);
  });

  it('maps Zhen Ji ice pulses only with victims', () => {
    expect(characterCues({ type: 'icePulse', fieldId: 1, victimIdxs: [3] }, 'zhenji')).toEqual([
      { name: 'zhenji.icePulse', volume: 1 },
    ]);
    expect(soundsForEvent({ type: 'icePulse', fieldId: 1, victimIdxs: [] }, 'zhenji')).toEqual([]);
    expect(characterCues({ type: 'iceEnd', fieldId: 1 }, 'zhenji')).toEqual([{ name: 'zhenji.iceEnd', volume: 1 }]);
  });

  it('maps each Sima Yi leap event, adding the hush only when the landing hit victims', () => {
    const playerIdx = 0;
    expect(names('simayi', { type: 'leapStart', playerIdx })).toEqual(['simayi.leapStart']);
    expect(names('simayi', { type: 'leapFly', playerIdx })).toEqual(['simayi.leapFly']);
    expect(names('simayi', { type: 'leapLand', playerIdx, x: 0, y: 0, victimIdxs: [] })).toEqual(['simayi.leapLand']);
    expect(names('simayi', { type: 'leapLand', playerIdx, x: 0, y: 0, victimIdxs: [2] })).toEqual([
      'simayi.leapLand',
      'simayi.hush',
    ]);
  });

  it('maps Zhang Liao fear to its drone', () => {
    expect(names('zhangliao', { type: 'fear', playerIdx: 0, victimIdxs: [] })).toEqual(['zhangliao.fear']);
  });

  it('keeps Wu characters generic for every event', () => {
    const events: Parameters<typeof soundsForEvent>[0][] = [
      { type: 'attack', playerIdx: 0, kind: 'punch' },
      { type: 'special', playerIdx: 0, kind: 'straight', name: 'x' },
      { type: 'slashSwing', playerIdx: 0, dirX: 1, dirY: 0 },
    ];
    for (const ev of events) {
      expect(soundsForEvent(ev, 'sunce').every((c) => !c.name.startsWith('sunce.')), ev.type).toBe(true);
    }
  });

  it('gives every mapped Wei cue a synthesized recipe', () => {
    const events: Parameters<typeof soundsForEvent>[0][] = [
      { type: 'attack', playerIdx: 0, kind: 'punch' },
      { type: 'special', playerIdx: 0, kind: 'pierce', name: 'x' },
      { type: 'tigerStart', playerIdx: 0 },
      { type: 'tigerSwallow', playerIdx: 0, x: 0, y: 0 },
      { type: 'tigerSpit', playerIdx: 0 },
      { type: 'tigerRoar', playerIdx: 0, victimIdxs: [1] },
      { type: 'slashStart', playerIdx: 0 },
      { type: 'slashSwing', playerIdx: 0, dirX: 1, dirY: 0 },
      { type: 'slashWave', playerIdx: 0, waveId: 1, x: 0, y: 0, dirX: 1, dirY: 0 },
      { type: 'slashWaveEnd', waveId: 1, x: 0, y: 0, hitIdx: 1 },
      { type: 'slashHeal', playerIdx: 0, amount: 1 },
      { type: 'iceStart', playerIdx: 0, fieldId: 1, x: 0, y: 0, radius: 110 },
      { type: 'icePulse', fieldId: 1, victimIdxs: [1] },
      { type: 'iceEnd', fieldId: 1 },
      { type: 'leapStart', playerIdx: 0 },
      { type: 'leapFly', playerIdx: 0 },
      { type: 'leapLand', playerIdx: 0, x: 0, y: 0, victimIdxs: [1] },
      { type: 'fear', playerIdx: 0, victimIdxs: [] },
    ];
    let mapped = 0;
    for (const charId of WEI) {
      for (const ev of events) {
        for (const cue of characterCues(ev, charId) ?? []) {
          mapped++;
          expect(SYNTH_RECIPES[cue.name], cue.name).toBeTypeOf('function');
        }
      }
    }
    expect(mapped).toBeGreaterThan(0);
  });
});

describe('AudioPlayer character cues', () => {
  it('routes Shu attacks to the sample player and never to ZzFX or the synth', () => {
    const { play, synth, samples, player } = setup();
    player.handleEvents([{ type: 'attack', playerIdx: 0, kind: 'punch' }], charOf);
    expect(samples.play).toHaveBeenCalledWith('swing_heavy', 0.5);
    expect(synth).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it('uses the generic ZzFX sound when no character lookup is given', () => {
    const { play, synth, player } = setup();
    player.handleEvents([{ type: 'attack', playerIdx: 0, kind: 'punch' }]);
    expect(synth).not.toHaveBeenCalled();
    expect(play.mock.calls[0][0].slice(1)).toEqual(SOUNDS.whoosh.slice(1));
  });

  it('keeps Cao Cao heal shimmers silent (no sample, no synth)', () => {
    const { synth, samples, player } = setup();
    player.handleEvents([{ type: 'slashHeal', playerIdx: 1, amount: 1 }], (idx) => (idx === 1 ? 'caocao' : undefined));
    expect(synth).not.toHaveBeenCalled();
    expect(samples.play).not.toHaveBeenCalled();
  });

  it('plays Cao Cao attacks as blade swing samples, with the 50 ms gap between repeats', () => {
    const { samples, player, clock } = setup();
    const swing = { type: 'attack', playerIdx: 1, kind: 'punch' } as const;
    const caoCao = (idx: number) => (idx === 1 ? 'caocao' : undefined);
    player.handleEvents([swing], caoCao);
    clock.t = SAMPLE_GAP_MS - 1;
    player.handleEvents([swing], caoCao);
    expect(samples.play.mock.calls.map((c) => c[0])).toEqual(['swing_blade']);
    clock.t = SAMPLE_GAP_MS;
    player.handleEvents([swing], caoCao);
    expect(samples.play.mock.calls.map((c) => c[0])).toEqual(['swing_blade', 'swing_blade']);
  });

  it('plays ice fields and pulses as samples, and ends silently, through the field caster', () => {
    const { synth, samples, player } = setup();
    const owner = (idx: number) => charOf(idx);
    player.handleEvents([{ type: 'iceStart', playerIdx: 6, fieldId: 4, x: 0, y: 0, radius: 110 }], owner);
    player.handleEvents([{ type: 'icePulse', fieldId: 4, victimIdxs: [1] }], owner);
    player.handleEvents([{ type: 'iceEnd', fieldId: 4 }], owner);
    expect(samples.play.mock.calls.map((c) => c[0])).toEqual(['zhenji_ice', 'zhenji_pulse']);
    expect(synth).not.toHaveBeenCalled();
  });

  it('keeps a pulse of an unknown or ended field silent', () => {
    const { synth, player } = setup();
    const owner = (idx: number) => charOf(idx);
    player.handleEvents([{ type: 'iceStart', playerIdx: 6, fieldId: 5, x: 0, y: 0, radius: 110 }], owner);
    player.handleEvents([{ type: 'iceEnd', fieldId: 5 }], owner);
    player.handleEvents([{ type: 'icePulse', fieldId: 5, victimIdxs: [1] }], owner);
    expect(synth.mock.calls.filter((c) => c[0] === 'zhenji.icePulse')).toHaveLength(0);
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
