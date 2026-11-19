import { describe, expect, it } from 'vitest';
import { SIZE_PARAMS, getTeam } from '../data/characters';
import {
  DRIBBLE_OFFSET,
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  createInitialState,
  RAMPAGE_TICKS,
  hashState,
  ownGoalX,
  step,
  type GameState,
  type InputFrame,
} from '../sim';
import { computeAIInputs, createAIState } from './ai';

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
  maxTicks = 16000,
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
      else if (e.type === 'special') report.specials[state.players[e.playerIdx].team]++;
      else if (e.type === 'rampageStart') report.rampages++;
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
          `rampages=${report.rampages} hits=${report.hits} goals=${report.goals} pickups=${report.pickups} ownerChanges=${report.ownerChanges}`,
      );

      expect(['fulltime', 'pk']).toContain(report.finalPhase);
      expect(report.nanTicks).toBe(0);
      expect(report.shots[0] + report.shots[1] + report.specials[0] + report.specials[1]).toBeGreaterThanOrEqual(5);
      expect(report.pickups).toBeGreaterThanOrEqual(30);
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
      frames[2] = { ...EMPTY_INPUT, l: t === 0 };
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
      fired = state.events.some((e) => e.type === 'special' && e.playerIdx === 3);
    }

    expect(fired).toBe(true);
    expect(state.ball.special).not.toBeNull();
    expect(Math.abs(FIELD_W - owner.x)).toBeLessThan(260);
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
