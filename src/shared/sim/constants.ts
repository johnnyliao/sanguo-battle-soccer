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
/** Roar shockwave: circle radius, and how far in front of the roarer its centre sits. */
export const ROAR_RADIUS = 105;
export const ROAR_FORWARD = 30;
export const ROAR_KNOCK_SPEED = 280;
export const ROAR_STUN_TICKS = 60;
export const ROAR_STAMINA = 10;
/** Roar on a free ball inside the circle (any height): the ball's speed away from the roarer, and its upward speed. */
export const ROAR_BALL_SPEED = 420;
export const ROAR_BALL_VZ = 160;
/** Ma Chao's summon (西涼鐵騎): number of cavalry riders called with the ball. */
export const SUMMON_RIDERS = 5;
/** How long the riders roam: ticks (3 s). */
export const SUMMON_TICKS = 180;
/** Rider speed in px per second. */
export const RIDER_SPEED = 300;
/** Per-tick steering lerp from the rider's velocity toward its target direction. */
export const RIDER_TURN = 0.12;
/** A rider knocks down an opponent whose centre is within this many px of its own, plus the opponent's radius. */
export const RIDER_HIT_RADIUS = 18;
/** Riders appear on a circle this many px around Ma Chao, spread evenly all round it. */
export const RIDER_SPAWN_RADIUS = 110;
/** A rider charging a target aims at a point this far to its side (scaled by slot), capped at RIDER_LATERAL_MAX. */
export const RIDER_LATERAL_MAX = 70;
/** Lateral aim offset per px of distance to the target, before the cap. The offset shrinks as the rider closes in. */
export const RIDER_LATERAL_RATIO = 0.5;
/** Extra lateral aim per slot: slot n scales the offset by 1 + n * this. */
export const RIDER_LATERAL_SLOT_GROWTH = 0.25;
/** Riders closer than this many px push each other apart. */
export const RIDER_SEPARATION_DIST = 45;
/** Separation acceleration in px per second squared, at zero distance (it fades linearly to 0 at RIDER_SEPARATION_DIST). */
export const RIDER_SEPARATION_ACCEL = 600;
/** A roaming rider (no valid target) picks a new direction every this many ticks. */
export const RIDER_WANDER_TICKS = 40;
/** Xu Chu's tiger guard (惡虎吞天): the window in which he swallows an on-target shot (5 s). */
export const TIGER_GUARD_TICKS = 300;
/** A shot on target that passes within this many px of Xu Chu is swallowed. */
export const TIGER_SWALLOW_RANGE = 150;
/** Ticks the swallowed ball is held in his mouth before it is spat out (0.5 s). */
export const TIGER_HOLD_TICKS = 30;
/** Where the held ball sits: this many px in front of Xu Chu (along his attack direction), at this height. */
export const TIGER_MOUTH_FORWARD = 20;
export const TIGER_MOUTH_Z = 30;
/** Horizontal distance a spat ball travels before its first landing, measured from the spit point. */
export const TIGER_SPIT_DISTANCE = 450;
/** Upward speed of the spat ball, px per second. Sets the arc height and flight time together with GRAVITY. */
export const TIGER_SPIT_VZ = 240;
/** Share of a tiger ball victim's maxStamina that it takes (80%). */
export const TIGER_BALL_STAMINA_RATIO = 0.8;
/** How long a tiger ball victim is stunned (3 s). */
export const TIGER_STUN_TICKS = 180;
/** Expiry roar: opponents within this many px in front of Xu Chu are knocked back. */
export const TIGER_ROAR_RADIUS = 90;
/** Share of each expiry-roar victim's maxStamina that the roar takes (10%). */
export const TIGER_ROAR_STAMINA_RATIO = 0.1;
/** Cao Cao's slash (霸刀連斬): how long the buff lasts (5 s). */
export const SLASH_TICKS = 300;
/** Ticks from the cast to the first swing (0.2 s). */
export const SLASH_FIRST_DELAY = 12;
/** Ticks between swings while the buff runs (0.2 s, 25 swings in all). A swing skipped while he cannot act is lost. */
export const SLASH_INTERVAL = 12;
/** Melee reach of a swing: opponents whose body is this many px or less in front of his body edge take a punch hit. */
export const SLASH_MELEE_REACH = 34;
/** Melee depth of a swing: opponents further than this many px above or below him are out of the melee. */
export const SLASH_MELEE_HALF_DEPTH = 24;
/** Blade wave speed in px per second. */
export const SLASH_WAVE_SPEED = 480;
/** A blade wave ends after travelling this many px without a hit. */
export const SLASH_WAVE_RANGE = 120;
/** Share of the victim's maxStamina that a blade wave hit takes (5%). */
export const SLASH_DAMAGE_RATIO = 0.05;
/** Stun for a blade wave victim who is not knocked down (0.3 s). */
export const SLASH_HITSTUN_TICKS = 18;
/** Share of Cao Cao's own maxStamina that each blade wave hit restores (5%), capped at maxStamina. */
export const SLASH_HEAL_RATIO = 0.05;

/** Zhen Ji's ice field (冰雨招來): radius around the cast point in px. The field stays where it was cast. */
export const ICE_RADIUS = 110;
/** How long the ice field lasts: 4 s. */
export const ICE_TICKS = 240;
/** Opponents inside the field move at this share of their normal max speed (15%). */
export const ICE_SLOW_MULT = 0.15;
/** Every this many ticks after the cast the field pulses (0.5 s): 240 / 30 = 8 pulses. */
export const ICE_DOT_INTERVAL = 30;
/** Share of each pulse victim's maxStamina that a pulse takes (5%). */
export const ICE_DOT_RATIO = 0.05;
/** Sun Ce's sail (揚帆起航): how long the boat lasts, in ticks (4 s). */
export const SAIL_TICKS = 240;
/** Speed multiplier on his max speed while sailing. */
export const SAIL_SPEED_MULT = 1.5;
/** The boat hull is a box centred on the sailor: half-length along x and half-depth along y, in px. */
export const SAIL_HALF_LEN = 34;
export const SAIL_HALF_DEPTH = 16;
/** A launch victim (sail or gust) is airborne for this many ticks (0.6 s, peak ≈ 40 px); he lands on the last of them. */
export const LAUNCH_AIR_TICKS = 36;
/** A sail victim is down for this many ticks (1 s): airborne for LAUNCH_AIR_TICKS, then lies on the ground. */
export const SAIL_LAUNCH_TICKS = 60;
/** Share of the rammed opponent's maxStamina the boat crash takes (2026-11-24: 80%). */
export const SAIL_CRASH_STAMINA_RATIO = 0.8;
/** Horizontal launch speed of a sail victim in px per second, directly away from the sailor. */
export const SAIL_LAUNCH_SPEED = 160;
/**
 * Upward launch speed of a sail victim in px per second. Players fall at PLAYER_GRAVITY, applied once per tick before z moves,
 * so after n ticks z = vz * n * DT - g * DT^2 * n(n+1)/2. z returns to 0 exactly at n = LAUNCH_AIR_TICKS when vz = g * DT * (N+1) / 2.
 */
export const SAIL_LAUNCH_VZ = (PLAYER_GRAVITY * DT * (LAUNCH_AIR_TICKS + 1)) / 2;
/** A passenger stands this many px behind the sailor (along his facing, reversed), at the same y. */
export const SAIL_PASSENGER_BEHIND = 18;

/** Xiao Qiao's 吹飛 (櫻花龍捲): a cast with no target in reach sets the gust this far straight ahead along her facing (150 px). */
export const GUST_FALLBACK_DIST = 150;
/** The gust point is the nearest opponent on her facing side within this many px (300 px). */
export const GUST_TARGET_RANGE = 300;
/** Delay from the cast to the eruption: 30 ticks (0.5 s). */
export const GUST_DELAY_TICKS = 30;
/** Opponents whose centre is within this many px of the gust point are launched. */
export const GUST_RADIUS = 90;
/** Share of each launched opponent's maxStamina that the gust takes (50%). */
export const GUST_STAMINA_RATIO = 0.5;
/** A gust victim is down for this many ticks (1 s): airborne for LAUNCH_AIR_TICKS, then lies on the ground. */
export const GUST_LAUNCH_TICKS = 60;
/** Horizontal push speed of a gust victim in px per second, directly away from the gust point. */
export const GUST_PUSH_SPEED = 80;
/** Upward launch speed of a gust victim: same arc as SAIL_LAUNCH_VZ, so he lands exactly on the last airborne tick. */
export const GUST_LAUNCH_VZ = (PLAYER_GRAVITY * DT * (LAUNCH_AIR_TICKS + 1)) / 2;

/** Daqiao's 時空之門 (portal): radius around the cast point in px. The field stays where it was cast. */
export const PORTAL_RADIUS = 140;
/** How long the portal lasts: 2 s. */
export const PORTAL_TICKS = 120;
/** Delay from the cast to the summon: 30 ticks (0.5 s). Teammates are teleported to her then. */
export const PORTAL_SUMMON_DELAY_TICKS = 30;
/** Opponents inside the portal move at this share of their normal max speed (30%). */
export const PORTAL_SLOW_MULT = 0.3;
/** Every this many ticks after the cast the portal pulses (0.5 s): 120 / 30 = 4 pulses. */
export const PORTAL_DOT_INTERVAL = 30;
/** Share of each pulse victim's maxStamina that a pulse takes (5%). */
export const PORTAL_DOT_RATIO = 0.05;
/** Summoned teammates stand evenly spaced on a ring of this radius around Daqiao, in px (50 px). */
export const PORTAL_RING_RADIUS = 50;

/** Zhou Yu's 赤壁東風 (eastwind): radius around the cast point in px. The field stays where it was cast. */
export const EASTWIND_RADIUS = 150;
/** How long the eastwind lasts: 3 s. */
export const EASTWIND_TICKS = 180;
/** Opponents blown out at the cast end up this many px outside EASTWIND_RADIUS, on the pitch (see eastwindPitchAngle). */
export const EASTWIND_PUSH_MARGIN = 20;
/** Outward speed of a blown-out opponent in px per second, directly away from the cast point. */
export const EASTWIND_KNOCK_SPEED = 200;
/** Stun of a blown-out opponent: 30 ticks (0.5 s), half the roar's stun. */
export const EASTWIND_STUN_TICKS = 30;
/** Opponents whose centre is inside the eastwind move at this share of their normal max speed (15%). */
export const EASTWIND_SLOW_MULT = 0.15;
/** Every this many ticks after the cast the eastwind pulses (1 s): 180 / 60 = 3 pulses. */
export const EASTWIND_DOT_INTERVAL = 60;
/** Share of each pulse victim's maxStamina that a pulse takes (10%). */
export const EASTWIND_DOT_RATIO = 0.1;

/** Sun Quan's 受箭回舟 (arrowship): the block window and the volley tick, 2 s (the volley fires on tick 120). */
export const ARROWSHIP_TICKS = 120;
/** The ship line sits this many px in front of his own goal line, toward the field. */
export const ARROWSHIP_FORWARD = 30;
/** The ship covers the goal centre y plus or minus this many px. Players and ground-level shots cannot pass it there. */
export const ARROWSHIP_HALF_SPAN = 60;
/** A ball is blocked only at or below this height (px). Above it the ball flies over the ship: goal height plus 24. */
export const ARROWSHIP_BLOCK_MAX_Z = GOAL_H + 24;
/** A blocked ball keeps this share of its velocity: the goal-ward component is reversed, the others are damped. */
export const ARROWSHIP_BALL_DAMP = 0.4;
/** The volley area runs from the ship line forward this many px along the field direction. */
export const ARROWSHIP_VOLLEY_LEN = 300;
/** The volley area is this many px either side of the goal centre y. */
export const ARROWSHIP_VOLLEY_HALF_W = 120;
/** Share of each volley victim's maxStamina that the volley takes (30%). */
export const ARROWSHIP_STAMINA_RATIO = 0.3;
/** Volley knockback speed (px per second, away from the ship along the field direction) and stun (same as the roar). */
export const ARROWSHIP_KNOCK_SPEED = 280;
export const ARROWSHIP_STUN_TICKS = 60;

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
