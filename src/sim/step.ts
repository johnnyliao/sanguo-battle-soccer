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
  GOAL_DEPTH,
  GRAVITY,
  PICKUP_MAX_Z,
  PICKUP_REACH,
  WALL_BOUNCE,
} from './constants';
import { clampPlayerToField, updateAction } from './actions';
import { goalMouth, isInGoalMouth } from './field';
import { EMPTY_INPUT, type GameState, type InputFrame, type Player } from './types';

/** Impact speed above which a ground bounce is reported as an event. */
const BOUNCE_EVENT_MIN_SPEED = 40;

/** Advances the simulation by one tick. Mutates and returns the same state. */
export function step(state: GameState, inputs: InputFrame[]): GameState {
  state.events = [];

  for (let i = 0; i < state.players.length; i++) {
    updateAction(state, state.players[i], inputs[i] ?? EMPTY_INPUT);
  }

  resolvePlayerCollisions(state.players);
  updatePossession(state);
  updateBall(state);
  updatePickup(state);

  for (let i = 0; i < state.players.length; i++) {
    state.players[i].prevInput = { ...(inputs[i] ?? EMPTY_INPUT) };
  }

  state.tick++;
  return state;
}

/** Pushes overlapping players apart in xy; the push is split by inverse mass (lighter moves more). Downed players are skipped. */
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
      const invA = 1 / a.mass;
      const invB = 1 / b.mass;
      const sumInv = invA + invB;
      const pushA = (overlap * invA) / sumInv;
      const pushB = (overlap * invB) / sumInv;

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
  ball.x = p.x + p.facingX * offset;
  ball.y = p.y + p.facingY * offset;
  ball.z = 0;
  ball.vx = p.vx;
  ball.vy = p.vy;
  ball.vz = 0;
}

function updateBall(state: GameState): void {
  const b = state.ball;
  if (b.ownerIdx !== -1) return;

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

/** Unowned ball within reach of a free player is picked up by the nearest one (ties: lowest idx). */
function updatePickup(state: GameState): void {
  const ball = state.ball;
  if (ball.ownerIdx === -1) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      if (p.noTouchTicks !== 0) continue;
      if (p.action === 'normal') {
        if (ball.z >= PICKUP_MAX_Z) continue;
      } else if (p.action === 'jump') {
        if (Math.abs(ball.z - p.z) >= PICKUP_MAX_Z) continue;
      } else {
        continue;
      }
      const dx = ball.x - p.x;
      const dy = ball.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const reach = p.radius + BALL_RADIUS + PICKUP_REACH;
      if (dist < reach && dist < bestDist) {
        best = i;
        bestDist = dist;
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
