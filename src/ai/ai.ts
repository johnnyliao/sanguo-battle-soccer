import { INF, abs, sqrt, floor, min, max, len } from '../sim/num';
import {
  EASTWIND_RADIUS,
  EMPTY_INPUT,
  FEAR_RADIUS,
  FIELD_D,
  FIELD_SCALE,
  FIELD_W,
  GK_AREA_DEPTH,
  GOAL_HALF_W,
  GUST_RADIUS,
  GUST_TARGET_RANGE,
  LEAP_BACK_DISTANCE,
  LEAP_FLY_DISTANCE,
  LEAP_RADIUS,
  PORTAL_RADIUS,
  RIDE_DISTANCE,
  RIDE_LANE_HALF,
  ROAR_FORWARD,
  ROAR_RADIUS,
  SPECIAL_STAMINA_COST,
  attackDir,
  goalMouth,
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

const SHOT_RANGE_FWD = 330;
const SHOT_RANGE_DF = 250;
/** Per-tick chance to use the special while eligible (the button fires instantly, so keep it rare). */
const SHOT_FULL_CHANCE = 0.02;
const SPECIAL_RANGE = 480;
const SHOT_MIN_STAMINA = 25;
/** A special (rampage) is started from this far out, whatever the role. */
const CHARGE_SHOT_RANGE = 560;
/** A rampaging owner fires its special once this close to the goal (lob kinds from further out). */
const RAMPAGE_FIRE_RANGE = 260;
const RAMPAGE_FIRE_RANGE_LOB = 380;
/** A rampaging owner fires when this few rampage ticks are left. */
const RAMPAGE_FIRE_LEFT = 15;
/** Ma Chao's summon is called when at least SUMMON_AI_MIN_OPPONENTS standing opponents are within this range. */
const SUMMON_AI_RANGE = 200;
const SUMMON_AI_MIN_OPPONENTS = 2;
/** Fear (Zhang Liao): cast when an enemy carrier is within FEAR_RADIUS, or at least FEAR_MIN_OPPONENTS standing opponents are. */
const FEAR_MIN_OPPONENTS = 2;
/** Portal (Da Qiao): cast when an enemy carrier is within PORTAL_RADIUS, or at least PORTAL_MIN_OPPONENTS standing opponents are. */
const PORTAL_MIN_OPPONENTS = 2;
/** East wind (Zhou Yu): cast when an enemy carrier is within EASTWIND_RADIUS, or at least EASTWIND_MIN_OPPONENTS standing opponents are. */
const EASTWIND_MIN_OPPONENTS = 2;
/** Ride (Guan Yu), off the ball: the lane starts this far ahead of him; two standing opponents in it, or an opponent carrier, cast it. */
const RIDE_LANE_MIN_AHEAD = 30;
const RIDE_LANE_MIN_OPPONENTS = 2;
/** Ride, owner: an opponent this close makes the ride an escape. */
const RIDE_OWNER_ESCAPE_RANGE = 90;
/** Lunge (Zhao Yun), off the ball: cast when an opponent carrier is this far away, roughly in front of the lunger. */
const LUNGE_BALL_MIN = 60;
const LUNGE_BALL_MAX = 190;
const LUNGE_BALL_LATERAL = 50;
/** Leap (Sima Yi): net distance the leap carries him along his facing (back-hop then flight). */
const LEAP_LAND = LEAP_FLY_DISTANCE - LEAP_BACK_DISTANCE;
/** Leap, off the ball: the carrier must be this far ahead of him along his facing, and near the landing spot. */
const LEAP_BALL_MIN_AHEAD = 260;
const LEAP_BALL_MAX_AHEAD = 380;
const LEAP_TARGET_MIN_OPPONENTS = 2;
/** Leap, owner: an opponent this close makes the leap an escape and advance. */
const LEAP_OWNER_ESCAPE_RANGE = 100;
/** Tiger guard (Xu Chu), off the ball: per-tick chance once a threat holds (the window is short, so higher than the others). */
const TIGER_AI_CHANCE = 0.1;
/** Tiger, off the ball: an opponent carrier this close (in x) to his own goal line. */
const TIGER_CARRIER_RANGE = 260;
/** Tiger, off the ball: a moving loose ball last touched by an opponent, heading at his goal, this close (in x) to the goal line. */
const TIGER_SHOT_RANGE = 350;
/** Arrowship (Sun Quan), off the ball: per-tick chance once a threat holds (the block window is short, like the tiger's). */
const ARROWSHIP_AI_CHANCE = 0.1;
/** Arrowship, off the ball: a loose ball last touched by an opponent, heading at his goal this fast (|vx|) and this close (in x) to the goal line. */
const ARROWSHIP_SHOT_MIN_VX = 200;
const ARROWSHIP_SHOT_RANGE = 250;
/** Arrowship, off the ball: an opponent carrier this close to his own goal centre. */
const ARROWSHIP_CARRIER_RANGE = 200;
/** Slash (Cao Cao), cast: an opponent this close, or an opponent carrier within SLASH_CARRIER_RANGE. */
const SLASH_CAST_RANGE = 140;
const SLASH_CARRIER_RANGE = 200;
/** Slash, buff: the enemy carrier within this range is chased in preference to the nearest opponent. */
const SLASH_CHASE_CARRIER_RANGE = 260;
/** Slash, buff: holds this far from the chased opponent once facing him (inside the 120 px wave range). */
const SLASH_STANDOFF = 80;
/** Ice field (Zhen Ji), off the ball: cast when an enemy carrier is this close, or ICE_OFF_BALL_MIN_OPPONENTS standing opponents are within ICE_OFF_BALL_RANGE. */
const ICE_CARRIER_RANGE = 90;
const ICE_OFF_BALL_RANGE = 100;
const ICE_OFF_BALL_MIN_OPPONENTS = 2;
/** Ice field, owner: cast when an opponent is within ICE_OWNER_NEAR_RANGE (a chaser), or ICE_OWNER_MIN_OPPONENTS are within ICE_OWNER_RANGE. */
const ICE_OWNER_NEAR_RANGE = 70;
const ICE_OWNER_RANGE = 110;
const ICE_OWNER_MIN_OPPONENTS = 2;
/** Sail (Sun Ce), owner: cast when an opponent is this close (break through), or when facing the goal with no standing opponent SAIL_OPEN_RANGE ahead and the goal within SAIL_OPEN_MAX_GOAL_DIST. */
const SAIL_ESCAPE_RANGE = 90;
const SAIL_OPEN_RANGE = 120;
const SAIL_OPEN_MAX_GOAL_DIST = 600;
/** Sail, off the ball: cast when an enemy carrier is this close, so the boat sails into him and frees the ball. */
const SAIL_CARRIER_RANGE = 220;

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
const DF_BEHIND = 180 * FIELD_SCALE;
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
  const perPlayer: AIState['perPlayer'] = [];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    perPlayer.push({ holdTicks: 0, cooldown: 0, intent: 'support' });
  }
  return {
    rng: seed >>> 0,
    perPlayer,
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

  // Silenced (Sima Yi's leap): no attack, shot, pass, call or special. A silenced holder dribbles at the opponent goal;
  // anyone else moves as usual with J, K and L held off.
  if (p.silenceTicks > 0 && p.action === 'normal' && state.ball.ownerIdx === p.idx) {
    s.intent = 'silencedDribble';
    return frame(steerTo(p, opponentGoalX(state, p.team), CENTER_Y));
  }
  const f = activeFrame(state, ai, p, s);
  return p.silenceTicks > 0 ? { ...f, j: false, k: false, l: false } : f;
}

function activeFrame(state: GameState, ai: AIState, p: Player, s: AIState['perPlayer'][number]): InputFrame {
  // A passenger on Sun Ce's sail: the sim ignores his input.
  if (p.sailPassengerOf !== -1) return { ...EMPTY_INPUT };
  const roar = roarFrame(state, p, s);
  if (roar !== undefined) return roar;
  if (p.action !== 'normal') return { ...EMPTY_INPUT };
  if (p.sailTicks > 0) return sailFrame(state, p, s);
  if (state.ball.ownerIdx === p.idx) {
    if (p.rampageTicks > 0) return rampageFrame(state, p, s);
    return p.role === 'GK' ? gkOwnerFrame(state, ai, p, s) : ownerFrame(state, ai, p, s);
  }
  if (p.specialMode === 'slash' && p.slashTicks > 0) {
    const chase = slashChaseFrame(state, ai, p, s);
    if (chase !== undefined) return chase;
  }
  const special = offBallSpecialFrame(state, ai, p, s);
  if (special !== undefined) return special;
  return freeFrame(state, ai, p, s);
}

/**
 * Zhang Fei's roar (the one special that is not a rampage). While the roar is worth it, L is pressed; the roar fires at
 * once, with or without the ball. As goalkeeper, an incoming shot in the roar's reach is roared at with certainty, on
 * the normal goalkeeper frame.
 */
function roarFrame(state: GameState, p: Player, s: AIState['perPlayer'][number]): InputFrame | undefined {
  if (p.specialMode !== 'roar') return undefined;
  if (p.action !== 'normal') return undefined;
  if (roarShotIncoming(state, p)) {
    const normal = gkFreeFrame(state, p, s);
    s.intent = 'roarShot';
    return { ...normal, l: !p.prevInput.l };
  }
  if (!roarWanted(state, p)) return undefined;
  s.intent = 'roar';
  return frame(NO_MOVE, { l: !p.prevInput.l });
}

/**
 * Zhang Fei as goalkeeper can roar at an incoming shot: off cooldown, enough stamina, not silenced and L not held. The
 * loose ball must have been last touched by an opponent, move toward his goal, cross that goal line inside the mouth
 * along its straight xy path, and already be inside the roar circle. A roar fires on the tick it is pressed, before the
 * ball moves, so a ball still outside the circle would not be knocked.
 */
function roarShotIncoming(state: GameState, p: Player): boolean {
  if (p.role !== 'GK' || p.specialCooldown > 0 || p.stamina < SPECIAL_STAMINA_COST) return false;
  if (p.silenceTicks > 0 || p.prevInput.l) return false;
  const ball = state.ball;
  if (ball.ownerIdx !== -1 || ball.lastTouchIdx === -1 || state.players[ball.lastTouchIdx].team === p.team) return false;
  const goalX = ownGoalX(state, p.team);
  const towardGoal = goalX === 0 ? ball.vx < 0 : ball.vx > 0;
  if (!towardGoal || !crossesGoalMouth(ball, goalX)) return false;
  const cx = p.x + p.facingX * ROAR_FORWARD;
  const cy = p.y + p.facingY * ROAR_FORWARD;
  return dist(ball.x, ball.y, cx, cy) <= ROAR_RADIUS;
}

/** True if the ball's straight xy path crosses the goal line at goalX inside the goal mouth. Mirrors crossesOwnMouth in sim/step.ts. */
function crossesGoalMouth(ball: { x: number; y: number; vx: number; vy: number }, goalX: number): boolean {
  if (ball.vx === 0) return false;
  const mouth = goalMouth(goalX === 0 ? 0 : 1);
  const t = (mouth.x - ball.x) / ball.vx;
  if (t <= 0) return false;
  const y = ball.y + ball.vy * t;
  return y >= mouth.yMin && y <= mouth.yMax;
}

/**
 * Roar is worth using: off cooldown, enough stamina, and either two standing opponents in the roar circle or an
 * opponent carrier in the circle inside the roarer's own area.
 */
function roarWanted(state: GameState, p: Player): boolean {
  if (p.specialCooldown > 0 || p.stamina < SPECIAL_STAMINA_COST) return false;
  const cx = p.x + p.facingX * ROAR_FORWARD;
  const cy = p.y + p.facingY * ROAR_FORWARD;
  const ownGoal = ownGoalX(state, p.team);
  let inCircle = 0;
  let carrierInCircle = false;
  for (const t of state.players) {
    if (t.team === p.team || t.action === 'down' || t.rampageTicks > 0) continue;
    if (dist(t.x, t.y, cx, cy) > ROAR_RADIUS) continue;
    inCircle++;
    if (t.idx === state.ball.ownerIdx) carrierInCircle = true;
  }
  const ballNearOwnGoal = abs(state.ball.x - ownGoal) < GK_AREA_DEPTH + 60;
  return inCircle >= 2 || carrierInCircle || (inCircle >= 1 && ballNearOwnGoal);
}

function ownerFrame(state: GameState, ai: AIState, p: Player, s: AIState['perPlayer'][number]): InputFrame {
  const team = p.team;
  const dir = attackDir(state, team);
  const goalX = opponentGoalX(state, team);

  if (hasCaller(state, p)) return passFrame(p, undefined);

  // Zhuge Liang's beam: channelled on the same per-tick chance as the other specials.
  if (
    p.specialMode === 'beam' &&
    !p.prevInput.l &&
    p.specialCooldown === 0 &&
    p.stamina >= SHOT_MIN_STAMINA &&
    nextRandom(ai) < SHOT_FULL_CHANCE
  ) {
    s.intent = 'beam';
    return frame(NO_MOVE, { l: true });
  }

  // Ma Chao's summon: called on the same per-tick chance when opponents are close enough to be charged.
  if (
    p.specialMode === 'summon' &&
    !p.prevInput.l &&
    p.specialCooldown === 0 &&
    p.stamina >= SHOT_MIN_STAMINA &&
    opponentsWithin(state, p, SUMMON_AI_RANGE) >= SUMMON_AI_MIN_OPPONENTS &&
    nextRandom(ai) < SHOT_FULL_CHANCE
  ) {
    s.intent = 'summon';
    return frame(NO_MOVE, { l: true });
  }

  // Cao Cao's slash: the blade buff needs no ball, so cast it when an opponent is close.
  if (
    p.specialMode === 'slash' &&
    !p.prevInput.l &&
    p.specialCooldown === 0 &&
    p.stamina >= SHOT_MIN_STAMINA &&
    slashWanted(state, p) &&
    nextRandom(ai) < SHOT_FULL_CHANCE
  ) {
    s.intent = 'slash';
    return frame(NO_MOVE, { l: true });
  }

  // Zhang Liao's fear: freezes the opponents around him and makes this carrier drop the ball, so cast it when they are close.
  if (
    p.specialMode === 'fear' &&
    !p.prevInput.l &&
    p.specialCooldown === 0 &&
    p.stamina >= SHOT_MIN_STAMINA &&
    opponentsWithin(state, p, FEAR_RADIUS) >= FEAR_MIN_OPPONENTS &&
    nextRandom(ai) < SHOT_FULL_CHANCE
  ) {
    s.intent = 'fear';
    return frame(NO_MOVE, { l: true });
  }

  // Sima Yi's leap while carrying: the ball travels with him, so cast it when it takes him toward goal out of trouble.
  if (
    p.specialMode === 'leap' &&
    !p.prevInput.l &&
    p.specialCooldown === 0 &&
    p.stamina >= SHOT_MIN_STAMINA &&
    leapOwnerWanted(state, p) &&
    nextRandom(ai) < SHOT_FULL_CHANCE
  ) {
    s.intent = 'leap';
    const land = leapLanding(p);
    return frame(steerTo(p, land.x, land.y), { l: true });
  }

  // Guan Yu's ride while carrying: the ball stays at his feet, so cast it to escape a close opponent or drive it in.
  if (
    p.specialMode === 'ride' &&
    !p.prevInput.l &&
    p.specialCooldown === 0 &&
    p.stamina >= SHOT_MIN_STAMINA &&
    rideOwnerWanted(state, p) &&
    nextRandom(ai) < SHOT_FULL_CHANCE
  ) {
    s.intent = 'ride';
    return frame(NO_MOVE, { l: true });
  }

  // Zhen Ji's icefield: slows the opponents around her and keeps them in the field, so cast it when they are close.
  if (
    p.specialMode === 'icefield' &&
    !p.prevInput.l &&
    p.specialCooldown === 0 &&
    p.stamina >= SHOT_MIN_STAMINA &&
    (opponentsWithin(state, p, ICE_OWNER_NEAR_RANGE) >= 1 ||
      opponentsWithin(state, p, ICE_OWNER_RANGE) >= ICE_OWNER_MIN_OPPONENTS) &&
    nextRandom(ai) < SHOT_FULL_CHANCE
  ) {
    s.intent = 'icefield';
    return frame(NO_MOVE, { l: true });
  }

  // Sun Ce's sail while carrying: the boat takes the ball along, so cast it to break through or run at goal down an open lane.
  if (
    p.specialMode === 'sail' &&
    !p.prevInput.l &&
    p.specialCooldown === 0 &&
    p.stamina >= SHOT_MIN_STAMINA &&
    sailOwnerWanted(state, p) &&
    nextRandom(ai) < SHOT_FULL_CHANCE
  ) {
    s.intent = 'sail';
    return frame(NO_MOVE, { l: true });
  }

  // Xiao Qiao's gust while carrying: the gust point stays put, so cast it on the opponent in front when a pair stands there.
  if (
    p.specialMode === 'gust' &&
    !p.prevInput.l &&
    p.specialCooldown === 0 &&
    p.stamina >= SHOT_MIN_STAMINA &&
    gustWanted(state, p) &&
    nextRandom(ai) < SHOT_FULL_CHANCE
  ) {
    s.intent = 'gust';
    return frame(NO_MOVE, { l: true });
  }

  // Da Qiao's portal while carrying: the field stays where she cast it, so cast it when an enemy carrier or a pair of opponents is inside.
  if (
    p.specialMode === 'portal' &&
    !p.prevInput.l &&
    p.specialCooldown === 0 &&
    p.stamina >= SHOT_MIN_STAMINA &&
    portalWanted(state, p) &&
    nextRandom(ai) < SHOT_FULL_CHANCE
  ) {
    s.intent = 'portal';
    return frame(NO_MOVE, { l: true });
  }

  // Zhou Yu's east wind while carrying: the blast is instant, so cast it when a pair of opponents is pressing him.
  if (
    p.specialMode === 'eastwind' &&
    !p.prevInput.l &&
    p.specialCooldown === 0 &&
    p.stamina >= SHOT_MIN_STAMINA &&
    eastwindWanted(state, p) &&
    nextRandom(ai) < SHOT_FULL_CHANCE
  ) {
    s.intent = 'eastwind';
    return frame(NO_MOVE, { l: true });
  }

  const goalDist = abs(goalX - p.x);
  const shotRange = p.role === 'DF' ? SHOT_RANGE_DF : SHOT_RANGE_FWD;
  const inShotRange = goalDist < shotRange;
  const inChargeRange = goalDist < CHARGE_SHOT_RANGE;
  if (inChargeRange && p.facingX * dir > 0) {
    const special =
      (p.specialMode === 'rampage' || p.specialMode === 'lunge') &&
      !p.prevInput.l &&
      p.stamina >= SHOT_MIN_STAMINA &&
      p.specialCooldown === 0 &&
      goalDist < SPECIAL_RANGE &&
      nextRandom(ai) < SHOT_FULL_CHANCE;
    if (special) {
      s.intent = 'special';
      return frame(steerTo(p, goalX, CENTER_Y), { l: true });
    }
    if (inShotRange && !p.prevInput.j) {
      s.intent = 'tap';
      return frame(steerTo(p, goalX, CENTER_Y), { j: true });
    }
  }

  if (opponentAhead(state, p, PRESSURE_RANGE, INF) && nextRandom(ai) < PRESSURE_PASS_CHANCE) {
    s.intent = 'pass';
    return passFrame(p, pickReceiver(state, p, -INF));
  }

  const forward = pickReceiver(state, p, FORWARD_PASS_MIN_AHEAD);
  if (forward !== undefined && nextRandom(ai) < FORWARD_PASS_CHANCE) {
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

/**
 * Special cast without the ball (only for specialNoBall players), on the per-tick chance once the situation for its
 * kind holds. Returns undefined when no special is cast this tick.
 */
function offBallSpecialFrame(
  state: GameState,
  ai: AIState,
  p: Player,
  s: AIState['perPlayer'][number],
): InputFrame | undefined {
  if (!p.specialNoBall || p.prevInput.l || p.specialCooldown > 0 || p.stamina < SHOT_MIN_STAMINA) return undefined;
  // Xu Chu's tiger guard: the goalkeeper's normal frame (freeFrame) with L added on top, so his movement is unchanged.
  if (p.specialMode === 'tiger') {
    if (!tigerThreat(state, p) || nextRandom(ai) >= TIGER_AI_CHANCE) return undefined;
    const normal = freeFrame(state, ai, p, s);
    s.intent = 'tiger';
    return { ...normal, l: true };
  }
  // Sun Quan's arrowship: the same shape as the tiger guard, on the goalkeeper's normal frame with L added on top.
  if (p.specialMode === 'arrowship') {
    if (!arrowshipWanted(state, p) || nextRandom(ai) >= ARROWSHIP_AI_CHANCE) return undefined;
    const normal = freeFrame(state, ai, p, s);
    s.intent = 'arrowship';
    return { ...normal, l: true };
  }
  const carrier = state.ball.ownerIdx === -1 ? undefined : state.players[state.ball.ownerIdx];
  const enemyCarrier = carrier !== undefined && carrier.team !== p.team ? carrier : undefined;
  let wanted = false;
  let steer: Move = NO_MOVE;
  switch (p.specialMode) {
    case 'ride': {
      const inLane = rideLaneOpponents(state, p);
      const laneCarrier = inLane.find((t) => t.idx === state.ball.ownerIdx) ?? undefined;
      wanted = laneCarrier !== undefined || len(inLane) >= RIDE_LANE_MIN_OPPONENTS;
      // Facing already points down the lane, so only a carrier needs steering to keep him in the bike's path.
      steer = laneCarrier !== undefined ? steerTo(p, laneCarrier.x, laneCarrier.y) : NO_MOVE;
      break;
    }
    case 'fear':
      wanted =
        (enemyCarrier !== undefined && dist(p.x, p.y, enemyCarrier.x, enemyCarrier.y) <= FEAR_RADIUS) ||
        opponentsWithin(state, p, FEAR_RADIUS) >= FEAR_MIN_OPPONENTS;
      break;
    case 'beam':
      wanted = enemyCarrier !== undefined && abs(enemyCarrier.x - ownGoalX(state, p.team)) < FIELD_W / 2;
      break;
    case 'lunge':
      if (enemyCarrier !== undefined) {
        const dx = enemyCarrier.x - p.x;
        const dy = enemyCarrier.y - p.y;
        const d = dist(p.x, p.y, enemyCarrier.x, enemyCarrier.y);
        wanted =
          d >= LUNGE_BALL_MIN &&
          d <= LUNGE_BALL_MAX &&
          abs(dy) < LUNGE_BALL_LATERAL &&
          unitSign(p.facingX) === unitSign(dx);
        steer = steerTo(p, enemyCarrier.x, enemyCarrier.y);
      }
      break;
    case 'leap':
      if (enemyCarrier !== undefined) {
        const land = leapLanding(p);
        const ahead = (enemyCarrier.x - p.x) * p.facingX + (enemyCarrier.y - p.y) * p.facingY;
        wanted =
          ahead >= LEAP_BALL_MIN_AHEAD &&
          ahead <= LEAP_BALL_MAX_AHEAD &&
          (dist(enemyCarrier.x, enemyCarrier.y, land.x, land.y) < LEAP_RADIUS ||
            opponentsNear(state, p.team, land.x, land.y, LEAP_RADIUS) >= LEAP_TARGET_MIN_OPPONENTS);
        steer = steerTo(p, land.x, land.y);
      }
      break;
    case 'summon':
      wanted = opponentsWithin(state, p, SUMMON_AI_RANGE) >= SUMMON_AI_MIN_OPPONENTS;
      break;
    case 'slash':
      wanted = slashWanted(state, p);
      break;
    case 'icefield':
      wanted =
        (enemyCarrier !== undefined && dist(p.x, p.y, enemyCarrier.x, enemyCarrier.y) <= ICE_CARRIER_RANGE) ||
        opponentsWithin(state, p, ICE_OFF_BALL_RANGE) >= ICE_OFF_BALL_MIN_OPPONENTS;
      break;
    case 'sail':
      if (enemyCarrier !== undefined) {
        wanted = dist(p.x, p.y, enemyCarrier.x, enemyCarrier.y) <= SAIL_CARRIER_RANGE;
        steer = steerTo(p, enemyCarrier.x, enemyCarrier.y);
      }
      break;
    case 'gust':
      wanted = gustWanted(state, p);
      break;
    case 'portal':
      wanted = portalWanted(state, p);
      break;
    case 'eastwind':
      wanted = eastwindWanted(state, p);
      break;
    default:
      return undefined;
  }
  if (!wanted || nextRandom(ai) >= SHOT_FULL_CHANCE) return undefined;
  s.intent = 'offBall';
  return frame(steer, { l: true });
}

/**
 * Xu Chu's tiger guard is worth casting: no guard running yet, and either an opponent carries the ball within
 * TIGER_CARRIER_RANGE of his goal line, or a moving loose ball last touched by an opponent heads at his goal from
 * within TIGER_SHOT_RANGE.
 */
function tigerThreat(state: GameState, p: Player): boolean {
  if (p.tigerTicks > 0) return false;
  const goalX = ownGoalX(state, p.team);
  const ball = state.ball;
  if (ball.ownerIdx !== -1) {
    const carrier = state.players[ball.ownerIdx];
    return carrier.team !== p.team && abs(carrier.x - goalX) < TIGER_CARRIER_RANGE;
  }
  if (ball.lastTouchIdx === -1 || state.players[ball.lastTouchIdx].team === p.team) return false;
  const towardGoal = goalX === 0 ? ball.vx < 0 : ball.vx > 0;
  return towardGoal && abs(ball.x - goalX) < TIGER_SHOT_RANGE;
}

/**
 * Sun Quan's arrowship is worth casting: no ship up yet, and either a loose ball last touched by an opponent heads at his
 * goal at ARROWSHIP_SHOT_MIN_VX or faster from within ARROWSHIP_SHOT_RANGE of the goal line, or an opponent carrier
 * stands within ARROWSHIP_CARRIER_RANGE of his own goal centre.
 */
function arrowshipWanted(state: GameState, p: Player): boolean {
  if (p.arrowshipUp) return false;
  const goalX = ownGoalX(state, p.team);
  const ball = state.ball;
  if (ball.ownerIdx !== -1) {
    const carrier = state.players[ball.ownerIdx];
    return carrier.team !== p.team && dist(carrier.x, carrier.y, goalX, CENTER_Y) <= ARROWSHIP_CARRIER_RANGE;
  }
  if (ball.lastTouchIdx === -1 || state.players[ball.lastTouchIdx].team === p.team) return false;
  const towardGoal = goalX === 0 ? ball.vx < 0 : ball.vx > 0;
  return towardGoal && abs(ball.vx) >= ARROWSHIP_SHOT_MIN_VX && abs(ball.x - goalX) <= ARROWSHIP_SHOT_RANGE;
}

/** Where a leap from p lands if cast now: LEAP_LAND along his facing (the sim normalises facing on the cast). */
function leapLanding(p: Player): { x: number; y: number } {
  return { x: p.x + p.facingX * LEAP_LAND, y: p.y + p.facingY * LEAP_LAND };
}

/**
 * Owner leap: he faces the opponent goal, the landing spot is on the field, and either an opponent is within
 * LEAP_OWNER_ESCAPE_RANGE of him (escape and advance) or LEAP_TARGET_MIN_OPPONENTS sit within LEAP_RADIUS of the landing.
 */
function leapOwnerWanted(state: GameState, p: Player): boolean {
  if (p.facingX * attackDir(state, p.team) <= 0) return false;
  const land = leapLanding(p);
  if (land.x < 0 || land.x > FIELD_W || land.y < 0 || land.y > FIELD_D) return false;
  return (
    opponentsWithin(state, p, LEAP_OWNER_ESCAPE_RANGE) >= 1 ||
    opponentsNear(state, p.team, land.x, land.y, LEAP_RADIUS) >= LEAP_TARGET_MIN_OPPONENTS
  );
}

/**
 * Owner ride: he faces the opponent goal, and either an opponent is within RIDE_OWNER_ESCAPE_RANGE of him (escape) or
 * the goal line is within RIDE_DISTANCE with his y inside the goal mouth (drive it in).
 */
function rideOwnerWanted(state: GameState, p: Player): boolean {
  if (p.facingX * attackDir(state, p.team) <= 0) return false;
  if (opponentsWithin(state, p, RIDE_OWNER_ESCAPE_RANGE) >= 1) return true;
  const goalX = opponentGoalX(state, p.team);
  return abs(goalX - p.x) < RIDE_DISTANCE && abs(p.y - CENTER_Y) < GOAL_HALF_W;
}

/**
 * Standing opponents whose centre lies in Guan Yu's ride lane: from RIDE_LANE_MIN_AHEAD to RIDE_DISTANCE ahead along his
 * facing, and within RIDE_LANE_HALF of the line.
 */
function rideLaneOpponents(state: GameState, p: Player): Player[] {
  return state.players.filter((t) => {
    if (t.team === p.team || t.action === 'down') return false;
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const along = dx * p.facingX + dy * p.facingY;
    if (along < RIDE_LANE_MIN_AHEAD || along > RIDE_DISTANCE) return false;
    return abs(dx * p.facingY - dy * p.facingX) <= RIDE_LANE_HALF;
  });
}

/**
 * Sun Ce's sail, owner: an opponent stands within SAIL_ESCAPE_RANGE (break through), or he faces the opponent goal, the
 * goal is within SAIL_OPEN_MAX_GOAL_DIST, and no standing opponent is SAIL_OPEN_RANGE ahead of him.
 */
function sailOwnerWanted(state: GameState, p: Player): boolean {
  if (opponentsWithin(state, p, SAIL_ESCAPE_RANGE) >= 1) return true;
  const goalX = opponentGoalX(state, p.team);
  return (
    p.facingX * attackDir(state, p.team) > 0 &&
    abs(goalX - p.x) < SAIL_OPEN_MAX_GOAL_DIST &&
    !opponentAhead(state, p, SAIL_OPEN_RANGE, INF)
  );
}

/**
 * Sun Ce while the sail runs: no punch, tackle or pass. With the ball he drives at the opponent goal and taps J (a shot)
 * once in shot range facing it. Without it he steers the boat at the enemy carrier, else the loose ball, else the goal.
 */
function sailFrame(state: GameState, p: Player, s: AIState['perPlayer'][number]): InputFrame {
  const goalX = opponentGoalX(state, p.team);
  if (state.ball.ownerIdx === p.idx) {
    const goalDist = abs(goalX - p.x);
    const shotRange = p.role === 'DF' ? SHOT_RANGE_DF : SHOT_RANGE_FWD;
    const steer = steerTo(p, goalX, CENTER_Y);
    if (goalDist < shotRange && p.facingX * attackDir(state, p.team) > 0 && !p.prevInput.j) {
      s.intent = 'sailShot';
      return frame(steer, { j: true });
    }
    s.intent = 'sailDrive';
    return frame(steer);
  }
  const ball = state.ball;
  const carrier = ball.ownerIdx === -1 ? undefined : state.players[ball.ownerIdx];
  const enemyCarrier = carrier !== undefined && carrier.team !== p.team ? carrier : undefined;
  s.intent = 'sailSteer';
  if (enemyCarrier !== undefined) return frame(steerTo(p, enemyCarrier.x, enemyCarrier.y));
  if (ball.ownerIdx === -1) return frame(steerTo(p, ball.x, ball.y));
  return frame(steerTo(p, goalX, CENTER_Y));
}

/**
 * The gust target as the sim picks it: the nearest standing opponent on p's facing side within GUST_TARGET_RANGE (ties go
 * to the lowest idx), or undefined when none is in reach.
 */
function gustTarget(state: GameState, p: Player): Player | undefined {
  const side = p.facingX !== 0 ? unitSign(p.facingX) : attackDir(state, p.team);
  let best: Player | undefined = undefined;
  let bestDist = INF;
  for (const t of state.players) {
    if (t.team === p.team || t.action === 'down' || t.action === 'recover') continue;
    if ((t.x - p.x) * side <= 0) continue;
    const d = dist(t.x, t.y, p.x, p.y);
    if (d <= GUST_TARGET_RANGE && d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Xiao Qiao's gust is worth casting at its target: the target is the enemy carrier, or another standing opponent stands
 * within GUST_RADIUS of him (at least two victims). Off the ball and as the owner alike.
 */
function gustWanted(state: GameState, p: Player): boolean {
  const target = gustTarget(state, p);
  if (target === undefined) return false;
  if (target.idx === state.ball.ownerIdx) return true;
  for (const t of state.players) {
    if (t === target || t.team === p.team || t.action === 'down' || t.action === 'recover') continue;
    if (dist(t.x, t.y, target.x, target.y) <= GUST_RADIUS) return true;
  }
  return false;
}

/**
 * Da Qiao's portal is worth casting at her position: an enemy carrier stands within PORTAL_RADIUS of her, or at least
 * PORTAL_MIN_OPPONENTS standing opponents do. Off the ball and as the owner alike.
 */
function portalWanted(state: GameState, p: Player): boolean {
  const carrier = state.ball.ownerIdx === -1 ? undefined : state.players[state.ball.ownerIdx];
  if (carrier !== undefined && carrier.team !== p.team && dist(p.x, p.y, carrier.x, carrier.y) <= PORTAL_RADIUS) return true;
  return opponentsWithin(state, p, PORTAL_RADIUS) >= PORTAL_MIN_OPPONENTS;
}

/**
 * Zhou Yu's east wind is worth casting at his position: an enemy carrier stands within EASTWIND_RADIUS of him, or at
 * least EASTWIND_MIN_OPPONENTS standing opponents do. Off the ball and as the carrier alike.
 */
function eastwindWanted(state: GameState, p: Player): boolean {
  const carrier = state.ball.ownerIdx === -1 ? undefined : state.players[state.ball.ownerIdx];
  if (carrier !== undefined && carrier.team !== p.team && dist(p.x, p.y, carrier.x, carrier.y) <= EASTWIND_RADIUS) return true;
  return opponentsWithin(state, p, EASTWIND_RADIUS) >= EASTWIND_MIN_OPPONENTS;
}

/**
 * Cao Cao's slash is worth casting: no blade buff running, and either an opponent stands within SLASH_CAST_RANGE or an
 * opponent carrier is within SLASH_CARRIER_RANGE.
 */
function slashWanted(state: GameState, p: Player): boolean {
  if (p.slashTicks > 0) return false;
  if (opponentsWithin(state, p, SLASH_CAST_RANGE) >= 1) return true;
  const carrier = state.ball.ownerIdx === -1 ? undefined : state.players[state.ball.ownerIdx];
  return (
    carrier !== undefined &&
    carrier.team !== p.team &&
    carrier.action !== 'down' &&
    dist(p.x, p.y, carrier.x, carrier.y) < SLASH_CARRIER_RANGE
  );
}

/**
 * Cao Cao's slash buff, off the ball: target the enemy carrier if within SLASH_CHASE_CARRIER_RANGE, else the nearest
 * standing opponent. Closes in, then holds once about SLASH_STANDOFF px away and facing him, so the waves reach him.
 * A carrier inside a punch or tackle trigger is attacked by chaseFrame. Null when no opponent stands.
 */
function slashChaseFrame(
  state: GameState,
  ai: AIState,
  p: Player,
  s: AIState['perPlayer'][number],
): InputFrame | undefined {
  const carrier = state.ball.ownerIdx === -1 ? undefined : state.players[state.ball.ownerIdx];
  const enemyCarrier =
    carrier !== undefined &&
    carrier.team !== p.team &&
    carrier.action !== 'down' &&
    dist(p.x, p.y, carrier.x, carrier.y) <= SLASH_CHASE_CARRIER_RANGE
      ? carrier
      : undefined;
  const target = enemyCarrier ?? nearestOpponent(state, p.team, p.x, p.y, INF);
  if (target === undefined) return undefined;
  if (target === enemyCarrier) {
    const chase = chaseFrame(state, ai, p, s, target);
    if (chase.j) return chase;
  }
  s.intent = 'slashChase';
  const d = dist(p.x, p.y, target.x, target.y);
  if (d <= SLASH_STANDOFF && facingDot(p, target.x, target.y) > 0.5) return frame(NO_MOVE);
  const dashOk = p.stamina > DASH_STAMINA_FRAC * p.maxStamina;
  return frame(steerTo(p, target.x, target.y), { dash: dashOk && d > 160 });
}

/** Rampaging owner: dribble straight at the goal centre, and fire the special once close enough or when the rampage is nearly over. */
function rampageFrame(state: GameState, p: Player, s: AIState['perPlayer'][number]): InputFrame {
  s.intent = 'rampage';
  const goalX = opponentGoalX(state, p.team);
  const goalDist = abs(goalX - p.x);
  const fireRange = p.specialKind === 'lob' ? RAMPAGE_FIRE_RANGE_LOB : RAMPAGE_FIRE_RANGE;
  const fire = goalDist < fireRange || p.rampageTicks < RAMPAGE_FIRE_LEFT;
  return frame(steerTo(p, goalX, CENTER_Y), { j: fire });
}

function gkOwnerFrame(state: GameState, ai: AIState, p: Player, s: AIState['perPlayer'][number]): InputFrame {
  if (s.intent !== 'gkHold') {
    s.intent = 'gkHold';
    s.holdTicks = GK_HOLD_MIN + floor(nextRandom(ai) * GK_HOLD_SPAN);
  }
  // Facing up-field both while holding and on the pass press, so the owned ball never sits behind the goal line.
  const upField = steerTo(p, p.x + attackDir(state, p.team) * GK_FORWARD_STEP, CENTER_Y);
  if (s.holdTicks > 0) return frame(upField);
  return frame(upField, { k: !p.prevInput.k });
}

/** Ball is loose or the other team has it. */
function freeFrame(state: GameState, ai: AIState, p: Player, s: AIState['perPlayer'][number]): InputFrame {
  const ball = state.ball;

  const victim = nearestOpponent(state, p.team, p.x, p.y, OPPORTUNIST_RANGE);
  if (
    victim !== undefined &&
    victim.idx !== ball.ownerIdx &&
    victim.rampageTicks === 0 &&
    s.cooldown === 0 &&
    !p.prevInput.j &&
    nextRandom(ai) < OPPORTUNIST_CHANCE
  ) {
    s.cooldown = ATTACK_COOLDOWN;
    s.intent = 'attack';
    return frame(steerTo(p, victim.x, victim.y), { j: true });
  }

  if (p.role === 'GK') return gkFreeFrame(state, p, s);

  const owner = ball.ownerIdx === -1 ? undefined : state.players[ball.ownerIdx];
  if (owner !== undefined && owner.team === p.team) return supportFrame(state, p, s);
  const chasers = owner === undefined ? 2 : 1;
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
    const speed = sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (towardGoal && speed > DIVE_MIN_SPEED && abs(ball.x - goalX) < DIVE_MAX_DIST_X) {
      const t = (goalX - ball.x) / ball.vx;
      const projY = ball.y + ball.vy * t;
      if (abs(projY - p.y) > DIVE_MIN_DY && p.z === 0 && p.vz === 0 && !p.prevInput.j) {
        s.intent = 'dive';
        return frame(steerTo(p, p.x, projY), { j: true });
      }
    }
    if (abs(ball.x - goalX) < GK_AREA_DEPTH && isClosestToBall(state, p)) {
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

/** Chaser for a loose ball (owner undefined) or for an opponent carrier (punch / slide tackle when close). */
function chaseFrame(
  state: GameState,
  ai: AIState,
  p: Player,
  s: AIState['perPlayer'][number],
  owner: Player | undefined,
): InputFrame {
  s.intent = 'chase';
  const dashOk = p.stamina > DASH_STAMINA_FRAC * p.maxStamina;
  if (owner === undefined) {
    const ball = state.ball;
    const d = dist(p.x, p.y, ball.x, ball.y);
    return frame(steerTo(p, ball.x, ball.y), { dash: dashOk && d > 40 });
  }

  const move = steerTo(p, owner.x, owner.y);
  const d = dist(p.x, p.y, owner.x, owner.y);
  // A rampaging carrier is not attacked: the chaser keeps closing in but does not punch or tackle.
  if (s.cooldown === 0 && !p.prevInput.j && owner.rampageTicks === 0) {
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
function passFrame(p: Player, receiver: Player | undefined): InputFrame {
  const move = receiver === undefined ? NO_MOVE : steerTo(p, receiver.x, receiver.y);
  return frame(move, { k: !p.prevInput.k });
}

function frame(move: Move, extra: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, moveX: move.moveX, moveY: move.moveY, ...extra };
}

/** 8-way direction toward (tx, ty). An axis is held when it carries most of the distance. */
function steerTo(p: { x: number; y: number }, tx: number, ty: number): Move {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = sqrt(dx * dx + dy * dy);
  if (d < STOP_DIST) return NO_MOVE;
  return {
    moveX: abs(dx) > 0.38 * d ? unitSign(dx) : 0,
    moveY: abs(dy) > 0.38 * d ? unitSign(dy) : 0,
  };
}

function unitSign(v: number): -1 | 0 | 1 {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return min(hi, max(lo, v));
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return sqrt(dx * dx + dy * dy);
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

/** Nearest standing opponent of `team` within range, or undefined. Ties go to the lowest idx. */
function nearestOpponent(state: GameState, team: 0 | 1, x: number, y: number, range: number): Player | undefined {
  let best: Player | undefined = undefined;
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

/** Number of standing opponents of `p` within range. */
function opponentsWithin(state: GameState, p: Player, range: number): number {
  let count = 0;
  for (const t of state.players) {
    if (t.team === p.team || t.action === 'down') continue;
    if (dist(t.x, t.y, p.x, p.y) < range) count++;
  }
  return count;
}

/** Number of standing opponents of `team` within range of the point (x, y). */
function opponentsNear(state: GameState, team: 0 | 1, x: number, y: number, range: number): number {
  let count = 0;
  for (const t of state.players) {
    if (t.team === team || t.action === 'down') continue;
    if (dist(t.x, t.y, x, y) < range) count++;
  }
  return count;
}

/** True if a standing opponent is within range and in the half-plane ahead of the player's facing (within lateral). */
function opponentAhead(state: GameState, p: Player, range: number, lateral: number): boolean {
  return state.players.some((t) => {
    if (t.team === p.team || t.action === 'down') return false;
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    if (sqrt(dx * dx + dy * dy) >= range) return false;
    const along = dx * p.facingX + dy * p.facingY;
    if (along <= 0) return false;
    return abs(dx * p.facingY - dy * p.facingX) < lateral;
  });
}

/**
 * Free teammate (no opponent within RECEIVER_FREE_RANGE) that is at least minAhead further toward the
 * opponent goal than the player. Picks the one furthest forward. Null if none.
 */
function pickReceiver(state: GameState, p: Player, minAhead: number): Player | undefined {
  const dir = attackDir(state, p.team);
  let best: Player | undefined = undefined;
  let bestAhead = -INF;
  for (const t of state.players) {
    if (t.team !== p.team || t.idx === p.idx || t.action === 'down') continue;
    const ahead = (t.x - p.x) * dir;
    if (ahead < minAhead || ahead <= bestAhead) continue;
    if (nearestOpponent(state, p.team, t.x, t.y, RECEIVER_FREE_RANGE) !== undefined) continue;
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
