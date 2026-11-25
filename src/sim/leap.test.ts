import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  DOWN_TICKS_EXHAUSTED,
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  LEAP_BACK_DISTANCE,
  LEAP_FLY_DISTANCE,
  LEAP_PEAK_Z,
  LEAP_STAMINA_RATIO,
  RAMPAGE_TICKS,
  SILENCE_TICKS,
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
/** Ticks from the cast press to the landing: 9 back-hop ticks then 30 flight ticks. */
const LEAP_TOTAL_TICKS = 39;

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
 * Team 0 player 0 is Simayi: the leap special, no-ball, at (x, y) facing +x. The ball lies loose far away unless
 * `holdBall`, which puts it at his feet. The other players are parked in a corner.
 */
function leaperState(opts: { x?: number; y?: number; holdBall?: boolean } = {}): GameState {
  const { x = 600, y = FIELD_D / 2, holdBall = false } = opts;
  const state = createInitialState(makeSetup(1), SIZE_PARAMS);
  parkAway(state, [0]);
  const p = state.players[0];
  p.x = x;
  p.y = y;
  p.facingX = 1;
  p.facingY = 0;
  p.specialMode = 'leap';
  p.specialKind = 'zigzag';
  p.specialName = '鷹視狼顧';
  p.specialNoBall = true;
  if (holdBall) {
    state.ball.ownerIdx = 0;
    state.ball.lastTouchIdx = 0;
    state.ball.x = p.x + p.radius + DRIBBLE_OFFSET;
    state.ball.y = p.y;
  } else {
    state.ball.ownerIdx = -1;
    state.ball.lastTouchIdx = -1;
    state.ball.x = 300;
    state.ball.y = 30;
  }
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.vz = 0;
  return state;
}

/** Press L once for player `idx`. Returns the events of that tick. */
function pressL(state: GameState, idx = 0): SimEvent[] {
  step(state, inputFor(idx, { l: true }));
  return [...state.events];
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

/** Casts the leap and returns the x, action and z of player 0 after each of its LEAP_TOTAL_TICKS ticks, plus all events (cast included). */
function runLeap(state: GameState): { x: number[]; action: string[]; z: number[]; events: SimEvent[] } {
  const p = state.players[0];
  const events: SimEvent[] = pressL(state);
  const x: number[] = [];
  const action: string[] = [];
  const z: number[] = [];
  for (let t = 0; t < LEAP_TOTAL_TICKS; t++) {
    step(state, []);
    x.push(p.x);
    action.push(p.action);
    z.push(p.z);
    events.push(...state.events);
  }
  return { x, action, z, events };
}

describe('leap cast', () => {
  it('L without the ball starts a leap: special and leapStart events, usual cost and cooldown', () => {
    const state = leaperState();
    const p = state.players[0];
    const stamina0 = p.stamina;

    const events = pressL(state);

    expect(events).toContainEqual({ type: 'special', playerIdx: 0, kind: 'zigzag', name: '鷹視狼顧' });
    expect(events).toContainEqual({ type: 'leapStart', playerIdx: 0 });
    expect(p.action).toBe('leap');
    expect(p.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(p.stamina).toBeCloseTo(stamina0 - SPECIAL_STAMINA_COST, 6);
  });

  it('the back-hop moves him LEAP_BACK_DISTANCE backwards, then the flight covers LEAP_FLY_DISTANCE forward', () => {
    const state = leaperState({ x: 600 });
    const { x, action, events } = runLeap(state);

    // The back-hop covers 9 ticks; the flight starts on tick 10.
    expect(x[8]).toBeCloseTo(600 - LEAP_BACK_DISTANCE, 6);
    expect(events.filter((e) => e.type === 'leapFly')).toHaveLength(1);
    // The flight ends on tick 39, where he lands at the end of the flight distance.
    expect(x[38]).toBeCloseTo(600 - LEAP_BACK_DISTANCE + LEAP_FLY_DISTANCE, 6);
    expect(action.slice(0, 38).every((a) => a === 'leap')).toBe(true);
    expect(action[38]).toBe('normal');
  });

  it('is invincible for every tick of the leap', () => {
    const state = leaperState();
    const p = state.players[0];
    pressL(state);

    for (let t = 0; t < LEAP_TOTAL_TICKS - 1; t++) {
      step(state, []);
      expect(p.action).toBe('leap');
      expect(isInvincible(p)).toBe(true);
    }
  });

  it('an opponent punching at him during the back-hop does not hit him', () => {
    const state = leaperState({ x: 600 });
    const p = state.players[0];
    // Opponent 5 stands just in front of him, facing him, and punches on every tick of the leap.
    const victim = state.players[5];
    victim.x = 610;
    victim.y = FIELD_D / 2;
    victim.facingX = -1;
    victim.facingY = 0;
    const seen: SimEvent[] = [];

    seen.push(...pressL(state));
    for (let t = 0; t < 12; t++) {
      step(state, inputFor(5, { j: t % 2 === 0 }));
      seen.push(...state.events);
    }

    expect(p.action).toBe('leap');
    expect(seen.some((e) => e.type === 'attack' && e.playerIdx === 5)).toBe(true);
    expect(seen.some((e) => e.type === 'hit' && e.victimIdx === 0)).toBe(false);
    expect(p.stamina).toBeGreaterThan(0);
  });

  it('the held ball stays at his feet for the whole leap', () => {
    const state = leaperState({ holdBall: true });
    const p = state.players[0];
    pressL(state);

    for (let t = 0; t < LEAP_TOTAL_TICKS; t++) {
      step(state, []);
      expect(state.ball.ownerIdx).toBe(0);
      expect(state.ball.x).toBeCloseTo(p.x + p.facingX * (p.radius + DRIBBLE_OFFSET), 6);
      expect(state.ball.y).toBeCloseTo(p.y, 6);
    }
    expect(state.ball.special).toBeUndefined();
  });

  it('z is 0 on the back-hop, peaks at LEAP_PEAK_Z mid-flight, and is 0 after landing', () => {
    const state = leaperState();
    const { z } = runLeap(state);

    // Back-hop ticks (1..9) stay on the ground.
    for (let t = 0; t < 9; t++) expect(z[t]).toBe(0);
    // Flight tick 15 of 30 is the middle of the arc.
    expect(z[9 + 15 - 1]).toBeCloseTo(LEAP_PEAK_Z, 6);
    expect(Math.max(...z)).toBeCloseTo(LEAP_PEAK_Z, 6);
    expect(z[LEAP_TOTAL_TICKS - 1]).toBe(0);
  });
});

describe('leap landing', () => {
  it('hits only opponents within LEAP_RADIUS of the landing point: 15% stamina, hitstun, silence; not teammates or invincible ones', () => {
    const state = leaperState();
    const near5 = state.players[5];
    const near6 = state.players[6];
    const far7 = state.players[7];
    const invincible8 = state.players[8];
    const teammate1 = state.players[1];
    // Landing point is about (890, 130).
    near5.x = 910;
    near5.y = 170;
    near6.x = 890;
    near6.y = 195;
    far7.x = 975;
    far7.y = 130;
    invincible8.x = 860;
    invincible8.y = 160;
    invincible8.rampageTicks = RAMPAGE_TICKS * 10;
    invincible8.specialNoBall = true;
    teammate1.x = 880;
    teammate1.y = 95;
    const stamina5 = near5.stamina;
    const stamina6 = near6.stamina;
    const stamina7 = far7.stamina;

    const { events } = runLeap(state);

    const landing = events.find((e) => e.type === 'leapLand');
    expect(landing).toEqual({ type: 'leapLand', playerIdx: 0, x: expect.any(Number), y: expect.any(Number), victimIdxs: [5, 6] });
    const hits = events.filter((e) => e.type === 'hit');
    expect(hits.map((e) => (e.type === 'hit' ? e.victimIdx : -1))).toEqual([5, 6]);
    for (const e of hits) {
      if (e.type !== 'hit') continue;
      expect(e.attackerIdx).toBe(0);
      expect(e.kind).toBe('special');
    }
    expect(near5.stamina).toBeCloseTo(stamina5 - LEAP_STAMINA_RATIO * near5.maxStamina, 6);
    expect(near6.stamina).toBeCloseTo(stamina6 - LEAP_STAMINA_RATIO * near6.maxStamina, 6);
    expect(near5.action).toBe('hitstun');
    expect(near6.action).toBe('hitstun');
    // The silence starts at SILENCE_TICKS; a later-indexed victim has already counted down once that same tick.
    for (const v of [near5, near6]) {
      expect(v.silenceTicks).toBeLessThanOrEqual(SILENCE_TICKS);
      expect(v.silenceTicks).toBeGreaterThanOrEqual(SILENCE_TICKS - 1);
    }
    expect(far7.stamina).toBe(stamina7);
    expect(far7.silenceTicks).toBe(0);
    expect(invincible8.silenceTicks).toBe(0);
    expect(teammate1.silenceTicks).toBe(0);
    expect(events.some((e) => e.type === 'down')).toBe(false);
  });

  it('a victim whose stamina empties goes down for DOWN_TICKS_EXHAUSTED and a down event is emitted', () => {
    const state = leaperState();
    const victim = state.players[5];
    victim.x = 910;
    victim.y = 170;
    victim.stamina = LEAP_STAMINA_RATIO * victim.maxStamina * 0.5;

    const { events } = runLeap(state);

    expect(victim.stamina).toBe(0);
    expect(victim.action).toBe('down');
    expect(events).toContainEqual({ type: 'down', playerIdx: 5 });
    expect(events).toContainEqual({
      type: 'hit',
      attackerIdx: 0,
      victimIdx: 5,
      kind: 'special',
      damage: LEAP_STAMINA_RATIO * victim.maxStamina,
    });
    expect(victim.actionTimer).toBeLessThanOrEqual(DOWN_TICKS_EXHAUSTED);
  });

  it('emits special, leapStart, leapFly and leapLand in that order', () => {
    const state = leaperState();
    const { events } = runLeap(state);
    const index = (type: SimEvent['type']): number => events.findIndex((e) => e.type === type);

    const start = index('leapStart');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(index('leapFly')).toBeGreaterThan(start);
    expect(index('leapLand')).toBeGreaterThan(index('leapFly'));
  });
});

describe('silence', () => {
  it('a silenced player cannot punch', () => {
    const state = leaperState();
    const p = state.players[0];
    p.silenceTicks = SILENCE_TICKS;

    const events = run(state, 1, inputFor(0, { j: true }));

    expect(events.some((e) => e.type === 'attack')).toBe(false);
    expect(p.action).toBe('normal');
  });

  it('a silenced player cannot tackle (dash and J)', () => {
    const state = leaperState();
    const p = state.players[0];
    p.silenceTicks = SILENCE_TICKS;

    const events = run(state, 1, inputFor(0, { j: true, dash: true, moveX: 1 }));

    expect(events.some((e) => e.type === 'attack')).toBe(false);
    expect(p.action).toBe('normal');
  });

  it('a silenced player cannot cast a special (L) and L is not buffered', () => {
    const state = leaperState();
    const p = state.players[0];
    p.silenceTicks = SILENCE_TICKS;

    const events = pressL(state);

    expect(events.some((e) => e.type === 'special' || e.type === 'leapStart')).toBe(false);
    expect(p.action).toBe('normal');
    expect(p.specialCooldown).toBe(0);
    expect(p.specialBuffer).toBe(0);
  });

  it('a silenced holder cannot shoot (holding J does not charge) or pass or call (K), but keeps the ball and moves', () => {
    const state = leaperState({ holdBall: true });
    const p = state.players[0];
    p.silenceTicks = SILENCE_TICKS;
    const seen: SimEvent[] = [];

    // Hold J for a full second: no charge, no shot on release.
    for (let t = 0; t < 60; t++) {
      step(state, inputFor(0, { j: true }));
      seen.push(...state.events);
    }
    expect(p.chargeTicks).toBe(0);
    expect(p.action).toBe('normal');
    step(state, inputFor(0, { j: false }));
    seen.push(...state.events);

    // Pass (K) and call-pass do nothing.
    step(state, inputFor(0, { k: true }));
    seen.push(...state.events);

    expect(seen.some((e) => e.type === 'kick' || e.type === 'chargeFull' || e.type === 'callPass')).toBe(false);
    expect(seen.some((e) => e.type === 'specialShot')).toBe(false);
    expect(state.ball.ownerIdx).toBe(0);
    expect(state.ball.special).toBeUndefined();
    expect(p.callPassTicks).toBe(0);

    // Movement works and he dribbles the ball along.
    const x0 = p.x;
    for (let t = 0; t < 30; t++) step(state, inputFor(0, { moveX: 1 }));
    expect(p.x).toBeGreaterThan(x0);
    expect(state.ball.ownerIdx).toBe(0);
    expect(state.ball.x).toBeCloseTo(p.x + p.radius + DRIBBLE_OFFSET, 6);
  });

  it('the silence ends after SILENCE_TICKS ticks and the player can punch again', () => {
    const state = leaperState();
    const p = state.players[0];
    p.silenceTicks = SILENCE_TICKS;

    run(state, SILENCE_TICKS);
    expect(p.silenceTicks).toBe(0);

    const events = run(state, 1, inputFor(0, { j: true }));
    expect(events).toContainEqual({ type: 'attack', playerIdx: 0, kind: 'punch' });
  });
});
