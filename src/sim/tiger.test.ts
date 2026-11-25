import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  SPECIAL_COOLDOWN_TICKS,
  SPECIAL_STAMINA_COST,
  SPECIAL_STRAIGHT_SPEED,
  TIGER_BALL_STAMINA_RATIO,
  TIGER_GUARD_TICKS,
  TIGER_HOLD_TICKS,
  TIGER_ROAR_STAMINA_RATIO,
  TIGER_SPIT_DISTANCE,
  TIGER_STUN_TICKS,
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
/** Xu Chu's stamina pool at stat 5 (STAMINA_BASE 40 + 5 * STAMINA_PER_STAT 6). */
const MAX_STAMINA = 70;

const TIGER_SPECIAL: CharacterDef['special'] = { name: '惡虎吞天', kind: 'pierce', mode: 'tiger', noBall: true };

function makeDef(id: string, role: Role, special: CharacterDef['special'] = { name: 'test', kind: 'straight' }): CharacterDef {
  return {
    id,
    name: id,
    country: 'wei',
    role,
    size: 'M',
    stats: { power: 5, speed: 5, stamina: 5, technique: 5, defense: 5 },
    special,
  };
}

/** Team 0 slot 0 is Xu Chu (the tiger, GK). Team 0 attacks +x, so his own goal is the x = 0 end. */
function makeSetup(seed: number): MatchSetup {
  const team0 = ROLES.map((role, i) => makeDef(`a${i}`, role, i === 0 ? TIGER_SPECIAL : undefined));
  const team1 = ROLES.map((role, i) => makeDef(`b${i}`, role));
  return { seed, teams: [team0, team1], startInPlay: true };
}

/** Xu Chu at (100, mid) facing +x. Everyone else is parked far away (x 700 or 1000) so nothing interferes. */
function tigerState(seed = 1): GameState {
  const state = createInitialState(makeSetup(seed), SIZE_PARAMS);
  state.players.forEach((p, i) => {
    p.x = i < 5 ? 700 : 1000;
    p.y = 30 + (i % 5) * 50;
  });
  const tiger = state.players[0];
  tiger.x = 100;
  tiger.y = MID_Y;
  tiger.facingX = 1;
  tiger.facingY = 0;
  state.ball.x = FIELD_W / 2;
  state.ball.y = MID_Y;
  return state;
}

function pressL(): InputFrame[] {
  const arr: InputFrame[] = [];
  arr[0] = { ...EMPTY_INPUT, l: true };
  return arr;
}

/** Xu Chu casts the guard (with no ball). Asserts it started. */
function castGuard(state: GameState): void {
  step(state, pressL());
  expect(state.players[0].tigerTicks).toBe(TIGER_GUARD_TICKS);
}

/** Puts the ball loose at (x, y) moving with (vx, vy), last touched by `lastTouch`. */
function loose(state: GameState, x: number, y: number, vx: number, vy: number, lastTouch: number): void {
  const b = state.ball;
  b.x = x;
  b.y = y;
  b.z = 0;
  b.vx = vx;
  b.vy = vy;
  b.vz = 0;
  b.ownerIdx = -1;
  b.lastTouchIdx = lastTouch;
  b.special = undefined;
  b.tiger = undefined;
}

/** Steps `n` ticks and returns every event tagged with the tick it was emitted on. */
function run(state: GameState, n: number, inputs: InputFrame[] = []): { tick: number; event: SimEvent }[] {
  const out: { tick: number; event: SimEvent }[] = [];
  for (let i = 0; i < n; i++) {
    const tick = state.tick;
    step(state, inputs);
    for (const event of state.events) out.push({ tick, event });
  }
  return out;
}

function typesOf(log: { event: SimEvent }[]): string[] {
  return log.map((e) => e.event.type);
}

describe('tiger guard cast', () => {
  it('casts with no ball, starts a 300-tick window, pays stamina, and sets the cooldown', () => {
    const state = tigerState();
    const p = state.players[0];
    const log = run(state, 1, pressL());
    expect(p.tigerTicks).toBe(TIGER_GUARD_TICKS);
    expect(p.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(p.stamina).toBeLessThan(MAX_STAMINA - SPECIAL_STAMINA_COST + 1);
    expect(typesOf(log)).toContain('tigerStart');
    expect(log.find((e) => e.event.type === 'special')).toBeDefined();
  });

  it('keeps Xu Chu acting normally during the window', () => {
    const state = tigerState();
    castGuard(state);
    const before = state.players[0].x;
    const walk: InputFrame[] = [{ ...EMPTY_INPUT, moveX: 1 }];
    run(state, 20, walk);
    expect(state.players[0].action).toBe('normal');
    expect(state.players[0].x).toBeGreaterThan(before);
  });

  it('runs out after exactly TIGER_GUARD_TICKS ticks', () => {
    const state = tigerState();
    castGuard(state);
    const log = run(state, TIGER_GUARD_TICKS - 1);
    expect(state.players[0].tigerTicks).toBe(1);
    expect(typesOf(log)).not.toContain('tigerRoar');
    run(state, 1);
    expect(state.players[0].tigerTicks).toBe(0);
  });
});

describe('tiger guard swallow', () => {
  it('swallows an on-target normal shot, holds it, then spits it 30 ticks later', () => {
    const state = tigerState();
    castGuard(state);
    loose(state, 220, MID_Y, -400, 0, 5);

    const first = run(state, 1);
    const swallow = first.find((e) => e.event.type === 'tigerSwallow');
    expect(swallow).toBeDefined();
    expect(state.ball.tiger?.phase).toBe('hold');
    expect(state.players[0].tigerTicks).toBe(0);

    const rest = run(state, TIGER_HOLD_TICKS + 5);
    const all = [...first, ...rest];
    const spit = all.find((e) => e.event.type === 'tigerSpit');
    expect(spit).toBeDefined();
    expect(spit!.tick - swallow!.tick).toBe(TIGER_HOLD_TICKS);
    expect(all.some((e) => e.event.type === 'goal')).toBe(false);
    expect(all.findIndex((e) => e.event.type === 'tigerSwallow')).toBeLessThan(
      all.findIndex((e) => e.event.type === 'tigerSpit'),
    );
  });

  it('holds the ball in the mouth in front of Xu Chu, unpickable, until the spit', () => {
    const state = tigerState();
    castGuard(state);
    loose(state, 220, MID_Y, -400, 0, 5);
    run(state, 1);
    const b = state.ball;
    expect(b.x).toBeCloseTo(state.players[0].x + 20, 5);
    expect(b.z).toBe(30);
    expect(b.vx).toBe(0);

    // Xu Chu is a GK standing in his area, so he could otherwise pick the ball up at this height.
    const log = run(state, TIGER_HOLD_TICKS - 1);
    expect(typesOf(log)).not.toContain('pickup');
    expect(state.ball.ownerIdx).toBe(-1);
    expect(state.ball.tiger?.phase).toBe('hold');
  });

  it('spits the ball toward the opponent goal, about TIGER_SPIT_DISTANCE from the spit point, and credits Xu Chu', () => {
    const state = tigerState();
    castGuard(state);
    loose(state, 220, MID_Y, -400, 0, 5);
    run(state, 1);
    let guard = 0;
    while (state.ball.tiger?.phase !== 'flight' && guard++ < 200) step(state, []);
    expect(state.ball.tiger?.phase).toBe('flight');
    const spitX = state.ball.x;
    expect(state.ball.lastTouchIdx).toBe(0);
    expect(state.ball.vx).toBeGreaterThan(0);

    guard = 0;
    while (state.ball.tiger !== undefined && guard++ < 300) step(state, []);
    expect(state.ball.tiger).toBeUndefined();
    expect(state.ball.z).toBe(0);
    expect(Math.abs(state.ball.x - spitX - TIGER_SPIT_DISTANCE)).toBeLessThanOrEqual(20);
    expect(state.ball.y).toBeCloseTo(MID_Y, 5);
  });

  it('swallows a special shot and ends it with specialEnd', () => {
    const state = tigerState();
    castGuard(state);
    loose(state, 220, MID_Y, -SPECIAL_STRAIGHT_SPEED, 0, 5);
    state.ball.z = 10;
    state.ball.special = {
      kind: 'straight',
      shooterIdx: 5,
      team: 1,
      ticks: 0,
      dirX: -1,
      dirY: 0,
      speed: SPECIAL_STRAIGHT_SPEED,
      hit: [],
      rolled: [],
    };
    const log = run(state, 1);
    expect(typesOf(log)).toEqual(expect.arrayContaining(['tigerSwallow', 'specialEnd']));
    expect(state.ball.special).toBeUndefined();
    expect(state.ball.tiger?.phase).toBe('hold');
  });

  it('does not swallow an off-target shot (the path misses the mouth)', () => {
    const state = tigerState();
    castGuard(state);
    loose(state, 200, 40, -400, 0, 5);
    const log = run(state, 10);
    expect(typesOf(log)).not.toContain('tigerSwallow');
    expect(state.ball.tiger).toBeUndefined();
  });

  it('does not swallow a teammate back-pass', () => {
    const state = tigerState();
    castGuard(state);
    loose(state, 220, MID_Y, -400, 0, 2);
    const log = run(state, 10);
    expect(typesOf(log)).not.toContain('tigerSwallow');
    expect(state.ball.tiger).toBeUndefined();
  });

  it('does not swallow a dribble (the ball is owned)', () => {
    const state = tigerState();
    castGuard(state);
    const dribbler = state.players[5];
    dribbler.x = 255;
    dribbler.y = MID_Y;
    dribbler.facingX = -1;
    dribbler.facingY = 0;
    dribbler.vx = -200;
    state.ball.ownerIdx = 5;
    state.ball.lastTouchIdx = 5;
    const log = run(state, 1);
    expect(typesOf(log)).not.toContain('tigerSwallow');
    expect(state.ball.ownerIdx).toBe(5);
  });

  it('does not swallow while Xu Chu is down', () => {
    const state = tigerState();
    castGuard(state);
    state.players[0].action = 'down';
    state.players[0].actionTimer = 100;
    loose(state, 220, MID_Y, -400, 0, 5);
    const log = run(state, 10);
    expect(typesOf(log)).not.toContain('tigerSwallow');
    expect(state.ball.tiger).toBeUndefined();
  });
});

describe('tiger ball hits', () => {
  it('hits each opponent once for 80% stamina and a 180-tick stun, never a teammate', () => {
    const state = tigerState();
    castGuard(state);
    // Ball passes over (540, 130) at height ~10-25, inside the hit reach. The teammate stands at the same spot,
    // so the spat ball would reach him too if teammates could be hit.
    state.players[5].x = 540;
    state.players[5].y = MID_Y + 10;
    state.players[2].x = 540;
    state.players[2].y = MID_Y - 10;
    loose(state, 220, MID_Y, -400, 0, 5);
    run(state, 1);

    let hit = false;
    let guard = 0;
    while (!hit && guard++ < 300) {
      hit = run(state, 1).some((e) => e.event.type === 'hit' && e.event.victimIdx === 5);
    }
    expect(hit).toBe(true);
    const victim = state.players[5];
    expect(victim.action).toBe('hitstun');
    expect(victim.actionTimer).toBe(TIGER_STUN_TICKS);
    expect(victim.stamina).toBeCloseTo(MAX_STAMINA - TIGER_BALL_STAMINA_RATIO * MAX_STAMINA, 5);

    const rest = run(state, 400);
    const hits = rest.filter((e) => e.event.type === 'hit');
    expect(hits.some((e) => e.event.type === 'hit' && e.event.victimIdx === 2)).toBe(false);
    expect(hits.some((e) => e.event.type === 'hit' && e.event.victimIdx === 5)).toBe(false);
    expect(state.players[2].stamina).toBeCloseTo(MAX_STAMINA, 5);
  });

  it('a spat ball down to ground height stuns for TIGER_STUN_TICKS then the victim recovers', () => {
    const state = tigerState();
    castGuard(state);
    state.players[5].x = 540;
    state.players[5].y = MID_Y;
    loose(state, 220, MID_Y, -400, 0, 5);
    run(state, 1);
    let guard = 0;
    while (state.players[5].action !== 'hitstun' && guard++ < 300) step(state, []);
    expect(state.players[5].action).toBe('hitstun');
    run(state, TIGER_STUN_TICKS - 1);
    expect(state.players[5].action).toBe('hitstun');
    run(state, 1);
    expect(state.players[5].action).toBe('normal');
  });
});

describe('tiger guard expiry roar', () => {
  it('knocks back opponents within 90 px in front, takes 10% stamina, and nothing else', () => {
    const state = tigerState();
    // Team 1 victim in front, in range.
    state.players[5].x = 160;
    state.players[5].y = MID_Y;
    // Team 1 player behind Xu Chu: never hit.
    state.players[6].x = 70;
    state.players[6].y = MID_Y;
    // Team 1 player in front but beyond 90 px: never hit.
    state.players[7].x = 200;
    state.players[7].y = MID_Y;
    // Teammate in front and in range: never hit.
    state.players[1].x = 150;
    state.players[1].y = MID_Y + 40;
    loose(state, FIELD_W / 2, MID_Y, 0, 0, -1);

    castGuard(state);
    const log = run(state, TIGER_GUARD_TICKS - 1);
    expect(typesOf(log)).not.toContain('tigerRoar');
    const roar = run(state, 1);
    const ev = roar.find((e) => e.event.type === 'tigerRoar');
    expect(ev).toBeDefined();
    expect(ev!.event).toEqual({ type: 'tigerRoar', playerIdx: 0, victimIdxs: [5] });
    expect(state.players[0].tigerTicks).toBe(0);
    expect(typesOf(roar)).not.toContain('tigerEnd');

    const knocked = state.players[5];
    expect(knocked.action).toBe('hitstun');
    expect(knocked.stamina).toBeCloseTo(MAX_STAMINA - TIGER_ROAR_STAMINA_RATIO * MAX_STAMINA, 5);
    expect(state.players[6].action).toBe('normal');
    expect(state.players[6].stamina).toBeCloseTo(MAX_STAMINA, 5);
    expect(state.players[7].action).toBe('normal');
    expect(state.players[7].stamina).toBeCloseTo(MAX_STAMINA, 5);
    expect(state.players[1].stamina).toBeCloseTo(MAX_STAMINA, 5);
  });

  it('a phase change ends the guard with tigerEnd and no roar', () => {
    const state = tigerState();
    state.players[5].x = 160;
    state.players[5].y = MID_Y;
    castGuard(state);
    state.match.clockTicks = 1;
    const log = run(state, 1);
    expect(state.match.phase).toBe('halftime');
    expect(state.players[0].tigerTicks).toBe(0);
    expect(log.find((e) => e.event.type === 'tigerEnd')?.event).toEqual({ type: 'tigerEnd', playerIdx: 0 });
    expect(typesOf(log)).not.toContain('tigerRoar');
    expect(state.players[5].stamina).toBeCloseTo(MAX_STAMINA, 5);
    expect(state.players[5].action).toBe('normal');
  });
});

describe('tiger guard determinism', () => {
  it('the same seed and inputs give the same state', () => {
    const scenario = (): GameState => {
      const state = tigerState(42);
      castGuard(state);
      loose(state, 220, MID_Y, -400, 0, 5);
      run(state, 150);
      return state;
    };
    const a = scenario();
    const b = scenario();
    expect(hashState(a)).toBe(hashState(b));
    expect(a.players[0].tigerTicks).toBe(0);
  });
});
