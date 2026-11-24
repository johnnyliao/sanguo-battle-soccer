import { describe, expect, it } from 'vitest';
import { sampleCues, SAMPLE_SLOTS } from './sampleSounds';
import type { SimEvent } from './sounds';

const cue = (slot: string, volume = 1) => [{ name: `sfx:${slot}`, volume }];

describe('sampleCues attack groups', () => {
  const groups: [string, string[]][] = [
    ['swing_heavy', ['zhangfei', 'guanyu', 'xuchu', 'zhangliao', 'sunce']],
    ['swing_blade', ['zhaoyun', 'machao', 'caocao', 'sunquan', 'zhouyu']],
    ['swing_fan', ['zhugeliang', 'simayi', 'zhenji', 'xiaoqiao', 'daqiao']],
  ];
  for (const [slot, chars] of groups) {
    for (const charId of chars) {
      it(`${charId} attacks use ${slot}`, () => {
        expect(sampleCues({ type: 'attack', playerIdx: 0, kind: 'punch' }, charId)).toEqual(cue(slot));
      });
    }
  }

  it('leaves an attack by an unknown character to the existing sound', () => {
    expect(sampleCues({ type: 'attack', playerIdx: 0, kind: 'punch' }, 'nobody')).toBeUndefined();
    expect(sampleCues({ type: 'attack', playerIdx: 0, kind: 'punch' }, undefined)).toBeUndefined();
  });
});

describe('sampleCues kicks, goals and downs', () => {
  it('maps shots and clears to kick_shot, other kicks to kick_pass', () => {
    expect(sampleCues({ type: 'kick', playerIdx: 0, kind: 'shot', targetIdx: 1 }, undefined)).toEqual(cue('kick_shot'));
    expect(sampleCues({ type: 'kick', playerIdx: 0, kind: 'clear', targetIdx: 1 }, undefined)).toEqual(cue('kick_shot'));
    expect(sampleCues({ type: 'kick', playerIdx: 0, kind: 'pass', targetIdx: 1 }, undefined)).toEqual(cue('kick_pass'));
    expect(sampleCues({ type: 'pkKick', shooterIdx: 0 }, undefined)).toEqual(cue('kick_shot'));
  });

  it('maps goals and scored penalties to goal, other penalty results to the existing sound', () => {
    expect(sampleCues({ type: 'goal', team: 0, scorerIdx: 1 }, undefined)).toEqual(cue('goal'));
    expect(sampleCues({ type: 'pkResult', team: 0, outcome: 'goal' }, undefined)).toEqual(cue('goal'));
    expect(sampleCues({ type: 'pkResult', team: 0, outcome: 'save' }, undefined)).toBeUndefined();
    expect(sampleCues({ type: 'pkResult', team: 0, outcome: 'miss' }, undefined)).toBeUndefined();
  });

  it('maps a down to down', () => {
    expect(sampleCues({ type: 'down', playerIdx: 2 }, 'zhangfei')).toEqual(cue('down'));
  });
});

describe('sampleCues hits and specials', () => {
  it('keeps tackle, special and punch hits on the existing sounds (no hit sample yet)', () => {
    expect(sampleCues({ type: 'hit', attackerIdx: 0, victimIdx: 1, kind: 'tackle', damage: 1 }, 'zhangfei')).toBeUndefined();
    expect(sampleCues({ type: 'hit', attackerIdx: 0, victimIdx: 1, kind: 'special', damage: 1 }, 'zhaoyun')).toBeUndefined();
    expect(sampleCues({ type: 'hit', attackerIdx: 0, victimIdx: 1, kind: 'punch', damage: 1 }, 'zhangfei')).toBeUndefined();
  });

  it('keeps rider and ride hits on the existing sounds', () => {
    expect(sampleCues({ type: 'rideHit', playerIdx: 1, victimIdx: 2, x: 0, y: 0 }, 'guanyu')).toBeUndefined();
    expect(sampleCues({ type: 'riderHit', riderId: 1, victimIdx: 2, x: 0, y: 0 }, 'machao')).toBeUndefined();
  });

  it('keeps the generic special silent for all 15 characters and undefined for others', () => {
    const chars = [
      'zhangfei', 'guanyu', 'zhugeliang', 'machao', 'zhaoyun',
      'xuchu', 'caocao', 'zhenji', 'simayi', 'zhangliao',
      'sunquan', 'daqiao', 'zhouyu', 'xiaoqiao', 'sunce',
    ];
    const special: SimEvent = { type: 'special', playerIdx: 0, kind: 'pierce', name: 'x' };
    for (const charId of chars) {
      expect(sampleCues(special, charId), charId).toEqual([]);
    }
    expect(sampleCues(special, 'nobody')).toBeUndefined();
  });

  it('leaves specialShot to the existing sound', () => {
    expect(sampleCues({ type: 'specialShot', playerIdx: 0, kind: 'straight' }, 'zhangfei')).toBeUndefined();
  });
});

describe('sampleCues dedicated character events', () => {
  const dedicated: [SimEvent, string, number?][] = [
    [{ type: 'roar', playerIdx: 0, x: 0, y: 0, radius: 1 }, 'zhangfei_roar'],
    [{ type: 'rideStart', playerIdx: 0, dirX: 1, dirY: 0 }, 'guanyu_ride'],
    [{ type: 'beamCharge', playerIdx: 0 }, 'zhugeliang_charge'],
    [{ type: 'beamStrike', playerIdx: 0, victimIdx: 1 }, 'zhugeliang_hit'],
    [{ type: 'summonStart', playerIdx: 0, x: 0, y: 0 }, 'machao_cavalry'],
    [{ type: 'lungeStart', playerIdx: 0, x: 0, y: 0, dirX: 1, dirY: 0 }, 'zhaoyun_lunge'],
    [{ type: 'tigerStart', playerIdx: 0 }, 'xuchu_guard'],
    [{ type: 'tigerSwallow', playerIdx: 0, x: 0, y: 0 }, 'xuchu_swallow'],
    [{ type: 'tigerSpit', playerIdx: 0 }, 'xuchu_spit'],
    [{ type: 'tigerRoar', playerIdx: 0, victimIdxs: [1] }, 'xuchu_guard'],
    [{ type: 'slashWave', playerIdx: 0, waveId: 1, x: 0, y: 0, dirX: 1, dirY: 0 }, 'caocao_wave', 0.6],
    [{ type: 'iceStart', playerIdx: 0, fieldId: 1, x: 0, y: 0, radius: 110 }, 'zhenji_ice'],
    [{ type: 'leapStart', playerIdx: 0 }, 'simayi_leap'],
    [{ type: 'leapLand', playerIdx: 0, x: 0, y: 0, victimIdxs: [] }, 'simayi_land'],
    [{ type: 'fear', playerIdx: 0, victimIdxs: [] }, 'zhangliao_fear'],
    [{ type: 'sailStart', playerIdx: 0 }, 'sunce_sail'],
    [{ type: 'sailCrash', playerIdx: 0, victimIdx: 1, x: 0, y: 0 }, 'sunce_crash'],
    [{ type: 'gustBlow', gustId: 1, x: 0, y: 0, victimIdxs: [1] }, 'xiaoqiao_gust'],
    [{ type: 'portalStart', playerIdx: 0, portalId: 1, x: 0, y: 0, radius: 140 }, 'daqiao_portal'],
    [{ type: 'portalSummon', playerIdx: 0, portalId: 1, summonedIdxs: [2] }, 'daqiao_summon'],
    [{ type: 'arrowshipStart', playerIdx: 0, shipId: 1, x: 0, y: 0, dir: 1, halfSpan: 60 }, 'sunquan_ship'],
    [{ type: 'arrowshipBlock', shipId: 1, arrows: 1, kind: 'ball', x: 0, y: 0 }, 'sunquan_block'],
    [
      { type: 'arrowshipVolley', shipId: 1, x: 0, y: 0, dir: 1, len: 300, halfW: 120, arrows: 2, victimIdxs: [1] },
      'sunquan_volley',
    ],
    [{ type: 'eastwindStart', playerIdx: 0, windId: 1, x: 0, y: 0, radius: 150, victimIdxs: [] }, 'zhouyu_wind'],
  ];
  for (const [e, slot, volume] of dedicated) {
    it(`${e.type} plays ${slot}`, () => {
      expect(sampleCues(e, undefined)).toEqual(cue(slot, volume ?? 1));
    });
  }

  it('keeps the ice pulse sample only with victims, silent for a known caster with none', () => {
    expect(sampleCues({ type: 'icePulse', fieldId: 1, victimIdxs: [3] }, 'zhenji')).toEqual(cue('zhenji_pulse'));
    expect(sampleCues({ type: 'icePulse', fieldId: 1, victimIdxs: [] }, 'zhenji')).toEqual([]);
    expect(sampleCues({ type: 'icePulse', fieldId: 1, victimIdxs: [3] }, undefined)).toBeUndefined();
  });

  it('makes the silent synth-only events silent for the 15 characters', () => {
    const silent: SimEvent[] = [
      { type: 'leapFly', playerIdx: 0 },
      { type: 'slashSwing', playerIdx: 0, dirX: 1, dirY: 0 },
      { type: 'slashHeal', playerIdx: 0, amount: 1 },
      { type: 'lungeHeal', playerIdx: 0, amount: 1 },
      { type: 'riderSpawn', riderId: 1, x: 0, y: 0 },
      { type: 'iceEnd', fieldId: 1 },
      { type: 'specialEnd' },
      { type: 'rampageStart', playerIdx: 0 },
      { type: 'beamCancel', playerIdx: 0 },
    ];
    for (const e of silent) {
      expect(sampleCues(e, 'zhangfei'), e.type).toEqual([]);
      expect(sampleCues(e, 'nobody'), e.type).toBeUndefined();
    }
  });

  it('leaves generic events to the existing sounds', () => {
    const generic: SimEvent[] = [
      { type: 'whistle', reason: 'kickoff' },
      { type: 'bounce', strength: 90 },
      { type: 'dive', playerIdx: 0 },
      { type: 'chargeFull', playerIdx: 0 },
      { type: 'callPass', playerIdx: 0 },
      { type: 'pickup', playerIdx: 0 },
    ];
    for (const e of generic) {
      expect(sampleCues(e, 'zhangfei'), e.type).toBeUndefined();
    }
  });
});

describe('SAMPLE_SLOTS', () => {
  it('lists every slot the mapping can name, once', () => {
    expect(new Set(SAMPLE_SLOTS).size).toBe(SAMPLE_SLOTS.length);
    expect(SAMPLE_SLOTS).toContain('kick_pass');
    expect(SAMPLE_SLOTS).toContain('swing_fan');
    expect(SAMPLE_SLOTS).toContain('zhouyu_wind');
    expect(SAMPLE_SLOTS).toContain('zhenji_pulse');
    expect(SAMPLE_SLOTS).not.toContain('hit_heavy');
    expect(SAMPLE_SLOTS).not.toContain('hit_punch');
  });
});
