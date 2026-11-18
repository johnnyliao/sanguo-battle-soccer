import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  BALL_RADIUS,
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  GOAL_DEPTH,
  TICK_HZ,
  createInitialState,
  hashState,
  step,
  type GameState,
  type InputFrame,
  type MatchSetup,
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
  return { seed, teams: [makeTeam('a'), makeTeam('b')] };
}

/** Test-local mulberry32 used only to generate input sequences. */
function testRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeInputs(seed: number, ticks: number): InputFrame[][] {
  const rand = testRng(seed);
  const out: InputFrame[][] = [];
  for (let t = 0; t < ticks; t++) {
    const frame: InputFrame[] = [];
    for (let i = 0; i < 10; i++) {
      frame.push({
        moveX: (Math.floor(rand() * 3) - 1) as -1 | 0 | 1,
        moveY: (Math.floor(rand() * 3) - 1) as -1 | 0 | 1,
        dash: rand() < 0.1,
        j: rand() < 0.05,
        k: rand() < 0.05,
        l: rand() < 0.05,
      });
    }
    out.push(frame);
  }
  return out;
}

function inputFor(idx: number, frame: Partial<InputFrame>): InputFrame[] {
  const arr: InputFrame[] = [];
  arr[idx] = { ...EMPTY_INPUT, ...frame };
  return arr;
}

/** Moves all players to a row far from the action so they cannot touch the ball. */
function parkPlayers(state: GameState): void {
  state.players.forEach((p, i) => {
    p.x = 1150;
    p.y = 20 + i * 24;
  });
}

function shotState(y: number, vx: number): GameState {
  const state = createInitialState(makeSetup(1), SIZE_PARAMS);
  parkPlayers(state);
  state.ball.x = 100;
  state.ball.y = y;
  state.ball.vx = vx;
  return state;
}

describe('determinism', () => {
  it('same seed and inputs give the same hash; different inputs differ', () => {
    const inputs = makeInputs(7, 600);
    const runA = createInitialState(makeSetup(123), SIZE_PARAMS);
    const runB = createInitialState(makeSetup(123), SIZE_PARAMS);
    for (const frame of inputs) step(runA, frame);
    for (const frame of inputs) step(runB, frame);
    expect(runA.tick).toBe(600);
    expect(hashState(runA)).toBe(hashState(runB));

    const other = createInitialState(makeSetup(123), SIZE_PARAMS);
    for (const frame of makeInputs(8, 600)) step(other, frame);
    expect(hashState(other)).not.toBe(hashState(runA));
  });
});

describe('ball physics', () => {
  it('launched ball comes to rest inside the field within 10 seconds', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    parkPlayers(state);
    const b = state.ball;
    b.x = FIELD_W / 2;
    b.y = FIELD_D / 2;
    b.z = 0;
    b.vx = 200;
    b.vz = 150;

    let rested = false;
    for (let t = 0; t < 10 * TICK_HZ && !rested; t++) {
      step(state, []);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(FIELD_W);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(FIELD_D);
      rested = b.vx === 0 && b.vy === 0 && b.vz === 0 && b.z === 0;
    }
    expect(rested).toBe(true);
  });

  it('ball fired at the goal mouth ends inside the net and does not come back', () => {
    const state = shotState(130, -300);
    let t = 0;
    while (state.ball.x >= 0 && t < 5 * TICK_HZ) {
      step(state, []);
      t++;
    }
    expect(state.ball.x).toBe(-GOAL_DEPTH);
    for (let i = 0; i < TICK_HZ; i++) {
      step(state, []);
      expect(state.ball.x).toBeLessThan(0);
    }
    expect(state.ball.x).toBe(-GOAL_DEPTH);
  });

  it('ball fired at the end wall outside the goal mouth bounces back', () => {
    const state = shotState(20, -300);
    let t = 0;
    while (state.ball.vx < 0 && t < 5 * TICK_HZ) {
      step(state, []);
      t++;
    }
    expect(state.ball.vx).toBeGreaterThan(0);
    expect(state.ball.x).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < TICK_HZ; i++) step(state, []);
    expect(state.ball.x).toBeGreaterThan(0);
  });
});

describe('player movement', () => {
  it('holding right moves the player right and faces right', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    const x0 = state.players[0].x;
    for (let t = 0; t < 60; t++) step(state, inputFor(0, { moveX: 1 }));
    expect(state.players[0].x).toBeGreaterThan(x0);
    expect(state.players[0].facingX).toBeGreaterThan(0);
  });

  it('a higher speed stat moves the player farther', () => {
    const slow = createInitialState(makeSetup(1), SIZE_PARAMS);
    const fast = createInitialState(makeSetup(1), SIZE_PARAMS);
    fast.players[0].stats.speed = 10;
    for (let t = 0; t < 60; t++) {
      step(slow, inputFor(0, { moveX: 1 }));
      step(fast, inputFor(0, { moveX: 1 }));
    }
    expect(fast.players[0].x).toBeGreaterThan(slow.players[0].x);
  });

  it('dash moves the player farther than walking', () => {
    const walk = createInitialState(makeSetup(1), SIZE_PARAMS);
    const dash = createInitialState(makeSetup(1), SIZE_PARAMS);
    for (let t = 0; t < 60; t++) {
      step(walk, inputFor(0, { moveX: 1 }));
      step(dash, inputFor(0, { moveX: 1, dash: true }));
    }
    expect(dash.players[0].x).toBeGreaterThan(walk.players[0].x);
  });
});

describe('ball possession', () => {
  it('a player walking into a stationary ball picks it up and the ball follows', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    state.ball.x = 100;
    state.ball.y = 130;

    let picked = false;
    for (let t = 0; t < 120 && !picked; t++) {
      step(state, inputFor(0, { moveX: 1 }));
      picked = state.events.some((e) => e.type === 'pickup' && e.playerIdx === 0);
    }
    expect(picked).toBe(true);
    expect(state.ball.ownerIdx).toBe(0);

    const x0 = state.ball.x;
    for (let t = 0; t < 60; t++) step(state, inputFor(0, { moveX: 1 }));
    expect(state.ball.ownerIdx).toBe(0);
    expect(state.ball.x).toBeGreaterThan(x0);
    const p = state.players[0];
    const dist = Math.hypot(state.ball.x - p.x, state.ball.y - p.y);
    expect(dist).toBeLessThan(p.radius + DRIBBLE_OFFSET + BALL_RADIUS);
  });
});

describe('player collisions', () => {
  it('overlapping players separate in one step, and the lighter one moves more', () => {
    const setup = makeSetup(1);
    setup.teams[0][0] = makeDef('light', 'GK', 'S');
    setup.teams[1][0] = makeDef('heavy', 'GK', 'L');
    const state = createInitialState(setup, SIZE_PARAMS);
    parkPlayers(state);
    const a = state.players[0];
    const b = state.players[5];
    a.x = 300;
    a.y = 130;
    b.x = 305;
    b.y = 130;

    step(state, []);

    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    expect(dist).toBeGreaterThanOrEqual(a.radius + b.radius - 1e-9);
    const moveA = Math.hypot(a.x - 300, a.y - 130);
    const moveB = Math.hypot(b.x - 305, b.y - 130);
    expect(moveA).toBeGreaterThan(moveB);
  });
});
