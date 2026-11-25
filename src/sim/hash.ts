import { stateDigest } from './digest';
import type { GameState } from './types';

/** Digest of the full state; same value on web and Roblox (see digest.ts). */
export function hashState(state: GameState): string {
  return stateDigest(state);
}
