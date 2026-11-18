import type { BodySize, CharacterDef, Role, SpecialKind, Stats } from '../data/types';

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
  | 'recover'
  | 'charge'
  | 'dive';

export type AttackKind = 'punch' | 'tackle' | 'flykick' | 'special';

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
  /** Ticks spent charging a shot (J held while owning the ball). */
  chargeTicks: number;
  specialKind: SpecialKind;
  specialName: string;
  prevInput: InputFrame;
}

/** A special shot in flight. Only set while the ball is unowned and flying under special rules. */
export interface SpecialShot {
  kind: SpecialKind;
  shooterIdx: number;
  team: 0 | 1;
  ticks: number;
  dirX: number;
  dirY: number;
  /** Player idxs already hit by this special. */
  hit: number[];
  /** Goalkeeper idxs that already rolled a save on this special (separate from hit so contact still applies on a failed save). */
  rolled: number[];
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
  special: SpecialShot | null;
}

export type SimEvent =
  | { type: 'pickup'; playerIdx: number }
  | { type: 'bounce'; strength: number }
  | { type: 'attack'; playerIdx: number; kind: AttackKind }
  | { type: 'hit'; attackerIdx: number; victimIdx: number; kind: AttackKind; damage: number }
  | { type: 'down'; playerIdx: number }
  | { type: 'jump'; playerIdx: number }
  | { type: 'callPass'; playerIdx: number }
  | { type: 'looseBall'; playerIdx: number }
  | { type: 'kick'; playerIdx: number; kind: 'pass' | 'shot' | 'clear'; targetIdx: number }
  | { type: 'chargeFull'; playerIdx: number }
  | { type: 'special'; playerIdx: number; kind: SpecialKind; name: string }
  | { type: 'specialEnd' }
  | { type: 'whistle'; reason: 'kickoff' | 'half' | 'full' }
  | { type: 'goal'; team: 0 | 1; scorerIdx: number }
  | { type: 'matchEnd'; score: [number, number] }
  | { type: 'pkStart' }
  | { type: 'pkKick'; shooterIdx: number }
  | { type: 'pkResult'; team: 0 | 1; outcome: 'goal' | 'save' | 'miss' }
  | { type: 'pkEnd'; winner: 0 | 1; score: [number, number] }
  | { type: 'save'; playerIdx: number; caught: boolean };

export type PkStage = 'order' | 'aim' | 'flight' | 'result' | 'done';

/** Penalty shootout state. Set on MatchState.pk when the 2nd half ends level. */
export interface PkState {
  stage: PkStage;
  stageTimer: number;
  /** Player idxs per team (5 each), null until chosen. */
  order: [number[] | null, number[] | null];
  kicks: [('goal' | 'miss')[], ('goal' | 'miss')[]];
  kickingTeam: 0 | 1;
  firstTeam: 0 | 1;
  shooterIdx: number;
  keeperIdx: number;
  /** Ticks J has been held since the press; -1 = meter not started. */
  meterTicks: number;
  /** 0..1, locked at release. */
  power: number;
  /** Locked at release. col 0 = top/far post, 1 = center, 2 = bottom/near post. */
  aimCol: number;
  aimHigh: boolean;
  guessCol: number;
  guessHigh: boolean;
  outcome: null | 'goal' | 'save' | 'miss';
  score: [number, number];
  winner: -1 | 0 | 1;
}

export type MatchPhase = 'kickoff' | 'play' | 'goal' | 'halftime' | 'fulltime' | 'pk';

export interface MatchState {
  phase: MatchPhase;
  /** Ticks remaining in timed phases. */
  phaseTimer: number;
  half: 1 | 2;
  /** Ticks remaining in the current half (counts down only in 'play'). */
  clockTicks: number;
  /** Configured half length in ticks. */
  halfTicks: number;
  score: [number, number];
  /** false in 1st half (team 0 attacks +x); true in 2nd half (team 0 attacks -x). */
  swapped: boolean;
  kickoffTeam: 0 | 1;
  firstKickoffTeam: 0 | 1;
  lastGoal: null | { team: 0 | 1; scorerIdx: number; tick: number };
  /** null until the penalty shootout starts. */
  pk: PkState | null;
}

export interface GameState {
  tick: number;
  /** mulberry32 state (uint32). */
  rng: number;
  /** 10 players: idx 0-4 team 0, 5-9 team 1; slot order GK,DF,MF,MF,FW. */
  players: Player[];
  ball: Ball;
  match: MatchState;
  /** Cleared at the start of every step. */
  events: SimEvent[];
}

export interface MatchSetup {
  seed: number;
  /** Each team is exactly 5 defs: GK, DF, MF, MF, FW. */
  teams: [CharacterDef[], CharacterDef[]];
  /** Half length in seconds. Default 120. */
  halfSeconds?: number;
  /** Start in 'play' with no kickoff wait (for fixtures). */
  startInPlay?: boolean;
}
