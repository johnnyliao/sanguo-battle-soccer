import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  GOAL_HALF_W,
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

/** Press L (the special button) with the ball: starts a rampage at once. Returns the events of that tick. */
function pressSpecial(state: GameState): SimEvent[] {
  return run(state, 1, inputFor(0, { l: true }));
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
  it('L starts a 180 tick rampage at once: keeps the ball, costs 20 stamina, emits special and rampageStart', () => {
    const state = ownerState(600);
    const p = state.players[0];
    const stamina0 = p.stamina;

    const events = pressSpecial(state);

    expect(events).toContainEqual({ type: 'special', playerIdx: 0, kind: 'straight', name: 'test' });
    expect(events).toContainEqual({ type: 'rampageStart', playerIdx: 0 });
    expect(p.rampageTicks).toBe(RAMPAGE_TICKS);
    expect(state.ball.ownerIdx).toBe(0);
    expect(state.ball.special).toBeNull();
    expect(p.action).toBe('normal');
    expect(p.stamina).toBeCloseTo(stamina0 - SPECIAL_STAMINA_COST, 0);
  });

  it('a full charge released while facing away from the goal also starts a rampage', () => {
    const state = ownerState(600, -1);

    pressSpecial(state);

    expect(state.players[0].rampageTicks).toBe(RAMPAGE_TICKS);
    expect(state.ball.ownerIdx).toBe(0);
  });
});

describe('rampage protection', () => {
  it('an opponent punch does nothing to a rampaging owner: no hit, no loose ball, owner stays normal', () => {
    const state = ownerState(300);
    parkAway(state, [0, 5]);
    pressSpecial(state);
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
    pressSpecial(state);
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

  it('an opponent punch does nothing to a rampaging owner', () => {
    const state = ownerState(300);
    parkAway(state, [0, 5]);
    pressSpecial(state);
    placeOpponentAt(state, 18);
    const victim = state.players[5];
    victim.bumpCooldown = 10000;
    victim.facingX = -1;
    victim.facingY = 0;

    const events = run(state, 12, inputFor(5, { j: true }));

    expect(events).toContainEqual({ type: 'attack', playerIdx: 5, kind: 'punch' });
    expect(events.some((e) => e.type === 'hit' || e.type === 'looseBall')).toBe(false);
    expect(state.players[0].action).toBe('normal');
    expect(state.ball.ownerIdx).toBe(0);
  });
});

describe('rampage bumps', () => {
  it('an opponent touching a rampager is knocked down and away, with a special hit event and stamina loss', () => {
    const state = ownerState(300);
    parkAway(state, [0, 5]);
    pressSpecial(state);
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
    expect(events).toContainEqual({ type: 'down', playerIdx: 5 });
    expect(victim.action).toBe('down');
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
    pressSpecial(state);
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
    pressSpecial(state);
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
    pressSpecial(state);
    for (let t = 0; t < 60; t++) step(state, inputFor(0, { moveX: 1, dash: true }));

    expect(state.players[0].vx).toBeCloseTo(maxSpeed * RAMPAGE_SPEED_MULT, 1);
    expect(state.players[0].vx).toBeGreaterThan(maxSpeed);
  });
});

describe('rampage special ball', () => {
  it('J during the rampage fires the special ball toward the goal, even when facing away, and ends the rampage', () => {
    const state = ownerState(600, -1);
    pressSpecial(state);
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
    pressSpecial(state);
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
    pressSpecial(state);

    const events = run(state, 1, inputFor(0, { k: true }));

    expect(events).toContainEqual({ type: 'rampageEnd', playerIdx: 0 });
    expect(events).toContainEqual({ type: 'kick', playerIdx: 0, kind: 'pass', targetIdx: 2 });
    expect(state.players[0].rampageTicks).toBe(0);
  });
});

describe('rampage end', () => {
  it('the rampage ends after RAMPAGE_TICKS ticks with rampageEnd, and the player still owns the ball', () => {
    const state = ownerState(600);
    pressSpecial(state);

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
    pressSpecial(state);
    state.ball.ownerIdx = -1;

    const events = run(state, 1);

    expect(events).toContainEqual({ type: 'rampageEnd', playerIdx: 0 });
    expect(state.players[0].rampageTicks).toBe(0);
  });

  it('a kickoff reset clears the rampage and the bump cooldowns', () => {
    const state = ownerState(600);
    pressSpecial(state);
    state.players[5].bumpCooldown = 12;

    resetForKickoff(state);

    expect(state.players[0].rampageTicks).toBe(0);
    expect(state.players.every((p) => p.bumpCooldown === 0)).toBe(true);
    expect(state.events).toContainEqual({ type: 'rampageEnd', playerIdx: 0 });
  });

  it('starting the penalty shootout clears the rampage', () => {
    const state = ownerState(600);
    pressSpecial(state);

    startPk(state);

    expect(state.players[0].rampageTicks).toBe(0);
    expect(state.players.every((p) => p.bumpCooldown === 0)).toBe(true);
  });
});

/** Presses L, then holds `moveX` (and `moveY`) for `ticks` ticks while the rampage carries him. */
function rampageDrive(state: GameState, moveX: -1 | 0 | 1, ticks: number, moveY: -1 | 0 | 1 = 0): SimEvent[] {
  const seen = pressSpecial(state);
  for (let t = 0; t < ticks; t++) {
    step(state, inputFor(0, { moveX, moveY }));
    seen.push(...state.events);
  }
  return seen;
}

describe('rampage into the goal', () => {
  it('dribbling across the opponent goal line inside the mouth scores for his team, credited to him', () => {
    const state = ownerState(FIELD_W - 120);

    const events = rampageDrive(state, 1, 60);

    expect(events).toContainEqual({ type: 'goal', team: 0, scorerIdx: 0 });
    expect(state.match.score).toEqual([1, 0]);
    expect(state.match.lastGoal).toEqual(expect.objectContaining({ team: 0, scorerIdx: 0 }));
  });

  it('reaching the goal line beside the posts does not score', () => {
    const state = ownerState(FIELD_W - 120);
    state.players[0].y = FIELD_D / 2 + GOAL_HALF_W + 30;
    state.ball.y = state.players[0].y;

    const events = rampageDrive(state, 1, 60);

    expect(events.some((e) => e.type === 'goal')).toBe(false);
    expect(state.match.score).toEqual([0, 0]);
    expect(state.players[0].x).toBe(FIELD_W);
  });

  it('dribbling toward his own goal never scores an own goal', () => {
    const state = ownerState(120, -1);

    const events = rampageDrive(state, -1, 60);

    expect(events.some((e) => e.type === 'goal')).toBe(false);
    expect(state.match.score).toEqual([0, 0]);
    expect(state.players[0].x).toBe(0);
  });
});

/** Team 0 player 0 is a no-ball rampager (a shu special) at x facing `facingX`. The ball lies loose and far away. */
function noBallState(x: number, facingX = 1, bumpPct: number | null = null, seed = 1): GameState {
  const state = ownerState(x, facingX, seed);
  const p = state.players[0];
  p.specialNoBall = true;
  p.specialBumpPct = bumpPct;
  state.ball.ownerIdx = -1;
  state.ball.lastTouchIdx = -1;
  state.ball.x = 300;
  state.ball.y = 30;
  return state;
}

describe('no-ball rampage (shu specials)', () => {
  it('a no-ball rampager starts the rampage without the ball and it lasts the full RAMPAGE_TICKS', () => {
    const state = noBallState(600);

    const events = pressSpecial(state);

    expect(events).toContainEqual({ type: 'rampageStart', playerIdx: 0 });
    expect(state.players[0].rampageTicks).toBe(RAMPAGE_TICKS);
    expect(state.ball.ownerIdx).toBe(-1);

    const endedAt: number[] = [];
    for (let t = 1; t <= RAMPAGE_TICKS + 5; t++) {
      step(state, []);
      if (state.events.some((e) => e.type === 'rampageEnd')) endedAt.push(t);
    }
    expect(endedAt).toEqual([RAMPAGE_TICKS]);
  });

  it('a wei rampager without the ball still cannot start a rampage', () => {
    const state = ownerState(600);
    state.ball.ownerIdx = -1;
    state.ball.lastTouchIdx = -1;
    state.ball.x = 300;
    state.ball.y = 30;

    const events = pressSpecial(state);

    expect(events.some((e) => e.type === 'special' || e.type === 'rampageStart')).toBe(false);
    expect(state.players[0].rampageTicks).toBe(0);
  });

  it('J without the ball during a no-ball rampage does nothing: no shot, no punch, the rampage goes on', () => {
    const state = noBallState(600);
    pressSpecial(state);

    const events = run(state, 1, inputFor(0, { j: true }));

    expect(events.some((e) => e.type === 'specialShot' || e.type === 'attack' || e.type === 'rampageEnd')).toBe(false);
    expect(state.ball.special).toBeNull();
    expect(state.players[0].rampageTicks).toBeGreaterThan(0);
  });

  it('a no-ball rampager that picks the ball up keeps the rampage, and J then fires the special ball', () => {
    const state = noBallState(600);
    pressSpecial(state);
    state.ball.ownerIdx = 0;
    state.ball.lastTouchIdx = 0;

    const events = run(state, 1, inputFor(0, { j: true }));

    expect(events).toContainEqual({ type: 'specialShot', playerIdx: 0, kind: 'straight' });
    expect(state.ball.special).not.toBeNull();
    expect(state.players[0].rampageTicks).toBe(0);
  });

  it('without the ball a no-ball rampager cannot score on the goal line, and keeps the rampage', () => {
    const state = noBallState(FIELD_W - 120);

    const events = rampageDrive(state, 1, 60);

    expect(events.some((e) => e.type === 'goal')).toBe(false);
    expect(state.match.score).toEqual([0, 0]);
    expect(state.players[0].rampageTicks).toBeGreaterThan(0);
  });

  it('a no-ball rampage still ends when the phase leaves play', () => {
    const state = noBallState(600);
    pressSpecial(state);
    state.match.phase = 'goal';
    state.match.phaseTimer = 100;

    const events = run(state, 1);

    expect(events).toContainEqual({ type: 'rampageEnd', playerIdx: 0 });
    expect(state.players[0].rampageTicks).toBe(0);
  });
});

describe('bump damage share (specialBumpPct)', () => {
  function bumpOnce(bumpPct: number): { damage: number; victimMax: number; stamina0: number; stamina: number } {
    const state = noBallState(300, 1, bumpPct);
    parkAway(state, [0, 5]);
    pressSpecial(state);
    placeOpponentAt(state, 18);
    const victim = state.players[5];
    const stamina0 = victim.stamina;
    const events = run(state, 1);
    const hit = events.find((e) => e.type === 'hit' && e.victimIdx === 5);
    if (hit?.type !== 'hit') throw new Error('no bump');
    return { damage: hit.damage, victimMax: victim.maxStamina, stamina0, stamina: victim.stamina };
  }

  it('a 15% bump share removes 15% of the victim max stamina', () => {
    const r = bumpOnce(0.15);
    expect(r.damage).toBeCloseTo(0.15 * r.victimMax, 9);
    expect(r.stamina).toBeCloseTo(r.stamina0 - 0.15 * r.victimMax, 9);
  });

  it('zhaoyun (20%) bump removes 20% of the victim max stamina', () => {
    const r = bumpOnce(0.2);
    expect(r.damage).toBeCloseTo(0.2 * r.victimMax, 9);
    expect(r.stamina).toBeCloseTo(r.stamina0 - 0.2 * r.victimMax, 9);
  });
});
