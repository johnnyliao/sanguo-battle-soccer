import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  CHARGE_FULL,
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  PLAYER_BASE_SPEED,
  PLAYER_SPEED_PER_STAT,
  PUNCH_TICKS,
  TACKLE_TICKS,
  RAMPAGE_BUMP_COOLDOWN,
  RAMPAGE_BUMP_STAMINA,
  RAMPAGE_SPEED_MULT,
  RAMPAGE_TICKS,
  SPECIAL_STAMINA_COST,
  createInitialState,
  resetForKickoff,
  startPk,
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

/** Press J, hold it for a full charge, release. Returns the events of every tick. */
function fullChargeRelease(state: GameState): SimEvent[] {
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

/** Ticks `ticks` times with `frame` applied on the first tick only. Returns every event seen. */
function run(state: GameState, ticks: number, frame: InputFrame[] = []): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) {
    step(state, t === 0 ? frame : []);
    seen.push(...state.events);
  }
  return seen;
}

/** Team 1 player idx 5 standing `gap` px to the right of team 0 player 0 (overlapping at gap 18). */
function placeOpponentAt(state: GameState, gap: number): void {
  const victim = state.players[5];
  victim.x = state.players[0].x + gap;
  victim.y = state.players[0].y;
}

describe('rampage start', () => {
  it('a full charge release starts a 180 tick rampage: keeps the ball, costs 20 stamina, emits special and rampageStart', () => {
    const state = ownerState(600);
    const p = state.players[0];
    const stamina0 = p.stamina;

    const events = fullChargeRelease(state);

    expect(events).toContainEqual({ type: 'special', playerIdx: 0, kind: 'straight', name: 'test' });
    expect(events).toContainEqual({ type: 'rampageStart', playerIdx: 0 });
    expect(p.rampageTicks).toBe(RAMPAGE_TICKS);
    expect(state.ball.ownerIdx).toBe(0);
    expect(state.ball.special).toBeNull();
    expect(p.action).toBe('normal');
    expect(p.stamina).toBeCloseTo(stamina0 - SPECIAL_STAMINA_COST, 9);
  });

  it('a full charge released while facing away from the goal also starts a rampage', () => {
    const state = ownerState(600, -1);

    fullChargeRelease(state);

    expect(state.players[0].rampageTicks).toBe(RAMPAGE_TICKS);
    expect(state.ball.ownerIdx).toBe(0);
  });
});

describe('rampage protection', () => {
  it('an opponent punch does nothing to a rampaging owner: no hit, no loose ball, owner stays normal', () => {
    const state = ownerState(300);
    parkAway(state, [0, 5]);
    fullChargeRelease(state);
    placeOpponentAt(state, 18);
    const victim = state.players[5];
    victim.bumpCooldown = 10000; // isolate the attack from the rampage bump
    victim.facingX = -1;
    victim.facingY = 0;
    const owner = state.players[0];
    const stamina0 = owner.stamina;

    const events = run(state, PUNCH_TICKS, inputFor(5, { j: true }));

    expect(events).toContainEqual({ type: 'attack', playerIdx: 5, kind: 'punch' });
    expect(events.some((e) => e.type === 'hit' || e.type === 'looseBall')).toBe(false);
    expect(victim.hitDone).toBe(true);
    expect(state.ball.ownerIdx).toBe(0);
    expect(owner.action).toBe('normal');
    expect(owner.stamina).toBeGreaterThanOrEqual(stamina0);
  });

  it('an opponent tackle does nothing to a rampaging owner', () => {
    const state = ownerState(300);
    parkAway(state, [0, 5]);
    fullChargeRelease(state);
    placeOpponentAt(state, 30);
    const victim = state.players[5];
    victim.bumpCooldown = 10000;
    victim.facingX = -1;
    victim.facingY = 0;

    const events = run(state, TACKLE_TICKS, inputFor(5, { j: true, dash: true, moveX: -1 }));

    expect(events).toContainEqual({ type: 'attack', playerIdx: 5, kind: 'tackle' });
    expect(events.some((e) => e.type === 'hit' || e.type === 'looseBall')).toBe(false);
    expect(state.players[0].action).toBe('normal');
    expect(state.ball.ownerIdx).toBe(0);
  });

  it('an opponent flykick does nothing to a rampaging owner', () => {
    const state = ownerState(300);
    parkAway(state, [0, 5]);
    fullChargeRelease(state);
    placeOpponentAt(state, 18);
    const victim = state.players[5];
    victim.bumpCooldown = 10000;
    victim.facingX = -1;
    victim.facingY = 0;

    run(state, 1, inputFor(5, { k: true }));
    const events = run(state, 30, inputFor(5, { j: true }));

    expect(events).toContainEqual({ type: 'attack', playerIdx: 5, kind: 'flykick' });
    expect(events.some((e) => e.type === 'hit' || e.type === 'looseBall')).toBe(false);
    expect(state.players[0].action).toBe('normal');
    expect(state.ball.ownerIdx).toBe(0);
  });
});

describe('rampage bumps', () => {
  it('an opponent touching a rampager is knocked away into hitstun, with a special hit event and stamina loss', () => {
    const state = ownerState(300);
    parkAway(state, [0, 5]);
    fullChargeRelease(state);
    placeOpponentAt(state, 18);
    const victim = state.players[5];
    const owner = state.players[0];
    const stamina0 = victim.stamina;

    const events = run(state, 1);

    expect(events).toContainEqual({
      type: 'hit',
      attackerIdx: 0,
      victimIdx: 5,
      kind: 'special',
      damage: RAMPAGE_BUMP_STAMINA,
    });
    expect(victim.action).toBe('hitstun');
    expect(victim.vx).toBeGreaterThan(0);
    expect(victim.stamina).toBeCloseTo(stamina0 - RAMPAGE_BUMP_STAMINA, 9);
    expect(owner.x).toBe(300);

    const x0 = victim.x;
    run(state, 10);
    expect(victim.x).toBeGreaterThan(x0);
  });

  it('a bumped opponent is not bumped again until the bump cooldown has passed', () => {
    const state = ownerState(300);
    parkAway(state, [0, 5]);
    fullChargeRelease(state);
    const victim = state.players[5];
    const owner = state.players[0];

    const hitSteps: number[] = [];
    for (let t = 1; t <= RAMPAGE_BUMP_COOLDOWN + 10; t++) {
      // Keep the victim in contact each tick so only the cooldown can stop a bump.
      victim.x = owner.x + 18;
      victim.y = owner.y;
      victim.action = 'normal';
      victim.vx = 0;
      victim.vy = 0;
      victim.vz = 0;
      step(state, []);
      if (state.events.some((e) => e.type === 'hit' && e.victimIdx === 5)) hitSteps.push(t);
    }

    expect(hitSteps.length).toBeGreaterThanOrEqual(2);
    expect(hitSteps[1] - hitSteps[0]).toBeGreaterThanOrEqual(RAMPAGE_BUMP_COOLDOWN);
  });

  it('teammates of a rampager are never bumped', () => {
    const state = ownerState(300);
    parkAway(state, [0, 1]);
    fullChargeRelease(state);
    const mate = state.players[1];
    mate.x = 318;
    mate.y = FIELD_D / 2;

    const events = run(state, 40);

    expect(events.some((e) => e.type === 'hit')).toBe(false);
    expect(mate.action).toBe('normal');
  });
});

describe('rampage movement', () => {
  it('a rampaging player moves at RAMPAGE_SPEED_MULT times normal speed and ignores dash', () => {
    const maxSpeed = PLAYER_BASE_SPEED + 5 * PLAYER_SPEED_PER_STAT;
    const state = ownerState(300);
    parkAway(state, [0]);
    fullChargeRelease(state);
    for (let t = 0; t < 60; t++) step(state, inputFor(0, { moveX: 1, dash: true }));

    expect(state.players[0].vx).toBeCloseTo(maxSpeed * RAMPAGE_SPEED_MULT, 1);
    expect(state.players[0].vx).toBeGreaterThan(maxSpeed);
  });
});

describe('rampage special ball', () => {
  it('J during the rampage fires the special ball toward the goal, even when facing away, and ends the rampage', () => {
    const state = ownerState(600, -1);
    fullChargeRelease(state);
    const stamina0 = state.players[0].stamina;

    const events = run(state, 1, inputFor(0, { j: true }));

    expect(events).toContainEqual({ type: 'rampageEnd', playerIdx: 0 });
    expect(events).toContainEqual({ type: 'specialShot', playerIdx: 0, kind: 'straight' });
    expect(events.some((e) => e.type === 'special')).toBe(false);
    expect(state.ball.special).not.toBeNull();
    expect(state.ball.special?.kind).toBe('straight');
    expect(state.ball.special?.dirX).toBeGreaterThan(0);
    expect(state.ball.ownerIdx).toBe(-1);
    expect(state.players[0].rampageTicks).toBe(0);
    expect(state.players[0].stamina).toBeLessThanOrEqual(stamina0);
  });

  it('J during the rampage with low stamina still fires, and stamina never goes negative', () => {
    const state = ownerState(600);
    fullChargeRelease(state);
    state.players[0].stamina = 5;

    run(state, 1, inputFor(0, { j: true }));

    expect(state.ball.special).not.toBeNull();
    expect(state.players[0].stamina).toBe(0);
  });

  it('a pass during the rampage ends it', () => {
    const state = ownerState(300);
    parkAway(state, [0, 2]);
    state.players[2].x = 400;
    state.players[2].y = FIELD_D / 2;
    fullChargeRelease(state);

    const events = run(state, 1, inputFor(0, { k: true }));

    expect(events).toContainEqual({ type: 'rampageEnd', playerIdx: 0 });
    expect(events).toContainEqual({ type: 'kick', playerIdx: 0, kind: 'pass', targetIdx: 2 });
    expect(state.players[0].rampageTicks).toBe(0);
  });
});

describe('rampage end', () => {
  it('the rampage ends after RAMPAGE_TICKS ticks with rampageEnd, and the player still owns the ball', () => {
    const state = ownerState(600);
    fullChargeRelease(state);

    const endedAt: number[] = [];
    for (let t = 1; t <= RAMPAGE_TICKS + 5; t++) {
      step(state, []);
      if (state.events.some((e) => e.type === 'rampageEnd')) endedAt.push(t);
    }

    expect(endedAt).toEqual([RAMPAGE_TICKS]);
    expect(state.players[0].rampageTicks).toBe(0);
    expect(state.ball.ownerIdx).toBe(0);
  });

  it('losing the ball ends the rampage at once', () => {
    const state = ownerState(600);
    fullChargeRelease(state);
    state.ball.ownerIdx = -1;

    const events = run(state, 1);

    expect(events).toContainEqual({ type: 'rampageEnd', playerIdx: 0 });
    expect(state.players[0].rampageTicks).toBe(0);
  });

  it('a kickoff reset clears the rampage and the bump cooldowns', () => {
    const state = ownerState(600);
    fullChargeRelease(state);
    state.players[5].bumpCooldown = 12;

    resetForKickoff(state);

    expect(state.players[0].rampageTicks).toBe(0);
    expect(state.players.every((p) => p.bumpCooldown === 0)).toBe(true);
    expect(state.events).toContainEqual({ type: 'rampageEnd', playerIdx: 0 });
  });

  it('starting the penalty shootout clears the rampage', () => {
    const state = ownerState(600);
    fullChargeRelease(state);

    startPk(state);

    expect(state.players[0].rampageTicks).toBe(0);
    expect(state.players.every((p) => p.bumpCooldown === 0)).toBe(true);
  });
});
