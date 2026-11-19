import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  CALL_PASS_TICKS,
  DASH_STAMINA_COST,
  DOWN_TICKS_EXHAUSTED,
  DOWN_TICKS_KNOCKED,
  GETUP_STAMINA_RATIO,
  LOOSE_BALL_NO_TOUCH,
  PUNCH_TICKS,
  STAMINA_REGEN,
  createInitialState,
  step,
  type GameState,
  type InputFrame,
  type MatchSetup,
  type SimEvent,
  EMPTY_INPUT,
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

/** Moves all players to a row far from the action so they cannot touch the ball. */
function parkPlayers(state: GameState): void {
  state.players.forEach((p, i) => {
    p.x = 1150;
    p.y = 20 + i * 24;
  });
}

/** Two players side by side: attacker (team 0, idx 0) facing +x, victim (team 1, idx 5) 18px ahead. */
function duelState(): GameState {
  const state = createInitialState(makeSetup(1), SIZE_PARAMS);
  parkPlayers(state);
  const a = state.players[0];
  const b = state.players[5];
  a.x = 300;
  a.y = 130;
  b.x = 318;
  b.y = 130;
  return state;
}

/** Steps `ticks` times; `first` is applied on tick 0 only. Returns every event emitted. */
function run(state: GameState, ticks: number, first: InputFrame[] = []): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) {
    step(state, t === 0 ? first : []);
    seen.push(...state.events);
  }
  return seen;
}

/** Steps until a tick emits an event of `type` (stops on that tick). Returns every event seen. */
function runUntilEvent(
  state: GameState,
  type: SimEvent['type'],
  maxTicks: number,
  first: InputFrame[] = [],
): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let t = 0; t < maxTicks; t++) {
    step(state, t === 0 ? first : []);
    seen.push(...state.events);
    if (state.events.some((e) => e.type === type)) break;
  }
  return seen;
}

describe('punch', () => {
  it('hits an adjacent opponent: victim loses stamina, enters hitstun and is knocked away', () => {
    const state = duelState();
    const b = state.players[5];
    const stamina0 = b.stamina;
    const x0 = b.x;

    const events = runUntilEvent(state, 'hit', PUNCH_TICKS, inputFor(0, { j: true }));

    expect(events).toContainEqual({ type: 'attack', playerIdx: 0, kind: 'punch' });
    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ attackerIdx: 0, victimIdx: 5, kind: 'punch' });
    expect(b.stamina).toBeLessThan(stamina0);
    expect(b.action).toBe('hitstun');
    expect(b.x).toBeGreaterThan(x0);
  });

  it('does not hit a teammate', () => {
    const state = duelState();
    const teammate = state.players[1];
    teammate.x = 318;
    teammate.y = 130;
    state.players[5].x = 1150;
    state.players[5].y = 20;

    const events = run(state, PUNCH_TICKS + 2, inputFor(0, { j: true }));

    expect(events.some((e) => e.type === 'hit')).toBe(false);
    expect(teammate.stamina).toBe(teammate.maxStamina);
  });
});

describe('tackle', () => {
  it('dash + J slides into an opponent, knocks them down, and they get up after the knock timer', () => {
    const state = duelState();
    const b = state.players[5];

    const events = runUntilEvent(state, 'hit', PUNCH_TICKS, inputFor(0, { j: true, dash: true, moveX: 1 }));

    expect(events).toContainEqual({ type: 'attack', playerIdx: 0, kind: 'tackle' });
    expect(events.find((e) => e.type === 'hit')).toMatchObject({ victimIdx: 5, kind: 'tackle' });
    expect(b.action).toBe('down');

    run(state, 30);
    expect(b.action).toBe('down');

    run(state, DOWN_TICKS_KNOCKED + 10);
    expect(b.action).toBe('normal');
  });
});

describe('ball loss', () => {
  it('hitting the ball owner knocks the ball loose and the victim cannot re-pick it for a while', () => {
    const state = duelState();
    const b = state.players[5];
    state.ball.ownerIdx = 5;
    state.ball.lastTouchIdx = 5;

    const events = runUntilEvent(state, 'looseBall', PUNCH_TICKS, inputFor(0, { j: true }));

    expect(events).toContainEqual({ type: 'looseBall', playerIdx: 5 });
    expect(state.ball.ownerIdx).toBe(-1);
    expect(b.noTouchTicks).toBe(LOOSE_BALL_NO_TOUCH - 1);

    for (let t = 0; t < LOOSE_BALL_NO_TOUCH - 1; t++) {
      step(state, []);
      expect(state.ball.ownerIdx).not.toBe(5);
    }
  });
});

describe('stamina', () => {
  it('reaching zero stamina from hits puts the player down for a long time, and they get up at 50% stamina', () => {
    const state = duelState();
    const b = state.players[5];
    b.stamina = 5;

    const events = runUntilEvent(state, 'hit', PUNCH_TICKS, inputFor(0, { j: true }));
    expect(events).toContainEqual({ type: 'down', playerIdx: 5 });
    expect(b.action).toBe('down');
    expect(b.stamina).toBe(0);

    let ticks = 0;
    while (b.action !== 'normal' && ticks < DOWN_TICKS_EXHAUSTED + 10) {
      step(state, []);
      ticks++;
    }
    expect(b.action).toBe('normal');
    expect(ticks).toBeGreaterThanOrEqual(DOWN_TICKS_EXHAUSTED - 2);
    expect(b.stamina).toBeCloseTo(b.maxStamina * GETUP_STAMINA_RATIO, 9);
  });

  it('dashing while moving drains stamina', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    const p = state.players[0];
    const s0 = p.stamina;
    for (let t = 0; t < 60; t++) step(state, inputFor(0, { moveX: 1, dash: true }));
    expect(p.stamina).toBeCloseTo(s0 - DASH_STAMINA_COST, 6);
  });

  it('standing still regenerates stamina', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    const p = state.players[0];
    p.stamina = 10;
    run(state, 60);
    expect(p.stamina).toBeCloseTo(10 + STAMINA_REGEN, 6);
  });

  it('dash has no effect at zero stamina', () => {
    const walk = createInitialState(makeSetup(1), SIZE_PARAMS);
    const dash = createInitialState(makeSetup(1), SIZE_PARAMS);
    walk.players[0].stamina = 0;
    dash.players[0].stamina = 0;
    step(walk, inputFor(0, { moveX: 1 }));
    step(dash, inputFor(0, { moveX: 1, dash: true }));
    expect(dash.players[0].vx).toBe(walk.players[0].vx);
  });
});

describe('J without the ball', () => {
  it('a goalkeeper in its own area dives on J and recovers', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    parkPlayers(state);
    const gk = state.players[0];
    gk.x = 40;
    gk.y = 130;

    const events = run(state, 1, inputFor(0, { j: true, moveY: 1 }));

    expect(events).toContainEqual({ type: 'dive', playerIdx: 0 });
    expect(events.some((e) => e.type === 'attack')).toBe(false);
    expect(gk.action).toBe('dive');
  });

  it('a field player punches on J, and a goalkeeper outside its own area punches too', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    parkPlayers(state);
    state.players[1].x = 300;
    state.players[1].y = 130;
    state.players[0].x = 300;
    state.players[0].y = 200;

    const field = run(state, 1, inputFor(1, { j: true }));
    expect(field).toContainEqual({ type: 'attack', playerIdx: 1, kind: 'punch' });

    const gk = run(state, 1, inputFor(0, { j: true }));
    expect(gk).toContainEqual({ type: 'attack', playerIdx: 0, kind: 'punch' });
    expect(gk.some((e) => e.type === 'dive')).toBe(false);
  });

  it('J with the ball does not start an attack', () => {
    const state = duelState();
    state.ball.ownerIdx = 0;
    const events = run(state, PUNCH_TICKS, inputFor(0, { j: true }));
    expect(events.some((e) => e.type === 'attack')).toBe(false);
    expect(state.players[0].action).toBe('normal');
  });
});

describe('call pass', () => {
  it('K without the ball sets callPassTicks, emits callPass, and decays to zero', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    parkPlayers(state);
    const p = state.players[0];

    const events = run(state, 1, inputFor(0, { k: true }));
    expect(events).toContainEqual({ type: 'callPass', playerIdx: 0 });
    expect(p.callPassTicks).toBe(CALL_PASS_TICKS);

    run(state, CALL_PASS_TICKS - 1);
    expect(p.callPassTicks).toBe(1);
    run(state, 1);
    expect(p.callPassTicks).toBe(0);
  });

  it('K while owning the ball passes and does not call for a pass', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    parkPlayers(state);
    state.ball.ownerIdx = 0;

    const events = run(state, 1, inputFor(0, { k: true }));
    expect(events.some((e) => e.type === 'callPass')).toBe(false);
    expect(events.some((e) => e.type === 'kick' && e.kind === 'pass')).toBe(true);
  });
});
