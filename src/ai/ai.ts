import {
  CHARGE_FULL,
  EMPTY_INPUT,
  FIELD_D,
  FIELD_W,
  GK_AREA_DEPTH,
  GOAL_HALF_W,
  attackDir,
  opponentGoalX,
  ownGoalX,
  type GameState,
  type InputFrame,
  type Player,
} from '../sim';
import { computePkAIInputs, createPkAIState, type PkAIState } from './pkAi';
import { nextRandom } from './random';

/**
 * Computer players. Each AI-controlled player gets one InputFrame per tick, built only from the
 * public game state and its own AIState. Nothing here touches the sim's rng.
 */

export interface AIState {
  /** mulberry32 state (uint32), private to the AI. */
  rng: number;
  perPlayer: { holdTicks: number; cooldown: number; intent: string }[];
  /** Penalty shootout choices for the current kick. */
  pk: PkAIState;
}

const PLAYER_COUNT = 10;
const CENTER_Y = FIELD_D / 2;
const EDGE_MARGIN = 20;

const ATTACK_COOLDOWN = 40;
const PUNCH_TRIGGER = 22;
const TACKLE_TRIGGER = 45;
const TACKLE_CHANCE = 0.05;
const OPPORTUNIST_RANGE = 18;
const OPPORTUNIST_CHANCE = 0.01;

const HEADER_RANGE = 30;
const HEADER_MIN_Z = 20;
const HEADER_MAX_Z = 55;

const SHOT_RANGE_FWD = 330;
const SHOT_RANGE_DF = 250;
const SHOT_CLEAR_RANGE = 60;
const SHOT_FULL_CHANCE = 0.4;
const SHOT_MIN_STAMINA = 30;

const PRESSURE_RANGE = 40;
const PRESSURE_PASS_CHANCE = 0.04;
const FORWARD_PASS_MIN_AHEAD = 80;
const FORWARD_PASS_CHANCE = 0.01;
const RECEIVER_FREE_RANGE = 50;
const DRIBBLE_DASH_RANGE = 80;
const DRIBBLE_DASH_LATERAL = 30;

const GK_HOLD_MIN = 30;
const GK_HOLD_SPAN = 31;
const GK_FORWARD_STEP = 100;
const GK_LINE_OFFSET = 18;
const GK_MOUTH_MARGIN = 6;
const DIVE_MIN_SPEED = 250;
const DIVE_MAX_DIST_X = 120;
const DIVE_MIN_DY = 14;

const FW_AHEAD = 150;
const MF_AHEAD = 60;
const MF_BEHIND = 40;
const MF_LANE = 70;
const DF_BEHIND = 180;
const DEFEND_LANE = 50;
const DEFEND_FRAC: Record<'DF' | 'MF' | 'FW', number> = { DF: 0.35, MF: 0.6, FW: 0.75 };

const DASH_STAMINA_FRAC = 0.4;
const DRIBBLE_DASH_STAMINA_FRAC = 0.5;
const STOP_DIST = 6;

interface Move {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
}

const NO_MOVE: Move = { moveX: 0, moveY: 0 };

export function createAIState(seed: number): AIState {
  return {
    rng: seed >>> 0,
    perPlayer: Array.from({ length: PLAYER_COUNT }, () => ({ holdTicks: 0, cooldown: 0, intent: 'support' })),
    pk: createPkAIState(),
  };
}

/** One InputFrame per player. Human-controlled slots get EMPTY_INPUT; the caller overwrites them. */
export function computeAIInputs(state: GameState, ai: AIState, humanMask: boolean[]): InputFrame[] {
  if (state.match.phase === 'pk') return computePkAIInputs(state, ai, humanMask);
  return state.players.map((p) => (humanMask[p.idx] ? { ...EMPTY_INPUT } : decide(state, ai, p)));
}

function decide(state: GameState, ai: AIState, p: Player): InputFrame {
  if (state.match.phase !== 'play') return { ...EMPTY_INPUT };
  const s = ai.perPlayer[p.idx];
  if (s.cooldown > 0) s.cooldown--;
  if (s.holdTicks > 0) s.holdTicks--;

  if (p.action !== 'normal') return busyFrame(state, p, s);
  if (state.ball.ownerIdx === p.idx) {
    return p.role === 'GK' ? gkOwnerFrame(state, ai, p, s) : ownerFrame(state, ai, p, s);
  }
  return freeFrame(state, ai, p, s);
}

/** Non-normal actions send nothing, except keeping J held while a shot is charging. */
function busyFrame(state: GameState, p: Player, s: AIState['perPlayer'][number]): InputFrame {
  if (p.action === 'charge' && s.intent === 'charge' && p.chargeTicks < CHARGE_FULL) {
    return frame(steerTo(p, opponentGoalX(state, p.team), CENTER_Y), { j: true });
  }
  return { ...EMPTY_INPUT };
}

function ownerFrame(state: GameState, ai: AIState, p: Player, s: AIState['perPlayer'][number]): InputFrame {
  const team = p.team;
  const dir = attackDir(state, team);
  const goalX = opponentGoalX(state, team);

  if (hasCaller(state, p)) return passFrame(p, null);

  const shotRange = p.role === 'DF' ? SHOT_RANGE_DF : SHOT_RANGE_FWD;
  if (Math.abs(goalX - p.x) < shotRange && p.facingX * dir > 0 && !p.prevInput.j) {
    const full =
      p.stamina >= SHOT_MIN_STAMINA &&
      nearestOpponent(state, team, p.x, p.y, SHOT_CLEAR_RANGE) === null &&
      nextRandom(ai) < SHOT_FULL_CHANCE;
    s.intent = full ? 'charge' : 'tap';
    return frame(steerTo(p, goalX, CENTER_Y), { j: true });
  }

  if (opponentAhead(state, p, PRESSURE_RANGE, Infinity) && nextRandom(ai) < PRESSURE_PASS_CHANCE) {
    s.intent = 'pass';
    return passFrame(p, pickReceiver(state, p, -Infinity));
  }

  const forward = pickReceiver(state, p, FORWARD_PASS_MIN_AHEAD);
  if (forward !== null && nextRandom(ai) < FORWARD_PASS_CHANCE) {
    s.intent = 'pass';
    return passFrame(p, forward);
  }

  s.intent = 'dribble';
  const ty = CENTER_Y + (p.y - CENTER_Y) * 0.6;
  const dash =
    p.stamina > DRIBBLE_DASH_STAMINA_FRAC * p.maxStamina &&
    !opponentAhead(state, p, DRIBBLE_DASH_RANGE, DRIBBLE_DASH_LATERAL);
  return frame(steerTo(p, goalX, ty), { dash });
}

function gkOwnerFrame(state: GameState, ai: AIState, p: Player, s: AIState['perPlayer'][number]): InputFrame {
  if (s.intent !== 'gkHold') {
    s.intent = 'gkHold';
    s.holdTicks = GK_HOLD_MIN + Math.floor(nextRandom(ai) * GK_HOLD_SPAN);
  }
  if (s.holdTicks > 0) {
    return frame(steerTo(p, p.x + attackDir(state, p.team) * GK_FORWARD_STEP, CENTER_Y));
  }
  return frame(NO_MOVE, { k: !p.prevInput.k });
}

/** Ball is loose or the other team has it. */
function freeFrame(state: GameState, ai: AIState, p: Player, s: AIState['perPlayer'][number]): InputFrame {
  const ball = state.ball;

  if (
    p.z === 0 &&
    p.vz === 0 &&
    ball.z > HEADER_MIN_Z &&
    ball.z < HEADER_MAX_Z &&
    dist(p.x, p.y, ball.x, ball.y) < HEADER_RANGE &&
    !p.prevInput.k
  ) {
    s.intent = 'header';
    return frame(steerTo(p, ball.x, ball.y), { k: true });
  }

  const victim = nearestOpponent(state, p.team, p.x, p.y, OPPORTUNIST_RANGE);
  if (
    victim !== null &&
    victim.idx !== ball.ownerIdx &&
    s.cooldown === 0 &&
    !p.prevInput.j &&
    nextRandom(ai) < OPPORTUNIST_CHANCE
  ) {
    s.cooldown = ATTACK_COOLDOWN;
    s.intent = 'attack';
    return frame(steerTo(p, victim.x, victim.y), { j: true });
  }

  if (p.role === 'GK') return gkFreeFrame(state, p, s);

  const owner = ball.ownerIdx === -1 ? null : state.players[ball.ownerIdx];
  if (owner !== null && owner.team === p.team) return supportFrame(state, p, s);
  const chasers = owner === null ? 2 : 1;
  if (chaseRank(state, p) < chasers) return chaseFrame(state, ai, p, s, owner);
  return defendFrame(state, p, s);
}

function gkFreeFrame(state: GameState, p: Player, s: AIState['perPlayer'][number]): InputFrame {
  s.intent = 'gk';
  const ball = state.ball;
  const goalX = ownGoalX(state, p.team);
  const inward = goalX === 0 ? 1 : -1;

  if (ball.ownerIdx === -1) {
    const towardGoal = goalX === 0 ? ball.vx < 0 : ball.vx > 0;
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (towardGoal && speed > DIVE_MIN_SPEED && Math.abs(ball.x - goalX) < DIVE_MAX_DIST_X) {
      const t = (goalX - ball.x) / ball.vx;
      const projY = ball.y + ball.vy * t;
      if (Math.abs(projY - p.y) > DIVE_MIN_DY && p.z === 0 && p.vz === 0 && !p.prevInput.k) {
        s.intent = 'dive';
        return frame(steerTo(p, p.x, projY), { k: true });
      }
    }
    if (Math.abs(ball.x - goalX) < GK_AREA_DEPTH && isClosestToBall(state, p)) {
      s.intent = 'gkChase';
      return frame(steerTo(p, ball.x, ball.y));
    }
  }

  const ty = clamp(ball.y, CENTER_Y - (GOAL_HALF_W - GK_MOUTH_MARGIN), CENTER_Y + (GOAL_HALF_W - GK_MOUTH_MARGIN));
  return frame(steerTo(p, goalX + inward * GK_LINE_OFFSET, ty));
}

/** Our team has the ball and this player is not the carrier. */
function supportFrame(state: GameState, p: Player, s: AIState['perPlayer'][number]): InputFrame {
  s.intent = 'support';
  const ball = state.ball;
  const dir = attackDir(state, p.team);
  let tx: number;
  let ty: number;
  if (p.role === 'FW') {
    tx = ball.x + dir * FW_AHEAD;
    ty = clamp(ball.y, CENTER_Y - GOAL_HALF_W, CENTER_Y + GOAL_HALF_W);
  } else if (p.role === 'MF') {
    if (p.idx % 5 === 2) {
      tx = ball.x + dir * MF_AHEAD;
      ty = CENTER_Y - MF_LANE;
    } else {
      tx = ball.x - dir * MF_BEHIND;
      ty = CENTER_Y + MF_LANE;
    }
  } else {
    tx = ball.x - dir * DF_BEHIND;
    ty = CENTER_Y + (ball.y - CENTER_Y) * 0.5;
  }
  tx = clamp(tx, EDGE_MARGIN, FIELD_W - EDGE_MARGIN);
  ty = clamp(ty, EDGE_MARGIN, FIELD_D - EDGE_MARGIN);
  const far = dist(p.x, p.y, tx, ty) > 120;
  return frame(steerTo(p, tx, ty), { dash: far && p.stamina > DASH_STAMINA_FRAC * p.maxStamina });
}

/** Chaser for a loose ball (owner null) or for an opponent carrier (punch / slide tackle when close). */
function chaseFrame(
  state: GameState,
  ai: AIState,
  p: Player,
  s: AIState['perPlayer'][number],
  owner: Player | null,
): InputFrame {
  s.intent = 'chase';
  const dashOk = p.stamina > DASH_STAMINA_FRAC * p.maxStamina;
  if (owner === null) {
    const ball = state.ball;
    const d = dist(p.x, p.y, ball.x, ball.y);
    return frame(steerTo(p, ball.x, ball.y), { dash: dashOk && d > 40 });
  }

  const move = steerTo(p, owner.x, owner.y);
  const d = dist(p.x, p.y, owner.x, owner.y);
  if (s.cooldown === 0 && !p.prevInput.j) {
    if (d < PUNCH_TRIGGER && facingDot(p, owner.x, owner.y) > 0.5) {
      s.cooldown = ATTACK_COOLDOWN;
      s.intent = 'punch';
      return frame(move, { j: true });
    }
    if (d < TACKLE_TRIGGER && nextRandom(ai) < TACKLE_CHANCE) {
      s.cooldown = ATTACK_COOLDOWN;
      s.intent = 'tackle';
      return frame(move, { dash: true, j: true });
    }
  }
  return frame(move, { dash: dashOk && d > 60 });
}

/** Holds a spot between the ball and our own goal, by role. */
function defendFrame(state: GameState, p: Player, s: AIState['perPlayer'][number]): InputFrame {
  s.intent = 'defend';
  const ball = state.ball;
  const goalX = ownGoalX(state, p.team);
  const frac = p.role === 'DF' ? DEFEND_FRAC.DF : p.role === 'MF' ? DEFEND_FRAC.MF : DEFEND_FRAC.FW;
  const lane = p.role === 'MF' ? (p.idx % 5 === 2 ? -DEFEND_LANE : DEFEND_LANE) : 0;
  const tx = clamp(goalX + (ball.x - goalX) * frac, EDGE_MARGIN, FIELD_W - EDGE_MARGIN);
  const ty = clamp(CENTER_Y + (ball.y - CENTER_Y) * 0.6 + lane, EDGE_MARGIN, FIELD_D - EDGE_MARGIN);
  const far = dist(p.x, p.y, tx, ty) > 120;
  return frame(steerTo(p, tx, ty), { dash: far && p.stamina > DASH_STAMINA_FRAC * p.maxStamina });
}

/** Pass frame: steer toward the receiver (sets facing), then press K. */
function passFrame(p: Player, receiver: Player | null): InputFrame {
  const move = receiver === null ? NO_MOVE : steerTo(p, receiver.x, receiver.y);
  return frame(move, { k: !p.prevInput.k });
}

function frame(move: Move, extra: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, moveX: move.moveX, moveY: move.moveY, ...extra };
}

/** 8-way direction toward (tx, ty). An axis is held when it carries most of the distance. */
function steerTo(p: { x: number; y: number }, tx: number, ty: number): Move {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < STOP_DIST) return NO_MOVE;
  return {
    moveX: Math.abs(dx) > 0.38 * d ? sign(dx) : 0,
    moveY: Math.abs(dy) > 0.38 * d ? sign(dy) : 0,
  };
}

function sign(v: number): -1 | 0 | 1 {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Dot product of the player's facing with the unit vector toward (x, y). 0 if the point is the player. */
function facingDot(p: Player, x: number, y: number): number {
  const d = dist(p.x, p.y, x, y);
  if (d === 0) return 0;
  return (p.facingX * (x - p.x) + p.facingY * (y - p.y)) / d;
}

function hasCaller(state: GameState, p: Player): boolean {
  return state.players.some(
    (t) => t.team === p.team && t.idx !== p.idx && t.action !== 'down' && t.callPassTicks > 0,
  );
}

/** Nearest standing opponent of `team` within range, or null. Ties go to the lowest idx. */
function nearestOpponent(state: GameState, team: 0 | 1, x: number, y: number, range: number): Player | null {
  let best: Player | null = null;
  let bestDist = range;
  for (const t of state.players) {
    if (t.team === team || t.action === 'down') continue;
    const d = dist(t.x, t.y, x, y);
    if (d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

/** True if a standing opponent is within range and in the half-plane ahead of the player's facing (within lateral). */
function opponentAhead(state: GameState, p: Player, range: number, lateral: number): boolean {
  return state.players.some((t) => {
    if (t.team === p.team || t.action === 'down') return false;
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    if (Math.sqrt(dx * dx + dy * dy) >= range) return false;
    const along = dx * p.facingX + dy * p.facingY;
    if (along <= 0) return false;
    return Math.abs(dx * p.facingY - dy * p.facingX) < lateral;
  });
}

/**
 * Free teammate (no opponent within RECEIVER_FREE_RANGE) that is at least minAhead further toward the
 * opponent goal than the player. Picks the one furthest forward. Null if none.
 */
function pickReceiver(state: GameState, p: Player, minAhead: number): Player | null {
  const dir = attackDir(state, p.team);
  let best: Player | null = null;
  let bestAhead = -Infinity;
  for (const t of state.players) {
    if (t.team !== p.team || t.idx === p.idx || t.action === 'down') continue;
    const ahead = (t.x - p.x) * dir;
    if (ahead < minAhead || ahead <= bestAhead) continue;
    if (nearestOpponent(state, p.team, t.x, t.y, RECEIVER_FREE_RANGE) !== null) continue;
    best = t;
    bestAhead = ahead;
  }
  return best;
}

/** Number of standing non-GK teammates strictly closer to the ball than this player (ties: lower idx first). */
function chaseRank(state: GameState, p: Player): number {
  const ball = state.ball;
  const dp = dist(p.x, p.y, ball.x, ball.y);
  let rank = 0;
  for (const t of state.players) {
    if (t.team !== p.team || t.idx === p.idx || t.role === 'GK' || t.action === 'down') continue;
    const d = dist(t.x, t.y, ball.x, ball.y);
    if (d < dp || (d === dp && t.idx < p.idx)) rank++;
  }
  return rank;
}

function isClosestToBall(state: GameState, p: Player): boolean {
  const ball = state.ball;
  const dp = dist(p.x, p.y, ball.x, ball.y);
  return state.players.every(
    (t) => t === p || t.action === 'down' || dist(t.x, t.y, ball.x, ball.y) >= dp,
  );
}
