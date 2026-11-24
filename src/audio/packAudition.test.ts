import { describe, expect, it } from 'vitest';
import { groupPackSlots, parsePackManifest } from './packAudition';

const manifest = [
  { slot: 'kick_pass', label: '傳球', group: '通用', candidates: [{ key: 'A', file: 'kick_pass_A.wav', source: 'x.wav', dur: 0.27 }] },
  { slot: 'goal', label: '進球', group: '通用', candidates: [{ key: 'A', file: 'goal_A.wav', source: 'y.wav', dur: 1.2 }] },
  { slot: 'swing_heavy', label: '揮擊', group: '普攻', candidates: [{ key: 'A', file: 'swing_heavy_A.wav', source: 'z.wav', dur: 0.5 }] },
];

describe('parsePackManifest', () => {
  it('returns the slots in file order', () => {
    const slots = parsePackManifest(manifest);
    expect(slots.map((s) => s.slot)).toEqual(['kick_pass', 'goal', 'swing_heavy']);
    expect(slots[0].candidates[0]).toEqual({ key: 'A', file: 'kick_pass_A.wav', source: 'x.wav', dur: 0.27 });
  });

  it('rejects a non-array manifest', () => {
    expect(() => parsePackManifest({})).toThrow();
  });

  it('rejects a slot missing its label', () => {
    expect(() => parsePackManifest([{ slot: 'a', group: 'g', candidates: [] }])).toThrow();
  });

  it('rejects a candidate without a numeric duration', () => {
    const bad = [{ slot: 'a', label: 'l', group: 'g', candidates: [{ key: 'A', file: 'a.wav', source: 's', dur: '1' }] }];
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
