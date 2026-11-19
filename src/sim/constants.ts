export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

export const FIELD_W = 1200;
export const FIELD_D = 260;

export const GOAL_HALF_W = 40;
export const GOAL_H = 36;
export const GOAL_DEPTH = 24;

export const BALL_RADIUS = 4;
export const GRAVITY = 600;
export const BALL_BOUNCE = 0.5;
export const WALL_BOUNCE = 0.6;
export const BALL_GROUND_FRICTION = 2.0;
export const BALL_AIR_DRAG = 0.2;
export const BALL_STOP_SPEED = 3;

export const PLAYER_BASE_SPEED = 60;
export const PLAYER_SPEED_PER_STAT = 8;
export const DASH_MULT = 1.5;
export const PLAYER_ACCEL = 10;

export const PICKUP_REACH = 6;
export const PICKUP_MAX_Z = 20;
export const DRIBBLE_OFFSET = 4;

export const PLAYER_GRAVITY = 900;
export const STAMINA_BASE = 40;
export const STAMINA_PER_STAT = 6;
export const STAMINA_REGEN = 4;
export const DASH_STAMINA_COST = 6;
export const DOWN_TICKS_EXHAUSTED = 150;
export const DOWN_TICKS_KNOCKED = 60;
export const GETUP_STAMINA_RATIO = 0.5;
export const HITSTUN_TICKS = 18;
export const KNOCKBACK_SPEED = 160;
export const PUNCH_TICKS = 14;
export const PUNCH_ACTIVE_FROM = 4;
export const PUNCH_ACTIVE_TO = 8;
export const PUNCH_RANGE = 8;
export const PUNCH_HIT_RADIUS = 10;
export const TACKLE_TICKS = 24;
export const TACKLE_SPEED_MULT = 1.6;
export const RECOVER_TICKS = 12;
export const CALL_PASS_TICKS = 45;
export const LOOSE_BALL_NO_TOUCH = 30;
export const CHARGE_FULL = 60;
export const CHARGE_MOVE_MULT = 0.4;
export const SPECIAL_STAMINA_COST = 20;
export const KICK_NO_TOUCH = 15;
export const KICK_RECOVER_TICKS = 8;
export const SHOT_BASE_SPEED = 240;
export const SHOT_SPEED_PER_POWER = 18;
export const SHOT_SPEED_PER_CHARGE = 2;
export const PASS_LOB_DIST = 260;
export const PASS_LOB_SPEED = 260;
export const SPECIAL_MAX_TICKS = 180;
export const SPECIAL_STRAIGHT_SPEED = 560;
export const SPECIAL_ZIGZAG_SPEED = 400;
export const SPECIAL_ZIGZAG_AMP = 260;
export const SPECIAL_ZIGZAG_FREQ = 0.3;
export const SPECIAL_LOB_SPEED = 300;
export const SPECIAL_LOB_VZ = 420;
export const SPECIAL_LOB_FALL_GRAVITY_MULT = 3;
export const SPECIAL_PIERCE_SPEED = 460;
export const SPECIAL_HIT_STAMINA = 20;
export const SPECIAL_FLAT_Z = 10;
export const RAMPAGE_TICKS = 180;
export const RAMPAGE_SPEED_MULT = 1.35;
export const RAMPAGE_BUMP_SPEED = 220;
export const RAMPAGE_BUMP_STAMINA = 8;
export const RAMPAGE_BUMP_COOLDOWN = 30;
/** Zhao Yun's lunge (遊龍穿刺): duration in ticks and total distance in px. */
export const LUNGE_TICKS = 15;
export const LUNGE_DISTANCE = 200;
/** Constant lunge speed in px per second (distance per tick, times TICK_HZ). */
export const LUNGE_SPEED = (LUNGE_DISTANCE / LUNGE_TICKS) * TICK_HZ;
/** Ticks before any special can be used again (12 s). */
export const SPECIAL_COOLDOWN_TICKS = 720;
/** An L press made during a busy action stays buffered this long (0.3 s) and fires once the player can act. */
export const SPECIAL_BUFFER_TICKS = 18;
/** Roar shockwave: circle radius, and how far in front of the roarer its centre sits. */
export const ROAR_RADIUS = 105;
export const ROAR_FORWARD = 30;
export const ROAR_KNOCK_SPEED = 280;
export const ROAR_STUN_TICKS = 60;
export const ROAR_STAMINA = 10;

export const KICKOFF_TICKS = 60;
export const GOAL_CELEBRATE_TICKS = 150;
export const HALFTIME_TICKS = 120;
export const GK_AREA_DEPTH = 140;
export const GK_EXTRA_REACH = 6;
export const GK_PICKUP_MAX_Z = 40;
export const GK_DIVE_TICKS = 20;
export const GK_DIVE_SPEED = 220;
export const GK_DIVE_EXTRA_REACH = 10;
export const GK_DIVE_RECOVER_TICKS = 20;
export const GK_FAST_SHOT_SPEED = 300;
