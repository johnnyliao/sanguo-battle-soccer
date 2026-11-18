import { FIELD_W } from '../sim/constants';

export const FIELD_TOP = 86;
export const DEPTH_SCALE = 0.88;

/** Maps sim world space (x along the field, y across it, z height) to Phaser screen space. */
export function worldToScreen(x: number, y: number, z: number): { sx: number; sy: number } {
  return { sx: x, sy: FIELD_TOP + y * DEPTH_SCALE - z };
}

/** Camera scrollX that centres a 640-wide view on the ball, clamped to the field edges. */
export function cameraTargetX(ballX: number): number {
  return Math.min(Math.max(ballX - 320, -40), FIELD_W + 40 - 640);
}
