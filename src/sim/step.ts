import { INF, abs, sqrt, cos, min, max, len } from './num';
import * as LC from './lordclass';
import {
  BALL_AIR_DRAG,
  BALL_BOUNCE,
  BALL_GROUND_FRICTION,
  BALL_RADIUS,
  BALL_STOP_SPEED,
  DRIBBLE_OFFSET,
  DT,
  GK_DIVE_EXTRA_REACH,
  GK_EXTRA_REACH,
  GK_FAST_SHOT_SPEED,
  GK_PICKUP_MAX_Z,
  GOAL_DEPTH,
  GRAVITY,
  PICKUP_MAX_Z,
  PICKUP_REACH,
  SPECIAL_FLAT_Z,
  SPECIAL_LOB_FALL_GRAVITY_MULT,
  SPECIAL_MAX_TICKS,
  SPECIAL_ZIGZAG_AMP,
  SPECIAL_ZIGZAG_FREQ,
  TIGER_HOLD_TICKS,
  TIGER_MOUTH_FORWARD,
  TIGER_MOUTH_Z,
  TIGER_SPIT_DISTANCE,
  TIGER_SPIT_VZ,
  TIGER_SWALLOW_RANGE,
  WALL_BOUNCE,
} from './constants';
import {
  applyRampageBumps,
  blockArrowshipBall,
  clampArrowshipBarrier,
  endArrowships,
  applySpecialHit,
  carryPassengers,
  clampPlayerToField,
  clearRiders,
  endEastwinds,
  endGusts,
  endIcefields,
  endLordProjectiles,
  endPortals,
  endSails,
  endSlashWindows,
  endTigerWindows,
  isInvincible,
  tigerBallHit,
  updateAction,
  updateArrowships,
  updateBladeWaves,
  updateDragonspears,
  updateEastwinds,
  updateGusts,
  updateIcefields,
  updatePortals,
  updateRiders,
  updateSails,
  updateWindpuffs,
} from './actions';
import { attackDir, inOwnArea, goalMouth, isInGoalMouth } from './field';
import { updateMatch } from './match';
import { updatePk } from './pk';
import { rngNext } from './rng';
import {
  EMPTY_INPUT,
  type Ball,
  type GameState,
  type InputFrame,
  type Player,
  type SpecialShot,
  type TigerBall,
} from './types';

/** Impact speed above which a ground bounce is reported as an event. */
const BOUNCE_EVENT_MIN_SPEED = 40;
/** Extra xy reach beyond body radius + ball radius for a special ball to hit a player. */
const SPECIAL_CONTACT_PAD = 2;
/** Maximum height difference for a special ball to hit a player. */
const SPECIAL_CONTACT_Z = 30;
/** A parried fast shot cannot be picked up by the parrying keeper for this many ticks. */
const GK_PARRY_NO_TOUCH = 20;
const GK_PARRY_DAMP = 0.4;
const GK_PARRY_VZ = 120;
const GK_PARRY_SPREAD = 60;

/** Advances the simulation by one tick. Mutates and returns the same state. */
export function step(state: GameState, inputs: InputFrame[]): GameState {
  state.events = [];

  // Outside live play (kickoff, goal, halftime, full time) every player gets an empty frame.
  // The PK reads inputs for its kick stages; players do not move normally during it.
  const live = state.match.phase === 'play';
  const pk = state.match.phase === 'pk';
  const frames = state.players.map((_, i) => (live || pk ? (inputs[i] ?? EMPTY_INPUT) : EMPTY_INPUT));

  if (pk) {
    updatePk(state, frames);
  } else {
    // Gusts erupt before the actions, so a victim's own tick already sees the launch.
    updateGusts(state);
    const ballPrevX = state.ball.x;
    for (let i = 0; i < len(state.players); i++) {
      updateAction(state, state.players[i], frames[i]);
    }

    updateRiders(state);
    updateBladeWaves(state);
    updateIcefields(state);
    updatePortals(state);
    updateEastwinds(state);
    updateArrowships(state);
    updateSails(state);
    updateWindpuffs(state);
    updateDragonspears(state);
    applyRampageBumps(state);
    resolvePlayerCollisions(state, state.players);
    clampArrowshipBarrier(state);
    carryPassengers(state);
    updatePossession(state);
    updateBall(state);
    blockArrowshipBall(state, ballPrevX);
    updatePickup(state);
    updateMatch(state);
    // Riders, tiger guards, slash buffs, blade waves, ice fields, sails and arrowships only live while the phase is play: a goal, half time, kickoff or PK start clears them.
    if (state.match.phase !== 'play') {
      clearRiders(state);
      endTigerWindows(state);
      endSlashWindows(state);
      endIcefields(state);
      endGusts(state);
      endPortals(state);
      endEastwinds(state);
      endArrowships(state);
      endSails(state);
      endLordProjectiles(state);
    }
  }

  for (let i = 0; i < len(state.players); i++) {
    state.players[i].prevInput = { ...frames[i] };
  }

  state.tick++;
  return state;
}

/**
 * Pushes overlapping players apart in xy; the push is split by inverse mass (lighter moves more). Downed players are skipped.
 * An invincible player (rampaging or lunging) has infinite mass: it is not pushed, and an opponent takes the whole push.
 */
function resolvePlayerCollisions(state: GameState, players: Player[]): void {
  for (let i = 0; i < len(players); i++) {
    for (let j = i + 1; j < len(players); j++) {
      const a = players[i];
      const b = players[j];
      if (a.action === 'down' || b.action === 'down') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = sqrt(dx * dx + dy * dy);
      const minDist = a.radius + b.radius;
      if (dist >= minDist) continue;

      // Exactly overlapping: use a deterministic axis (+x).
      const nx = dist === 0 ? 1 : dx / dist;
      const ny = dist === 0 ? 0 : dy / dist;
      const overlap = minDist - dist;
      const invA = isInvincible(a) ? 0 : 1 / a.mass;
      const invB = isInvincible(b) ? 0 : 1 / b.mass;
      const sumInv = invA + invB;
      // Two rampagers overlapping: neither is movable, so the push splits evenly.
      const pushA = sumInv === 0 ? overlap / 2 : (overlap * invA) / sumInv;
      const pushB = sumInv === 0 ? overlap / 2 : (overlap * invB) / sumInv;

      a.x -= nx * pushA;
      a.y -= ny * pushA;
      b.x += nx * pushB;
      b.y += ny * pushB;
      clampPlayerToField(state, a);
      clampPlayerToField(state, b);
    }
  }
}

/** An owned ball sits in front of its owner and moves with them. */
function updatePossession(state: GameState): void {
  const ball = state.ball;
  if (ball.ownerIdx === -1) return;

  const p = state.players[ball.ownerIdx];
  const offset = p.radius + DRIBBLE_OFFSET;
  // Kept inside the field: an owned ball behind the goal line would score for the opponent on release.
  ball.x = clamp(p.x + p.facingX * offset, BALL_RADIUS + 1, state.field.w - BALL_RADIUS - 1);
  ball.y = clamp(p.y + p.facingY * offset, 0, state.field.d);
  ball.z = 0;
  ball.vx = p.vx;
  ball.vy = p.vy;
  ball.vz = 0;
}

function updateBall(state: GameState): void {
  const b = state.ball;
  if (b.ownerIdx !== -1) return;

  if (b.tiger !== undefined && advanceTigerBall(state)) return;
  if (tryTigerSwallow(state)) return;

  if (b.special !== undefined) {
    // A special ball that ends this tick still gets the wall / goal-net handling below.
    if (!advanceSpecial(state)) bounceOffWalls(state, b);
    return;
  }

  b.vz -= GRAVITY * DT;
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  b.z += b.vz * DT;

  if (b.z < 0) {
    b.z = 0;
    const impact = -b.vz;
    if (impact > BOUNCE_EVENT_MIN_SPEED) {
      b.vz = impact * BALL_BOUNCE;
      state.events.push({ type: 'bounce', strength: impact });
    } else {
      b.vz = 0;
    }
  }

  const friction = b.z === 0 ? BALL_GROUND_FRICTION : BALL_AIR_DRAG;
  const mult = max(0, 1 - friction * DT);
  b.vx *= mult;
  b.vy *= mult;
  if (b.z === 0 && sqrt(b.vx * b.vx + b.vy * b.vy) < BALL_STOP_SPEED) {
    b.vx = 0;
    b.vy = 0;
  }

  bounceOffWalls(state, b);
}

/** Side walls and end walls (through the goal mouth into the net, otherwise bounce off). */
function bounceOffWalls(state: GameState, b: Ball): void {
  // Side walls.
  if (b.y < 0) {
    b.y = -b.y;
    b.vy = -b.vy * WALL_BOUNCE;
  } else if (b.y > state.field.d) {
    b.y = 2 * state.field.d - b.y;
    b.vy = -b.vy * WALL_BOUNCE;
  }

  // End walls: through the goal mouth into the net, otherwise bounce off.
  if (b.x < 0 || b.x > state.field.w) {
    const side: 0 | 1 = b.x < 0 ? 0 : 1;
    const netX = side === 0 ? -GOAL_DEPTH : state.field.w + GOAL_DEPTH;
    const inNet = side === 0 ? b.x <= netX : b.x >= netX;
    if (inNet || isInGoalMouth(state, b.y, b.z)) {
      const mouth = goalMouth(state, side);
      b.x = netX;
      b.vx = 0;
      if (b.y < mouth.yMin) {
        b.y = mouth.yMin;
        b.vy = -b.vy * WALL_BOUNCE;
      } else if (b.y > mouth.yMax) {
        b.y = mouth.yMax;
        b.vy = -b.vy * WALL_BOUNCE;
      }
    } else if (side === 0) {
      b.x = -b.x;
      b.vx = -b.vx * WALL_BOUNCE;
    } else {
      b.x = 2 * state.field.w - b.x;
      b.vx = -b.vx * WALL_BOUNCE;
    }
  }
}

/**
 * Moves a special ball one tick: flight by kind, then player contacts, then end conditions.
 * Returns false on the tick the special ends (the ball keeps its velocity; normal physics resumes).
 */
function advanceSpecial(state: GameState): boolean {
  const b = state.ball;
  const sp = b.special;
  if (sp === undefined) return false;
  sp.ticks++;

  const speed = sp.speed;
  if (sp.kind === 'zigzag') {
    const lateral = cos(sp.ticks * SPECIAL_ZIGZAG_FREQ) * SPECIAL_ZIGZAG_AMP;
    b.vx = sp.dirX * speed - sp.dirY * lateral;
    b.vy = sp.dirY * speed + sp.dirX * lateral;
    b.z = SPECIAL_FLAT_Z;
    b.vz = 0;
  } else if (sp.kind === 'lob') {
    b.vx = sp.dirX * speed;
    b.vy = sp.dirY * speed;
    b.vz -= (b.vz < 0 ? GRAVITY * SPECIAL_LOB_FALL_GRAVITY_MULT : GRAVITY) * DT;
  } else {
    b.vx = sp.dirX * speed;
    b.vy = sp.dirY * speed;
    b.z = SPECIAL_FLAT_Z;
    b.vz = 0;
  }
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  if (sp.kind === 'lob') b.z += b.vz * DT;

  if (resolveSpecialContacts(state, sp)) return false;

  const landed = sp.kind === 'lob' && b.z <= 0;
  const outOfPlay = b.x < 0 || b.x > state.field.w || b.y < 0 || b.y > state.field.d;
  if (sp.ticks > SPECIAL_MAX_TICKS || outOfPlay || landed) {
    if (landed) b.z = 0;
    b.special = undefined;
    state.events.push({ type: 'specialEnd' });
    return false;
  }
  return true;
}

/**
 * Opponents of the shooter that the special ball passes over are hit once each (idx order).
 * A defending goalkeeper in its own area first gets one save roll per special, when the ball is in its pickup reach.
 * Returns true if the special ended on a save (the keeper now owns the ball).
 */
function resolveSpecialContacts(state: GameState, sp: SpecialShot): boolean {
  const b = state.ball;
  for (const p of state.players) {
    if (p.team === sp.team || p.action === 'down') continue;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const dist = sqrt(dx * dx + dy * dy);

    if (p.role === 'GK' && inOwnArea(state, p) && !sp.rolled.includes(p.idx)) {
      const reach = pickupReach(state, p);
      if (reach >= 0 && dist < reach) {
        sp.rolled.push(p.idx);
        const shooter = state.players[sp.shooterIdx];
        if (rngNext(state) < specialSaveChance(p, shooter)) {
          b.special = undefined;
          b.ownerIdx = p.idx;
          b.lastTouchIdx = p.idx;
          LC.onBallGained(state, p);
          state.events.push({ type: 'specialEnd' });
          state.events.push({ type: 'save', playerIdx: p.idx, caught: true });
          return true;
        }
      }
    }

    if (sp.hit.includes(p.idx)) continue;
    if (dist >= p.radius + BALL_RADIUS + SPECIAL_CONTACT_PAD) continue;
    if (abs(b.z - p.z) >= SPECIAL_CONTACT_Z) continue;
    sp.hit.push(p.idx);
    applySpecialHit(state, state.players[sp.shooterIdx], p, sp.kind, sp.dirX, sp.dirY);
  }
  return false;
}

/**
 * Xu Chu's guard (惡虎吞天): the first on-target opponent shot that comes within TIGER_SWALLOW_RANGE of a guarding tiger is
 * swallowed. A shot is an unowned moving ball last touched by an opponent of the tiger. A swallow ends the guard and any
 * special shot. Returns true if a ball was swallowed (the ball is then held, see advanceTigerBall).
 */
function tryTigerSwallow(state: GameState): boolean {
  const b = state.ball;
  if (b.lastTouchIdx === -1 || b.tiger !== undefined) return false;
  if (sqrt(b.vx * b.vx + b.vy * b.vy) <= BALL_STOP_SPEED) return false;
  const shooter = state.players[b.lastTouchIdx];
  for (const tiger of state.players) {
    if (tiger.tigerTicks === 0 || tiger.team === shooter.team) continue;
    if (tiger.action === 'down' || tiger.action === 'recover') continue;
    const dx = b.x - tiger.x;
    const dy = b.y - tiger.y;
    if (sqrt(dx * dx + dy * dy) > TIGER_SWALLOW_RANGE) continue;
    if (!crossesOwnMouth(state, tiger.team, b)) continue;
    swallowBall(state, tiger);
    return true;
  }
  return false;
}

/** True if the ball's straight xy path crosses the goal line `team` defends, inside the goal mouth. */
function crossesOwnMouth(state: GameState, team: 0 | 1, b: Ball): boolean {
  if (b.vx === 0) return false;
  const side: 0 | 1 = attackDir(state, team) === 1 ? 0 : 1;
  const mouth = goalMouth(state, side);
  const t = (mouth.x - b.x) / b.vx;
  if (t <= 0) return false;
  const y = b.y + b.vy * t;
  return y >= mouth.yMin && y <= mouth.yMax;
}

/** The ball is caught in the tiger's mouth: a hold with no velocity, in front of him and high off the ground. */
function swallowBall(state: GameState, tiger: Player): void {
  const b = state.ball;
  tiger.tigerTicks = 0;
  if (b.special !== undefined) {
    b.special = undefined;
    state.events.push({ type: 'specialEnd' });
  }
  b.tiger = { tigerIdx: tiger.idx, team: tiger.team, phase: 'hold', holdTicks: TIGER_HOLD_TICKS, hit: [] };
  placeInMouth(state, tiger);
  state.events.push({ type: 'tigerSwallow', playerIdx: tiger.idx, x: b.x, y: b.y });
}

function placeInMouth(state: GameState, tiger: Player): void {
  const b = state.ball;
  b.x = tiger.x + attackDir(state, tiger.team) * TIGER_MOUTH_FORWARD;
  b.y = tiger.y;
  b.z = TIGER_MOUTH_Z;
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
}

/**
 * One tick of a tiger ball. Returns true while the ball is under the tiger's control (held or flying), so the normal ball
 * physics is skipped. A hold follows his mouth until its ticks run out, then the ball is spat. A flight arcs and hits the
 * opponents it passes; its first landing (or leaving the field) ends the tiger ball. The landing tick leaves the ball
 * loose at z 0, and the next tick runs normal physics.
 */
function advanceTigerBall(state: GameState): boolean {
  const b = state.ball;
  const t = b.tiger;
  if (t === undefined) return false;
  const tiger = state.players[t.tigerIdx];
  if (t.phase === 'hold') {
    placeInMouth(state, tiger);
    t.holdTicks--;
    if (t.holdTicks <= 0) spitTigerBall(state, tiger, t);
    return true;
  }

  b.vz -= GRAVITY * DT;
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  b.z += b.vz * DT;
  tigerBallContacts(state, t);
  if (b.z <= 0) {
    b.z = 0;
    b.vz = 0;
    b.tiger = undefined;
    return true;
  }
  if (b.x < 0 || b.x > state.field.w || b.y < 0 || b.y > state.field.d) {
    b.tiger = undefined;
    return false;
  }
  return true;
}

/**
 * The hold is over: the ball leaves his mouth as a high lob toward the opponent goal (along his attack direction), credited
 * to him. Horizontal speed is set so the first landing is TIGER_SPIT_DISTANCE from the spit point, with the same gravity
 * the ball uses in flight.
 */
function spitTigerBall(state: GameState, tiger: Player, t: TigerBall): void {
  const b = state.ball;
  const vz0 = TIGER_SPIT_VZ;
  const flightTime = (vz0 + sqrt(vz0 * vz0 + 2 * GRAVITY * TIGER_MOUTH_Z)) / GRAVITY;
  b.vx = (attackDir(state, tiger.team) * TIGER_SPIT_DISTANCE) / flightTime;
  b.vy = 0;
  b.vz = vz0;
  b.lastTouchIdx = tiger.idx;
  t.phase = 'flight';
  state.events.push({ type: 'tigerSpit', playerIdx: tiger.idx });
}

/**
 * A spat ball hits each opponent it passes at ball height, the same way a special ball does (see resolveSpecialContacts).
 * Invincible opponents are skipped; each victim is hit at most once.
 */
function tigerBallContacts(state: GameState, t: TigerBall): void {
  const b = state.ball;
  const tiger = state.players[t.tigerIdx];
  const speed = sqrt(b.vx * b.vx + b.vy * b.vy);
  const dirX = speed > 0 ? b.vx / speed : attackDir(state, tiger.team);
  const dirY = speed > 0 ? b.vy / speed : 0;
  for (const p of state.players) {
    if (p.team === t.team || p.action === 'down' || t.hit.includes(p.idx) || isInvincible(p)) continue;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    if (sqrt(dx * dx + dy * dy) >= p.radius + BALL_RADIUS + SPECIAL_CONTACT_PAD) continue;
    if (abs(b.z - p.z) >= SPECIAL_CONTACT_Z) continue;
    t.hit.push(p.idx);
    tigerBallHit(state, tiger, p, dirX, dirY);
  }
}

/** Save chance of a goalkeeper against a special shot. */
function specialSaveChance(gk: Player, shooter: Player): number {
  return clamp(0.3 + (gk.stats.defense - shooter.stats.power) * 0.08, 0.05, 0.6);
}

/** Catch chance of a goalkeeper against a fast ball. */
function gkCatchChance(gk: Player): number {
  return clamp(0.55 + (gk.stats.defense - 5) * 0.08, 0.2, 0.95);
}

function clamp(v: number, lo: number, hi: number): number {
  return min(hi, max(lo, v));
}

/**
 * Pickup reach for a player this tick, or -1 if it cannot pick up the ball now.
 * Goalkeepers in their own area reach further and higher; a diving goalkeeper reaches further still.
 */
function pickupReach(state: GameState, p: Player): number {
  if (p.noTouchTicks !== 0 || p.sailPassengerOf !== -1) return -1;
  const ball = state.ball;
  const gk = p.role === 'GK';
  const inArea = gk && inOwnArea(state, p);
  let reach = p.radius + BALL_RADIUS + PICKUP_REACH;
  if (inArea) reach += GK_EXTRA_REACH;
  if (p.action === 'normal') {
    if (ball.z >= (inArea ? GK_PICKUP_MAX_Z : PICKUP_MAX_Z)) return -1;
  } else if (p.action === 'dive') {
    if (!gk || abs(ball.z - p.z) >= GK_PICKUP_MAX_Z) return -1;
    reach += GK_DIVE_EXTRA_REACH;
  } else {
    return -1;
  }
  return reach;
}

/** Deflects a fast ball the keeper failed to catch, and keeps the keeper from grabbing it again for a while. */
function parryFastBall(state: GameState, gk: Player): void {
  const ball = state.ball;
  ball.vx = -ball.vx * GK_PARRY_DAMP;
  ball.vy = ball.vy * GK_PARRY_DAMP + (rngNext(state) * 2 - 1) * GK_PARRY_SPREAD;
  ball.vz = GK_PARRY_VZ;
  ball.lastTouchIdx = gk.idx;
  gk.noTouchTicks = GK_PARRY_NO_TOUCH;
}

/**
 * Unowned ball within reach of a free player is picked up by the nearest one (ties: lowest idx).
 * Pickups only happen in live play. A goalkeeper taking a fast ball first rolls a catch; a miss is a parry.
 * A ball already past a goal line is in the net and scores in updateMatch, so nobody may pick it up first.
 */
function updatePickup(state: GameState): void {
  const ball = state.ball;
  const inNet = ball.x < 0 || ball.x > state.field.w;
  if (state.match.phase === 'play' && ball.ownerIdx === -1 && ball.special === undefined && ball.tiger === undefined && !inNet) {
    let best = -1;
    let bestDist = INF;
    for (let i = 0; i < len(state.players); i++) {
      const p = state.players[i];
      const reach = pickupReach(state, p);
      if (reach < 0) continue;
      const dx = ball.x - p.x;
      const dy = ball.y - p.y;
      const dist = sqrt(dx * dx + dy * dy);
      if (dist < reach && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    if (best !== -1) {
      const gk = state.players[best];
      if (gk.role === 'GK' && sqrt(ball.vx * ball.vx + ball.vy * ball.vy) > GK_FAST_SHOT_SPEED) {
        const caught = rngNext(state) < gkCatchChance(gk);
        state.events.push({ type: 'save', playerIdx: best, caught });
        if (!caught) {
          parryFastBall(state, gk);
          best = -1;
        }
      }
    }
    if (best !== -1) {
      ball.ownerIdx = best;
      ball.lastTouchIdx = best;
      LC.onBallGained(state, state.players[best]);
      state.events.push({ type: 'pickup', playerIdx: best });
    }
  }

  for (let i = 0; i < len(state.players); i++) {
    const p = state.players[i];
    p.noTouchTicks = max(0, p.noTouchTicks - 1);
  }
}
