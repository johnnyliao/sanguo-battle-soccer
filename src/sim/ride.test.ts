import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  DOWN_TICKS_EXHAUSTED,
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  GOAL_HALF_W,
  RIDE_DISTANCE,
  RIDE_HITSTUN_TICKS,
  RIDE_LANE_HALF,
  RIDE_TICKS,
  SPECIAL_COOLDOWN_TICKS,
  SPECIAL_STAMINA_COST,
  createInitialState,
  isInvincible,
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
    special: { name: 'test', kind: 'lob' },
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

/** Team 0 player 0 at (x, centre height) facing `facingX` with the ride special (no-ball). The ball lies loose and far away. */
function riderState(x: number, facingX = 1, seed = 1): GameState {
  const state = createInitialState(makeSetup(seed), SIZE_PARAMS);
  parkAway(state, [0]);
  const p = state.players[0];
  p.x = x;
  p.y = FIELD_D / 2;
  p.facingX = facingX;
  p.facingY = 0;
  p.specialMode = 'ride';
  p.specialNoBall = true;
  p.specialBumpPct = 0.2;
  state.ball.ownerIdx = -1;
  state.ball.lastTouchIdx = -1;
  state.ball.x = 1000;
  state.ball.y = 30;
  return state;
}

/** Gives the ball to player 0 at his feet. */
function giveBallToRider(state: GameState): void {
  const p = state.players[0];
  state.ball.x = p.x + p.facingX * (p.radius + DRIBBLE_OFFSET);
  state.ball.y = p.y;
  state.ball.ownerIdx = 0;
  state.ball.lastTouchIdx = 0;
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

/** Team 1 player idx 5 at `dx` ahead of the rider and `dy` to the side (default: 100 ahead, on the line). */
function placeVictim(state: GameState, dx: number, dy: number, idx = 5): void {
  const victim = state.players[idx];
  victim.x = state.players[0].x + dx;
  victim.y = state.players[0].y + dy;
}

describe('ride cast', () => {
  it('a no-ball rider casts without the ball: costs stamina, sets the cooldown, emits special and rideStart', () => {
    const state = riderState(300);
    const p = state.players[0];
    const stamina0 = p.stamina;

    const events = pressSpecial(state);

    expect(events).toContainEqual({ type: 'special', playerIdx: 0, kind: 'lob', name: 'test' });
    expect(events).toContainEqual({ type: 'rideStart', playerIdx: 0, dirX: 1, dirY: 0 });
    expect(p.action).toBe('ride');
    expect(p.stamina).toBeCloseTo(stamina0 - SPECIAL_STAMINA_COST, 9);
    expect(p.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(state.ball.ownerIdx).toBe(-1);
  });

  it('a rider with the ball casts too and keeps the ball', () => {
    const state = riderState(300);
    giveBallToRider(state);

    const events = pressSpecial(state);

    expect(events).toContainEqual(expect.objectContaining({ type: 'rideStart', playerIdx: 0 }));
    expect(state.players[0].action).toBe('ride');
    expect(state.ball.ownerIdx).toBe(0);
  });

  it('a rider without specialNoBall needs the ball to cast', () => {
    const state = riderState(300);
    state.players[0].specialNoBall = false;

    const events = pressSpecial(state);

    expect(events.some((e) => e.type === 'rideStart' || e.type === 'special')).toBe(false);
    expect(state.players[0].action).toBe('normal');
  });
});

describe('ride dash', () => {
  it('travels RIDE_DISTANCE px in RIDE_TICKS ticks along the facing, and ends with rideEnd once', () => {
    const state = riderState(300);
    pressSpecial(state);
    const p = state.players[0];

    const endedAt: number[] = [];
    let xAtEnd = 0;
    for (let t = 1; t <= RIDE_TICKS + 2; t++) {
      step(state, []);
      if (state.events.some((e) => e.type === 'rideEnd')) {
        endedAt.push(t);
        xAtEnd = p.x;
      }
    }

    expect(endedAt).toEqual([RIDE_TICKS]);
    expect(xAtEnd).toBeCloseTo(300 + RIDE_DISTANCE, 6);
    expect(p.y).toBeCloseTo(FIELD_D / 2, 6);
    expect(p.action).toBe('normal');
  });

  it('follows a diagonal facing, normalised before the dash', () => {
    const state = riderState(300);
    state.players[0].y = 20;
    state.players[0].facingX = 3;
    state.players[0].facingY = 4;

    const events = pressSpecial(state);
    run(state, RIDE_TICKS);

    expect(events).toContainEqual({ type: 'rideStart', playerIdx: 0, dirX: 0.6, dirY: 0.8 });
    expect(state.players[0].x).toBeCloseTo(300 + 0.6 * RIDE_DISTANCE, 6);
    expect(state.players[0].y).toBeCloseTo(20 + 0.8 * RIDE_DISTANCE, 6);
  });

  it('with no facing the dash goes toward the opponent goal', () => {
    const state = riderState(300);
    state.players[0].facingX = 0;
    state.players[0].facingY = 0;

    const events = pressSpecial(state);
    run(state, RIDE_TICKS);

    expect(events).toContainEqual(expect.objectContaining({ type: 'rideStart', dirX: 1, dirY: 0 }));
    expect(state.players[0].x).toBeCloseTo(300 + RIDE_DISTANCE, 6);
  });

  it('is invincible for the whole dash and not after it', () => {
    const state = riderState(300);
    pressSpecial(state);
    const p = state.players[0];
    expect(isInvincible(p)).toBe(true);

    for (let t = 0; t < RIDE_TICKS; t++) {
      step(state, []);
      if (p.action === 'ride') expect(isInvincible(p)).toBe(true);
    }

    expect(p.action).toBe('normal');
    expect(isInvincible(p)).toBe(false);
  });

  it('the ball stays at his feet during the dash', () => {
    const state = riderState(300);
    giveBallToRider(state);
    pressSpecial(state);

    run(state, 15);

    const p = state.players[0];
    expect(state.ball.ownerIdx).toBe(0);
    expect(state.ball.x).toBeCloseTo(p.x + p.facingX * (p.radius + DRIBBLE_OFFSET), 6);
    expect(state.ball.y).toBeCloseTo(p.y, 6);
  });

  it('J during the dash does nothing: no punch, shot or attack, and the dash goes on', () => {
    const state = riderState(300);
    giveBallToRider(state);
    pressSpecial(state);

    const events = run(state, 1, inputFor(0, { j: true }));

    expect(events.some((e) => e.type === 'specialShot' || e.type === 'attack' || e.type === 'rideEnd')).toBe(false);
    expect(state.ball.special).toBeUndefined();
    expect(state.players[0].action).toBe('ride');
  });

  it('leaving the play phase ends the dash and reports rideEnd', () => {
    const state = riderState(300);
    pressSpecial(state);
    state.match.phase = 'goal';

    const events = run(state, 1);

    expect(events).toContainEqual({ type: 'rideEnd', playerIdx: 0 });
    expect(state.players[0].action).toBe('normal');
  });
});

describe('ride into the goal', () => {
  it('a dash across the opponent goal line inside the mouth with the ball scores, credited to him', () => {
    const state = riderState(FIELD_W - 120);
    giveBallToRider(state);
    pressSpecial(state);

    const events = run(state, RIDE_TICKS);

    expect(events).toContainEqual({ type: 'goal', team: 0, scorerIdx: 0 });
    expect(state.match.score[0]).toBe(1);
    expect(state.match.score[1]).toBe(0);
  });

  it('a dash across the goal line beside the posts does not score', () => {
    const state = riderState(FIELD_W - 120);
    state.players[0].y = FIELD_D / 2 + GOAL_HALF_W + 30;
    giveBallToRider(state);
    pressSpecial(state);

    const events = run(state, RIDE_TICKS);

    expect(events.some((e) => e.type === 'goal')).toBe(false);
    expect(state.match.score).toEqual([0, 0]);
    expect(state.ball.ownerIdx).toBe(0);
  });
});

describe('ride lane hits', () => {
  it('an opponent 40 px off the line is hit', () => {
    const state = riderState(300);
    parkAway(state, [0, 5]);
    placeVictim(state, 100, 40);
    pressSpecial(state);

    const events = run(state, RIDE_TICKS);

    expect(events).toContainEqual(expect.objectContaining({ type: 'hit', attackerIdx: 0, victimIdx: 5, kind: 'special' }));
  });

  it('an opponent 60 px off the line is not hit', () => {
    const state = riderState(300);
    parkAway(state, [0, 5]);
    placeVictim(state, 100, RIDE_LANE_HALF + 15);
    pressSpecial(state);

    const events = run(state, RIDE_TICKS);

    expect(events.some((e) => e.type === 'hit')).toBe(false);
  });

  it('an opponent behind the start of the dash is not hit', () => {
    const state = riderState(300);
    parkAway(state, [0, 5]);
    placeVictim(state, -100, 0);
    pressSpecial(state);

    const events = run(state, RIDE_TICKS);

    expect(events.some((e) => e.type === 'hit')).toBe(false);
  });

  it('a hit costs 20% of the victim max stamina, stuns for RIDE_HITSTUN_TICKS and pushes him away from the line', () => {
    const state = riderState(300);
    parkAway(state, [0, 5]);
    placeVictim(state, 100, 40);
    const victim = state.players[5];
    pressSpecial(state);

    const events: SimEvent[] = [];
    for (let t = 0; t < RIDE_TICKS && !events.some((e) => e.type === 'hit'); t++) {
      step(state, []);
      events.push(...state.events);
    }

    const hit = events.find((e) => e.type === 'hit' && e.victimIdx === 5);
    if (hit?.type !== 'hit') throw new Error('no ride hit');
    expect(hit.damage).toBeCloseTo(0.2 * victim.maxStamina, 9);
    expect(victim.stamina).toBeCloseTo(0.8 * victim.maxStamina, 9);
    expect(victim.action).toBe('hitstun');
    // The victim updates after the rider in the same tick, so his timer may already have ticked once.
    expect(victim.actionTimer).toBeGreaterThanOrEqual(RIDE_HITSTUN_TICKS - 1);
    expect(victim.actionTimer).toBeLessThanOrEqual(RIDE_HITSTUN_TICKS);
    // Victim on the +y side of the line (ride direction +x): pushed toward +y (away) and forward (+x).
    expect(victim.vy).toBeGreaterThan(0);
    expect(victim.vx).toBeGreaterThan(0);
  });

  it('a victim on the other side of the line is pushed the other way', () => {
    const state = riderState(300);
    parkAway(state, [0, 5]);
    placeVictim(state, 100, -40);
    const victim = state.players[5];
    pressSpecial(state);

    run(state, RIDE_TICKS);

    expect(victim.vy).toBeLessThan(0);
    expect(victim.vx).toBeGreaterThan(0);
  });

  it('each victim is hit only once per dash, even while he stays in the lane', () => {
    const state = riderState(300);
    parkAway(state, [0, 5]);
    pressSpecial(state);

    const events: SimEvent[] = [];
    for (let t = 0; t < RIDE_TICKS; t++) {
      // Hold the victim at a fixed spot in the lane for the whole dash, so only the once-per-dash rule stops repeat hits.
      state.players[5].x = 400;
      state.players[5].y = FIELD_D / 2 + 40;
      step(state, []);
      events.push(...state.events);
    }

    expect(events.filter((e) => e.type === 'hit' && e.victimIdx === 5)).toHaveLength(1);
    expect(events.filter((e) => e.type === 'rideHit' && e.victimIdx === 5)).toHaveLength(1);
  });

  it('teammates are not hit', () => {
    const state = riderState(300);
    parkAway(state, [0, 1]);
    placeVictim(state, 100, 40, 1);
    pressSpecial(state);

    const events = run(state, RIDE_TICKS);

    expect(events.some((e) => e.type === 'hit')).toBe(false);
  });

  it('a holder hit by the ride drops the ball as a loose ball', () => {
    const state = riderState(300);
    parkAway(state, [0, 5]);
    placeVictim(state, 100, 40);
    state.ball.ownerIdx = 5;
    state.ball.lastTouchIdx = 5;
    pressSpecial(state);

    const events = run(state, RIDE_TICKS);

    expect(events).toContainEqual({ type: 'looseBall', playerIdx: 5 });
    expect(state.ball.ownerIdx).toBe(-1);
    expect(state.ball.lastTouchIdx).toBe(0);
  });

  it('a victim whose stamina empties is knocked down for DOWN_TICKS_EXHAUSTED', () => {
    const state = riderState(300);
    parkAway(state, [0, 5]);
    placeVictim(state, 100, 40);
    const victim = state.players[5];
    victim.stamina = 0.1 * victim.maxStamina;
    pressSpecial(state);

    const events: SimEvent[] = [];
    for (let t = 0; t < RIDE_TICKS && !events.some((e) => e.type === 'down'); t++) {
      step(state, []);
      events.push(...state.events);
    }

    expect(events).toContainEqual({ type: 'down', playerIdx: 5 });
    expect(victim.stamina).toBe(0);
    expect(victim.action).toBe('down');
    // Checked on the hit tick: the victim's timer may already have ticked once.
    expect(victim.actionTimer).toBeGreaterThanOrEqual(DOWN_TICKS_EXHAUSTED - 1);
    expect(victim.actionTimer).toBeLessThanOrEqual(DOWN_TICKS_EXHAUSTED);
  });
});
