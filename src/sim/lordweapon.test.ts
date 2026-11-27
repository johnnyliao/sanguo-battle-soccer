import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams, Weapon } from '../data/types';
import { computeAIInputs, createAIState } from '../ai/ai';
import {
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  LORD_DRAGON_WINDUP_TICKS,
  LORD_FEATHER_BOOST_TICKS,
  LORD_FEATHER_PULL_RANGE,
  LORD_SWORD_TICKS,
  LORD_WHIRL_REHIT_TICKS,
  LORD_WHIRL_TICKS,
  SPECIAL_COOLDOWN_TICKS,
  SPECIAL_STAMINA_COST,
  applySpecialHit,
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

const MID_Y = FIELD_D / 2;
/** A stat-5 player's stamina pool: STAMINA_BASE 40 + 5 * STAMINA_PER_STAT 6. */
const MAX_STAMINA = 70;
/** Default punch damage for power 5 vs defense 5: round(8 + 6 - 2.5) = 12. A windpuff takes round(0.3 * 12) = 4. */
const WINDPUFF_DAMAGE = 4;
const LORD_X = 300;
/** Idx of the first enemy (team 1 slot 0) in a 5v5 setup. */
const E0 = 5;
const E1 = 6;
const E2 = 7;

type Logged = { tick: number; event: SimEvent };

function makeDef(id: string, role: Role, special: CharacterDef['special'] = { name: 'test', kind: 'straight' }, weapon?: Weapon): CharacterDef {
  return {
    id,
    name: id,
    country: 'wei',
    role,
    size: 'M',
    stats: { power: 5, speed: 5, stamina: 5, technique: 5, defense: 5 },
    special,
    weapon,
  };
}

const ROLES: Role[] = ['GK', 'DF', 'MF', 'MF', 'FW'];

/**
 * A 5v5 state. Team 0 slot 0 is the lord (weapon and special mode as given), facing +x at (LORD_X, mid). Everyone else is parked
 * far away at x 1000 on distinct rows, and the ball lies unowned at (600, mid), so nothing interferes unless a test moves it.
 */
function lordState(weapon: Weapon | undefined, mode?: 'whirl' | 'dragonspear' | 'featherfan'): GameState {
  const special: CharacterDef['special'] =
    mode === undefined ? { name: 'test', kind: 'straight' } : { name: mode, kind: 'straight', mode, noBall: true };
  const team0 = ROLES.map((role, i) => makeDef(`a${i}`, role, i === 0 ? special : undefined, i === 0 ? weapon : undefined));
  const team1 = ROLES.map((role, i) => makeDef(`b${i}`, role));
  const setup: MatchSetup = { seed: 1, teams: [team0, team1], startInPlay: true };
  const state = createInitialState(setup, SIZE_PARAMS);
  state.players.forEach((p, i) => {
    p.x = 1000;
    p.y = 30 + i * 25;
  });
  const lord = state.players[0];
  lord.x = LORD_X;
  lord.y = MID_Y;
  lord.facingX = 1;
  lord.facingY = 0;
  state.ball.x = 600;
  state.ball.y = MID_Y;
  return state;
}

function park(state: GameState, idx: number, x: number, y: number = MID_Y): void {
  state.players[idx].x = x;
  state.players[idx].y = y;
}

function pressJ(): InputFrame[] {
  return [{ ...EMPTY_INPUT, j: true }];
}

function pressL(): InputFrame[] {
  return [{ ...EMPTY_INPUT, l: true }];
}

/** Steps `n` ticks with the given inputs (empty by default) and returns every event tagged with the tick it was emitted on. */
function run(state: GameState, n: number, inputs: InputFrame[] = []): Logged[] {
  const out: Logged[] = [];
  for (let i = 0; i < n; i++) {
    const tick = state.tick;
    step(state, inputs);
    for (const event of state.events) out.push({ tick, event });
  }
  return out;
}

/** Steps `n` ticks, one frame per player (for runs where enemies move on their own). */
function runFrames(state: GameState, n: number, frames: InputFrame[]): void {
  for (let i = 0; i < n; i++) step(state, frames);
}

function ofType<T extends SimEvent['type']>(
  log: Logged[],
  type: T,
): { tick: number; event: Extract<SimEvent, { type: T }> }[] {
  return log.filter(
    (e): e is { tick: number; event: Extract<SimEvent, { type: T }> } => e.event.type === type,
  );
}

/** Hit events whose victim is `victimIdx`. */
function hitsOn(log: Logged[], victimIdx: number): number {
  let n = 0;
  for (const e of ofType(log, 'hit')) if (e.event.victimIdx === victimIdx) n++;
  return n;
}

describe('sword', () => {
  it('checks twice in one attack: the normal hit, then a second hit in the same direction', () => {
    const state = lordState('sword');
    // Strike circle centre is 17 px in front of the lord; the victim sits 3 px from it, so both checks reach him.
    park(state, E0, LORD_X + 20);
    const log = run(state, 1, pressJ());
    expect(ofType(log, 'attack')).toHaveLength(1);
    const rest = run(state, LORD_SWORD_TICKS + 2);
    expect(hitsOn([...log, ...rest], E0)).toBe(2);
  });

  it('ends the attack after LORD_SWORD_TICKS', () => {
    const state = lordState('sword');
    run(state, 1, pressJ());
    expect(state.players[0].action).toBe('punch');
    run(state, LORD_SWORD_TICKS);
    expect(state.players[0].action).toBe('normal');
  });
});

describe('spear', () => {
  it('reaches a target the normal punch cannot, and knocks back 1.3x', () => {
    // Centre distance 42: the default strike (17 px out, 19 px hit radius) misses; the spear strike (25.5 px out) hits.
    const spear = lordState('spear');
    park(spear, E0, LORD_X + 42);
    run(spear, 1, pressJ());
    let hitNow = false;
    for (let i = 0; i < 20 && !hitNow; i++) {
      hitNow = hitsOn(run(spear, 1), E0) > 0;
      // Read the victim on the tick of the hit: the hit sets vx to 160 * 1.3, then hitstun damps it once on that tick.
      if (hitNow) expect(spear.players[E0].vx).toBeCloseTo(160 * 1.3 * 0.88, 6);
    }
    expect(hitNow).toBe(true);

    for (const weapon of [undefined, 'sword'] as const) {
      const state = lordState(weapon);
      park(state, E0, LORD_X + 42);
      const log = [...run(state, 1, pressJ()), ...run(state, 25)];
      expect(hitsOn(log, E0)).toBe(0);
    }
  });
});

describe('fan', () => {
  it('fires a windpuff that hits an opponent for 30% damage, pushes him away, and does not knock him down', () => {
    const state = lordState('fan');
    park(state, E0, LORD_X + 60);
    const log = run(state, 60, pressJ());
    expect(ofType(log, 'windpuffSpawn')).toHaveLength(1);
    const hits = ofType(log, 'hit').filter((e) => e.event.victimIdx === E0);
    expect(hits).toHaveLength(1);
    expect(hits[0].event.damage).toBe(WINDPUFF_DAMAGE);
    expect(ofType(log, 'windpuffHit')).toHaveLength(1);
    expect(ofType(log, 'down').filter((e) => e.event.playerIdx === E0)).toHaveLength(0);
    expect(state.windpuffs).toBeUndefined();
    // Pushed about 60 px away from the puff (along +x), then settles.
    const displaced = state.players[E0].x - (LORD_X + 60);
    expect(displaced).toBeGreaterThan(45);
    expect(displaced).toBeLessThan(75);
  });

  it('pushes a free ball that the windpuff touches', () => {
    const state = lordState('fan');
    state.ball.x = LORD_X + 60;
    state.ball.y = MID_Y;
    const log = run(state, 60, pressJ());
    // The puff keeps touching the ball for a few ticks, so it pushes on each of them (the velocity is set, not added).
    expect(ofType(log, 'windpuffBall')).not.toHaveLength(0);
    expect(state.ball.ownerIdx).toBe(-1);
    // The ball was pushed along +x; it is now moving away from the lord.
    expect(state.ball.x).toBeGreaterThan(LORD_X + 60);
  });
});

describe('whirl', () => {
  it('hits each opponent within 70 px once, takes 15%, and the lord keeps his ball', () => {
    const state = lordState(undefined, 'whirl');
    state.ball.ownerIdx = 0;
    state.ball.lastTouchIdx = 0;
    park(state, E0, LORD_X + 40);
    park(state, E1, LORD_X, MID_Y + 60);
    park(state, E2, LORD_X + 120);
    const log = run(state, 1, pressL());
    expect(ofType(log, 'whirlStart')).toHaveLength(1);
    // Stamina regenerates on the cast tick (the whirl does not lock the action), so allow half a point.
    expect(state.players[0].stamina).toBeCloseTo(MAX_STAMINA - SPECIAL_STAMINA_COST, 0);
    expect(state.players[0].specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    const rest = run(state, LORD_WHIRL_TICKS + 5);
    const all = [...log, ...rest];
    expect(ofType(all, 'whirlHit').map((e) => e.event.victimIdx)).toEqual([E0, E1]);
    expect(hitsOn(all, E0)).toBe(1);
    expect(hitsOn(all, E1)).toBe(1);
    expect(hitsOn(all, E2)).toBe(0);
    const dmg = ofType(all, 'hit').find((e) => e.event.victimIdx === E0)?.event.damage ?? -1;
    expect(dmg).toBeCloseTo(0.15 * MAX_STAMINA, 6);
    expect(state.ball.ownerIdx).toBe(0);
    expect(ofType(all, 'whirlEnd')).toHaveLength(1);
  });

  it('makes an enemy ball holder drop the ball', () => {
    const state = lordState(undefined, 'whirl');
    state.ball.ownerIdx = E0;
    state.ball.x = LORD_X + 40;
    state.ball.y = MID_Y;
    park(state, E0, LORD_X + 40);
    const log = run(state, 1, pressL());
    expect(state.ball.ownerIdx).toBe(E0);
    const rest = run(state, 2);
    const all = [...log, ...rest];
    expect(ofType(all, 'looseBall').map((e) => e.event.playerIdx)).toEqual([E0]);
    expect(state.ball.ownerIdx).toBe(-1);
    expect(state.ball.lastTouchIdx).toBe(0);
  });

  it('is invincible: an enemy special hit does nothing to the lord, and his ball stays', () => {
    const state = lordState(undefined, 'whirl');
    state.ball.ownerIdx = 0;
    state.ball.lastTouchIdx = 0;
    run(state, 1, pressL());
    const before = state.players[0].stamina;
    applySpecialHit(state, state.players[E0], state.players[0], 'pierce', -1, 0, 30);
    expect(state.players[0].stamina).toBe(before);
    expect(state.players[0].action).toBe('normal');
    expect(state.ball.ownerIdx).toBe(0);
    expect(state.events.some((e) => e.type === 'hit' && e.victimIdx === 0)).toBe(false);
  });

  it('moves at normal speed and dribbles the ball during the whirl', () => {
    const state = lordState(undefined, 'whirl');
    state.ball.ownerIdx = 0;
    state.ball.lastTouchIdx = 0;
    const move: InputFrame[] = [{ ...EMPTY_INPUT, moveX: 1 }];
    run(state, 1, pressL());
    const log = run(state, 60, move);
    // Max speed 100 px/s at stat 5 (no slow-down during the whirl); acceleration has settled after 60 ticks.
    expect(state.players[0].vx).toBeCloseTo(100, 0);
    expect(state.ball.ownerIdx).toBe(0);
    expect(ofType(log, 'whirlEnd')).toHaveLength(0);
  });

  it('hits a victim again only LORD_WHIRL_REHIT_TICKS after its last hit', () => {
    const state = lordState(undefined, 'whirl');
    const hitTicks: number[] = [];
    run(state, 1, pressL());
    for (let i = 0; i < 40; i++) {
      // Keep the victim inside the ring, so only the re-hit timer decides.
      park(state, E0, LORD_X + 40);
      for (const e of run(state, 1)) if (e.event.type === 'whirlHit') hitTicks.push(e.tick);
    }
    expect(hitTicks).toHaveLength(2);
    expect(hitTicks[1] - hitTicks[0]).toBe(LORD_WHIRL_REHIT_TICKS);
  });
});

describe('dragonspear', () => {
  it('winds up invincible, then pierces two enemies in a line, knocking each down and taking 30%', () => {
    const state = lordState(undefined, 'dragonspear');
    park(state, E0, LORD_X + 60);
    park(state, E1, LORD_X + 120);
    const cast = state.tick;
    const log = run(state, 1, pressL());
    expect(ofType(log, 'dragonCharge')).toHaveLength(1);
    expect(state.players[0].action).toBe('dragon');
    expect(state.players[0].stamina).toBeCloseTo(MAX_STAMINA - SPECIAL_STAMINA_COST, 6);
    expect(state.players[0].specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
    const rest = run(state, 60);
    const all = [...log, ...rest];
    const fire = ofType(all, 'dragonFire');
    expect(fire).toHaveLength(1);
    expect(fire[0].tick - cast).toBe(LORD_DRAGON_WINDUP_TICKS);
    expect(fire[0].event.withBall).toBe(false);
    expect(ofType(all, 'dragonHit').map((e) => e.event.victimIdx)).toEqual([E0, E1]);
    expect(hitsOn(all, E0)).toBe(1);
    expect(hitsOn(all, E1)).toBe(1);
    const downs = ofType(all, 'down').map((e) => e.event.playerIdx);
    expect(downs).toContain(E0);
    expect(downs).toContain(E1);
    const dmg = ofType(all, 'hit').find((e) => e.event.victimIdx === E1)?.event.damage ?? -1;
    expect(dmg).toBeCloseTo(0.3 * MAX_STAMINA, 6);
    expect(ofType(all, 'dragonEnd')).toHaveLength(1);
    expect(state.dragonspears).toBeUndefined();
  });

  it('cannot be cancelled: a hit on the lord during the windup does nothing and the spear still flies', () => {
    const state = lordState(undefined, 'dragonspear');
    run(state, 1, pressL());
    run(state, 5);
    const before = state.players[0].stamina;
    applySpecialHit(state, state.players[E0], state.players[0], 'straight', 1, 0, 5);
    expect(state.players[0].action).toBe('dragon');
    expect(state.players[0].stamina).toBe(before);
    const log = run(state, LORD_DRAGON_WINDUP_TICKS + 5);
    expect(ofType(log, 'dragonCancel')).toHaveLength(0);
    expect(ofType(log, 'dragonFire')).toHaveLength(1);
  });

  it('with the ball, the spear fires a pierce special shot that scores at an open goal from close range', () => {
    const state = lordState(undefined, 'dragonspear');
    // The enemies stand in their own corner, away from the spear line, the goal mouth and their keeper's reach.
    for (let k = 0; k < 5; k++) park(state, E0 + k, 100, 30 + k * 20);
    park(state, 0, FIELD_W - 90);
    state.ball.ownerIdx = 0;
    state.ball.lastTouchIdx = 0;
    state.ball.x = FIELD_W - 90;
    state.ball.y = MID_Y;
    const log = [...run(state, 1, pressL()), ...run(state, LORD_DRAGON_WINDUP_TICKS + 60)];
    const fire = ofType(log, 'dragonFire');
    expect(fire).toHaveLength(1);
    expect(fire[0].event.withBall).toBe(true);
    expect(ofType(log, 'specialShot').map((e) => e.event.kind)).toEqual(['pierce']);
    const goals = ofType(log, 'goal');
    expect(goals).toHaveLength(1);
    expect(goals[0].event.team).toBe(0);
    expect(goals[0].event.scorerIdx).toBe(0);
  });
});

describe('featherfan', () => {
  it('pushes, stuns, and slows opponents in the cone but not those behind', () => {
    const state = lordState(undefined, 'featherfan');
    park(state, E0, LORD_X + 60);
    park(state, E1, LORD_X - 60);
    const log = run(state, 1, pressL());
    const starts = ofType(log, 'featherStart');
    expect(starts).toHaveLength(1);
    expect(starts[0].event.victimIdxs).toEqual([E0]);
    expect(starts[0].event.angleDeg).toBe(120);
    expect(starts[0].event.boostTicks).toBe(LORD_FEATHER_BOOST_TICKS);
    expect(state.players[0].stamina).toBeCloseTo(MAX_STAMINA - SPECIAL_STAMINA_COST, 0);
    // The cone enemy loses 10% and is stunned (hitstun) on the cast tick; the one behind is untouched.
    expect(state.players[E0].stamina).toBeCloseTo(0.9 * MAX_STAMINA, 0);
    expect(state.players[E0].action).toBe('hitstun');
    expect(state.players[E1].stamina).toBe(MAX_STAMINA);

    // The push slides him about 80 px away from the lord over the stun.
    runFrames(state, 35, state.players.map(() => EMPTY_INPUT));
    const pushed = state.players[E0].x - (LORD_X + 60);
    expect(pushed).toBeGreaterThan(70);
    expect(pushed).toBeLessThan(90);

    // Both walk away from the lord. The cone enemy is at 0.35x speed (35 px/s), the one behind is not (100 px/s).
    const frames: InputFrame[] = state.players.map(() => EMPTY_INPUT);
    frames[E0] = { ...EMPTY_INPUT, moveX: 1 };
    frames[E1] = { ...EMPTY_INPUT, moveX: -1 };
    runFrames(state, 120, frames);
    expect(state.players[E0].vx).toBeCloseTo(35, 0);
    expect(state.players[E1].vx).toBeCloseTo(-100, 0);
  });

  it('boosts the lord to 1.3x speed for LORD_FEATHER_BOOST_TICKS after the cast', () => {
    const state = lordState(undefined, 'featherfan');
    const move: InputFrame[] = [{ ...EMPTY_INPUT, moveX: 1 }];
    run(state, 1, pressL());
    expect(state.players[0].lordBoostTicks).toBe(LORD_FEATHER_BOOST_TICKS);
    run(state, 60, move);
    expect(state.players[0].vx).toBeCloseTo(130, 0);
    run(state, LORD_FEATHER_BOOST_TICKS - 60, move);
    expect(state.players[0].lordBoostTicks).toBe(0);
    run(state, 60, move);
    expect(state.players[0].vx).toBeCloseTo(100, 0);
  });

  it('pulls a ball held by an opponent inside the cone to the lord', () => {
    const state = lordState(undefined, 'featherfan');
    park(state, E0, LORD_X + 40);
    state.ball.ownerIdx = E0;
    state.ball.x = LORD_X + 40;
    state.ball.y = MID_Y;
    const log = run(state, 1, pressL());
    const pulls = ofType(log, 'featherPull');
    expect(pulls).toHaveLength(1);
    expect(pulls[0].event.fromIdx).toBe(E0);
    expect(state.ball.ownerIdx).toBe(0);
    expect(state.ball.lastTouchIdx).toBe(0);
  });

  it('pulls a free ball inside the cone and within 280 px, but not one outside', () => {
    const near = lordState(undefined, 'featherfan');
    near.ball.x = LORD_X + 150;
    near.ball.y = MID_Y;
    run(near, 1, pressL());
    expect(near.ball.ownerIdx).toBe(0);

    const mid = lordState(undefined, 'featherfan');
    mid.ball.x = LORD_X + 250;
    mid.ball.y = MID_Y;
    run(mid, 1, pressL());
    expect(mid.ball.ownerIdx).toBe(0);

    const far = lordState(undefined, 'featherfan');
    far.ball.x = LORD_X + LORD_FEATHER_PULL_RANGE + 20;
    far.ball.y = MID_Y;
    run(far, 1, pressL());
    expect(far.ball.ownerIdx).toBe(-1);

    const side = lordState(undefined, 'featherfan');
    side.ball.x = LORD_X;
    side.ball.y = MID_Y + 100;
    run(side, 1, pressL());
    expect(side.ball.ownerIdx).toBe(-1);
  });

  it('does not steal from an enemy holder outside the cone or beyond 280 px', () => {
    const behind = lordState(undefined, 'featherfan');
    park(behind, E0, LORD_X - 40);
    behind.ball.ownerIdx = E0;
    behind.ball.x = LORD_X - 40;
    behind.ball.y = MID_Y;
    run(behind, 1, pressL());
    expect(behind.ball.ownerIdx).toBe(E0);

    const beyond = lordState(undefined, 'featherfan');
    park(beyond, E0, LORD_X + LORD_FEATHER_PULL_RANGE + 20);
    beyond.ball.ownerIdx = E0;
    beyond.ball.x = LORD_X + LORD_FEATHER_PULL_RANGE + 20;
    beyond.ball.y = MID_Y;
    run(beyond, 1, pressL());
    expect(beyond.ball.ownerIdx).toBe(E0);
  });
});

describe('AI-vs-AI with a lord weapon and special', () => {
  const weapons: Weapon[] = ['sword', 'spear', 'fan'];
  const modes = ['whirl', 'dragonspear', 'featherfan'] as const;
  for (const weapon of weapons) {
    for (const mode of modes) {
      it(`2v2 with ${weapon} and ${mode} runs a full stretch of play without crashing`, () => {
        const lord = makeDef('lord', 'MF', { name: mode, kind: 'straight', mode, noBall: true }, weapon);
        const team0 = [lord, makeDef('a1', 'FW')];
        const team1 = [makeDef('b0', 'DF'), makeDef('b1', 'FW')];
        const state = createInitialState({ seed: 7, teams: [team0, team1], startInPlay: true }, SIZE_PARAMS);
        expect(state.players[0].weapon).toBe(weapon);
        expect(state.players[0].specialMode).toBe(mode);
        const ai = createAIState(7);
        for (let i = 0; i < 1800; i++) {
          step(state, computeAIInputs(state, ai, [false, false, false, false]));
        }
        expect(state.tick).toBe(1800);
      });
    }
  }
});
