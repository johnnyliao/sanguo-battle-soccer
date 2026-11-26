// Core game constants: field, ball, players, stamina, actions, and the shared special-move timings.

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

/** Field size multiplier. Web = 1; roblox/scripts/sync-game.mjs rewrites it to 1.5 for the Roblox port. */
export const FIELD_SCALE = 1;
export const FIELD_W = 1200 * FIELD_SCALE;
export const FIELD_D = 260 * FIELD_SCALE;

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
/** Down time when a hit empties the victim's stamina (1.5 s). */
export const DOWN_TICKS_EXHAUSTED = 90;
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
export const RAMPAGE_BUMP_SPEED = 380;
export const RAMPAGE_BUMP_STAMINA = 8;
export const RAMPAGE_BUMP_COOLDOWN = 30;
/** Zhao Yun's lunge (遊龍穿刺): duration in ticks and total distance in px. */
export const LUNGE_TICKS = 15;
export const LUNGE_DISTANCE = 200;
/** Constant lunge speed in px per second (distance per tick, times TICK_HZ). */
export const LUNGE_SPEED = (LUNGE_DISTANCE / LUNGE_TICKS) * TICK_HZ;
/** Share of Zhao Yun's own maxStamina that each opponent his lunge bumps restores (20%), capped at maxStamina. */
export const LUNGE_HEAL_RATIO = 0.2;
/** Guan Yu's ride (騎士衝擊): duration in ticks (0.5 s) and total distance in px along his facing. */
export const RIDE_TICKS = 30;
export const RIDE_DISTANCE = 260;
/** Constant ride speed in px per second (distance per tick, times TICK_HZ). */
export const RIDE_SPEED = (RIDE_DISTANCE / RIDE_TICKS) * TICK_HZ;
/** An opponent whose centre is within this many px of the ride line is in the lane and gets hit. */
export const RIDE_LANE_HALF = 45;
/** The bike touches an opponent this many px beyond the rider's body radius, measured along the ride direction. */
export const RIDE_CONTACT_PAD = 20;
/** Sideways push speed in px per second, away from the ride line. */
export const RIDE_PUSH_SIDE = 300;
/** Forward push speed in px per second, along the ride direction. */
export const RIDE_PUSH_FORWARD = 150;
/** Stun for a ride victim who is not knocked down (0.3 s). */
export const RIDE_HITSTUN_TICKS = 18;
/** Zhuge Liang's beam (破魔光彈): channel time before the beam strikes one random opponent (0.5 s). */
export const BEAM_CAST_TICKS = 30;
/** Share of the beam victim's maxStamina that the beam takes. */
export const BEAM_STRIKE_STAMINA_RATIO = 0.3;
/** Speed of a special shot's ball of kind 'beam' in px per second (no shot of that kind is fired any more). */
export const BEAM_SPEED = 560;
/** Zhang Liao's fear (遼來了): how long a feared opponent stands still and ignores input (3 s). */
export const FEAR_TICKS = 180;
/** Share of each feared opponent's maxStamina that the fear takes. */
export const FEAR_STAMINA_RATIO = 0.1;
/** Only opponents within this distance of Zhang Liao are feared. */
export const FEAR_RADIUS = 200;
/** Simayi's leap (鷹視狼顧): the back-hop, moving LEAP_BACK_DISTANCE opposite his facing over LEAP_BACK_TICKS. */
export const LEAP_BACK_TICKS = 9;
export const LEAP_BACK_DISTANCE = 30;
/** The flight: LEAP_FLY_DISTANCE along his facing over LEAP_FLY_TICKS. */
export const LEAP_FLY_TICKS = 30;
export const LEAP_FLY_DISTANCE = 320;
/** Height of the flight's parabolic arc at its middle (for rendering via p.z). Z is 0 on takeoff and landing. */
export const LEAP_PEAK_Z = 40;
/** Opponents whose centre is within this many px of the landing point are hit. */
export const LEAP_RADIUS = 70;
/** Share of each victim's maxStamina that the landing takes (15%). */
export const LEAP_STAMINA_RATIO = 0.15;
/** Ticks a leap victim stays silenced (2 s): only movement works. */
export const SILENCE_TICKS = 120;
/** Ticks before any special can be used again (12 s). */
export const SPECIAL_COOLDOWN_TICKS = 720;
/** An L press made during a busy action stays buffered this long (0.3 s) and fires once the player can act. */
export const SPECIAL_BUFFER_TICKS = 18;
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
