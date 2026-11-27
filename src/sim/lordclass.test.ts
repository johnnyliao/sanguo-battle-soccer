import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, LordClass, Role, SizeParams, SpecialKind } from '../data/types';
import { computeAIInputs, createAIState } from '../ai/ai';
import { defaultFieldFor } from './field';
import { floor } from './num';
import {
  EMPTY_INPUT,
  FIELD_D,
  LORD_MENGJIANG_CD_CUT_TICKS,
  LORD_PASS_BOOST_TICKS,
  LORD_SHIELD_RECHARGE_TICKS,
  LORD_TIEBI_HOLD_TICKS,
  LORD_TIEBI_RALLY_TICKS,
  LORD_TIEBI_RALLY_WINDOW,
  SPECIAL_COOLDOWN_TICKS,
  applySpecialHit,
  createInitialState,
  step,
  type GameState,
  type InputFrame,
  type MatchSetup,
  type Player,
  type SimEvent,
} from './index';

const SIZE_PARAMS: Record<BodySize, SizeParams> = {
  S: { radius: 7, mass: 0.8 },
  M: { radius: 9, mass: 1.0 },
  L: { radius: 12, mass: 1.4 },
};

const MID_Y = FIELD_D / 2;
const LORD_X = 300;
/** Team 0 slot 0 is the lord (idx 0). Team 1 slot 0 is idx 5, the enemy used as attacker or victim. */
const E0 = 5;
const ENEMY_ROLES: Role[] = ['MF', 'DF', 'MF', 'MF', 'FW'];

type Logged = { tick: number; event: SimEvent };

function makeDef(id: string, role: Role, lordClass?: LordClass, special?: CharacterDef['special']): CharacterDef {
  const def: CharacterDef = {
    id,
    name: id,
    country: 'wei',
    role,
    size: 'M',
    stats: { power: 5, speed: 5, stamina: 5, technique: 5, defense: 5 },
    special: special ?? { name: 'test', kind: 'straight' },
  };
  if (lordClass !== undefined) def.lordClass = lordClass;
  return def;
}

/**
 * A 5v5 state. Team 0 slot 0 is `lord` (facing +x at LORD_X, mid-field); the rest of team 0 and all of team 1 are parked far away
 * at x 1000 on distinct rows. The ball lies unowned at (600, mid).
 */
function matchState(lord: CharacterDef): GameState {
  const team0 = [lord, makeDef('a1', 'DF'), makeDef('a2', 'MF'), makeDef('a3', 'MF'), makeDef('a4', 'FW')];
  const team1 = ENEMY_ROLES.map((role, i) => makeDef(`b${i}`, role));
  const setup: MatchSetup = { seed: 1, teams: [team0, team1], startInPlay: true };
  const state = createInitialState(setup, SIZE_PARAMS);
  state.players.forEach((p, i) => {
    p.x = 1000;
    p.y = 30 + i * 25;
  });
  const me = state.players[0];
  me.x = LORD_X;
  me.y = MID_Y;
  me.facingX = 1;
  me.facingY = 0;
  state.ball.x = 600;
  state.ball.y = MID_Y;
  return state;
}

/**
 * Puts the lord back at his start (a punch knocks him away, so a second punch would miss) and enemy E0 20 px in front of him,
 * facing him, so a punch from it reaches the lord.
 */
function placeEnemyFacingLord(state: GameState): void {
  const lord = state.players[0];
  lord.x = LORD_X;
  lord.y = MID_Y;
  lord.vx = 0;
  lord.vy = 0;
  lord.action = 'normal';
  lord.actionTimer = 0;
  const e = state.players[E0];
  e.x = LORD_X - 20;
  e.y = MID_Y;
  e.facingX = 1;
  e.facingY = 0;
}

/** One frame per player: `press` for player idx, empty for everyone else. */
function frameFor(state: GameState, idx: number, press: Partial<InputFrame>): InputFrame[] {
  return state.players.map((_, i) => (i === idx ? { ...EMPTY_INPUT, ...press } : { ...EMPTY_INPUT }));
}

/** Steps n ticks with the given inputs (none by default) and returns every event tagged with its tick. */
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

function hitsOn(log: Logged[], victimIdx: number): number {
  let n = 0;
  for (const e of ofType(log, 'hit')) if (e.event.victimIdx === victimIdx) n++;
  return n;
}

/** Enemy E0 punches once (press on the first tick only) and the ticks run on until the punch has landed. */
function enemyPunches(state: GameState, ticks: number = 12): Logged[] {
  const log = run(state, 1, frameFor(state, E0, { j: true }));
  return log.concat(run(state, ticks - 1));
}

/** Gives the ball back to the holder at his feet (used between scripted contacts). */
function giveBall(state: GameState, idx: number): void {
  state.ball.ownerIdx = idx;
  state.ball.x = state.players[idx].x;
  state.ball.y = state.players[idx].y;
  state.ball.z = 0;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.vz = 0;
}

describe('mengjiang 破陣 ball shield', () => {
  function holderState(cls: LordClass | undefined): GameState {
    const state = matchState(makeDef('lord', 'FW', cls));
    giveBall(state, 0);
    placeEnemyFacingLord(state);
    return state;
  }

  it('a punch that would take the ball leaves it with the holder, still lands, and emits shieldBlock', () => {
    const state = holderState('mengjiang');
    const log = enemyPunches(state);
    expect(ofType(log, 'shieldBlock').map((e) => e.event.playerIdx)).toEqual([0]);
    expect(hitsOn(log, 0)).toBe(1);
    expect(state.ball.ownerIdx).toBe(0);
    expect(ofType(log, 'looseBall')).toHaveLength(0);
  });

  it('control: without a lordClass the same punch knocks the ball loose and emits no shieldBlock', () => {
    const state = holderState(undefined);
    const log = enemyPunches(state);
    expect(ofType(log, 'shieldBlock')).toHaveLength(0);
    expect(hitsOn(log, 0)).toBe(1);
    expect(state.ball.ownerIdx).toBe(-1);
    expect(ofType(log, 'looseBall').map((e) => e.event.playerIdx)).toEqual([0]);
  });

  it('the shield is spent for LORD_SHIELD_RECHARGE_TICKS: a loss inside that window goes through, a later one is absorbed', () => {
    const state = holderState('mengjiang');
    enemyPunches(state);
    const usedAt = state.players[0].shieldTick;
    expect(usedAt).toBeDefined();

    // Second punch shortly after: the shield is still recharging, so the ball is lost.
    run(state, 60);
    placeEnemyFacingLord(state);
    giveBall(state, 0);
    const second = enemyPunches(state);
    expect(ofType(second, 'shieldBlock')).toHaveLength(0);
    expect(state.ball.ownerIdx).toBe(-1);

    // Third punch once the recharge window has passed: the shield absorbs it again.
    run(state, LORD_SHIELD_RECHARGE_TICKS);
    placeEnemyFacingLord(state);
    giveBall(state, 0);
    const third = enemyPunches(state);
    expect(ofType(third, 'shieldBlock').map((e) => e.event.playerIdx)).toEqual([0]);
    expect(state.ball.ownerIdx).toBe(0);
  });
});

describe('mengjiang 破陣 knockdown cooldown cut', () => {
  it('a knockdown he causes cuts his special cooldown by LORD_MENGJIANG_CD_CUT_TICKS and emits classCdCut', () => {
    const state = matchState(makeDef('lord', 'FW', 'mengjiang'));
    const lord = state.players[0];
    const victim = state.players[E0];
    lord.specialCooldown = SPECIAL_COOLDOWN_TICKS;
    victim.x = LORD_X + 20;
    victim.y = MID_Y;
    applySpecialHit(state, lord, victim, 'pierce', 1, 0);
    expect(victim.action).toBe('down');
    expect(lord.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS - LORD_MENGJIANG_CD_CUT_TICKS);
    const cuts = state.events.filter((e) => e.type === 'classCdCut');
    expect(cuts).toEqual([{ type: 'classCdCut', playerIdx: 0, ticks: LORD_MENGJIANG_CD_CUT_TICKS }]);
  });

  it('the cut stops at zero', () => {
    const state = matchState(makeDef('lord', 'FW', 'mengjiang'));
    const lord = state.players[0];
    lord.specialCooldown = 50;
    applySpecialHit(state, lord, state.players[E0], 'pierce', 1, 0);
    expect(lord.specialCooldown).toBe(0);
  });

  it('a hit that only hitstuns does not cut it', () => {
    const state = matchState(makeDef('lord', 'FW', 'mengjiang'));
    const lord = state.players[0];
    lord.specialCooldown = SPECIAL_COOLDOWN_TICKS;
    applySpecialHit(state, lord, state.players[E0], 'straight', 1, 0);
    expect(lord.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(state.events.some((e) => e.type === 'classCdCut')).toBe(false);
  });

  it('control: without a lordClass the knockdown does not touch the cooldown', () => {
    const state = matchState(makeDef('lord', 'FW'));
    const lord = state.players[0];
    lord.specialCooldown = SPECIAL_COOLDOWN_TICKS;
    applySpecialHit(state, lord, state.players[E0], 'pierce', 1, 0);
    expect(state.players[E0].action).toBe('down');
    expect(lord.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    expect(state.events.some((e) => e.type === 'classCdCut')).toBe(false);
  });
});

describe('junshi 運籌 cooldown after a cast', () => {
  const FEAR: CharacterDef['special'] = { name: 'fear', kind: 'straight' as SpecialKind, mode: 'fear', noBall: true };

  /** The lord casts his fear (instant) with L and the cooldown after one tick is returned. */
  function cooldownAfterFear(cls: LordClass | undefined): number {
    const state = matchState(makeDef('lord', 'MF', cls, FEAR));
    run(state, 1, frameFor(state, 0, { l: true }));
    return state.players[0].specialCooldown;
  }

  it('the cooldown is multiplied by 0.75, rounded down', () => {
    const control = cooldownAfterFear(undefined);
    const junshi = cooldownAfterFear('junshi');
    expect(control).toBeGreaterThan(0);
    expect(junshi).toBe(floor(control * 0.75));
    expect(junshi).toBeLessThan(control);
  });
});

describe('junshi 運籌 pass boost', () => {
  function passState(cls: LordClass | undefined): GameState {
    const state = matchState(makeDef('lord', 'MF', cls));
    giveBall(state, 0);
    const receiver = state.players[1];
    receiver.x = LORD_X + 150;
    receiver.y = MID_Y;
    return state;
  }

  /** Runs until player idx picks up the ball (at most 300 ticks) and returns every event logged on the way. */
  function runUntilPickup(state: GameState, idx: number): Logged[] {
    const log = run(state, 1, frameFor(state, 0, { k: true }));
    for (let i = 0; i < 300; i++) {
      const got = run(state, 1);
      log.push(...got);
      if (ofType(got, 'pickup').some((e) => e.event.playerIdx === idx)) break;
    }
    return log;
  }

  /** Both players walk +x for 40 ticks from rest; returns the ratio of their final speeds. */
  function walkRatio(state: GameState, a: number, b: number): number {
    const frames = state.players.map((_, i) => (i === a || i === b ? { ...EMPTY_INPUT, moveX: 1 as const } : { ...EMPTY_INPUT }));
    run(state, 40, frames);
    return state.players[a].vx / state.players[b].vx;
  }

  it('the teammate who receives his pass runs at LORD_PASS_BOOST_TICKS of 1.25x speed', () => {
    const state = passState('junshi');
    const log = runUntilPickup(state, 1);
    const boosts = ofType(log, 'passBoost');
    expect(boosts.map((e) => e.event.playerIdx)).toEqual([1]);
    expect(state.players[1].passBoostUntil).toBeGreaterThan(state.tick);
    expect(state.players[1].passBoostUntil! - state.tick).toBeLessThanOrEqual(LORD_PASS_BOOST_TICKS);
    // Non-boosted teammate idx 2 is parked at the same speed baseline; the receiver walks 1.25x faster.
    state.players[2].x = 500;
    state.players[2].y = 120;
    expect(walkRatio(state, 1, 2)).toBeCloseTo(1.25, 6);
  });

  it('control: a receiver of a non-junshi pass gets no boost', () => {
    const state = passState(undefined);
    const log = runUntilPickup(state, 1);
    expect(ofType(log, 'passBoost')).toHaveLength(0);
    expect(state.players[1].passBoostUntil).toBeUndefined();
    state.players[2].x = 500;
    state.players[2].y = 120;
    expect(walkRatio(state, 1, 2)).toBeCloseTo(1, 6);
  });
});

describe('tiebi 固守 slide tackle reach', () => {
  it('a slide tackle reaches a victim 26 px to the side, which a normal defender cannot', () => {
    const tiebiState = matchState(makeDef('lord', 'DF', 'tiebi'));
    const victim = tiebiState.players[E0];
    victim.x = LORD_X;
    victim.y = MID_Y + 26;
    const tiebiLog = run(tiebiState, 1, frameFor(tiebiState, 0, { j: true, dash: true }));
    tiebiLog.push(...run(tiebiState, 10));
    expect(hitsOn(tiebiLog, E0)).toBeGreaterThanOrEqual(1);

    const plainState = matchState(makeDef('lord', 'DF'));
    const plainVictim = plainState.players[E0];
    plainVictim.x = LORD_X;
    plainVictim.y = MID_Y + 26;
    const plainLog = run(plainState, 1, frameFor(plainState, 0, { j: true, dash: true }));
    plainLog.push(...run(plainState, 10));
    expect(hitsOn(plainLog, E0)).toBe(0);
  });
});

describe('tiebi 固守 every other knockdown held in hitstun', () => {
  it('the 2nd knockdown is a hitstun of LORD_TIEBI_HOLD_TICKS, the 3rd is a knockdown again', () => {
    const state = matchState(makeDef('lord', 'DF', 'tiebi'));
    const tiebi = state.players[0];
    const attacker = state.players[E0];
    const knock = (): void => {
      tiebi.action = 'normal';
      tiebi.actionTimer = 0;
      applySpecialHit(state, attacker, tiebi, 'pierce', 1, 0, 1);
    };

    knock();
    expect(tiebi.action).toBe('down');
    expect(tiebi.knockdowns).toBe(1);
    expect(state.events.some((e) => e.type === 'guardHold')).toBe(false);

    knock();
    expect(tiebi.action).toBe('hitstun');
    expect(tiebi.actionTimer).toBe(LORD_TIEBI_HOLD_TICKS);
    expect(state.events.filter((e) => e.type === 'guardHold')).toEqual([{ type: 'guardHold', playerIdx: 0 }]);
    expect(state.events.filter((e) => e.type === 'down' && e.playerIdx === 0)).toHaveLength(1);

    knock();
    expect(tiebi.action).toBe('down');
    expect(tiebi.knockdowns).toBe(3);
    expect(state.events.filter((e) => e.type === 'guardHold')).toHaveLength(1);
  });

  it('control: without a lordClass every knockdown is a knockdown', () => {
    const state = matchState(makeDef('lord', 'DF'));
    const plain = state.players[0];
    const attacker = state.players[E0];
    for (let i = 0; i < 3; i++) {
      plain.action = 'normal';
      plain.actionTimer = 0;
      applySpecialHit(state, attacker, plain, 'pierce', 1, 0, 1);
      expect(plain.action).toBe('down');
    }
    expect(state.events.some((e) => e.type === 'guardHold')).toBe(false);
  });
});

describe('tiebi 固守 team rally', () => {
  /** The tiebi lord punches enemy E0 (who holds the ball), so the hit knocks the ball loose. */
  function punchHolderState(cls: LordClass | undefined): GameState {
    const state = matchState(makeDef('lord', 'DF', cls));
    state.players[E0].x = LORD_X + 20;
    state.players[E0].y = MID_Y;
    giveBall(state, E0);
    return state;
  }

  /** Drops the loose ball at the lord's feet, stationary, so the next step picks it up if the lord may take it. */
  function dropBallAtLord(state: GameState): void {
    state.ball.ownerIdx = -1;
    state.ball.x = state.players[0].x;
    state.ball.y = state.players[0].y;
    state.ball.z = 0;
    state.ball.vx = 0;
    state.ball.vy = 0;
    state.ball.vz = 0;
  }

  it('picking up the ball his own hit knocked loose within the window rallies his whole team', () => {
    const state = punchHolderState('tiebi');
    const log = run(state, 1, frameFor(state, 0, { j: true }));
    log.push(...run(state, 20));
    expect(ofType(log, 'looseBall').map((e) => e.event.playerIdx)).toEqual([E0]);
    // The lord picks up the loose ball within the window.
    dropBallAtLord(state);
    const pick = run(state, 2);
    expect(ofType(pick, 'pickup').map((e) => e.event.playerIdx)).toEqual([0]);
    const rallies = ofType(pick, 'teamRally');
    expect(rallies.map((e) => e.event.team)).toEqual([0]);
    for (const p of state.players.slice(0, 5)) expect(p.rallyUntil).toBeDefined();
    expect(state.players[5].rallyUntil).toBeUndefined();
    expect(state.players[0].rallyUntil! - state.tick).toBeLessThanOrEqual(LORD_TIEBI_RALLY_TICKS);
  });

  it('a pickup after the window does not rally', () => {
    const state = punchHolderState('tiebi');
    run(state, 1, frameFor(state, 0, { j: true }));
    run(state, LORD_TIEBI_RALLY_WINDOW + 20);
    dropBallAtLord(state);
    const pick = run(state, 2);
    expect(ofType(pick, 'teamRally')).toHaveLength(0);
    expect(state.players[1].rallyUntil).toBeUndefined();
  });

  it('control: without a lordClass nothing rallies', () => {
    const state = punchHolderState(undefined);
    run(state, 1, frameFor(state, 0, { j: true }));
    run(state, 20);
    dropBallAtLord(state);
    const pick = run(state, 2);
    expect(ofType(pick, 'teamRally')).toHaveLength(0);
    expect(state.players.every((p) => p.rallyUntil === undefined)).toBe(true);
  });
});

describe('full AI match with one lord of each class', () => {
  it('a 3v3 AI-vs-AI match with a tiebi, a mengjiang and a junshi plays to full time without crashing', () => {
    const team0 = [makeDef('t0', 'GK'), makeDef('t1', 'DF', 'tiebi'), makeDef('t2', 'FW', 'mengjiang')];
    const team1 = [makeDef('u0', 'GK'), makeDef('u1', 'MF', 'junshi'), makeDef('u2', 'FW')];
    const setup: MatchSetup = { seed: 7, teams: [team0, team1], halfSeconds: 60, field: defaultFieldFor(3) };
    const state = createInitialState(setup, SIZE_PARAMS);
    const ai = createAIState(7);
    const humans = state.players.map(() => false);
    let guard = 0;
    while (state.match.phase !== 'fulltime' && guard < 20000) {
      step(state, computeAIInputs(state, ai, humans));
      guard++;
    }
    expect(state.match.phase).toBe('fulltime');
    expect(state.players.map((p) => p.lordClass)).toEqual([undefined, 'tiebi', 'mengjiang', undefined, 'junshi', undefined]);
  });
});
