import { describe, expect, it, vi } from 'vitest';
import { AudioPlayer, HEAL_GAP_MS, SHOUT_GAP_MS } from './AudioPlayer';
import { cueBus, SYNTH_RECIPES } from './characterSounds';
import { SOUNDS, soundsForEvent } from './sounds';

const CHARS = ['zhangfei', 'guanyu', 'zhugeliang', 'machao', 'zhaoyun', 'xuchu', 'zhenji'];
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

  it('keeps the generic whoosh for a Wu attacker', () => {
    expect(soundsForEvent({ type: 'attack', playerIdx: 0, kind: 'punch' }, 'sunce')).toEqual([
      { name: 'whoosh', volume: 1 },
    ]);
    expect(soundsForEvent({ type: 'attack', playerIdx: 0, kind: 'punch' })).toEqual([{ name: 'whoosh', volume: 1 }]);
  });

  it('plays the shout for a Shu special, not the generic special', () => {
    expect(soundsForEvent({ type: 'special', playerIdx: 1, kind: 'lob', name: 'x' }, 'guanyu')).toEqual([
      { name: 'guanyu.shout', volume: 1 },
    ]);
    expect(soundsForEvent({ type: 'special', playerIdx: 0, kind: 'pierce', name: 'x' }, 'sunce')).toEqual([
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

describe('Wei character sound mapping', () => {
  const WEI = ['xuchu', 'caocao', 'zhenji', 'simayi', 'zhangliao'] as const;
  const names = (charId: string, e: Parameters<typeof soundsForEvent>[0]) =>
    soundsForEvent(e, charId).map((c) => c.name);

  it('plays each Wei attack cue for its attacker', () => {
    for (const charId of WEI) {
      expect(names(charId, { type: 'attack', playerIdx: 0, kind: 'punch' }), charId).toEqual([`${charId}.attack`]);
    }
  });

  it('plays the shout for every Wei special activation', () => {
    for (const charId of WEI) {
      expect(names(charId, { type: 'special', playerIdx: 0, kind: 'pierce', name: 'x' }), charId).toEqual([
        `${charId}.shout`,
      ]);
    }
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
    expect(soundsForEvent({ type: 'icePulse', fieldId: 1, victimIdxs: [3] }, 'zhenji')).toEqual([
      { name: 'zhenji.icePulse', volume: 1 },
    ]);
    expect(soundsForEvent({ type: 'icePulse', fieldId: 1, victimIdxs: [] }, 'zhenji')).toEqual([]);
    expect(soundsForEvent({ type: 'iceEnd', fieldId: 1 }, 'zhenji')).toEqual([{ name: 'zhenji.iceEnd', volume: 1 }]);
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

  it('maps Zhang Liao fear to its drone (the shout comes from the special event)', () => {
    expect(names('zhangliao', { type: 'special', playerIdx: 0, kind: 'straight', name: 'x' })).toEqual([
      'zhangliao.shout',
    ]);
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
        for (const cue of soundsForEvent(ev, charId)) {
          mapped++;
          expect(SYNTH_RECIPES[cue.name], cue.name).toBeTypeOf('function');
        }
      }
    }
    expect(mapped).toBeGreaterThan(0);
  });

  it('gives every Wei character its shouts, with the bark as the default except Xu Chu', () => {
    for (const charId of WEI) {
      for (const alt of ['shoutA', 'shoutB', 'shoutC']) {
        expect(SYNTH_RECIPES[`${charId}.${alt}`], `${charId}.${alt}`).toBeTypeOf('function');
        expect(cueBus(`${charId}.${alt}`)).toBe('shout');
      }
      expect(SYNTH_RECIPES[`${charId}.shout`], charId).toBeTypeOf('function');
    }
    expect(SYNTH_RECIPES['caocao.shout']).toBe(SYNTH_RECIPES['caocao.shoutC']);
    expect(SYNTH_RECIPES['zhenji.shout']).toBe(SYNTH_RECIPES['zhenji.shoutC']);
    expect(SYNTH_RECIPES['simayi.shout']).toBe(SYNTH_RECIPES['simayi.shoutC']);
    expect(SYNTH_RECIPES['zhangliao.shout']).toBe(SYNTH_RECIPES['zhangliao.shoutC']);
    expect(SYNTH_RECIPES['xuchu.shout']).not.toBe(SYNTH_RECIPES['xuchu.shoutC']);
  });

  it('routes the slash and ice cues to the normal bus', () => {
    expect(cueBus('caocao.slashSwing')).toBe('sfx');
    expect(cueBus('zhenji.iceStart')).toBe('sfx');
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

  it('gives guanyu, machao and zhaoyun three alternative shouts on the shout bus', () => {
    for (const charId of ['guanyu', 'machao', 'zhaoyun']) {
      for (const alt of ['shoutA', 'shoutB', 'shoutC']) {
        expect(SYNTH_RECIPES[`${charId}.${alt}`], `${charId}.${alt}`).toBeTypeOf('function');
        expect(cueBus(`${charId}.${alt}`)).toBe('shout');
      }
    }
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

  it('throttles Cao Cao heal shimmers to one per 250 ms', () => {
    const { synth, player, clock } = setup();
    const heal = { type: 'slashHeal', playerIdx: 1, amount: 1 };
    const caoCao = (idx: number) => (idx === 1 ? 'caocao' : undefined);
    player.handleEvents([heal], caoCao);
    clock.t = HEAL_GAP_MS - 1;
    player.handleEvents([heal], caoCao);
    expect(synth.mock.calls.filter((c) => c[0] === 'caocao.slashHeal')).toHaveLength(1);
    clock.t = HEAL_GAP_MS;
    player.handleEvents([heal], caoCao);
    expect(synth.mock.calls.filter((c) => c[0] === 'caocao.slashHeal')).toHaveLength(2);
  });

  it('plays Cao Cao swings without a throttle', () => {
    const { synth, player } = setup();
    const swing = { type: 'slashSwing', playerIdx: 1, dirX: 1, dirY: 0 };
    player.handleEvents([swing], (idx) => (idx === 1 ? 'caocao' : undefined));
    player.handleEvents([swing], (idx) => (idx === 1 ? 'caocao' : undefined));
    expect(synth.mock.calls.filter((c) => c[0] === 'caocao.slashSwing')).toHaveLength(2);
  });

  it('plays ice pulses and ends through the field caster', () => {
    const { synth, player } = setup();
    const owner = (idx: number) => charOf(idx);
    player.handleEvents([{ type: 'iceStart', playerIdx: 6, fieldId: 4, x: 0, y: 0, radius: 110 }], owner);
    player.handleEvents([{ type: 'icePulse', fieldId: 4, victimIdxs: [1] }], owner);
    player.handleEvents([{ type: 'iceEnd', fieldId: 4 }], owner);
    expect(synth.mock.calls.map((c) => c[0])).toEqual(['zhenji.iceStart', 'zhenji.icePulse', 'zhenji.iceEnd']);
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
