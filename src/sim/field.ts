import { abs } from './num';
import { FIELD_D, FIELD_SCALE, FIELD_W, GK_AREA_DEPTH, GOAL_H, GOAL_HALF_W } from './constants';
import type { GameState, Player } from './types';

const MOUTH_Y_MIN = FIELD_D / 2 - GOAL_HALF_W;
const MOUTH_Y_MAX = FIELD_D / 2 + GOAL_HALF_W;

export interface GoalMouth {
  x: number;
  yMin: number;
  yMax: number;
  zMax: number;
}

/** side 0 = left goal (x = 0), side 1 = right goal (x = FIELD_W). */
export function goalMouth(side: 0 | 1): GoalMouth {
  return {
    x: side === 0 ? 0 : FIELD_W,
    yMin: MOUTH_Y_MIN,
    yMax: MOUTH_Y_MAX,
    zMax: GOAL_H,
  };
}

/** True if a point at depth y and height z is within the goal mouth opening. */
export function isInGoalMouth(y: number, z: number): boolean {
  return y >= MOUTH_Y_MIN && y <= MOUTH_Y_MAX && z < GOAL_H;
}

/** Direction a team attacks this half: +1 toward x = FIELD_W, -1 toward x = 0. Team 0 attacks +1 until the side swap. */
export function attackDir(state: GameState, team: 0 | 1): 1 | -1 {
  if (team === 0) return state.match.swapped ? -1 : 1;
  return state.match.swapped ? 1 : -1;
}

/** x of the goal the team attacks. */
export function opponentGoalX(state: GameState, team: 0 | 1): number {
  return attackDir(state, team) === 1 ? FIELD_W : 0;
}

/** x of the goal the team defends. */
export function ownGoalX(state: GameState, team: 0 | 1): number {
  return attackDir(state, team) === 1 ? 0 : FIELD_W;
}

/** True if the player is within the goalkeeper area in front of its own goal. */
export function inOwnArea(state: GameState, p: Player): boolean {
  return abs(p.x - ownGoalX(state, p.team)) < GK_AREA_DEPTH;
}

// Formation offsets measured from the team's own goal line (x), for a team attacking +x. slot order GK,DF,MF,MF,FW.
const FORMATION: ReadonlyArray<{ x: number; y: number }> = [
  { x: 40, y: FIELD_D / 2 }, // GK
  { x: 250 * FIELD_SCALE, y: FIELD_D / 2 }, // DF
  { x: 420 * FIELD_SCALE, y: FIELD_D / 2 - 60 }, // MF
  { x: 420 * FIELD_SCALE, y: FIELD_D / 2 + 60 }, // MF
  { x: 540 * FIELD_SCALE, y: FIELD_D / 2 }, // FW
];

/** Formation spot for a slot, mirrored when the team attacks -x (dir -1). */
export function formationPosition(slot: number, dir: 1 | -1): { x: number; y: number } {
  const p = FORMATION[slot];
  return { x: dir === 1 ? p.x : FIELD_W - p.x, y: p.y };
}
