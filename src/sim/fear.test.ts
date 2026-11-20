import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  BEAM_CAST_TICKS,
  DOWN_TICKS_EXHAUSTED,
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FEAR_RADIUS,
  FEAR_STAMINA_RATIO,
  FEAR_TICKS,
  FIELD_D,
  PUNCH_TICKS,
  RAMPAGE_TICKS,
  SPECIAL_COOLDOWN_TICKS,
  SPECIAL_STAMINA_COST,
  createInitialState,
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

/** Offsets from Zhang Liao of team 1 players 5-9, all inside FEAR_RADIUS. */
const NEAR_OFFSETS: [number, number][] = [
  [60, 0],
  [-60, 30],
  [0, -90],
  [120, 60],
  [-150, -40],
];

/**
 * Team 0 player 0 is Zhang Liao: the fear special, no-ball, at x facing +x. The ball lies loose and far away. Team 1
 * (idx 5-9) stands around him inside FEAR_RADIUS, so they are all feared.
 */
function fearerState(x = 600, seed = 1): GameState {
  const state = createInitialState(makeSetup(seed), SIZE_PARAMS);
  parkAway(state, [0]);
  const p = state.players[0];
  p.x = x;
  p.y = FIELD_D / 2;
  p.facingX = 1;
  p.facingY = 0;
  p.specialMode = 'fear';
  p.specialKind = 'straight';
  p.specialName = '遼來了';
  p.specialNoBall = true;
  OPPONENTS.forEach((i, n) => {
    state.players[i].x = p.x + NEAR_OFFSETS[n][0];
    state.players[i].y = p.y + NEAR_OFFSETS[n][1];
  });
  state.ball.ownerIdx = -1;
  state.ball.lastTouchIdx = -1;
  state.ball.x = 300;
  state.ball.y = 30;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.vz = 0;
  return state;
}

/** Press L once for player `idx`. Returns the events of that tick. */
function pressL(state: GameState, idx = 0): SimEvent[] {
  return run(state, 1, inputFor(idx, { l: true }));
}

/** Ticks `ticks` times with `frame` applied on the first tick only. Returns every event seen. */
function run(state: GameState, ticks: number, frame: InputFrame[] = []): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) {
    step(state, t === 0 ? frame : []);
    seen.push(...state.events);
  }
  return seen;
}

const OPPONENTS = [5, 6, 7, 8, 9];

describe('fear (遼來了)', () => {
  it('L without the ball is an instant cast: special and fear events, usual cost and cooldown, every opponent feared', () => {
    const state = fearerState();
    const caster = state.players[0];
    const stamina0 = caster.stamina;
    const victimStamina = OPPONENTS.map((i) => state.players[i].stamina);

    const events = pressL(state);

    expect(events).toContainEqual({ type: 'special', playerIdx: 0, kind: 'straight', name: '遼來了' });
    expect(events).toContainEqual({ type: 'fear', playerIdx: 0, victimIdxs: OPPONENTS });
    expect(caster.action).toBe('normal');
    expect(caster.stamina).toBeCloseTo(stamina0 - SPECIAL_STAMINA_COST, 0);
    expect(caster.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    OPPONENTS.forEach((i, n) => {
      const v = state.players[i];
      expect(v.action).toBe('fear');
      expect(v.stamina).toBeCloseTo(victimStamina[n] - FEAR_STAMINA_RATIO * v.maxStamina, 6);
    });
  });

  it('an opponent beyond FEAR_RADIUS is not feared and keeps his stamina, the ones inside are', () => {
    const state = fearerState(300);
    const far = state.players[9];
    far.x = state.players[0].x + FEAR_RADIUS + 50;
    far.y = state.players[0].y;
    const stamina0 = far.stamina;

    const events = pressL(state);

    expect(events).toContainEqual({ type: 'fear', playerIdx: 0, victimIdxs: [5, 6, 7, 8] });
    expect(far.action).toBe('normal');
    expect(far.stamina).toBe(stamina0);
  });

  it('a feared opponent stays in fear for exactly FEAR_TICKS ticks, then returns to normal', () => {
    const state = fearerState();
    pressL(state);
    const v = state.players[5];

    let steps = 1;
    while (v.action === 'fear') {
      step(state, []);
      steps++;
    }

    expect(steps).toBe(FEAR_TICKS);
    expect(v.action).toBe('normal');
  });

  it('a feared opponent cannot move, attack, pass, cast or call under input', () => {
    const state = fearerState();
    pressL(state);
    const v = state.players[5];
    const x0 = v.x;
    const y0 = v.y;
    const seen: SimEvent[] = [];

    for (let t = 0; t < 60; t++) {
      step(state, inputFor(5, { moveX: 1, moveY: 1, dash: true, j: true, k: true, l: true }));
      seen.push(...state.events);
    }

    expect(v.action).toBe('fear');
    expect(v.x).toBe(x0);
    expect(v.y).toBe(y0);
    expect(seen.some((e) => (e.type === 'attack' || e.type === 'callPass' || e.type === 'special' || e.type === 'kick') && e.playerIdx === 5)).toBe(false);
  });

  it('a feared holder drops the ball as a loose ball and cannot pick it up while feared', () => {
    const state = fearerState();
    state.ball.ownerIdx = 6;
    state.ball.lastTouchIdx = 6;

    const events = pressL(state);

    expect(events).toContainEqual({ type: 'looseBall', playerIdx: 6 });
    expect(state.ball.ownerIdx).toBe(-1);
    const seen: SimEvent[] = [];
    // Put the ball right at his feet, still and within reach, then let the fear run.
    state.ball.x = state.players[6].x;
    state.ball.y = state.players[6].y;
    state.ball.vx = 0;
    state.ball.vy = 0;
    for (let t = 0; t < FEAR_TICKS - 5; t++) {
      step(state, []);
      seen.push(...state.events);
      if (state.ball.ownerIdx === 6) break;
    }
    expect(state.ball.ownerIdx).not.toBe(6);
    expect(seen.some((e) => e.type === 'pickup' && e.playerIdx === 6)).toBe(false);
  });

  it('a feared opponent that was channelling a beam loses the cast and is then feared', () => {
    const state = fearerState();
    state.players[9].action = 'cast';
    state.players[9].actionTimer = BEAM_CAST_TICKS;

    const events = pressL(state);

    expect(events).toContainEqual({ type: 'beamCancel', playerIdx: 9 });
    expect(state.players[9].action).toBe('fear');
  });

  it('a rampaging opponent is not feared, and keeps his stamina and the ball', () => {
    const state = fearerState();
    const v = state.players[7];
    v.rampageTicks = RAMPAGE_TICKS;
    state.ball.ownerIdx = 7;
    state.ball.lastTouchIdx = 7;
    const stamina0 = v.stamina;

    const events = pressL(state);

    expect(events).toContainEqual({ type: 'fear', playerIdx: 0, victimIdxs: [5, 6, 8, 9] });
    expect(v.action).toBe('normal');
    expect(v.stamina).toBe(stamina0);
    expect(state.ball.ownerIdx).toBe(7);
  });

  it('an opponent that goes to zero stamina goes down for DOWN_TICKS_EXHAUSTED instead of fearing', () => {
    const state = fearerState();
    const v = state.players[8];
    v.stamina = FEAR_STAMINA_RATIO * v.maxStamina * 0.5;

    const events = pressL(state);

    expect(v.stamina).toBe(0);
    expect(v.action).toBe('down');
    expect(v.actionTimer).toBeLessThanOrEqual(DOWN_TICKS_EXHAUSTED);
    expect(events).toContainEqual({ type: 'down', playerIdx: 8 });
  });

  it('a downed opponent keeps his down state and only loses stamina and the ball', () => {
    const state = fearerState();
    const v = state.players[5];
    v.action = 'down';
    v.actionTimer = 100;
    const stamina0 = v.stamina;

    pressL(state);

    expect(v.action).toBe('down');
    expect(v.stamina).toBeCloseTo(stamina0 - FEAR_STAMINA_RATIO * v.maxStamina, 6);
  });

  it('a second L press during the cooldown does nothing', () => {
    const state = fearerState();
    pressL(state);
    for (const i of OPPONENTS) state.players[i].action = 'normal';

    const events = pressL(state);

    expect(events.some((e) => e.type === 'fear' || e.type === 'special')).toBe(false);
    expect(OPPONENTS.every((i) => state.players[i].action === 'normal')).toBe(true);
  });

  it('an attack on a feared player works: a punch knocks him out of fear', () => {
    const state = fearerState();
    pressL(state);
    const v = state.players[5];
    expect(v.action).toBe('fear');
    // Caster stands next to the feared player. The caster punches him.
    const caster = state.players[0];
    v.x = caster.x + 18;
    v.y = caster.y;
    v.bumpCooldown = 10000;
    v.facingX = -1;
    v.facingY = 0;

    const events = run(state, PUNCH_TICKS, inputFor(0, { j: true }));

    expect(events).toContainEqual(expect.objectContaining({ type: 'hit', attackerIdx: 0, victimIdx: 5, kind: 'punch' }));
    expect(['hitstun', 'down']).toContain(v.action);
  });
});
