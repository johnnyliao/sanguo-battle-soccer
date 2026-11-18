import {
  CALL_PASS_TICKS,
  DASH_MULT,
  DASH_STAMINA_COST,
  DOWN_TICKS_EXHAUSTED,
  DOWN_TICKS_KNOCKED,
  DT,
  FIELD_D,
  FIELD_W,
  FLYKICK_SPEED,
  GETUP_STAMINA_RATIO,
  HITSTUN_TICKS,
  JUMP_VZ,
  KNOCKBACK_SPEED,
  LOOSE_BALL_NO_TOUCH,
  PLAYER_ACCEL,
  PLAYER_BASE_SPEED,
  PLAYER_GRAVITY,
  PLAYER_SPEED_PER_STAT,
  PUNCH_ACTIVE_FROM,
  PUNCH_ACTIVE_TO,
  PUNCH_HIT_RADIUS,
  PUNCH_RANGE,
  PUNCH_TICKS,
  RECOVER_TICKS,
  STAMINA_REGEN,
  TACKLE_SPEED_MULT,
  TACKLE_TICKS,
} from './constants';
import { rngNext } from './rng';
import type { AttackKind, GameState, InputFrame, Player } from './types';

/** Vertical gap under which an airborne hit still connects. */
const AIR_HIT_Z = 24;
/** A tackle only connects with victims this close to the ground. */
const TACKLE_MAX_VICTIM_Z = 10;
const TACKLE_CONTACT_PAD = 4;
const PUNCH_DAMP = 0.85;
const PUNCH_WALK_MULT = 0.3;
const TACKLE_DAMP = 0.96;
const HITSTUN_DAMP = 0.88;
const DOWN_DAMP = 0.85;
const RECOVER_DAMP = 0.85;
const AIR_CONTROL = 0.05;
const HIT_VZ = 80;
const LOOSE_BALL_SPEED = 90;
const LOOSE_BALL_SPREAD = 30;
const LOOSE_BALL_VZ = 120;

/** Runs one tick of the player's current action. Mutates the player and may mutate the ball and events. */
export function updateAction(state: GameState, p: Player, input: InputFrame): void {
  if (p.callPassTicks > 0) p.callPassTicks--;
  const landed = applyGravity(p);
  switch (p.action) {
    case 'normal':
      updateNormal(state, p, input);
      break;
    case 'punch':
      updatePunch(state, p);
      break;
    case 'tackle':
      updateTackle(state, p);
      break;
    case 'jump':
      updateJump(state, p, input, landed);
      break;
    case 'flykick':
      updateFlykick(state, p, landed);
      break;
    case 'hitstun':
      if (coast(p, HITSTUN_DAMP)) toNormal(p);
      break;
    case 'down':
      if (coast(p, DOWN_DAMP)) {
        toNormal(p);
        if (p.stamina <= 0) p.stamina = p.maxStamina * GETUP_STAMINA_RATIO;
      }
      break;
    case 'recover':
      if (coast(p, RECOVER_DAMP)) toNormal(p);
      break;
  }
}

/** Pushes a player back inside the field bounds in xy. */
export function clampPlayerToField(p: Player): void {
  if (p.x < 0) {
    p.x = 0;
    p.vx = 0;
  } else if (p.x > FIELD_W) {
    p.x = FIELD_W;
    p.vx = 0;
  }
  if (p.y < 0) {
    p.y = 0;
    p.vy = 0;
  } else if (p.y > FIELD_D) {
    p.y = FIELD_D;
    p.vy = 0;
  }
}

/** Applies gravity to airborne players. Returns true on the tick the player lands. */
function applyGravity(p: Player): boolean {
  if (p.z <= 0 && p.vz === 0) return false;
  p.vz -= PLAYER_GRAVITY * DT;
  p.z += p.vz * DT;
  if (p.z <= 0) {
    p.z = 0;
    p.vz = 0;
    return true;
  }
  return false;
}

function integrate(p: Player): void {
  p.x += p.vx * DT;
  p.y += p.vy * DT;
  clampPlayerToField(p);
}

/** Damps velocity, integrates, and counts down the action timer. Returns true when the timer ends. */
function coast(p: Player, damp: number): boolean {
  p.vx *= damp;
  p.vy *= damp;
  integrate(p);
  p.actionTimer--;
  return p.actionTimer <= 0;
}

function maxSpeedOf(p: Player): number {
  return PLAYER_BASE_SPEED + p.stats.speed * PLAYER_SPEED_PER_STAT;
}

/** Unit vector of the held direction, or zero when no direction is held. */
function inputDir(input: InputFrame): { x: number; y: number } {
  if (input.moveX === 0 && input.moveY === 0) return { x: 0, y: 0 };
  const len = Math.sqrt(input.moveX * input.moveX + input.moveY * input.moveY);
  return { x: input.moveX / len, y: input.moveY / len };
}

function clampSpeed(p: Player, max: number): void {
  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (speed > max) {
    p.vx *= max / speed;
    p.vy *= max / speed;
  }
}

function toNormal(p: Player): void {
  p.action = 'normal';
  p.actionTimer = 0;
}

function startAttack(state: GameState, p: Player, kind: AttackKind, ticks: number): void {
  p.action = kind;
  p.actionTimer = ticks;
  p.hitDone = false;
  state.events.push({ type: 'attack', playerIdx: p.idx, kind });
}

function startRecover(p: Player): void {
  p.action = 'recover';
  p.actionTimer = RECOVER_TICKS;
}

function setDown(p: Player, ticks: number): void {
  p.action = 'down';
  p.actionTimer = ticks;
}

function updateNormal(state: GameState, p: Player, input: InputFrame): void {
  const dir = inputDir(input);
  const moving = dir.x !== 0 || dir.y !== 0;
  if (moving) {
    p.facingX = dir.x;
    p.facingY = dir.y;
  }

  const dashHeld = input.dash && p.stamina > 0;
  if (dashHeld && moving) {
    p.stamina -= DASH_STAMINA_COST * DT;
  } else {
    p.stamina += STAMINA_REGEN * DT;
  }
  p.stamina = Math.min(p.maxStamina, Math.max(0, p.stamina));

  if (input.l && !p.prevInput.l) {
    p.callPassTicks = CALL_PASS_TICKS;
    state.events.push({ type: 'callPass', playerIdx: p.idx });
  }

  const ownsBall = state.ball.ownerIdx === p.idx;
  const baseSpeed = maxSpeedOf(p);

  if (input.j && !p.prevInput.j && !ownsBall) {
    if (dashHeld) {
      startAttack(state, p, 'tackle', TACKLE_TICKS);
      p.vx = p.facingX * baseSpeed * TACKLE_SPEED_MULT;
      p.vy = p.facingY * baseSpeed * TACKLE_SPEED_MULT;
    } else {
      startAttack(state, p, 'punch', PUNCH_TICKS);
      p.vx *= PUNCH_WALK_MULT;
      p.vy *= PUNCH_WALK_MULT;
    }
    integrate(p);
    return;
  }

  if (input.k && !p.prevInput.k && !ownsBall && p.z === 0 && p.vz === 0) {
    p.action = 'jump';
    p.actionTimer = 0;
    p.vz = JUMP_VZ;
    state.events.push({ type: 'jump', playerIdx: p.idx });
    integrate(p);
    return;
  }

  const maxSpeed = dashHeld ? baseSpeed * DASH_MULT : baseSpeed;
  const k = Math.min(1, (PLAYER_ACCEL * DT) / p.mass);
  p.vx += (dir.x * maxSpeed - p.vx) * k;
  p.vy += (dir.y * maxSpeed - p.vy) * k;
  integrate(p);
}

function updatePunch(state: GameState, p: Player): void {
  const done = coast(p, PUNCH_DAMP);
  const elapsed = PUNCH_TICKS - p.actionTimer;
  if (!p.hitDone && elapsed >= PUNCH_ACTIVE_FROM && elapsed <= PUNCH_ACTIVE_TO) {
    const reach = p.radius + PUNCH_RANGE;
    const cx = p.x + p.facingX * reach;
    const cy = p.y + p.facingY * reach;
    const victim = findVictim(state, p, (v) => {
      return Math.abs(v.z - p.z) < AIR_HIT_Z && distance(cx, cy, v.x, v.y) < PUNCH_HIT_RADIUS + v.radius;
    });
    if (victim) applyHit(state, p, victim, 'punch');
  }
  if (done) toNormal(p);
}

function updateTackle(state: GameState, p: Player): void {
  const done = coast(p, TACKLE_DAMP);
  if (!p.hitDone) {
    const victim = findVictim(state, p, (v) => {
      return v.z < TACKLE_MAX_VICTIM_Z && distance(p.x, p.y, v.x, v.y) < p.radius + v.radius + TACKLE_CONTACT_PAD;
    });
    if (victim) applyHit(state, p, victim, 'tackle');
  }
  if (done) startRecover(p);
}

function updateJump(state: GameState, p: Player, input: InputFrame, landed: boolean): void {
  if (landed) {
    toNormal(p);
    return;
  }

  const dir = inputDir(input);
  if (dir.x !== 0 || dir.y !== 0) {
    p.facingX = dir.x;
    p.facingY = dir.y;
    const maxSpeed = maxSpeedOf(p);
    p.vx += dir.x * maxSpeed * AIR_CONTROL;
    p.vy += dir.y * maxSpeed * AIR_CONTROL;
    clampSpeed(p, maxSpeed);
  }

  if (input.j && !p.prevInput.j && state.ball.ownerIdx !== p.idx) {
    startAttack(state, p, 'flykick', 0);
    p.vx = p.facingX * FLYKICK_SPEED;
    p.vy = p.facingY * FLYKICK_SPEED;
  }
  integrate(p);
}

function updateFlykick(state: GameState, p: Player, landed: boolean): void {
  if (landed) {
    startRecover(p);
    return;
  }
  integrate(p);
  if (!p.hitDone) {
    const victim = findVictim(state, p, (v) => {
      return Math.abs(v.z - p.z) < AIR_HIT_Z && distance(p.x, p.y, v.x, v.y) < p.radius + v.radius;
    });
    if (victim) applyHit(state, p, victim, 'flykick');
  }
}

/** First opponent in index order that is not down and satisfies the overlap test. */
function findVictim(
  state: GameState,
  attacker: Player,
  overlaps: (v: Player) => boolean,
): Player | undefined {
  for (const v of state.players) {
    if (v.team === attacker.team || v.action === 'down') continue;
    if (overlaps(v)) return v;
  }
  return undefined;
}

function applyHit(state: GameState, attacker: Player, victim: Player, kind: AttackKind): void {
  attacker.hitDone = true;

  let damage = Math.max(3, Math.round(8 + attacker.stats.power * 1.2 - victim.stats.defense * 0.5));
  if (kind !== 'punch') damage = Math.round(damage * 1.5);
  victim.stamina = Math.max(0, victim.stamina - damage);

  let dirX = victim.x - attacker.x;
  let dirY = victim.y - attacker.y;
  const len = Math.sqrt(dirX * dirX + dirY * dirY);
  if (len === 0) {
    dirX = attacker.facingX;
    dirY = attacker.facingY;
  } else {
    dirX /= len;
    dirY /= len;
  }
  const knock = (KNOCKBACK_SPEED * attacker.mass) / victim.mass;
  victim.vx = dirX * knock;
  victim.vy = dirY * knock;
  victim.vz = HIT_VZ;

  let down = false;
  if (victim.stamina <= 0) {
    setDown(victim, DOWN_TICKS_EXHAUSTED);
    down = true;
  } else if (kind !== 'punch') {
    setDown(victim, DOWN_TICKS_KNOCKED);
    down = true;
  } else {
    victim.action = 'hitstun';
    victim.actionTimer = HITSTUN_TICKS;
  }

  state.events.push({
    type: 'hit',
    attackerIdx: attacker.idx,
    victimIdx: victim.idx,
    kind,
    damage,
  });

  const ball = state.ball;
  if (ball.ownerIdx === victim.idx) {
    ball.ownerIdx = -1;
    ball.vx = dirX * LOOSE_BALL_SPEED + (rngNext(state) * 2 - 1) * LOOSE_BALL_SPREAD;
    ball.vy = dirY * LOOSE_BALL_SPEED + (rngNext(state) * 2 - 1) * LOOSE_BALL_SPREAD;
    ball.vz = LOOSE_BALL_VZ;
    victim.noTouchTicks = LOOSE_BALL_NO_TOUCH;
    state.events.push({ type: 'looseBall', playerIdx: victim.idx });
  }

  if (down) state.events.push({ type: 'down', playerIdx: victim.idx });
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
