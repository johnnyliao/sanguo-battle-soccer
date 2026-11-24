import { describe, expect, it } from 'vitest';
import { getTeam, RAW_CHARACTERS } from '../data/characters';
import { specialDescription } from '../data/specialText';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  DOWN_TICKS_EXHAUSTED,
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  GUST_DELAY_TICKS,
  GUST_LAUNCH_TICKS,
  LAUNCH_AIR_TICKS,
  GUST_RADIUS,
  GUST_STAMINA_RATIO,
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
const MID_Y = FIELD_D / 2;
/** Team 0 slot 3 is Xiao Qiao. Team 1 holds idx 5-9. */
const XIAO_QIAO = 3;
/** Stat 5 for every player: stamina pool 40 + 5 * 6 = 70. */
const MAX_STAMINA = 70;
const GUST_SPECIAL: CharacterDef['special'] = { name: '吹飛', kind: 'zigzag', mode: 'gust', noBall: true };

function makeDef(id: string, role: Role, special: CharacterDef['special'] = { name: 'test', kind: 'straight' }): CharacterDef {
  return {
    id,
    name: id,
    country: 'wu',
    role,
    size: 'M',
    stats: { power: 5, speed: 5, stamina: 5, technique: 5, defense: 5 },
    special,
  };
}

function makeSetup(seed: number): MatchSetup {
  const team0 = ROLES.map((role, i) => makeDef(`a${i}`, role, i === XIAO_QIAO ? GUST_SPECIAL : undefined));
  const team1 = ROLES.map((role, i) => makeDef(`b${i}`, role));
  return { seed, teams: [team0, team1], startInPlay: true };
}

/** Moves every player into a corner far from the action. */
function parkAway(state: GameState): void {
  state.players.forEach((p, i) => {
    p.x = 100;
    p.y = 20 + i * 24;
  });
}

/** Xiao Qiao at (600, mid-field) facing +x, everyone else parked, the ball loose and far away. */
function gustState(seed = 1): GameState {
  const state = createInitialState(makeSetup(seed), SIZE_PARAMS);
  parkAway(state);
  const q = state.players[XIAO_QIAO];
  q.x = 600;
  q.y = MID_Y;
  q.facingX = 1;
  q.facingY = 0;
  state.ball.ownerIdx = -1;
  state.ball.lastTouchIdx = -1;
  state.ball.x = 1000;
  state.ball.y = 30;
  return state;
}

function place(state: GameState, idx: number, x: number, y: number): void {
  state.players[idx].x = x;
  state.players[idx].y = y;
}

/** Gives the ball to the player at his feet. */
function giveBall(state: GameState, idx: number): void {
  const p = state.players[idx];
  state.ball.x = p.x + p.facingX * (p.radius + 4);
  state.ball.y = p.y;
  state.ball.ownerIdx = idx;
  state.ball.lastTouchIdx = idx;
}

/** One tick with `frame` on player `idx` (everyone else idle). Returns that tick's events. */
function tickWith(state: GameState, idx: number, frame: Partial<InputFrame>): SimEvent[] {
  const inputs: InputFrame[] = [];
  inputs[idx] = { ...EMPTY_INPUT, ...frame };
  step(state, inputs);
  return [...state.events];
}

/** Ticks `n` times with no input. Returns every event seen. */
function idle(state: GameState, n: number): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let t = 0; t < n; t++) {
    step(state, []);
    seen.push(...state.events);
  }
  return seen;
}

function castGust(state: GameState): SimEvent[] {
  return tickWith(state, XIAO_QIAO, { l: true });
}

/** Casts with the opponent at (800, mid-field) as the nearest target, so the gust point is (800, mid-field). */
function castAtTarget(seed = 1): GameState {
  const state = gustState(seed);
  place(state, 5, 800, MID_Y);
  castGust(state);
  return state;
}

/** Stands the victims used by the eruption tests (the gust point is (800, mid-field)). */
function placeVictims(state: GameState): void {
  place(state, 6, 800, MID_Y + 80); // inside 90 px: launched
  place(state, 7, 800, MID_Y - 80); // inside 90 px but invincible: safe
  // Sailing makes him invincible for the whole test (a rampage would end at once without the ball).
  state.players[7].sailTicks = 240;
  place(state, 8, 800 + 95, MID_Y); // 95 px away: safe
  place(state, 0, 800, MID_Y + 20); // teammate inside the radius: safe
}

describe('roster', () => {
  it('wu is GK sunquan, DF daqiao, MF zhouyu, MF xiaoqiao, FW sunce', () => {
    const wu = getTeam('wu');
    expect(wu.map((d) => d.id)).toEqual(['sunquan', 'daqiao', 'zhouyu', 'xiaoqiao', 'sunce']);
    expect(wu.map((d) => d.role)).toEqual(ROLES);
  });

  it('no longer has ganning', () => {
    expect(RAW_CHARACTERS.some((d) => d.id === 'ganning')).toBe(false);
  });

  it('xiaoqiao is a small midfielder with the gust special, usable without the ball', () => {
    const xq = RAW_CHARACTERS.find((d) => d.id === 'xiaoqiao');
    expect(xq).toBeDefined();
    expect(xq?.name).toBe('小喬');
    expect(xq?.country).toBe('wu');
    expect(xq?.role).toBe('MF');
    expect(xq?.size).toBe('S');
    expect(xq?.stats).toEqual({ power: 3, speed: 6, stamina: 5, technique: 9, defense: 5 });
    expect(xq?.special).toEqual({ name: '吹飛', kind: 'zigzag', mode: 'gust', noBall: true });
  });

  it('describes the gust as a with-or-without-ball special within 30 characters', () => {
    const xq = RAW_CHARACTERS.find((d) => d.id === 'xiaoqiao');
    if (!xq) throw new Error('xiaoqiao missing');
    const d = specialDescription(xq);
    expect(d.condition).toBe('持球或不持球');
    expect(d.effect.length).toBeLessThanOrEqual(30);
    expect(d.effect).toContain('扣50%');
  });
});

describe('cast', () => {
  it('casts without the ball: charges stamina and cooldown, emits special and gustMark', () => {
    const state = gustState();
    const events = castGust(state);
    expect(events).toContainEqual({ type: 'special', playerIdx: XIAO_QIAO, kind: 'zigzag', name: '吹飛' });
    expect(events).toContainEqual(expect.objectContaining({ type: 'gustMark', playerIdx: XIAO_QIAO, radius: GUST_RADIUS }));
    expect(state.gusts).toHaveLength(1);
    expect(state.players[XIAO_QIAO].stamina).toBeCloseTo(MAX_STAMINA - SPECIAL_STAMINA_COST, 0);
    expect(state.players[XIAO_QIAO].specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(state.players[XIAO_QIAO].action).toBe('normal');
  });

  it('casts while carrying the ball and keeps it', () => {
    const state = gustState();
    giveBall(state, XIAO_QIAO);
    const events = castGust(state);
    expect(events.some((e) => e.type === 'gustMark')).toBe(true);
    expect(state.ball.ownerIdx).toBe(XIAO_QIAO);
  });

  it('keeps her moving right after the cast', () => {
    const state = gustState();
    castGust(state);
    for (let t = 0; t < 10; t++) tickWith(state, XIAO_QIAO, { moveX: 1 });
    expect(state.players[XIAO_QIAO].x).toBeGreaterThan(600);
  });

  it('a second cast waits for the cooldown', () => {
    const state = gustState();
    castGust(state);
    tickWith(state, XIAO_QIAO, { l: true });
    expect(state.gusts).toHaveLength(1);
  });
});

describe('target', () => {
  it('marks the nearest opponent on her facing side, ignoring one behind her', () => {
    const state = gustState();
    place(state, 5, 800, MID_Y);
    place(state, 6, 560, MID_Y); // behind her and nearer: ignored
    const events = castGust(state);
    expect(events).toContainEqual(expect.objectContaining({ type: 'gustMark', x: 800, y: MID_Y }));
    expect(state.gusts[0]).toMatchObject({ x: 800, y: MID_Y, ownerIdx: XIAO_QIAO, team: 0 });
  });

  it('picks the nearer of two opponents ahead', () => {
    const state = gustState();
    place(state, 5, 900, MID_Y);
    place(state, 7, 750, MID_Y);
    castGust(state);
    expect(state.gusts[0]).toMatchObject({ x: 750, y: MID_Y });
  });

  it('takes an opponent exactly 300 px ahead', () => {
    const state = gustState();
    place(state, 5, 900, MID_Y);
    castGust(state);
    expect(state.gusts[0]).toMatchObject({ x: 900, y: MID_Y });
  });

  it('ignores an opponent 350 px ahead and falls back to 150 px straight ahead', () => {
    const state = gustState();
    place(state, 5, 950, MID_Y);
    castGust(state);
    expect(state.gusts[0]).toMatchObject({ x: 750, y: MID_Y });
  });

  it('skips a downed opponent', () => {
    const state = gustState();
    place(state, 5, 800, MID_Y);
    state.players[5].action = 'down';
    state.players[5].actionTimer = 60;
    place(state, 7, 900, MID_Y);
    castGust(state);
    expect(state.gusts[0]).toMatchObject({ x: 900, y: MID_Y });
  });

  it('with no facing uses the attack direction for the fallback', () => {
    const state = gustState();
    state.players[XIAO_QIAO].facingX = 0;
    state.players[XIAO_QIAO].facingY = 0;
    castGust(state);
    expect(state.gusts[0]).toMatchObject({ x: 750, y: MID_Y });
  });

  it('clamps the fallback point to the field', () => {
    const state = gustState();
    state.players[XIAO_QIAO].x = 1100;
    castGust(state);
    expect(state.gusts[0]).toMatchObject({ x: FIELD_W, y: MID_Y });
  });
});

describe('mark', () => {
  it('stays where it was cast when the target walks away', () => {
    const state = castAtTarget();
    place(state, 5, 900, MID_Y);
    idle(state, 10);
    expect(state.gusts[0]).toMatchObject({ x: 800, y: MID_Y });
  });
});

describe('eruption', () => {
  it('erupts exactly GUST_DELAY_TICKS (30) ticks after the cast', () => {
    const state = castAtTarget();
    expect(idle(state, GUST_DELAY_TICKS - 1).some((e) => e.type === 'gustBlow')).toBe(false);
    const events = idle(state, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'gustBlow', gustId: 1, x: 800, y: MID_Y }));
    expect(state.gusts).toHaveLength(0);
  });

  it('launches opponents within 90 px only, not teammates or invincible ones', () => {
    const state = castAtTarget();
    placeVictims(state);
    idle(state, GUST_DELAY_TICKS - 1);
    const events = idle(state, 1);
    expect(events).toContainEqual({ type: 'gustBlow', gustId: 1, x: 800, y: MID_Y, victimIdxs: [5, 6] });
    expect(state.players[5].action).toBe('down');
    expect(state.players[6].action).toBe('down');
    expect(state.players[7].action).not.toBe('down');
    expect(state.players[8].action).not.toBe('down');
    expect(state.players[0].action).not.toBe('down');
  });

  it('costs each launched opponent 50% of his max stamina', () => {
    const state = castAtTarget();
    placeVictims(state);
    idle(state, GUST_DELAY_TICKS - 1);
    const before = state.players[5].stamina;
    const events = idle(state, 1);
    expect(state.players[5].stamina).toBeCloseTo(before - GUST_STAMINA_RATIO * MAX_STAMINA, 9);
    expect(events).toContainEqual(expect.objectContaining({ type: 'hit', attackerIdx: XIAO_QIAO, victimIdx: 5, kind: 'special' }));
    expect(state.players[7].stamina).toBe(MAX_STAMINA);
  });

  it('launches a victim away from the gust point and into the air', () => {
    const state = castAtTarget();
    placeVictims(state);
    idle(state, GUST_DELAY_TICKS - 1);
    idle(state, 1);
    const v = state.players[6];
    expect(v.z).toBeGreaterThan(0);
    expect(v.y).toBeGreaterThan(MID_Y + 80);
    expect(v.x).toBeCloseTo(800, 6);
  });

  it('is airborne for LAUNCH_AIR_TICKS ticks counting the eruption tick, then lies down until GUST_LAUNCH_TICKS', () => {
    const state = castAtTarget();
    placeVictims(state);
    idle(state, GUST_DELAY_TICKS);
    expect(state.players[6].action).toBe('down');
    idle(state, LAUNCH_AIR_TICKS - 2);
    expect(state.players[6].action).toBe('down');
    expect(state.players[6].z).toBeGreaterThan(0);
    idle(state, 1);
    expect(state.players[6].action).toBe('down');
    expect(state.players[6].z).toBe(0);
    idle(state, GUST_LAUNCH_TICKS - LAUNCH_AIR_TICKS - 1);
    expect(state.players[6].action).toBe('down');
    expect(state.players[6].z).toBe(0);
    idle(state, 1);
    expect(state.players[6].action).toBe('normal');
    expect(state.players[6].z).toBe(0);
  });

  it('peaks below 50 px', () => {
    const state = castAtTarget();
    placeVictims(state);
    idle(state, GUST_DELAY_TICKS);
    let peak = state.players[6].z;
    for (let t = 1; t < LAUNCH_AIR_TICKS; t++) {
      idle(state, 1);
      peak = Math.max(peak, state.players[6].z);
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(50);
  });

  it('a holder drops the ball', () => {
    const state = castAtTarget();
    giveBall(state, 5);
    const events = idle(state, GUST_DELAY_TICKS);
    expect(events).toContainEqual({ type: 'looseBall', playerIdx: 5 });
    expect(state.ball.ownerIdx).toBe(-1);
  });

  it('an emptied victim stays down for the longer exhausted time', () => {
    const state = castAtTarget();
    idle(state, GUST_DELAY_TICKS - 1);
    state.players[5].stamina = 10;
    idle(state, 1);
    expect(state.players[5].stamina).toBe(0);
    expect(state.players[5].action).toBe('down');
    idle(state, DOWN_TICKS_EXHAUSTED - 2);
    expect(state.players[5].action).toBe('down');
    idle(state, 1);
    expect(state.players[5].action).toBe('normal');
  });

  it('a phase change clears pending gusts without an eruption', () => {
    const state = castAtTarget();
    state.match.phase = 'halftime';
    state.match.phaseTimer = 100;
    const events = idle(state, 1);
    expect(events).toContainEqual({ type: 'gustEnd', gustId: 1 });
    expect(state.gusts).toHaveLength(0);
    expect(idle(state, GUST_DELAY_TICKS).some((e) => e.type === 'gustBlow')).toBe(false);
    expect(state.players[5].action).not.toBe('down');
  });
});

describe('determinism', () => {
  it('the same seed and inputs give the same state', () => {
    const run = (): string => {
      const state = castAtTarget(7);
      placeVictims(state);
      idle(state, GUST_DELAY_TICKS + GUST_LAUNCH_TICKS);
      return hashState(state);
    };
    expect(run()).toBe(run());
  });
});
