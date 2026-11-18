import { describe, expect, it } from 'vitest';
import { CHARACTERS, RAW_CHARACTERS, getTeam, normalizeTeam } from './characters';
import type { CharacterDef, Country } from './types';

const COUNTRIES: Country[] = ['shu', 'wei', 'wu'];
const ROLES = ['GK', 'DF', 'MF', 'MF', 'FW'];
const STAT_KEYS = ['power', 'speed', 'stamina', 'technique', 'defense'] as const;

function statTotal(defs: CharacterDef[]): number {
  return defs.reduce((s, d) => s + STAT_KEYS.reduce((t, k) => t + d.stats[k], 0), 0);
}

describe('character data', () => {
  it('has 15 characters with 5 per country in role order', () => {
    expect(RAW_CHARACTERS).toHaveLength(15);
    expect(CHARACTERS).toHaveLength(15);
    for (const c of COUNTRIES) {
      const team = getTeam(c);
      expect(team).toHaveLength(5);
      expect(team.map((d) => d.role)).toEqual(ROLES);
      expect(team.every((d) => d.country === c)).toBe(true);
    }
  });

  it('normalizes each country to a stat total of 150', () => {
    for (const c of COUNTRIES) {
      expect(statTotal(getTeam(c))).toBe(150);
    }
  });

  it('keeps every stat an integer in 1..10', () => {
    for (const d of CHARACTERS) {
      for (const k of STAT_KEYS) {
        const v = d.stats[k];
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(10);
      }
    }
  });

  it('has unique ids', () => {
    const ids = CHARACTERS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps CHARACTERS as the shu, wei, wu teams concatenated', () => {
    expect(CHARACTERS).toEqual([...getTeam('shu'), ...getTeam('wei'), ...getTeam('wu')]);
  });
});

describe('normalizeTeam', () => {
  it('is deterministic', () => {
    const team = getTeam('wei');
    expect(normalizeTeam(team)).toEqual(normalizeTeam(team));
  });

  it('does not mutate its input', () => {
    const raw = RAW_CHARACTERS.filter((d) => d.country === 'wu');
    const snapshot = JSON.parse(JSON.stringify(raw));
    const out = normalizeTeam(raw);
    expect(raw).toEqual(snapshot);
    expect(out).not.toBe(raw);
    expect(out[0]).not.toBe(raw[0]);
  });

  it('leaves a team already summing to 150 unchanged', () => {
    const base: CharacterDef[] = [
      { id: 'a', name: 'a', country: 'shu', role: 'GK', size: 'M', stats: { power: 6, speed: 6, stamina: 6, technique: 6, defense: 6 }, special: { name: 'x', kind: 'straight' } },
      { id: 'b', name: 'b', country: 'shu', role: 'DF', size: 'M', stats: { power: 3, speed: 10, stamina: 4, technique: 9, defense: 4 }, special: { name: 'x', kind: 'lob' } },
      { id: 'c', name: 'c', country: 'shu', role: 'MF', size: 'M', stats: { power: 6, speed: 6, stamina: 6, technique: 6, defense: 6 }, special: { name: 'x', kind: 'zigzag' } },
      { id: 'd', name: 'd', country: 'shu', role: 'MF', size: 'M', stats: { power: 5, speed: 8, stamina: 4, technique: 8, defense: 5 }, special: { name: 'x', kind: 'pierce' } },
      { id: 'e', name: 'e', country: 'shu', role: 'FW', size: 'M', stats: { power: 8, speed: 2, stamina: 9, technique: 4, defense: 7 }, special: { name: 'x', kind: 'straight' } },
    ];
    expect(statTotal(base)).toBe(150);
    expect(normalizeTeam(base)).toEqual(base);
  });
});
