import { describe, expect, it } from 'vitest';
import { RAW_CHARACTERS, getTeam } from '../data/characters';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import { specialDescription } from '../data/specialText';
import {
  EASTWIND_DOT_RATIO,
  EASTWIND_PUSH_MARGIN,
  EASTWIND_RADIUS,
  EASTWIND_SLOW_MULT,
  EASTWIND_STUN_TICKS,
  EASTWIND_TICKS,
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  PLAYER_BASE_SPEED,
  PLAYER_SPEED_PER_STAT,
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
const MID_Y = FIELD_D / 2;
/** Team 0 slot 2 is Zhou Yu (MF). His teammates are idx 0 (GK), 1, 3, 4. */
const ZHOUYU = 2;
/** Stat 5 for every player: stamina pool 40 + 5 * 6, and max speed 60 + 5 * 8. */
const MAX_STAMINA = 70;
const MAX_SPEED = PLAYER_BASE_SPEED + 5 * PLAYER_SPEED_PER_STAT;
/** One pulse takes 10% of a stat-5 player's stamina. */
const PULSE_DAMAGE = EASTWIND_DOT_RATIO * MAX_STAMINA;
const PULSE_TICKS = [60, 120, 180];
/** Distance an opponent is blown out to at the cast. */
const BLOWN_DIST = EASTWIND_RADIUS + EASTWIND_PUSH_MARGIN;

const EASTWIND_SPECIAL: CharacterDef['special'] = { name: '赤壁東風', kind: 'zigzag', mode: 'eastwind', noBall: true };

type Logged = { tick: number; event: SimEvent };

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

/** Team 0 slot 2 is Zhou Yu. Team 0 attacks +x. */
function makeSetup(seed: number, special: CharacterDef['special'] = EASTWIND_SPECIAL): MatchSetup {
  const team0 = ROLES.map((role, i) => makeDef(`a${i}`, role, i === ZHOUYU ? special : undefined));
  const team1 = ROLES.map((role, i) => makeDef(`b${i}`, role));
  return { seed, teams: [team0, team1], startInPlay: true };
}

/**
 * Zhou Yu at (300, mid) facing +x. Everyone else is parked far away at x 1000 on distinct rows, so nothing interferes
 * unless a test moves them. The ball lies unowned at x 600.
 */
function eastwindState(seed = 1, special?: CharacterDef['special']): GameState {
  const state = createInitialState(makeSetup(seed, special), SIZE_PARAMS);
  state.players.forEach((p, i) => {
    p.x = 1000;
    p.y = 30 + i * 25;
    p.facingX = 1;
    p.facingY = 0;
  });
  const zy = state.players[ZHOUYU];
  zy.x = 300;
  zy.y = MID_Y;
  state.ball.x = 600;
  state.ball.y = MID_Y;
  return state;
}

function park(state: GameState, idx: number, x: number, y: number = MID_Y): void {
  state.players[idx].x = x;
  state.players[idx].y = y;
}

function dist(state: GameState, a: number, b: number): number {
  const p = state.players[a];
  const q = state.players[b];
  return Math.hypot(p.x - q.x, p.y - q.y);
}

function input(over: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...over };
}

/** One input frame per player idx (10 players); players not in `over` get an empty frame. */
function frames(over: Record<number, InputFrame> = {}): InputFrame[] {
  return Array.from({ length: 10 }, (_, i) => over[i] ?? EMPTY_INPUT);
}

/** Steps `n` ticks and returns every event tagged with the tick it was emitted on. */
function run(state: GameState, n: number, inputs: InputFrame[] = []): Logged[] {
  const out: Logged[] = [];
  for (let i = 0; i < n; i++) {
    const tick = state.tick;
    step(state, inputs);
    for (const event of state.events) out.push({ tick, event });
  }
  return out;
}

function ofType<T extends SimEvent['type']>(
  log: Logged[],
  type: T,
): { tick: number; event: Extract<SimEvent, { type: T }> }[] {
  return log.filter(
    (e): e is { tick: number; event: Extract<SimEvent, { type: T }> } => e.event.type === type,
  );
}

/** Zhou Yu casts the eastwind (L), then `extra` more ticks run. castTick is the tick of the cast. */
function castEastwind(state: GameState, extra = 0): { log: Logged[]; castTick: number } {
  const castTick = state.tick;
  const log = run(state, 1, frames({ [ZHOUYU]: input({ l: true }) }));
  expect(state.eastwinds).toHaveLength(1);
  return { log: log.concat(run(state, extra)), castTick };
}

/** Offset from the cast: the cast tick is offset 1, matching the eastwind's tick counter. */
function offset(tick: number, castTick: number): number {
  return tick - castTick + 1;
}

describe('cast', () => {
  it('casts without the ball and fixes the field on his position', () => {
    const state = eastwindState();
    const { log } = castEastwind(state);
    expect(state.eastwinds).toEqual([{ id: 1, ownerIdx: ZHOUYU, team: 0, x: 300, y: MID_Y, ticks: 1 }]);
    expect(ofType(log, 'eastwindStart').map((e) => e.event)).toEqual([
      { type: 'eastwindStart', playerIdx: ZHOUYU, windId: 1, x: 300, y: MID_Y, radius: EASTWIND_RADIUS, victimIdxs: [] },
    ]);
  });

  it('casts with the ball when the special is not no-ball, and the ball stays with him', () => {
    const state = eastwindState(1, { name: '赤壁東風', kind: 'zigzag', mode: 'eastwind' });
    state.ball.ownerIdx = ZHOUYU;
    castEastwind(state);
    expect(state.eastwinds).toHaveLength(1);
    expect(state.ball.ownerIdx).toBe(ZHOUYU);
  });

  it('does not cast without the ball when the special needs it', () => {
    const state = eastwindState(1, { name: '赤壁東風', kind: 'zigzag', mode: 'eastwind' });
    run(state, 1, frames({ [ZHOUYU]: input({ l: true }) }));
    expect(state.eastwinds).toHaveLength(0);
  });
});

describe('blow out on cast', () => {
  it('an opponent inside the radius is pushed outside it, with no damage', () => {
    const state = eastwindState();
    park(state, 5, 400);
    const { log } = castEastwind(state);
    expect(dist(state, ZHOUYU, 5)).toBeGreaterThanOrEqual(BLOWN_DIST - 1e-6);
    expect(ofType(log, 'hit')).toHaveLength(0);
    expect(ofType(log, 'eastwindStart').map((e) => e.event.victimIdxs)).toEqual([[5]]);
  });

  it('the victim stays outside the radius through his stun', () => {
    const state = eastwindState();
    park(state, 5, 400);
    castEastwind(state, EASTWIND_STUN_TICKS + 10);
    expect(dist(state, ZHOUYU, 5)).toBeGreaterThanOrEqual(BLOWN_DIST - 1e-6);
    expect(state.players[5].action).toBe('normal');
  });

  it('a victim straight below is blown out along the ray, slid onto the pitch when that point is off it', () => {
    const state = eastwindState();
    park(state, 5, 300, MID_Y + 100);
    castEastwind(state);
    // Straight down from the centre (130 px to the sideline) the ring point is off the pitch, so he slides to the nearest on-pitch angle.
    const v = state.players[5];
    expect(v.x).not.toBeCloseTo(300, 0);
    expect(v.x).toBeGreaterThanOrEqual(0);
    expect(v.x).toBeLessThanOrEqual(FIELD_W);
    expect(v.y).toBeGreaterThanOrEqual(0);
    expect(v.y).toBeLessThanOrEqual(FIELD_D);
    expect(dist(state, ZHOUYU, 5)).toBeGreaterThanOrEqual(BLOWN_DIST - 1e-6);
  });

  it('a victim exactly at the centre is pushed along Zhou Yu facing when that stays on the pitch, else slid onto it', () => {
    const state = eastwindState();
    state.players[ZHOUYU].facingX = 0;
    state.players[ZHOUYU].facingY = 1;
    park(state, 5, 300);
    castEastwind(state);
    const v = state.players[5];
    expect(v.x).toBeGreaterThanOrEqual(0);
    expect(v.x).toBeLessThanOrEqual(FIELD_W);
    expect(v.y).toBeGreaterThanOrEqual(0);
    expect(v.y).toBeLessThanOrEqual(FIELD_D);
    expect(dist(state, ZHOUYU, 5)).toBeGreaterThanOrEqual(BLOWN_DIST - 1e-6);
  });

  it('a victim blown out from mid-pitch stays on the pitch and outside the radius through his stun', () => {
    const state = eastwindState();
    park(state, 5, 300, MID_Y + 100);
    castEastwind(state, EASTWIND_STUN_TICKS + 10);
    const v = state.players[5];
    expect(v.x).toBeGreaterThanOrEqual(0);
    expect(v.x).toBeLessThanOrEqual(FIELD_W);
    expect(v.y).toBeGreaterThanOrEqual(0);
    expect(v.y).toBeLessThanOrEqual(FIELD_D);
    expect(dist(state, ZHOUYU, 5)).toBeGreaterThanOrEqual(BLOWN_DIST - 1e-6);
  });

  it('an opponent outside the radius is not moved', () => {
    const state = eastwindState();
    park(state, 5, 300 + EASTWIND_RADIUS + 30);
    const { log } = castEastwind(state, 30);
    expect(state.players[5].x).toBe(300 + EASTWIND_RADIUS + 30);
    expect(state.players[5].action).toBe('normal');
    expect(ofType(log, 'eastwindStart').map((e) => e.event.victimIdxs)).toEqual([[]]);
  });

  it('a carrier opponent inside the radius drops the ball', () => {
    const state = eastwindState();
    park(state, 5, 340);
    state.ball.ownerIdx = 5;
    state.ball.x = 340;
    state.ball.y = MID_Y;
    const { log } = castEastwind(state);
    expect(ofType(log, 'looseBall').map((e) => e.event.playerIdx)).toEqual([5]);
    expect(state.ball.ownerIdx).not.toBe(5);
  });

  it('a teammate inside the radius is not moved and takes no damage', () => {
    const state = eastwindState();
    park(state, 1, 340);
    const { log } = castEastwind(state, 30);
    expect(state.players[1].x).toBe(340);
    expect(state.players[1].stamina).toBeCloseTo(MAX_STAMINA, 6);
    expect(ofType(log, 'hit').some((h) => h.event.victimIdx === 1)).toBe(false);
  });
});

describe('field and slow', () => {
  it('the field stays at the cast point when he moves', () => {
    const state = eastwindState();
    castEastwind(state, 30);
    run(state, 30, frames({ [ZHOUYU]: input({ moveX: 1 }) }));
    expect(state.players[ZHOUYU].x).toBeGreaterThan(300);
    expect(state.eastwinds[0]).toMatchObject({ x: 300, y: MID_Y });
  });

  it('an opponent inside the field moves at 15% of his max speed', () => {
    const state = eastwindState();
    castEastwind(state);
    park(state, 5, 340);
    run(state, 60, frames({ 5: input({ moveX: 1 }) }));
    expect(state.players[5].vx).toBeCloseTo(MAX_SPEED * EASTWIND_SLOW_MULT, 2);
  });

  it('an opponent outside the field moves at full speed', () => {
    const state = eastwindState();
    castEastwind(state);
    park(state, 5, 480);
    run(state, 60, frames({ 5: input({ moveX: 1 }) }));
    expect(state.players[5].vx).toBeCloseTo(MAX_SPEED, 2);
  });

  it('an invincible opponent inside the field is not slowed', () => {
    const state = eastwindState();
    // Sailing makes him invincible. He stands at 380, clear of Zhou Yu's hull, so the sail does not crash into him.
    park(state, 5, 380);
    state.players[5].sailTicks = 240;
    castEastwind(state);
    run(state, 60, frames({ 5: input({ moveX: 1 }) }));
    // The sail itself is 1.5x, so anything above the plain max speed shows he was not slowed.
    expect(state.players[5].vx).toBeGreaterThan(MAX_SPEED);
  });

  it('the caster herself keeps full speed inside his own field', () => {
    const state = eastwindState();
    castEastwind(state);
    run(state, 60, frames({ [ZHOUYU]: input({ moveX: 1 }) }));
    expect(state.players[ZHOUYU].vx).toBeCloseTo(MAX_SPEED, 2);
  });
});

describe('pulses', () => {
  it('three pulses of 10% of maxStamina at ticks 60, 120, 180 for an opponent who walks back in and stays', () => {
    const state = eastwindState();
    const { log: castLog, castTick } = castEastwind(state);
    park(state, 5, 340);
    const rest = run(state, EASTWIND_TICKS - 1);
    const hits = ofType(castLog.concat(rest), 'hit').filter((h) => h.event.victimIdx === 5);
    expect(hits.map((h) => offset(h.tick, castTick))).toEqual(PULSE_TICKS);
    for (const h of hits) expect(h.event.damage).toBeCloseTo(PULSE_DAMAGE, 6);
    expect(PULSE_TICKS.length * EASTWIND_DOT_RATIO).toBeCloseTo(0.3, 6);
  });

  it('a teammate inside the field takes no pulse', () => {
    const state = eastwindState();
    park(state, 1, 340);
    const { log } = castEastwind(state, EASTWIND_TICKS - 1);
    expect(ofType(log, 'hit').some((h) => h.event.victimIdx === 1)).toBe(false);
  });
});

describe('end', () => {
  it('ends after EASTWIND_TICKS (180 ticks) and emits eastwindEnd on the last one', () => {
    const state = eastwindState();
    const { castTick } = castEastwind(state, EASTWIND_TICKS - 2);
    expect(state.eastwinds).toHaveLength(1);
    const log = run(state, 1);
    expect(state.eastwinds).toHaveLength(0);
    const ends = ofType(log, 'eastwindEnd');
    expect(ends.map((e) => e.event.windId)).toEqual([1]);
    expect(offset(ends[0].tick, castTick)).toBe(EASTWIND_TICKS);
  });

  it('is cleared with eastwindEnd when the phase leaves play, and pulses stop', () => {
    const state = eastwindState();
    park(state, 5, 340);
    castEastwind(state, 10);
    state.match.phase = 'goal';
    state.match.phaseTimer = 1000;
    const log = run(state, 1);
    expect(state.eastwinds).toHaveLength(0);
    expect(ofType(log, 'eastwindEnd').map((e) => e.event.windId)).toEqual([1]);
    const after = run(state, 120);
    expect(ofType(after, 'hit')).toHaveLength(0);
  });
});

describe('roster and text', () => {
  it('zhouyu is the medium wu midfielder with the eastwind special, usable without the ball', () => {
    const zy = RAW_CHARACTERS.find((d) => d.id === 'zhouyu');
    expect(zy?.name).toBe('周瑜');
    expect(zy?.country).toBe('wu');
    expect(zy?.role).toBe('MF');
    expect(zy?.size).toBe('M');
    expect(zy?.stats).toEqual({ power: 5, speed: 6, stamina: 5, technique: 10, defense: 4 });
    expect(zy?.special).toEqual({ name: '赤壁東風', kind: 'zigzag', mode: 'eastwind', noBall: true });
    expect(getTeam('wu').find((d) => d.id === 'zhouyu')?.special.name).toBe('赤壁東風');
  });

  it('describes the eastwind with a with-or-without-ball condition within 30 characters', () => {
    const zy = RAW_CHARACTERS.find((d) => d.id === 'zhouyu');
    if (!zy) throw new Error('zhouyu missing');
    const d = specialDescription(zy);
    expect(d.condition).toBe('持球或不持球');
    expect(d.effect.length).toBeLessThanOrEqual(30);
    expect(d.effect).toContain('緩速85%');
    expect(d.effect).toContain('扣10%');
  });
});
