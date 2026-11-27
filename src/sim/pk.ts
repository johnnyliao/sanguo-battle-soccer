import { min, max, len, fail, sortBy } from './num';
import { GOAL_H } from './constants';
import { endRampage } from './actions';
import { rngInt, rngNext } from './rng';
import {
  EMPTY_INPUT,
  type GameState,
  type InputFrame,
  type Player,
  type PkState,
} from './types';

export const PK_AIM_TICKS = 300;
export const PK_METER_PERIOD = 80;
export const PK_FLIGHT_TICKS = 40;
export const PK_RESULT_TICKS = 90;

const PK_DEFAULT_POWER = 0.5;

const SHOOTER_BACK = 14;
const ROW_Y0 = 20;
const ROW_STEP = 32;
const COL_SPACING = 28;
const LOW_Z = 6;
const HIGH_Z = 26;
const KEEPER_HIGH_Z = 18;
const OVER_BAR_Z = GOAL_H + 14;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Shot meter 0..1 after `ticks` ticks of held J: a triangle wave with period PK_METER_PERIOD. */
export function pkMeterValue(ticks: number): number {
  const phase = ticks % PK_METER_PERIOD;
  const half = PK_METER_PERIOD / 2;
  return phase < half ? phase / half : 2 - phase / half;
}

/** held moveY to target column: up (-1) = 0 (far post), neutral = 1, down (+1) = 2 (near post). */
function colFromMoveY(moveY: -1 | 0 | 1): number {
  return moveY + 1;
}

function requirePk(state: GameState): PkState {
  const pk = state.match.pk;
  if (pk === undefined) fail('penalty shootout has not started');
  return pk;
}

/** Every player idx of a team. */
function teamIdxs(state: GameState, team: 0 | 1): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.teamSize; i++) out.push(team * state.teamSize + i);
  return out;
}

/**
 * The defending team's goalkeeper (GK role) if it has one, otherwise its slot 0 player. The keeper for a kick
 * is chosen this way.
 */
function keeperIdxOf(state: GameState, team: 0 | 1): number {
  for (const p of state.players) {
    if (p.team === team && p.role === 'GK') return p.idx;
  }
  return team * state.teamSize;
}

/** Starts the shootout in the 'order' stage. Called by updateMatch when the 2nd half ends level. */
export function startPk(state: GameState): void {
  for (const p of state.players) {
    if (p.rampageTicks > 0) endRampage(state, p);
    p.bumpCooldown = 0;
  }
  const firstTeam: 0 | 1 = rngInt(state, 2) === 0 ? 0 : 1;
  state.match.pk = {
    stage: 'order',
    stageTimer: 0,
    order: [undefined, undefined],
    kicks: [[], []],
    kickingTeam: firstTeam,
    firstTeam,
    shooterIdx: -1,
    keeperIdx: -1,
    meterTicks: -1,
    power: 0,
    aimCol: 1,
    aimHigh: false,
    guessCol: 1,
    guessHigh: false,
    outcome: undefined,
    score: [0, 0],
    winner: -1,
  };
  placePlayers(state, -1, -1);
  placeBall(state);
}

/** Team's idxs sorted by power + technique, highest first; ties go to the lowest idx. */
export function defaultPkOrder(state: GameState, team: 0 | 1): number[] {
  const rating = (idx: number): number => {
    const s = state.players[idx].stats;
    return s.power + s.technique;
  };
  return sortBy(teamIdxs(state, team), (a, b) => rating(b) - rating(a) || a - b);
}

/** Stores a team's kicking order. When both orders are set, the first kick begins. */
export function submitPkOrder(state: GameState, team: 0 | 1, order: number[]): void {
  const pk = requirePk(state);
  if (pk.stage !== 'order') fail('penalty order is locked');
  const expected = teamIdxs(state, team);
  const valid =
    len(order) === state.teamSize &&
    sortBy(order, (a, b) => a - b).every((idx, i) => idx === expected[i]);
  if (!valid) fail(`invalid penalty order for team ${team}: ${order.join(',')}`);
  pk.order[team] = [...order];
  if (pk.order[0] !== undefined && pk.order[1] !== undefined) beginKick(state, pk);
}

/** Fills every undefined order except the human team's (-1 = no human team) with defaultPkOrder. */
export function autoPkOrders(state: GameState, humanTeam: 0 | 1 | -1): void {
  for (const team of [0, 1] as const) {
    if (team === humanTeam) continue;
    if (requirePk(state).order[team] === undefined) {
      submitPkOrder(state, team, defaultPkOrder(state, team));
    }
  }
}

/** Starts the next kick: picks the shooter and keeper and puts everyone on the spot. */
function beginKick(state: GameState, pk: PkState): void {
  const team = pk.kickingTeam;
  const order = pk.order[team];
  if (order === undefined) fail(`no penalty order for team ${team}`);
  pk.shooterIdx = order[len(pk.kicks[team]) % state.teamSize];
  pk.keeperIdx = keeperIdxOf(state, team === 0 ? 1 : 0);
  pk.stage = 'aim';
  pk.stageTimer = PK_AIM_TICKS;
  pk.meterTicks = -1;
  pk.power = 0;
  pk.aimCol = 1;
  pk.aimHigh = false;
  pk.guessCol = 1;
  pk.guessHigh = false;
  pk.outcome = undefined;
  placePlayers(state, pk.shooterIdx, pk.keeperIdx);
  placeBall(state);
  state.events.push({ type: 'pkKick', shooterIdx: pk.shooterIdx });
}

function placeAt(p: Player, x: number, y: number, facingX: 1 | -1): void {
  p.x = x;
  p.y = y;
  p.z = 0;
  p.vx = 0;
  p.vy = 0;
  p.vz = 0;
  p.facingX = facingX;
  p.facingY = 0;
  p.action = 'normal';
  p.actionTimer = 0;
}

/** Penalty spots and offsets on the match's pitch (read from state.field). */
interface PkSpots {
  centerY: number;
  spotX: number;
  keeperX: number;
  rowX: number;
  wideMissY: number;
  goalTargetX: number;
}

function pkSpots(state: GameState): PkSpots {
  const f = state.field;
  return {
    centerY: f.d / 2,
    spotX: f.w - 110,
    keeperX: f.w - 6,
    rowX: f.w - 330,
    wideMissY: f.goalHalfW + 12,
    goalTargetX: f.w + 8,
  };
}

/** Shooter and keeper go to their spots; everyone else stands in a row away from the action. */
function placePlayers(state: GameState, shooterIdx: number, keeperIdx: number): void {
  const s = pkSpots(state);
  let row = 0;
  for (const p of state.players) {
    if (p.idx === shooterIdx) {
      placeAt(p, s.spotX - SHOOTER_BACK, s.centerY, 1);
    } else if (p.idx === keeperIdx) {
      placeAt(p, s.keeperX, s.centerY, -1);
    } else {
      placeAt(p, s.rowX, ROW_Y0 + row * ROW_STEP, 1);
      row++;
    }
  }
}

function placeBall(state: GameState): void {
  const s = pkSpots(state);
  const b = state.ball;
  b.x = s.spotX;
  b.y = s.centerY;
  b.z = 0;
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  b.ownerIdx = -1;
  b.lastTouchIdx = -1;
  b.special = undefined;
}

/** Advances the shootout one tick. Players do not move normally during the PK; only the kick stages read inputs. */
export function updatePk(state: GameState, inputs: InputFrame[]): void {
  const pk = requirePk(state);
  switch (pk.stage) {
    case 'aim':
      tickAim(state, pk, inputs);
      break;
    case 'flight':
      tickFlight(state, pk);
      break;
    case 'result':
      tickResult(state, pk);
      break;
    case 'order':
    case 'done':
      break;
  }
}

function tickAim(state: GameState, pk: PkState, inputs: InputFrame[]): void {
  const shooter = state.players[pk.shooterIdx];
  const keeper = state.players[pk.keeperIdx];

  const keeperIn = inputs[keeper.idx] ?? EMPTY_INPUT;
  pk.guessCol = colFromMoveY(keeperIn.moveY);
  pk.guessHigh = keeperIn.k;

  const shooterIn = inputs[shooter.idx] ?? EMPTY_INPUT;
  if (pk.meterTicks < 0) {
    if (shooterIn.j && !shooter.prevInput.j) pk.meterTicks = 0;
  } else if (shooterIn.j) {
    pk.meterTicks++;
  } else {
    shoot(state, pk, shooterIn);
    return;
  }

  pk.stageTimer--;
  if (pk.stageTimer <= 0) shoot(state, pk, shooterIn);
}

/** Locks power, aim and the keeper's guess, rolls the outcome, and starts the flight. */
function shoot(state: GameState, pk: PkState, aimIn: InputFrame): void {
  const shooter = state.players[pk.shooterIdx];
  const keeper = state.players[pk.keeperIdx];
  pk.power = pk.meterTicks >= 0 ? pkMeterValue(pk.meterTicks) : PK_DEFAULT_POWER;
  pk.aimCol = colFromMoveY(aimIn.moveY);
  pk.aimHigh = aimIn.k;
  pk.outcome = rollOutcome(state, pk, shooter, keeper);
  pk.stage = 'flight';
  pk.stageTimer = PK_FLIGHT_TICKS;
  keeper.action = 'dive';
  state.events.push({ type: 'kick', playerIdx: shooter.idx, kind: 'shot', targetIdx: -1 });
}

/**
 * Rolls roll1 always (miss check). roll2 is consumed only when the keeper guessed the aimed column and the
 * shot was not a miss; a wrong guess is a goal with no second roll.
 */
function rollOutcome(
  state: GameState,
  pk: PkState,
  shooter: Player,
  keeper: Player,
): 'goal' | 'save' | 'miss' {
  const roll1 = rngNext(state);
  const missChance =
    (pk.aimCol !== 1 ? 0.06 + (10 - shooter.stats.technique) * 0.015 : 0.02) +
    (pk.power > 0.92 ? (pk.aimHigh ? 0.6 : 0.25) : 0);
  if (roll1 < missChance) return 'miss';
  if (pk.guessCol !== pk.aimCol) return 'goal';

  const roll2 = rngNext(state);
  const saveChance = clamp(
    0.35 +
      (keeper.stats.defense - shooter.stats.power) * 0.06 +
      (pk.guessHigh === pk.aimHigh ? 0.15 : -0.15) +
      (0.6 - pk.power) * 0.5,
    0.05,
    0.9,
  );
  return roll2 < saveChance ? 'save' : 'goal';
}

function tickFlight(state: GameState, pk: PkState): void {
  const s = pkSpots(state);
  pk.stageTimer--;
  const t = (PK_FLIGHT_TICKS - pk.stageTimer) / PK_FLIGHT_TICKS;
  const to = ballTarget(state, pk);
  const b = state.ball;
  b.x = lerp(s.spotX, to.x, t);
  b.y = lerp(s.centerY, to.y, t);
  b.z = lerp(0, to.z, t);

  const dive = diveTarget(state, pk);
  const keeper = state.players[pk.keeperIdx];
  keeper.y = lerp(s.centerY, dive.y, t);
  keeper.z = lerp(0, dive.z, t);

  if (pk.stageTimer <= 0 && pk.outcome !== undefined) enterResult(state, pk, pk.outcome);
}

/** Records the kick and emits its result. The next decision happens after PK_RESULT_TICKS. */
function enterResult(state: GameState, pk: PkState, outcome: 'goal' | 'save' | 'miss'): void {
  const team = pk.kickingTeam;
  pk.kicks[team].push(outcome === 'goal' ? 'goal' : 'miss');
  if (outcome === 'goal') pk.score[team]++;
  pk.stage = 'result';
  pk.stageTimer = PK_RESULT_TICKS;
  state.events.push({ type: 'pkResult', team, outcome });
  if (outcome === 'save') state.events.push({ type: 'save', playerIdx: pk.keeperIdx, caught: true });
}

function tickResult(state: GameState, pk: PkState): void {
  pk.stageTimer--;
  if (pk.stageTimer > 0) return;
  const winner = checkWinner(pk, state.teamSize);
  if (winner !== -1) {
    finish(state, pk, winner);
    return;
  }
  pk.kickingTeam = pk.kickingTeam === 0 ? 1 : 0;
  beginKick(state, pk);
}

/**
 * Regulation (both teams within `rounds` kicks, one per player): a team wins once the other cannot catch up with
 * its remaining kicks. Sudden death (past `rounds`): decided only when both teams have the same number of kicks
 * and the scores differ.
 */
function checkWinner(pk: PkState, rounds: number): -1 | 0 | 1 {
  const taken0 = len(pk.kicks[0]);
  const taken1 = len(pk.kicks[1]);
  if (taken0 <= rounds && taken1 <= rounds) {
    for (const team of [0, 1] as const) {
      const other: 0 | 1 = team === 0 ? 1 : 0;
      const remaining = max(0, rounds - len(pk.kicks[other]));
      if (pk.score[team] > pk.score[other] + remaining) return team;
    }
    return -1;
  }
  if (taken0 === taken1 && pk.score[0] !== pk.score[1]) return pk.score[0] > pk.score[1] ? 0 : 1;
  return -1;
}

function finish(state: GameState, pk: PkState, winner: 0 | 1): void {
  pk.stage = 'done';
  pk.stageTimer = 0;
  pk.winner = winner;
  state.match.phase = 'fulltime';
  state.events.push({ type: 'pkEnd', winner, score: [pk.score[0], pk.score[1]] });
  state.events.push({ type: 'matchEnd', score: [state.match.score[0], state.match.score[1]] });
}

/** Keeper's dive end point: stays on the goal line, moves to the guessed column. */
function diveTarget(state: GameState, pk: PkState): { y: number; z: number } {
  const s = pkSpots(state);
  return {
    y: s.centerY + (pk.guessCol - 1) * COL_SPACING,
    z: pk.guessHigh ? KEEPER_HIGH_Z : 0,
  };
}

/** Where the ball ends its flight: the save point, a wide or over-the-bar miss, or the aimed goal spot. */
function ballTarget(state: GameState, pk: PkState): Vec3 {
  const s = pkSpots(state);
  if (pk.outcome === 'save') {
    const d = diveTarget(state, pk);
    return { x: s.keeperX, y: d.y, z: d.z };
  }
  const z = pk.aimHigh ? HIGH_Z : LOW_Z;
  if (pk.outcome === 'miss' && pk.aimCol === 1) {
    return { x: s.goalTargetX, y: s.centerY, z: OVER_BAR_Z };
  }
  if (pk.outcome === 'miss') {
    return { x: s.goalTargetX, y: s.centerY + (pk.aimCol - 1) * s.wideMissY, z };
  }
  return { x: s.goalTargetX, y: s.centerY + (pk.aimCol - 1) * COL_SPACING, z };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return min(hi, max(lo, v));
}
