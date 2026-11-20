import { describe, expect, it } from 'vitest';
import { RAW_CHARACTERS, getTeam } from '../data/characters';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import { specialDescription } from '../data/specialText';
import {
  DASH_MULT,
  DOWN_TICKS_EXHAUSTED,
  EMPTY_INPUT,
  FIELD_D,
  ICE_DOT_RATIO,
  ICE_RADIUS,
  ICE_SLOW_MULT,
  ICE_TICKS,
  PLAYER_BASE_SPEED,
  PLAYER_SPEED_PER_STAT,
  SPECIAL_COOLDOWN_TICKS,
  SPECIAL_STAMINA_COST,
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
const ZHEN_JI = 0;
/** Stat 5 for every player: stamina pool 40 + 5 * 6, and max speed 60 + 5 * 8. */
const MAX_STAMINA = 70;
const MAX_SPEED = PLAYER_BASE_SPEED + 5 * PLAYER_SPEED_PER_STAT;
/** One pulse takes 5% of a stat-5 player's stamina. */
const PULSE_DAMAGE = ICE_DOT_RATIO * MAX_STAMINA;
const PULSE_TICKS = [30, 60, 90, 120, 150, 180, 210, 240];

const ICE_SPECIAL: CharacterDef['special'] = { name: '冰雨招來', kind: 'zigzag', mode: 'icefield', noBall: true };

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

/** Team 0 slot 0 is Zhen Ji. Team 0 attacks +x. */
function makeSetup(seed: number): MatchSetup {
  const team0 = ROLES.map((role, i) => makeDef(`a${i}`, role, i === 0 ? ICE_SPECIAL : undefined));
  const team1 = ROLES.map((role, i) => makeDef(`b${i}`, role));
  return { seed, teams: [team0, team1], startInPlay: true };
}

/**
 * Zhen Ji at (300, mid) facing +x. Everyone else is parked far away at x 1000 on distinct rows, so nothing interferes
 * unless a test moves them. The ball lies unowned at x 600.
 */
function iceState(seed = 1): GameState {
  const state = createInitialState(makeSetup(seed), SIZE_PARAMS);
  state.players.forEach((p, i) => {
    p.x = 1000;
    p.y = 30 + i * 25;
  });
  const zj = state.players[ZHEN_JI];
  zj.x = 300;
  zj.y = MID_Y;
  zj.facingX = 1;
  zj.facingY = 0;
  state.ball.x = 600;
  state.ball.y = MID_Y;
  return state;
}

function park(state: GameState, idx: number, x: number, y: number = MID_Y): void {
  state.players[idx].x = x;
  state.players[idx].y = y;
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

/** Zhen Ji casts the ice field (L with no ball), then `extra` more ticks run. castTick is the tick of the cast. */
function castIce(state: GameState, extra = 0): { log: Logged[]; castTick: number } {
  const castTick = state.tick;
  const log = run(state, 1, frames({ [ZHEN_JI]: input({ l: true }) }));
  expect(state.iceFields).toHaveLength(1);
  return { log: log.concat(run(state, extra)), castTick };
}

/** Offset from the cast: the cast tick is offset 1, matching the field's tick counter. */
function offset(tick: number, castTick: number): number {
  return tick - castTick + 1;
}

describe('icefield cast', () => {
  it('casts with no ball: field at the cast point, stamina paid, cooldown set, events emitted', () => {
    const state = iceState();
    const zj = state.players[ZHEN_JI];
    const { log } = castIce(state);
    expect(state.ball.ownerIdx).toBe(-1);
    expect(state.iceFields).toEqual([{ id: 1, ownerIdx: ZHEN_JI, team: 0, x: 300, y: MID_Y, ticks: 1 }]);
    expect(zj.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(zj.stamina).toBeCloseTo(MAX_STAMINA - SPECIAL_STAMINA_COST, 0);
    expect(ofType(log, 'iceStart').map((e) => e.event)).toEqual([
      { type: 'iceStart', playerIdx: ZHEN_JI, fieldId: 1, x: 300, y: MID_Y, radius: ICE_RADIUS },
    ]);
    expect(ofType(log, 'special')).toHaveLength(1);
  });

  it('casts with the ball and she keeps it', () => {
    const state = iceState();
    state.ball.ownerIdx = ZHEN_JI;
    state.ball.lastTouchIdx = ZHEN_JI;
    castIce(state);
    expect(state.iceFields).toHaveLength(1);
    expect(state.ball.ownerIdx).toBe(ZHEN_JI);
  });

  it('does not cast below the stamina cost, and not again during the cooldown', () => {
    const low = iceState();
    low.players[ZHEN_JI].stamina = SPECIAL_STAMINA_COST - 1;
    run(low, 1, frames({ [ZHEN_JI]: input({ l: true }) }));
    expect(low.iceFields).toHaveLength(0);

    const state = iceState();
    castIce(state);
    run(state, 1);
    run(state, 1, frames({ [ZHEN_JI]: input({ l: true }) }));
    expect(state.iceFields).toHaveLength(1);
  });
});

describe('field position', () => {
  it('the field stays at the cast point while she moves', () => {
    const state = iceState();
    castIce(state);
    run(state, 60, frames({ [ZHEN_JI]: input({ moveX: 1 }) }));
    const zj = state.players[ZHEN_JI];
    expect(zj.x).toBeGreaterThan(360);
    expect(state.iceFields[0]).toMatchObject({ x: 300, y: MID_Y });
  });
});

describe('slow inside the field', () => {
  it('an opponent inside moves at 15% of his max speed', () => {
    const state = iceState();
    castIce(state);
    park(state, 5, 340);
    run(state, 60, frames({ 5: input({ moveX: 1 }) }));
    expect(state.players[5].vx).toBeCloseTo(MAX_SPEED * ICE_SLOW_MULT, 3);
  });

  it('an opponent outside moves at full speed', () => {
    const state = iceState();
    castIce(state);
    park(state, 5, 450);
    run(state, 60, frames({ 5: input({ moveX: 1 }) }));
    expect(state.players[5].vx).toBeCloseTo(MAX_SPEED, 2);
  });

  it('speed is restored on the tick he leaves the field', () => {
    const state = iceState();
    castIce(state);
    park(state, 5, 340);
    run(state, 60, frames({ 5: input({ moveX: 1 }) }));
    expect(state.players[5].vx).toBeCloseTo(MAX_SPEED * ICE_SLOW_MULT, 3);

    park(state, 5, 480);
    run(state, 1, frames({ 5: input({ moveX: 1 }) }));
    expect(state.players[5].vx).toBeGreaterThan(25);
    run(state, 60, frames({ 5: input({ moveX: 1 }) }));
    expect(state.players[5].vx).toBeCloseTo(MAX_SPEED, 2);
  });

  it('dash speed is slowed too', () => {
    const state = iceState();
    castIce(state);
    park(state, 5, 340);
    run(state, 60, frames({ 5: input({ moveX: 1, dash: true }) }));
    expect(state.players[5].vx).toBeCloseTo(MAX_SPEED * DASH_MULT * ICE_SLOW_MULT, 3);
  });
});

describe('pulses', () => {
  it('eight pulses of 5% of maxStamina at ticks 30, 60, ..., 240 for an opponent who stays inside', () => {
    const state = iceState();
    park(state, 5, 340);
    const { log, castTick } = castIce(state, ICE_TICKS - 1);
    const pulses = ofType(log, 'icePulse');
    expect(pulses.map((p) => offset(p.tick, castTick))).toEqual(PULSE_TICKS);
    expect(pulses.every((p) => p.event.victimIdxs.length === 1 && p.event.victimIdxs[0] === 5)).toBe(true);

    const hits = ofType(log, 'hit').filter((h) => h.event.victimIdx === 5);
    expect(hits).toHaveLength(PULSE_TICKS.length);
    for (const h of hits) {
      expect(h.event.attackerIdx).toBe(ZHEN_JI);
      expect(h.event.kind).toBe('special');
      expect(h.event.damage).toBeCloseTo(PULSE_DAMAGE, 6);
    }
    expect(hits.map((h) => offset(h.tick, castTick))).toEqual(PULSE_TICKS);
  });

  it('the pulse takes the stamina on its tick (net of the usual regen)', () => {
    const state = iceState();
    park(state, 5, 340);
    state.players[5].stamina = 50;
    castIce(state, 28);
    const before = state.players[5].stamina;
    run(state, 1);
    const after = state.players[5].stamina;
    expect(after - before).toBeCloseTo(-PULSE_DAMAGE + (4 * 1) / 60, 6);
  });

  it('an opponent who empties his stamina on a pulse goes down for 1.5 s', () => {
    const state = iceState();
    park(state, 5, 340);
    state.players[5].stamina = 1;
    const { log, castTick } = castIce(state, ICE_TICKS - 1);
    const downs = ofType(log, 'down').filter((d) => d.event.playerIdx === 5);
    expect(downs).toHaveLength(1);
    expect(offset(downs[0].tick, castTick)).toBe(30);
    // Down players are skipped by later pulses.
    const pulseAt60 = ofType(log, 'icePulse').find((p) => offset(p.tick, castTick) === 60);
    expect(pulseAt60?.event.victimIdxs).toEqual([]);
    // He gets up after the down timer (tick 120 of the field) and can be pulsed again; the hits before that count once.
    const hitsWhileDown = ofType(log, 'hit').filter(
      (h) => h.event.victimIdx === 5 && offset(h.tick, castTick) < 30 + DOWN_TICKS_EXHAUSTED,
    );
    expect(hitsWhileDown).toHaveLength(1);
  });

  it('an opponent who goes down on a pulse keeps the 1.5 s down timer', () => {
    const state = iceState();
    park(state, 5, 340);
    state.players[5].stamina = 1;
    castIce(state, 29);
    expect(state.players[5].action).toBe('down');
    expect(state.players[5].actionTimer).toBe(DOWN_TICKS_EXHAUSTED);
  });
});

describe('teammates and invincible players', () => {
  it('a teammate inside the field is never pulsed and keeps full speed', () => {
    const state = iceState();
    park(state, 1, 330);
    park(state, 5, 340);
    const { log } = castIce(state, ICE_TICKS - 1);
    for (const p of ofType(log, 'icePulse')) expect(p.event.victimIdxs).toEqual([5]);
    expect(ofType(log, 'hit').some((h) => h.event.victimIdx === 1)).toBe(false);
    expect(state.players[1].stamina).toBeCloseTo(MAX_STAMINA, 6);

    const mover = iceState();
    park(mover, 1, 330);
    castIce(mover);
    run(mover, 60, frames({ 1: input({ moveX: 1 }) }));
    expect(mover.players[1].vx).toBeCloseTo(MAX_SPEED, 2);
  });

  it('an invincible opponent inside the field is not pulsed and not slowed', () => {
    const state = iceState();
    const v = state.players[5];
    park(state, 5, 340);
    v.specialNoBall = true;
    v.rampageTicks = 1000;
    const { log } = castIce(state, ICE_TICKS - 1);
    expect(ofType(log, 'hit').some((h) => h.event.victimIdx === 5)).toBe(false);
    expect(ofType(log, 'icePulse').every((p) => p.event.victimIdxs.length === 0)).toBe(true);

    const mover = iceState();
    const m = mover.players[5];
    park(mover, 5, 340);
    m.specialNoBall = true;
    m.rampageTicks = 1000;
    castIce(mover);
    run(mover, 60, frames({ 5: input({ moveX: 1 }) }));
    expect(m.vx).toBeGreaterThan(MAX_SPEED);
  });
});

describe('ending', () => {
  it('ends after ICE_TICKS (240 ticks) and emits iceEnd on the last one', () => {
    const state = iceState();
    const { castTick } = castIce(state, ICE_TICKS - 2);
    expect(state.iceFields).toHaveLength(1);
    const log = run(state, 1);
    expect(state.iceFields).toHaveLength(0);
    const ends = ofType(log, 'iceEnd');
    expect(ends.map((e) => e.event.fieldId)).toEqual([1]);
    expect(offset(ends[0].tick, castTick)).toBe(ICE_TICKS);
  });

  it('is cleared with iceEnd when the phase leaves play', () => {
    const state = iceState();
    castIce(state, 10);
    state.match.phase = 'goal';
    state.match.phaseTimer = 1000;
    const log = run(state, 1);
    expect(state.iceFields).toHaveLength(0);
    expect(ofType(log, 'iceEnd').map((e) => e.event.fieldId)).toEqual([1]);
    const after = run(state, 60);
    expect(ofType(after, 'icePulse')).toHaveLength(0);
  });
});

describe('roster and text', () => {
  it('wei team is xuchu GK, caocao DF, zhenji MF, simayi MF, zhangliao FW, no dianwei', () => {
    const wei = getTeam('wei');
    expect(wei.map((d) => d.id)).toEqual(['xuchu', 'caocao', 'zhenji', 'simayi', 'zhangliao']);
    expect(wei.map((d) => d.role)).toEqual(['GK', 'DF', 'MF', 'MF', 'FW']);
    expect(RAW_CHARACTERS.some((d) => d.id === 'dianwei')).toBe(false);
    expect(wei.some((d) => d.id === 'dianwei')).toBe(false);
    const zhenji = RAW_CHARACTERS.find((d) => d.id === 'zhenji');
    expect(zhenji?.special).toEqual({ name: '冰雨招來', kind: 'zigzag', mode: 'icefield', noBall: true });
    expect(specialDescription(zhenji!)).toEqual({
      condition: '持球或不持球',
      effect: '原地冰雨4秒(半徑110)，內敵緩速85%、每0.5秒扣5%',
    });
  });
});
