import { describe, expect, it } from 'vitest';
import { SIZE_PARAMS, getTeam } from '../data/characters';
import {
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  GOAL_HALF_W,
  RIDE_DISTANCE,
  RIDE_LANE_HALF,
  createInitialState,
  RAMPAGE_TICKS,
  SAIL_TICKS,
  SILENCE_TICKS,
  SLASH_TICKS,
  SLASH_WAVE_RANGE,
  SPECIAL_COOLDOWN_TICKS,
  SPECIAL_STRAIGHT_SPEED,
  TIGER_GUARD_TICKS,
  hashState,
  ownGoalX,
  step,
  type GameState,
  type InputFrame,
  type SimEvent,
} from '../sim';
import { computeAIInputs, createAIState, type AIState } from './ai';

const NO_HUMANS = Array.from({ length: 10 }, () => false);
const FULL_MATCH_TIMEOUT_MS = 60_000;

interface MatchReport {
  seed: number;
  ticks: number;
  finalPhase: string;
  score: [number, number];
  shots: [number, number];
  specials: [number, number];
  rampages: number;
  rides: number;
  hits: number;
  goals: number;
  pickups: number;
  ownerChanges: number;
  nanTicks: number;
}

function allFinite(state: GameState): boolean {
  const values: number[] = [];
  for (const p of state.players) values.push(p.x, p.y, p.z, p.vx, p.vy, p.vz);
  values.push(state.ball.x, state.ball.y, state.ball.z, state.ball.vx, state.ball.vy, state.ball.vz);
  return values.every((v) => Number.isFinite(v));
}

/** Runs an all-AI match from kickoff (real teams, 2 min halves) until full time or PK, capped at maxTicks. */
function runMatch(
  seed: number,
  maxTicks = 40000,
  halfSeconds = 120,
): { state: GameState; report: MatchReport } {
  const state = createInitialState(
    { seed, teams: [getTeam('shu'), getTeam('wei')], halfSeconds },
    SIZE_PARAMS,
  );
  const ai = createAIState(seed);
  const report: MatchReport = {
    seed,
    ticks: 0,
    finalPhase: state.match.phase,
    score: [0, 0],
    shots: [0, 0],
    specials: [0, 0],
    rampages: 0,
    rides: 0,
    hits: 0,
    goals: 0,
    pickups: 0,
    ownerChanges: 0,
    nanTicks: 0,
  };
  let lastOwnerTeam = -1;

  while (report.ticks < maxTicks && state.match.phase !== 'fulltime' && state.match.phase !== 'pk') {
    step(state, computeAIInputs(state, ai, NO_HUMANS));
    report.ticks++;
    if (!allFinite(state)) report.nanTicks++;

    for (const e of state.events) {
      if (e.type === 'kick' && e.kind === 'shot') report.shots[state.players[e.playerIdx].team]++;
      else if (e.type === 'specialShot') report.specials[state.players[e.playerIdx].team]++;
      else if (e.type === 'rampageStart') report.rampages++;
      else if (e.type === 'rideStart') report.rides++;
      else if (e.type === 'hit') report.hits++;
      else if (e.type === 'goal') report.goals++;
      else if (e.type === 'pickup') report.pickups++;
    }

    if (state.ball.ownerIdx !== -1) {
      const team = state.players[state.ball.ownerIdx].team;
      if (lastOwnerTeam !== -1 && team !== lastOwnerTeam) report.ownerChanges++;
      lastOwnerTeam = team;
    }
  }

  report.finalPhase = state.match.phase;
  report.score = [state.match.score[0], state.match.score[1]];
  return { state, report };
}

describe('AI full match', () => {
  it(
    'plays a full AI-vs-AI match to the end with live play, shots, pickups and possession changes',
    () => {
      const { report } = runMatch(1);
      console.log(
        `[AI match seed 1] ticks=${report.ticks} phase=${report.finalPhase} score=${report.score[0]}-${report.score[1]} ` +
          `shots(shu/wei)=${report.shots[0]}/${report.shots[1]} specials(shu/wei)=${report.specials[0]}/${report.specials[1]} ` +
          `rampages=${report.rampages} rides=${report.rides} hits=${report.hits} goals=${report.goals} pickups=${report.pickups} ownerChanges=${report.ownerChanges}`,
      );

      expect(['fulltime', 'pk']).toContain(report.finalPhase);
      expect(report.nanTicks).toBe(0);
      expect(report.shots[0] + report.shots[1] + report.specials[0] + report.specials[1]).toBeGreaterThanOrEqual(5);
      expect(report.pickups).toBeGreaterThanOrEqual(30);
      // Charge specials: rampages (owner rampagers) and Guan Yu's rides.
      expect(report.rampages + report.rides).toBeGreaterThanOrEqual(1);
      expect(report.ownerChanges).toBeGreaterThanOrEqual(10);
    },
    FULL_MATCH_TIMEOUT_MS,
  );

  it(
    'scores goals across 5 seeds',
    () => {
      const reports = [1, 2, 3, 4, 5].map((seed) => runMatch(seed).report);
      for (const r of reports) {
        console.log(
          `[AI match seed ${r.seed}] goals=${r.goals} score=${r.score[0]}-${r.score[1]} phase=${r.finalPhase} ` +
            `shots=${r.shots[0]}/${r.shots[1]} specials=${r.specials[0]}/${r.specials[1]} rampages=${r.rampages} hits=${r.hits}`,
        );
      }
      const total = reports.reduce((sum, r) => sum + r.goals, 0);
      console.log(`[AI match] total goals across seeds 1-5 = ${total}`);
      expect(total).toBeGreaterThan(0);
    },
    FULL_MATCH_TIMEOUT_MS,
  );

  it('the same seed gives the same final hashState', () => {
    const a = runMatch(7, 3000).state;
    const b = runMatch(7, 3000).state;
    expect(hashState(a)).toBe(hashState(b));
  });

  it('finishes a full AI match in under 5 seconds', () => {
    const proc = (globalThis as unknown as { process: { hrtime: { bigint(): bigint } } }).process;
    const t0 = proc.hrtime.bigint();
    runMatch(11);
    const ms = Number(proc.hrtime.bigint() - t0) / 1e6;
    console.log(`[AI match seed 11] wall time ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(5000);
  }, FULL_MATCH_TIMEOUT_MS);
});

/** Players in a row far from the action, ball loose at midfield. Shu is idx 0-4, wei is idx 5-9. */
function specialState(seed: number): GameState {
  const state = createInitialState({ seed, teams: [getTeam('shu'), getTeam('wei')], startInPlay: true }, SIZE_PARAMS);
  state.players.forEach((p, i) => {
    p.x = 100;
    p.y = 20 + i * 24;
  });
  state.ball.ownerIdx = -1;
  state.ball.x = 600;
  state.ball.y = FIELD_D / 2;
  return state;
}

function place(state: GameState, idx: number, x: number, y: number, facingX = 1): void {
  const p = state.players[idx];
  p.x = x;
  p.y = y;
  p.facingX = facingX;
  p.facingY = 0;
}

/** Gives the ball to player idx, at his feet. */
function carry(state: GameState, idx: number): void {
  const p = state.players[idx];
  state.ball.x = p.x + p.radius + DRIBBLE_OFFSET;
  state.ball.y = p.y;
  state.ball.ownerIdx = idx;
  state.ball.lastTouchIdx = idx;
}

/**
 * Drives only player idx with the AI for `ticks` ticks; the other nine stand still. With `pin`, the player is put back
 * on its start spot and facing before every tick, so a condition that holds at the start keeps holding.
 */
function driveOne(
  state: GameState,
  ai: AIState,
  idx: number,
  ticks: number,
  pin: boolean,
): { pressedL: boolean; pressedJ: boolean; pressedK: boolean } {
  const p = state.players[idx];
  const { x, y, facingX, facingY } = p;
  const seen = { pressedL: false, pressedJ: false, pressedK: false };
  for (let t = 0; t < ticks; t++) {
    if (pin) Object.assign(p, { x, y, facingX, facingY });
    const frames = computeAIInputs(state, ai, NO_HUMANS).map((f, i) => (i === idx ? f : { ...EMPTY_INPUT }));
    seen.pressedL = seen.pressedL || frames[idx].l;
    seen.pressedJ = seen.pressedJ || frames[idx].j;
    seen.pressedK = seen.pressedK || frames[idx].k;
    step(state, frames);
  }
  return seen;
}

describe('AI specials (no-ball and owner rules)', () => {
  const TICKS = 400;

  it('Zhang Liao casts fear as the owner when two opponents are within 200 px, and not with only one near', () => {
    const two = specialState(21);
    place(two, 9, 900, FIELD_D / 2);
    place(two, 0, 860, FIELD_D / 2);
    place(two, 1, 860, FIELD_D / 2 + 40);
    carry(two, 9);
    expect(driveOne(two, createAIState(21), 9, TICKS, true).pressedL).toBe(true);

    const one = specialState(21);
    place(one, 9, 900, FIELD_D / 2);
    place(one, 0, 780, FIELD_D / 2);
    carry(one, 9);
    expect(driveOne(one, createAIState(21), 9, TICKS, true).pressedL).toBe(false);
  });

  it('Zhang Liao casts fear off the ball when an opponent carries it within 200 px, and not from 300 px with one opponent near', () => {
    const near = specialState(22);
    place(near, 9, 900, FIELD_D / 2);
    place(near, 2, 760, FIELD_D / 2);
    carry(near, 2);
    expect(driveOne(near, createAIState(22), 9, TICKS, true).pressedL).toBe(true);

    const far = specialState(22);
    place(far, 9, 900, FIELD_D / 2);
    place(far, 0, 800, FIELD_D / 2);
    place(far, 2, 600, FIELD_D / 2);
    carry(far, 2);
    expect(driveOne(far, createAIState(22), 9, TICKS, true).pressedL).toBe(false);
  });

  it('Zhang Liao casts fear off the ball with two opponents within 200 px, but not with one and no carrier', () => {
    const two = specialState(23);
    place(two, 9, 900, FIELD_D / 2);
    place(two, 0, 860, FIELD_D / 2);
    place(two, 1, 860, FIELD_D / 2 + 40);
    expect(driveOne(two, createAIState(23), 9, TICKS, true).pressedL).toBe(true);

    const one = specialState(23);
    place(one, 9, 900, FIELD_D / 2);
    place(one, 0, 860, FIELD_D / 2);
    expect(driveOne(one, createAIState(23), 9, TICKS, true).pressedL).toBe(false);
  });

  it('Zhuge Liang casts the beam off the ball when an opponent carries it in our defensive half, and not in their half', () => {
    const own = specialState(24);
    place(own, 2, 500, FIELD_D / 2);
    place(own, 7, 300, FIELD_D / 2);
    carry(own, 7);
    expect(driveOne(own, createAIState(24), 2, TICKS, true).pressedL).toBe(true);

    const theirs = specialState(24);
    place(theirs, 2, 500, FIELD_D / 2);
    place(theirs, 7, 900, FIELD_D / 2);
    carry(theirs, 7);
    expect(driveOne(theirs, createAIState(24), 2, TICKS, true).pressedL).toBe(false);
  });

  it('Guan Yu rides off the ball when an opponent carrier is in his lane, and not when the carrier is beside, behind or beyond it', () => {
    const inLane = specialState(25);
    place(inLane, 1, 400, FIELD_D / 2, 1);
    place(inLane, 7, 600, FIELD_D / 2);
    carry(inLane, 7);
    expect(driveOne(inLane, createAIState(25), 1, TICKS, true).pressedL).toBe(true);

    const outside: [string, number, number][] = [
      ['beside the lane', 600, FIELD_D / 2 + RIDE_LANE_HALF + 15],
      ['behind him', 300, FIELD_D / 2],
      ['beyond the ride', 400 + RIDE_DISTANCE + 20, FIELD_D / 2],
    ];
    for (const [name, x, y] of outside) {
      const state = specialState(25);
      place(state, 1, 400, FIELD_D / 2, 1);
      place(state, 7, x, y);
      carry(state, 7);
      expect(driveOne(state, createAIState(25), 1, TICKS, true).pressedL, name).toBe(false);
    }
  });

  it('Guan Yu rides off the ball when two standing opponents are in his lane with no carrier there, and not with only one', () => {
    const two = specialState(25);
    place(two, 1, 400, FIELD_D / 2, 1);
    place(two, 5, 600, FIELD_D / 2);
    place(two, 6, 650, FIELD_D / 2 + 20);
    two.ball.x = 1100;
    two.ball.y = 30;
    expect(driveOne(two, createAIState(25), 1, TICKS, true).pressedL).toBe(true);

    const one = specialState(25);
    place(one, 1, 400, FIELD_D / 2, 1);
    place(one, 5, 600, FIELD_D / 2);
    one.ball.x = 1100;
    one.ball.y = 30;
    expect(driveOne(one, createAIState(25), 1, TICKS, true).pressedL).toBe(false);
  });

  it('Guan Yu rides as the owner to escape when an opponent is within 90 px facing goal, and not when that opponent is 120 px away or he faces away', () => {
    const escape = specialState(25);
    place(escape, 1, 400, FIELD_D / 2, 1);
    place(escape, 5, 480, FIELD_D / 2);
    carry(escape, 1);
    expect(driveOne(escape, createAIState(25), 1, TICKS, true).pressedL).toBe(true);

    const far = specialState(25);
    place(far, 1, 400, FIELD_D / 2, 1);
    place(far, 5, 520, FIELD_D / 2);
    carry(far, 1);
    expect(driveOne(far, createAIState(25), 1, TICKS, true).pressedL).toBe(false);

    const away = specialState(25);
    place(away, 1, 400, FIELD_D / 2, -1);
    place(away, 5, 480, FIELD_D / 2);
    carry(away, 1);
    expect(driveOne(away, createAIState(25), 1, TICKS, true).pressedL).toBe(false);
  });

  it('Guan Yu rides as the owner to drive it in when the goal line is within 260 px inside the mouth, and not from 300 px or outside the mouth', () => {
    // Guan Yu is a DF: inside 250 px the plain tap shot takes the ball first, so the drive-in window is 250..260 px.
    const near = specialState(25);
    place(near, 1, FIELD_W - 255, FIELD_D / 2, 1);
    carry(near, 1);
    expect(driveOne(near, createAIState(25), 1, TICKS, true).pressedL).toBe(true);

    const far = specialState(25);
    place(far, 1, FIELD_W - 300, FIELD_D / 2, 1);
    carry(far, 1);
    expect(driveOne(far, createAIState(25), 1, TICKS, true).pressedL).toBe(false);

    const wide = specialState(25);
    place(wide, 1, FIELD_W - 200, FIELD_D / 2 + GOAL_HALF_W + 10, 1);
    carry(wide, 1);
    expect(driveOne(wide, createAIState(25), 1, TICKS, true).pressedL).toBe(false);
  });

  it('Zhao Yun lunges off the ball at a carrier in front of him, and not when facing away or beyond 190 px', () => {
    const inFront = specialState(27);
    place(inFront, 4, 500, FIELD_D / 2, 1);
    place(inFront, 7, 600, FIELD_D / 2);
    carry(inFront, 7);
    expect(driveOne(inFront, createAIState(27), 4, TICKS, true).pressedL).toBe(true);

    const behind = specialState(27);
    place(behind, 4, 500, FIELD_D / 2, -1);
    place(behind, 7, 600, FIELD_D / 2);
    carry(behind, 7);
    expect(driveOne(behind, createAIState(27), 4, TICKS, true).pressedL).toBe(false);

    const beyond = specialState(27);
    place(beyond, 4, 500, FIELD_D / 2, 1);
    place(beyond, 7, 800, FIELD_D / 2);
    carry(beyond, 7);
    expect(driveOne(beyond, createAIState(27), 4, TICKS, true).pressedL).toBe(false);
  });

  it('Ma Chao summons off the ball when two opponents are within 200 px, and not with only one', () => {
    const two = specialState(28);
    place(two, 3, 500, FIELD_D / 2);
    place(two, 7, 600, FIELD_D / 2);
    place(two, 8, 550, FIELD_D / 2 + 30);
    carry(two, 7);
    expect(driveOne(two, createAIState(28), 3, TICKS, true).pressedL).toBe(true);

    const one = specialState(28);
    place(one, 3, 500, FIELD_D / 2);
    place(one, 7, 600, FIELD_D / 2);
    place(one, 8, 1000, FIELD_D / 2);
    carry(one, 7);
    expect(driveOne(one, createAIState(28), 3, TICKS, true).pressedL).toBe(false);
  });

  it('Sima Yi leaps off the ball when an opponent carrier is in his landing spot, and not when the carrier is too near or too far ahead', () => {
    const inSpot = specialState(29);
    place(inSpot, 8, 500, FIELD_D / 2, 1);
    place(inSpot, 2, 790, FIELD_D / 2);
    carry(inSpot, 2);
    expect(driveOne(inSpot, createAIState(29), 8, TICKS, true).pressedL).toBe(true);

    const tooNear = specialState(29);
    place(tooNear, 8, 500, FIELD_D / 2, 1);
    place(tooNear, 2, 700, FIELD_D / 2);
    carry(tooNear, 2);
    expect(driveOne(tooNear, createAIState(29), 8, TICKS, true).pressedL).toBe(false);

    const tooFar = specialState(29);
    place(tooFar, 8, 500, FIELD_D / 2, 1);
    place(tooFar, 2, 900, FIELD_D / 2);
    carry(tooFar, 2);
    expect(driveOne(tooFar, createAIState(29), 8, TICKS, true).pressedL).toBe(false);
  });

  it('Sima Yi leaps off the ball when two opponents stand in his landing spot, even with the carrier 100 px off it', () => {
    const state = specialState(30);
    place(state, 8, 500, FIELD_D / 2, 1);
    place(state, 2, 770, FIELD_D / 2 + 100);
    place(state, 0, 790, FIELD_D / 2);
    place(state, 1, 790, FIELD_D / 2 + 20);
    carry(state, 2);
    expect(driveOne(state, createAIState(30), 8, TICKS, true).pressedL).toBe(true);
  });

  it('a silenced Sima Yi off the ball never presses J, K or L, even with a carrier in his landing spot', () => {
    const state = specialState(31);
    place(state, 8, 500, FIELD_D / 2, 1);
    place(state, 2, 790, FIELD_D / 2);
    carry(state, 2);
    state.players[8].silenceTicks = SILENCE_TICKS;
    // Silence wears off after SILENCE_TICKS steps, so only watch inside that window.
    const seen = driveOne(state, createAIState(31), 8, SILENCE_TICKS / 2, true);
    expect(seen.pressedL).toBe(false);
    expect(seen.pressedJ).toBe(false);
    expect(seen.pressedK).toBe(false);
  });

  it('Sima Yi carrying toward goal leaps when an opponent is within 100 px or two sit in the landing spot, and not otherwise', () => {
    // Zhang Liao is parked far from the x=100 cluster: near it, his own fear would fire and shift the shared AI draws.
    const escape = specialState(32);
    place(escape, 9, 1100, FIELD_D / 2);
    place(escape, 8, 600, FIELD_D / 2, -1);
    place(escape, 2, 540, FIELD_D / 2);
    carry(escape, 8);
    expect(driveOne(escape, createAIState(32), 8, TICKS, true).pressedL).toBe(true);

    const twoAtLanding = specialState(32);
    place(twoAtLanding, 9, 1100, FIELD_D / 2);
    place(twoAtLanding, 8, 600, FIELD_D / 2, -1);
    place(twoAtLanding, 0, 310, FIELD_D / 2);
    place(twoAtLanding, 1, 310, FIELD_D / 2 + 30);
    carry(twoAtLanding, 8);
    expect(driveOne(twoAtLanding, createAIState(32), 8, TICKS, true).pressedL).toBe(true);

    const facingAway = specialState(32);
    place(facingAway, 9, 1100, FIELD_D / 2);
    place(facingAway, 8, 600, FIELD_D / 2, 1);
    place(facingAway, 2, 540, FIELD_D / 2);
    carry(facingAway, 8);
    expect(driveOne(facingAway, createAIState(32), 8, TICKS, true).pressedL).toBe(false);

    const alone = specialState(32);
    place(alone, 9, 1100, FIELD_D / 2);
    place(alone, 8, 600, FIELD_D / 2, -1);
    carry(alone, 8);
    expect(driveOne(alone, createAIState(32), 8, TICKS, true).pressedL).toBe(false);

    const offField = specialState(32);
    place(offField, 9, 1100, FIELD_D / 2);
    place(offField, 8, 200, FIELD_D / 2, -1);
    place(offField, 2, 140, FIELD_D / 2);
    carry(offField, 8);
    expect(driveOne(offField, createAIState(32), 8, TICKS, true).pressedL).toBe(false);
  });

  it('a silenced Sima Yi carrying the ball dribbles at the opponent goal with no J, K or L', () => {
    const state = specialState(33);
    place(state, 8, 600, FIELD_D / 2, 1);
    carry(state, 8);
    state.players[8].silenceTicks = SILENCE_TICKS;
    const seen = driveOne(state, createAIState(33), 8, 20, false);
    expect(state.players[8].silenceTicks).toBeGreaterThan(0);
    expect(seen.pressedL).toBe(false);
    expect(seen.pressedJ).toBe(false);
    expect(seen.pressedK).toBe(false);
    expect(state.players[8].x).toBeLessThan(600);
  });
});

describe('AI tiger guard (Xu Chu, off the ball)', () => {
  const XU_CHU = 5;
  const TIGER_TICKS_CHECK = 200;

  /** Wei (idx 5-9) with Xu Chu at idx 5 standing just inside his own goal line. */
  function tigerState(seed: number): { state: GameState; goalX: number; inward: number } {
    const state = specialState(seed);
    const goalX = ownGoalX(state, 1);
    const inward = goalX === 0 ? 1 : -1;
    expect(state.players[XU_CHU].specialMode).toBe('tiger');
    place(state, XU_CHU, goalX + inward * 60, FIELD_D / 2, inward);
    return { state, goalX, inward };
  }

  /** Shu idx 2 carries the ball `dist` px in from the goal line. */
  function shuCarrierAt(state: GameState, goalX: number, inward: number, dist: number): void {
    place(state, 2, goalX + inward * dist, FIELD_D / 2);
    carry(state, 2);
  }

  /** Loose ball `dist` px in from the goal line, moving toward (or away from) Xu Chu's goal, last touched by `touchIdx`. */
  function looseBall(state: GameState, goalX: number, inward: number, dist: number, toward: boolean, touchIdx: number): void {
    const dir = goalX === 0 ? -1 : 1;
    state.ball.x = goalX + inward * dist;
    state.ball.y = FIELD_D / 2;
    state.ball.vx = (toward ? dir : -dir) * 600;
    state.ball.vy = 0;
    state.ball.ownerIdx = -1;
    state.ball.lastTouchIdx = touchIdx;
  }

  /** True if Xu Chu presses L on any of `ticks` frames. Nothing is stepped, so the state stays exactly as set up. */
  function pressesL(state: GameState, seed: number, ticks = TIGER_TICKS_CHECK): boolean {
    const ai = createAIState(seed);
    for (let t = 0; t < ticks; t++) {
      if (computeAIInputs(state, ai, NO_HUMANS)[XU_CHU].l) return true;
    }
    return false;
  }

  it('casts when an opponent carries the ball within 260 px of his goal line', () => {
    const { state, goalX, inward } = tigerState(41);
    shuCarrierAt(state, goalX, inward, 200);
    expect(pressesL(state, 41)).toBe(true);
  });

  it('casts against an incoming opponent shot within 350 px of his goal line', () => {
    const { state, goalX, inward } = tigerState(42);
    looseBall(state, goalX, inward, 300, true, 2);
    expect(pressesL(state, 42)).toBe(true);
  });

  it('does not cast when the opponent carrier is 400 px from his goal line', () => {
    const { state, goalX, inward } = tigerState(43);
    shuCarrierAt(state, goalX, inward, 400);
    expect(pressesL(state, 43)).toBe(false);
  });

  it('does not cast when the loose ball is moving away from his goal', () => {
    const { state, goalX, inward } = tigerState(44);
    looseBall(state, goalX, inward, 300, false, 2);
    expect(pressesL(state, 44)).toBe(false);
  });

  it('does not cast for a loose ball last touched by a teammate', () => {
    const { state, goalX, inward } = tigerState(45);
    looseBall(state, goalX, inward, 300, true, 6);
    expect(pressesL(state, 45)).toBe(false);
  });

  it('does not cast while a tiger guard is already running', () => {
    const { state, goalX, inward } = tigerState(46);
    shuCarrierAt(state, goalX, inward, 200);
    state.players[XU_CHU].tigerTicks = TIGER_GUARD_TICKS;
    expect(pressesL(state, 46)).toBe(false);
  });

  it('does not cast while silenced', () => {
    const { state, goalX, inward } = tigerState(47);
    shuCarrierAt(state, goalX, inward, 200);
    state.players[XU_CHU].silenceTicks = SILENCE_TICKS;
    expect(pressesL(state, 47)).toBe(false);
  });

  it('on the press frame his movement equals the normal goalkeeper frame, with L added', () => {
    const normalSetup = tigerState(48);
    shuCarrierAt(normalSetup.state, normalSetup.goalX, normalSetup.inward, 200);
    normalSetup.state.players[XU_CHU].tigerTicks = TIGER_GUARD_TICKS;
    const normal = computeAIInputs(normalSetup.state, createAIState(48), NO_HUMANS)[XU_CHU];
    expect(normal.l).toBe(false);
    expect(normal.moveX).not.toBe(0);

    const { state, goalX, inward } = tigerState(48);
    shuCarrierAt(state, goalX, inward, 200);
    const ai = createAIState(48);
    let press: InputFrame | undefined = undefined;
    for (let t = 0; t < TIGER_TICKS_CHECK && press === undefined; t++) {
      const f = computeAIInputs(state, ai, NO_HUMANS)[XU_CHU];
      if (f.l) press = f;
    }
    expect(press).not.toBeUndefined();
    expect({ ...press, l: false }).toEqual(normal);
  });
});

describe('AI slash (Cao Cao, off the ball and owner)', () => {
  const CAO_CAO = 6;
  const TICKS = 400;

  /** Wei Cao Cao at idx 6, facing the opponent goal, with the ball loose at midfield. */
  function caoState(seed: number): GameState {
    const state = specialState(seed);
    expect(state.players[CAO_CAO].specialMode).toBe('slash');
    place(state, CAO_CAO, 500, FIELD_D / 2, 1);
    return state;
  }

  it('casts off the ball when an opponent stands within 140 px, and not at 200 px', () => {
    const near = caoState(51);
    place(near, 0, 600, FIELD_D / 2);
    expect(driveOne(near, createAIState(51), CAO_CAO, TICKS, true).pressedL).toBe(true);

    const far = caoState(51);
    place(far, 0, 700, FIELD_D / 2);
    expect(driveOne(far, createAIState(51), CAO_CAO, TICKS, true).pressedL).toBe(false);
  });

  it('casts off the ball when an opponent carrier is within 200 px, and not at 300 px', () => {
    const near = caoState(52);
    place(near, 2, 680, FIELD_D / 2);
    carry(near, 2);
    expect(driveOne(near, createAIState(52), CAO_CAO, TICKS, true).pressedL).toBe(true);

    const far = caoState(52);
    place(far, 2, 800, FIELD_D / 2);
    carry(far, 2);
    expect(driveOne(far, createAIState(52), CAO_CAO, TICKS, true).pressedL).toBe(false);
  });

  it('does not cast with nobody near and the ball loose', () => {
    const state = caoState(53);
    expect(driveOne(state, createAIState(53), CAO_CAO, TICKS, true).pressedL).toBe(false);
  });

  it('casts as the carrier when an opponent stands within 140 px', () => {
    const state = caoState(54);
    place(state, 0, 580, FIELD_D / 2);
    carry(state, CAO_CAO);
    expect(driveOne(state, createAIState(54), CAO_CAO, TICKS, true).pressedL).toBe(true);
  });

  it('does not cast again while the blade buff runs', () => {
    const state = caoState(55);
    place(state, 0, 600, FIELD_D / 2);
    state.players[CAO_CAO].slashTicks = SLASH_TICKS;
    expect(driveOne(state, createAIState(55), CAO_CAO, SLASH_TICKS / 2, true).pressedL).toBe(false);
  });

  it('a silenced Cao Cao never presses L, even with an opponent next to him', () => {
    const state = caoState(56);
    place(state, 0, 600, FIELD_D / 2);
    state.players[CAO_CAO].silenceTicks = SILENCE_TICKS;
    expect(driveOne(state, createAIState(56), CAO_CAO, SILENCE_TICKS / 2, true).pressedL).toBe(false);
  });

  it('during the buff, off the ball, steers toward the enemy carrier within 260 px rather than the nearer opponent', () => {
    const state = caoState(57);
    place(state, 0, 560, FIELD_D / 2); // nearest opponent, 60 px on his right
    place(state, 2, 300, FIELD_D / 2); // carrier, 200 px on his left
    carry(state, 2);
    state.players[CAO_CAO].slashTicks = SLASH_TICKS;

    const first = computeAIInputs(state, createAIState(57), NO_HUMANS)[CAO_CAO];
    expect(first.moveX).toBe(-1);
    expect(first.l).toBe(false);

    driveOne(state, createAIState(57), CAO_CAO, 60, false);
    const cao = state.players[CAO_CAO];
    expect(Math.abs(cao.x - state.players[2].x)).toBeLessThanOrEqual(SLASH_WAVE_RANGE);
    expect(cao.facingX).toBe(-1);
  });

  it('during the buff, off the ball, steers toward the nearest opponent when no carrier is within 260 px', () => {
    const state = caoState(58);
    place(state, 0, 700, FIELD_D / 2); // 200 px on his right, ball loose
    state.players[CAO_CAO].slashTicks = SLASH_TICKS;

    const frame = computeAIInputs(state, createAIState(58), NO_HUMANS)[CAO_CAO];
    expect(frame.moveX).toBe(1);
    expect(frame.l).toBe(false);
  });
});

describe('AI icefield (Zhen Ji, off the ball and owner)', () => {
  const ZHEN_JI = 7;
  const TICKS = 400;

  /** Wei Zhen Ji at idx 7, with the ball loose at midfield. */
  function zhenState(seed: number): GameState {
    const state = specialState(seed);
    expect(state.players[ZHEN_JI].specialMode).toBe('icefield');
    place(state, ZHEN_JI, 500, FIELD_D / 2, 1);
    return state;
  }

  it('casts off the ball when an enemy carrier is within 90 px, and not at 150 px', () => {
    const near = zhenState(61);
    place(near, 0, 580, FIELD_D / 2);
    carry(near, 0);
    expect(driveOne(near, createAIState(61), ZHEN_JI, TICKS, true).pressedL).toBe(true);

    const far = zhenState(61);
    place(far, 0, 650, FIELD_D / 2);
    carry(far, 0);
    expect(driveOne(far, createAIState(61), ZHEN_JI, TICKS, true).pressedL).toBe(false);
  });

  it('casts off the ball with two opponents within 100 px and the ball loose, but not with one at 100 px', () => {
    const two = zhenState(62);
    place(two, 0, 560, FIELD_D / 2);
    place(two, 1, 500, FIELD_D / 2 + 60);
    expect(driveOne(two, createAIState(62), ZHEN_JI, TICKS, true).pressedL).toBe(true);

    const one = zhenState(62);
    place(one, 0, 600, FIELD_D / 2);
    expect(driveOne(one, createAIState(62), ZHEN_JI, TICKS, true).pressedL).toBe(false);
  });

  it('does not cast with nobody near and the ball loose', () => {
    const state = zhenState(63);
    expect(driveOne(state, createAIState(63), ZHEN_JI, TICKS, true).pressedL).toBe(false);
  });

  it('casts as the owner when an opponent is within 70 px', () => {
    const state = zhenState(64);
    place(state, 0, 560, FIELD_D / 2);
    carry(state, ZHEN_JI);
    expect(driveOne(state, createAIState(64), ZHEN_JI, TICKS, true).pressedL).toBe(true);
  });

  it('casts as the owner with two opponents within 110 px, but not with one at 80 px', () => {
    const two = zhenState(65);
    place(two, 0, 600, FIELD_D / 2);
    place(two, 1, 400, FIELD_D / 2);
    carry(two, ZHEN_JI);
    expect(driveOne(two, createAIState(65), ZHEN_JI, TICKS, true).pressedL).toBe(true);

    const one = zhenState(65);
    place(one, 0, 580, FIELD_D / 2);
    carry(one, ZHEN_JI);
    expect(driveOne(one, createAIState(65), ZHEN_JI, TICKS, true).pressedL).toBe(false);
  });

  it('does not cast as the owner with nobody near', () => {
    const state = zhenState(66);
    carry(state, ZHEN_JI);
    expect(driveOne(state, createAIState(66), ZHEN_JI, TICKS, true).pressedL).toBe(false);
  });

  it('a silenced Zhen Ji off the ball never presses L, even with two opponents next to her', () => {
    const state = zhenState(67);
    place(state, 0, 560, FIELD_D / 2);
    place(state, 1, 500, FIELD_D / 2 + 60);
    state.players[ZHEN_JI].silenceTicks = SILENCE_TICKS;
    expect(driveOne(state, createAIState(67), ZHEN_JI, SILENCE_TICKS / 2, true).pressedL).toBe(false);
  });
});

describe('AI behaviour', () => {
  it('an AI owner passes to a teammate who presses L', () => {
    const state = createInitialState({ seed: 3, teams: [getTeam('shu'), getTeam('wei')], startInPlay: true }, SIZE_PARAMS);
    state.players.forEach((p, i) => {
      p.x = 1000;
      p.y = 20 + i * 24;
    });
    const owner = state.players[1];
    owner.x = 400;
    owner.y = FIELD_D / 2;
    owner.facingX = 1;
    owner.facingY = 0;
    state.players[2].x = 520;
    state.players[2].y = FIELD_D / 2;
    state.ball.x = owner.x + owner.radius + DRIBBLE_OFFSET;
    state.ball.y = owner.y;
    state.ball.ownerIdx = 1;
    state.ball.lastTouchIdx = 1;

    const ai = createAIState(3);
    const humanMask = NO_HUMANS.map((_, i) => i === 2);
    let passedToCaller = false;
    for (let t = 0; t < 10 && !passedToCaller; t++) {
      const frames = computeAIInputs(state, ai, humanMask);
      frames[2] = { ...EMPTY_INPUT, k: t === 0 };
      step(state, frames);
      passedToCaller = state.events.some(
        (e) => e.type === 'kick' && e.kind === 'pass' && e.targetIdx === 2,
      );
    }
    expect(passedToCaller).toBe(true);
  });

  it('an AI owner in a rampage dribbles at the goal and fires its special once close enough', () => {
    const state = createInitialState({ seed: 4, teams: [getTeam('shu'), getTeam('wei')], startInPlay: true }, SIZE_PARAMS);
    state.players.forEach((p, i) => {
      p.x = 100;
      p.y = 20 + i * 24;
    });
    // idx 3 is a straight-special MF; a lob special would fire from 380 px instead of 260 px.
    const owner = state.players[3];
    owner.x = 900;
    owner.y = FIELD_D / 2;
    owner.facingX = 1;
    owner.facingY = 0;
    owner.rampageTicks = RAMPAGE_TICKS;
    state.ball.x = owner.x + owner.radius + DRIBBLE_OFFSET;
    state.ball.y = owner.y;
    state.ball.ownerIdx = 3;
    state.ball.lastTouchIdx = 3;

    const ai = createAIState(4);
    let fired = false;
    for (let t = 0; t < 120 && !fired; t++) {
      step(state, computeAIInputs(state, ai, NO_HUMANS));
      fired = state.events.some((e) => e.type === 'specialShot' && e.playerIdx === 3);
    }

    expect(fired).toBe(true);
    expect(state.ball.special).not.toBeUndefined();
    expect(Math.abs(FIELD_W - owner.x)).toBeLessThan(260);
  });

  it('Zhang Fei holds J to roar when two opponents stand in his roar circle, and the roar fires', () => {
    const state = createInitialState({ seed: 6, teams: [getTeam('shu'), getTeam('wei')], startInPlay: true }, SIZE_PARAMS);
    state.players.forEach((p, i) => {
      p.x = 100;
      p.y = 20 + i * 24;
    });
    const gk = state.players[0];
    expect(gk.specialMode).toBe('roar');
    gk.x = 300;
    gk.y = FIELD_D / 2;
    gk.facingX = 1;
    gk.facingY = 0;
    state.players[5].x = 390;
    state.players[5].y = FIELD_D / 2;
    state.players[6].x = 330;
    state.players[6].y = FIELD_D / 2 + 70;
    state.ball.x = 1100;
    state.ball.y = 30;
    state.ball.ownerIdx = -1;

    const ai = createAIState(6);
    let pressed = false;
    let fired = false;
    for (let t = 0; t < 120 && !fired; t++) {
      // Only Zhang Fei is driven by the AI here; the opponents stand still inside the circle.
      const frames = computeAIInputs(state, ai, NO_HUMANS).map((f, i) => (i === 0 ? f : { ...EMPTY_INPUT }));
      pressed = pressed || frames[0].l;
      step(state, frames);
      fired = state.events.some((e) => e.type === 'roar' && e.playerIdx === 0);
    }

    expect(pressed).toBe(true);
    expect(fired).toBe(true);
  });

  it('an AI carrier does not start a full charge while the special cooldown runs', () => {
    const state = createInitialState({ seed: 4, teams: [getTeam('shu'), getTeam('wei')], startInPlay: true }, SIZE_PARAMS);
    state.players.forEach((p, i) => {
      p.x = 100;
      p.y = 20 + i * 24;
    });
    const owner = state.players[3];
    owner.x = 900;
    owner.y = FIELD_D / 2;
    owner.facingX = 1;
    owner.facingY = 0;
    owner.specialCooldown = 300;
    state.ball.x = owner.x + owner.radius + DRIBBLE_OFFSET;
    state.ball.y = owner.y;
    state.ball.ownerIdx = 3;
    state.ball.lastTouchIdx = 3;

    const ai = createAIState(4);
    for (let t = 0; t < 30; t++) {
      step(state, computeAIInputs(state, ai, NO_HUMANS));
      expect(ai.perPlayer[3].intent).not.toBe('charge');
    }
  });

  it('keeps each goalkeeper near its own goal line while the ball is far from it', () => {
    const state = createInitialState({ seed: 5, teams: [getTeam('shu'), getTeam('wei')], startInPlay: true }, SIZE_PARAMS);
    state.ball.x = FIELD_W / 2;
    state.ball.y = FIELD_D / 2;
    state.ball.ownerIdx = -1;
    const ai = createAIState(5);

    let checked = 0;
    for (let t = 0; t < 120; t++) {
      step(state, computeAIInputs(state, ai, NO_HUMANS));
      for (const team of [0, 1] as const) {
        const gk = state.players[team * 5];
        const goalX = ownGoalX(state, team);
        if (Math.abs(state.ball.x - goalX) > 300) {
          checked++;
          expect(Math.abs(gk.x - goalX)).toBeLessThan(60);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('never emits frames with moveX or moveY outside -1..1 and returns EMPTY for human slots', () => {
    const state = createInitialState({ seed: 9, teams: [getTeam('shu'), getTeam('wei')], startInPlay: true }, SIZE_PARAMS);
    const ai = createAIState(9);
    const humanMask = NO_HUMANS.map((_, i) => i === 4);
    for (let t = 0; t < 300; t++) {
      const frames: InputFrame[] = computeAIInputs(state, ai, humanMask);
      expect(frames).toHaveLength(10);
      expect(frames[4]).toEqual(EMPTY_INPUT);
      for (const f of frames) {
        expect([-1, 0, 1]).toContain(f.moveX);
        expect([-1, 0, 1]).toContain(f.moveY);
      }
      step(state, frames);
    }
  });
});

describe('AI Zhang Fei goalkeeper roar (incoming shot)', () => {
  const ZHANG_FEI = 0;
  const OPPONENT_SHOOTER = 5;
  const TEAMMATE = 1;
  /** Fastest special shot in constants (straight). */
  const FASTEST_SHOT = SPECIAL_STRAIGHT_SPEED;

  /** Zhang Fei on his own goal line at the mouth centre, facing the field. Everyone else is parked far from the shot. */
  function keeperState(seed: number): GameState {
    const state = specialState(seed);
    state.players.forEach((p, i) => {
      if (i === ZHANG_FEI) return;
      p.x = 600;
      p.y = 20 + i * 24;
    });
    place(state, ZHANG_FEI, 0, FIELD_D / 2, 1);
    return state;
  }

  /**
   * Loose ball at (x0, mid) flying at `speed` toward the goal line at x = 0, where it crosses at yAtGoal. Last touched by
   * touchIdx. Zhang Fei's roar circle reaches to about 135 px from the goal line along the centre line.
   */
  function aimedShot(state: GameState, yAtGoal: number, touchIdx: number, x0 = 120, speed = FASTEST_SHOT): void {
    const y0 = FIELD_D / 2;
    const b = state.ball;
    b.x = x0;
    b.y = y0;
    b.z = 0;
    b.vx = -speed;
    b.vy = ((yAtGoal - y0) * speed) / x0;
    b.vz = 0;
    b.ownerIdx = -1;
    b.lastTouchIdx = touchIdx;
  }

  /** True if Zhang Fei presses L on any of `ticks` frames. Nothing is stepped, so the state stays exactly as set up. */
  function pressesL(state: GameState, seed: number, ticks = 30): boolean {
    const ai = createAIState(seed);
    for (let t = 0; t < ticks; t++) {
      if (computeAIInputs(state, ai, NO_HUMANS)[ZHANG_FEI].l) return true;
    }
    return false;
  }

  it('roars at an on-target opponent shot already inside his circle', () => {
    const state = keeperState(51);
    aimedShot(state, 96, OPPONENT_SHOOTER);
    expect(pressesL(state, 51)).toBe(true);
  });

  it('does not roar at an on-target shot still outside his circle (no lead)', () => {
    const state = keeperState(52);
    aimedShot(state, 96, OPPONENT_SHOOTER, 150);
    expect(pressesL(state, 52)).toBe(false);
  });

  it('does not roar at an off-target opponent shot inside his circle', () => {
    const state = keeperState(53);
    aimedShot(state, 200, OPPONENT_SHOOTER);
    expect(pressesL(state, 53)).toBe(false);
  });

  it('does not roar at a teammate pass heading for his goal', () => {
    const state = keeperState(54);
    aimedShot(state, 96, TEAMMATE);
    expect(pressesL(state, 54)).toBe(false);
  });

  it('does not roar while the special is on cooldown', () => {
    const state = keeperState(55);
    aimedShot(state, 96, OPPONENT_SHOOTER);
    state.players[ZHANG_FEI].specialCooldown = SPECIAL_COOLDOWN_TICKS;
    expect(pressesL(state, 55)).toBe(false);
  });

  it('integration: the fastest special-shot speed from outside his circle is roared at inside it and does not score', () => {
    const state = keeperState(56);
    aimedShot(state, 96, OPPONENT_SHOOTER, 200, FASTEST_SHOT);
    const ai = createAIState(56);
    const seen: SimEvent[] = [];
    for (let t = 0; t < 120; t++) {
      // Only Zhang Fei is driven, with J stripped so a dive cannot be what stops the shot.
      const frames = computeAIInputs(state, ai, NO_HUMANS).map((f, i) =>
        i === ZHANG_FEI ? { ...f, j: false } : { ...EMPTY_INPUT },
      );
      step(state, frames);
      seen.push(...state.events);
    }
    const roarBall = seen.find((e) => e.type === 'roarBall' && e.playerIdx === ZHANG_FEI);
    expect(roarBall).toBeDefined();
    expect(seen.some((e) => e.type === 'goal')).toBe(false);
    expect(seen.some((e) => e.type === 'save' || e.type === 'dive')).toBe(false);
  });

  it('integration: the roar reverses the incoming shot (its vx turns away from his goal)', () => {
    const state = keeperState(57);
    aimedShot(state, 96, OPPONENT_SHOOTER);
    const ai = createAIState(57);
    const frames = computeAIInputs(state, ai, NO_HUMANS).map((f, i) =>
      i === ZHANG_FEI ? { ...f, j: false } : { ...EMPTY_INPUT },
    );
    expect(frames[ZHANG_FEI].l).toBe(true);
    step(state, frames);
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'roarBall', playerIdx: ZHANG_FEI }));
    expect(state.ball.vx).toBeGreaterThan(0);
  });

  it('control: the same fastest shot with no keeper action scores', () => {
    const state = keeperState(56);
    aimedShot(state, 96, OPPONENT_SHOOTER, 200, FASTEST_SHOT);
    let scored = false;
    for (let t = 0; t < 120; t++) {
      step(state, []);
      scored = scored || state.events.some((e) => e.type === 'goal');
    }
    expect(scored).toBe(true);
  });
});

describe('AI Sun Ce sail (wu FW)', () => {
  const SUNCE = 4;
  const TICKS = 400;
  const MID = FIELD_D / 2;

  /** Wu (idx 0-4) against wei (idx 5-9), everyone parked far away. Sun Ce is wu's forward at idx 4. */
  function sailState(seed: number): GameState {
    const state = createInitialState({ seed, teams: [getTeam('wu'), getTeam('wei')], startInPlay: true }, SIZE_PARAMS);
    state.players.forEach((p, i) => {
      p.x = 100;
      p.y = 20 + i * 24;
    });
    state.ball.ownerIdx = -1;
    state.ball.x = 600;
    state.ball.y = MID;
    return state;
  }

  it('the sail is wired to Sun Ce as a no-ball special', () => {
    const state = sailState(30);
    expect(state.players[SUNCE].specialMode).toBe('sail');
    expect(state.players[SUNCE].specialNoBall).toBe(true);
  });

  it('casts the sail as the owner with an opponent within 90 px, and not with the nearest one at 120 px', () => {
    const near = sailState(31);
    place(near, SUNCE, 400, MID);
    place(near, 5, 480, MID);
    carry(near, SUNCE);
    expect(driveOne(near, createAIState(31), SUNCE, TICKS, true).pressedL).toBe(true);

    const far = sailState(31);
    place(far, SUNCE, 400, MID);
    place(far, 5, 520, MID);
    carry(far, SUNCE);
    expect(driveOne(far, createAIState(31), SUNCE, TICKS, true).pressedL).toBe(false);
  });

  it('casts the sail as the owner facing the goal down an open lane, and not with an opponent just ahead or far from goal', () => {
    const open = sailState(32);
    place(open, SUNCE, 700, MID);
    carry(open, SUNCE);
    expect(driveOne(open, createAIState(32), SUNCE, TICKS, true).pressedL).toBe(true);

    const blocked = sailState(32);
    place(blocked, SUNCE, 700, MID);
    place(blocked, 6, 800, MID);
    carry(blocked, SUNCE);
    expect(driveOne(blocked, createAIState(32), SUNCE, TICKS, true).pressedL).toBe(false);

    const far = sailState(32);
    place(far, SUNCE, 400, MID);
    carry(far, SUNCE);
    expect(driveOne(far, createAIState(32), SUNCE, TICKS, true).pressedL).toBe(false);
  });

  it('casts the sail off the ball into an enemy carrier within 220 px, and not from 260 px', () => {
    const near = sailState(33);
    place(near, SUNCE, 400, MID);
    place(near, 5, 600, MID);
    carry(near, 5);
    expect(driveOne(near, createAIState(33), SUNCE, TICKS, true).pressedL).toBe(true);

    const far = sailState(33);
    place(far, SUNCE, 400, MID);
    place(far, 5, 660, MID);
    carry(far, 5);
    expect(driveOne(far, createAIState(33), SUNCE, TICKS, true).pressedL).toBe(false);
  });

  it('while sailing with the ball, drives at the opponent goal and shoots in range without punching', () => {
    const state = sailState(34);
    place(state, SUNCE, 400, MID);
    carry(state, SUNCE);
    state.players[SUNCE].sailTicks = SAIL_TICKS;
    const f = computeAIInputs(state, createAIState(34), NO_HUMANS)[SUNCE];
    expect(f.moveX).toBe(1);
    expect(f.moveY).toBe(0);
    expect(f.j).toBe(false);
    expect(f.l).toBe(false);

    place(state, SUNCE, 1100, MID);
    carry(state, SUNCE);
    state.players[SUNCE].sailTicks = SAIL_TICKS;
    expect(computeAIInputs(state, createAIState(34), NO_HUMANS)[SUNCE].j).toBe(true);
  });

  it('while sailing without the ball, steers at the enemy carrier and does not punch him', () => {
    const state = sailState(35);
    place(state, SUNCE, 400, MID);
    place(state, 5, 600, 250);
    carry(state, 5);
    state.players[SUNCE].sailTicks = SAIL_TICKS;
    const f = computeAIInputs(state, createAIState(35), NO_HUMANS)[SUNCE];
    expect(f.moveX).toBe(1);
    expect(f.moveY).toBe(1);
    expect(f.j).toBe(false);

    place(state, 5, 415, MID);
    carry(state, 5);
    expect(computeAIInputs(state, createAIState(35), NO_HUMANS)[SUNCE].j).toBe(false);
  });

  it('while sailing without the ball, steers at the loose ball, and at the goal when a teammate has it', () => {
    const loose = sailState(36);
    place(loose, SUNCE, 400, MID);
    loose.ball.x = 300;
    loose.ball.y = 60;
    loose.players[SUNCE].sailTicks = SAIL_TICKS;
    const fl = computeAIInputs(loose, createAIState(36), NO_HUMANS)[SUNCE];
    expect(fl.moveX).toBe(-1);
    expect(fl.moveY).toBe(-1);

    const mate = sailState(36);
    place(mate, SUNCE, 400, MID);
    carry(mate, 0);
    mate.players[SUNCE].sailTicks = SAIL_TICKS;
    const fm = computeAIInputs(mate, createAIState(36), NO_HUMANS)[SUNCE];
    expect(fm.moveX).toBe(1);
    expect(fm.moveY).toBe(0);
    expect(fm.j).toBe(false);
  });

  it('a passenger on the sail returns an empty frame', () => {
    const state = sailState(37);
    place(state, SUNCE, 400, MID);
    place(state, 3, 380, MID + 20);
    place(state, 5, 420, MID);
    state.players[SUNCE].sailTicks = SAIL_TICKS;
    state.players[SUNCE].sailPassenger = 3;
    state.players[3].sailPassengerOf = SUNCE;
    const frames = computeAIInputs(state, createAIState(37), NO_HUMANS);
    expect(frames[3]).toEqual({ ...EMPTY_INPUT });
  });
});

describe('AI Xiao Qiao gust (wu MF)', () => {
  const XIAOQIAO = 3;
  const TICKS = 400;
  const MID = FIELD_D / 2;

  /** Wu (idx 0-4) against wei (idx 5-9), everyone parked far away. Xiao Qiao is wu's MF at idx 3, at x 500 facing the wei side. */
  function gustState(seed: number): GameState {
    const state = createInitialState({ seed, teams: [getTeam('wu'), getTeam('wei')], startInPlay: true }, SIZE_PARAMS);
    state.players.forEach((p, i) => {
      p.x = 100;
      p.y = 20 + i * 24;
    });
    state.ball.ownerIdx = -1;
    state.ball.x = 600;
    state.ball.y = MID;
    place(state, XIAOQIAO, 500, MID);
    return state;
  }

  it('the gust is wired to Xiao Qiao as a no-ball special', () => {
    const state = gustState(70);
    expect(state.players[XIAOQIAO].specialMode).toBe('gust');
    expect(state.players[XIAOQIAO].specialNoBall).toBe(true);
  });

  it('casts when the enemy carrier is 200 px ahead', () => {
    const state = gustState(71);
    place(state, 5, 700, MID);
    carry(state, 5);
    expect(driveOne(state, createAIState(71), XIAOQIAO, TICKS, true).pressedL).toBe(true);
  });

  it('casts when two opponents stand together 250 px ahead', () => {
    const state = gustState(72);
    place(state, 5, 750, MID);
    place(state, 6, 750, MID + 40);
    expect(driveOne(state, createAIState(72), XIAOQIAO, TICKS, true).pressedL).toBe(true);
  });

  it('does not cast when a lone non-carrier is ahead', () => {
    const state = gustState(73);
    place(state, 5, 750, MID);
    expect(driveOne(state, createAIState(73), XIAOQIAO, TICKS, true).pressedL).toBe(false);
  });

  it('does not cast when the carrier is behind her', () => {
    const state = gustState(74);
    place(state, 5, 300, MID);
    carry(state, 5);
    expect(driveOne(state, createAIState(74), XIAOQIAO, TICKS, true).pressedL).toBe(false);
  });

  it('does not cast while on cooldown', () => {
    const state = gustState(75);
    place(state, 5, 700, MID);
    carry(state, 5);
    state.players[XIAOQIAO].specialCooldown = SPECIAL_COOLDOWN_TICKS;
    expect(driveOne(state, createAIState(75), XIAOQIAO, TICKS, true).pressedL).toBe(false);
  });

  it('as the owner casts when two opponents stand together 250 px ahead', () => {
    const state = gustState(76);
    place(state, 5, 750, MID);
    place(state, 6, 750, MID + 40);
    carry(state, XIAOQIAO);
    expect(driveOne(state, createAIState(76), XIAOQIAO, TICKS, true).pressedL).toBe(true);
  });
});

describe('AI Da Qiao portal (wu DF)', () => {
  const DAQIAO = 1;
  const TICKS = 400;
  const MID = FIELD_D / 2;

  /** Wu (idx 0-4) against wei (idx 5-9), everyone parked far away. Da Qiao is wu's DF at idx 1, at x 500 facing the wei side. */
  function portalState(seed: number): GameState {
    const state = createInitialState({ seed, teams: [getTeam('wu'), getTeam('wei')], startInPlay: true }, SIZE_PARAMS);
    state.players.forEach((p, i) => {
      p.x = 100;
      p.y = 20 + i * 24;
    });
    state.ball.ownerIdx = -1;
    state.ball.x = 300;
    state.ball.y = 40;
    place(state, DAQIAO, 500, MID);
    return state;
  }

  it('the portal is wired to Da Qiao as a no-ball special', () => {
    const state = portalState(80);
    expect(state.players[DAQIAO].specialMode).toBe('portal');
    expect(state.players[DAQIAO].specialNoBall).toBe(true);
  });

  it('casts when the enemy carrier is 100 px away', () => {
    const state = portalState(81);
    place(state, 5, 600, MID);
    carry(state, 5);
    expect(driveOne(state, createAIState(81), DAQIAO, TICKS, true).pressedL).toBe(true);
  });

  it('casts when two opponents stand 100 px away', () => {
    const state = portalState(82);
    place(state, 5, 600, MID);
    place(state, 6, 600, MID + 40);
    expect(driveOne(state, createAIState(82), DAQIAO, TICKS, true).pressedL).toBe(true);
  });

  it('does not cast when only one non-carrier opponent is near', () => {
    const state = portalState(83);
    place(state, 5, 600, MID);
    expect(driveOne(state, createAIState(83), DAQIAO, TICKS, true).pressedL).toBe(false);
  });

  it('does not cast while on cooldown', () => {
    const state = portalState(84);
    place(state, 5, 600, MID);
    carry(state, 5);
    state.players[DAQIAO].specialCooldown = SPECIAL_COOLDOWN_TICKS;
    expect(driveOne(state, createAIState(84), DAQIAO, TICKS, true).pressedL).toBe(false);
  });

  it('does not cast with too little stamina', () => {
    const state = portalState(85);
    place(state, 5, 600, MID);
    carry(state, 5);
    state.players[DAQIAO].stamina = 0;
    expect(driveOne(state, createAIState(85), DAQIAO, 1, true).pressedL).toBe(false);
  });

  it('as the owner casts when two opponents stand 100 px away', () => {
    const state = portalState(86);
    place(state, 5, 600, MID);
    place(state, 6, 600, MID + 40);
    carry(state, DAQIAO);
    expect(driveOne(state, createAIState(86), DAQIAO, TICKS, true).pressedL).toBe(true);
  });
});

describe('AI Zhou Yu east wind (wu MF)', () => {
  const ZHOUYU = 2;
  const TICKS = 400;
  const MID = FIELD_D / 2;

  /** Wu (idx 0-4) against wei (idx 5-9), everyone parked far away. Zhou Yu is wu's MF at idx 2, at x 500 facing the wei side. */
  function eastwindState(seed: number): GameState {
    const state = createInitialState({ seed, teams: [getTeam('wu'), getTeam('wei')], startInPlay: true }, SIZE_PARAMS);
    state.players.forEach((p, i) => {
      p.x = 100;
      p.y = 20 + i * 24;
    });
    state.ball.ownerIdx = -1;
    state.ball.x = 300;
    state.ball.y = 40;
    place(state, ZHOUYU, 500, MID);
    return state;
  }

  it('the east wind is wired to Zhou Yu as a no-ball special', () => {
    const state = eastwindState(90);
    expect(state.players[ZHOUYU].specialMode).toBe('eastwind');
    expect(state.players[ZHOUYU].specialNoBall).toBe(true);
  });

  it('casts when the enemy carrier is 100 px away', () => {
    const state = eastwindState(91);
    place(state, 5, 600, MID);
    carry(state, 5);
    expect(driveOne(state, createAIState(91), ZHOUYU, TICKS, true).pressedL).toBe(true);
  });

  it('casts when two opponents stand 100 px away', () => {
    const state = eastwindState(92);
    place(state, 5, 600, MID);
    place(state, 6, 600, MID + 40);
    expect(driveOne(state, createAIState(92), ZHOUYU, TICKS, true).pressedL).toBe(true);
  });

  it('does not cast when only one non-carrier opponent is near', () => {
    const state = eastwindState(93);
    place(state, 5, 600, MID);
    expect(driveOne(state, createAIState(93), ZHOUYU, TICKS, true).pressedL).toBe(false);
  });

  it('does not cast while on cooldown', () => {
    const state = eastwindState(94);
    place(state, 5, 600, MID);
    carry(state, 5);
    state.players[ZHOUYU].specialCooldown = SPECIAL_COOLDOWN_TICKS;
    expect(driveOne(state, createAIState(94), ZHOUYU, TICKS, true).pressedL).toBe(false);
  });

  it('as the carrier casts when two opponents stand 100 px away', () => {
    const state = eastwindState(95);
    place(state, 5, 600, MID);
    place(state, 6, 600, MID + 40);
    carry(state, ZHOUYU);
    expect(driveOne(state, createAIState(95), ZHOUYU, TICKS, true).pressedL).toBe(true);
  });
});

describe('AI Sun Quan arrowship (wu GK)', () => {
  const SUNQUAN = 0;
  const WEI_CARRIER = 5;
  const TICKS_CHECK = 200;
  const MID = FIELD_D / 2;

  /** Wu (idx 0-4) against wei (idx 5-9). Sun Quan is wu's GK at idx 0, 60 px in from his own goal line. */
  function arrowshipState(seed: number): { state: GameState; goalX: number; inward: number } {
    const state = createInitialState({ seed, teams: [getTeam('wu'), getTeam('wei')], startInPlay: true }, SIZE_PARAMS);
    state.players.forEach((p, i) => {
      p.x = 100;
      p.y = 20 + i * 24;
    });
    state.ball.ownerIdx = -1;
    state.ball.x = 300;
    state.ball.y = MID;
    const goalX = ownGoalX(state, 0);
    const inward = goalX === 0 ? 1 : -1;
    expect(state.players[SUNQUAN].specialMode).toBe('arrowship');
    place(state, SUNQUAN, goalX + inward * 60, MID, inward);
    return { state, goalX, inward };
  }

  /** Loose ball `dist` px in from the goal line, moving toward (or away from) Sun Quan's goal, last touched by `touchIdx`. */
  function looseBall(state: GameState, goalX: number, inward: number, dist: number, toward: boolean, touchIdx: number): void {
    const dir = goalX === 0 ? -1 : 1;
    state.ball.x = goalX + inward * dist;
    state.ball.y = MID;
    state.ball.vx = (toward ? dir : -dir) * 600;
    state.ball.vy = 0;
    state.ball.ownerIdx = -1;
    state.ball.lastTouchIdx = touchIdx;
  }

  /** True if Sun Quan presses L on any of `ticks` frames. Nothing is stepped, so the state stays exactly as set up. */
  function pressesL(state: GameState, seed: number, ticks = TICKS_CHECK): boolean {
    const ai = createAIState(seed);
    for (let t = 0; t < ticks; t++) {
      if (computeAIInputs(state, ai, NO_HUMANS)[SUNQUAN].l) return true;
    }
    return false;
  }

  it('the arrowship is wired to Sun Quan as a no-ball special', () => {
    const { state } = arrowshipState(90);
    expect(state.players[SUNQUAN].specialNoBall).toBe(true);
  });

  it('casts against an incoming opponent shot within 250 px of his goal line', () => {
    const { state, goalX, inward } = arrowshipState(91);
    looseBall(state, goalX, inward, 200, true, WEI_CARRIER);
    expect(pressesL(state, 91)).toBe(true);
  });

  it('casts when an enemy carrier stands 150 px from his goal centre', () => {
    const { state, goalX, inward } = arrowshipState(92);
    place(state, WEI_CARRIER, goalX + inward * 150, MID);
    carry(state, WEI_CARRIER);
    expect(pressesL(state, 92)).toBe(true);
  });

  it('does not cast when play is far away', () => {
    const { state, goalX, inward } = arrowshipState(93);
    place(state, WEI_CARRIER, goalX + inward * 400, MID);
    carry(state, WEI_CARRIER);
    expect(pressesL(state, 93)).toBe(false);
    const far = arrowshipState(94);
    looseBall(far.state, far.goalX, far.inward, 400, true, WEI_CARRIER);
    expect(pressesL(far.state, 94)).toBe(false);
  });

  it('does not cast on cooldown', () => {
    const { state, goalX, inward } = arrowshipState(95);
    looseBall(state, goalX, inward, 200, true, WEI_CARRIER);
    state.players[SUNQUAN].specialCooldown = SPECIAL_COOLDOWN_TICKS;
    expect(pressesL(state, 95)).toBe(false);
  });

  it('does not cast while a ship is already up', () => {
    const { state, goalX, inward } = arrowshipState(96);
    looseBall(state, goalX, inward, 200, true, WEI_CARRIER);
    state.players[SUNQUAN].arrowshipUp = true;
    expect(pressesL(state, 96)).toBe(false);
  });

  it('does not cast for a loose ball moving away from his goal or last touched by a teammate', () => {
    const away = arrowshipState(97);
    looseBall(away.state, away.goalX, away.inward, 200, false, WEI_CARRIER);
    expect(pressesL(away.state, 97)).toBe(false);
    const teammate = arrowshipState(98);
    looseBall(teammate.state, teammate.goalX, teammate.inward, 200, true, 1);
    expect(pressesL(teammate.state, 98)).toBe(false);
  });
});
