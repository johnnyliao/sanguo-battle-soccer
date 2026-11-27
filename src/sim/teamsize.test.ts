import { describe, expect, it } from 'vitest';
import { computeAIInputs, createAIState } from '../ai';
import { SIZE_PARAMS, getTeam } from '../data/characters';
import type { CharacterDef, Country, Role } from '../data/types';
import { FIELD_D, FIELD_W } from './constants';
import {
  autoPkOrders,
  createInitialState,
  defaultFieldFor,
  EMPTY_INPUT,
  step,
  type FieldSize,
  type GameState,
  type MatchSetup,
} from './index';

/** Role of each slot for a team of each size (index = team size). */
const ROLES_BY_SIZE: Role[][] = [
  [],
  ['FW'],
  ['DF', 'FW'],
  ['GK', 'DF', 'FW'],
  ['GK', 'DF', 'MF', 'FW'],
  ['GK', 'DF', 'MF', 'MF', 'FW'],
];

const NO_HUMANS: boolean[] = [];
const MAX_TICKS = 100_000;
const MATCH_TIMEOUT_MS = 300_000;

/** The first `size` defs of a country's roster that fill the formation, in slot order. */
function rosterOf(country: Country, size: number): CharacterDef[] {
  const pool = getTeam(country);
  const out: CharacterDef[] = [];
  for (const role of ROLES_BY_SIZE[size]) {
    const i = pool.findIndex((d) => d.role === role);
    expect(i).toBeGreaterThanOrEqual(0);
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  return out;
}

interface Run {
  state: GameState;
  /** Shooter idx of every penalty kick, in order. */
  shooters: number[];
}

/** A full AI-vs-AI match (AI also submits the penalty orders, as the Roblox server does). */
function runMatch(seed: number, size: number, halfSeconds: number): Run {
  const setup: MatchSetup = {
    seed,
    teams: [rosterOf('shu', size), rosterOf('wei', size)],
    halfSeconds,
  };
  const state = createInitialState(setup, SIZE_PARAMS);
  const ai = createAIState(seed);
  const shooters: number[] = [];
  let ticks = 0;
  while (state.match.phase !== 'fulltime') {
    expect(ticks).toBeLessThan(MAX_TICKS);
    step(state, computeAIInputs(state, ai, NO_HUMANS));
    if (state.match.pk?.stage === 'order') autoPkOrders(state, -1);
    for (const e of state.events) {
      if (e.type === 'pkKick') shooters.push(e.shooterIdx);
    }
    ticks++;
  }
  return { state, shooters };
}

describe('team sizes 1..4 (full AI-vs-AI matches)', () => {
  for (const size of [1, 2, 3, 4]) {
    it(`plays full matches at ${size}v${size} with ${2 * size} players`, () => {
      for (const seed of [11, 2024]) {
        const { state } = runMatch(seed, size, 120);
        expect(state.teamSize).toBe(size);
        expect(state.players.length).toBe(2 * size);
        expect(state.match.phase).toBe('fulltime');
        expect(state.players.every((p, i) => p.idx === i && p.team === (i < size ? 0 : 1))).toBe(true);
        // One goalkeeper per team from size 3 up; no goalkeeper below that.
        const keepers = state.players.filter((p) => p.role === 'GK').length;
        expect(keepers).toBe(size >= 3 ? 2 : 0);
      }
    }, MATCH_TIMEOUT_MS);
  }

  it('places every player inside the field at kickoff', () => {
    for (const size of [1, 2, 3, 4, 5]) {
      const state = createInitialState({ seed: 7, teams: [rosterOf('shu', size), rosterOf('wu', size)] }, SIZE_PARAMS);
      for (const p of state.players) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(FIELD_W);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(FIELD_D);
      }
    }
  });

  it('rejects teams of unequal size or outside 1..5', () => {
    const shu = getTeam('shu');
    expect(() => createInitialState({ seed: 1, teams: [rosterOf('shu', 3), rosterOf('wei', 2)] }, SIZE_PARAMS)).toThrow();
    expect(() => createInitialState({ seed: 1, teams: [[], []] }, SIZE_PARAMS)).toThrow();
    expect(() => createInitialState({ seed: 1, teams: [[...shu, shu[0]], [...shu, shu[0]]] }, SIZE_PARAMS)).toThrow();
  });
});

describe.each([1, 2])('penalty shootout at %iv%i', (size) => {
  it('every player takes a kick in the first round and the shootout ends with a winner', () => {
    // Short halves make a level 2nd half (and so a shootout) likely; scan fixed seeds until one goes to penalties.
    let found: Run | undefined;
    for (let seed = 1; seed <= 300 && found === undefined; seed++) {
      const run = runMatch(seed, size, 4);
      if (run.state.match.pk !== undefined) found = run;
    }
    expect(found).toBeDefined();
    const run = found as Run;
    const pk = run.state.match.pk;
    expect(pk).toBeDefined();
    if (pk === undefined) return;
    expect(pk.stage).toBe('done');
    expect([0, 1]).toContain(pk.winner);
    expect(run.state.match.phase).toBe('fulltime');

    // Shooters of each team, in kick order. The first `size` kicks of a team must cover every player of that team.
    const perTeam: [number[], number[]] = [[], []];
    for (const idx of run.shooters) {
      const team: 0 | 1 = idx < size ? 0 : 1;
      perTeam[team].push(idx);
    }
    for (const team of [0, 1] as const) {
      expect(perTeam[team].length).toBeGreaterThan(0);
      if (perTeam[team].length >= size) {
        const firstRound = [...new Set(perTeam[team].slice(0, size))].sort((a, b) => a - b);
        const everyone = [];
        for (let i = 0; i < size; i++) everyone.push(team * size + i);
        expect(firstRound).toEqual(everyone);
      }
    }
  }, MATCH_TIMEOUT_MS);
});

/** Full AI-vs-AI match on `field`. Counts players outside the pitch after any tick, and goals. */
function runFieldMatch(seed: number, size: number, field: FieldSize): { goals: number; outside: number; state: GameState } {
  const setup: MatchSetup = {
    seed,
    teams: [rosterOf('shu', size), rosterOf('wei', size)],
    halfSeconds: 120,
    field,
  };
  const state = createInitialState(setup, SIZE_PARAMS);
  const ai = createAIState(seed);
  let goals = 0;
  let outside = 0;
  let ticks = 0;
  while (state.match.phase !== 'fulltime') {
    expect(ticks).toBeLessThan(MAX_TICKS);
    step(state, computeAIInputs(state, ai, NO_HUMANS));
    if (state.match.pk?.stage === 'order') autoPkOrders(state, -1);
    for (const e of state.events) {
      if (e.type === 'goal') goals++;
    }
    for (const p of state.players) {
      if (p.x < 0 || p.x > field.w || p.y < 0 || p.y > field.d) outside++;
    }
    ticks++;
  }
  return { goals, outside, state };
}

describe.each([1, 2])('small pitch at %iv%i (defaultFieldFor)', (size) => {
  it('keeps every player on the pitch every tick and scores in full matches', () => {
    const field = defaultFieldFor(size);
    let goals = 0;
    for (const seed of [11, 2024, 5, 99]) {
      const run = runFieldMatch(seed, size, field);
      expect(run.outside).toBe(0);
      expect(run.state.match.phase).toBe('fulltime');
      goals += run.goals;
    }
    expect(goals).toBeGreaterThan(0);
  }, MATCH_TIMEOUT_MS);
});

describe('goal mouth on a small pitch', () => {
  /** Kicks an unowned ball across the right goal line at height 0, `offset` px from the pitch centre line, and steps once. */
  function shootAtRightLine(offset: number): GameState {
    const field = defaultFieldFor(1);
    const state = createInitialState(
      { seed: 3, teams: [rosterOf('shu', 1), rosterOf('wei', 1)], startInPlay: true, field },
      SIZE_PARAMS,
    );
    const b = state.ball;
    b.x = field.w + 10;
    b.y = field.d / 2 + offset;
    b.z = 0;
    b.vx = 0;
    b.vy = 0;
    b.vz = 0;
    b.ownerIdx = -1;
    b.special = undefined;
    step(state, state.players.map(() => EMPTY_INPUT));
    return state;
  }

  it('scores for a ball across the goal line inside goalHalfW', () => {
    const field = defaultFieldFor(1);
    const state = shootAtRightLine(field.goalHalfW - 5);
    expect(state.match.score).toEqual([1, 0]);
    expect(state.events.some((e) => e.type === 'goal')).toBe(true);
  });

  it('does not score for a ball across the goal line outside goalHalfW', () => {
    const field = defaultFieldFor(1);
    const state = shootAtRightLine(field.goalHalfW + 5);
    expect(state.match.score).toEqual([0, 0]);
    expect(state.events.some((e) => e.type === 'goal')).toBe(false);
  });
});
