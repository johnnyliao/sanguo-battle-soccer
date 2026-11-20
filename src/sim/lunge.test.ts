import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  GOAL_HALF_W,
  LUNGE_DISTANCE,
  LUNGE_TICKS,
  PUNCH_TICKS,
  SPECIAL_COOLDOWN_TICKS,
  SPECIAL_STAMINA_COST,
  TACKLE_TICKS,
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

/** Team 0 player 0 owns the ball at x (centre height) facing `facingX`, with the lunge special. */
function lungerState(x: number, facingX = 1, seed = 1): GameState {
  const state = createInitialState(makeSetup(seed), SIZE_PARAMS);
  parkAway(state, [0]);
  const p = state.players[0];
  p.x = x;
  p.y = FIELD_D / 2;
  p.facingX = facingX;
  p.facingY = 0;
  p.specialMode = 'lunge';
  state.ball.x = p.x + facingX * (p.radius + DRIBBLE_OFFSET);
  state.ball.y = p.y;
  state.ball.ownerIdx = 0;
  state.ball.lastTouchIdx = 0;
  return state;
}

/** Press L (the special button). Returns the events of that tick. */
function pressSpecial(state: GameState, frame: Partial<InputFrame> = {}): SimEvent[] {
  return run(state, 1, inputFor(0, { l: true, ...frame }));
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

/** Team 1 player idx 5 standing `gap` px to the right of team 0 player 0. */
function placeOpponentAt(state: GameState, gap: number): void {
  const victim = state.players[5];
  victim.x = state.players[0].x + gap;
  victim.y = state.players[0].y;
}

describe('lunge start', () => {
  it('L with the ball starts a lunge: keeps the ball, costs stamina, sets the cooldown, emits special and lungeStart', () => {
    const state = lungerState(300);
    const p = state.players[0];
    const stamina0 = p.stamina;

    const events = pressSpecial(state);

    expect(events).toContainEqual({ type: 'special', playerIdx: 0, kind: 'straight', name: 'test' });
    expect(events).toContainEqual({ type: 'lungeStart', playerIdx: 0, x: 300, y: FIELD_D / 2, dirX: 1, dirY: 0 });
    expect(p.action).toBe('lunge');
    expect(p.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(p.stamina).toBeCloseTo(stamina0 - SPECIAL_STAMINA_COST, 6);
    expect(state.ball.ownerIdx).toBe(0);
    expect(state.ball.special).toBeNull();
  });

  it('a lunge covers about LUNGE_DISTANCE along facing, keeps the ball, and returns to normal', () => {
    const state = lungerState(300);
    pressSpecial(state);

    const events = run(state, LUNGE_TICKS + 1);

    const moved = state.players[0].x - 300;
    expect(Math.abs(moved - LUNGE_DISTANCE)).toBeLessThanOrEqual(LUNGE_DISTANCE * 0.1);
    expect(state.players[0].y).toBeCloseTo(FIELD_D / 2, 6);
    expect(events).toContainEqual(expect.objectContaining({ type: 'lungeEnd', playerIdx: 0 }));
    expect(state.players[0].action).toBe('normal');
    expect(state.ball.ownerIdx).toBe(0);
  });

  it('the held direction overrides facing for the lunge', () => {
    const state = lungerState(600, -1);

    const events = pressSpecial(state, { moveX: 1 });

    expect(events).toContainEqual({ type: 'lungeStart', playerIdx: 0, x: 600, y: FIELD_D / 2, dirX: 1, dirY: 0 });
    expect(state.players[0].facingX).toBe(1);
  });

  it('without the ball, L does nothing', () => {
    const state = lungerState(300);
    state.ball.ownerIdx = -1;

    const events = pressSpecial(state);

    expect(events.some((e) => e.type === 'special' || e.type === 'lungeStart')).toBe(false);
    expect(state.players[0].action).toBe('normal');
    expect(state.players[0].specialCooldown).toBe(0);
  });
});

describe('lunge bumps and protection', () => {
  it('an opponent in the path is knocked away, and the lunger keeps the ball', () => {
    const state = lungerState(300);
    parkAway(state, [0, 5]);
    placeOpponentAt(state, 60);
    const victim = state.players[5];
    pressSpecial(state);

    const events = run(state, LUNGE_TICKS);

    expect(events).toContainEqual(expect.objectContaining({ type: 'hit', attackerIdx: 0, victimIdx: 5, kind: 'special' }));
    expect(events).toContainEqual({ type: 'down', playerIdx: 5 });
    expect(victim.action).toBe('down');
    expect(victim.vx).toBeGreaterThan(0);
    expect(state.ball.ownerIdx).toBe(0);
  });

  it('an opponent punch does nothing to a lunging owner', () => {
    const state = lungerState(300);
    parkAway(state, [0, 5]);
    pressSpecial(state);
    placeOpponentAt(state, 18);
    const victim = state.players[5];
    victim.bumpCooldown = 10000; // isolate the attack from the lunge bump
    victim.facingX = -1;
    victim.facingY = 0;
    const owner = state.players[0];
    const stamina0 = owner.stamina;

    const events = run(state, PUNCH_TICKS, inputFor(5, { j: true }));

    expect(events).toContainEqual({ type: 'attack', playerIdx: 5, kind: 'punch' });
    expect(events.some((e) => e.type === 'hit' || e.type === 'looseBall')).toBe(false);
    expect(victim.hitDone).toBe(true);
    expect(state.ball.ownerIdx).toBe(0);
    expect(owner.action).not.toBe('hitstun');
    expect(owner.action).not.toBe('down');
    expect(owner.stamina).toBeGreaterThanOrEqual(stamina0);
  });

  it('an opponent tackle does nothing to a lunging owner', () => {
    const state = lungerState(300);
    parkAway(state, [0, 5]);
    pressSpecial(state);
    placeOpponentAt(state, 30);
    const victim = state.players[5];
    victim.bumpCooldown = 10000;
    victim.facingX = -1;
    victim.facingY = 0;

    const events = run(state, TACKLE_TICKS, inputFor(5, { j: true, dash: true, moveX: -1 }));

    expect(events).toContainEqual({ type: 'attack', playerIdx: 5, kind: 'tackle' });
    expect(events.some((e) => e.type === 'hit' || e.type === 'looseBall')).toBe(false);
    expect(state.ball.ownerIdx).toBe(0);
  });
});

describe('lunge field edge and phase', () => {
  it('the lunge stops early at the field edge and the player stays on the field', () => {
    const state = lungerState(FIELD_W - 60);
    state.players[0].y = FIELD_D / 2 + GOAL_HALF_W + 30; // beside the posts: no goal mouth
    state.ball.y = state.players[0].y;
    pressSpecial(state);

    const endedAt: number[] = [];
    for (let t = 1; t <= LUNGE_TICKS + 1; t++) {
      step(state, []);
      if (state.events.some((e) => e.type === 'lungeEnd')) endedAt.push(t);
    }

    expect(endedAt.length).toBe(1);
    expect(endedAt[0]).toBeLessThan(LUNGE_TICKS);
    expect(state.players[0].x).toBe(FIELD_W);
    expect(state.players[0].action).toBe('normal');
    expect(state.ball.ownerIdx).toBe(0);
  });

  it('leaving the play phase mid-lunge ends it cleanly', () => {
    const state = lungerState(300);
    pressSpecial(state);
    state.match.phase = 'goal';

    const events = run(state, 1);

    expect(events).toContainEqual({ type: 'lungeEnd', playerIdx: 0, x: 300, y: FIELD_D / 2 });
    expect(state.players[0].action).toBe('normal');
  });
});

describe('lunge into the goal', () => {
  it('a lunge across the opponent goal line inside the mouth scores for his team, credited to him', () => {
    const state = lungerState(FIELD_W - 120);
    pressSpecial(state);

    const events = run(state, 30);

    expect(events).toContainEqual({ type: 'goal', team: 0, scorerIdx: 0 });
    expect(state.match.score[0]).toBe(1);
    expect(state.match.score[1]).toBe(0);
    expect(state.match.lastGoal).toEqual(expect.objectContaining({ team: 0, scorerIdx: 0 }));
  });

  it('a lunge across the goal line beside the posts does not score and he keeps the ball at the edge', () => {
    const state = lungerState(FIELD_W - 120);
    state.players[0].y = FIELD_D / 2 + GOAL_HALF_W + 30;
    state.ball.y = state.players[0].y;
    pressSpecial(state);

    const events = run(state, LUNGE_TICKS + 1);

    expect(events.some((e) => e.type === 'goal')).toBe(false);
    expect(state.match.score).toEqual([0, 0]);
    expect(state.players[0].x).toBe(FIELD_W);
    expect(state.players[0].action).toBe('normal');
    expect(state.ball.ownerIdx).toBe(0);
  });

  it('a lunge toward his own goal never scores an own goal', () => {
    const state = lungerState(120, -1);
    pressSpecial(state);

    const events = run(state, 30);

    expect(events.some((e) => e.type === 'goal')).toBe(false);
    expect(state.match.score).toEqual([0, 0]);
    expect(state.players[0].x).toBe(0);
    expect(state.ball.ownerIdx).toBe(0);
  });
});
