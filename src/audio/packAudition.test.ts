import { describe, expect, it } from 'vitest';
import { groupPackSlots, parsePackManifest } from './packAudition';

const manifest = [
  {
    slot: 'kick_pass',
    label: '傳球',
    group: '通用',
    intent: '輕、短、悶的一下',
    candidates: [{ key: 'A', file: 'kick_pass_A.wav', source: 'x.wav', dur: 0.27, desc: '厚重、短', electronic: 1 }],
  },
  {
    slot: 'goal',
    label: '進球',
    group: '通用',
    intent: '大聲的轟一下',
    candidates: [{ key: 'A', file: 'goal_A.wav', source: 'y.wav', dur: 1.2, desc: '轟鳴', electronic: 2 }],
  },
  {
    slot: 'swing_heavy',
    label: '揮擊',
    group: '普攻',
    intent: '短而用力的揮空聲',
    candidates: [{ key: 'A', file: 'swing_heavy_A.wav', source: 'z.wav', dur: 0.5, desc: '刷一下', electronic: 0 }],
  },
];

describe('parsePackManifest', () => {
  it('returns the slots in file order', () => {
    const slots = parsePackManifest(manifest);
    expect(slots.map((s) => s.slot)).toEqual(['kick_pass', 'goal', 'swing_heavy']);
    expect(slots[0].intent).toBe('輕、短、悶的一下');
    expect(slots[0].candidates[0]).toEqual({
      key: 'A',
      file: 'kick_pass_A.wav',
      source: 'x.wav',
      dur: 0.27,
      desc: '厚重、短',
      electronic: 1,
    });
  });

  it('rejects a slot missing its intent', () => {
    const bad = [{ slot: 'a', label: 'l', group: 'g', candidates: [] }];
    expect(() => parsePackManifest(bad)).toThrow();
  });

  it('rejects a candidate without a description', () => {
    const bad = [
      { slot: 'a', label: 'l', group: 'g', intent: 'i', candidates: [{ key: 'A', file: 'a.wav', source: 's', dur: 1, electronic: 0 }] },
    ];
    expect(() => parsePackManifest(bad)).toThrow();
  });

  it('rejects a candidate with a non-numeric electronic score', () => {
    const bad = [
      { slot: 'a', label: 'l', group: 'g', intent: 'i', candidates: [{ key: 'A', file: 'a.wav', source: 's', dur: 1, desc: 'd', electronic: '1' }] },
    ];
    expect(() => parsePackManifest(bad)).toThrow();
  });

  it('rejects a non-array manifest', () => {
    expect(() => parsePackManifest({})).toThrow();
  });

  it('rejects a slot missing its label', () => {
    expect(() => parsePackManifest([{ slot: 'a', group: 'g', candidates: [] }])).toThrow();
  });

  it('rejects a candidate without a numeric duration', () => {
    const bad = [
      { slot: 'a', label: 'l', group: 'g', intent: 'i', candidates: [{ key: 'A', file: 'a.wav', source: 's', dur: '1', desc: 'd', electronic: 0 }] },
    ];
    expect(() => parsePackManifest(bad)).toThrow();
  });
});

describe('groupPackSlots', () => {
  it('groups by name in first-appearance order and keeps slot order inside a group', () => {
    const groups = groupPackSlots(parsePackManifest(manifest));
    expect(groups.map((g) => g.group)).toEqual(['通用', '普攻']);
    expect(groups[0].slots.map((s) => s.slot)).toEqual(['kick_pass', 'goal']);
    expect(groups[1].slots.map((s) => s.slot)).toEqual(['swing_heavy']);
  });
});
