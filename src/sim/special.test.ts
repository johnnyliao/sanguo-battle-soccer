import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  CHARGE_FULL,
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  LOOSE_BALL_NO_TOUCH,
  RAMPAGE_TICKS,
  ROAR_RADIUS,
  ROAR_STAMINA,
  SPECIAL_COOLDOWN_TICKS,
  SPECIAL_STAMINA_COST,
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

function makeDef(id: string, role: Role, size: BodySize): CharacterDef {
  return {
    id,
    name: id,
    country: 'wei',
    role,
    size,
    stats: { power: 5, speed: 5, stamina: 5, technique: 5, defense: 5 },
    special: { name: 'test', kind: 'straight', mode: 'rampage' },
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

/** Team 0 player 0 owns the ball at x (centre height) facing `facingX`. */
function ownerState(x: number, facingX = 1, seed = 1): GameState {
  const state = createInitialState(makeSetup(seed), SIZE_PARAMS);
  parkAway(state, [0]);
  const p = state.players[0];
  p.x = x;
  p.y = FIELD_D / 2;
  p.facingX = facingX;
  p.facingY = 0;
  state.ball.x = p.x + facingX * (p.radius + DRIBBLE_OFFSET);
  state.ball.y = p.y;
  state.ball.ownerIdx = 0;
  state.ball.lastTouchIdx = 0;
  return state;
}

/** Team 0 player 0 is Zhang Fei: a roar special, owning the ball at x. */
function roarOwnerState(x: number, seed = 1): GameState {
  const state = ownerState(x, 1, seed);
  const p = state.players[0];
  p.specialMode = 'roar';
  p.specialName = '當陽怒吼';
  p.specialKind = 'pierce';
  return state;
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

/** Press L once (one tick). Returns the events of that tick. */
function pressL(state: GameState): SimEvent[] {
  return run(state, 1, inputFor(0, { l: true }));
}

/** Hold J for a full charge, then release. Returns every event seen. */
function fullChargeShot(state: GameState): SimEvent[] {
  const seen: SimEvent[] = [];
  step(state, inputFor(0, { j: true }));
  seen.push(...state.events);
  for (let t = 0; t < CHARGE_FULL; t++) {
    step(state, inputFor(0, { j: true }));
    seen.push(...state.events);
  }
  step(state, []);
  seen.push(...state.events);
  return seen;
}

/** Ball is loose and far from everyone, so only the roar can change who has it. */
function looseBallAway(state: GameState): void {
  state.ball.ownerIdx = -1;
  state.ball.lastTouchIdx = -1;
  state.ball.x = 1100;
  state.ball.y = 30;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.vz = 0;
}

/** Zhang Fei at x facing +x without the ball, with two opponents inside his roar circle (not in punch reach). */
function roarAwayState(x: number, seed = 1): GameState {
  const state = roarOwnerState(x, seed);
  looseBallAway(state);
  const p = state.players[0];
  state.players[5].x = p.x + 90;
  state.players[5].y = p.y;
  state.players[5].facingX = -1;
  state.players[6].x = p.x + 30;
  state.players[6].y = p.y + 70;
  return state;
}

describe('special button (L)', () => {
  it('with the ball, L starts a rampage at once: no charge, costs 20 stamina, starts the cooldown', () => {
    const state = ownerState(600);
    const p = state.players[0];
    const stamina0 = p.stamina;

    const events = pressL(state);

    expect(events).toContainEqual({ type: 'special', playerIdx: 0, kind: 'straight', name: 'test' });
    expect(events).toContainEqual({ type: 'rampageStart', playerIdx: 0 });
    expect(p.rampageTicks).toBe(RAMPAGE_TICKS);
    expect(p.action).toBe('normal');
    expect(p.chargeTicks).toBe(0);
    expect(p.stamina).toBeCloseTo(stamina0 - SPECIAL_STAMINA_COST, 0);
    expect(p.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(state.ball.ownerIdx).toBe(0);
    expect(state.ball.special).toBeNull();
  });

  it('without the ball, a rampage character pressing L does nothing', () => {
    const state = ownerState(600);
    state.ball.ownerIdx = -1;
    looseBallAway(state);
    const p = state.players[0];
    const stamina0 = p.stamina;

    const events = pressL(state);

    expect(events.some((e) => e.type === 'special' || e.type === 'rampageStart')).toBe(false);
    expect(p.rampageTicks).toBe(0);
    expect(p.specialCooldown).toBe(0);
    expect(p.stamina).toBeGreaterThanOrEqual(stamina0);
  });

  it('L while charging cancels the charge, starts the rampage and keeps the ball', () => {
    const state = ownerState(600);
    const p = state.players[0];
    for (let t = 0; t < 11; t++) step(state, inputFor(0, { j: true }));
    expect(p.action).toBe('charge');

    const events = pressL(state);

    expect(events).toContainEqual({ type: 'rampageStart', playerIdx: 0 });
    expect(p.chargeTicks).toBe(0);
    expect(p.action).toBe('normal');
    expect(state.ball.ownerIdx).toBe(0);
  });

  it('the cooldown blocks a second L until SPECIAL_COOLDOWN_TICKS have passed', () => {
    const state = ownerState(600);
    pressL(state);
    expect(state.players[0].specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);

    run(state, 200);
    const blocked = pressL(state);
    expect(blocked.some((e) => e.type === 'special' || e.type === 'rampageStart')).toBe(false);

    // Let the rampage end and the cooldown run out, keeping the ball out of contact.
    run(state, SPECIAL_COOLDOWN_TICKS);
    expect(state.players[0].specialCooldown).toBe(0);
    const events = pressL(state);
    expect(events).toContainEqual({ type: 'rampageStart', playerIdx: 0 });
  });

  it('the special is 12 seconds: 720 ticks of cooldown', () => {
    expect(SPECIAL_COOLDOWN_TICKS).toBe(12 * 60);
  });
});

describe('charge shot (J)', () => {
  it('a full charge released is a shot only, never a rampage', () => {
    const state = ownerState(600);
    const stamina0 = state.players[0].stamina;

    const events = fullChargeShot(state);

    expect(events.some((e) => e.type === 'special' || e.type === 'rampageStart')).toBe(false);
    expect(events).toContainEqual({ type: 'kick', playerIdx: 0, kind: 'shot', targetIdx: -1 });
    expect(state.players[0].rampageTicks).toBe(0);
    expect(state.players[0].specialCooldown).toBe(0);
    expect(state.players[0].stamina).toBeGreaterThanOrEqual(stamina0 - 1);
  });
});

describe('special events', () => {
  it('a rampage emits special once, and J during the rampage emits specialShot and no second special', () => {
    const state = ownerState(600);

    const activation = pressL(state);
    expect(activation.filter((e) => e.type === 'special')).toHaveLength(1);
    expect(activation.some((e) => e.type === 'specialShot')).toBe(false);

    const shot = run(state, 1, inputFor(0, { j: true }));
    expect(shot.filter((e) => e.type === 'special')).toHaveLength(0);
    expect(shot.filter((e) => e.type === 'specialShot')).toHaveLength(1);
  });
});

describe('roar with the ball', () => {
  it('L on Zhang Fei with the ball is a roar: keeps the ball, stuns and pushes opponents in the circle only', () => {
    const state = roarOwnerState(600);
    const p = state.players[0];
    const stamina0 = p.stamina;
    const near = state.players[5];
    const nearTop = state.players[6];
    const far = state.players[7];
    const mate = state.players[1];
    near.x = p.x + 80;
    near.y = p.y;
    nearTop.x = p.x + 30;
    nearTop.y = p.y + 60;
    far.x = p.x - 150;
    far.y = p.y;
    mate.x = p.x + 40;
    mate.y = p.y;

    const events = pressL(state);

    expect(events).toContainEqual({ type: 'special', playerIdx: 0, kind: 'pierce', name: '當陽怒吼' });
    expect(events).toContainEqual({ type: 'roar', playerIdx: 0, x: p.x + 30, y: p.y, radius: ROAR_RADIUS });
    expect(events.some((e) => e.type === 'rampageStart')).toBe(false);

    const victims = events.flatMap((e) => (e.type === 'hit' ? [e.victimIdx] : []));
    expect(victims.sort()).toEqual([5, 6]);
    expect(events.filter((e) => e.type === 'hit').every((e) => e.type === 'hit' && e.kind === 'special')).toBe(true);

    expect(near.action).toBe('hitstun');
    expect(near.vx).toBeGreaterThan(100);
    expect(nearTop.action).toBe('hitstun');
    expect(nearTop.vy).toBeGreaterThan(0);
    expect(near.stamina).toBeCloseTo(near.maxStamina - ROAR_STAMINA, 9);

    expect(far.action).toBe('normal');
    expect(far.stamina).toBe(far.maxStamina);
    expect(mate.action).toBe('normal');
    expect(mate.stamina).toBe(mate.maxStamina);

    expect(state.ball.ownerIdx).toBe(0);
    expect(p.action).toBe('normal');
    expect(p.rampageTicks).toBe(0);
    expect(p.stamina).toBeCloseTo(stamina0 - SPECIAL_STAMINA_COST, 0);
    expect(p.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
  });

  it('a roar knocks the ball loose from an opponent carrier in the circle', () => {
    const state = roarOwnerState(600);
    const p = state.players[0];
    const carrier = state.players[5];
    carrier.x = p.x + 80;
    carrier.y = p.y;
    carrier.facingX = 1;
    carrier.facingY = 0;
    state.ball.ownerIdx = 5;
    state.ball.lastTouchIdx = 5;
    state.ball.x = carrier.x + carrier.radius + DRIBBLE_OFFSET;
    state.ball.y = carrier.y;

    const events = pressL(state);

    expect(events).toContainEqual({ type: 'looseBall', playerIdx: 5 });
    expect(state.ball.ownerIdx).toBe(-1);
    expect(state.ball.lastTouchIdx).toBe(0);
    expect(state.ball.vx).toBeGreaterThan(0);
    expect(carrier.noTouchTicks).toBeGreaterThan(0);
    expect(carrier.noTouchTicks).toBeLessThanOrEqual(LOOSE_BALL_NO_TOUCH);
  });
});

describe('roar without the ball', () => {
  it('L without the ball roars at once, hits the two opponents in the circle, and starts the cooldown', () => {
    const state = roarAwayState(300);
    const p = state.players[0];
    const stamina0 = p.stamina;

    const events = pressL(state);

    expect(events).toContainEqual({ type: 'roar', playerIdx: 0, x: p.x + 30, y: p.y, radius: ROAR_RADIUS });
    expect(p.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(p.stamina).toBeCloseTo(stamina0 - SPECIAL_STAMINA_COST, 0);
    expect(state.players[5].action).toBe('hitstun');
    expect(state.players[6].action).toBe('hitstun');
  });

  it('an opponent carrier in the circle loses the ball to a roar without the ball', () => {
    const state = roarAwayState(300);
    const carrier = state.players[5];
    carrier.facingX = 1;
    carrier.facingY = 0;
    state.ball.ownerIdx = 5;
    state.ball.lastTouchIdx = 5;
    state.ball.x = carrier.x + carrier.radius + DRIBBLE_OFFSET;
    state.ball.y = carrier.y;

    const events = pressL(state);

    expect(events).toContainEqual({ type: 'looseBall', playerIdx: 5 });
    expect(state.ball.ownerIdx).toBe(-1);
    expect(state.ball.lastTouchIdx).toBe(0);
  });

  it('J alone without the ball does not roar', () => {
    const state = roarAwayState(300);
    const events = run(state, 90, inputFor(0, { j: true }));
    expect(events.some((e) => e.type === 'roar')).toBe(false);
  });
});

describe('roar cooldown', () => {
  it('after a roar, neither L with the ball nor L without it fires another roar until the cooldown ends', () => {
    const state = roarOwnerState(600);
    const first = pressL(state);
    expect(first.filter((e) => e.type === 'roar')).toHaveLength(1);

    run(state, 60);
    const second = pressL(state);
    expect(second.some((e) => e.type === 'roar' || e.type === 'special')).toBe(false);

    // Give the ball away and press L: still blocked while cooling down.
    looseBallAway(state);
    state.players[5].x = state.players[0].x + 90;
    state.players[5].y = state.players[0].y;
    const away = pressL(state);
    expect(away.some((e) => e.type === 'roar')).toBe(false);
  });
});

describe('determinism', () => {
  it('the same roar scenario gives the same hashState', () => {
    const play = (): GameState => {
      const state = roarAwayState(300, 7);
      run(state, 20, inputFor(0, { l: true }));
      return state;
    };
    expect(hashState(play())).toBe(hashState(play()));
  });
});
