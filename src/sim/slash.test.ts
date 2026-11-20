import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  DOWN_TICKS_EXHAUSTED,
  EMPTY_INPUT,
  FIELD_D,
  SLASH_DAMAGE_RATIO,
  SLASH_FIRST_DELAY,
  SLASH_HEAL_RATIO,
  SLASH_HITSTUN_TICKS,
  SLASH_TICKS,
  SPECIAL_COOLDOWN_TICKS,
  SPECIAL_STAMINA_COST,
  createInitialState,
  hashState,
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
const MID_Y = FIELD_D / 2;
/** Cao Cao's stamina pool at stat 5 (STAMINA_BASE 40 + 5 * STAMINA_PER_STAT 6). */
const MAX_STAMINA = 70;

const SLASH_SPECIAL: CharacterDef['special'] = { name: '霸刀連斬', kind: 'zigzag', mode: 'slash', noBall: true };

type Logged = { tick: number; event: SimEvent };

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

/** Team 0 slot 0 is Cao Cao (GK slot aside, role is only a label here). Team 0 attacks +x. */
function makeSetup(seed: number): MatchSetup {
  const team0 = ROLES.map((role, i) => makeDef(`a${i}`, role, i === 0 ? SLASH_SPECIAL : undefined));
  const team1 = ROLES.map((role, i) => makeDef(`b${i}`, role));
  return { seed, teams: [team0, team1], startInPlay: true };
}

/**
 * Cao Cao at (300, mid) facing +x. Everyone else is parked far away at x 1000 on distinct rows, so nothing interferes
 * unless a test moves them. The ball lies unowned at mid-field.
 */
function slashState(seed = 1): GameState {
  const state = createInitialState(makeSetup(seed), SIZE_PARAMS);
  state.players.forEach((p, i) => {
    p.x = 1000;
    p.y = 30 + i * 25;
  });
  const cao = state.players[0];
  cao.x = 300;
  cao.y = MID_Y;
  cao.facingX = 1;
  cao.facingY = 0;
  state.ball.x = 600;
  state.ball.y = MID_Y;
  return state;
}

function park(state: GameState, idx: number, x: number, y: number = MID_Y): void {
  state.players[idx].x = x;
  state.players[idx].y = y;
}

function pressL(): InputFrame[] {
  return [{ ...EMPTY_INPUT, l: true }];
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

/** Steps until an event of `type` is emitted (inclusive), returning every event logged on the way. */
function runUntil(state: GameState, type: SimEvent['type'], max = 200): Logged[] {
  const out: Logged[] = [];
  for (let i = 0; i < max; i++) {
    const tick = state.tick;
    step(state, []);
    for (const event of state.events) out.push({ tick, event });
    if (state.events.some((e) => e.type === type)) return out;
  }
  throw new Error(`no ${type} within ${max} ticks`);
}

function ofType<T extends SimEvent['type']>(
  log: Logged[],
  type: T,
): { tick: number; event: Extract<SimEvent, { type: T }> }[] {
  return log.filter(
    (e): e is { tick: number; event: Extract<SimEvent, { type: T }> } => e.event.type === type,
  );
}

/** Cao Cao casts the slash (with no ball). Asserts it started. */
function castSlash(state: GameState): void {
  run(state, 1, pressL());
  expect(state.players[0].slashTicks).toBe(SLASH_TICKS);
}

describe('slash cast', () => {
  it('casts with no ball: starts the buff, pays stamina, sets the cooldown, and emits slashStart', () => {
    const state = slashState();
    const cao = state.players[0];
    const log = run(state, 1, pressL());
    expect(state.ball.ownerIdx).toBe(-1);
    expect(cao.slashTicks).toBe(SLASH_TICKS);
    expect(cao.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(cao.stamina).toBeCloseTo(MAX_STAMINA - SPECIAL_STAMINA_COST, 0);
    expect(ofType(log, 'slashStart').map((e) => e.event.playerIdx)).toEqual([0]);
    expect(ofType(log, 'special')).toHaveLength(1);
  });

  it('is not invincible while the buff runs', () => {
    const state = slashState();
    castSlash(state);
    expect(isInvincible(state.players[0])).toBe(false);
  });
});

describe('blade wave timing', () => {
  it('fires 10 waves at 30, 60, ..., 300 ticks after the cast, then ends the buff', () => {
    const state = slashState();
    castSlash(state);
    const log = run(state, SLASH_TICKS);
    const fires = ofType(log, 'slashWave').map((e) => e.tick);
    expect(fires).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
    expect(ofType(log, 'slashEnd').map((e) => e.tick)).toEqual([300]);
    expect(state.players[0].slashTicks).toBe(0);
  });

  it('a slash that falls while he is not normal is lost and the timer keeps running', () => {
    const state = slashState();
    const cao = state.players[0];
    castSlash(state);
    run(state, SLASH_FIRST_DELAY - 1);
    cao.action = 'hitstun';
    cao.actionTimer = 1000;
    const skipped = run(state, 1);
    expect(ofType(skipped, 'slashWave')).toHaveLength(0);
    cao.action = 'normal';
    cao.actionTimer = 0;
    const log = run(state, SLASH_TICKS - SLASH_FIRST_DELAY);
    expect(ofType(log, 'slashWave').map((e) => e.tick)).toEqual([60, 90, 120, 150, 180, 210, 240, 270, 300]);
    expect(cao.slashTicks).toBe(0);
  });
});

describe('blade wave aim', () => {
  it('aims at the nearest opponent on his facing side, ignoring teammates and opponents behind', () => {
    const state = slashState();
    park(state, 1, 330, MID_Y + 5); // teammate, nearest overall: ignored
    park(state, 6, 250, MID_Y); // opponent behind him, nearer than the target: ignored
    park(state, 5, 360, MID_Y + 60); // target: 60 px ahead and 60 px to the side
    castSlash(state);
    const log = run(state, SLASH_FIRST_DELAY);
    const fire = ofType(log, 'slashWave')[0].event;
    expect(fire.playerIdx).toBe(0);
    expect(fire.x).toBe(300);
    expect(fire.dirX).toBeCloseTo(Math.SQRT1_2, 6);
    expect(fire.dirY).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('flies straight ahead when no opponent is on his facing side', () => {
    const state = slashState();
    for (let i = 5; i < 10; i++) park(state, i, 100, 30 + (i - 5) * 50);
    castSlash(state);
    const fire = ofType(run(state, SLASH_FIRST_DELAY), 'slashWave')[0].event;
    expect(fire.dirX).toBe(1);
    expect(fire.dirY).toBe(0);
  });

  it('uses the facing side when he faces left', () => {
    const state = slashState();
    const cao = state.players[0];
    cao.facingX = -1;
    park(state, 5, 100);
    castSlash(state);
    const fire = ofType(run(state, SLASH_FIRST_DELAY), 'slashWave')[0].event;
    expect(fire.dirX).toBe(-1);
    expect(fire.dirY).toBe(0);
  });

  it('falls back to his attack direction when facingX is 0', () => {
    const state = slashState();
    const cao = state.players[0];
    cao.facingX = 0;
    cao.facingY = 1;
    for (let i = 5; i < 10; i++) park(state, i, 100, 30 + (i - 5) * 50);
    castSlash(state);
    const fire = ofType(run(state, SLASH_FIRST_DELAY), 'slashWave')[0].event;
    expect(fire.dirX).toBe(1);
    expect(fire.dirY).toBe(0);
  });
});

describe('blade wave hits', () => {
  it('hits the first opponent in its path only, and the wave ends there', () => {
    const state = slashState();
    park(state, 5, 340);
    park(state, 6, 370);
    castSlash(state);
    const log = runUntil(state, 'slashWaveEnd');
    const ends = ofType(log, 'slashWaveEnd');
    expect(ends).toHaveLength(1);
    expect(ends[0].event.hitIdx).toBe(5);
    expect(ofType(log, 'hit').map((e) => e.event.victimIdx)).toEqual([5]);
    expect(state.players[6].stamina).toBe(MAX_STAMINA);
    expect(state.waves).toHaveLength(0);
  });

  it('a hit takes 5% of the victim max stamina, stuns him for 18 ticks, and heals Cao Cao 5%', () => {
    const state = slashState();
    const cao = state.players[0];
    const victim = state.players[5];
    park(state, 5, 340);
    castSlash(state);
    const log = runUntil(state, 'slashWaveEnd');
    const hit = ofType(log, 'hit')[0].event;
    expect(hit.attackerIdx).toBe(0);
    expect(hit.kind).toBe('special');
    expect(hit.damage).toBeCloseTo(SLASH_DAMAGE_RATIO * MAX_STAMINA, 6);
    expect(victim.stamina).toBeCloseTo(MAX_STAMINA - SLASH_DAMAGE_RATIO * MAX_STAMINA, 6);
    expect(victim.action).toBe('hitstun');
    expect(victim.actionTimer).toBe(SLASH_HITSTUN_TICKS);
    const heal = ofType(log, 'slashHeal')[0].event;
    expect(heal.playerIdx).toBe(0);
    expect(heal.amount).toBeCloseTo(SLASH_HEAL_RATIO * MAX_STAMINA, 6);
    expect(cao.stamina).toBeGreaterThan(MAX_STAMINA - SPECIAL_STAMINA_COST);
  });

  it('Cao Cao heals only up to his max stamina', () => {
    const state = slashState();
    const cao = state.players[0];
    park(state, 5, 340);
    castSlash(state);
    cao.stamina = MAX_STAMINA - 1;
    const log = runUntil(state, 'slashWaveEnd');
    expect(cao.stamina).toBe(MAX_STAMINA);
    expect(ofType(log, 'slashHeal')[0].event.amount).toBeLessThan(SLASH_HEAL_RATIO * MAX_STAMINA);
  });

  it('the victim keeps the ball he holds', () => {
    const state = slashState();
    park(state, 5, 340);
    state.ball.ownerIdx = 5;
    state.ball.lastTouchIdx = 5;
    castSlash(state);
    const log = runUntil(state, 'slashWaveEnd');
    expect(ofType(log, 'hit')).toHaveLength(1);
    expect(state.ball.ownerIdx).toBe(5);
    expect(ofType(log, 'looseBall')).toHaveLength(0);
  });

  it('skips teammates and opponents that are invincible, down, or recovering', () => {
    const state = slashState();
    park(state, 1, 320); // teammate in the path
    park(state, 5, 345); // invincible (rampaging, no-ball so the rampage holds)
    state.players[5].specialNoBall = true;
    state.players[5].rampageTicks = 1000;
    park(state, 6, 355); // down
    state.players[6].action = 'down';
    state.players[6].actionTimer = 1000;
    park(state, 7, 368); // recovering
    state.players[7].action = 'recover';
    state.players[7].actionTimer = 1000;
    park(state, 8, 390); // the only valid victim
    castSlash(state);
    const log = runUntil(state, 'slashWaveEnd');
    expect(ofType(log, 'slashWaveEnd')[0].event.hitIdx).toBe(8);
    expect(state.players[1].stamina).toBe(MAX_STAMINA);
    expect(state.players[5].stamina).toBe(MAX_STAMINA);
    expect(state.players[6].stamina).toBe(MAX_STAMINA);
    expect(state.players[7].stamina).toBe(MAX_STAMINA);
    expect(state.players[8].stamina).toBeLessThan(MAX_STAMINA);
  });

  it('an opponent 150 px away is out of range: the wave ends at 120 px with no hit', () => {
    const state = slashState();
    const victim = state.players[5];
    park(state, 5, 450);
    castSlash(state);
    const log = runUntil(state, 'slashWaveEnd');
    const end = ofType(log, 'slashWaveEnd')[0].event;
    expect(end.hitIdx).toBe(-1);
    expect(end.x).toBeGreaterThanOrEqual(300 + 120 - 0.01);
    expect(end.x).toBeLessThan(300 + 120 + 9);
    expect(ofType(log, 'hit')).toHaveLength(0);
    expect(victim.stamina).toBe(MAX_STAMINA);
    expect(victim.action).toBe('normal');
  });

  it('an exhausted victim goes down for DOWN_TICKS_EXHAUSTED', () => {
    const state = slashState();
    const victim = state.players[5];
    park(state, 5, 340);
    victim.stamina = 0.5;
    castSlash(state);
    const log = runUntil(state, 'slashWaveEnd');
    expect(victim.stamina).toBe(0);
    expect(victim.action).toBe('down');
    expect(victim.actionTimer).toBe(DOWN_TICKS_EXHAUSTED);
    expect(ofType(log, 'down').map((e) => e.event.playerIdx)).toEqual([5]);
  });
});

describe('buff control and end', () => {
  it('he can move and keep dribbling during the buff, and J still works', () => {
    const state = slashState();
    const cao = state.players[0];
    state.ball.ownerIdx = 0;
    state.ball.lastTouchIdx = 0;
    castSlash(state);
    const x0 = cao.x;
    run(state, 20, [{ ...EMPTY_INPUT, moveX: 1 }]);
    expect(cao.action).toBe('normal');
    expect(cao.x).toBeGreaterThan(x0);
    expect(state.ball.ownerIdx).toBe(0);
    expect(cao.slashTicks).toBeGreaterThan(0);
    run(state, 1, [{ ...EMPTY_INPUT, j: true }]);
    expect(cao.action).toBe('charge');
    expect(state.ball.ownerIdx).toBe(0);
  });

  it('the buff and every blade wave are cleared when the phase leaves play', () => {
    const state = slashState();
    const cao = state.players[0];
    castSlash(state);
    run(state, SLASH_FIRST_DELAY);
    expect(state.waves).toHaveLength(1);
    state.match.phase = 'goal';
    state.match.phaseTimer = 1000;
    const log = run(state, 1);
    expect(state.waves).toHaveLength(0);
    expect(cao.slashTicks).toBe(0);
    expect(ofType(log, 'slashEnd').map((e) => e.event.playerIdx)).toEqual([0]);
    expect(ofType(log, 'slashWaveEnd').map((e) => e.event.hitIdx)).toEqual([-1]);
    const after = run(state, 60);
    expect(ofType(after, 'slashWave')).toHaveLength(0);
  });
});

describe('determinism', () => {
  function playOut(): { hash: string; events: string } {
    const state = slashState(7);
    park(state, 5, 340);
    park(state, 6, 420, MID_Y + 40);
    const events: SimEvent[] = [];
    for (let i = 0; i < 400; i++) {
      const frame: InputFrame = { ...EMPTY_INPUT, l: i === 0, moveY: i % 120 < 60 ? 1 : -1 };
      step(state, [frame]);
      events.push(...state.events);
    }
    return { hash: hashState(state), events: JSON.stringify(events) };
  }

  it('the same setup gives the same events and state hash', () => {
    const a = playOut();
    const b = playOut();
    expect(a.events).toContain('slashWave');
    expect(a.events).toBe(b.events);
    expect(a.hash).toBe(b.hash);
  });
});
