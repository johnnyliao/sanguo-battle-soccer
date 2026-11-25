import { describe, expect, it } from 'vitest';
import { SIZE_PARAMS, getTeam } from '../data/characters';
import { canonical, createInitialState, stateDigest, type GameState } from './index';

function sample(): GameState {
  return createInitialState({ seed: 777, teams: [getTeam('shu'), getTeam('wei')] }, SIZE_PARAMS);
}

describe('stateDigest', () => {
  it('the same state gives the same digest', () => {
    const a = sample();
    const b = sample();
    expect(stateDigest(a)).toBe(stateDigest(b));
    expect(stateDigest(a)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('changing one number by 1e-12 changes the digest', () => {
    const a = sample();
    const b = structuredClone(a);
    b.players[0].x += 1e-12;
    expect(b.players[0].x).not.toBe(a.players[0].x);
    expect(stateDigest(b)).not.toBe(stateDigest(a));
  });

  it('an array with an undefined element digests like an object with only the other index key', () => {
    const holed: unknown[] = [undefined, 5];
    const obj = { 1: 5 };
    expect(canonical(holed)).toBe(canonical(obj));
  });
});
