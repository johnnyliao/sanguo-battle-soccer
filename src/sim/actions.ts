import type { SpecialKind } from '../data/types';
import {
  CALL_PASS_TICKS,
  CHARGE_FULL,
  CHARGE_MOVE_MULT,
  DASH_MULT,
  DASH_STAMINA_COST,
  DOWN_TICKS_EXHAUSTED,
  DOWN_TICKS_KNOCKED,
  DT,
  FIELD_D,
  FIELD_W,
  GETUP_STAMINA_RATIO,
  GK_DIVE_RECOVER_TICKS,
  GK_DIVE_SPEED,
  GK_DIVE_TICKS,
  GOAL_H,
  GRAVITY,
  HITSTUN_TICKS,
  KICK_NO_TOUCH,
  KICK_RECOVER_TICKS,
  KNOCKBACK_SPEED,
  LOOSE_BALL_NO_TOUCH,
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
  RAMPAGE_BUMP_SPEED,
  RAMPAGE_BUMP_STAMINA,
  RAMPAGE_SPEED_MULT,
  RAMPAGE_TICKS,
  RECOVER_TICKS,
  ROAR_FORWARD,
  ROAR_KNOCK_SPEED,
  ROAR_RADIUS,
  ROAR_STAMINA,
  ROAR_STUN_TICKS,
  SHOT_BASE_SPEED,
  SHOT_SPEED_PER_CHARGE,
  SHOT_SPEED_PER_POWER,
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
  TACKLE_SPEED_MULT,
  TACKLE_TICKS,
} from './constants';
import { attackDir, inOwnArea, opponentGoalX } from './field';
import { rngNext } from './rng';
import {
  type AttackKind,
  type GameState,
  type InputFrame,
  type Player,
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
const RAMPAGE_BUMP_VZ = 90;
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
  if (p.callPassTicks > 0) p.callPassTicks--;
  applyGravity(p);
  tickRampage(state, p);
  tickSpecialCooldown(state, p);
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

function maxSpeedOf(p: Player): number {
  return PLAYER_BASE_SPEED + p.stats.speed * PLAYER_SPEED_PER_STAT;
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

  trySpecial(state, p, input);

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
  const baseSpeed = maxSpeedOf(p);

  if (ownsBall) {
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
      moveCharging(p, input);
      return;
    }
  }

  if (input.k && !p.prevInput.k) {
    p.callPassTicks = CALL_PASS_TICKS;
    state.events.push({ type: 'callPass', playerIdx: p.idx });
  }

  if (input.j && !p.prevInput.j && !ownsBall) {
    if (dashHeld) {
      startAttack(state, p, 'tackle', TACKLE_TICKS);
      p.vx = p.facingX * baseSpeed * TACKLE_SPEED_MULT;
      p.vy = p.facingY * baseSpeed * TACKLE_SPEED_MULT;
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

  const maxSpeed = rampaging
    ? baseSpeed * RAMPAGE_SPEED_MULT
    : dashHeld
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
  moveCharging(p, input);
}

function moveCharging(p: Player, input: InputFrame): void {
  const dir = inputDir(input);
  if (dir.x !== 0 || dir.y !== 0) {
    p.facingX = dir.x;
    p.facingY = dir.y;
  }
  const maxSpeed = maxSpeedOf(p) * CHARGE_MOVE_MULT;
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
 * L press: starts the special if it is ready (cooldown 0, enough stamina). A rampage needs the ball and starts at once;
 * a roar (Zhang Fei) works with or without it. Returns true if the special started.
 */
function trySpecial(state: GameState, p: Player, input: InputFrame): boolean {
  if (!input.l || p.prevInput.l) return false;
  if (p.specialCooldown > 0 || p.stamina < SPECIAL_STAMINA_COST) return false;
  if (p.specialMode === 'roar') {
    castRoar(state, p);
    return true;
  }
  if (state.ball.ownerIdx !== p.idx) return false;
  startRampage(state, p);
  return true;
}

/** Special L with the ball: the player keeps the ball and rampages. The special ball flies on the next J press. */
function startRampage(state: GameState, p: Player): void {
  p.stamina -= SPECIAL_STAMINA_COST;
  p.rampageTicks = RAMPAGE_TICKS;
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  p.action = 'normal';
  p.actionTimer = 0;
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  state.events.push({ type: 'rampageStart', playerIdx: p.idx });
}

/** Counts the special cooldown down while the match is in play. */
function tickSpecialCooldown(state: GameState, p: Player): void {
  if (p.specialCooldown > 0 && state.match.phase === 'play') p.specialCooldown--;
}

/**
 * Zhang Fei's roar: a shockwave centred ROAR_FORWARD in front of the player. Every standing opponent in the circle
 * (rampaging ones are immune) is knocked away from the roarer and stunned. The roarer keeps any ball it has.
 */
function castRoar(state: GameState, p: Player): void {
  p.stamina = Math.max(0, p.stamina - SPECIAL_STAMINA_COST);
  p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
  toNormal(p);
  const cx = p.x + p.facingX * ROAR_FORWARD;
  const cy = p.y + p.facingY * ROAR_FORWARD;
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
  state.events.push({ type: 'roar', playerIdx: p.idx, x: cx, y: cy, radius: ROAR_RADIUS });
  for (const v of state.players) {
    if (v.team === p.team || v.action === 'down' || v.rampageTicks > 0) continue;
    if (distance(cx, cy, v.x, v.y) > ROAR_RADIUS) continue;
    roarKnock(state, p, v);
  }
}

/** One roar victim: pushed away from the roarer, stunned, loses stamina (down when empty), drops the ball if holding it. */
function roarKnock(state: GameState, p: Player, v: Player): void {
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

/** Clears a rampage and reports it. Callers only call this while the player is rampaging. */
export function endRampage(state: GameState, p: Player): void {
  p.rampageTicks = 0;
  state.events.push({ type: 'rampageEnd', playerIdx: p.idx });
}

/** Counts down bump cooldowns and the rampage. A rampage also ends when its owner loses the ball or the phase leaves play. */
function tickRampage(state: GameState, p: Player): void {
  if (p.bumpCooldown > 0) p.bumpCooldown--;
  if (p.rampageTicks === 0) return;
  p.rampageTicks--;
  const holding = state.match.phase === 'play' && state.ball.ownerIdx === p.idx;
  if (!holding || p.rampageTicks === 0) endRampage(state, p);
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

/** Special-ball hit: flat stamina cost; pierce knocks down, other kinds hitstun. Knockback follows the ball's direction. */
export function applySpecialHit(
  state: GameState,
  shooter: Player,
  victim: Player,
  kind: SpecialKind,
  dirX: number,
  dirY: number,
): void {
  if (victim.rampageTicks > 0) return;
  victim.stamina = Math.max(0, victim.stamina - SPECIAL_HIT_STAMINA);
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
    damage: SPECIAL_HIT_STAMINA,
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

/**
 * Each rampaging player knocks away every standing opponent that is not rampaging and not on bump cooldown,
 * whose circle is within RAMPAGE_BUMP_PAD of its own. Runs after the actions, before collisions.
 */
export function applyRampageBumps(state: GameState): void {
  for (const r of state.players) {
    if (r.rampageTicks === 0) continue;
    for (const o of state.players) {
      if (o.team === r.team || o.action === 'down' || o.bumpCooldown > 0 || o.rampageTicks > 0) continue;
      const dx = o.x - r.x;
      const dy = o.y - r.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= r.radius + o.radius + RAMPAGE_BUMP_PAD) continue;
      rampageBump(state, r, o, dist);
    }
  }
}

function rampageBump(state: GameState, rampager: Player, victim: Player, dist: number): void {
  const dirX = dist > 0 ? (victim.x - rampager.x) / dist : rampager.facingX;
  const dirY = dist > 0 ? (victim.y - rampager.y) / dist : rampager.facingY;
  const massMult = Math.min(1.5, Math.max(0.7, rampager.mass / victim.mass));
  victim.vx = dirX * RAMPAGE_BUMP_SPEED * massMult;
  victim.vy = dirY * RAMPAGE_BUMP_SPEED * massMult;
  victim.vz = RAMPAGE_BUMP_VZ;
  victim.bumpCooldown = RAMPAGE_BUMP_COOLDOWN;
  victim.stamina = Math.max(0, victim.stamina - RAMPAGE_BUMP_STAMINA);

  let down = false;
  if (victim.stamina <= 0) {
    setDown(victim, DOWN_TICKS_EXHAUSTED);
    down = true;
  } else {
    victim.action = 'hitstun';
    victim.actionTimer = HITSTUN_TICKS;
  }

  state.events.push({
    type: 'hit',
    attackerIdx: rampager.idx,
    victimIdx: victim.idx,
    kind: 'special',
    damage: RAMPAGE_BUMP_STAMINA,
  });
  if (down) state.events.push({ type: 'down', playerIdx: victim.idx });
}

function applyHit(state: GameState, attacker: Player, victim: Player, kind: AttackKind): void {
  attacker.hitDone = true;
  // A rampaging victim is invincible: the attack is spent and nothing else changes.
  if (victim.rampageTicks > 0) return;
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
function knockLooseBall(state: GameState, attacker: Player, victim: Player, dirX: number, dirY: number): void {
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
