import { FIELD_D, FIELD_W, GOAL_H, GOAL_HALF_W } from './constants';

const MOUTH_Y_MIN = FIELD_D / 2 - GOAL_HALF_W;
const MOUTH_Y_MAX = FIELD_D / 2 + GOAL_HALF_W;

export interface GoalMouth {
  x: number;
  yMin: number;
  yMax: number;
  zMax: number;
}

/** side 0 = left goal (x = 0, defended by team 0), side 1 = right goal (x = FIELD_W, defended by team 1). */
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

// Team 0 kickoff positions on its own half (x, y); team 1 mirrors x.
const TEAM0_FORMATION: ReadonlyArray<{ x: number; y: number }> = [
  { x: 40, y: FIELD_D / 2 }, // GK
  { x: 250, y: FIELD_D / 2 }, // DF
  { x: 420, y: FIELD_D / 2 - 60 }, // MF
  { x: 420, y: FIELD_D / 2 + 60 }, // MF
  { x: 540, y: FIELD_D / 2 }, // FW
];

export function formationPosition(team: 0 | 1, slot: number): { x: number; y: number } {
  const p = TEAM0_FORMATION[slot];
  return { x: team === 0 ? p.x : FIELD_W - p.x, y: p.y };
}
