// Special-move constants: area and launch specials (ice, sail, gust, portal, eastwind, arrowship).
import { DT, GOAL_H, PLAYER_GRAVITY } from './constants-core';

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
