// Roblox override of src/sim/hash.ts — keep exports and results identical.
import type { GameState } from './types';

/** FNV-1a digest is web-only for now; the cross-platform digest is R0 step 3. */
export function hashState(state: GameState): string {
  error("hashState is web-only; cross-platform digest comes in R0 step 3");
}

/** Recursive deep copy. Copying with the same keys preserves array-ness. */
function cloneValue(v: unknown): unknown {
  if (!typeIs(v, "table")) return v;
  const copy: object = {};
  for (const [k, val] of pairs(v as object)) {
    rawset(copy, k, cloneValue(val));
  }
  return copy;
}

export function cloneState(state: GameState): GameState {
  return cloneValue(state) as GameState;
}
