import { FIELD_W } from '../sim/constants';

export const FIELD_TOP = 86;
export const DEPTH_SCALE = 0.88;

/** Maps sim world space (x along the field, y across it, z height) to Phaser screen space. */
export function worldToScreen(x: number, y: number, z: number): { sx: number; sy: number } {
  return { sx: x, sy: FIELD_TOP + y * DEPTH_SCALE - z };
}

/**
 * Camera scrollX that centres a viewW-wide view on the ball, clamped to the field edges.
 * A view wider than the field is centred on the field.
 */
export function cameraTargetX(ballX: number, viewW: number): number {
  const min = -40;
  const max = FIELD_W + 40 - viewW;
  if (max < min) return (FIELD_W - viewW) / 2;
  return Math.min(Math.max(ballX - viewW / 2, min), max);
}

/** Shootout camera scrollX: fixed on the right goal. */
export function pkCameraX(viewW: number): number {
  return FIELD_W + 40 - viewW;
}
