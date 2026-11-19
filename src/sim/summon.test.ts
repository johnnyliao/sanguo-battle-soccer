import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  RIDER_SPAWN_RADIUS,
  SPECIAL_COOLDOWN_TICKS,
  SPECIAL_STAMINA_COST,
  SUMMON_RIDERS,
  SUMMON_TICKS,
  createInitialState,
  hashState,
  step,
  type GameState,
  type InputFrame,
  type MatchSetup,
  type SimEvent,
} from './index';

const SIZE_PARAMS: Record<BodySize, SizeParams> = {
  S: { radius: 7, mass: 0.8 },
  M: { radius: 9, mass: 1.0 },
  L: { radius: 12, mass: 1.4 },
};

const ROLES: Role[] = ['GK', 'DF', 'MF', 'MF', 'FW'];
const MACHAO_IDX = 3;

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

function makeSetup(seed: number): MatchSetup {
  const team = (prefix: string): CharacterDef[] => ROLES.map((role, i) => makeDef(`${prefix}${i}`, role, 'M'));
  return { seed, teams: [team('a'), team('b')], startInPlay: true };
}

function inputFor(idx: number, frame: Partial<InputFrame>): InputFrame[] {
  const arr: InputFrame[] = [];
  arr[idx] = { ...EMPTY_INPUT, ...frame };
  return arr;
}

/** Moves every player except `keep` into a corner far from the action. */
function parkAway(state: GameState, keep: number[] = []): void {
  state.players.forEach((p, i) => {
    if (keep.includes(i)) return;
    p.x = 100;
    p.y = 20 + i * 24;
  });
}

/**
 * Ma Chao (idx 3, team 0) on the ball at x, facing the goal he attacks in the first half (+x). Everyone else is parked far
 * away, so only the summon matters unless a test moves someone closer.
 */
function summonerState(x = 600, seed = 1): GameState {
  const state = createInitialState(makeSetup(seed), SIZE_PARAMS);
  parkAway(state, [MACHAO_IDX]);
  const p = state.players[MACHAO_IDX];
  p.x = x;
  p.y = FIELD_D / 2;
  p.facingX = 1;
  p.facingY = 0;
  p.specialMode = 'summon';
  p.specialKind = 'straight';
  p.specialName = '西涼鐵騎';
  state.ball.x = p.x + p.radius + DRIBBLE_OFFSET;
  state.ball.y = p.y;
  state.ball.ownerIdx = MACHAO_IDX;
  state.ball.lastTouchIdx = MACHAO_IDX;
  return state;
}

/** Steps `count` ticks with no input and returns every event emitted, in order. */
function runIdle(state: GameState, count: number): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let t = 0; t < count; t++) {
    step(state, []);
    seen.push(...state.events);
  }
  return seen;
}

describe('Ma Chao summon (西涼鐵騎)', () => {
  it('with the ball, L calls five riders, keeps the ball and starts the cooldown', () => {
    const state = summonerState();
    const p = state.players[MACHAO_IDX];
    const staminaBefore = p.stamina;

    step(state, inputFor(MACHAO_IDX, { l: true }));

    expect(state.riders).toHaveLength(SUMMON_RIDERS);
    const spawns = state.events.filter((e) => e.type === 'riderSpawn');
    expect(spawns).toHaveLength(SUMMON_RIDERS);
    for (const e of spawns) {
      if (e.type !== 'riderSpawn') continue;
      expect(Math.hypot(e.x - p.x, e.y - p.y)).toBeCloseTo(RIDER_SPAWN_RADIUS, 6);
    }
    expect(state.events).toContainEqual({ type: 'summonStart', playerIdx: MACHAO_IDX, x: p.x, y: p.y });
    expect(state.events).toContainEqual({
      type: 'special',
      playerIdx: MACHAO_IDX,
      kind: 'straight',
      name: '西涼鐵騎',
    });
    expect(p.action).toBe('normal');
    expect(state.ball.ownerIdx).toBe(MACHAO_IDX);
    expect(p.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(p.stamina).toBeCloseTo(staminaBefore - SPECIAL_STAMINA_COST, 0);
  });

  it('a second L press during the cooldown does not summon again', () => {
    const state = summonerState();
    step(state, inputFor(MACHAO_IDX, { l: true }));
    const firstIds = state.riders.map((r) => r.id);

    step(state, inputFor(MACHAO_IDX, {}));
    step(state, inputFor(MACHAO_IDX, { l: true }));

    expect(state.events.some((e) => e.type === 'summonStart')).toBe(false);
    expect(state.riders.map((r) => r.id)).toEqual(firstIds);
  });

  it('without the ball, L does nothing', () => {
    const state = summonerState();
    state.ball.ownerIdx = -1;
    state.ball.x = 900;
    state.ball.y = FIELD_D / 2;
    const p = state.players[MACHAO_IDX];

    step(state, inputFor(MACHAO_IDX, { l: true }));

    expect(state.riders).toHaveLength(0);
    expect(state.events.some((e) => e.type === 'summonStart' || e.type === 'special')).toBe(false);
    expect(p.specialCooldown).toBe(0);
  });

  it('riders charge an opponent 150 px away and knock him down within 3 s', () => {
    const state = summonerState(600);
    const victim = state.players[5];
    victim.x = 750;
    victim.y = FIELD_D / 2;

    step(state, inputFor(MACHAO_IDX, { l: true }));
    const seen = [...state.events];
    let knocked = false;
    for (let t = 1; t < SUMMON_TICKS && !knocked; t++) {
      step(state, []);
      seen.push(...state.events);
      knocked = state.events.some((e) => e.type === 'riderHit' && e.victimIdx === 5);
    }

    expect(knocked).toBe(true);
    expect(victim.action).toBe('down');
    expect(seen).toContainEqual({ type: 'hit', attackerIdx: MACHAO_IDX, victimIdx: 5, kind: 'special', damage: 20 });
    expect(seen).toContainEqual({ type: 'down', playerIdx: 5 });
    expect(victim.vx).toBeGreaterThan(0);
  });

  it('an opponent carrying the ball loses it to a rider and the knock-in is credited to Ma Chao', () => {
    const state = summonerState(600);
    const victim = state.players[5];
    victim.x = 750;
    victim.y = FIELD_D / 2;

    step(state, inputFor(MACHAO_IDX, { l: true }));
    state.ball.ownerIdx = 5;
    state.ball.lastTouchIdx = 5;

    const seen: SimEvent[] = [];
    for (let t = 1; t < SUMMON_TICKS; t++) {
      step(state, []);
      seen.push(...state.events);
      if (state.events.some((e) => e.type === 'riderHit' && e.victimIdx === 5)) break;
    }

    expect(seen).toContainEqual({ type: 'looseBall', playerIdx: 5 });
    expect(state.ball.ownerIdx).toBe(-1);
    expect(state.ball.lastTouchIdx).toBe(MACHAO_IDX);
  });

  it('each rider knocks a given opponent down at most once', () => {
    const state = summonerState(600);
    const victim = state.players[5];
    victim.x = 750;
    victim.y = FIELD_D / 2;

    step(state, inputFor(MACHAO_IDX, { l: true }));
    const seen = [...state.events, ...runIdle(state, SUMMON_TICKS - 1)];
    const hits = seen.filter((e) => e.type === 'riderHit' && e.victimIdx === 5);

    expect(hits.length).toBeGreaterThanOrEqual(1);
    const riderIds = hits.map((e) => (e.type === 'riderHit' ? e.riderId : -1));
    expect(new Set(riderIds).size).toBe(riderIds.length);
  });

  it('riders vanish after SUMMON_TICKS, each with a riderEnd event', () => {
    const state = summonerState(600);

    step(state, inputFor(MACHAO_IDX, { l: true }));
    const spawnIds = state.events
      .filter((e) => e.type === 'riderSpawn')
      .map((e) => (e.type === 'riderSpawn' ? e.riderId : -1))
      .sort((a, b) => a - b);

    // SUMMON_TICKS steps in total (the summon tick counts as the first): riders are still out until the last one.
    const before = runIdle(state, SUMMON_TICKS - 2);
    expect(state.riders).toHaveLength(SUMMON_RIDERS);
    expect(before.some((e) => e.type === 'riderEnd')).toBe(false);

    const last = runIdle(state, 1);
    expect(state.riders).toHaveLength(0);
    const endIds = last
      .filter((e) => e.type === 'riderEnd')
      .map((e) => (e.type === 'riderEnd' ? e.riderId : -1))
      .sort((a, b) => a - b);
    expect(endIds).toEqual(spawnIds);
  });

  it('riders are cleared with riderEnd when a goal is scored', () => {
    const state = summonerState(600);
    step(state, inputFor(MACHAO_IDX, { l: true }));
    expect(state.riders).toHaveLength(SUMMON_RIDERS);

    // Free ball past the far line: team 0 (Ma Chao's side) scores in the first half.
    state.ball.ownerIdx = -1;
    state.ball.x = FIELD_W + 30;
    state.ball.y = FIELD_D / 2;
    step(state, []);

    expect(state.match.phase).toBe('goal');
    expect(state.events.some((e) => e.type === 'goal')).toBe(true);
    expect(state.riders).toHaveLength(0);
    expect(state.events.filter((e) => e.type === 'riderEnd')).toHaveLength(SUMMON_RIDERS);
  });

  it('riders are cleared with riderEnd when half time starts', () => {
    const state = summonerState(600);
    step(state, inputFor(MACHAO_IDX, { l: true }));
    expect(state.riders).toHaveLength(SUMMON_RIDERS);

    state.match.clockTicks = 1;
    step(state, []);

    expect(state.match.phase).toBe('halftime');
    expect(state.riders).toHaveLength(0);
    expect(state.events.filter((e) => e.type === 'riderEnd')).toHaveLength(SUMMON_RIDERS);
  });

  it('two identical runs give the same state hash', () => {
    const run = (): string => {
      const state = summonerState(600, 9);
      state.players[5].x = 750;
      state.players[5].y = FIELD_D / 2;
      state.players[7].x = 800;
      state.players[7].y = 60;
      step(state, inputFor(MACHAO_IDX, { l: true }));
      runIdle(state, 240);
      return hashState(state);
    };
    expect(run()).toBe(run());
  });
});
