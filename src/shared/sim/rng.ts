import type { GameState } from './types';

/**
 * Math.imul replacement: low 32 bits of a*b as an unsigned number. Splits into 16-bit halves so every
 * intermediate stays below 2^53 (exact in Luau doubles). Inputs are uint32 or int32 values.
 */
export function imul(a: number, b: number): number {
  const ah = (a >>> 16) & 0xffff;
  const al = a & 0xffff;
  const bh = (b >>> 16) & 0xffff;
  const bl = b & 0xffff;
  return (al * bl + ((ah * bl + al * bh) % 65536) * 65536) % 4294967296;
}

/** mulberry32 step over state.rng. Returns a float in [0, 1) and advances state.rng. */
export function rngNext(state: GameState): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = imul(t ^ (t >>> 15), t | 1);
  t ^= t + imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Returns an integer in [0, n) and advances state.rng. */
export function rngInt(state: GameState, n: number): number {
  return math.floor(rngNext(state) * n);
}
