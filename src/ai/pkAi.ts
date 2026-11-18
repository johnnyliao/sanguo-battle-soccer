import { EMPTY_INPUT, pkMeterValue, type GameState, type InputFrame, type PkState } from '../sim';
import type { AIState } from './ai';
import { nextRandom } from './random';

/** Per-kick choices, made once at the first aim tick of each kick (kicks taken so far identify the kick). */
export interface PkAIState {
  /** Kicks taken when the choices were made; -1 = none yet. */
  kickNo: number;
  waitTicks: number;
  aimCol: number;
  aimHigh: boolean;
  targetPower: number;
  guessCol: number;
  guessHigh: boolean;
}

export function createPkAIState(): PkAIState {
  return {
    kickNo: -1,
    waitTicks: 0,
    aimCol: 1,
    aimHigh: false,
    targetPower: 1,
    guessCol: 1,
    guessHigh: false,
  };
}

const WAIT_MIN = 30;
const WAIT_SPAN = 31;
const POWER_BASE = 0.7;
const POWER_SPAN = 0.2;
const POWER_NOISE_PER_TECH = 0.02;
const SHOOT_HIGH_CHANCE = 0.4;
const KEEPER_CENTER_CHANCE = 0.45;
const KEEPER_LEFT_CUT = 0.725;
const KEEPER_HIGH_CHANCE = 0.35;

/** Input frames for a penalty shootout tick. Only the shooter and keeper of the current kick act. */
export function computePkAIInputs(state: GameState, ai: AIState, humanMask: boolean[]): InputFrame[] {
  const frames = state.players.map(() => ({ ...EMPTY_INPUT }));
  const pk = state.match.pk;
  if (pk === null || pk.stage !== 'aim') return frames;

  const kickNo = pk.kicks[0].length + pk.kicks[1].length;
  if (ai.pk.kickNo !== kickNo) chooseKick(state, ai, pk, kickNo);

  const shooter = state.players[pk.shooterIdx];
  const keeper = state.players[pk.keeperIdx];
  if (!humanMask[shooter.idx]) frames[shooter.idx] = shooterFrame(pk, ai);
  if (!humanMask[keeper.idx]) frames[keeper.idx] = keeperFrame(ai);
  return frames;
}

function chooseKick(state: GameState, ai: AIState, pk: PkState, kickNo: number): void {
  const shooter = state.players[pk.shooterIdx];
  const s = ai.pk;
  s.kickNo = kickNo;
  s.aimCol = Math.floor(nextRandom(ai) * 3);
  s.aimHigh = nextRandom(ai) < SHOOT_HIGH_CHANCE;
  const base = POWER_BASE + nextRandom(ai) * POWER_SPAN;
  const noise = (nextRandom(ai) * 2 - 1) * (10 - shooter.stats.technique) * POWER_NOISE_PER_TECH;
  s.targetPower = clamp(base + noise, 0, 1);
  s.waitTicks = WAIT_MIN + Math.floor(nextRandom(ai) * WAIT_SPAN);

  const r = nextRandom(ai);
  s.guessCol = r < KEEPER_CENTER_CHANCE ? 1 : r < KEEPER_LEFT_CUT ? 0 : 2;
  s.guessHigh = nextRandom(ai) < KEEPER_HIGH_CHANCE;
}

/** Waits, presses J, holds the aim, and releases when the meter reaches the target. */
function shooterFrame(pk: PkState, ai: AIState): InputFrame {
  const s = ai.pk;
  const aim: InputFrame = { ...EMPTY_INPUT, moveY: (s.aimCol - 1) as -1 | 0 | 1, k: s.aimHigh };
  if (pk.meterTicks < 0) {
    if (s.waitTicks > 0) {
      s.waitTicks--;
      return aim;
    }
    return { ...aim, j: true };
  }
  const release = pkMeterValue(pk.meterTicks) >= s.targetPower;
  return { ...aim, j: !release };
}

function keeperFrame(ai: AIState): InputFrame {
  const s = ai.pk;
  return { ...EMPTY_INPUT, moveY: (s.guessCol - 1) as -1 | 0 | 1, k: s.guessHigh };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
