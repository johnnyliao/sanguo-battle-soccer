import { abs, fail } from './num';
import { FIELD_D, FIELD_SCALE, FIELD_W, GK_AREA_DEPTH, GOAL_H, GOAL_HALF_W } from './constants';
import type { FieldSize, GameState, Player } from './types';

/**
 * Pitch sizes for small teams, as shares of the default 5v5 field (FIELD_W, FIELD_D, GOAL_HALF_W).
 * Each entry scales width (w), depth (d) and goal half-width (goalHalfW).
 */
const PITCH_SHARE_1 = { w: 0.5, d: 0.75, goalHalfW: 0.75 };
const PITCH_SHARE_2 = { w: 0.6, d: 0.8, goalHalfW: 0.8 };
const PITCH_SHARE_3_4 = { w: 0.8, d: 0.9, goalHalfW: 0.9 };

/**
 * Pitch size for a team of `teamSize` (1..5). 5 is exactly the default field. Callers choose whether to use it;
 * createInitialState uses the default constants when a match gives no field.
 */
export function defaultFieldFor(teamSize: number): FieldSize {
  if (teamSize === 5) return { w: FIELD_W, d: FIELD_D, goalHalfW: GOAL_HALF_W };
  if (teamSize < 1 || teamSize > 4) fail(`defaultFieldFor: team size must be 1..5, got ${teamSize}`);
  let share = PITCH_SHARE_3_4;
  if (teamSize === 1) share = PITCH_SHARE_1;
  else if (teamSize === 2) share = PITCH_SHARE_2;
  return { w: FIELD_W * share.w, d: FIELD_D * share.d, goalHalfW: GOAL_HALF_W * share.goalHalfW };
}

export interface GoalMouth {
  x: number;
  yMin: number;
  yMax: number;
  zMax: number;
}

/** side 0 = left goal (x = 0), side 1 = right goal (x = state.field.w). */
export function goalMouth(state: GameState, side: 0 | 1): GoalMouth {
  const f = state.field;
  return {
    x: side === 0 ? 0 : f.w,
    yMin: f.d / 2 - f.goalHalfW,
    yMax: f.d / 2 + f.goalHalfW,
    zMax: GOAL_H,
  };
}

/** True if a point at depth y and height z is within the goal mouth opening. */
export function isInGoalMouth(state: GameState, y: number, z: number): boolean {
  const f = state.field;
  return y >= f.d / 2 - f.goalHalfW && y <= f.d / 2 + f.goalHalfW && z < GOAL_H;
}

/** Direction a team attacks this half: +1 toward x = field.w, -1 toward x = 0. Team 0 attacks +1 until the side swap. */
export function attackDir(state: GameState, team: 0 | 1): 1 | -1 {
  if (team === 0) return state.match.swapped ? -1 : 1;
  return state.match.swapped ? 1 : -1;
}

/** x of the goal the team attacks. */
export function opponentGoalX(state: GameState, team: 0 | 1): number {
  return attackDir(state, team) === 1 ? state.field.w : 0;
}

/** x of the goal the team defends. */
export function ownGoalX(state: GameState, team: 0 | 1): number {
  return attackDir(state, team) === 1 ? 0 : state.field.w;
}

/** True if the player is within the goalkeeper area in front of its own goal. */
export function inOwnArea(state: GameState, p: Player): boolean {
  return abs(p.x - ownGoalX(state, p.team)) < GK_AREA_DEPTH;
}

// Formation spots measured from the team's own goal line (x, px on the default pitch) and from the pitch centre line
// (dy, px on the default pitch). Both scale with the match's field. Indexed by team size; each list is in slot order
// (the slot is the def's position in the team).
const FORMATIONS: ReadonlyArray<ReadonlyArray<{ x: number; dy: number }>> = [
  [], // 0: unused
  [{ x: FIELD_W / 4, dy: 0 }], // 1: FW-like, centre of own half
  [
    { x: 250 * FIELD_SCALE, dy: 0 }, // DF
    { x: 540 * FIELD_SCALE, dy: 0 }, // FW
  ],
  [
    { x: 40, dy: 0 }, // GK
    { x: 250 * FIELD_SCALE, dy: 0 }, // DF
    { x: 540 * FIELD_SCALE, dy: 0 }, // FW
  ],
  [
    { x: 40, dy: 0 }, // GK
    { x: 250 * FIELD_SCALE, dy: 0 }, // DF
    { x: 420 * FIELD_SCALE, dy: 0 }, // MF (centre)
    { x: 540 * FIELD_SCALE, dy: 0 }, // FW
  ],
  [
    { x: 40, dy: 0 }, // GK
    { x: 250 * FIELD_SCALE, dy: 0 }, // DF
    { x: 420 * FIELD_SCALE, dy: -60 }, // MF
    { x: 420 * FIELD_SCALE, dy: 60 }, // MF
    { x: 540 * FIELD_SCALE, dy: 0 }, // FW
  ],
];

/**
 * Formation spot for a slot of a team of `teamSize` on `field`, mirrored when the team attacks -x (dir -1).
 * The x offsets and y offsets are scaled from the default pitch, so on the default field they are unchanged.
 */
export function formationPosition(
  field: FieldSize,
  teamSize: number,
  slot: number,
  dir: 1 | -1,
): { x: number; y: number } {
  const p = FORMATIONS[teamSize][slot];
  const x = p.x * (field.w / FIELD_W);
  const y = field.d / 2 + p.dy * (field.d / FIELD_D);
  return { x: dir === 1 ? x : field.w - x, y };
}
