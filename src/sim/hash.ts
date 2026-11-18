import type { GameState } from './types';

/** FNV-1a 32-bit over JSON.stringify(state), returned as 8 hex chars. */
export function hashState(state: GameState): string {
  const s = JSON.stringify(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}
