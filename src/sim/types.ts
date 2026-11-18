import type { BodySize, CharacterDef, Role, Stats } from '../data/types';

/** Held-button state for one tick. dash = virtual dash button. */
export interface InputFrame {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  dash: boolean;
  j: boolean;
  k: boolean;
  l: boolean;
}

export const EMPTY_INPUT: InputFrame = {
  moveX: 0,
  moveY: 0,
  dash: false,
  j: false,
  k: false,
  l: false,
};

export type PlayerAction =
  | 'normal'
  | 'punch'
  | 'tackle'
  | 'jump'
  | 'flykick'
  | 'hitstun'
  | 'down'
  | 'recover';

export type AttackKind = 'punch' | 'tackle' | 'flykick';

export interface Player {
  idx: number;
  charId: string;
  name: string;
  team: 0 | 1;
  role: Role;
  size: BodySize;
  stats: Stats;
  radius: number;
  mass: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Unit vector of the last nonzero move direction. */
  facingX: number;
  facingY: number;
  stamina: number;
  maxStamina: number;
  action: PlayerAction;
  /** Ticks remaining in the current action. */
  actionTimer: number;
  /** Current attack already hit someone. */
  hitDone: boolean;
  /** Ticks remaining for a called pass. */
  callPassTicks: number;
  /** Ticks during which this player cannot pick up the ball. */
  noTouchTicks: number;
  prevInput: InputFrame;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Index of the owning player, or -1 when unowned. */
  ownerIdx: number | -1;
  /** Index of the last player who touched the ball, or -1. */
  lastTouchIdx: number | -1;
}

export type SimEvent =
  | { type: 'pickup'; playerIdx: number }
  | { type: 'bounce'; strength: number }
  | { type: 'attack'; playerIdx: number; kind: AttackKind }
  | { type: 'hit'; attackerIdx: number; victimIdx: number; kind: AttackKind; damage: number }
  | { type: 'down'; playerIdx: number }
  | { type: 'jump'; playerIdx: number }
  | { type: 'callPass'; playerIdx: number }
  | { type: 'looseBall'; playerIdx: number };

export interface GameState {
  tick: number;
  /** mulberry32 state (uint32). */
  rng: number;
  /** 10 players: idx 0-4 team 0, 5-9 team 1; slot order GK,DF,MF,MF,FW. */
  players: Player[];
  ball: Ball;
  /** Cleared at the start of every step. */
  events: SimEvent[];
}

export interface MatchSetup {
  seed: number;
  /** Each team is exactly 5 defs: GK, DF, MF, MF, FW. */
  teams: [CharacterDef[], CharacterDef[]];
}
