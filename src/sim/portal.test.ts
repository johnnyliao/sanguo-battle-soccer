import { describe, expect, it } from 'vitest';
import { RAW_CHARACTERS, getTeam } from '../data/characters';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import { specialDescription } from '../data/specialText';
import {
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  ICE_SLOW_MULT,
  PLAYER_BASE_SPEED,
  PLAYER_SPEED_PER_STAT,
  PORTAL_DOT_INTERVAL,
  PORTAL_DOT_RATIO,
  PORTAL_RADIUS,
  PORTAL_RING_RADIUS,
  PORTAL_SLOW_MULT,
  PORTAL_SUMMON_DELAY_TICKS,
  PORTAL_TICKS,
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
/** Team 0 slot 1 is Daqiao (DF). Her teammates are idx 0 (GK), 2, 3, 4. */
const DAQIAO = 1;
/** Stat 5 for every player: stamina pool 40 + 5 * 6, and max speed 60 + 5 * 8. */
const MAX_STAMINA = 70;
const MAX_SPEED = PLAYER_BASE_SPEED + 5 * PLAYER_SPEED_PER_STAT;
/** One pulse takes 5% of a stat-5 player's stamina. */
const PULSE_DAMAGE = PORTAL_DOT_RATIO * MAX_STAMINA;
const PULSE_TICKS = [30, 60, 90, 120];

const PORTAL_SPECIAL: CharacterDef['special'] = { name: '時空之門', kind: 'zigzag', mode: 'portal', noBall: true };

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

/** Team 0 slot 1 is Daqiao. Team 0 attacks +x. */
function makeSetup(seed: number): MatchSetup {
  const team0 = ROLES.map((role, i) => makeDef(`a${i}`, role, i === 1 ? PORTAL_SPECIAL : undefined));
  const team1 = ROLES.map((role, i) => makeDef(`b${i}`, role));
  return { seed, teams: [team0, team1], startInPlay: true };
}

/**
 * Daqiao at (300, mid) facing +x. Everyone else is parked far away at x 1000 on distinct rows, so nothing interferes
 * unless a test moves them. The ball lies unowned at x 600.
 */
function portalState(seed = 1): GameState {
  const state = createInitialState(makeSetup(seed), SIZE_PARAMS);
  state.players.forEach((p, i) => {
    p.x = 1000;
    p.y = 30 + i * 25;
    p.facingX = 1;
    p.facingY = 0;
  });
  const dq = state.players[DAQIAO];
  dq.x = 300;
  dq.y = MID_Y;
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

/** Daqiao casts the portal (L), then `extra` more ticks run. castTick is the tick of the cast. */
function castPortal(state: GameState, extra = 0): { log: Logged[]; castTick: number } {
  const castTick = state.tick;
  const log = run(state, 1, frames({ [DAQIAO]: input({ l: true }) }));
  expect(state.portals).toHaveLength(1);
  return { log: log.concat(run(state, extra)), castTick };
}

/** Offset from the cast: the cast tick is offset 1, matching the portal's tick counter. */
function offset(tick: number, castTick: number): number {
  return tick - castTick + 1;
}

describe('portal cast', () => {
  it('casts with no ball: field at the cast point, stamina paid, cooldown set, events emitted', () => {
    const state = portalState();
    const dq = state.players[DAQIAO];
    const { log } = castPortal(state);
    expect(state.ball.ownerIdx).toBe(-1);
    expect(state.portals).toEqual([{ id: 1, ownerIdx: DAQIAO, team: 0, x: 300, y: MID_Y, ticks: 1, summoned: false }]);
    expect(dq.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(dq.stamina).toBeCloseTo(MAX_STAMINA - SPECIAL_STAMINA_COST, 0);
    expect(ofType(log, 'portalStart').map((e) => e.event)).toEqual([
      { type: 'portalStart', playerIdx: DAQIAO, portalId: 1, x: 300, y: MID_Y, radius: PORTAL_RADIUS },
    ]);
    expect(ofType(log, 'special')).toHaveLength(1);
  });

  it('casts with the ball and she keeps it', () => {
    const state = portalState();
    state.ball.ownerIdx = DAQIAO;
    state.ball.lastTouchIdx = DAQIAO;
    castPortal(state);
    expect(state.portals).toHaveLength(1);
    expect(state.ball.ownerIdx).toBe(DAQIAO);
  });

  it('does not cast below the stamina cost, and not again during the cooldown', () => {
    const low = portalState();
    low.players[DAQIAO].stamina = SPECIAL_STAMINA_COST - 1;
    run(low, 1, frames({ [DAQIAO]: input({ l: true }) }));
    expect(low.portals).toHaveLength(0);

    const state = portalState();
    castPortal(state);
    run(state, 1);
    run(state, 1, frames({ [DAQIAO]: input({ l: true }) }));
    expect(state.portals).toHaveLength(1);
  });
});

describe('field position', () => {
  it('the field stays at the cast point while she moves', () => {
    const state = portalState();
    castPortal(state);
    run(state, 60, frames({ [DAQIAO]: input({ moveX: 1 }) }));
    const dq = state.players[DAQIAO];
    expect(dq.x).toBeGreaterThan(360);
    expect(state.portals[0]).toMatchObject({ x: 300, y: MID_Y });
  });
});

describe('summon', () => {
  it('does not summon before PORTAL_SUMMON_DELAY_TICKS (30) ticks', () => {
    const state = portalState();
    const mate = state.players[4];
    const { log } = castPortal(state, PORTAL_SUMMON_DELAY_TICKS - 2);
    expect(ofType(log, 'portalSummon')).toHaveLength(0);
    expect(mate.x).toBe(1000);
  });

  it('summons at tick 30 to a ring around her current position', () => {
    const state = portalState();
    castPortal(state, PORTAL_SUMMON_DELAY_TICKS - 2);
    // She moves away after the cast: the summon uses where she stands at tick 30.
    park(state, DAQIAO, 400, 200);
    const log = run(state, 1);
    expect(ofType(log, 'portalSummon')).toHaveLength(1);
    expect(state.portals[0].summoned).toBe(true);
    for (const idx of [2, 3, 4]) {
      const v = state.players[idx];
      const dist = Math.hypot(v.x - 400, v.y - 200);
      expect(dist).toBeCloseTo(PORTAL_RING_RADIUS, 5);
    }
    expect(ofType(log, 'portalArrive').map((e) => e.event.playerIdx)).toEqual([2, 3, 4]);
  });

  it('spaces the summoned teammates evenly, starting at facing + 90 degrees, in idx order', () => {
    const state = portalState();
    castPortal(state, PORTAL_SUMMON_DELAY_TICKS - 2);
    run(state, 1);
    // Facing +x, so the first mate sits at 90 degrees (directly below, +y), then 210 and 330 degrees.
    expect(state.players[2].x).toBeCloseTo(300, 5);
    expect(state.players[2].y).toBeCloseTo(MID_Y + PORTAL_RING_RADIUS, 5);
    const angle3 = Math.atan2(state.players[3].y - MID_Y, state.players[3].x - 300);
    expect(angle3).toBeCloseTo(Math.PI / 2 + (2 * Math.PI) / 3 - 2 * Math.PI, 5);
  });

  it('the summon event lists the summoned teammates', () => {
    const state = portalState();
    const { log } = castPortal(state, PORTAL_SUMMON_DELAY_TICKS - 2);
    expect(ofType(log, 'portalSummon').map((e) => e.event)).toEqual([]);
    const after = run(state, 1);
    expect(ofType(after, 'portalSummon').map((e) => e.event)).toEqual([
      { type: 'portalSummon', playerIdx: DAQIAO, portalId: 1, summonedIdxs: [2, 3, 4] },
    ]);
  });

  it('does not summon the goalkeeper', () => {
    const state = portalState();
    castPortal(state, PORTAL_SUMMON_DELAY_TICKS - 2);
    run(state, 1);
    expect(state.players[0].x).toBe(1000);
    expect(state.players[0].y).toBe(30);
  });

  it('does not summon a down or invincible teammate', () => {
    const state = portalState();
    state.players[2].action = 'down';
    state.players[2].actionTimer = 1000;
    // Sailing makes him invincible (a rampage without the ball ends at once).
    state.players[3].sailTicks = 240;
    // Far from everyone, so his hull neither crashes into anyone nor takes a passenger.
    park(state, 3, 150, 30);
    castPortal(state, PORTAL_SUMMON_DELAY_TICKS - 2);
    const log = run(state, 1);
    expect(state.players[2].x).toBe(1000);
    expect(state.players[3].x).toBe(150);
    expect(ofType(log, 'portalSummon')[0].event.summonedIdxs).toEqual([4]);
  });

  it('a summoned teammate who owns the ball keeps it and the ball moves with him', () => {
    const state = portalState();
    const carrier = state.players[4];
    carrier.facingX = 1;
    carrier.facingY = 0;
    park(state, 4, 1000);
    state.ball.ownerIdx = 4;
    state.ball.lastTouchIdx = 4;
    castPortal(state, PORTAL_SUMMON_DELAY_TICKS - 2);
    run(state, 1);
    expect(state.ball.ownerIdx).toBe(4);
    expect(state.ball.x).toBeCloseTo(carrier.x + carrier.facingX * (carrier.radius + DRIBBLE_OFFSET), 5);
    expect(state.ball.y).toBeCloseTo(carrier.y + carrier.facingY * (carrier.radius + DRIBBLE_OFFSET), 5);
  });
});

describe('slow inside the portal', () => {
  it('an opponent inside moves at 30% of his max speed', () => {
    const state = portalState();
    castPortal(state);
    park(state, 5, 340);
    run(state, 60, frames({ 5: input({ moveX: 1 }) }));
    expect(state.players[5].vx).toBeCloseTo(MAX_SPEED * PORTAL_SLOW_MULT, 2);
  });

  it('an opponent outside moves at full speed', () => {
    const state = portalState();
    castPortal(state);
    park(state, 5, 450);
    run(state, 60, frames({ 5: input({ moveX: 1 }) }));
    expect(state.players[5].vx).toBeCloseTo(MAX_SPEED, 2);
  });

  it('where an ice field and a portal both cover him, the lower multiplier applies', () => {
    const state = portalState();
    castPortal(state);
    state.iceFields.push({ id: 1, ownerIdx: 0, team: 0, x: 340, y: MID_Y, ticks: 1 });
    park(state, 5, 340);
    run(state, 60, frames({ 5: input({ moveX: 1 }) }));
    expect(state.players[5].vx).toBeCloseTo(MAX_SPEED * Math.min(ICE_SLOW_MULT, PORTAL_SLOW_MULT), 3);
  });
});

describe('pulses', () => {
  it('four pulses of 5% of maxStamina at ticks 30, 60, 90, 120 for an opponent who stays inside', () => {
    const state = portalState();
    park(state, 5, 340);
    const { log, castTick } = castPortal(state, PORTAL_TICKS - 1);
    const hits = ofType(log, 'hit').filter((h) => h.event.victimIdx === 5);
    expect(hits).toHaveLength(PULSE_TICKS.length);
    expect(hits.map((h) => offset(h.tick, castTick))).toEqual(PULSE_TICKS);
    for (const h of hits) {
      expect(h.event.attackerIdx).toBe(DAQIAO);
      expect(h.event.kind).toBe('special');
      expect(h.event.damage).toBeCloseTo(PULSE_DAMAGE, 6);
    }
    expect(PULSE_TICKS.length * PORTAL_DOT_RATIO).toBeCloseTo(0.2, 6);
    expect(PULSE_TICKS.every((t) => t % PORTAL_DOT_INTERVAL === 0)).toBe(true);
  });

  it('an opponent who empties his stamina on a pulse goes down for 1.5 s', () => {
    const state = portalState();
    park(state, 5, 340);
    state.players[5].stamina = 1;
    const { log, castTick } = castPortal(state, PORTAL_TICKS - 1);
    const downs = ofType(log, 'down').filter((d) => d.event.playerIdx === 5);
    expect(downs).toHaveLength(1);
    expect(offset(downs[0].tick, castTick)).toBe(30);
  });
});

describe('teammates and invincible players', () => {
  it('a teammate inside the portal takes no damage and is not slowed', () => {
    const state = portalState();
    park(state, 2, 330);
    park(state, 5, 340);
    const { log } = castPortal(state, PORTAL_TICKS - 1);
    expect(ofType(log, 'hit').some((h) => h.event.victimIdx === 2)).toBe(false);
    expect(ofType(log, 'hit').some((h) => h.event.victimIdx === DAQIAO)).toBe(false);
    expect(ofType(log, 'hit').filter((h) => h.event.victimIdx === 5)).toHaveLength(PULSE_TICKS.length);
    expect(state.players[2].stamina).toBeCloseTo(MAX_STAMINA, 6);
  });

  it('an invincible opponent inside the portal is not pulsed and not slowed', () => {
    const state = portalState();
    // Sailing makes him invincible. He stands 80 px out, clear of Daqiao's hull, so the sail does not crash into her.
    park(state, 5, 380);
    state.players[5].sailTicks = 240;
    const { log } = castPortal(state, PORTAL_TICKS - 1);
    expect(ofType(log, 'hit').some((h) => h.event.victimIdx === 5)).toBe(false);

    const mover = portalState();
    const m = mover.players[5];
    park(mover, 5, 380);
    m.sailTicks = 240;
    castPortal(mover);
    run(mover, 60, frames({ 5: input({ moveX: 1 }) }));
    // The sail itself is 1.5x, so anything above the plain max speed shows he was not slowed.
    expect(m.vx).toBeGreaterThan(MAX_SPEED);
  });

  it('the caster herself keeps full speed inside her own portal', () => {
    const state = portalState();
    castPortal(state);
    run(state, 60, frames({ [DAQIAO]: input({ moveX: 1 }) }));
    expect(state.players[DAQIAO].vx).toBeCloseTo(MAX_SPEED, 2);
  });
});

describe('ending', () => {
  it('ends after PORTAL_TICKS (120 ticks) and emits portalEnd on the last one', () => {
    const state = portalState();
    const { castTick } = castPortal(state, PORTAL_TICKS - 2);
    expect(state.portals).toHaveLength(1);
    const log = run(state, 1);
    expect(state.portals).toHaveLength(0);
    const ends = ofType(log, 'portalEnd');
    expect(ends.map((e) => e.event.portalId)).toEqual([1]);
    expect(offset(ends[0].tick, castTick)).toBe(PORTAL_TICKS);
  });

  it('is cleared with portalEnd when the phase leaves play, and pulses stop', () => {
    const state = portalState();
    park(state, 5, 340);
    castPortal(state, 10);
    state.match.phase = 'goal';
    state.match.phaseTimer = 1000;
    const log = run(state, 1);
    expect(state.portals).toHaveLength(0);
    expect(ofType(log, 'portalEnd').map((e) => e.event.portalId)).toEqual([1]);
    const after = run(state, 60);
    expect(ofType(after, 'hit')).toHaveLength(0);
  });
});

describe('roster and text', () => {
  it('wu is GK sunquan, DF daqiao, MF zhouyu, MF xiaoqiao, FW sunce, no taishici', () => {
    const wu = getTeam('wu');
    expect(wu.map((d) => d.id)).toEqual(['sunquan', 'daqiao', 'zhouyu', 'xiaoqiao', 'sunce']);
    expect(wu.map((d) => d.role)).toEqual(ROLES);
    expect(RAW_CHARACTERS.some((d) => d.id === 'taishici')).toBe(false);
  });

  it('daqiao is a medium defender with the portal special, usable without the ball', () => {
    const dq = RAW_CHARACTERS.find((d) => d.id === 'daqiao');
    expect(dq?.name).toBe('大喬');
    expect(dq?.country).toBe('wu');
    expect(dq?.role).toBe('DF');
    expect(dq?.size).toBe('M');
    expect(dq?.stats).toEqual({ power: 5, speed: 6, stamina: 7, technique: 6, defense: 8 });
    expect(dq?.special).toEqual({ name: '時空之門', kind: 'zigzag', mode: 'portal', noBall: true });
  });

  it('describes the portal with a with-or-without-ball condition within 30 characters', () => {
    const dq = RAW_CHARACTERS.find((d) => d.id === 'daqiao');
    if (!dq) throw new Error('daqiao missing');
    const d = specialDescription(dq);
    expect(d.condition).toBe('持球或不持球');
    expect(d.effect.length).toBeLessThanOrEqual(30);
    expect(d.effect).toContain('緩速70%');
  });
});
