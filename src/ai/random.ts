import { imulU } from '../sim/num';
/** mulberry32 step over an AI rng field (AIState.rng). Returns a float in [0, 1) and advances it. */
export function nextRandom(ai: { rng: number }): number {
  ai.rng = (ai.rng + 0x6d2b79f5) >>> 0;
  let t = ai.rng;
  t = imulU(t ^ (t >>> 15), t | 1);
  t ^= t + imulU(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
