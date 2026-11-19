import {
  BALL_AIR_DRAG,
  BALL_BOUNCE,
  BALL_GROUND_FRICTION,
  BALL_RADIUS,
  BALL_STOP_SPEED,
  DRIBBLE_OFFSET,
  DT,
  FIELD_D,
  FIELD_W,
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
  WALL_BOUNCE,
} from './constants';
import { applyRampageBumps, applySpecialHit, clampPlayerToField, isInvincible, updateAction } from './actions';
import { inOwnArea, goalMouth, isInGoalMouth } from './field';
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
    for (let i = 0; i < state.players.length; i++) {
      updateAction(state, state.players[i], frames[i]);
    }

    applyRampageBumps(state);
    resolvePlayerCollisions(state.players);
    updatePossession(state);
    updateBall(state);
    updatePickup(state);
    updateMatch(state);
  }

  for (let i = 0; i < state.players.length; i++) {
    state.players[i].prevInput = { ...frames[i] };
  }

  state.tick++;
  return state;
}

/**
 * Pushes overlapping players apart in xy; the push is split by inverse mass (lighter moves more). Downed players are skipped.
 * An invincible player (rampaging or lunging) has infinite mass: it is not pushed, and an opponent takes the whole push.
 */
function resolvePlayerCollisions(players: Player[]): void {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      if (a.action === 'down' || b.action === 'down') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
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
      clampPlayerToField(a);
      clampPlayerToField(b);
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
  ball.x = clamp(p.x + p.facingX * offset, BALL_RADIUS + 1, FIELD_W - BALL_RADIUS - 1);
  ball.y = clamp(p.y + p.facingY * offset, 0, FIELD_D);
  ball.z = 0;
  ball.vx = p.vx;
  ball.vy = p.vy;
  ball.vz = 0;
}

function updateBall(state: GameState): void {
  const b = state.ball;
  if (b.ownerIdx !== -1) return;

  if (b.special !== null) {
    // A special ball that ends this tick still gets the wall / goal-net handling below.
    if (!advanceSpecial(state)) bounceOffWalls(b);
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
  const mult = Math.max(0, 1 - friction * DT);
  b.vx *= mult;
  b.vy *= mult;
  if (b.z === 0 && Math.sqrt(b.vx * b.vx + b.vy * b.vy) < BALL_STOP_SPEED) {
    b.vx = 0;
    b.vy = 0;
  }

  bounceOffWalls(b);
}

/** Side walls and end walls (through the goal mouth into the net, otherwise bounce off). */
function bounceOffWalls(b: Ball): void {
  // Side walls.
  if (b.y < 0) {
    b.y = -b.y;
    b.vy = -b.vy * WALL_BOUNCE;
  } else if (b.y > FIELD_D) {
    b.y = 2 * FIELD_D - b.y;
    b.vy = -b.vy * WALL_BOUNCE;
  }

  // End walls: through the goal mouth into the net, otherwise bounce off.
  if (b.x < 0 || b.x > FIELD_W) {
    const side: 0 | 1 = b.x < 0 ? 0 : 1;
    const netX = side === 0 ? -GOAL_DEPTH : FIELD_W + GOAL_DEPTH;
    const inNet = side === 0 ? b.x <= netX : b.x >= netX;
    if (inNet || isInGoalMouth(b.y, b.z)) {
      const mouth = goalMouth(side);
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
      b.x = 2 * FIELD_W - b.x;
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
  if (sp === null) return false;
  sp.ticks++;

  const speed = sp.speed;
  if (sp.kind === 'zigzag') {
    const lateral = Math.cos(sp.ticks * SPECIAL_ZIGZAG_FREQ) * SPECIAL_ZIGZAG_AMP;
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
  const outOfPlay = b.x < 0 || b.x > FIELD_W || b.y < 0 || b.y > FIELD_D;
  if (sp.ticks > SPECIAL_MAX_TICKS || outOfPlay || landed) {
    if (landed) b.z = 0;
    b.special = null;
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
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (p.role === 'GK' && inOwnArea(state, p) && !sp.rolled.includes(p.idx)) {
      const reach = pickupReach(state, p);
      if (reach >= 0 && dist < reach) {
        sp.rolled.push(p.idx);
        const shooter = state.players[sp.shooterIdx];
        if (rngNext(state) < specialSaveChance(p, shooter)) {
          b.special = null;
          b.ownerIdx = p.idx;
          b.lastTouchIdx = p.idx;
          state.events.push({ type: 'specialEnd' });
          state.events.push({ type: 'save', playerIdx: p.idx, caught: true });
          return true;
        }
      }
    }

    if (sp.hit.includes(p.idx)) continue;
    if (dist >= p.radius + BALL_RADIUS + SPECIAL_CONTACT_PAD) continue;
    if (Math.abs(b.z - p.z) >= SPECIAL_CONTACT_Z) continue;
    sp.hit.push(p.idx);
    applySpecialHit(state, state.players[sp.shooterIdx], p, sp.kind, sp.dirX, sp.dirY);
  }
  return false;
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
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Pickup reach for a player this tick, or -1 if it cannot pick up the ball now.
 * Goalkeepers in their own area reach further and higher; a diving goalkeeper reaches further still.
 */
function pickupReach(state: GameState, p: Player): number {
  if (p.noTouchTicks !== 0) return -1;
  const ball = state.ball;
  const gk = p.role === 'GK';
  const inArea = gk && inOwnArea(state, p);
  let reach = p.radius + BALL_RADIUS + PICKUP_REACH;
  if (inArea) reach += GK_EXTRA_REACH;
  if (p.action === 'normal') {
    if (ball.z >= (inArea ? GK_PICKUP_MAX_Z : PICKUP_MAX_Z)) return -1;
  } else if (p.action === 'dive') {
    if (!gk || Math.abs(ball.z - p.z) >= GK_PICKUP_MAX_Z) return -1;
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
 */
function updatePickup(state: GameState): void {
  const ball = state.ball;
  if (state.match.phase === 'play' && ball.ownerIdx === -1 && ball.special === null) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      const reach = pickupReach(state, p);
      if (reach < 0) continue;
      const dx = ball.x - p.x;
      const dy = ball.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < reach && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    if (best !== -1) {
      const gk = state.players[best];
      if (gk.role === 'GK' && Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) > GK_FAST_SHOT_SPEED) {
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
      state.events.push({ type: 'pickup', playerIdx: best });
    }
  }

  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    p.noTouchTicks = Math.max(0, p.noTouchTicks - 1);
  }
}
