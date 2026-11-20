import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  BEAM_CAST_TICKS,
  BEAM_STRIKE_STAMINA_RATIO,
  DOWN_TICKS_KNOCKED,
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  PUNCH_TICKS,
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
 * Player `idx` (0 = team 0, 5 = team 1) is Zhuge Liang: the beam special, no-ball, owning the ball at x, facing the goal it
 * attacks in the first half (team 0 faces +x, team 1 faces -x).
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
  p.specialNoBall = true;
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

/** Ticks with no input until the beam strikes. Returns every event seen, the strike tick included. */
function runUntilStrike(state: GameState): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let t = 0; t < BEAM_CAST_TICKS + 5; t++) {
    step(state, []);
    seen.push(...state.events);
    if (state.events.some((e) => e.type === 'beamStrike')) break;
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

/** Team 1 players other than `keep` are made unable to be struck: down, recovering or invincible in turn. */
function blockOpponents(state: GameState, keep: number): void {
  const blockers: Array<(p: GameState['players'][number]) => void> = [
    (p) => {
      p.action = 'down';
      p.actionTimer = 10000;
    },
    (p) => {
      p.action = 'recover';
      p.actionTimer = 10000;
    },
    (p) => {
      p.action = 'lunge';
      p.actionTimer = 10000;
    },
  ];
  let n = 0;
  for (let i = 5; i < 10; i++) {
    if (i === keep) continue;
    blockers[n % blockers.length](state.players[i]);
    n++;
  }
}

describe('beam cast start', () => {
  it('L with the ball in his own half starts the cast: stands still, costs stamina, sets the cooldown, keeps the ball', () => {
    const state = beamerState(400);
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

  it('without the ball L still starts the cast (no-ball special) and the ball stays loose', () => {
    const state = beamerState(800);
    looseBallAway(state);
    const p = state.players[0];

    const events = pressL(state);

    expect(events).toContainEqual({ type: 'beamCharge', playerIdx: 0 });
    expect(p.action).toBe('cast');
    expect(state.ball.ownerIdx).toBe(-1);
  });

  it('a beamer without specialNoBall still needs the ball to cast', () => {
    const state = beamerState(800);
    state.players[0].specialNoBall = false;
    looseBallAway(state);
    const p = state.players[0];

    const events = pressL(state);

    expect(events.some((e) => e.type === 'beamCharge' || e.type === 'special')).toBe(false);
    expect(p.action).toBe('normal');
    expect(p.specialCooldown).toBe(0);
  });
});

describe('beam strike', () => {
  it('after the channel one standing opponent is struck: stamina -30% of its max, knocked down, beamStrike and hit and down', () => {
    const state = beamerState(800);
    const events = [...pressL(state), ...runUntilStrike(state)];

    const strike = events.find((e) => e.type === 'beamStrike');
    expect(strike).toBeDefined();
    if (strike?.type !== 'beamStrike') throw new Error('unreachable');
    expect(strike.playerIdx).toBe(0);
    expect(strike.victimIdx).toBeGreaterThanOrEqual(5);

    const victim = state.players[strike.victimIdx];
    const struck = state.players.filter((p) => p.team === 1 && p.action === 'down');
    expect(struck).toHaveLength(1);
    expect(struck[0]).toBe(victim);
    expect(victim.stamina).toBeCloseTo(victim.maxStamina * (1 - BEAM_STRIKE_STAMINA_RATIO), 6);
    expect(events).toContainEqual({
      type: 'hit',
      attackerIdx: 0,
      victimIdx: strike.victimIdx,
      kind: 'special',
      damage: BEAM_STRIKE_STAMINA_RATIO * victim.maxStamina,
    });
    expect(events).toContainEqual({ type: 'down', playerIdx: strike.victimIdx });
    expect(events.some((e) => e.type === 'specialShot')).toBe(false);
  });

  it('the struck player is down for DOWN_TICKS_KNOCKED ticks (counting the strike tick) and then gets up', () => {
    const state = beamerState(800);
    const events = [...pressL(state), ...runUntilStrike(state)];
    const strike = events.find((e) => e.type === 'beamStrike');
    if (strike?.type !== 'beamStrike') throw new Error('unreachable');
    const victim = state.players[strike.victimIdx];

    let steps = 1;
    while (victim.action === 'down') {
      step(state, []);
      steps++;
    }

    expect(steps).toBe(DOWN_TICKS_KNOCKED);
    expect(victim.action).toBe('normal');
  });

  it('the struck player drops the ball as a loose ball when he holds it', () => {
    const state = beamerState(800);
    blockOpponents(state, 6);
    state.ball.ownerIdx = 6;
    state.ball.lastTouchIdx = 6;

    const events = [...pressL(state), ...runUntilStrike(state)];

    expect(events).toContainEqual({ type: 'beamStrike', playerIdx: 0, victimIdx: 6 });
    expect(events).toContainEqual({ type: 'looseBall', playerIdx: 6 });
    expect(state.ball.ownerIdx).toBe(-1);
    expect(state.players[6].noTouchTicks).toBeGreaterThan(0);
  });

  it('the caster keeps the ball he had', () => {
    const state = beamerState(800);
    blockOpponents(state, 6);

    pressL(state);
    runUntilStrike(state);

    expect(state.players[6].action).toBe('down');
    expect(state.ball.ownerIdx).toBe(0);
  });

  it('down, recovering and invincible opponents are never struck', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = beamerState(800, 0, seed);
      blockOpponents(state, 8);
      const before = state.players.map((p) => p.stamina);

      const events = [...pressL(state), ...runUntilStrike(state)];

      expect(events).toContainEqual({ type: 'beamStrike', playerIdx: 0, victimIdx: 8 });
      expect(state.players[8].stamina).toBeCloseTo(before[8] - BEAM_STRIKE_STAMINA_RATIO * state.players[8].maxStamina, 6);
    }
  });

  it('a struck victim that is channelling cancels its own cast', () => {
    const state = beamerState(800);
    blockOpponents(state, 7);
    state.players[7].action = 'cast';
    state.players[7].actionTimer = 10000;

    const events = [...pressL(state), ...runUntilStrike(state)];

    expect(events).toContainEqual({ type: 'beamCancel', playerIdx: 7 });
    expect(events).toContainEqual({ type: 'beamStrike', playerIdx: 0, victimIdx: 7 });
    expect(state.players[7].action).toBe('down');
  });

  it('with no valid target nothing is struck, but the cost and the cooldown are spent', () => {
    const state = beamerState(800);
    for (let i = 5; i < 10; i++) {
      state.players[i].action = 'down';
      state.players[i].actionTimer = 10000;
    }
    const stamina0 = state.players[0].stamina;

    const events = [...pressL(state), ...run(state, BEAM_CAST_TICKS)];

    expect(events.some((e) => e.type === 'beamStrike' || e.type === 'hit' || e.type === 'down')).toBe(false);
    expect(state.players[0].action).toBe('normal');
    expect(state.players[0].stamina).toBeCloseTo(stamina0 - SPECIAL_STAMINA_COST, 6);
    expect(state.players[0].specialCooldown).toBeGreaterThan(0);
  });

  it('the same seed picks the same victim', () => {
    const pick = (): number => {
      const state = beamerState(800, 0, 42);
      const events = [...pressL(state), ...runUntilStrike(state)];
      const strike = events.find((e) => e.type === 'beamStrike');
      if (strike?.type !== 'beamStrike') throw new Error('unreachable');
      return strike.victimIdx;
    };

    expect(pick()).toBe(pick());
  });

  it('team 1 beamer strikes a team 0 player', () => {
    const state = beamerState(400, 5);

    const events = [...pressL(state, 5), ...runUntilStrike(state)];

    const strike = events.find((e) => e.type === 'beamStrike');
    if (strike?.type !== 'beamStrike') throw new Error('unreachable');
    expect(strike.playerIdx).toBe(5);
    expect(strike.victimIdx).toBeLessThan(5);
  });
});

describe('beam cast protection and end', () => {
  it('an opponent punch during the cast interrupts it: the caster is stunned, loses the ball, and no beam strikes', () => {
    const state = beamerState(800);
    const victim = state.players[6];
    pressL(state);
    victim.x = 818;
    victim.y = FIELD_D / 2;
    victim.facingX = -1;
    victim.facingY = 0;
    const owner = state.players[0];

    const seen: SimEvent[] = [...step(state, inputFor(6, { j: true })).events];
    for (let t = 0; t < PUNCH_TICKS && !seen.some((e) => e.type === 'beamCancel'); t++) {
      step(state, []);
      seen.push(...state.events);
    }

    expect(seen).toContainEqual({ type: 'attack', playerIdx: 6, kind: 'punch' });
    expect(seen).toContainEqual(expect.objectContaining({ type: 'hit', attackerIdx: 6, victimIdx: 0, kind: 'punch' }));
    expect(seen).toContainEqual({ type: 'beamCancel', playerIdx: 0 });
    expect(seen).toContainEqual({ type: 'looseBall', playerIdx: 0 });
    expect(['hitstun', 'down']).toContain(owner.action);
    expect(state.ball.ownerIdx).not.toBe(0);

    const rest = run(state, BEAM_CAST_TICKS + PUNCH_TICKS);
    const all = [...seen, ...rest];
    expect(all.some((e) => e.type === 'beamStrike')).toBe(false);
    expect(owner.specialCooldown).toBeGreaterThan(0);
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
