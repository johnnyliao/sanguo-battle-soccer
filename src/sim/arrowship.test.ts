import { describe, expect, it } from 'vitest';
import { RAW_CHARACTERS, getTeam } from '../data/characters';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import { specialDescription } from '../data/specialText';
import {
  ARROWSHIP_BLOCK_MAX_Z,
  ARROWSHIP_HALF_SPAN,
  ARROWSHIP_STAMINA_RATIO,
  ARROWSHIP_TICKS,
  ARROWSHIP_VOLLEY_HALF_W,
  ARROWSHIP_VOLLEY_LEN,
  BALL_RADIUS,
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  PUNCH_TICKS,
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
const GOAL_CY = FIELD_D / 2;
/** Stat 5 for every player: stamina pool 40 + 5 * 6. */
const MAX_STAMINA = 70;
/** Volley damage on a stat-5 player. */
const VOLLEY_DAMAGE = ARROWSHIP_STAMINA_RATIO * MAX_STAMINA;
/** Team 0 slot 0 is Sun Quan (GK). Team 0 attacks +x, so its ship stands at x = 30. */
const SUNQUAN = 0;
const SHIP_SPECIAL: CharacterDef['special'] = { name: '受箭回舟', kind: 'pierce', mode: 'arrowship', noBall: true };

function makeDef(id: string, role: Role, special?: CharacterDef['special']): CharacterDef {
  return {
    id,
    name: id,
    country: 'wu',
    role,
    size: 'M',
    stats: { power: 5, speed: 5, stamina: 5, technique: 5, defense: 5 },
    special: special ?? { name: 'test', kind: 'straight' },
  };
}

/** Sun Quan is team 0 slot 0. `caster` picks which team's GK carries the arrowship (the other team's GK is plain). */
function makeSetup(seed: number, caster: 0 | 1 = 0): MatchSetup {
  const team0 = ROLES.map((role, i) => makeDef(`a${i}`, role, i === 0 && caster === 0 ? SHIP_SPECIAL : undefined));
  const team1 = ROLES.map((role, i) => makeDef(`b${i}`, role, i === 0 && caster === 1 ? SHIP_SPECIAL : undefined));
  return { seed, teams: [team0, team1], startInPlay: true };
}

/** Everyone parked far away on distinct rows at x 1000 (outside the volley area), the ball unowned at (600, mid). */
function arrowState(caster: 0 | 1 = 0, seed = 1): GameState {
  const state = createInitialState(makeSetup(seed, caster), SIZE_PARAMS);
  state.players.forEach((p, i) => {
    p.x = 1000;
    p.y = 30 + i * 25;
    p.facingX = p.team === 0 ? 1 : -1;
    p.facingY = 0;
  });
  state.ball.x = 600;
  state.ball.y = GOAL_CY;
  return state;
}

function input(over: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...over };
}

/** One input frame per player idx (10 players); players not in `over` get an empty frame. */
function frames(over: Record<number, InputFrame> = {}): InputFrame[] {
  return Array.from({ length: 10 }, (_, i) => over[i] ?? EMPTY_INPUT);
}

/** Steps `n` ticks with the same inputs each tick and returns every event emitted. */
function run(state: GameState, n: number, inputs: InputFrame[] = frames()): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    step(state, inputs);
    out.push(...state.events);
  }
  return out;
}

/** Steps until an event of `type` appears (at most `max` ticks) and returns every event emitted. */
function runUntil(state: GameState, type: SimEvent['type'], max: number, inputs: InputFrame[] = frames()): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < max; i++) {
    out.push(...run(state, 1, inputs));
    if (out.some((e) => e.type === type)) break;
  }
  return out;
}

/** Sun Quan (or the given caster idx) casts the arrowship with L, then the cast tick's events are returned. */
function cast(state: GameState, idx = SUNQUAN): SimEvent[] {
  const events = run(state, 1, frames({ [idx]: input({ l: true }) }));
  expect(state.arrowships).toHaveLength(1);
  return events;
}

/** Puts a ball in flight toward the goal the caster defends (team 0 defends x = 0) at (x, y). */
function shotToward(state: GameState, x: number, y: number, vx: number, shooterIdx = 6): void {
  const b = state.ball;
  b.ownerIdx = -1;
  b.lastTouchIdx = shooterIdx;
  b.special = undefined;
  b.tiger = undefined;
  b.x = x;
  b.y = y;
  b.z = 0;
  b.vx = vx;
  b.vy = 0;
  b.vz = 0;
}

describe('arrowship: roster and text', () => {
  it('wu is GK sunquan with the arrowship special, usable with or without the ball', () => {
    const sq = RAW_CHARACTERS.find((d) => d.id === 'sunquan');
    expect(sq?.name).toBe('孫權');
    expect(sq?.country).toBe('wu');
    expect(sq?.role).toBe('GK');
    expect(sq?.size).toBe('M');
    expect(sq?.stats).toEqual({ power: 6, speed: 5, stamina: 7, technique: 6, defense: 9 });
    expect(sq?.special).toEqual({ name: '受箭回舟', kind: 'pierce', mode: 'arrowship', noBall: true });
    expect(RAW_CHARACTERS.some((d) => d.id === 'huanggai')).toBe(false);
    expect(getTeam('wu').map((d) => d.id)).toEqual(['sunquan', 'daqiao', 'zhouyu', 'xiaoqiao', 'sunce']);
  });

  it('describes the arrowship with a with-or-without-ball condition within 30 characters', () => {
    const sq = RAW_CHARACTERS.find((d) => d.id === 'sunquan');
    if (!sq) throw new Error('sunquan missing');
    const d = specialDescription(sq);
    expect(d.condition).toBe('持球或不持球');
    expect(d.effect.length).toBeLessThanOrEqual(30);
    expect(d.effect).toContain('扣30%');
  });
});

describe('arrowship: cast and placement', () => {
  it('is castable without the ball and costs stamina and starts the cooldown', () => {
    const state = arrowState(0);
    const sq = state.players[SUNQUAN];
    sq.x = 900;
    sq.y = 60;
    const events = cast(state);
    expect(state.ball.ownerIdx).toBe(-1);
    expect(sq.stamina).toBeCloseTo(MAX_STAMINA - SPECIAL_STAMINA_COST, 0);
    expect(sq.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(sq.arrowshipUp).toBe(true);
    expect(events).toContainEqual({
      type: 'arrowshipStart',
      playerIdx: SUNQUAN,
      shipId: 1,
      x: 30,
      y: GOAL_CY,
      dir: 1,
      halfSpan: ARROWSHIP_HALF_SPAN,
    });
  });

  it('is castable with the ball, and he keeps it', () => {
    const state = arrowState(0);
    state.ball.ownerIdx = SUNQUAN;
    cast(state);
    expect(state.ball.ownerIdx).toBe(SUNQUAN);
    expect(state.arrowships[0]).toMatchObject({ ownerIdx: SUNQUAN, team: 0, x: 30, y: GOAL_CY, dir: 1, arrows: 0 });
  });

  it('stands at the own goal of a team 1 caster, far from where he stands', () => {
    const state = arrowState(1);
    const caster = state.players[5];
    caster.x = 200;
    caster.y = 40;
    cast(state, 5);
    expect(state.arrowships[0]).toMatchObject({ ownerIdx: 5, team: 1, x: FIELD_W - 30, y: GOAL_CY, dir: -1 });
  });
});

describe('arrowship: shots and attacks in the window', () => {
  it('a shot at goal during the window is blocked: loose, moving away, one arrow', () => {
    const state = arrowState(0);
    cast(state);
    shotToward(state, 60, GOAL_CY, -300);
    const events = runUntil(state, 'arrowshipBlock', 30);
    expect(events).toContainEqual({ type: 'arrowshipBlock', shipId: 1, arrows: 1, kind: 'ball', x: 30, y: GOAL_CY });
    const b = state.ball;
    expect(b.ownerIdx).toBe(-1);
    expect(b.x).toBeGreaterThanOrEqual(30 + BALL_RADIUS);
    expect(b.vx).toBeGreaterThan(0);
    expect(state.arrowships[0].arrows).toBe(1);
    const after = run(state, 90);
    expect(after.filter((e) => e.type === 'goal')).toHaveLength(0);
  });

  it('a ball outside the span is not blocked and goes through', () => {
    const state = arrowState(0);
    cast(state);
    shotToward(state, 60, GOAL_CY + ARROWSHIP_HALF_SPAN + 10, -300);
    const events = run(state, 8);
    expect(events.filter((e) => e.type === 'arrowshipBlock')).toHaveLength(0);
    expect(state.arrowships[0].arrows).toBe(0);
    expect(state.ball.x).toBeLessThan(30);
  });

  it('a ball above the block height is not blocked', () => {
    const state = arrowState(0);
    cast(state);
    shotToward(state, 60, GOAL_CY, -300);
    state.ball.z = ARROWSHIP_BLOCK_MAX_Z + 10;
    const events = run(state, 10);
    expect(events.filter((e) => e.type === 'arrowshipBlock')).toHaveLength(0);
    expect(state.arrowships[0].arrows).toBe(0);
  });

  it('a shot after the window ends can score', () => {
    const state = arrowState(0);
    cast(state);
    const ended = run(state, ARROWSHIP_TICKS);
    expect(ended.filter((e) => e.type === 'arrowshipEnd')).toHaveLength(1);
    expect(state.arrowships).toHaveLength(0);
    shotToward(state, 60, GOAL_CY, -300);
    const events = run(state, 40);
    expect(events).toContainEqual({ type: 'goal', team: 1, scorerIdx: 6 });
  });

  it('an enemy punch on him during the window does no damage and counts an arrow', () => {
    const state = arrowState(0);
    const sq = state.players[SUNQUAN];
    sq.x = 300;
    sq.y = GOAL_CY;
    cast(state);
    const stamina0 = sq.stamina;
    expect(isInvincible(sq)).toBe(true);
    const enemy = state.players[5];
    enemy.x = 318;
    enemy.y = GOAL_CY;
    enemy.facingX = -1;
    enemy.facingY = 0;
    const events = run(state, PUNCH_TICKS + 2, frames({ 5: input({ j: true }) }));
    expect(events).toContainEqual({ type: 'attack', playerIdx: 5, kind: 'punch' });
    expect(events).toContainEqual({ type: 'arrowshipBlock', shipId: 1, arrows: 1, kind: 'attack', x: sq.x, y: sq.y });
    expect(events.filter((e) => e.type === 'hit')).toHaveLength(0);
    expect(sq.stamina).toBeGreaterThanOrEqual(stamina0);
    expect(sq.action).toBe('normal');
  });
});

describe('arrowship: barrier', () => {
  it('an enemy cannot cross the line inside the span but can outside it', () => {
    const state = arrowState(0);
    cast(state);
    const minX = 30 + 9 + DRIBBLE_OFFSET;
    state.players[5].x = 60;
    state.players[5].y = GOAL_CY;
    state.players[6].x = 60;
    state.players[6].y = GOAL_CY + ARROWSHIP_HALF_SPAN + 40;
    run(state, 90, frames({ 5: input({ moveX: -1 }), 6: input({ moveX: -1 }) }));
    expect(state.players[5].x).toBeGreaterThanOrEqual(minX);
    expect(state.players[6].x).toBeLessThan(30);
  });

  it('a teammate is not held back by the line', () => {
    const state = arrowState(0);
    cast(state);
    state.players[2].x = 60;
    state.players[2].y = GOAL_CY;
    run(state, 90, frames({ 2: input({ moveX: -1 }) }));
    expect(state.players[2].x).toBeLessThan(30);
  });
});

describe('arrowship: volley', () => {
  it('fires on tick 120 and hits the enemy in the area, not outside it or teammates', () => {
    const state = arrowState(0);
    cast(state);
    const carrier = state.players[5];
    carrier.x = 200;
    carrier.y = GOAL_CY;
    state.ball.ownerIdx = 5;
    state.players[6].x = 200;
    state.players[6].y = 5;
    state.players[7].x = 400;
    state.players[7].y = GOAL_CY;
    state.players[2].x = 150;
    state.players[2].y = 190;
    const stamina0 = carrier.stamina;

    // The cast tick is tick 1, as for portals: the volley is on the ARROWSHIP_TICKS-th tick counting it.
    const before = run(state, ARROWSHIP_TICKS - 2);
    expect(before.filter((e) => e.type === 'arrowshipVolley')).toHaveLength(0);
    expect(isInvincible(state.players[SUNQUAN])).toBe(true);

    const events = run(state, 1);
    expect(events).toContainEqual({
      type: 'arrowshipVolley',
      shipId: 1,
      x: 30,
      y: GOAL_CY,
      dir: 1,
      len: ARROWSHIP_VOLLEY_LEN,
      halfW: ARROWSHIP_VOLLEY_HALF_W,
      arrows: 0,
      victimIdxs: [5],
    });
    expect(carrier.stamina).toBeCloseTo(stamina0 - VOLLEY_DAMAGE);
    expect(carrier.action).toBe('hitstun');
    expect(carrier.vx).toBeGreaterThan(0);
    expect(state.ball.ownerIdx).toBe(-1);
    expect(state.players[6].stamina).toBe(MAX_STAMINA);
    expect(state.players[7].stamina).toBe(MAX_STAMINA);
    expect(state.players[2].stamina).toBe(MAX_STAMINA);
    expect(events).toContainEqual({ type: 'arrowshipEnd', shipId: 1 });
    expect(isInvincible(state.players[SUNQUAN])).toBe(false);
    expect(state.arrowships).toHaveLength(0);
  });

  it('fires with the arrows it counted', () => {
    const state = arrowState(0);
    const sq = state.players[SUNQUAN];
    sq.x = 300;
    sq.y = GOAL_CY;
    cast(state);
    const enemy = state.players[5];
    enemy.x = 318;
    enemy.y = GOAL_CY;
    enemy.facingX = -1;
    enemy.facingY = 0;
    run(state, 1, frames({ 5: input({ j: true }) }));
    const events = runUntil(state, 'arrowshipVolley', ARROWSHIP_TICKS);
    expect(events).toContainEqual(expect.objectContaining({ type: 'arrowshipVolley', arrows: 1 }));
  });

  it('an empty area still fires the volley with no victims', () => {
    const state = arrowState(0);
    cast(state);
    const events = runUntil(state, 'arrowshipVolley', ARROWSHIP_TICKS);
    expect(events).toContainEqual(expect.objectContaining({ type: 'arrowshipVolley', arrows: 0, victimIdxs: [] }));
    expect(events).toContainEqual({ type: 'arrowshipEnd', shipId: 1 });
  });

  it('a phase change clears the ship at once and lowers his invincibility', () => {
    const state = arrowState(0);
    cast(state);
    state.match.phase = 'kickoff';
    state.match.phaseTimer = 1000;
    const events = run(state, 1);
    expect(state.arrowships).toHaveLength(0);
    expect(state.players[SUNQUAN].arrowshipUp).toBe(false);
    expect(isInvincible(state.players[SUNQUAN])).toBe(false);
    expect(events).toContainEqual({ type: 'arrowshipEnd', shipId: 1 });
  });
});
