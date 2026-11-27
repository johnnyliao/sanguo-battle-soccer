// Lord weapon constants (basic attack changes by weapon) and the lord's three specials: whirl, dragonspear, featherfan.
// Weapon timings are in ticks at TICK_HZ; the default punch (PUNCH_TICKS 14, active 4..8) is in constants-core.

/** Sword (天子劍): the first hit window opens at tick 3 and stays open for 3 ticks (windup 0.7x the default 4). */
export const LORD_SWORD_ACTIVE_FROM = 3;
export const LORD_SWORD_ACTIVE_TO = 5;
/** Sword: a second hit check fires this many ticks after the first window opens, in the same direction. */
export const LORD_SWORD_SECOND_DELAY = 9;
/** Sword attack duration in ticks. Longer than 0.7x PUNCH_TICKS so the second check (tick 12) still falls inside the attack. */
export const LORD_SWORD_TICKS = 15;
/** Spear (龍膽槍): duration in ticks, and the active window (windup about 1.2x the default). */
export const LORD_SPEAR_TICKS = 17;
export const LORD_SPEAR_ACTIVE_FROM = 5;
export const LORD_SPEAR_ACTIVE_TO = 10;
/** Spear reach: the strike point sits this many times farther out than the default (body radius + PUNCH_RANGE). */
export const LORD_SPEAR_REACH_MULT = 1.5;
/** Spear knockback multiplier on the normal hit knockback. */
export const LORD_SPEAR_KNOCK_MULT = 1.3;
/** Fan (羽扇): the windpuff spawns on this attack tick (the default windup). The fan keeps the default attack duration. */
export const LORD_FAN_SPAWN_TICK = 4;
/** Windpuff: px per tick, maximum travel in px, and its contact radius around the puff centre. */
export const LORD_WINDPUFF_STEP = 8;
export const LORD_WINDPUFF_RANGE = 160;
export const LORD_WINDPUFF_RADIUS = 6;
/** A windpuff hit pushes the victim away along the puff direction at this speed (px per second): about 60 px of hitstun slide. */
export const LORD_WINDPUFF_PUSH_SPEED = 500;
/** Share of the default punch damage that a windpuff hit deals (30%). */
export const LORD_WINDPUFF_DAMAGE_RATIO = 0.3;
/** A free ball touched by a windpuff below this height (px) is pushed along the puff direction at this speed (px per second). */
export const LORD_WINDPUFF_BALL_MAX_Z = 30;
export const LORD_WINDPUFF_BALL_SPEED = 240;

/** Whirl (天子劍・旋風斬): duration in ticks (2 s). The lord is invincible throughout and moves at normal speed, keeping any ball. */
export const LORD_WHIRL_TICKS = 120;
/** Sword-qi ring around the lord: each opponent within this many px is hit. */
export const LORD_WHIRL_RADIUS = 70;
/** A whirl victim can be hit again only this many ticks after its last hit. */
export const LORD_WHIRL_REHIT_TICKS = 30;
/** Share of each whirl victim's maxStamina that the hit takes (15%). */
export const LORD_WHIRL_STAMINA_RATIO = 0.15;
/** Knockback multiplier on the straight special knock (160 px/s x 2.4, about the rampage bump speed of 380 px/s). The victim is stunned, not knocked down. */
export const LORD_WHIRL_KNOCK_MULT = 2.4;

/** Dragonspear (破陣槍・龍騰): windup ticks (0.2 s). The lord is invincible during the windup and the windup cannot be cancelled. */
export const LORD_DRAGON_WINDUP_TICKS = 12;
/** The spear flies this many px per tick, for at most LORD_DRAGON_RANGE px. */
export const LORD_DRAGON_STEP = 16;
export const LORD_DRAGON_RANGE = 600;
/** An opponent whose centre is within this many px of the spear's path is pierced. */
export const LORD_DRAGON_HALF_WIDTH = 32;
/** Share of each pierced victim's maxStamina that the spear takes (30%). */
export const LORD_DRAGON_STAMINA_RATIO = 0.3;
/** A pierced victim is knocked down for this many ticks (1.25 s). */
export const LORD_DRAGON_DOWN_TICKS = 75;

/**
 * Featherfan (鳳翼扇・羽風陣): cone radius in px, the full cone angle in degrees, and the squared cosine of the half angle
 * (cos 60 deg squared = 0.25, i.e. a 120 deg fan).
 */
export const LORD_FEATHER_RADIUS = 220;
export const LORD_FEATHER_ANGLE_DEG = 120;
export const LORD_FEATHER_CONE_COS2 = 0.25;
/** An opponent in the cone is pushed away from the lord at this speed (px per second): about 80 px of slide over its hitstun. */
export const LORD_FEATHER_PUSH_SPEED = 670;
/** The stun after a featherfan push, in ticks (0.5 s). */
export const LORD_FEATHER_HITSTUN_TICKS = 30;
/** Share of each pushed opponent's maxStamina that the push takes (10%). */
export const LORD_FEATHER_STAMINA_RATIO = 0.1;
/** Opponents in the cone move at this share of their normal max speed, for this many ticks (3 s). */
export const LORD_FEATHER_SLOW_MULT = 0.35;
export const LORD_FEATHER_SLOW_TICKS = 180;
/** After the cast the lord moves at this multiple of his max speed for LORD_FEATHER_BOOST_TICKS ticks (1.5 s). */
export const LORD_FEATHER_BOOST_MULT = 1.3;
export const LORD_FEATHER_BOOST_TICKS = 90;
/** A ball (free, or held by an opponent) within this many px of the lord, inside the cone and below this height (px), is pulled to his feet. */
export const LORD_FEATHER_PULL_RANGE = 280;
export const LORD_FEATHER_PULL_MAX_Z = 60;
