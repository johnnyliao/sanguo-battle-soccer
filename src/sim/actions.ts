import type { SpecialKind } from '../data/types';
import {
  BALL_RADIUS,
  BEAM_CAST_TICKS,
  BEAM_SPEED,
  BEAM_STRIKE_STAMINA_RATIO,
  CALL_PASS_TICKS,
  CHARGE_FULL,
  CHARGE_MOVE_MULT,
  DASH_MULT,
  DASH_STAMINA_COST,
  DOWN_TICKS_EXHAUSTED,
  DOWN_TICKS_KNOCKED,
  DT,
  FEAR_RADIUS,
  FEAR_STAMINA_RATIO,
  FEAR_TICKS,
  FIELD_D,
  FIELD_W,
  GETUP_STAMINA_RATIO,
  GK_DIVE_RECOVER_TICKS,
  GK_DIVE_SPEED,
  GK_DIVE_TICKS,
  GOAL_H,
  GRAVITY,
  HITSTUN_TICKS,
  ICE_DOT_INTERVAL,
  ICE_DOT_RATIO,
  ICE_RADIUS,
  ICE_SLOW_MULT,
  ICE_TICKS,
  KICK_NO_TOUCH,
  KICK_RECOVER_TICKS,
  KNOCKBACK_SPEED,
  LEAP_BACK_DISTANCE,
  LEAP_BACK_TICKS,
  LEAP_FLY_DISTANCE,
  LEAP_FLY_TICKS,
  LEAP_PEAK_Z,
  LEAP_RADIUS,
  LEAP_STAMINA_RATIO,
  LOOSE_BALL_NO_TOUCH,
  LUNGE_HEAL_RATIO,
  LUNGE_SPEED,
  LUNGE_TICKS,
  PASS_LOB_DIST,
  PASS_LOB_SPEED,
  PLAYER_ACCEL,
  PLAYER_BASE_SPEED,
  PLAYER_GRAVITY,
  PLAYER_SPEED_PER_STAT,
  PUNCH_ACTIVE_FROM,
  PUNCH_ACTIVE_TO,
  PUNCH_HIT_RADIUS,
  PUNCH_RANGE,
  PUNCH_TICKS,
  RAMPAGE_BUMP_COOLDOWN,
  RIDER_HIT_RADIUS,
  RIDER_LATERAL_MAX,
  RIDER_LATERAL_RATIO,
  RIDER_LATERAL_SLOT_GROWTH,
  RIDER_SEPARATION_ACCEL,
  RIDER_SEPARATION_DIST,
  RIDER_SPAWN_RADIUS,
  RIDER_SPEED,
  RIDER_TURN,
  RIDER_WANDER_TICKS,
  RAMPAGE_BUMP_SPEED,
  RAMPAGE_BUMP_STAMINA,
  RAMPAGE_SPEED_MULT,
  RAMPAGE_TICKS,
  RECOVER_TICKS,
  RIDE_CONTACT_PAD,
  RIDE_HITSTUN_TICKS,
  RIDE_LANE_HALF,
  RIDE_PUSH_FORWARD,
  RIDE_PUSH_SIDE,
  RIDE_SPEED,
  RIDE_TICKS,
  GUST_DELAY_TICKS,
  GUST_FALLBACK_DIST,
  GUST_LAUNCH_TICKS,
  GUST_LAUNCH_VZ,
  GUST_PUSH_SPEED,
  GUST_RADIUS,
  GUST_STAMINA_RATIO,
  GUST_TARGET_RANGE,
  ROAR_BALL_SPEED,
  ROAR_BALL_VZ,
  ROAR_FORWARD,
  ROAR_KNOCK_SPEED,
  ROAR_RADIUS,
  ROAR_STAMINA,
  ROAR_STUN_TICKS,
  SAIL_HALF_DEPTH,
  SAIL_HALF_LEN,
  SAIL_LAUNCH_SPEED,
  SAIL_CRASH_STAMINA_RATIO,
  SAIL_LAUNCH_TICKS,
  SAIL_LAUNCH_VZ,
  SAIL_PASSENGER_BEHIND,
  SAIL_SPEED_MULT,
  SAIL_TICKS,
  SHOT_BASE_SPEED,
  SHOT_SPEED_PER_CHARGE,
  SHOT_SPEED_PER_POWER,
  SILENCE_TICKS,
  SLASH_DAMAGE_RATIO,
  SLASH_FIRST_DELAY,
  SLASH_HEAL_RATIO,
  SLASH_HITSTUN_TICKS,
  SLASH_INTERVAL,
  SLASH_MELEE_HALF_DEPTH,
  SLASH_MELEE_REACH,
  SLASH_TICKS,
  SLASH_WAVE_RANGE,
  SLASH_WAVE_SPEED,
  SPECIAL_BUFFER_TICKS,
  SPECIAL_COOLDOWN_TICKS,
  SPECIAL_FLAT_Z,
  SPECIAL_HIT_STAMINA,
  SPECIAL_LOB_FALL_GRAVITY_MULT,
  SPECIAL_LOB_SPEED,
  SPECIAL_LOB_VZ,
  SPECIAL_PIERCE_SPEED,
  SPECIAL_STAMINA_COST,
  SPECIAL_STRAIGHT_SPEED,
  SPECIAL_ZIGZAG_SPEED,
  STAMINA_REGEN,
  SUMMON_RIDERS,
  SUMMON_TICKS,
  TACKLE_SPEED_MULT,
  TACKLE_TICKS,
  TICK_HZ,
  TIGER_BALL_STAMINA_RATIO,
  TIGER_GUARD_TICKS,
  TIGER_ROAR_RADIUS,
  TIGER_ROAR_STAMINA_RATIO,
  TIGER_STUN_TICKS,
} from './constants';
import { attackDir, goalMouth, inOwnArea, opponentGoalX } from './field';
import { rngInt, rngNext } from './rng';
import {
  type AttackKind,
  type BladeWave,
  type Gust,
  type GameState,
  type IceField,
  type InputFrame,
  type Player,
  type PlayerAction,
  type Rider,
  type SpecialShot,
} from './types';

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
const HIT_VZ = 80;
const LOOSE_BALL_SPEED = 90;
const LOOSE_BALL_SPREAD = 30;
const LOOSE_BALL_VZ = 120;
const RAMPAGE_BUMP_VZ = 220;
const ROAR_VZ = 140;
/** A rampager bumps opponents whose circle comes within this many px of its own. */
const RAMPAGE_BUMP_PAD = 4;
const PASS_CONE_COS = 0.3;
const PASS_SPEED_GUESS = 300;
const PASS_GROUND_VZ = 30;
const PASS_LOB_MAX_VZ = 420;
const SHOT_AIM_OFFSET_Y = 28;
const SHOT_AIM_SPREAD = 3.5;
const SHOT_MAX_VZ = 500;
const CLEAR_SPEED = 300;
const CLEAR_VZ = 150;
const GK_DIVE_VZ = 120;
const GK_DIVE_DAMP = 0.95;
const LOB_MIN_SPEED = 120;
const LOB_MAX_SPEED = 440;
/** A lob lands this far past the goal line along its shot direction. */
const LOB_OVERSHOOT = 10;

/** Runs one tick of the player's current action. Mutates the player and may mutate the ball and events. */
export function updateAction(state: GameState, p: Player, input: InputFrame): void {
  // A passenger on a sail is carried by carryPassengers: no input, no timers, no physics.
  if (p.sailPassengerOf !== -1) return;
  if (p.callPassTicks > 0) p.callPassTicks--;
  applyGravity(p);
  tickRampage(state, p);
  tickTiger(state, p);
  tickSlash(state, p);
  tickSail(state, p);
  tickSpecialCooldown(state, p);
  if (p.silenceTicks > 0) p.silenceTicks--;
  if (input.l && !p.prevInput.l && p.action !== 'fear' && p.silenceTicks === 0) p.specialBuffer = SPECIAL_BUFFER_TICKS;
  else if (p.specialBuffer > 0) p.specialBuffer--;
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
    case 'dive':
      updateDive(p);
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
    case 'charge':
      updateCharge(state, p, input);
      break;
    case 'lunge':
      updateLunge(state, p);
      break;
    case 'cast':
      updateCast(state, p);
      break;
    case 'fear':
      updateFear(p);
      break;
    case 'leap':
      updateLeap(state, p);
      break;
    case 'ride':
      updateRide(state, p);
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

/** Applies gravity to airborne players (knocked-back players are airborne briefly). */
function applyGravity(p: Player): void {
  if (p.z <= 0 && p.vz === 0) return;
  p.vz -= PLAYER_GRAVITY * DT;
  p.z += p.vz * DT;
  if (p.z <= 0) {
    p.z = 0;
    p.vz = 0;
  }
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

function maxSpeedOf(state: GameState, p: Player): number {
  const sailMult = p.sailTicks > 0 ? SAIL_SPEED_MULT : 1;
  return (PLAYER_BASE_SPEED + p.stats.speed * PLAYER_SPEED_PER_STAT) * iceSlowMult(state, p) * sailMult;
}

/**
 * Speed multiplier from Zhen Ji's ice fields: ICE_SLOW_MULT while the player stands within ICE_RADIUS of a field cast by an
 * opponent. Invincible players are unaffected. It is computed from position each tick, so leaving a field restores speed at once.
 */
function iceSlowMult(state: GameState, p: Player): number {
  if (isInvincible(p)) return 1;
  for (const f of state.iceFields) {
    if (f.team !== p.team && distance(f.x, f.y, p.x, p.y) <= ICE_RADIUS) return ICE_SLOW_MULT;
  }
  return 1;
}

/** Unit vector of the held direction, or zero when no direction is held. */
function inputDir(input: InputFrame): { x: number; y: number } {
  if (input.moveX === 0 && input.moveY === 0) return { x: 0, y: 0 };
  const len = Math.sqrt(input.moveX * input.moveX + input.moveY * input.moveY);
  return { x: input.moveX / len, y: input.moveY / len };
}

function toNormal(p: Player): void {
  p.action = 'normal';
  p.actionTimer = 0;
}

function startAttack(
  state: GameState,
  p: Player,
  kind: Exclude<AttackKind, 'special'>,
  ticks: number,
): void {
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

  // A lunge or beam cast takes over the whole tick: its movement is set by startLunge / startBeamCast and their updates.
  if (trySpecial(state, p, input) && p.action !== 'normal') return;

  // A rampage replaces the dash: no dash drain, and the rampage speed applies instead.
  const rampaging = p.rampageTicks > 0;
  const dashHeld = !rampaging && input.dash && p.stamina > 0;
  if (dashHeld && moving) {
    p.stamina -= DASH_STAMINA_COST * DT;
  } else {
    p.stamina += STAMINA_REGEN * DT;
  }
  p.stamina = Math.min(p.maxStamina, Math.max(0, p.stamina));

  const ownsBall = state.ball.ownerIdx === p.idx;
  const baseSpeed = maxSpeedOf(state, p);
  // Silenced (a leap landing): only movement works, so J and K do nothing.
  const silenced = p.silenceTicks > 0;

  if (ownsBall && !silenced) {
    if (input.k && !p.prevInput.k) {
      if (rampaging) endRampage(state, p);
      passBall(state, p);
      integrate(p);
      return;
    }
    if (input.j && !p.prevInput.j && rampaging) {
      endRampage(state, p);
      startSpecial(state, p);
      return;
    }
    if (input.j && !p.prevInput.j) {
      p.action = 'charge';
      p.chargeTicks = 0;
      moveCharging(state, p, input);
      return;
    }
  }

  if (input.k && !p.prevInput.k && !silenced) {
    p.callPassTicks = CALL_PASS_TICKS;
    state.events.push({ type: 'callPass', playerIdx: p.idx });
  }

  // A rampage without the ball (a no-ball special) makes J do nothing: no punch, tackle or dive.
  if (input.j && !p.prevInput.j && !ownsBall && !rampaging && !silenced) {
    if (dashHeld) {
      // While sailing the tackle keeps the sail speed: no extra burst on top of it.
      const tackleMult = p.sailTicks > 0 ? 1 : TACKLE_SPEED_MULT;
      startAttack(state, p, 'tackle', TACKLE_TICKS);
      p.vx = p.facingX * baseSpeed * tackleMult;
      p.vy = p.facingY * baseSpeed * tackleMult;
    } else if (p.role === 'GK' && inOwnArea(state, p) && p.z === 0 && p.vz === 0) {
      startDive(state, p, input);
      return;
    } else {
      startAttack(state, p, 'punch', PUNCH_TICKS);
      p.vx *= PUNCH_WALK_MULT;
      p.vy *= PUNCH_WALK_MULT;
    }
    integrate(p);
    return;
  }

  // The sail's speed does not stack with dash: while sailing, dash leaves the speed at the sail speed.
  const maxSpeed = rampaging
    ? baseSpeed * RAMPAGE_SPEED_MULT
    : dashHeld && p.sailTicks === 0
      ? baseSpeed * DASH_MULT
      : baseSpeed;
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
    if (victim) {
      p.hitDone = true;
      applyHit(state, p, victim, 'punch');
    }
  }
  if (done) toNormal(p);
}

function updateTackle(state: GameState, p: Player): void {
  const done = coast(p, TACKLE_DAMP);
  if (!p.hitDone) {
    const victim = findVictim(state, p, (v) => {
      return v.z < TACKLE_MAX_VICTIM_Z && distance(p.x, p.y, v.x, v.y) < p.radius + v.radius + TACKLE_CONTACT_PAD;
    });
    if (victim) {
      p.hitDone = true;
      applyHit(state, p, victim, 'tackle');
    }
  }
  if (done) startRecover(p);
}

/** Goalkeeper dive: a fast slide along the held direction (or facing) with a small hop. */
function startDive(state: GameState, p: Player, input: InputFrame): void {
  const dir = inputDir(input);
  if (dir.x !== 0 || dir.y !== 0) {
    p.facingX = dir.x;
    p.facingY = dir.y;
  }
  p.action = 'dive';
  p.actionTimer = GK_DIVE_TICKS;
  p.vx = p.facingX * GK_DIVE_SPEED;
  p.vy = p.facingY * GK_DIVE_SPEED;
  p.vz = GK_DIVE_VZ;
  state.events.push({ type: 'dive', playerIdx: p.idx });
  integrate(p);
}

/** Dive slides, decaying each tick, then turns into a recover. */
function updateDive(p: Player): void {
  p.vx *= GK_DIVE_DAMP;
  p.vy *= GK_DIVE_DAMP;
  integrate(p);
  p.actionTimer--;
  if (p.actionTimer <= 0) {
    p.action = 'recover';
    p.actionTimer = GK_DIVE_RECOVER_TICKS;
  }
}

/** Ball-carrier charging a shot: slow movement, no dash, no stamina regen. Releasing J shoots. */
function updateCharge(state: GameState, p: Player, input: InputFrame): void {
  if (state.ball.ownerIdx !== p.idx) {
    p.chargeTicks = 0;
    toNormal(p);
    return;
  }
  if (trySpecial(state, p, input)) {
    p.chargeTicks = 0;
    return;
  }
  if (!input.j && p.prevInput.j) {
    releaseCharge(state, p, input);
    return;
  }
  if (p.chargeTicks < CHARGE_FULL) {
    p.chargeTicks++;
    if (p.chargeTicks === CHARGE_FULL) state.events.push({ type: 'chargeFull', playerIdx: p.idx });
  }
  moveCharging(state, p, input);
}

function moveCharging(state: GameState, p: Player, input: InputFrame): void {
  const dir = inputDir(input);
  if (dir.x !== 0 || dir.y !== 0) {
    p.facingX = dir.x;
    p.facingY = dir.y;
  }
  const maxSpeed = maxSpeedOf(state, p) * CHARGE_MOVE_MULT;
  const k = Math.min(1, (PLAYER_ACCEL * DT) / p.mass);
  p.vx += (dir.x * maxSpeed - p.vx) * k;
  p.vy += (dir.y * maxSpeed - p.vy) * k;
  integrate(p);
}

/** Picks the shot on J release: a shot toward the goal (power by charge), else a clear. */
function releaseCharge(state: GameState, p: Player, input: InputFrame): void {
  const charge = p.chargeTicks;
  p.chargeTicks = 0;
  const towardGoal = p.facingX * attackDir(state, p.team) > 0;
  if (towardGoal) {
    shoot(state, p, input, charge);
  } else {
    kickClear(state, p);
  }
}

/**
 * Buffered L press: starts the special if a press is buffered, the match is in play, and it is ready (cooldown 0,
 * enough stamina). A roar (Zhang Fei) and a fear (Zhang Liao) are instant. Every other special needs the ball unless
 * its character has specialNoBall; a rampage, lunge, beam, leap or ride starts at once, and a summon keeps the ball.
 * A special that cannot start yet keeps the buffer. Returns true if it started.
 */
function trySpecial(state: GameState, p: Player, input: InputFrame): boolean {
  if (p.specialBuffer === 0 || state.match.phase !== 'play' || p.silenceTicks > 0) return false;
  if (p.specialCooldown > 0 || p.stamina < SPECIAL_STAMINA_COST) return false;
  if (p.specialMode === 'roar') {
    p.specialBuffer = 0;
    castRoar(state, p);
    return true;
  }
  if (p.specialMode === 'fear') {
    p.specialBuffer = 0;
    castFear(state, p);
    return true;
  }
  if (!p.specialNoBall && state.ball.ownerIdx !== p.idx) return false;
  p.specialBuffer = 0;
  if (p.specialMode === 'lunge') startLunge(state, p, input);
  else if (p.specialMode === 'beam') startBeamCast(state, p);
  else if (p.specialMode === 'summon') startSummon(state, p);
  else if (p.specialMode === 'leap') startLeap(state, p);
  else if (p.specialMode === 'tiger') startTiger(state, p);
  else if (p.specialMode === 'slash') startSlash(state, p);
  else if (p.specialMode === 'ride') startRide(state, p);
  else if (p.specialMode === 'icefield') startIcefield(state, p);
  else if (p.specialMode === 'sail') startSail(state, p);
  else if (p.specialMode === 'gust') startGust(state, p);
  else startRampage(state, p);
  return true;
}

/** Special L: the player's rampage starts. With the ball he keeps it; the special ball flies on the next J press. */
function startRampage(state: GameState, p: Player): void {
  p.stamina -= SPECIAL_STAMINA_COST;
  p.rampageTicks = RAMPAGE_TICKS;
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  p.action = 'normal';
  p.actionTimer = 0;
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  state.events.push({ type: 'rampageStart', playerIdx: p.idx });
}

/**
 * Special L with the ball (Zhao Yun): a fixed-speed dash along the held direction (or facing). The player keeps the ball
 * at his feet and is invincible for the lunge's LUNGE_TICKS ticks.
 */
function startLunge(state: GameState, p: Player, input: InputFrame): void {
  const dir = inputDir(input);
  if (dir.x !== 0 || dir.y !== 0) {
    p.facingX = dir.x;
    p.facingY = dir.y;
  }
  p.stamina -= SPECIAL_STAMINA_COST;
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  p.chargeTicks = 0;
  p.action = 'lunge';
  p.actionTimer = LUNGE_TICKS;
  p.vx = p.facingX * LUNGE_SPEED;
  p.vy = p.facingY * LUNGE_SPEED;
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  state.events.push({ type: 'lungeStart', playerIdx: p.idx, x: p.x, y: p.y, dirX: p.facingX, dirY: p.facingY });
}

/**
 * One lunge tick: the velocity stays fixed and input is ignored. The lunge ends when its timer runs out, when the
 * player reaches the field edge, or when the phase leaves play.
 */
function updateLunge(state: GameState, p: Player): void {
  if (state.match.phase !== 'play') {
    endLunge(state, p);
    return;
  }
  const nextX = p.x + p.vx * DT;
  const nextY = p.y + p.vy * DT;
  const atEdge = nextX < 0 || nextX > FIELD_W || nextY < 0 || nextY > FIELD_D;
  // Reaching the opponent's goal line inside the mouth (ball radius inset) scores; the lunge never scores into his own goal.
  const side: 0 | 1 = attackDir(state, p.team) === 1 ? 1 : 0;
  const mouth = goalMouth(side);
  const onGoalLine = side === 1 ? nextX >= FIELD_W : nextX <= 0;
  const inMouth = nextY >= mouth.yMin + BALL_RADIUS && nextY <= mouth.yMax - BALL_RADIUS;
  integrate(p);
  p.actionTimer--;
  if (onGoalLine && inMouth && state.ball.ownerIdx === p.idx) {
    ballIntoGoal(state, p, side, p.vx, p.vy);
    endLunge(state, p);
  } else if (atEdge || p.actionTimer <= 0) {
    endLunge(state, p);
  }
}

/**
 * A lunger's or rampager's ball leaves his feet at (vx, vy) and is placed just past the goal line of `side`, so the goal
 * check in updateMatch scores it this tick (the ball is past the line, so pickup and possession skip it).
 */
function ballIntoGoal(state: GameState, p: Player, side: 0 | 1, vx: number, vy: number): void {
  releaseBall(state, p, vx, vy, 0);
  const ball = state.ball;
  ball.x = side === 1 ? FIELD_W + BALL_RADIUS + 1 : -(BALL_RADIUS + 1);
  ball.y = p.y;
  ball.z = 0;
}

/** Back to normal play. The lunge speed is scaled down to the player's normal top speed, keeping its direction. */
function endLunge(state: GameState, p: Player): void {
  const maxSpeed = maxSpeedOf(state, p);
  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (speed > maxSpeed) {
    p.vx = (p.vx / speed) * maxSpeed;
    p.vy = (p.vy / speed) * maxSpeed;
  }
  toNormal(p);
  state.events.push({ type: 'lungeEnd', playerIdx: p.idx, x: p.x, y: p.y });
}

/**
 * Simayi's leap (鷹視狼顧): a back-hop opposite his facing, then a long flight along it, invincible throughout. He keeps
 * any ball at his feet. The landing hits the opponents near him (see landLeap).
 */
function startLeap(state: GameState, p: Player): void {
  const len = Math.sqrt(p.facingX * p.facingX + p.facingY * p.facingY);
  if (len > 0) {
    p.facingX /= len;
    p.facingY /= len;
  } else {
    p.facingX = attackDir(state, p.team);
    p.facingY = 0;
  }
  p.stamina -= SPECIAL_STAMINA_COST;
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  p.chargeTicks = 0;
  p.action = 'leap';
  p.actionTimer = LEAP_BACK_TICKS + LEAP_FLY_TICKS;
  const backSpeed = (LEAP_BACK_DISTANCE / LEAP_BACK_TICKS) * TICK_HZ;
  p.vx = -p.facingX * backSpeed;
  p.vy = -p.facingY * backSpeed;
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  state.events.push({ type: 'leapStart', playerIdx: p.idx });
}

/**
 * One leap tick. The back-hop runs while the timer is above LEAP_FLY_TICKS; the flight follows, with z on a parabola that
 * peaks at LEAP_PEAK_Z and is 0 on landing. Input is ignored. The leap ends (and lands) when its timer runs out, or ends
 * quietly when the phase leaves play.
 */
function updateLeap(state: GameState, p: Player): void {
  if (state.match.phase !== 'play') {
    endLeap(p);
    return;
  }
  p.actionTimer--;
  // Flight tick n is 1..LEAP_FLY_TICKS; back-hop ticks are 0 or below.
  const flyTick = LEAP_FLY_TICKS - p.actionTimer;
  if (flyTick === 1) {
    const flySpeed = (LEAP_FLY_DISTANCE / LEAP_FLY_TICKS) * TICK_HZ;
    p.vx = p.facingX * flySpeed;
    p.vy = p.facingY * flySpeed;
    state.events.push({ type: 'leapFly', playerIdx: p.idx });
  }
  integrate(p);
  if (flyTick < 1) return;
  const t = Math.min(1, flyTick / LEAP_FLY_TICKS);
  p.z = 4 * LEAP_PEAK_Z * t * (1 - t);
  p.vz = 0;
  if (p.actionTimer <= 0) landLeap(state, p);
}

/** Back to normal on the spot, with no velocity and on the ground. Used when the phase leaves play. */
function endLeap(p: Player): void {
  p.z = 0;
  p.vz = 0;
  p.vx = 0;
  p.vy = 0;
  toNormal(p);
}

/**
 * Leap landing: every opponent within LEAP_RADIUS of his landing point that is not invincible is hit (see leapVictim).
 * The landing is reported before the hits.
 */
function landLeap(state: GameState, p: Player): void {
  endLeap(p);
  const victims = state.players.filter(
    (v) => v.team !== p.team && !isInvincible(v) && distance(p.x, p.y, v.x, v.y) <= LEAP_RADIUS,
  );
  state.events.push({
    type: 'leapLand',
    playerIdx: p.idx,
    x: p.x,
    y: p.y,
    victimIdxs: victims.map((v) => v.idx),
  });
  for (const v of victims) leapVictim(state, p, v);
}

/**
 * One leap victim: cancels a beam channel, loses LEAP_STAMINA_RATIO of maxStamina and is silenced for SILENCE_TICKS. Going
 * to zero stamina knocks him down (a down player keeps his timer). Otherwise he is stunned for HITSTUN_TICKS, unless he is
 * already down or recovering. He keeps any ball he holds.
 */
function leapVictim(state: GameState, p: Player, v: Player): void {
  reportCastCancel(state, v);
  v.chargeTicks = 0;
  const cost = LEAP_STAMINA_RATIO * v.maxStamina;
  v.stamina = Math.max(0, v.stamina - cost);
  v.silenceTicks = SILENCE_TICKS;

  let down = false;
  if (v.stamina <= 0) {
    if (v.action !== 'down') {
      setDown(v, DOWN_TICKS_EXHAUSTED);
      down = true;
    }
  } else if (v.action !== 'down' && v.action !== 'recover') {
    v.action = 'hitstun';
    v.actionTimer = HITSTUN_TICKS;
  }

  state.events.push({ type: 'hit', attackerIdx: p.idx, victimIdx: v.idx, kind: 'special', damage: cost });
  if (down) state.events.push({ type: 'down', playerIdx: v.idx });
}

/**
 * Guan Yu's ride (騎士衝擊): a constant-speed motorcycle dash of RIDE_DISTANCE along his facing (the attack direction when
 * he has none), with or without the ball. He is invincible for the whole dash and any ball stays at his feet.
 */
function startRide(state: GameState, p: Player): void {
  const len = Math.sqrt(p.facingX * p.facingX + p.facingY * p.facingY);
  if (len > 0) {
    p.facingX /= len;
    p.facingY /= len;
  } else {
    p.facingX = attackDir(state, p.team);
    p.facingY = 0;
  }
  p.stamina -= SPECIAL_STAMINA_COST;
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  p.chargeTicks = 0;
  p.rideHits = [];
  p.action = 'ride';
  p.actionTimer = RIDE_TICKS;
  p.vx = p.facingX * RIDE_SPEED;
  p.vy = p.facingY * RIDE_SPEED;
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  state.events.push({ type: 'rideStart', playerIdx: p.idx, dirX: p.facingX, dirY: p.facingY });
}

/**
 * One ride tick: the velocity stays fixed and input is ignored. After moving, the bike hits its lane (see rideHitLane).
 * A goal inside the mouth with the ball scores as a lunge does. The ride ends when its timer runs out, at the field edge,
 * or after a goal. When the phase leaves play it also ends (rideEnd is still reported, like a lunge).
 */
function updateRide(state: GameState, p: Player): void {
  if (state.match.phase !== 'play') {
    toNormal(p);
    state.events.push({ type: 'rideEnd', playerIdx: p.idx });
    return;
  }
  const nextX = p.x + p.vx * DT;
  const nextY = p.y + p.vy * DT;
  const atEdge = nextX < 0 || nextX > FIELD_W || nextY < 0 || nextY > FIELD_D;
  const side: 0 | 1 = attackDir(state, p.team) === 1 ? 1 : 0;
  const mouth = goalMouth(side);
  const onGoalLine = side === 1 ? nextX >= FIELD_W : nextX <= 0;
  const inMouth = nextY >= mouth.yMin + BALL_RADIUS && nextY <= mouth.yMax - BALL_RADIUS;
  integrate(p);
  p.actionTimer--;
  rideHitLane(state, p);
  if (onGoalLine && inMouth && state.ball.ownerIdx === p.idx) {
    ballIntoGoal(state, p, side, p.vx, p.vy);
    endRide(state, p);
  } else if (atEdge || p.actionTimer <= 0) {
    endRide(state, p);
  }
}

/** Back to normal play, with the ride speed scaled down to the player's normal top speed, keeping its direction. */
function endRide(state: GameState, p: Player): void {
  const maxSpeed = maxSpeedOf(state, p);
  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (speed > maxSpeed) {
    p.vx = (p.vx / speed) * maxSpeed;
    p.vy = (p.vy / speed) * maxSpeed;
  }
  toNormal(p);
  state.events.push({ type: 'rideEnd', playerIdx: p.idx });
}

/**
 * Bike hits: every opponent that is not down, recovering or invincible, and not hit yet this dash, is hit once when its
 * centre is within RIDE_LANE_HALF of the ride line and within the rider's radius + RIDE_CONTACT_PAD of him along the ride.
 */
function rideHitLane(state: GameState, p: Player): void {
  for (const v of state.players) {
    if (v.team === p.team || v.action === 'down' || v.action === 'recover' || isInvincible(v)) continue;
    if (p.rideHits.includes(v.idx)) continue;
    const dx = v.x - p.x;
    const dy = v.y - p.y;
    // Signed distance from the ride line, positive on the left of the ride direction (-facingY, facingX).
    const lateral = dy * p.facingX - dx * p.facingY;
    const along = dx * p.facingX + dy * p.facingY;
    if (Math.abs(lateral) > RIDE_LANE_HALF) continue;
    if (Math.abs(along) > p.radius + RIDE_CONTACT_PAD) continue;
    p.rideHits.push(v.idx);
    rideBump(state, p, v, lateral);
  }
}

/**
 * One ride victim: pushed away from the ride line and forward along the ride (a victim exactly on the line goes to the side
 * by idx parity), stunned or knocked down when his stamina empties, and loses the ride's stamina share. He drops the ball
 * if holding it, and a beam channel is cancelled.
 */
function rideBump(state: GameState, p: Player, v: Player, lateral: number): void {
  reportCastCancel(state, v);
  v.chargeTicks = 0;
  const side = lateral > 0 ? 1 : lateral < 0 ? -1 : v.idx % 2 === 0 ? 1 : -1;
  const massMult = Math.min(1.5, Math.max(0.7, p.mass / v.mass));
  const vx = (-p.facingY * side * RIDE_PUSH_SIDE + p.facingX * RIDE_PUSH_FORWARD) * massMult;
  const vy = (p.facingX * side * RIDE_PUSH_SIDE + p.facingY * RIDE_PUSH_FORWARD) * massMult;
  v.vx = vx;
  v.vy = vy;

  const cost = p.specialBumpPct !== null ? p.specialBumpPct * v.maxStamina : RAMPAGE_BUMP_STAMINA;
  v.stamina = Math.max(0, v.stamina - cost);
  let down = false;
  if (v.stamina <= 0) {
    setDown(v, DOWN_TICKS_EXHAUSTED);
    down = true;
  } else {
    v.action = 'hitstun';
    v.actionTimer = RIDE_HITSTUN_TICKS;
  }

  state.events.push({ type: 'hit', attackerIdx: p.idx, victimIdx: v.idx, kind: 'special', damage: cost });
  if (state.ball.ownerIdx === v.idx) {
    const len = Math.sqrt(vx * vx + vy * vy);
    knockLooseBall(state, p, v, vx / len, vy / len);
  }
  state.events.push({ type: 'rideHit', playerIdx: p.idx, victimIdx: v.idx, x: p.x, y: p.y });
  if (down) state.events.push({ type: 'down', playerIdx: v.idx });
}

/** Unit direction from (x, y) to the centre of the goal the team attacks. Falls back to the attack direction on the line. */
function aimAtGoalCentre(state: GameState, team: 0 | 1, x: number, y: number): { x: number; y: number } {
  const dx = opponentGoalX(state, team) - x;
  const dy = FIELD_D / 2 - y;
  const len = Math.sqrt(dx * dx + dy * dy);
  return len > 0 ? { x: dx / len, y: dy / len } : { x: attackDir(state, team), y: 0 };
}

/**
 * Zhuge Liang's beam (破魔光彈): the player turns to the goal, stands still and channels for BEAM_CAST_TICKS. The beam
 * strikes when the channel ends (see updateCast).
 */
function startBeamCast(state: GameState, p: Player): void {
  const aim = aimAtGoalCentre(state, p.team, p.x, p.y);
  p.facingX = aim.x;
  p.facingY = aim.y;
  p.stamina -= SPECIAL_STAMINA_COST;
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  p.chargeTicks = 0;
  p.vx = 0;
  p.vy = 0;
  p.action = 'cast';
  p.actionTimer = BEAM_CAST_TICKS;
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  state.events.push({ type: 'beamCharge', playerIdx: p.idx });
}

/**
 * One beam channel tick: the player stands still and ignores input. The channel ends in beamStrike when its timer runs
 * out. A hit interrupts it (see reportCastCancel), and it also ends back to normal if the phase leaves play.
 */
function updateCast(state: GameState, p: Player): void {
  if (state.match.phase !== 'play') {
    reportCastCancel(state, p);
    toNormal(p);
    return;
  }
  p.vx = 0;
  p.vy = 0;
  p.actionTimer--;
  if (p.actionTimer <= 0) beamStrike(state, p);
}

/** A channel that is cut short (the caster is hit, or the phase leaves play) reports beamCancel. Call before the action changes. */
function reportCastCancel(state: GameState, p: Player): void {
  if (p.action !== 'cast') return;
  state.events.push({ type: 'beamCancel', playerIdx: p.idx });
}

/**
 * The channel is done: the beam strikes one random opponent that is standing (not down or recovering) and not invincible.
 * With no such opponent nothing happens. The caster goes back to normal and keeps the ball.
 */
function beamStrike(state: GameState, p: Player): void {
  toNormal(p);
  const candidates = state.players.filter(
    (v) => v.team !== p.team && v.action !== 'down' && v.action !== 'recover' && !isInvincible(v),
  );
  if (candidates.length === 0) return;
  const victim = candidates[rngInt(state, candidates.length)];
  state.events.push({ type: 'beamStrike', playerIdx: p.idx, victimIdx: victim.idx });
  beamStrikeVictim(state, p, victim);
}

/** One beam victim: knocked away from the caster, down for DOWN_TICKS_KNOCKED, loses a share of stamina, drops the ball if holding it. */
function beamStrikeVictim(state: GameState, p: Player, v: Player): void {
  reportCastCancel(state, v);
  const dist = distance(p.x, p.y, v.x, v.y);
  const dirX = dist > 0 ? (v.x - p.x) / dist : p.facingX;
  const dirY = dist > 0 ? (v.y - p.y) / dist : p.facingY;
  const knock = (KNOCKBACK_SPEED * p.mass) / v.mass;
  v.vx = dirX * knock;
  v.vy = dirY * knock;
  v.vz = HIT_VZ;
  v.chargeTicks = 0;
  const damage = BEAM_STRIKE_STAMINA_RATIO * v.maxStamina;
  v.stamina = Math.max(0, v.stamina - damage);
  setDown(v, DOWN_TICKS_KNOCKED);

  state.events.push({ type: 'hit', attackerIdx: p.idx, victimIdx: v.idx, kind: 'special', damage });
  state.events.push({ type: 'down', playerIdx: v.idx });
  if (state.ball.ownerIdx === v.idx) knockLooseBall(state, p, v, dirX, dirY);
}

/**
 * Ma Chao's summon (西涼鐵騎): the player keeps the ball and SUMMON_RIDERS riders appear on a circle around him, starting
 * behind him. Each rider charges a different opponent where possible. The riders are moved by updateRiders.
 */
function startSummon(state: GameState, p: Player): void {
  p.stamina -= SPECIAL_STAMINA_COST;
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  state.events.push({ type: 'summonStart', playerIdx: p.idx, x: p.x, y: p.y });

  const baseAngle = Math.atan2(-p.facingY, -p.facingX);
  const claimed: number[] = [];
  for (let i = 0; i < SUMMON_RIDERS; i++) {
    const angle = baseAngle + (i * 2 * Math.PI) / SUMMON_RIDERS;
    const x = Math.min(FIELD_W, Math.max(0, p.x + Math.cos(angle) * RIDER_SPAWN_RADIUS));
    const y = Math.min(FIELD_D, Math.max(0, p.y + Math.sin(angle) * RIDER_SPAWN_RADIUS));
    const rider: Rider = {
      // Unique per summon: one summon per tick at most, and every rider of it gets its own slot.
      id: state.tick * SUMMON_RIDERS + i,
      team: p.team,
      ownerIdx: p.idx,
      x,
      y,
      vx: 0,
      vy: 0,
      facingX: p.facingX,
      targetIdx: -1,
      slot: i,
      wanderAngle: rngNext(state) * 2 * Math.PI,
      wanderTicks: RIDER_WANDER_TICKS,
      ticksLeft: SUMMON_TICKS,
      hit: [],
    };
    rider.targetIdx = pickRiderTarget(state, rider, claimed);
    if (rider.targetIdx !== -1) claimed.push(rider.targetIdx);
    // Starts at full speed toward its aim point (or in its roaming direction when there is no target).
    const heading = riderHeading(state, rider);
    rider.vx = heading.x * RIDER_SPEED;
    rider.vy = heading.y * RIDER_SPEED;
    state.riders.push(rider);
    state.events.push({ type: 'riderSpawn', riderId: rider.id, x, y });
  }
}

/**
 * Unit direction the rider steers along. With a target it aims at the target plus a lateral offset to the side of the
 * rider's slot (the offset shrinks as the rider closes in), so riders curve in from different sides. Without one it
 * follows the roaming direction.
 */
function riderHeading(state: GameState, r: Rider): { x: number; y: number } {
  if (r.targetIdx !== -1) {
    const t = state.players[r.targetIdx];
    const dx = t.x - r.x;
    const dy = t.y - r.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      const side = r.slot % 2 === 0 ? 1 : -1;
      const lateral =
        side * (1 + r.slot * RIDER_LATERAL_SLOT_GROWTH) * Math.min(RIDER_LATERAL_MAX, dist * RIDER_LATERAL_RATIO);
      const perpX = -dy / dist;
      const perpY = dx / dist;
      const aimX = t.x + perpX * lateral - r.x;
      const aimY = t.y + perpY * lateral - r.y;
      const aimLen = Math.sqrt(aimX * aimX + aimY * aimY);
      if (aimLen > 0) return { x: aimX / aimLen, y: aimY / aimLen };
    }
  }
  return { x: Math.cos(r.wanderAngle), y: Math.sin(r.wanderAngle) };
}

/** A rider may charge a player that is an opponent, standing, not invincible, and not already knocked down by it. */
function isRiderTargetOk(v: Player, r: Rider): boolean {
  return v.team !== r.team && v.action !== 'down' && !isInvincible(v) && !r.hit.includes(v.idx);
}

/**
 * Nearest valid opponent to the rider (ties: lowest idx), skipping the idxs in `claimed`. If every valid opponent is
 * claimed, the nearest valid one is returned anyway. -1 if no opponent is valid.
 */
function pickRiderTarget(state: GameState, r: Rider, claimed: number[]): number {
  let best = -1;
  let bestDist = Infinity;
  for (const v of state.players) {
    if (!isRiderTargetOk(v, r) || claimed.includes(v.idx)) continue;
    const d = distance(r.x, r.y, v.x, v.y);
    if (d < bestDist) {
      best = v.idx;
      bestDist = d;
    }
  }
  if (best !== -1 || claimed.length === 0) return best;
  return pickRiderTarget(state, r, []);
}

/**
 * One tick for every rider in play: steer toward its target (re-picking when the target is no longer valid), move and
 * bounce off the field edges, knock down the first opponents it touches, and vanish when its timer runs out.
 * Riders never collide with players, cannot be hit, and do not touch the ball except through a knocked-down carrier.
 */
export function updateRiders(state: GameState): void {
  separateRiders(state.riders);
  state.riders = state.riders.filter((r) => {
    advanceRider(state, r);
    r.ticksLeft--;
    if (r.ticksLeft > 0) return true;
    state.events.push({ type: 'riderEnd', riderId: r.id, x: r.x, y: r.y });
    return false;
  });
}

/** Pushes every pair of riders closer than RIDER_SEPARATION_DIST apart in velocity, harder the closer they are. */
function separateRiders(riders: Rider[]): void {
  for (let i = 0; i < riders.length; i++) {
    for (let j = i + 1; j < riders.length; j++) {
      const a = riders[i];
      const b = riders[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= RIDER_SEPARATION_DIST) continue;
      // Exactly on top of each other: split along x, so the push is still defined.
      const nx = dist > 0 ? dx / dist : 1;
      const ny = dist > 0 ? dy / dist : 0;
      const push = RIDER_SEPARATION_ACCEL * (1 - dist / RIDER_SEPARATION_DIST) * DT;
      a.vx -= nx * push;
      a.vy -= ny * push;
      b.vx += nx * push;
      b.vy += ny * push;
    }
  }
}

/** Opponents already targeted by the other riders, so a rider can prefer a different one. */
function claimedTargets(state: GameState, r: Rider): number[] {
  const claimed: number[] = [];
  for (const o of state.riders) {
    if (o !== r && o.targetIdx !== -1) claimed.push(o.targetIdx);
  }
  return claimed;
}

function advanceRider(state: GameState, r: Rider): void {
  const current = r.targetIdx !== -1 ? state.players[r.targetIdx] : null;
  if (current === null || !isRiderTargetOk(current, r)) {
    r.targetIdx = pickRiderTarget(state, r, claimedTargets(state, r));
  }
  if (r.targetIdx === -1) {
    r.wanderTicks--;
    if (r.wanderTicks <= 0) {
      r.wanderAngle = rngNext(state) * 2 * Math.PI;
      r.wanderTicks = RIDER_WANDER_TICKS;
    }
  }
  const heading = riderHeading(state, r);
  r.vx += (heading.x * RIDER_SPEED - r.vx) * RIDER_TURN;
  r.vy += (heading.y * RIDER_SPEED - r.vy) * RIDER_TURN;

  r.x += r.vx * DT;
  r.y += r.vy * DT;
  if (r.x < 0) {
    r.x = 0;
    r.vx = Math.abs(r.vx);
  } else if (r.x > FIELD_W) {
    r.x = FIELD_W;
    r.vx = -Math.abs(r.vx);
  }
  if (r.y < 0) {
    r.y = 0;
    r.vy = Math.abs(r.vy);
  } else if (r.y > FIELD_D) {
    r.y = FIELD_D;
    r.vy = -Math.abs(r.vy);
  }
  if (r.vx > 0) r.facingX = 1;
  else if (r.vx < 0) r.facingX = -1;

  const owner = state.players[r.ownerIdx];
  for (const v of state.players) {
    if (v.team === r.team || v.action === 'down' || isInvincible(v) || r.hit.includes(v.idx)) continue;
    if (distance(r.x, r.y, v.x, v.y) >= RIDER_HIT_RADIUS + v.radius) continue;
    riderKnockDown(state, r, owner, v);
  }
}

/**
 * A rider knocks an opponent down with the same special hit a pierce uses, knocked away along the rider's direction.
 * The hit takes the summoner's bump share of the victim's maxStamina (SPECIAL_HIT_STAMINA when he has none).
 * A carrier loses the ball, credited to the summoner as the last touch.
 */
function riderKnockDown(state: GameState, r: Rider, owner: Player, v: Player): void {
  const speed = Math.sqrt(r.vx * r.vx + r.vy * r.vy);
  const dirX = speed > 0 ? r.vx / speed : r.facingX;
  const dirY = speed > 0 ? r.vy / speed : 0;
  r.hit.push(v.idx);
  const cost = owner.specialBumpPct !== null ? owner.specialBumpPct * v.maxStamina : SPECIAL_HIT_STAMINA;
  applySpecialHit(state, owner, v, 'pierce', dirX, dirY, cost);
  if (state.ball.ownerIdx === v.idx) knockLooseBall(state, owner, v, dirX, dirY);
  state.events.push({ type: 'riderHit', riderId: r.id, victimIdx: v.idx, x: r.x, y: r.y });
}

/** Removes every rider, emitting riderEnd for each. Called when the phase leaves play. */
export function clearRiders(state: GameState): void {
  for (const r of state.riders) {
    state.events.push({ type: 'riderEnd', riderId: r.id, x: r.x, y: r.y });
  }
  state.riders = [];
}

/** Counts the special cooldown down while the match is in play. */
function tickSpecialCooldown(state: GameState, p: Player): void {
  if (p.specialCooldown > 0 && state.match.phase === 'play') p.specialCooldown--;
}

/**
 * Zhang Fei's roar: a shockwave centred ROAR_FORWARD in front of the player. Every standing opponent in the circle
 * (rampaging ones are immune) is knocked away from the roarer and stunned. The roarer keeps any ball it has. A ball that
 * was free when the roar fired and lies in the circle is knocked away too (see roarBall).
 */
function castRoar(state: GameState, p: Player): void {
  p.stamina = Math.max(0, p.stamina - SPECIAL_STAMINA_COST);
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  toNormal(p);
  const cx = p.x + p.facingX * ROAR_FORWARD;
  const cy = p.y + p.facingY * ROAR_FORWARD;
  // Taken before the victims are knocked: a carrier dropped by this roar is not a free ball for it.
  const ballFree = state.ball.ownerIdx === -1;
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  state.events.push({ type: 'roar', playerIdx: p.idx, x: cx, y: cy, radius: ROAR_RADIUS });
  for (const v of state.players) {
    if (v.team === p.team || v.action === 'down' || isInvincible(v)) continue;
    if (distance(cx, cy, v.x, v.y) > ROAR_RADIUS) continue;
    roarKnock(state, p, v);
  }
  if (ballFree) roarBall(state, p, cx, cy);
}

/**
 * The roar's hit on a free ball whose x, y lies in the circle, at any height. A special shot ends (specialEnd). A tiger
 * ball held in Xu Chu's mouth is left alone; one in flight is cleared. The ball leaves the roarer at ROAR_BALL_SPEED,
 * launched upward at ROAR_BALL_VZ, and the roarer is credited with the last touch.
 */
function roarBall(state: GameState, p: Player, cx: number, cy: number): void {
  const b = state.ball;
  if (b.tiger?.phase === 'hold') return;
  if (distance(cx, cy, b.x, b.y) > ROAR_RADIUS) return;
  b.tiger = null;
  if (b.special !== null) {
    b.special = null;
    state.events.push({ type: 'specialEnd' });
  }
  const dist = distance(p.x, p.y, b.x, b.y);
  const dirX = dist > 0 ? (b.x - p.x) / dist : p.facingX;
  const dirY = dist > 0 ? (b.y - p.y) / dist : p.facingY;
  b.vx = dirX * ROAR_BALL_SPEED;
  b.vy = dirY * ROAR_BALL_SPEED;
  b.vz = ROAR_BALL_VZ;
  b.lastTouchIdx = p.idx;
  state.events.push({ type: 'roarBall', playerIdx: p.idx, x: b.x, y: b.y });
}

/** One roar victim: pushed away from the roarer, stunned, loses stamina (down when empty), drops the ball if holding it. */
function roarKnock(state: GameState, p: Player, v: Player): void {
  reportCastCancel(state, v);
  const dist = distance(p.x, p.y, v.x, v.y);
  const dirX = dist > 0 ? (v.x - p.x) / dist : p.facingX;
  const dirY = dist > 0 ? (v.y - p.y) / dist : p.facingY;
  const massMult = Math.min(1.4, Math.max(0.8, p.mass / v.mass));
  v.vx = dirX * ROAR_KNOCK_SPEED * massMult;
  v.vy = dirY * ROAR_KNOCK_SPEED * massMult;
  v.vz = ROAR_VZ;
  v.chargeTicks = 0;
  v.stamina = Math.max(0, v.stamina - ROAR_STAMINA);

  let down = false;
  if (v.stamina <= 0) {
    setDown(v, DOWN_TICKS_EXHAUSTED);
    down = true;
  } else {
    v.action = 'hitstun';
    v.actionTimer = ROAR_STUN_TICKS;
  }

  state.events.push({ type: 'hit', attackerIdx: p.idx, victimIdx: v.idx, kind: 'special', damage: ROAR_STAMINA });
  if (down) state.events.push({ type: 'down', playerIdx: v.idx });

  if (state.ball.ownerIdx === v.idx) knockLooseBall(state, p, v, dirX, dirY);
}

/**
 * Zhang Liao's fear (遼來了): an instant cast, with or without the ball. Every opponent within FEAR_RADIUS that is not
 * invincible is feared (see fearVictim). The caster keeps any ball it has.
 */
function castFear(state: GameState, p: Player): void {
  p.stamina = Math.max(0, p.stamina - SPECIAL_STAMINA_COST);
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  toNormal(p);
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  const victimIdxs: number[] = [];
  for (const v of state.players) {
    if (v.team === p.team || isInvincible(v)) continue;
    if (distance(p.x, p.y, v.x, v.y) > FEAR_RADIUS) continue;
    fearVictim(state, p, v);
    victimIdxs.push(v.idx);
  }
  state.events.push({ type: 'fear', playerIdx: p.idx, victimIdxs });
}

/**
 * One fear victim: cancels a beam channel, loses a share of stamina, drops the ball if holding it. Going to zero stamina
 * knocks him down (a down player keeps his timer). Otherwise he is feared for FEAR_TICKS, unless he is already down or recovering.
 */
function fearVictim(state: GameState, p: Player, v: Player): void {
  reportCastCancel(state, v);
  const dist = distance(p.x, p.y, v.x, v.y);
  const dirX = dist > 0 ? (v.x - p.x) / dist : p.facingX;
  const dirY = dist > 0 ? (v.y - p.y) / dist : p.facingY;
  v.chargeTicks = 0;
  v.stamina = Math.max(0, v.stamina - FEAR_STAMINA_RATIO * v.maxStamina);
  if (state.ball.ownerIdx === v.idx) knockLooseBall(state, p, v, dirX, dirY);

  if (v.stamina <= 0) {
    if (v.action !== 'down') {
      setDown(v, DOWN_TICKS_EXHAUSTED);
      state.events.push({ type: 'down', playerIdx: v.idx });
    }
    return;
  }
  if (v.action === 'down' || v.action === 'recover') return;
  v.vx = 0;
  v.vy = 0;
  v.vz = 0;
  v.action = 'fear';
  v.actionTimer = FEAR_TICKS;
}

/** Feared: standing still, ignoring input, until the fear timer ends and he returns to normal. */
function updateFear(p: Player): void {
  p.vx = 0;
  p.vy = 0;
  p.actionTimer--;
  if (p.actionTimer <= 0) toNormal(p);
}

/**
 * Xu Chu's tiger guard (惡虎吞天): an instant cast, with or without the ball. He keeps acting normally while the guard runs
 * (see step.ts for the swallow and the spat ball). Any ball he holds stays at his feet.
 */
function startTiger(state: GameState, p: Player): void {
  p.stamina -= SPECIAL_STAMINA_COST;
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  p.chargeTicks = 0;
  p.tigerTicks = TIGER_GUARD_TICKS;
  p.action = 'normal';
  p.actionTimer = 0;
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  state.events.push({ type: 'tigerStart', playerIdx: p.idx });
}

/** Counts the tiger guard down. When it runs out without a swallow (the swallow sets it to 0 first), Xu Chu roars. */
function tickTiger(state: GameState, p: Player): void {
  if (p.tigerTicks === 0) return;
  p.tigerTicks--;
  if (p.tigerTicks === 0) tigerRoar(state, p);
}

/**
 * Expiry roar: every opponent that is standing and not invincible, within TIGER_ROAR_RADIUS of Xu Chu and in front of him
 * (along his attack direction), is knocked back and loses a share of stamina. Going to zero stamina knocks him down,
 * otherwise he is stunned for HITSTUN_TICKS. A holder drops the ball.
 */
function tigerRoar(state: GameState, p: Player): void {
  const dir = attackDir(state, p.team);
  const victims = state.players.filter(
    (v) =>
      v.team !== p.team &&
      v.action !== 'down' &&
      !isInvincible(v) &&
      (v.x - p.x) * dir >= 0 &&
      distance(p.x, p.y, v.x, v.y) <= TIGER_ROAR_RADIUS,
  );
  state.events.push({ type: 'tigerRoar', playerIdx: p.idx, victimIdxs: victims.map((v) => v.idx) });
  for (const v of victims) tigerRoarKnock(state, p, v);
}

/** One expiry-roar victim: knocked away from Xu Chu like a roar victim, with the tiger roar's stamina share. */
function tigerRoarKnock(state: GameState, p: Player, v: Player): void {
  reportCastCancel(state, v);
  const dist = distance(p.x, p.y, v.x, v.y);
  const dirX = dist > 0 ? (v.x - p.x) / dist : attackDir(state, p.team);
  const dirY = dist > 0 ? (v.y - p.y) / dist : 0;
  const massMult = Math.min(1.4, Math.max(0.8, p.mass / v.mass));
  v.vx = dirX * ROAR_KNOCK_SPEED * massMult;
  v.vy = dirY * ROAR_KNOCK_SPEED * massMult;
  v.vz = ROAR_VZ;
  v.chargeTicks = 0;
  const cost = TIGER_ROAR_STAMINA_RATIO * v.maxStamina;
  v.stamina = Math.max(0, v.stamina - cost);

  let down = false;
  if (v.stamina <= 0) {
    setDown(v, DOWN_TICKS_EXHAUSTED);
    down = true;
  } else {
    v.action = 'hitstun';
    v.actionTimer = HITSTUN_TICKS;
  }

  state.events.push({ type: 'hit', attackerIdx: p.idx, victimIdx: v.idx, kind: 'special', damage: cost });
  if (down) state.events.push({ type: 'down', playerIdx: v.idx });
  if (state.ball.ownerIdx === v.idx) knockLooseBall(state, p, v, dirX, dirY);
}

/**
 * One spat-ball victim (see step.ts): loses TIGER_BALL_STAMINA_RATIO of maxStamina, is knocked along the ball's direction,
 * and is stunned for TIGER_STUN_TICKS. Going to zero stamina knocks him down instead.
 */
export function tigerBallHit(state: GameState, tiger: Player, v: Player, dirX: number, dirY: number): void {
  reportCastCancel(state, v);
  v.chargeTicks = 0;
  const cost = TIGER_BALL_STAMINA_RATIO * v.maxStamina;
  v.stamina = Math.max(0, v.stamina - cost);

  const knock = (KNOCKBACK_SPEED * tiger.mass) / v.mass;
  v.vx = dirX * knock;
  v.vy = dirY * knock;
  v.vz = HIT_VZ;

  let down = false;
  if (v.stamina <= 0) {
    setDown(v, DOWN_TICKS_EXHAUSTED);
    down = true;
  } else {
    v.action = 'hitstun';
    v.actionTimer = TIGER_STUN_TICKS;
  }

  state.events.push({ type: 'hit', attackerIdx: tiger.idx, victimIdx: v.idx, kind: 'special', damage: cost });
  if (down) state.events.push({ type: 'down', playerIdx: v.idx });
}

/**
 * Ends every tiger guard (silently, no roar) and any tiger ball when the phase leaves play. Called from step after the
 * match phase is updated.
 */
export function endTigerWindows(state: GameState): void {
  for (const p of state.players) {
    if (p.tigerTicks === 0) continue;
    p.tigerTicks = 0;
    state.events.push({ type: 'tigerEnd', playerIdx: p.idx });
  }
  state.ball.tiger = null;
}

/**
 * Cao Cao's slash (霸刀連斬): an instant cast, with or without the ball. He keeps full control while the buff runs (see
 * tickSlash), so he is not in a special action. Any ball he holds stays at his feet.
 */
function startSlash(state: GameState, p: Player): void {
  p.stamina -= SPECIAL_STAMINA_COST;
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  p.chargeTicks = 0;
  p.slashTicks = SLASH_TICKS;
  p.action = 'normal';
  p.actionTimer = 0;
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  state.events.push({ type: 'slashStart', playerIdx: p.idx });
}

/** Actions in which a slash swing cannot fire: he is stunned, down, or locked into a special. */
const SLASH_BLOCKED_ACTIONS: ReadonlySet<PlayerAction> = new Set<PlayerAction>([
  'down',
  'recover',
  'hitstun',
  'fear',
  'dive',
  'cast',
  'lunge',
  'leap',
  'ride',
]);

/**
 * Counts the slash buff down and runs a swing every SLASH_INTERVAL ticks from SLASH_FIRST_DELAY after the cast. A swing that
 * falls while he cannot act (see SLASH_BLOCKED_ACTIONS) is lost; the timer keeps running. He may swing during a punch, tackle,
 * charge or kick. The buff ends when its timer runs out.
 */
function tickSlash(state: GameState, p: Player): void {
  if (p.slashTicks === 0) return;
  p.slashTicks--;
  const elapsed = SLASH_TICKS - p.slashTicks;
  const due = elapsed >= SLASH_FIRST_DELAY && (elapsed - SLASH_FIRST_DELAY) % SLASH_INTERVAL === 0;
  if (due && !SLASH_BLOCKED_ACTIONS.has(p.action)) swingSlash(state, p);
  if (p.slashTicks === 0) state.events.push({ type: 'slashEnd', playerIdx: p.idx });
}

/**
 * One swing: emits slashSwing along the wave direction, a melee punch hit on every opponent in front of him, then one blade
 * wave. He keeps moving and any ball he holds.
 */
function swingSlash(state: GameState, p: Player): void {
  const aim = slashAim(state, p);
  state.events.push({ type: 'slashSwing', playerIdx: p.idx, dirX: aim.dirX, dirY: aim.dirY });
  meleeSlash(state, p, aim.side);
  fireBladeWave(state, p, aim.dirX, aim.dirY);
}

/**
 * The swing's melee: every opponent that is standing and not invincible, within SLASH_MELEE_REACH px of his front edge on the
 * side (+1 or -1) he faces and within SLASH_MELEE_HALF_DEPTH px vertically, takes a normal punch hit.
 */
function meleeSlash(state: GameState, p: Player, side: number): void {
  const victims = state.players.filter((v) => {
    if (v.team === p.team || v.action === 'down' || v.action === 'recover' || isInvincible(v)) return false;
    const ahead = (v.x - p.x) * side;
    if (ahead <= 0 || Math.abs(v.y - p.y) > SLASH_MELEE_HALF_DEPTH) return false;
    return ahead - p.radius - v.radius <= SLASH_MELEE_REACH;
  });
  for (const v of victims) applyHit(state, p, v, 'punch');
}

/**
 * The facing side for a swing (the sign of facingX, or his attack direction when facingX is 0) and the blade wave's direction:
 * toward the nearest opponent that is not down or recovering and is on that side. With no such opponent it points straight to
 * that side.
 */
function slashAim(state: GameState, p: Player): { side: number; dirX: number; dirY: number } {
  const side = p.facingX !== 0 ? Math.sign(p.facingX) : attackDir(state, p.team);
  let target: Player | null = null;
  let targetDist = Infinity;
  for (const v of state.players) {
    if (v.team === p.team || v.action === 'down' || v.action === 'recover') continue;
    if ((v.x - p.x) * side <= 0) continue;
    const d = distance(p.x, p.y, v.x, v.y);
    if (d < targetDist) {
      target = v;
      targetDist = d;
    }
  }
  if (target === null) return { side, dirX: side, dirY: 0 };
  return {
    side,
    dirX: (target.x - p.x) / targetDist,
    dirY: (target.y - p.y) / targetDist,
  };
}

/** One blade wave from his position flying along (dirX, dirY). */
function fireBladeWave(state: GameState, p: Player, dirX: number, dirY: number): void {
  // One fire per player per tick, so this id is unique among the waves in play.
  const wave: BladeWave = {
    id: state.tick * state.players.length + p.idx,
    ownerIdx: p.idx,
    team: p.team,
    x: p.x,
    y: p.y,
    dirX,
    dirY,
    travelled: 0,
  };
  state.waves.push(wave);
  state.events.push({ type: 'slashWave', playerIdx: p.idx, waveId: wave.id, x: wave.x, y: wave.y, dirX, dirY });
}

/**
 * One tick for every blade wave in play: it flies on, hits the first opponent whose body circle it touches (skipping
 * invincible, down and recovering players), and ends on that hit or when it has flown SLASH_WAVE_RANGE.
 */
export function updateBladeWaves(state: GameState): void {
  state.waves = state.waves.filter((w) => advanceBladeWave(state, w));
}

/** Moves one blade wave. Returns false on the tick it ends (its end event is already pushed). */
function advanceBladeWave(state: GameState, w: BladeWave): boolean {
  const step = SLASH_WAVE_SPEED * DT;
  w.x += w.dirX * step;
  w.y += w.dirY * step;
  w.travelled += step;
  const victim = state.players.find(
    (v) =>
      v.team !== w.team &&
      v.action !== 'down' &&
      v.action !== 'recover' &&
      !isInvincible(v) &&
      distance(w.x, w.y, v.x, v.y) < v.radius,
  );
  if (victim !== undefined) {
    slashVictim(state, state.players[w.ownerIdx], victim);
    state.events.push({ type: 'slashWaveEnd', waveId: w.id, x: w.x, y: w.y, hitIdx: victim.idx });
    return false;
  }
  if (w.travelled >= SLASH_WAVE_RANGE) {
    state.events.push({ type: 'slashWaveEnd', waveId: w.id, x: w.x, y: w.y, hitIdx: -1 });
    return false;
  }
  return true;
}

/**
 * One blade wave hit: cancels a beam channel, loses SLASH_DAMAGE_RATIO of maxStamina and is stunned for SLASH_HITSTUN_TICKS.
 * Going to zero stamina knocks him down instead. He keeps any ball he holds. The caster restores SLASH_HEAL_RATIO of his own
 * maxStamina, capped at maxStamina.
 */
function slashVictim(state: GameState, p: Player, v: Player): void {
  reportCastCancel(state, v);
  v.chargeTicks = 0;
  const cost = SLASH_DAMAGE_RATIO * v.maxStamina;
  v.stamina = Math.max(0, v.stamina - cost);

  let down = false;
  if (v.stamina <= 0) {
    setDown(v, DOWN_TICKS_EXHAUSTED);
    down = true;
  } else {
    v.action = 'hitstun';
    v.actionTimer = SLASH_HITSTUN_TICKS;
  }

  state.events.push({ type: 'hit', attackerIdx: p.idx, victimIdx: v.idx, kind: 'special', damage: cost });
  if (down) state.events.push({ type: 'down', playerIdx: v.idx });

  const before = p.stamina;
  p.stamina = Math.min(p.maxStamina, p.stamina + SLASH_HEAL_RATIO * p.maxStamina);
  state.events.push({ type: 'slashHeal', playerIdx: p.idx, amount: p.stamina - before });
}

/**
 * Ends every slash buff (emitting slashEnd) and clears every blade wave (each reported as a miss) when the phase leaves
 * play. Called from step after the match phase is updated.
 */
export function endSlashWindows(state: GameState): void {
  for (const p of state.players) {
    if (p.slashTicks === 0) continue;
    p.slashTicks = 0;
    state.events.push({ type: 'slashEnd', playerIdx: p.idx });
  }
  for (const w of state.waves) {
    state.events.push({ type: 'slashWaveEnd', waveId: w.id, x: w.x, y: w.y, hitIdx: -1 });
  }
  state.waves = [];
}

/**
 * Zhen Ji's icefield (冰雨招來): an instant cast, with or without the ball. The field is fixed at her cast point and does not
 * move with her. She keeps acting normally, and any ball she holds stays at her feet.
 */
function startIcefield(state: GameState, p: Player): void {
  p.stamina -= SPECIAL_STAMINA_COST;
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  const fieldId = state.nextIceId++;
  state.iceFields.push({ id: fieldId, ownerIdx: p.idx, team: p.team, x: p.x, y: p.y, ticks: 0 });
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  state.events.push({ type: 'iceStart', playerIdx: p.idx, fieldId, x: p.x, y: p.y, radius: ICE_RADIUS });
}

/**
 * One tick for every ice field in play: counts it up, pulses on every ICE_DOT_INTERVAL-th tick after the cast, and ends it
 * once ICE_TICKS have passed (the last pulse fires on that same tick, before the end).
 */
export function updateIcefields(state: GameState): void {
  if (state.match.phase !== 'play') return;
  for (const f of state.iceFields) {
    f.ticks++;
    if (f.ticks % ICE_DOT_INTERVAL === 0) icePulse(state, f);
  }
  const ended = state.iceFields.filter((f) => f.ticks >= ICE_TICKS);
  if (ended.length === 0) return;
  state.iceFields = state.iceFields.filter((f) => f.ticks < ICE_TICKS);
  for (const f of ended) state.events.push({ type: 'iceEnd', fieldId: f.id });
}

/**
 * One pulse of an ice field: every standing opponent inside ICE_RADIUS that is not invincible loses ICE_DOT_RATIO of his
 * maxStamina. Emptying his stamina knocks him down. No knockback, no hitstun, and a ball holder keeps the ball.
 */
function icePulse(state: GameState, f: IceField): void {
  const victimIdxs: number[] = [];
  for (const v of state.players) {
    if (v.team === f.team || v.action === 'down' || isInvincible(v)) continue;
    if (distance(f.x, f.y, v.x, v.y) > ICE_RADIUS) continue;
    const cost = ICE_DOT_RATIO * v.maxStamina;
    v.stamina = Math.max(0, v.stamina - cost);
    victimIdxs.push(v.idx);
    state.events.push({ type: 'hit', attackerIdx: f.ownerIdx, victimIdx: v.idx, kind: 'special', damage: cost });
    if (v.stamina <= 0) {
      setDown(v, DOWN_TICKS_EXHAUSTED);
      state.events.push({ type: 'down', playerIdx: v.idx });
    }
  }
  state.events.push({ type: 'icePulse', fieldId: f.id, victimIdxs });
}

/** Ends every ice field (the phase left play). */
export function endIcefields(state: GameState): void {
  for (const f of state.iceFields) state.events.push({ type: 'iceEnd', fieldId: f.id });
  state.iceFields = [];
}

/**
 * Xiao Qiao's 吹飛 (櫻花龍捲): an instant cast, with or without the ball. The gust point is fixed at the cast: the nearest
 * standing opponent on her facing side within GUST_TARGET_RANGE (his position now, not following him). With none in reach it
 * is GUST_FALLBACK_DIST straight ahead, clamped to the field. She keeps acting normally.
 */
function startGust(state: GameState, p: Player): void {
  p.stamina -= SPECIAL_STAMINA_COST;
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  const attack = attackDir(state, p.team);
  const side = p.facingX !== 0 ? Math.sign(p.facingX) : attack;
  let target: Player | null = null;
  let bestDist = Infinity;
  for (const v of state.players) {
    if (v.team === p.team || v.action === 'down' || v.action === 'recover') continue;
    if ((v.x - p.x) * side <= 0) continue;
    const d = distance(p.x, p.y, v.x, v.y);
    if (d <= GUST_TARGET_RANGE && d < bestDist) {
      target = v;
      bestDist = d;
    }
  }

  let x: number;
  let y: number;
  if (target !== null) {
    x = target.x;
    y = target.y;
  } else {
    const len = Math.sqrt(p.facingX * p.facingX + p.facingY * p.facingY);
    const ux = len === 0 ? attack : p.facingX / len;
    const uy = len === 0 ? 0 : p.facingY / len;
    x = Math.min(FIELD_W, Math.max(0, p.x + ux * GUST_FALLBACK_DIST));
    y = Math.min(FIELD_D, Math.max(0, p.y + uy * GUST_FALLBACK_DIST));
  }

  const gustId = state.nextGustId++;
  state.gusts.push({ id: gustId, ownerIdx: p.idx, team: p.team, x, y, ticks: 0 });
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  state.events.push({ type: 'gustMark', playerIdx: p.idx, gustId, x, y, radius: GUST_RADIUS });
}

/**
 * One tick for every pending gust in play: counts it up, and erupts it once GUST_DELAY_TICKS have passed since the cast.
 * Runs before the actions, so the eruption is the first thing a victim's tick sees.
 */
export function updateGusts(state: GameState): void {
  if (state.match.phase !== 'play') return;
  for (const g of state.gusts) g.ticks++;
  const ready = state.gusts.filter((g) => g.ticks >= GUST_DELAY_TICKS);
  if (ready.length === 0) return;
  state.gusts = state.gusts.filter((g) => g.ticks < GUST_DELAY_TICKS);
  for (const g of ready) gustBlow(state, g);
}

/**
 * The gust erupts: every standing, non-invincible opponent within GUST_RADIUS of its point is launched. Victims are handled
 * in index order, so the events are deterministic.
 */
function gustBlow(state: GameState, g: Gust): void {
  const caster = state.players[g.ownerIdx];
  const victimIdxs: number[] = [];
  for (const v of state.players) {
    if (v.team === g.team || v.action === 'down' || v.action === 'recover' || isInvincible(v)) continue;
    if (distance(g.x, g.y, v.x, v.y) > GUST_RADIUS) continue;
    launchGustVictim(state, g, caster, v);
    victimIdxs.push(v.idx);
  }
  state.events.push({ type: 'gustBlow', gustId: g.id, x: g.x, y: g.y, victimIdxs });
}

/**
 * A gust victim loses GUST_STAMINA_RATIO of his maxStamina, is pushed away from the gust point and launched: he is airborne
 * for LAUNCH_AIR_TICKS, then lies down until GUST_LAUNCH_TICKS. An emptied victim stays down for the longer exhausted
 * time. A ball he holds is knocked loose by the caster.
 */
function launchGustVictim(state: GameState, g: Gust, caster: Player, v: Player): void {
  reportCastCancel(state, v);
  v.chargeTicks = 0;

  let dirX = v.x - g.x;
  let dirY = v.y - g.y;
  const len = Math.sqrt(dirX * dirX + dirY * dirY);
  if (len === 0) {
    dirX = attackDir(state, g.team);
    dirY = 0;
  } else {
    dirX /= len;
    dirY /= len;
  }
  v.vx = dirX * GUST_PUSH_SPEED;
  v.vy = dirY * GUST_PUSH_SPEED;
  v.vz = GUST_LAUNCH_VZ;
  const damage = GUST_STAMINA_RATIO * v.maxStamina;
  v.stamina = Math.max(0, v.stamina - damage);
  setDown(v, v.stamina <= 0 ? Math.max(GUST_LAUNCH_TICKS, DOWN_TICKS_EXHAUSTED) : GUST_LAUNCH_TICKS);

  state.events.push({ type: 'hit', attackerIdx: g.ownerIdx, victimIdx: v.idx, kind: 'special', damage });
  if (state.ball.ownerIdx === v.idx) knockLooseBall(state, caster, v, dirX, dirY);
  state.events.push({ type: 'down', playerIdx: v.idx });
}

/** Clears every pending gust without an eruption (the phase left play). */
export function endGusts(state: GameState): void {
  for (const g of state.gusts) state.events.push({ type: 'gustEnd', gustId: g.id });
  state.gusts = [];
}

/**
 * Sun Ce's sail (揚帆起航): an instant cast, with or without the ball. He keeps acting normally (moving at SAIL_SPEED_MULT,
 * dribbling, shooting and passing) and is invincible until the sail ends (see updateSails and endSail).
 */
function startSail(state: GameState, p: Player): void {
  p.stamina -= SPECIAL_STAMINA_COST;
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  p.sailTicks = SAIL_TICKS;
  p.action = 'normal';
  p.actionTimer = 0;
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  state.events.push({ type: 'sailStart', playerIdx: p.idx });
}

/** Counts the sail down while the phase is play. It ends on its last tick. */
function tickSail(state: GameState, p: Player): void {
  if (p.sailTicks === 0 || state.match.phase !== 'play') return;
  p.sailTicks--;
  if (p.sailTicks === 0) endSail(state, p);
}

/** True if v's body touches the sail hull: a box of SAIL_HALF_LEN x SAIL_HALF_DEPTH centred on the sailor, grown by v's radius. */
function touchesSail(sailor: Player, v: Player): boolean {
  return Math.abs(v.x - sailor.x) <= SAIL_HALF_LEN + v.radius && Math.abs(v.y - sailor.y) <= SAIL_HALF_DEPTH + v.radius;
}

/**
 * Sail contacts, run after the actions. Only in play. A sailor who is down or in hitstun ends his sail (a guard: an invincible
 * sailor is not normally hit). Otherwise the first opponent that is not invincible, down or recovering and touches the hull is
 * launched and the sail ends (sailCrash). With no crash and no passenger yet, the first teammate touching the hull boards.
 */
export function updateSails(state: GameState): void {
  if (state.match.phase !== 'play') return;
  for (const p of state.players) {
    if (p.sailTicks === 0) continue;
    if (p.action === 'down' || p.action === 'hitstun') {
      endSail(state, p);
      continue;
    }
    const victim = state.players.find(
      (v) =>
        v.team !== p.team && v.action !== 'down' && v.action !== 'recover' && !isInvincible(v) && touchesSail(p, v),
    );
    if (victim !== undefined) {
      sailCrash(state, p, victim);
      continue;
    }
    if (p.sailPassenger !== -1) continue;
    const mate = state.players.find(
      (v) =>
        v.team === p.team &&
        v.idx !== p.idx &&
        v.action !== 'down' &&
        v.action !== 'recover' &&
        v.sailPassengerOf === -1 &&
        touchesSail(p, v),
    );
    if (mate !== undefined) boardSail(state, p, mate);
  }
}

/**
 * The hull launches an opponent: he is knocked down for SAIL_LAUNCH_TICKS, flies away from the sailor (SAIL_LAUNCH_SPEED,
 * SAIL_LAUNCH_VZ up) and loses no stamina. A ball he holds is knocked loose. The sail ends right after.
 */
function sailCrash(state: GameState, sailor: Player, v: Player): void {
  state.events.push({ type: 'sailCrash', playerIdx: sailor.idx, victimIdx: v.idx, x: v.x, y: v.y });
  reportCastCancel(state, v);
  v.chargeTicks = 0;

  let dirX = v.x - sailor.x;
  let dirY = v.y - sailor.y;
  const len = Math.sqrt(dirX * dirX + dirY * dirY);
  if (len === 0) {
    dirX = sailor.facingX;
    dirY = sailor.facingY;
  } else {
    dirX /= len;
    dirY /= len;
  }
  v.vx = dirX * SAIL_LAUNCH_SPEED;
  v.vy = dirY * SAIL_LAUNCH_SPEED;
  v.vz = SAIL_LAUNCH_VZ;
  const damage = SAIL_CRASH_STAMINA_RATIO * v.maxStamina;
  v.stamina = Math.max(0, v.stamina - damage);
  // Airborne for LAUNCH_AIR_TICKS, down for the whole time; an emptied victim stays down for the longer exhausted time.
  setDown(v, v.stamina <= 0 ? Math.max(SAIL_LAUNCH_TICKS, DOWN_TICKS_EXHAUSTED) : SAIL_LAUNCH_TICKS);

  state.events.push({ type: 'hit', attackerIdx: sailor.idx, victimIdx: v.idx, kind: 'special', damage });
  if (state.ball.ownerIdx === v.idx) knockLooseBall(state, sailor, v, dirX, dirY);
  state.events.push({ type: 'down', playerIdx: v.idx });
  endSail(state, sailor);
}

/** A teammate boards the sail: he stops, is placed by carryPassengers, and is invincible until the sail ends. */
function boardSail(state: GameState, sailor: Player, mate: Player): void {
  reportCastCancel(state, mate);
  mate.chargeTicks = 0;
  if (mate.rampageTicks > 0) endRampage(state, mate);
  mate.action = 'normal';
  mate.actionTimer = 0;
  mate.vx = 0;
  mate.vy = 0;
  mate.vz = 0;
  mate.z = 0;
  mate.sailPassengerOf = sailor.idx;
  sailor.sailPassenger = mate.idx;
  state.events.push({ type: 'sailBoard', playerIdx: sailor.idx, passengerIdx: mate.idx });
}

/** Each passenger is set just behind his sailor (SAIL_PASSENGER_BEHIND, against the facing) after the tick's pushes. */
export function carryPassengers(state: GameState): void {
  for (const mate of state.players) {
    if (mate.sailPassengerOf === -1) continue;
    const sailor = state.players[mate.sailPassengerOf];
    mate.x = sailor.x - sailor.facingX * SAIL_PASSENGER_BEHIND;
    mate.y = sailor.y;
    mate.vx = 0;
    mate.vy = 0;
    clampPlayerToField(mate);
  }
}

/**
 * Ends a sail for any reason: the sailor is no longer invincible, and his passenger (if any) is released at his position
 * to normal play. Callers only call this for a sailing player.
 */
function endSail(state: GameState, sailor: Player): void {
  sailor.sailTicks = 0;
  state.events.push({ type: 'sailEnd', playerIdx: sailor.idx });
  if (sailor.sailPassenger === -1) return;
  const mate = state.players[sailor.sailPassenger];
  sailor.sailPassenger = -1;
  mate.sailPassengerOf = -1;
  mate.action = 'normal';
  mate.actionTimer = 0;
  state.events.push({ type: 'sailDrop', playerIdx: sailor.idx, passengerIdx: mate.idx });
}

/** Ends every sail (the phase left play). Silent apart from sailEnd and sailDrop: no crash, no launch. */
export function endSails(state: GameState): void {
  for (const p of state.players) {
    if (p.sailTicks > 0) endSail(state, p);
  }
}

/** Clears a rampage and reports it. Callers only call this while the player is rampaging. */
export function endRampage(state: GameState, p: Player): void {
  p.rampageTicks = 0;
  state.events.push({ type: 'rampageEnd', playerIdx: p.idx });
}

/**
 * Counts down bump cooldowns and the rampage. A rampage also ends when its owner loses the ball or the phase leaves play.
 * A no-ball special's rampage (specialNoBall) does not end for lack of the ball: only its timer or the phase ends it.
 */
function tickRampage(state: GameState, p: Player): void {
  if (p.bumpCooldown > 0) p.bumpCooldown--;
  if (p.rampageTicks === 0) return;
  p.rampageTicks--;
  const holding = state.match.phase === 'play' && state.ball.ownerIdx === p.idx;
  if (holding && rampageAtGoalMouth(state, p)) {
    const side: 0 | 1 = attackDir(state, p.team) === 1 ? 1 : 0;
    endRampage(state, p);
    ballIntoGoal(state, p, side, attackDir(state, p.team) * maxSpeedOf(state, p), 0);
    return;
  }
  const ends = p.specialNoBall
    ? state.match.phase !== 'play' || p.rampageTicks === 0
    : !holding || p.rampageTicks === 0;
  if (ends) endRampage(state, p);
}

/** True if the rampager stands on the goal line he attacks (the field clamp stops him there), inside the mouth. */
function rampageAtGoalMouth(state: GameState, p: Player): boolean {
  const side: 0 | 1 = attackDir(state, p.team) === 1 ? 1 : 0;
  const mouth = goalMouth(side);
  const onGoalLine = side === 1 ? p.x >= FIELD_W : p.x <= 0;
  return onGoalLine && p.y >= mouth.yMin + BALL_RADIUS && p.y <= mouth.yMax - BALL_RADIUS;
}

/** Ball leaves the owner. The ball keeps its current (dribble) position. */
function releaseBall(state: GameState, p: Player, vx: number, vy: number, vz: number): void {
  const ball = state.ball;
  ball.ownerIdx = -1;
  ball.lastTouchIdx = p.idx;
  ball.vx = vx;
  ball.vy = vy;
  ball.vz = vz;
  p.noTouchTicks = KICK_NO_TOUCH;
  p.action = 'recover';
  p.actionTimer = KICK_RECOVER_TICKS;
}

/** Launch speed of a special shot's ball, per kind. */
export function specialSpeed(kind: SpecialKind): number {
  switch (kind) {
    case 'straight':
      return SPECIAL_STRAIGHT_SPEED;
    case 'zigzag':
      return SPECIAL_ZIGZAG_SPEED;
    case 'lob':
      return SPECIAL_LOB_SPEED;
    case 'pierce':
      return SPECIAL_PIERCE_SPEED;
    case 'beam':
      return BEAM_SPEED;
  }
}

/** Flight time of a lob from launch to landing: rising at GRAVITY, falling at GRAVITY * fall multiplier. */
function lobFlightTime(): number {
  const up = SPECIAL_LOB_VZ / GRAVITY;
  const apex = (SPECIAL_LOB_VZ * SPECIAL_LOB_VZ) / (2 * GRAVITY);
  return up + Math.sqrt((2 * apex) / (GRAVITY * SPECIAL_LOB_FALL_GRAVITY_MULT));
}

/** Horizontal speed that brings a lob down LOB_OVERSHOOT past the goal line, `dist` away along the shot. */
function lobSpeed(dist: number): number {
  return Math.min(LOB_MAX_SPEED, Math.max(LOB_MIN_SPEED, (dist + LOB_OVERSHOOT) / lobFlightTime()));
}

function startSpecial(state: GameState, p: Player): void {
  const ball = state.ball;
  const goalX = opponentGoalX(state, p.team);
  const dx = goalX - ball.x;
  const dy = FIELD_D / 2 - ball.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const dirX = len > 0 ? dx / len : attackDir(state, p.team);
  const dirY = len > 0 ? dy / len : 0;
  const speed = p.specialKind === 'lob' ? lobSpeed(len) : specialSpeed(p.specialKind);

  p.stamina = Math.max(0, p.stamina - SPECIAL_STAMINA_COST);
  releaseBall(state, p, dirX * speed, dirY * speed, p.specialKind === 'lob' ? SPECIAL_LOB_VZ : 0);
  const special: SpecialShot = {
    kind: p.specialKind,
    shooterIdx: p.idx,
    team: p.team,
    ticks: 0,
    dirX,
    dirY,
    speed,
    hit: [],
    rolled: [],
  };
  ball.special = special;
  state.events.push({ type: 'specialShot', playerIdx: p.idx, kind: p.specialKind });
}

function shoot(state: GameState, p: Player, input: InputFrame, charge: number): void {
  const ball = state.ball;
  const goalX = opponentGoalX(state, p.team);
  const aimY =
    FIELD_D / 2 +
    input.moveY * SHOT_AIM_OFFSET_Y +
    (rngNext(state) * 2 - 1) * (11 - p.stats.technique) * SHOT_AIM_SPREAD;
  const targetZ = 6 + rngNext(state) * (GOAL_H - 10);

  const speed = SHOT_BASE_SPEED + p.stats.power * SHOT_SPEED_PER_POWER + charge * SHOT_SPEED_PER_CHARGE;
  const dx = goalX - ball.x;
  const dy = aimY - ball.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ux = dist > 0 ? dx / dist : attackDir(state, p.team);
  const uy = dist > 0 ? dy / dist : 0;
  const t = dist / speed;
  const vz = Math.min(SHOT_MAX_VZ, targetZ / t + 0.5 * GRAVITY * t);

  releaseBall(state, p, ux * speed, uy * speed, vz);
  state.events.push({ type: 'kick', playerIdx: p.idx, kind: 'shot', targetIdx: -1 });
}

function kickClear(state: GameState, p: Player): void {
  // Inside its own area a player clearing toward its own goal is mirrored up-field instead.
  const backward = p.facingX * attackDir(state, p.team) < 0;
  const dirX = backward && inOwnArea(state, p) ? -p.facingX : p.facingX;
  releaseBall(state, p, dirX * CLEAR_SPEED, p.facingY * CLEAR_SPEED, CLEAR_VZ);
  state.events.push({ type: 'kick', playerIdx: p.idx, kind: 'clear', targetIdx: -1 });
}

/**
 * Teammate for a pass: a teammate who called for the ball (callPassTicks > 0) wins regardless of facing
 * (highest callPassTicks, ties: lowest idx). Otherwise prefers the nearest one in front (cos > 0.3),
 * else nearest overall. -1 if none.
 */
export function choosePassTarget(state: GameState, p: Player): number {
  let callIdx = -1;
  let callTicks = 0;
  for (const t of state.players) {
    if (t.team !== p.team || t.idx === p.idx || t.action === 'down') continue;
    if (t.callPassTicks > callTicks) {
      callIdx = t.idx;
      callTicks = t.callPassTicks;
    }
  }
  if (callIdx !== -1) return callIdx;

  let frontIdx = -1;
  let frontScore = Infinity;
  let anyIdx = -1;
  let anyScore = Infinity;
  for (const t of state.players) {
    if (t.team !== p.team || t.idx === p.idx || t.action === 'down') continue;
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const cos = dist > 0 ? (dx * p.facingX + dy * p.facingY) / dist : 0;
    const score = dist * (2 - cos);
    if (cos > PASS_CONE_COS && score < frontScore) {
      frontIdx = t.idx;
      frontScore = score;
    }
    if (score < anyScore) {
      anyIdx = t.idx;
      anyScore = score;
    }
  }
  return frontIdx !== -1 ? frontIdx : anyIdx;
}

function passBall(state: GameState, p: Player): void {
  const idx = choosePassTarget(state, p);
  if (idx === -1) return;
  const target = state.players[idx];
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Lead the target: aim where it will be, assuming it keeps its current velocity.
  const lead = (dist / PASS_SPEED_GUESS) * 0.5;
  const aimX = target.x + target.vx * lead - p.x;
  const aimY = target.y + target.vy * lead - p.y;
  const aimLen = Math.sqrt(aimX * aimX + aimY * aimY);
  const ux = aimLen > 0 ? aimX / aimLen : p.facingX;
  const uy = aimLen > 0 ? aimY / aimLen : p.facingY;

  if (dist <= PASS_LOB_DIST) {
    const speed = Math.min(380, Math.max(160, 120 + dist * 1.2));
    releaseBall(state, p, ux * speed, uy * speed, PASS_GROUND_VZ);
  } else {
    const t = dist / PASS_LOB_SPEED;
    releaseBall(state, p, ux * PASS_LOB_SPEED, uy * PASS_LOB_SPEED, Math.min(PASS_LOB_MAX_VZ, 0.5 * GRAVITY * t));
  }
  state.events.push({ type: 'kick', playerIdx: p.idx, kind: 'pass', targetIdx: idx });
}

/**
 * Special-ball hit: stamina cost `cost` (default SPECIAL_HIT_STAMINA); pierce knocks down, other kinds hitstun.
 * Knockback follows the ball's direction.
 */
export function applySpecialHit(
  state: GameState,
  shooter: Player,
  victim: Player,
  kind: SpecialKind,
  dirX: number,
  dirY: number,
  cost: number = SPECIAL_HIT_STAMINA,
): void {
  if (isInvincible(victim)) return;
  reportCastCancel(state, victim);
  victim.stamina = Math.max(0, victim.stamina - cost);
  victim.chargeTicks = 0;

  const knock = (KNOCKBACK_SPEED * shooter.mass) / victim.mass;
  victim.vx = dirX * knock;
  victim.vy = dirY * knock;
  victim.vz = HIT_VZ;

  let down = false;
  if (victim.stamina <= 0) {
    setDown(victim, DOWN_TICKS_EXHAUSTED);
    down = true;
  } else if (kind === 'pierce') {
    setDown(victim, DOWN_TICKS_KNOCKED);
    down = true;
  } else {
    victim.action = 'hitstun';
    victim.actionTimer = HITSTUN_TICKS;
  }

  state.events.push({
    type: 'hit',
    attackerIdx: shooter.idx,
    victimIdx: victim.idx,
    kind: 'special',
    damage: cost,
  });
  if (down) state.events.push({ type: 'down', playerIdx: victim.idx });
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

/** Invincible players (rampaging, lunging, leaping, riding, or on or aboard a sail) cannot be hit, tackled, stolen from, roared at, or pierced by a special. */
export function isInvincible(p: Player): boolean {
  return (
    p.rampageTicks > 0 ||
    p.action === 'lunge' ||
    p.action === 'leap' ||
    p.action === 'ride' ||
    p.sailTicks > 0 ||
    p.sailPassengerOf !== -1
  );
}

/**
 * Each invincible attacker (rampaging or lunging) knocks away every standing opponent that is not invincible and not on
 * bump cooldown, whose circle is within RAMPAGE_BUMP_PAD of its own. Runs after the actions, before collisions.
 */
export function applyRampageBumps(state: GameState): void {
  for (const r of state.players) {
    // A leap hits only on landing (see landLeap), a ride hits only its lane (see rideHitLane), and a sail only through
    // updateSails (a sailor or passenger does not bump), so none of them bump here.
    if (!isInvincible(r) || r.action === 'leap' || r.action === 'ride' || r.sailTicks > 0 || r.sailPassengerOf !== -1) continue;
    for (const o of state.players) {
      if (o.team === r.team || o.action === 'down' || o.bumpCooldown > 0 || isInvincible(o)) continue;
      const dx = o.x - r.x;
      const dy = o.y - r.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= r.radius + o.radius + RAMPAGE_BUMP_PAD) continue;
      rampageBump(state, r, o, dist);
    }
  }
}

function rampageBump(state: GameState, rampager: Player, victim: Player, dist: number): void {
  reportCastCancel(state, victim);
  const dirX = dist > 0 ? (victim.x - rampager.x) / dist : rampager.facingX;
  const dirY = dist > 0 ? (victim.y - rampager.y) / dist : rampager.facingY;
  const massMult = Math.min(1.5, Math.max(0.7, rampager.mass / victim.mass));
  victim.vx = dirX * RAMPAGE_BUMP_SPEED * massMult;
  victim.vy = dirY * RAMPAGE_BUMP_SPEED * massMult;
  victim.vz = RAMPAGE_BUMP_VZ;
  victim.bumpCooldown = RAMPAGE_BUMP_COOLDOWN;
  const cost = rampager.specialBumpPct !== null ? rampager.specialBumpPct * victim.maxStamina : RAMPAGE_BUMP_STAMINA;
  victim.stamina = Math.max(0, victim.stamina - cost);

  // Sent flying: always knocked down (longer when it empties his stamina).
  setDown(victim, victim.stamina <= 0 ? DOWN_TICKS_EXHAUSTED : DOWN_TICKS_KNOCKED);

  state.events.push({
    type: 'hit',
    attackerIdx: rampager.idx,
    victimIdx: victim.idx,
    kind: 'special',
    damage: cost,
  });
  state.events.push({ type: 'down', playerIdx: victim.idx });
  if (rampager.action === 'lunge') lungeHeal(state, rampager);
}

/** A lunge bump restores Zhao Yun LUNGE_HEAL_RATIO of his own maxStamina, capped at maxStamina. */
function lungeHeal(state: GameState, p: Player): void {
  const before = p.stamina;
  p.stamina = Math.min(p.maxStamina, p.stamina + LUNGE_HEAL_RATIO * p.maxStamina);
  state.events.push({ type: 'lungeHeal', playerIdx: p.idx, amount: p.stamina - before });
}

/**
 * One hit on a victim. Does not touch attacker.hitDone: a punch or tackle sets it itself, so a slash swing (which also calls
 * this) cannot cancel an attack that has not landed yet.
 */
function applyHit(state: GameState, attacker: Player, victim: Player, kind: AttackKind): void {
  // An invincible victim (rampaging or lunging): the attack is spent and nothing else changes.
  if (isInvincible(victim)) return;
  reportCastCancel(state, victim);
  victim.chargeTicks = 0;

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

  if (state.ball.ownerIdx === victim.idx) knockLooseBall(state, attacker, victim, dirX, dirY);

  if (down) state.events.push({ type: 'down', playerIdx: victim.idx });
}

/** A hit knocks the ball out of the victim's control, launched along the hit direction. */
export function knockLooseBall(state: GameState, attacker: Player, victim: Player, dirX: number, dirY: number): void {
  const ball = state.ball;
  ball.ownerIdx = -1;
  // The attacker's hit is the last touch, so a knock-in (even into the victim's own goal) is credited to the attacker.
  ball.lastTouchIdx = attacker.idx;
  ball.vx = dirX * LOOSE_BALL_SPEED + (rngNext(state) * 2 - 1) * LOOSE_BALL_SPREAD;
  ball.vy = dirY * LOOSE_BALL_SPEED + (rngNext(state) * 2 - 1) * LOOSE_BALL_SPREAD;
  ball.vz = LOOSE_BALL_VZ;
  victim.noTouchTicks = LOOSE_BALL_NO_TOUCH;
  state.events.push({ type: 'looseBall', playerIdx: victim.idx });
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
