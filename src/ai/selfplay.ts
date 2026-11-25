import { SIZE_PARAMS, getTeam } from '../data/characters';
import type { Country } from '../data/types';
import { createInitialState, stateDigest, step as simStep, type GameState } from '../sim';
import { computeAIInputs, createAIState, type AIState } from './ai';

/**
 * A full AI-vs-AI match that can be advanced in chunks. Both platforms run the same code, so the
 * checkpoints (score + state digest) must match tick for tick.
 */

/** Fixed R0 scenario used for the web-to-Roblox golden comparison. */
export const R0_SEED = 12345;
export const R0_HOME: Country = 'shu';
export const R0_AWAY: Country = 'wei';
export const R0_CHECKPOINT = 600;

const NO_HUMANS: boolean[] = [false, false, false, false, false, false, false, false, false, false];

export interface SelfPlay {
  /** Ticks simulated so far (the state's tick). */
  tick: number;
  /** Advances up to n ticks with all 10 players AI-controlled; stops early when the match is finished. */
  step(n: number): void;
  /** True once the match is at full time (penalty shootouts included). */
  done(): boolean;
  /** Current score [home, away]. */
  score(): [number, number];
  /** Canonical state digest (see stateDigest). */
  digest(): string;
}

function finished(state: GameState): boolean {
  return state.match.phase === 'fulltime';
}

export function createSelfPlay(seed: number, home: Country, away: Country): SelfPlay {
  const state = createInitialState({ seed, teams: [getTeam(home), getTeam(away)] }, SIZE_PARAMS);
  const ai: AIState = createAIState(seed);
  const sp: SelfPlay = {
    tick: 0,
    step(n: number): void {
      let i = 0;
      while (i < n && !finished(state)) {
        simStep(state, computeAIInputs(state, ai, NO_HUMANS));
        i++;
      }
      sp.tick = state.tick;
    },
    done(): boolean {
      return finished(state);
    },
    score(): [number, number] {
      return [state.match.score[0], state.match.score[1]];
    },
    digest(): string {
      return stateDigest(state);
    },
  };
  return sp;
}
