import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  BEAM_CAST_TICKS,
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
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

/**
 * Player `idx` (0 = team 0, 5 = team 1) is Zhuge Liang: the beam special, owning the ball at x, facing the goal it attacks
 * in the first half (team 0 faces +x, team 1 faces -x).
 */
function beamerState(x: number, idx = 0, seed = 1): GameState {
  const state = createInitialState(makeSetup(seed), SIZE_PARAMS);
  parkAway(state, [idx]);
  const p = state.players[idx];
  const facingX = idx < 5 ? 1 : -1;
  p.x = x;
  p.y = FIELD_D / 2;
  p.facingX = facingX;
  p.facingY = 0;
  p.specialMode = 'beam';
  p.specialKind = 'beam';
  p.specialName = '破魔光彈';
  state.ball.x = p.x + facingX * (p.radius + DRIBBLE_OFFSET);
  state.ball.y = p.y;
  state.ball.ownerIdx = idx;
  state.ball.lastTouchIdx = idx;
  return state;
}

/** Press L (the special button) once for player `idx`. Returns the events of that tick. */
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

/** Ticks until a goal is scored or `maxTicks` pass. Returns every event seen. */
function runUntilGoal(state: GameState, maxTicks: number): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let t = 0; t < maxTicks; t++) {
    step(state, []);
    seen.push(...state.events);
    if (state.events.some((e) => e.type === 'goal')) break;
  }
  return seen;
}

/** Ball is loose and far from everyone. */
function looseBallAway(state: GameState): void {
  state.ball.ownerIdx = -1;
  state.ball.lastTouchIdx = -1;
  state.ball.x = 300;
  state.ball.y = 30;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.vz = 0;
}

describe('beam cast start', () => {
  it('L with the ball in the attacking half starts the cast: stands still, costs stamina, sets the cooldown, emits events', () => {
    const state = beamerState(800);
    const p = state.players[0];
    const stamina0 = p.stamina;

    const events = pressL(state);

    expect(events).toContainEqual({ type: 'special', playerIdx: 0, kind: 'beam', name: '破魔光彈' });
    expect(events).toContainEqual({ type: 'beamCharge', playerIdx: 0 });
    expect(p.action).toBe('cast');
    expect(p.actionTimer).toBe(BEAM_CAST_TICKS);
    expect(p.vx).toBe(0);
    expect(p.vy).toBe(0);
    expect(p.stamina).toBeCloseTo(stamina0 - SPECIAL_STAMINA_COST, 6);
    expect(p.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(state.ball.ownerIdx).toBe(0);
    expect(state.ball.special).toBeNull();
  });

  it('team 1 casts in its own attacking half (the left side in the first half)', () => {
    const state = beamerState(400, 5);

    const events = pressL(state, 5);

    expect(events).toContainEqual({ type: 'beamCharge', playerIdx: 5 });
    expect(state.players[5].action).toBe('cast');
  });

  it('during the channel the player ignores movement, punch and call input and keeps the ball', () => {
    const state = beamerState(800);
    const p = state.players[0];
    pressL(state);

    for (let t = 0; t < BEAM_CAST_TICKS - 1; t++) {
      step(state, inputFor(0, { moveX: 1, moveY: 1, j: true, k: true }));
    }

    expect(p.action).toBe('cast');
    expect(p.x).toBe(800);
    expect(p.y).toBe(FIELD_D / 2);
    expect(state.ball.ownerIdx).toBe(0);
  });

  it('in his own half a beamer with the ball does not cast', () => {
    const state = beamerState(400);
    const p = state.players[0];

    const events = pressL(state);

    expect(events.some((e) => e.type === 'beamCharge' || e.type === 'special')).toBe(false);
    expect(p.action).toBe('normal');
    expect(p.specialCooldown).toBe(0);
    expect(state.ball.ownerIdx).toBe(0);
  });

  it('without the ball L does nothing', () => {
    const state = beamerState(800);
    looseBallAway(state);
    const p = state.players[0];

    const events = pressL(state);

    expect(events.some((e) => e.type === 'beamCharge' || e.type === 'special')).toBe(false);
    expect(p.action).toBe('normal');
    expect(p.specialCooldown).toBe(0);
  });
});

describe('beam flight', () => {
  it('the beam flies at the goal, knocks down the goalkeeper standing on the line, cannot be saved and scores', () => {
    const state = beamerState(800);
    const gk = state.players[5];
    gk.x = FIELD_W - 100;
    gk.y = FIELD_D / 2;

    const events = [...pressL(state), ...runUntilGoal(state, 300)];

    const fire = events.find((e) => e.type === 'beamFire');
    expect(fire).toBeDefined();
    if (fire?.type !== 'beamFire') throw new Error('unreachable');
    expect(fire.playerIdx).toBe(0);
    expect(fire.dirX).toBeCloseTo(1, 9);
    expect(fire.dirY).toBeCloseTo(0, 9);
    expect(events).toContainEqual({ type: 'specialShot', playerIdx: 0, kind: 'beam' });

    expect(events).toContainEqual(expect.objectContaining({ type: 'beamHit', playerIdx: 5 }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'hit', attackerIdx: 0, victimIdx: 5, kind: 'special' }));
    expect(events).toContainEqual({ type: 'down', playerIdx: 5 });
    expect(events.some((e) => e.type === 'save')).toBe(false);

    expect(events).toContainEqual({ type: 'goal', team: 0, scorerIdx: 0 });
    expect(state.match.score).toEqual([1, 0]);
    expect(state.match.phase).toBe('goal');
  });

  it('an opponent on the line is knocked down and the ball is not stopped', () => {
    const state = beamerState(800);
    const victim = state.players[6];
    victim.x = FIELD_W - 200;
    victim.y = FIELD_D / 2;

    const events = [...pressL(state), ...runUntilGoal(state, 300)];

    expect(events).toContainEqual(expect.objectContaining({ type: 'hit', attackerIdx: 0, victimIdx: 6, kind: 'special' }));
    expect(events).toContainEqual({ type: 'down', playerIdx: 6 });
    expect(victim.action).toBe('down');
    expect(events.some((e) => e.type === 'looseBall' || e.type === 'pickup')).toBe(false);
    expect(events).toContainEqual({ type: 'goal', team: 0, scorerIdx: 0 });
  });

  it('an invincible opponent on the line is passed over without stopping the ball', () => {
    const state = beamerState(800);
    const victim = state.players[6];
    victim.x = FIELD_W - 200;
    victim.y = FIELD_D / 2;
    // A lunge is invincible for as long as the timer runs (a rampage would end at once without the ball).
    victim.action = 'lunge';
    victim.actionTimer = 10000;

    const events = [...pressL(state), ...runUntilGoal(state, 300)];

    expect(events.some((e) => e.type === 'hit' && e.victimIdx === 6)).toBe(false);
    expect(events.some((e) => e.type === 'beamHit' && e.playerIdx === 6)).toBe(false);
    expect(events).toContainEqual({ type: 'goal', team: 0, scorerIdx: 0 });
  });
});

describe('beam cast protection and end', () => {
  it('a punch during the cast does nothing to the caster', () => {
    const state = beamerState(800);
    const victim = state.players[6];
    pressL(state);
    victim.x = 818;
    victim.y = FIELD_D / 2;
    victim.facingX = -1;
    victim.facingY = 0;
    victim.bumpCooldown = 10000;
    const owner = state.players[0];
    const stamina0 = owner.stamina;

    const events = run(state, PUNCH_TICKS, inputFor(6, { j: true }));

    expect(events).toContainEqual({ type: 'attack', playerIdx: 6, kind: 'punch' });
    expect(events.some((e) => e.type === 'hit' || e.type === 'looseBall')).toBe(false);
    expect(owner.action).toBe('cast');
    expect(owner.stamina).toBe(stamina0);
    expect(state.ball.ownerIdx).toBe(0);
  });

  it('a tackle during the cast does nothing to the caster', () => {
    const state = beamerState(800);
    const victim = state.players[6];
    pressL(state);
    victim.x = 830;
    victim.y = FIELD_D / 2;
    victim.facingX = -1;
    victim.facingY = 0;
    victim.bumpCooldown = 10000;

    const events = run(state, TACKLE_TICKS, inputFor(6, { j: true, dash: true, moveX: -1 }));

    expect(events).toContainEqual({ type: 'attack', playerIdx: 6, kind: 'tackle' });
    expect(events.some((e) => e.type === 'hit' || e.type === 'looseBall')).toBe(false);
    expect(state.players[0].action).toBe('cast');
    expect(state.ball.ownerIdx).toBe(0);
  });

  it('leaving the play phase mid-cast returns the caster to normal and keeps the ball', () => {
    const state = beamerState(800);
    pressL(state);
    state.match.phase = 'goal';
    state.match.phaseTimer = 100;

    run(state, 1);

    expect(state.players[0].action).toBe('normal');
    expect(state.ball.ownerIdx).toBe(0);
  });
});
