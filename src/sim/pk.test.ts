import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import { computeAIInputs, createAIState } from '../ai';
import {
  EMPTY_INPUT,
  PK_FLIGHT_TICKS,
  autoPkOrders,
  createInitialState,
  defaultPkOrder,
  hashState,
  pkMeterValue,
  step,
  submitPkOrder,
  type GameState,
  type InputFrame,
  type MatchSetup,
  type PkState,
  type SimEvent,
} from './index';

const SIZE_PARAMS: Record<BodySize, SizeParams> = {
  S: { radius: 7, mass: 0.8 },
  M: { radius: 9, mass: 1.0 },
  L: { radius: 12, mass: 1.4 },
};

const ROLES: Role[] = ['GK', 'DF', 'MF', 'MF', 'FW'];

function makeDef(id: string, role: Role, size: BodySize): CharacterDef {
  return {
    id,
    name: id,
    country: 'wei',
    role,
    size,
    stats: { power: 5, speed: 5, stamina: 5, technique: 5, defense: 5 },
    special: { name: 'test', kind: 'straight' },
  };
}

function makeTeam(prefix: string): CharacterDef[] {
  return ROLES.map((role, i) => makeDef(`${prefix}${i}`, role, 'M'));
}

function makeSetup(seed: number): MatchSetup {
  return { seed, teams: [makeTeam('a'), makeTeam('b')], startInPlay: true };
}

/** A fresh match that is one tick away from the end of the 2nd half, level at 0-0. */
function startShootout(seed: number): GameState {
  const state = createInitialState(makeSetup(seed), SIZE_PARAMS);
  state.match.half = 2;
  state.match.swapped = true;
  state.match.clockTicks = 1;
  step(state, []);
  if (state.match.phase !== 'pk') throw new Error('expected the shootout to start');
  return state;
}

function pkOf(state: GameState): PkState {
  const pk = state.match.pk;
  if (pk === undefined) throw new Error('no shootout state');
  return pk;
}

/** 10 input frames, one per player; unlisted players get EMPTY_INPUT. */
function frames(byIdx: Record<number, Partial<InputFrame>>): InputFrame[] {
  return Array.from({ length: 10 }, (_, i) => ({ ...EMPTY_INPUT, ...(byIdx[i] ?? {}) }));
}

/** Steps `ticks` times with the same inputs and returns all events seen. */
function run(state: GameState, ticks: number, inputs: InputFrame[] = []): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) {
    step(state, inputs);
    events.push(...state.events);
  }
  return events;
}

/**
 * Scripted kick: shooter presses J, holds it for `holdTicks` (meter = pkMeterValue(holdTicks)), releases
 * with the given aim; keeper holds its guess. Then runs the flight so the result is recorded.
 */
function scriptKick(
  state: GameState,
  opts: { aimY: -1 | 0 | 1; aimHigh?: boolean; holdTicks: number; keeperY: -1 | 0 | 1; keeperHigh?: boolean },
): SimEvent[] {
  const pk = pkOf(state);
  const shooter = pk.shooterIdx;
  const keeper = pk.keeperIdx;
  const aim = { moveY: opts.aimY, k: opts.aimHigh ?? false };
  const guess = { moveY: opts.keeperY, k: opts.keeperHigh ?? false };
  const events: SimEvent[] = [];
  events.push(...run(state, 1, frames({ [shooter]: { ...aim, j: true }, [keeper]: guess })));
  events.push(...run(state, opts.holdTicks, frames({ [shooter]: { ...aim, j: true }, [keeper]: guess })));
  events.push(...run(state, 1, frames({ [shooter]: { ...aim, j: false }, [keeper]: guess })));
  events.push(...run(state, PK_FLIGHT_TICKS));
  return events;
}

/**
 * Test shortcut: skips aim and flight and records a fixed outcome for the kicking team, so the
 * shootout's rules can be checked without rng. Runs one step so the result stage decides.
 */
function forceResult(state: GameState, outcome: 'goal' | 'miss'): SimEvent[] {
  const pk = pkOf(state);
  const team = pk.kickingTeam;
  pk.kicks[team].push(outcome);
  if (outcome === 'goal') pk.score[team]++;
  pk.stage = 'result';
  pk.stageTimer = 1;
  return run(state, 1);
}

function pkResultOf(events: SimEvent[]): 'goal' | 'save' | 'miss' | undefined {
  for (const e of events) if (e.type === 'pkResult') return e.outcome;
  return undefined;
}

describe('shootout start and orders', () => {
  it('a draw at full time starts the PK in the order stage', () => {
    const state = createInitialState(makeSetup(3), SIZE_PARAMS);
    state.match.half = 2;
    state.match.swapped = true;
    state.match.clockTicks = 1;
    const events = run(state, 1);
    expect(state.match.phase).toBe('pk');
    expect(events).toContainEqual({ type: 'pkStart' });
    expect(pkOf(state).stage).toBe('order');
  });

  it('autoPkOrders fills both AI orders and starts the first kick', () => {
    const state = startShootout(3);
    autoPkOrders(state, -1);
    const pk = pkOf(state);
    expect(pk.order[0]).toEqual(defaultPkOrder(state, 0));
    expect(pk.order[1]).toEqual(defaultPkOrder(state, 1));
    expect(pk.stage).toBe('aim');
    expect(pk.kicks).toEqual([[], []]);
    expect(pk.shooterIdx).toBe(pk.order[pk.firstTeam]?.[0]);
    expect(pk.keeperIdx).toBe(pk.firstTeam === 0 ? 5 : 0);
  });

  it('autoPkOrders leaves the human team order unset', () => {
    const state = startShootout(4);
    autoPkOrders(state, 0);
    const pk = pkOf(state);
    expect(pk.order[0]).toBeUndefined();
    expect(pk.order[1]).not.toBeUndefined();
    expect(pk.stage).toBe('order');
  });

  it('submitPkOrder rejects orders that are not a permutation of the team', () => {
    const state = startShootout(5);
    expect(() => submitPkOrder(state, 0, [0, 1, 2, 3])).toThrow();
    expect(() => submitPkOrder(state, 0, [0, 1, 2, 3, 3])).toThrow();
    expect(() => submitPkOrder(state, 0, [0, 1, 2, 3, 5])).toThrow();
    expect(() => submitPkOrder(state, 0, [0, 1, 2, 3, 4, 4])).toThrow();
    expect(pkOf(state).order[0]).toBeUndefined();
  });

  it('defaultPkOrder sorts by power + technique, highest first, ties to the lowest idx', () => {
    const state = startShootout(6);
    const ratings = [
      { power: 3, technique: 2 }, // idx 0: 5
      { power: 9, technique: 9 }, // idx 1: 18
      { power: 5, technique: 5 }, // idx 2: 10
      { power: 5, technique: 5 }, // idx 3: 10 (tie with 2, higher idx)
      { power: 9, technique: 2 }, // idx 4: 11
    ];
    ratings.forEach((s, i) => {
      state.players[i].stats = { ...state.players[i].stats, ...s };
    });
    expect(defaultPkOrder(state, 0)).toEqual([1, 4, 2, 3, 0]);
  });

  it('submitPkOrder with a valid order stores it', () => {
    const state = startShootout(7);
    submitPkOrder(state, 0, [4, 3, 2, 1, 0]);
    expect(pkOf(state).order[0]).toEqual([4, 3, 2, 1, 0]);
  });
});

describe('kicks', () => {
  it('a scripted kick at meter 0.75 with a wrong guess scores', () => {
    // Technique 10 keeps the miss roll at 6% for a side aim; seed chosen so that roll passes.
    const state = startShootout(11);
    autoPkOrders(state, -1);
    const pk = pkOf(state);
    state.players[pk.shooterIdx].stats.technique = 10;
    const events = scriptKick(state, { aimY: -1, holdTicks: 30, keeperY: 1 });
    expect(pk.power).toBeCloseTo(0.75, 5);
    expect(pk.aimCol).toBe(0);
    expect(pk.guessCol).toBe(2);
    expect(pkResultOf(events)).toBe('goal');
    expect(pk.kicks[0].length + pk.kicks[1].length).toBe(1);
    expect(events).toContainEqual({ type: 'kick', playerIdx: pk.shooterIdx, kind: 'shot', targetIdx: -1 });
  });

  it('the meter is a triangle wave of period 80', () => {
    expect(pkMeterValue(0)).toBe(0);
    expect(pkMeterValue(40)).toBe(1);
    expect(pkMeterValue(20)).toBeCloseTo(0.5, 9);
    expect(pkMeterValue(60)).toBeCloseTo(0.5, 9);
    expect(pkMeterValue(80)).toBe(0);
  });

  it('a right guess with weak power saves often (over 100 seeds, rate > 0.4)', () => {
    let saves = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const state = startShootout(seed);
      autoPkOrders(state, -1);
      // Centre aim, centre guess, meter 0.3 (12 ticks held).
      const events = scriptKick(state, { aimY: 0, holdTicks: 12, keeperY: 0 });
      if (pkResultOf(events) === 'save') saves++;
    }
    expect(saves / 100).toBeGreaterThan(0.4);
  });

  it('a wrong guess never saves (over 100 seeds)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const state = startShootout(seed);
      autoPkOrders(state, -1);
      const events = scriptKick(state, { aimY: 0, holdTicks: 12, keeperY: -1 });
      expect(pkResultOf(events)).not.toBe('save');
    }
  });

  it('the keeper dives toward its guess and the kick result is recorded', () => {
    const state = startShootout(21);
    autoPkOrders(state, -1);
    const pk = pkOf(state);
    const keeper = state.players[pk.keeperIdx];
    run(state, 1, frames({ [pk.shooterIdx]: { j: true }, [pk.keeperIdx]: { moveY: 1 } }));
    run(state, 1, frames({ [pk.shooterIdx]: { j: false, moveY: 1 }, [pk.keeperIdx]: { moveY: 1 } }));
    expect(keeper.action).toBe('dive');
    expect(pk.stage).toBe('flight');
    run(state, PK_FLIGHT_TICKS);
    expect(pk.stage).toBe('result');
    expect(pk.kicks[0].length + pk.kicks[1].length).toBe(1);
  });
});

describe('shootout rules', () => {
  it('early termination: 3 goals for team 0 against 3 misses for team 1 ends after 6 kicks', () => {
    const state = startShootout(31);
    autoPkOrders(state, -1);
    const pk = pkOf(state);
    for (let k = 0; k < 5; k++) {
      forceResult(state, pk.kickingTeam === 0 ? 'goal' : 'miss');
    }
    expect(state.match.phase).toBe('pk');
    expect(pk.stage).toBe('aim');
    const events = forceResult(state, pk.kickingTeam === 0 ? 'goal' : 'miss');
    expect(pk.kicks[0]).toEqual(['goal', 'goal', 'goal']);
    expect(pk.kicks[1]).toEqual(['miss', 'miss', 'miss']);
    expect(pk.stage).toBe('done');
    expect(pk.winner).toBe(0);
    expect(state.match.phase).toBe('fulltime');
    expect(events).toContainEqual({ type: 'pkEnd', winner: 0, score: [3, 0] });
    expect(events).toContainEqual({ type: 'matchEnd', score: [0, 0] });
  });

  it('sudden death: 3-3 after 5 kicks each goes on and ends in the round where one scores and the other misses', () => {
    const state = startShootout(41);
    autoPkOrders(state, -1);
    const pk = pkOf(state);
    const firstTeam = pk.firstTeam;
    // Kick-by-kick outcomes. Odd kicks belong to the first team, even kicks to the other.
    // First team: g m g m g | g   Other: g m g m g | m  -> 3-3 after 10, first team scores in round 6, other misses.
    const outcomes: ('goal' | 'miss')[] = ['goal', 'goal', 'miss', 'miss', 'goal', 'goal', 'miss', 'miss', 'goal', 'goal', 'goal', 'miss'];
    for (let i = 0; i < 10; i++) forceResult(state, outcomes[i]);
    expect(pk.kicks[0].length).toBe(5);
    expect(pk.kicks[1].length).toBe(5);
    expect(pk.score).toEqual([3, 3]);
    expect(state.match.phase).toBe('pk');
    expect(pk.stage).toBe('aim');

    forceResult(state, outcomes[10]);
    expect(state.match.phase).toBe('pk');
    expect(pk.score[firstTeam]).toBe(4);

    forceResult(state, outcomes[11]);
    expect(pk.stage).toBe('done');
    expect(pk.winner).toBe(firstTeam);
    expect(pk.kicks[0].length).toBe(6);
    expect(pk.kicks[1].length).toBe(6);
  });

  it('every player of a team kicks once in the first 5, in the chosen order', () => {
    const state = startShootout(51);
    submitPkOrder(state, 0, [4, 2, 0, 3, 1]);
    autoPkOrders(state, 0);
    const pk = pkOf(state);
    const shooters: { team: 0 | 1; idx: number }[] = [];
    for (let k = 0; k < 10; k++) {
      shooters.push({ team: pk.kickingTeam, idx: pk.shooterIdx });
      forceResult(state, 'miss');
    }
    const team0 = shooters.filter((s) => s.team === 0).map((s) => s.idx);
    const team1 = shooters.filter((s) => s.team === 1).map((s) => s.idx);
    expect(team0.slice(0, 5)).toEqual([4, 2, 0, 3, 1]);
    expect([...team1.slice(0, 5)].sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9]);
  });

  it('the first kick waits for both orders and then rejects further order changes', () => {
    const state = startShootout(61);
    submitPkOrder(state, 1, [5, 6, 7, 8, 9]);
    expect(pkOf(state).stage).toBe('order');
    submitPkOrder(state, 0, [0, 1, 2, 3, 4]);
    expect(pkOf(state).stage).toBe('aim');
    expect(() => submitPkOrder(state, 0, [4, 3, 2, 1, 0])).toThrow();
  });
});

/** Runs a full all-AI shootout. Returns the final state and the number of ticks used. */
function runAiShootout(seed: number, maxTicks = 20000): { state: GameState; ticks: number } {
  const state = startShootout(seed);
  autoPkOrders(state, -1);
  const ai = createAIState(seed + 1000);
  const mask = Array.from({ length: 10 }, () => false);
  let ticks = 0;
  while (state.match.phase === 'pk' && ticks < maxTicks) {
    step(state, computeAIInputs(state, ai, mask));
    ticks++;
  }
  return { state, ticks };
}

describe('AI shootout', () => {
  it('an all-AI shootout always ends with a winner in fulltime within 20000 ticks', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { state, ticks } = runAiShootout(seed);
      const pk = pkOf(state);
      expect(state.match.phase).toBe('fulltime');
      expect(pk.stage).toBe('done');
      expect(pk.winner === 0 || pk.winner === 1).toBe(true);
      expect(ticks).toBeLessThan(20000);
    }
  });

  it('the same seed gives the same final hashState', () => {
    const a = runAiShootout(9).state;
    const b = runAiShootout(9).state;
    expect(hashState(a)).toBe(hashState(b));
    const c = runAiShootout(10).state;
    expect(hashState(c)).not.toBe(hashState(a));
  });
});
