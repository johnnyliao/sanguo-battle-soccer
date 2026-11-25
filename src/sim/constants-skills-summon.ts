// Special-move constants: Roar, Ma Chao's cavalry summon, Xu Chu's tiger, and Cao Cao's blade slash.

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
