import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams, SpecialKind } from '../data/types';
import { choosePassTarget } from './actions';
import {
  CHARGE_FULL,
  CHARGE_MOVE_MULT,
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  PLAYER_BASE_SPEED,
  PLAYER_SPEED_PER_STAT,
  PUNCH_TICKS,
  SPECIAL_FLAT_Z,
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

function makeDef(id: string, role: Role, size: BodySize, speed = 5): CharacterDef {
  return {
    id,
    name: id,
    country: 'wei',
    role,
    size,
    stats: { power: 5, speed, stamina: 5, technique: 5, defense: 5 },
    special: { name: 'test', kind: 'straight' },
  };
}

function makeTeam(prefix: string): CharacterDef[] {
  return ROLES.map((role, i) => makeDef(`${prefix}${i}`, role, 'M'));
}

function makeSetup(seed: number): MatchSetup {
  return { seed, teams: [makeTeam('a'), makeTeam('b')], startInPlay: true };
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

/** Team 0 player 0 owns the ball at (x, centre) facing +x unless facingX says otherwise. */
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

/** Press J (tick 0), hold it for a full charge, then release. Returns every event seen. */
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

/** Steps until a tick emits an event of `type` (stops on that tick). Returns every event seen. */
function runUntilEvent(state: GameState, type: SimEvent['type'], maxTicks: number): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let t = 0; t < maxTicks; t++) {
    step(state, []);
    seen.push(...state.events);
    if (state.events.some((e) => e.type === type)) break;
  }
  return seen;
}

/** Ball position for every tick while a special is in flight, up to its end event. */
function flyUntilEnd(state: GameState, maxTicks: number): { x: number; y: number; z: number }[] {
  const frames: { x: number; y: number; z: number }[] = [];
  for (let t = 0; t < maxTicks; t++) {
    step(state, []);
    if (state.ball.special !== null) {
      frames.push({ x: state.ball.x, y: state.ball.y, z: state.ball.z });
    }
    if (state.events.some((e) => e.type === 'specialEnd')) break;
  }
  return frames;
}

/** Special kind launched from centre field toward team 1's goal by a fully charged player 0. */
function specialFromCentre(kind: SpecialKind): GameState {
  const state = ownerState(600);
  state.players[0].specialKind = kind;
  state.players[0].specialName = kind;
  fullChargeRelease(state);
  return state;
}

describe('pass', () => {
  it('K releases the ball toward the teammate in front, and that teammate picks it up', () => {
    const state = ownerState(300);
    parkAway(state, [0, 2]);
    state.players[2].x = 400;
    state.players[2].y = FIELD_D / 2;

    const events = stepAndCollect(state, inputFor(0, { k: true }));

    expect(events).toContainEqual({ type: 'kick', playerIdx: 0, kind: 'pass', targetIdx: 2 });
    expect(state.ball.ownerIdx).toBe(-1);
    expect(state.ball.vx).toBeGreaterThan(0);

    const rest = runUntilEvent(state, 'pickup', 120);
    expect(rest).toContainEqual({ type: 'pickup', playerIdx: 2 });
    expect(state.ball.ownerIdx).toBe(2);
  });

  it('a long pass (over PASS_LOB_DIST) is a lob with vz above 100', () => {
    const state = ownerState(300);
    parkAway(state, [0, 2]);
    state.players[2].x = 700;
    state.players[2].y = FIELD_D / 2;

    const events = stepAndCollect(state, inputFor(0, { k: true }));

    expect(events).toContainEqual({ type: 'kick', playerIdx: 0, kind: 'pass', targetIdx: 2 });
    expect(state.ball.vz).toBeGreaterThan(100);
  });

  it('choosePassTarget prefers a teammate in front over a nearer one behind', () => {
    const state = ownerState(300);
    parkAway(state, [0, 1, 2]);
    state.players[1].x = 280;
    state.players[1].y = FIELD_D / 2;
    state.players[2].x = 400;
    state.players[2].y = FIELD_D / 2;

    expect(choosePassTarget(state, state.players[0])).toBe(2);
  });

  it('choosePassTarget picks a teammate who called for a pass, even behind, over one in front', () => {
    const state = ownerState(300);
    parkAway(state, [0, 1, 2]);
    state.players[1].x = 200;
    state.players[1].y = FIELD_D / 2;
    state.players[1].callPassTicks = 10;
    state.players[2].x = 400;
    state.players[2].y = FIELD_D / 2;

    expect(choosePassTarget(state, state.players[0])).toBe(1);
  });

  it('among several callers, choosePassTarget picks the highest callPassTicks, ties to the lowest idx', () => {
    const state = ownerState(300);
    parkAway(state, [0, 1, 2, 3]);
    state.players[1].callPassTicks = 5;
    state.players[2].callPassTicks = 20;
    state.players[3].callPassTicks = 20;
    expect(choosePassTarget(state, state.players[0])).toBe(2);

    state.players[1].callPassTicks = 20;
    expect(choosePassTarget(state, state.players[0])).toBe(1);
  });
});

/** Steps once with `frame` and returns the events of that tick. */
function stepAndCollect(state: GameState, frame: InputFrame[]): SimEvent[] {
  step(state, frame);
  return [...state.events];
}

describe('shot', () => {
  /** Tap J with player 4 (FW) at the edge of the box, facing the opponent goal. */
  function tapShot(seed: number): GameState {
    const state = createInitialState(makeSetup(seed), SIZE_PARAMS);
    parkAway(state, [4]);
    const shooter = state.players[4];
    shooter.x = 1050;
    shooter.y = FIELD_D / 2;
    shooter.facingX = 1;
    shooter.facingY = 0;
    shooter.stats.technique = 10;
    state.ball.ownerIdx = 4;
    state.ball.lastTouchIdx = 4;
    step(state, inputFor(4, { j: true }));
    step(state, []);
    return state;
  }

  it('a tap near the opponent goal sends the ball into the net for most seeds', () => {
    let entered = 0;
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const seed of seeds) {
      const state = tapShot(seed);
      for (let t = 0; t < 120 && state.ball.x <= FIELD_W; t++) step(state, []);
      if (state.ball.x > FIELD_W) entered++;
    }
    expect(entered).toBeGreaterThanOrEqual(8);
  });

  it('a clear from facing the own goal sends the ball backward', () => {
    const state = ownerState(600, -1);

    const events = stepAndCollect(state, inputFor(0, { j: true }));
    events.push(...stepAndCollect(state, []));

    expect(events).toContainEqual({ type: 'kick', playerIdx: 0, kind: 'clear', targetIdx: -1 });
    expect(state.ball.vx).toBeLessThan(0);
    for (let t = 0; t < 40; t++) step(state, []);
    expect(state.ball.x).toBeLessThan(600);
  });
});

describe('charge', () => {
  it('holding J while carrying the ball slows movement to CHARGE_MOVE_MULT of normal speed', () => {
    const maxSpeed = PLAYER_BASE_SPEED + 5 * PLAYER_SPEED_PER_STAT;

    const charging = ownerState(600);
    step(charging, inputFor(0, { j: true, moveX: 1 }));
    for (let t = 0; t < 60; t++) step(charging, inputFor(0, { j: true, moveX: 1 }));
    expect(charging.players[0].action).toBe('charge');
    expect(charging.players[0].vx).toBeCloseTo(maxSpeed * CHARGE_MOVE_MULT, 2);

    const walking = createInitialState(makeSetup(1), SIZE_PARAMS);
    parkAway(walking, [0]);
    walking.players[0].x = 600;
    walking.players[0].y = FIELD_D / 2;
    for (let t = 0; t < 60; t++) step(walking, inputFor(0, { moveX: 1 }));
    expect(walking.players[0].vx).toBeCloseTo(maxSpeed, 2);
  });

  it('emits chargeFull on the tick the charge reaches CHARGE_FULL', () => {
    const state = ownerState(600);
    step(state, inputFor(0, { j: true }));

    const fullAt: number[] = [];
    for (let t = 1; t <= CHARGE_FULL + 5; t++) {
      step(state, inputFor(0, { j: true }));
      if (state.events.some((e) => e.type === 'chargeFull')) fullAt.push(t);
    }
    expect(fullAt).toEqual([CHARGE_FULL]);
  });

  it('releasing after a full charge with enough stamina fires a special and costs 20 stamina', () => {
    const state = ownerState(600);
    const p = state.players[0];
    const events: SimEvent[] = [];
    step(state, inputFor(0, { j: true }));
    for (let t = 0; t < CHARGE_FULL; t++) step(state, inputFor(0, { j: true }));
    const stamina0 = p.stamina;

    step(state, []);
    events.push(...state.events);

    expect(events).toContainEqual({
      type: 'special',
      playerIdx: 0,
      kind: 'straight',
      name: 'test',
    });
    expect(p.stamina).toBeCloseTo(stamina0 - 20, 9);
    expect(state.ball.special).not.toBeNull();
    expect(state.ball.ownerIdx).toBe(-1);
    expect(p.chargeTicks).toBe(0);
  });

  it('a full charge without enough stamina is a normal shot, not a special', () => {
    const state = ownerState(600);
    state.players[0].stamina = 10;

    const events = fullChargeRelease(state);

    expect(events.some((e) => e.type === 'special')).toBe(false);
    expect(events).toContainEqual({ type: 'kick', playerIdx: 0, kind: 'shot', targetIdx: -1 });
    expect(state.ball.special).toBeNull();
  });

  it('being punched while charging loses the ball and cancels the charge', () => {
    const state = ownerState(300);
    parkAway(state, [0, 5]);
    state.players[5].x = 318;
    state.players[5].y = FIELD_D / 2;
    state.players[5].facingX = -1;
    state.players[5].facingY = 0;

    let hit = false;
    for (let t = 0; t < PUNCH_TICKS && !hit; t++) {
      const frame: InputFrame[] = [];
      frame[0] = { ...EMPTY_INPUT, j: true };
      frame[5] = { ...EMPTY_INPUT, j: t === 0 };
      step(state, frame);
      hit = state.events.some((e) => e.type === 'hit');
    }

    const victim = state.players[0];
    expect(hit).toBe(true);
    expect(state.ball.ownerIdx).toBe(-1);
    expect(victim.chargeTicks).toBe(0);
    expect(victim.action).not.toBe('charge');
  });
});

describe('special shots', () => {
  it('straight keeps the ball at SPECIAL_FLAT_Z and on a straight line', () => {
    const state = specialFromCentre('straight');
    const frames = flyUntilEnd(state, 120);

    expect(frames.length).toBeGreaterThan(20);
    for (const f of frames) {
      expect(f.z).toBe(SPECIAL_FLAT_Z);
      expect(f.y).toBeCloseTo(FIELD_D / 2, 9);
    }
  });

  it('zigzag oscillates across the centre line during flight', () => {
    const state = specialFromCentre('zigzag');
    const frames = flyUntilEnd(state, 180);

    const centre = FIELD_D / 2;
    expect(frames.some((f) => f.y > centre + 1)).toBe(true);
    expect(frames.some((f) => f.y < centre - 1)).toBe(true);
    for (const f of frames) expect(f.z).toBe(SPECIAL_FLAT_Z);
  });

  it('lob climbs above z 80 and then lands, ending the special', () => {
    const state = specialFromCentre('lob');
    const frames = flyUntilEnd(state, 180);

    expect(Math.max(...frames.map((f) => f.z))).toBeGreaterThan(80);
    expect(state.events.some((e) => e.type === 'specialEnd')).toBe(true);
    expect(state.ball.z).toBe(0);
  });

  it('pierce knocks down an opponent in its path and keeps going', () => {
    const state = specialFromCentre('pierce');
    const victim = placeVictimOnPath(state);

    const events = runUntilEvent(state, 'hit', 200);

    expect(events.find((e) => e.type === 'hit')).toMatchObject({ victimIdx: 5, kind: 'special' });
    expect(victim.action).toBe('down');
    const xAtHit = state.ball.x;
    for (let t = 0; t < 10; t++) step(state, []);
    expect(state.ball.special).not.toBeNull();
    expect(state.ball.x).toBeGreaterThan(xAtHit);
  });

  it('straight only hitstuns an opponent in its path', () => {
    const state = specialFromCentre('straight');
    const victim = placeVictimOnPath(state);

    const events = runUntilEvent(state, 'hit', 200);

    expect(events.find((e) => e.type === 'hit')).toMatchObject({ victimIdx: 5, kind: 'special' });
    expect(events.some((e) => e.type === 'down')).toBe(false);
    expect(victim.action).toBe('hitstun');
  });

  it('a special ball in flight cannot be picked up by a player in its path', () => {
    const state = ownerState(600);
    parkAway(state, [0, 1]);
    state.players[1].x = 800;
    state.players[1].y = FIELD_D / 2;
    fullChargeRelease(state);

    const pickups: SimEvent[] = [];
    let ended = false;
    for (let t = 0; t < 120 && !ended; t++) {
      step(state, []);
      pickups.push(...state.events.filter((e) => e.type === 'pickup'));
      ended = state.events.some((e) => e.type === 'specialEnd');
    }

    expect(ended).toBe(true);
    expect(pickups).toEqual([]);
  });
});

/** Puts a standing team 1 player (idx 5) on the centre line at x=800. */
function placeVictimOnPath(state: GameState) {
  const victim = state.players[5];
  victim.x = 800;
  victim.y = FIELD_D / 2;
  return victim;
}
