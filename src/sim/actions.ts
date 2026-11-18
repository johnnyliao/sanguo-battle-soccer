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
  FLYKICK_SPEED,
  GETUP_STAMINA_RATIO,
  GK_DIVE_RECOVER_TICKS,
  GK_DIVE_SPEED,
  GK_DIVE_TICKS,
  GOAL_H,
  GRAVITY,
  HITSTUN_TICKS,
  JUMP_VZ,
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
  RECOVER_TICKS,
  SHOT_BASE_SPEED,
  SHOT_SPEED_PER_CHARGE,
  SHOT_SPEED_PER_POWER,
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
const AIR_CONTROL = 0.05;
const HIT_VZ = 80;
const LOOSE_BALL_SPEED = 90;
const LOOSE_BALL_SPREAD = 30;
const LOOSE_BALL_VZ = 120;
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
    case 'dive':
      updateDive(p);
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

  if (ownsBall) {
    if (input.k && !p.prevInput.k) {
      passBall(state, p);
      integrate(p);
      return;
    }
    if (input.j && !p.prevInput.j) {
      p.action = 'charge';
      p.chargeTicks = 0;
      moveCharging(p, input);
      return;
    }
  }

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
    if (p.role === 'GK' && inOwnArea(state, p)) {
      startDive(state, p, input);
      return;
    }
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
  state.events.push({ type: 'jump', playerIdx: p.idx });
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

/** Ball-carrier charging a shot: slow movement, no dash, no stamina regen. Releasing J shoots. */
function updateCharge(state: GameState, p: Player, input: InputFrame): void {
  if (state.ball.ownerIdx !== p.idx) {
    p.chargeTicks = 0;
    toNormal(p);
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

/** Picks the shot type on J release: special (full charge, stamina, toward goal), shot (toward goal), else clear. */
function releaseCharge(state: GameState, p: Player, input: InputFrame): void {
  const full = p.chargeTicks >= CHARGE_FULL;
  const charge = Math.min(p.chargeTicks, CHARGE_FULL - 1);
  p.chargeTicks = 0;
  const towardGoal = p.facingX * attackDir(state, p.team) > 0;
  if (full && towardGoal && p.stamina >= SPECIAL_STAMINA_COST) {
    startSpecial(state, p);
  } else if (towardGoal) {
    shoot(state, p, input, charge);
  } else {
    kickClear(state, p);
  }
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

function startSpecial(state: GameState, p: Player): void {
  const ball = state.ball;
  const goalX = opponentGoalX(state, p.team);
  const dx = goalX - ball.x;
  const dy = FIELD_D / 2 - ball.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const dirX = len > 0 ? dx / len : attackDir(state, p.team);
  const dirY = len > 0 ? dy / len : 0;
  const speed = specialSpeed(p.specialKind);

  p.stamina -= SPECIAL_STAMINA_COST;
  releaseBall(state, p, dirX * speed, dirY * speed, p.specialKind === 'lob' ? SPECIAL_LOB_VZ : 0);
  const special: SpecialShot = {
    kind: p.specialKind,
    shooterIdx: p.idx,
    team: p.team,
    ticks: 0,
    dirX,
    dirY,
    hit: [],
    rolled: [],
  };
  ball.special = special;
  state.events.push({ type: 'special', playerIdx: p.idx, kind: p.specialKind, name: p.specialName });
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
  releaseBall(state, p, p.facingX * CLEAR_SPEED, p.facingY * CLEAR_SPEED, CLEAR_VZ);
  state.events.push({ type: 'kick', playerIdx: p.idx, kind: 'clear', targetIdx: -1 });
}

/** Teammate for a pass: prefers the nearest one in front (cos > 0.3), else nearest overall. -1 if none. */
export function choosePassTarget(state: GameState, p: Player): number {
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

function applyHit(state: GameState, attacker: Player, victim: Player, kind: AttackKind): void {
  attacker.hitDone = true;
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
