import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  DRIBBLE_OFFSET,
  DT,
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  LAUNCH_AIR_TICKS,
  PLAYER_BASE_SPEED,
  PLAYER_GRAVITY,
  PLAYER_SPEED_PER_STAT,
  SAIL_HALF_DEPTH,
  SAIL_HALF_LEN,
  SAIL_LAUNCH_SPEED,
  SAIL_CRASH_STAMINA_RATIO,
  SAIL_LAUNCH_TICKS,
  SAIL_LAUNCH_VZ,
  SAIL_PASSENGER_BEHIND,
  SAIL_SPEED_MULT,
  SAIL_TICKS,
  SPECIAL_COOLDOWN_TICKS,
  SPECIAL_STAMINA_COST,
  STAMINA_REGEN,
  attackDir,
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

function makeDef(id: string, role: Role, size: BodySize): CharacterDef {
  return {
    id,
    name: id,
    country: 'wu',
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

/** Sun Ce's idx: 4 (team 0, forward) or 9 (team 1, forward). */
const TEAM0_SAILOR = 4;
const TEAM1_SAILOR = 9;

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

/** The sailor (idx `sailorIdx`) at mid-field, facing his attack direction, with the sail special (no-ball). Ball loose and far away. */
function sailState(sailorIdx: number, seed = 1): GameState {
  const state = createInitialState(makeSetup(seed), SIZE_PARAMS);
  parkAway(state, [sailorIdx]);
  const p = state.players[sailorIdx];
  p.x = FIELD_W / 2;
  p.y = FIELD_D / 2;
  p.facingX = attackDir(state, p.team);
  p.facingY = 0;
  p.specialMode = 'sail';
  p.specialNoBall = true;
  state.ball.ownerIdx = -1;
  state.ball.lastTouchIdx = -1;
  state.ball.x = 1000;
  state.ball.y = 30;
  return state;
}

/** Index of the first opponent of the sailor's team, and of the first teammate (not the sailor). */
function foeBase(sailorIdx: number): number {
  return sailorIdx < 5 ? 5 : 0;
}
function mateBase(sailorIdx: number): number {
  return sailorIdx < 5 ? 0 : 5;
}

/** Gives the ball to the player at his feet. */
function giveBall(state: GameState, idx: number): void {
  const p = state.players[idx];
  state.ball.x = p.x + p.facingX * (p.radius + DRIBBLE_OFFSET);
  state.ball.y = p.y;
  state.ball.ownerIdx = idx;
  state.ball.lastTouchIdx = idx;
}

/** Press L (the special button) on the sailor. Returns the events of that tick. */
function pressSpecial(state: GameState, idx: number): SimEvent[] {
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

/** Ticks `ticks` times holding `frame` on the sailor every tick (unlike run, which applies it once). */
function hold(state: GameState, idx: number, ticks: number, frame: Partial<InputFrame>): void {
  for (let t = 0; t < ticks; t++) step(state, inputFor(idx, frame));
}

/** Puts `idx` at `dx`, `dy` from the sailor (positive dx is +x in both teams). */
function place(state: GameState, sailorIdx: number, idx: number, dx: number, dy: number): void {
  const s = state.players[sailorIdx];
  state.players[idx].x = s.x + dx;
  state.players[idx].y = s.y + dy;
}

/** Casts the sail with L on a fresh sailor and returns the state after the cast tick. */
function castSail(sailorIdx: number, withBall = false, seed = 1): GameState {
  const state = sailState(sailorIdx, seed);
  if (withBall) giveBall(state, sailorIdx);
  pressSpecial(state, sailorIdx);
  return state;
}

describe.each([
  ['team 0', TEAM0_SAILOR],
  ['team 1', TEAM1_SAILOR],
])('sail for %s', (_label, s) => {
  describe('cast', () => {
    it('casts without the ball: costs stamina, sets the cooldown, emits special and sailStart', () => {
      const state = sailState(s);
      const p = state.players[s];
      const stamina0 = p.stamina;

      const events = pressSpecial(state, s);

      expect(events).toContainEqual({ type: 'special', playerIdx: s, kind: 'straight', name: 'test' });
      expect(events).toContainEqual({ type: 'sailStart', playerIdx: s });
      expect(p.sailTicks).toBe(SAIL_TICKS);
      expect(p.action).toBe('normal');
      expect(p.stamina).toBeCloseTo(stamina0 - SPECIAL_STAMINA_COST + STAMINA_REGEN * DT, 9);
      expect(p.specialCooldown).toBe(SPECIAL_COOLDOWN_TICKS);
      expect(state.ball.ownerIdx).toBe(-1);
    });

    it('casts with the ball and keeps it', () => {
      const state = castSail(s, true);
      expect(state.players[s].sailTicks).toBe(SAIL_TICKS);
      expect(state.ball.ownerIdx).toBe(s);
    });

    it('does not cast while the cooldown runs', () => {
      const state = sailState(s);
      state.players[s].specialCooldown = 100;
      const events = pressSpecial(state, s);
      expect(events.some((e) => e.type === 'sailStart')).toBe(false);
      expect(state.players[s].sailTicks).toBe(0);
    });
  });

  describe('sailing', () => {
    it('moves at SAIL_SPEED_MULT times his max speed, and back to normal after the sail', () => {
      const state = castSail(s);
      const p = state.players[s];
      const normalMax = PLAYER_BASE_SPEED + p.stats.speed * PLAYER_SPEED_PER_STAT;

      hold(state, s, 60, { moveX: attackDir(state, p.team) });
      expect(Math.abs(p.vx)).toBeCloseTo(normalMax * SAIL_SPEED_MULT, 0);
      expect(p.sailTicks).toBeGreaterThan(0);

      // Stand still until the sail runs out, then the speed is the normal top speed again.
      run(state, SAIL_TICKS - 60);
      expect(p.sailTicks).toBe(0);
      hold(state, s, 60, { moveX: attackDir(state, p.team) });
      expect(Math.abs(p.vx)).toBeCloseTo(normalMax, 0);
    });

    it('dash held while sailing does not stack: speed stays at 1.5x base, not 2.25x', () => {
      const state = castSail(s);
      const p = state.players[s];
      const normalMax = PLAYER_BASE_SPEED + p.stats.speed * PLAYER_SPEED_PER_STAT;

      hold(state, s, 60, { moveX: attackDir(state, p.team), dash: true });

      expect(p.sailTicks).toBeGreaterThan(0);
      expect(Math.abs(p.vx)).toBeCloseTo(normalMax * SAIL_SPEED_MULT, 0);
      expect(Math.abs(p.vx)).toBeLessThan(normalMax * SAIL_SPEED_MULT * 1.2);
    });

    it('is invincible while sailing and not after', () => {
      const state = castSail(s);
      const p = state.players[s];
      expect(isInvincible(p)).toBe(true);
      run(state, SAIL_TICKS);
      expect(p.sailTicks).toBe(0);
      expect(isInvincible(p)).toBe(false);
    });

    it('keeps the ball at his feet while dribbling on the boat', () => {
      const state = castSail(s, true);
      const p = state.players[s];
      for (let t = 0; t < 40; t++) {
        step(state, inputFor(s, { moveX: attackDir(state, p.team) }));
        expect(state.ball.ownerIdx).toBe(s);
        expect(state.ball.x).toBeCloseTo(p.x + p.facingX * (p.radius + DRIBBLE_OFFSET), 9);
        expect(state.ball.y).toBeCloseTo(p.y, 9);
      }
    });

    it('lasts exactly SAIL_TICKS ticks after the cast, then ends with sailEnd', () => {
      const state = castSail(s);
      const p = state.players[s];
      // The cast tick already counted as the first tick of the sail, so SAIL_TICKS - 1 more ticks keep it going.
      const events = run(state, SAIL_TICKS - 1);
      expect(p.sailTicks).toBe(1);
      expect(events.some((e) => e.type === 'sailEnd')).toBe(false);
      const endEvents = run(state, 1);
      expect(p.sailTicks).toBe(0);
      expect(endEvents).toContainEqual({ type: 'sailEnd', playerIdx: s });
    });

    it('J shoots normally while sailing and does not end the sail', () => {
      const state = castSail(s, true);
      const p = state.players[s];
      const shotEvents = run(state, 1, inputFor(s, { j: true }));
      expect(p.action).toBe('charge');
      const released = run(state, 1, inputFor(s, { j: false }));
      expect(released).toContainEqual(expect.objectContaining({ type: 'kick', playerIdx: s, kind: 'shot' }));
      expect(shotEvents.some((e) => e.type === 'sailEnd')).toBe(false);
      expect(p.sailTicks).toBeGreaterThan(0);
    });
  });

  describe('enemy contact', () => {
    it('launches the first opponent touching the hull, ends the sail, and costs the victim 80% stamina', () => {
      const state = castSail(s);
      const sailor = state.players[s];
      const victimIdx = foeBase(s);
      place(state, s, victimIdx, SAIL_HALF_LEN - 10, 0);
      const victim = state.players[victimIdx];
      const stamina0 = victim.stamina;

      const events = run(state, 1);

      expect(events).toContainEqual(expect.objectContaining({ type: 'sailCrash', playerIdx: s, victimIdx }));
      expect(events).toContainEqual({ type: 'hit', attackerIdx: s, victimIdx, kind: 'special', damage: SAIL_CRASH_STAMINA_RATIO * victim.maxStamina });
      expect(events).toContainEqual({ type: 'down', playerIdx: victimIdx });
      expect(events).toContainEqual({ type: 'sailEnd', playerIdx: s });
      expect(sailor.sailTicks).toBe(0);
      expect(victim.action).toBe('down');
      expect(victim.actionTimer).toBe(SAIL_LAUNCH_TICKS);
      expect(victim.stamina).toBeCloseTo(Math.max(0, stamina0 - SAIL_CRASH_STAMINA_RATIO * victim.maxStamina), 6);
      expect(victim.vx).toBeCloseTo(SAIL_LAUNCH_SPEED * Math.sign(victim.x - sailor.x), 6);
      expect(victim.vy).toBeCloseTo(0, 6);
    });

    it('the victim is airborne until LAUNCH_AIR_TICKS, peaks below 50 px, and stays down until SAIL_LAUNCH_TICKS', () => {
      const state = castSail(s);
      const victimIdx = foeBase(s);
      place(state, s, victimIdx, 40, 0);
      const victim = state.players[victimIdx];
      run(state, 1); // contact tick

      let peak = 0;
      for (let t = 1; t < LAUNCH_AIR_TICKS; t++) {
        run(state, 1);
        expect(victim.action).toBe('down');
        expect(victim.z).toBeGreaterThan(0);
        peak = Math.max(peak, victim.z);
      }
      expect(peak).toBeGreaterThan(0);
      expect(peak).toBeLessThan(50);
      run(state, 1);
      expect(victim.z).toBeCloseTo(0, 9);
      expect(victim.vz).toBe(0);
      expect(victim.action).toBe('down');
      for (let t = LAUNCH_AIR_TICKS + 1; t < SAIL_LAUNCH_TICKS; t++) {
        run(state, 1);
        expect(victim.z).toBe(0);
        expect(victim.action).toBe('down');
      }
      run(state, 1);
      expect(victim.z).toBe(0);
      expect(victim.action).toBe('normal');
    });

    it('launch vz is set so that z returns to 0 exactly at LAUNCH_AIR_TICKS, using player gravity', () => {
      // Analytic check of the discrete integration done in applyGravity.
      let vz = SAIL_LAUNCH_VZ;
      let z = 0;
      for (let n = 1; n <= LAUNCH_AIR_TICKS; n++) {
        vz -= PLAYER_GRAVITY * DT;
        z += vz * DT;
        if (n < LAUNCH_AIR_TICKS) expect(z).toBeGreaterThan(0);
      }
      expect(z).toBeCloseTo(0, 9);
      expect(SAIL_LAUNCH_VZ).toBeCloseTo((PLAYER_GRAVITY * 18.5) / 60, 9);
    });

    it('a ball holder who is hit drops the ball as a loose ball', () => {
      const state = castSail(s);
      const victimIdx = foeBase(s);
      place(state, s, victimIdx, 40, 0);
      giveBall(state, victimIdx);

      const events = run(state, 1);

      expect(events).toContainEqual({ type: 'looseBall', playerIdx: victimIdx });
      expect(state.ball.ownerIdx).toBe(-1);
      expect(state.ball.lastTouchIdx).toBe(s);
    });

    it('cancels a beam channel of the victim', () => {
      const state = castSail(s);
      const victimIdx = foeBase(s);
      place(state, s, victimIdx, 40, 0);
      state.players[victimIdx].action = 'cast';
      state.players[victimIdx].actionTimer = 20;

      const events = run(state, 1);

      expect(events).toContainEqual({ type: 'beamCancel', playerIdx: victimIdx });
    });

    it('the sailor keeps the ball when he crashes', () => {
      const state = castSail(s, true);
      place(state, s, foeBase(s), 40, 0);
      run(state, 1);
      expect(state.ball.ownerIdx).toBe(s);
    });

    it('only the first opponent in contact crashes', () => {
      const state = castSail(s);
      const first = foeBase(s);
      const second = first + 1;
      place(state, s, first, 40, 0);
      place(state, s, second, -40, 0);

      const events = run(state, 1);

      const crashes = events.filter((e) => e.type === 'sailCrash');
      expect(crashes).toEqual([expect.objectContaining({ playerIdx: s, victimIdx: first })]);
      expect(state.players[second].action).toBe('normal');
      expect(events.filter((e) => e.type === 'sailEnd')).toHaveLength(1);
    });

    it('the hull is a box: the victim crashes inside its half-length and half-depth plus his radius, not beyond', () => {
      const radius = SIZE_PARAMS.M.radius;
      const inside = (dx: number, dy: number): boolean => {
        const state = castSail(s);
        place(state, s, foeBase(s), dx, dy);
        return run(state, 1).some((e) => e.type === 'sailCrash');
      };
      expect(inside(SAIL_HALF_LEN + radius - 1, 0)).toBe(true);
      expect(inside(SAIL_HALF_LEN + radius + 1, 0)).toBe(false);
      expect(inside(0, SAIL_HALF_DEPTH + radius - 1)).toBe(true);
      expect(inside(0, SAIL_HALF_DEPTH + radius + 1)).toBe(false);
    });

    it('an invincible opponent does not crash the sail', () => {
      const state = castSail(s);
      const foe = state.players[foeBase(s)];
      place(state, s, foe.idx, 40, 0);
      foe.rampageTicks = 60;
      foe.specialNoBall = true;

      const events = run(state, 1);

      expect(events.some((e) => e.type === 'sailCrash')).toBe(false);
      expect(state.players[s].sailTicks).toBeGreaterThan(0);
    });
  });

  describe('passenger', () => {
    it('a teammate touching the hull boards and follows the boat, ignoring his own input', () => {
      const state = castSail(s);
      const sailor = state.players[s];
      const mateIdx = mateBase(s) + 2;
      place(state, s, mateIdx, -30, 0);
      const mate = state.players[mateIdx];

      const events = run(state, 1);
      expect(events).toContainEqual({ type: 'sailBoard', playerIdx: s, passengerIdx: mateIdx });
      expect(sailor.sailPassenger).toBe(mateIdx);
      expect(mate.sailPassengerOf).toBe(s);
      expect(isInvincible(mate)).toBe(true);

      // The boat moves; the passenger tracks it and his own inputs (move, J, K, L) do nothing.
      const backward = -attackDir(state, sailor.team);
      for (let t = 0; t < 40; t++) {
        step(state, inputFor(mateIdx, { moveX: backward as -1 | 1, j: true, k: true, l: true }));
        expect(mate.x).toBeCloseTo(sailor.x - sailor.facingX * SAIL_PASSENGER_BEHIND, 9);
        expect(mate.y).toBeCloseTo(sailor.y, 9);
        expect(mate.vx).toBe(0);
        expect(mate.z).toBe(0);
      }
      expect(mate.specialBuffer).toBe(0);
      expect(state.players[mateIdx].sailPassengerOf).toBe(s);
    });

    it('a passenger holding the ball keeps it and cannot kick it', () => {
      const state = castSail(s);
      const mateIdx = mateBase(s) + 2;
      place(state, s, mateIdx, -30, 0);
      run(state, 1);
      giveBall(state, mateIdx);

      run(state, 10, inputFor(mateIdx, { j: true }));
      run(state, 10, inputFor(mateIdx, { j: false }));

      expect(state.ball.ownerIdx).toBe(mateIdx);
      expect(state.players[mateIdx].action).toBe('normal');
      expect(state.players[mateIdx].chargeTicks).toBe(0);
    });

    it('only one passenger boards per sail', () => {
      const state = castSail(s);
      const first = mateBase(s) + 2;
      const second = mateBase(s) + 3;
      place(state, s, first, -30, 0);
      place(state, s, second, 0, 24);

      const events = run(state, 1);

      expect(events.filter((e) => e.type === 'sailBoard')).toEqual([
        { type: 'sailBoard', playerIdx: s, passengerIdx: first },
      ]);
      expect(state.players[second].sailPassengerOf).toBe(-1);
    });

    it('a passenger is released at his position when the timer ends', () => {
      const state = castSail(s);
      const mateIdx = mateBase(s) + 2;
      place(state, s, mateIdx, -30, 0);
      run(state, 1);
      const mate = state.players[mateIdx];
      expect(mate.sailPassengerOf).toBe(s);

      // Ticks left after the boarding tick: sail ends on tick SAIL_TICKS after the cast.
      const events = run(state, SAIL_TICKS - 1);
      const dropX = mate.x;
      const dropY = mate.y;

      expect(events).toContainEqual({ type: 'sailEnd', playerIdx: s });
      expect(events).toContainEqual({ type: 'sailDrop', playerIdx: s, passengerIdx: mateIdx });
      expect(mate.sailPassengerOf).toBe(-1);
      expect(state.players[s].sailPassenger).toBe(-1);
      expect(mate.action).toBe('normal');
      expect(mate.x).toBeCloseTo(dropX, 9);
      expect(mate.y).toBeCloseTo(dropY, 9);
    });

    it('a passenger is released when an enemy crash ends the sail', () => {
      const state = castSail(s);
      const mateIdx = mateBase(s) + 2;
      place(state, s, mateIdx, -30, 0);
      run(state, 1);
      place(state, s, foeBase(s), 40, 0);

      const events = run(state, 1);

      expect(events).toContainEqual(expect.objectContaining({ type: 'sailCrash', playerIdx: s }));
      expect(events).toContainEqual({ type: 'sailDrop', playerIdx: s, passengerIdx: mateIdx });
      expect(state.players[mateIdx].sailPassengerOf).toBe(-1);
      expect(isInvincible(state.players[mateIdx])).toBe(false);
    });

    it('a passenger is released silently when the phase leaves play', () => {
      const state = castSail(s);
      const mateIdx = mateBase(s) + 2;
      place(state, s, mateIdx, -30, 0);
      run(state, 1);

      state.match.phase = 'goal';
      const events = run(state, 1);

      expect(events).toContainEqual({ type: 'sailEnd', playerIdx: s });
      expect(events).toContainEqual({ type: 'sailDrop', playerIdx: s, passengerIdx: mateIdx });
      expect(events.some((e) => e.type === 'sailCrash' || e.type === 'hit')).toBe(false);
      expect(state.players[mateIdx].sailPassengerOf).toBe(-1);
      expect(state.players[s].sailTicks).toBe(0);
    });
  });

  describe('phase cleanup', () => {
    it('a sail ends silently when the phase leaves play, with no launch', () => {
      const state = castSail(s);
      const victimIdx = foeBase(s);
      place(state, s, victimIdx, 40, 0);

      state.match.phase = 'halftime';
      const events = run(state, 1);

      expect(events).toContainEqual({ type: 'sailEnd', playerIdx: s });
      expect(events.some((e) => e.type === 'sailCrash')).toBe(false);
      expect(state.players[victimIdx].action).not.toBe('down');
      expect(state.players[s].sailTicks).toBe(0);
    });
  });

  it('is deterministic: the same script gives the same events and state', () => {
    const script = (): { events: SimEvent[]; players: string; ball: string } => {
      const state = castSail(s, true, 7);
      const mateIdx = mateBase(s) + 2;
      place(state, s, mateIdx, -30, 0);
      const events: SimEvent[] = [];
      events.push(...run(state, 20, inputFor(s, { moveX: attackDir(state, state.players[s].team) })));
      place(state, s, foeBase(s), 40, 0);
      events.push(...run(state, 90));
      return { events, players: JSON.stringify(state.players), ball: JSON.stringify(state.ball) };
    };
    expect(script()).toEqual(script());
  });
});
