import { describe, expect, it } from 'vitest';
import type { BodySize, CharacterDef, Role, SizeParams } from '../data/types';
import {
  FIELD_D,
  FIELD_W,
  GOAL_CELEBRATE_TICKS,
  HALFTIME_TICKS,
  SPECIAL_STRAIGHT_SPEED,
  TICK_HZ,
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

function makeDef(id: string, role: Role, size: BodySize, speed = 5): CharacterDef {
  return {
    id,
    name: id,
    country: 'wei',
    role,
    size,
    stats: { power: 5, speed, stamina: 5, technique: 5, defense: 5 },
    special: { name: 'test', kind: 'straight' },
  };
}

function makeTeam(prefix: string): CharacterDef[] {
  return ROLES.map((role, i) => makeDef(`${prefix}${i}`, role, 'M'));
}

function gkWithDefense(defense: number): CharacterDef {
  const def = makeDef('gk', 'GK', 'M');
  return { ...def, stats: { ...def.stats, defense } };
}

function makeSetup(seed: number, extra: Partial<MatchSetup> = {}): MatchSetup {
  return { seed, teams: [makeTeam('a'), makeTeam('b')], startInPlay: true, ...extra };
}

/** Test-local mulberry32 used only to generate input sequences. */
function testRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomFrames(seed: number, ticks: number): InputFrame[][] {
  const rand = testRng(seed);
  const out: InputFrame[][] = [];
  for (let t = 0; t < ticks; t++) {
    const frame: InputFrame[] = [];
    for (let i = 0; i < 10; i++) {
      frame.push({
        moveX: (Math.floor(rand() * 3) - 1) as -1 | 0 | 1,
        moveY: (Math.floor(rand() * 3) - 1) as -1 | 0 | 1,
        dash: rand() < 0.1,
        j: rand() < 0.05,
        k: rand() < 0.05,
        l: rand() < 0.05,
      });
    }
    out.push(frame);
  }
  return out;
}

function inputFor(idx: number, frame: Partial<InputFrame>): InputFrame[] {
  const arr: InputFrame[] = [];
  arr[idx] = { moveX: 0, moveY: 0, dash: false, j: false, k: false, l: false, ...frame };
  return arr;
}

/** Steps `ticks` times with the same inputs and returns all events seen. */
function run(state: GameState, ticks: number, inputs: InputFrame[] = []): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) {
    step(state, inputs);
    events.push(...state.events);
  }
  return events;
}

/** Steps until `done` holds (no inputs) and returns all events seen. */
function runUntil(state: GameState, done: (s: GameState) => boolean, maxTicks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < maxTicks && !done(state); t++) {
    step(state, []);
    events.push(...state.events);
  }
  expect(done(state)).toBe(true);
  return events;
}

/** Moves every player to a column far from the action so they cannot touch the ball. */
function parkPlayers(state: GameState): void {
  state.players.forEach((p, i) => {
    p.x = 300;
    p.y = 20 + i * 24;
  });
}

describe('kickoff', () => {
  it('a new match waits 60 ticks with inputs ignored, then whistles and starts play', () => {
    const state = createInitialState(makeSetup(1, { startInPlay: false }), SIZE_PARAMS);
    expect(state.match.phase).toBe('kickoff');
    const x0 = state.players[0].x;

    const events = run(state, 59, inputFor(0, { moveX: 1 }));
    expect(state.match.phase).toBe('kickoff');
    expect(events.some((e) => e.type === 'whistle')).toBe(false);

    const last = run(state, 1, inputFor(0, { moveX: 1 }));
    expect(last).toContainEqual({ type: 'whistle', reason: 'kickoff' });
    expect(state.match.phase).toBe('play');
    expect(state.players[0].x).toBe(x0);
  });
});

describe('clock and halves', () => {
  it('first half ends after 120 play ticks, then the second half starts on mirrored sides', () => {
    const state = createInitialState(makeSetup(1, { halfSeconds: 2, startInPlay: false }), SIZE_PARAMS);
    expect(state.match.clockTicks).toBe(120);
    run(state, TICK_HZ);
    expect(state.match.phase).toBe('play');

    run(state, 119);
    expect(state.match.phase).toBe('play');
    expect(state.match.clockTicks).toBe(1);

    const whistle = run(state, 1);
    expect(whistle).toContainEqual({ type: 'whistle', reason: 'half' });
    expect(state.match.phase).toBe('halftime');

    run(state, HALFTIME_TICKS - 1);
    expect(state.match.phase).toBe('halftime');
    run(state, 1);
    expect(state.match.half).toBe(2);
    expect(state.match.swapped).toBe(true);
    expect(state.match.kickoffTeam).toBe(1);
    expect(state.match.phase).toBe('kickoff');
    expect(state.players[0].x).toBe(FIELD_W - 40);
    expect(state.players[0].facingX).toBe(-1);
    expect(state.players[5].x).toBe(40);
    expect(state.players[5].facingX).toBe(1);
  });
});

describe('goals', () => {
  it('ball into the right goal scores for team 0, then team 1 kicks off from the center', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    parkPlayers(state);
    const b = state.ball;
    b.x = 1100;
    b.y = FIELD_D / 2;
    b.vx = 400;
    b.lastTouchIdx = 4;

    const events = runUntil(state, (s) => s.match.phase === 'goal', 200);
    expect(events).toContainEqual({ type: 'goal', team: 0, scorerIdx: 4 });
    expect(state.match.score).toEqual([1, 0]);
    expect(state.match.lastGoal).toMatchObject({ team: 0, scorerIdx: 4 });
    expect(state.match.kickoffTeam).toBe(1);

    run(state, GOAL_CELEBRATE_TICKS - 1);
    expect(state.match.phase).toBe('goal');
    run(state, 1);
    expect(state.match.phase).toBe('kickoff');
    expect(b.x).toBe(FIELD_W / 2);
    expect(b.y).toBe(FIELD_D / 2);
    expect(b.ownerIdx).toBe(-1);
    expect(b.vx).toBe(0);
    expect(state.players[9].x).toBe(FIELD_W / 2 + 14);
  });

  it('own goal: a team 0 touch entering the left goal counts for team 1', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    parkPlayers(state);
    const b = state.ball;
    b.x = 100;
    b.y = FIELD_D / 2;
    b.vx = -400;
    b.lastTouchIdx = 0;

    const events = runUntil(state, (s) => s.match.phase === 'goal', 200);
    expect(events).toContainEqual({ type: 'goal', team: 1, scorerIdx: 0 });
    expect(state.match.score).toEqual([0, 1]);
  });

  it('in the second half team 0 attacks -x: a tap shot is aimed at x=0', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    parkPlayers(state);
    state.match.swapped = true;
    const fw = state.players[4];
    fw.x = FIELD_W - 540;
    fw.y = FIELD_D / 2;
    fw.facingX = -1;
    fw.facingY = 0;
    state.ball.ownerIdx = 4;
    state.ball.lastTouchIdx = 4;

    run(state, 1, inputFor(4, { j: true }));
    const events = run(state, 1);
    expect(events).toContainEqual({ type: 'kick', playerIdx: 4, kind: 'shot', targetIdx: -1 });
    expect(state.ball.vx).toBeLessThan(0);
  });

  it('in the second half a goal at x<0 credits team 0', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    parkPlayers(state);
    state.match.swapped = true;
    const b = state.ball;
    b.x = 100;
    b.y = FIELD_D / 2;
    b.vx = -400;
    b.lastTouchIdx = 4;

    const events = runUntil(state, (s) => s.match.phase === 'goal', 200);
    expect(events).toContainEqual({ type: 'goal', team: 0, scorerIdx: 4 });
    expect(state.match.score).toEqual([1, 0]);
  });
});

describe('full time', () => {
  it('second half ends with a lead: fulltime and matchEnd', () => {
    const state = createInitialState(makeSetup(1, { halfSeconds: 2, startInPlay: false }), SIZE_PARAMS);
    state.match.score = [1, 0];
    const events = runUntil(
      state,
      (s) => s.match.phase === 'fulltime' || s.match.phase === 'pk',
      2000,
    );
    expect(state.match.phase).toBe('fulltime');
    expect(events).toContainEqual({ type: 'matchEnd', score: [1, 0] });
    expect(events.some((e) => e.type === 'pkStart')).toBe(false);
  });

  it('a tied second half goes to PK', () => {
    const state = createInitialState(makeSetup(1, { halfSeconds: 2, startInPlay: false }), SIZE_PARAMS);
    const events = runUntil(
      state,
      (s) => s.match.phase === 'fulltime' || s.match.phase === 'pk',
      2000,
    );
    expect(state.match.phase).toBe('pk');
    expect(events).toContainEqual({ type: 'pkStart' });
    expect(events.some((e) => e.type === 'matchEnd')).toBe(false);
  });
});

describe('goalkeeper catching', () => {
  it('GK catches a slow high ball in its own area that a field player cannot', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    parkPlayers(state);
    state.players[0].x = 40;
    state.players[0].y = FIELD_D / 2;
    state.ball.x = 60;
    state.ball.y = FIELD_D / 2;
    state.ball.z = 30;
    step(state, []);
    expect(state.events).toContainEqual({ type: 'pickup', playerIdx: 0 });
    expect(state.ball.ownerIdx).toBe(0);

    const field = createInitialState(makeSetup(1), SIZE_PARAMS);
    parkPlayers(field);
    field.players[1].x = 300;
    field.players[1].y = FIELD_D / 2;
    field.ball.x = 310;
    field.ball.y = FIELD_D / 2;
    field.ball.z = 30;
    step(field, []);
    expect(field.events.some((e) => e.type === 'pickup')).toBe(false);
    expect(field.ball.ownerIdx).toBe(-1);
  });

  it('GK dive covers ground fast, then recovers, then returns to normal', () => {
    const state = createInitialState(makeSetup(1), SIZE_PARAMS);
    parkPlayers(state);
    const gk = state.players[0];
    gk.x = 40;
    gk.y = FIELD_D / 2;
    const y0 = gk.y;

    const first = run(state, 1, inputFor(0, { j: true, moveY: 1 }));
    expect(gk.action).toBe('dive');
    expect(first).toContainEqual({ type: 'dive', playerIdx: 0 });

    run(state, 19, inputFor(0, { moveY: 1 }));
    expect(gk.action).toBe('dive');
    const diveDist = Math.abs(gk.y - y0);
    expect(diveDist).toBeGreaterThan(30);

    run(state, 1);
    expect(gk.action).toBe('recover');
    run(state, 19);
    expect(gk.action).toBe('recover');
    run(state, 1);
    expect(gk.action).toBe('normal');
  });

  it('GK dive covers more ground than walking the same ticks', () => {
    const dive = createInitialState(makeSetup(1), SIZE_PARAMS);
    const walk = createInitialState(makeSetup(1), SIZE_PARAMS);
    for (const s of [dive, walk]) {
      parkPlayers(s);
      s.players[0].x = 40;
      s.players[0].y = FIELD_D / 2;
    }
    run(dive, 1, inputFor(0, { j: true, moveY: 1 }));
    run(dive, 19, inputFor(0, { moveY: 1 }));
    run(walk, 20, inputFor(0, { moveY: 1 }));
    expect(Math.abs(dive.players[0].y - FIELD_D / 2)).toBeGreaterThan(
      Math.abs(walk.players[0].y - FIELD_D / 2),
    );
  });

  it('fast shot catch rate over 100 seeds matches the defense formula, and a parry sends the ball away', () => {
    let caught = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const setup = makeSetup(seed);
      setup.teams[0][0] = gkWithDefense(9);
      const state = createInitialState(setup, SIZE_PARAMS);
      parkPlayers(state);
      state.players[0].x = 40;
      state.players[0].y = FIELD_D / 2;
      state.ball.x = 60;
      state.ball.y = FIELD_D / 2;
      state.ball.vx = -400;
      step(state, []);

      const save = state.events.find((e) => e.type === 'save');
      expect(save).toBeDefined();
      if (save && save.type === 'save' && save.caught) {
        caught++;
        expect(state.ball.ownerIdx).toBe(0);
      } else {
        expect(state.ball.ownerIdx).toBe(-1);
        expect(state.ball.vx).toBeGreaterThan(0);
        expect(state.ball.lastTouchIdx).toBe(0);
      }
    }
    const rate = caught / 100;
    expect(rate).toBeGreaterThan(0.87 - 0.12);
    expect(rate).toBeLessThan(0.87 + 0.12);
  });

  it('special shot vs GK over 100 seeds: some saves and some fails; a save gives the keeper the ball', () => {
    let saves = 0;
    let fails = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const setup = makeSetup(seed);
      setup.teams[1][0] = gkWithDefense(9);
      const state = createInitialState(setup, SIZE_PARAMS);
      parkPlayers(state);
      state.players[5].x = FIELD_W - 40;
      state.players[5].y = FIELD_D / 2;
      state.ball.x = 1100;
      state.ball.y = FIELD_D / 2;
      state.ball.vx = 0;
      state.ball.special = {
        kind: 'straight',
        shooterIdx: 4,
        team: 0,
        ticks: 0,
        dirX: 1,
        dirY: 0,
        speed: SPECIAL_STRAIGHT_SPEED,
        hit: [],
        rolled: [],
      };

      let saved = false;
      let hitGk = false;
      for (let t = 0; t < 60 && state.ball.special !== null; t++) {
        step(state, []);
        if (state.events.some((e) => e.type === 'hit' && e.victimIdx === 5)) hitGk = true;
        if (state.events.some((e) => e.type === 'save' && e.caught)) {
          saved = true;
          expect(state.ball.ownerIdx).toBe(5);
          expect(state.ball.special).toBeNull();
          expect(state.events).toContainEqual({ type: 'specialEnd' });
          break;
        }
      }
      if (saved) saves++;
      else {
        fails++;
        expect(hitGk).toBe(true);
      }
    }
    expect(saves).toBeGreaterThan(10);
    expect(fails).toBeGreaterThan(10);
  });
});

describe('determinism', () => {
  it('a full short match with random inputs hashes the same twice and reaches the end', () => {
    const frames = randomFrames(99, 4000);
    const finish = (): GameState => {
      const state = createInitialState(makeSetup(42, { halfSeconds: 5, startInPlay: false }), SIZE_PARAMS);
      for (const frame of frames) {
        if (state.match.phase === 'fulltime' || state.match.phase === 'pk') break;
        step(state, frame);
      }
      return state;
    };
    const a = finish();
    const b = finish();
    expect(['fulltime', 'pk']).toContain(a.match.phase);
    expect(hashState(a)).toBe(hashState(b));
  });
});
