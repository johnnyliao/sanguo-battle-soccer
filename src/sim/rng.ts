import type { GameState } from './types';

/** mulberry32 step over state.rng. Returns a float in [0, 1) and advances state.rng. */
export function rngNext(state: GameState): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Returns an integer in [0, n) and advances state.rng. */
export function rngInt(state: GameState, n: number): number {
  return Math.floor(rngNext(state) * n);
}
