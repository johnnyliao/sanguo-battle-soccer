import type { BodySize, CharacterDef, Role, SpecialKind, Stats } from '../data/types';

/** Held-button state for one tick. dash = virtual dash button. */
export interface InputFrame {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  dash: boolean;
  j: boolean;
  k: boolean;
  l: boolean;
}

export const EMPTY_INPUT: InputFrame = {
  moveX: 0,
  moveY: 0,
  dash: false,
  j: false,
  k: false,
  l: false,
};

export type PlayerAction =
  | 'normal'
  | 'punch'
  | 'tackle'
  | 'hitstun'
  | 'down'
  | 'recover'
  | 'charge'
  | 'dive'
  | 'lunge'
  | 'cast'
  | 'fear'
  | 'leap'
  | 'tiger'
  | 'slash'
  | 'ride'
  | 'icefield';

export type AttackKind = 'punch' | 'tackle' | 'special';

export interface Player {
  idx: number;
  charId: string;
  name: string;
  team: 0 | 1;
  role: Role;
  size: BodySize;
  stats: Stats;
  radius: number;
  mass: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Unit vector of the last nonzero move direction. */
  facingX: number;
  facingY: number;
  stamina: number;
  maxStamina: number;
  action: PlayerAction;
  /** Ticks remaining in the current action. */
  actionTimer: number;
  /** Current attack already hit someone. */
  hitDone: boolean;
  /** Ticks remaining for a called pass. */
  callPassTicks: number;
  /** Ticks during which this player cannot pick up the ball. */
  noTouchTicks: number;
  /** Ticks spent charging a shot (J held while owning the ball). */
  chargeTicks: number;
  /** Ticks left in a rampage (invincible, keeps the ball). 0 = no rampage. */
  rampageTicks: number;
  /** Ticks during which this player cannot be bumped by a rampaging opponent again. */
  bumpCooldown: number;
  /** What the special button (L) does: a rampage, a roar (shockwave) for Zhang Fei, a lunge (long dash) for Zhao Yun, a beam (channel, then strikes one opponent) for Zhuge Liang, a summon (cavalry riders) for Ma Chao, a fear (opponents stand still) for Zhang Liao, or a tiger guard (swallows a shot, spits it at opponents) for Xu Chu. */
  specialMode: 'rampage' | 'roar' | 'lunge' | 'beam' | 'summon' | 'fear' | 'leap' | 'tiger' | 'slash' | 'ride' | 'icefield' | 'sail' | 'gust' | 'portal' | 'arrowship' | 'eastwind';
  /** Ticks until the special can be used again. Set when a rampage starts or a roar fires. */
  specialCooldown: number;
  /** Ticks left silenced (a leap landing): only movement works, no J, K or L. 0 = not silenced. */
  silenceTicks: number;
  /** Ticks left in a tiger guard window (Xu Chu). 0 = no window. Reaching 0 without a swallow fires the expiry roar. */
  tigerTicks: number;
  /** Ticks left in a slash buff (Cao Cao, 霸刀連斬). 0 = no buff. Blade waves fire while it runs. */
  slashTicks: number;
  /** Idxs of the opponents this ride dash has already hit (each victim at most once per dash). */
  rideHits: number[];
  /** True while Sun Quan's arrowship (受箭回舟) is up: he is invincible and his ship blocks shots. */
  arrowshipUp: boolean;
  /** Ticks left on Sun Ce's sail (揚帆起航). 0 = not sailing. */
  sailTicks: number;
  /** Idx of the teammate aboard this sail, or -1. Only a sailing player has one. */
  sailPassenger: number;
  /** Idx of the sailing teammate whose boat this player is aboard, or -1. */
  sailPassengerOf: number;
  /** Ticks left on a buffered L press. A press made while busy waits here and fires once the player can act. 0 = none. */
  specialBuffer: number;
  specialKind: SpecialKind;
  specialName: string;
  /** The special can be cast without the ball. */
  specialNoBall: boolean;
  /** Share of the victim's maxStamina a contact hit of this special removes, or null for the flat default. */
  specialBumpPct: number | null;
  prevInput: InputFrame;
}

/** A special shot in flight. Only set while the ball is unowned and flying under special rules. */
export interface SpecialShot {
  kind: SpecialKind;
  shooterIdx: number;
  team: 0 | 1;
  ticks: number;
  dirX: number;
  dirY: number;
  /** Horizontal launch speed, set at release. */
  speed: number;
  /** Player idxs already hit by this special. */
  hit: number[];
  /** Goalkeeper idxs that already rolled a save on this special (separate from hit so contact still applies on a failed save). */
  rolled: number[];
}

/** A cavalry rider from Ma Chao's summon. Riders exist only while the phase is 'play'. */
export interface Rider {
  id: number;
  team: 0 | 1;
  /** Idx of the summoner (Ma Chao). */
  ownerIdx: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingX: number;
  /** Idx of the opponent being charged, or -1 when none is valid (the rider roams). */
  targetIdx: number;
  /** Spawn slot 0..SUMMON_RIDERS-1: sets the spawn angle and which side the rider curves in from. */
  slot: number;
  /** Direction of roaming, in radians. Used only while targetIdx is -1. */
  wanderAngle: number;
  /** Ticks until the roaming direction is picked again. */
  wanderTicks: number;
  /** Ticks left before the rider vanishes. */
  ticksLeft: number;
  /** Victim idxs this rider has already knocked down. */
  hit: number[];
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Index of the owning player, or -1 when unowned. */
  ownerIdx: number | -1;
  /** Index of the last player who touched the ball, or -1. */
  lastTouchIdx: number | -1;
  special: SpecialShot | null;
  /** A swallowed shot (held, then spat) or a spat tiger ball in flight. null otherwise. See TigerBall. */
  tiger: TigerBall | null;
}

/**
 * An ice field from Zhen Ji's icefield (冰雨招來). It is fixed at the cast point (x, y) and does not move with the caster.
 * ticks counts the ticks since the cast. Exists only while the phase is 'play'.
 */
export interface IceField {
  id: number;
  /** Idx of the caster (Zhen Ji). */
  ownerIdx: number;
  team: 0 | 1;
  x: number;
  y: number;
  ticks: number;
}

/**
 * A gust from Xiao Qiao's 吹飛 (櫻花龍捲). It is fixed at the point (x, y) chosen at the cast and does not follow any target.
 * ticks counts the ticks since the cast; it erupts once GUST_DELAY_TICKS have passed. Exists only while the phase is 'play'.
 */
export interface Gust {
  id: number;
  /** Idx of the caster (Xiao Qiao). */
  ownerIdx: number;
  team: 0 | 1;
  x: number;
  y: number;
  ticks: number;
}

/**
 * A portal from Daqiao's 時空之門. It is fixed at the cast point (x, y) and does not move with her. ticks counts the ticks since
 * the cast. summoned is set once her teammates have been called to her (PORTAL_SUMMON_DELAY_TICKS). Exists only while the phase is 'play'.
 */
export interface Portal {
  id: number;
  /** Idx of the caster (Daqiao). */
  ownerIdx: number;
  team: 0 | 1;
  x: number;
  y: number;
  ticks: number;
  summoned: boolean;
}

/**
 * A field from Zhou Yu's 赤壁東風 (eastwind). It is fixed at the cast point (x, y) and does not move with him. ticks counts the
 * ticks since the cast. Exists only while the phase is 'play'.
 */
export interface EastWind {
  id: number;
  /** Idx of the caster (Zhou Yu). */
  ownerIdx: number;
  team: 0 | 1;
  x: number;
  y: number;
  ticks: number;
}

/**
 * A ship from Sun Quan's 受箭回舟. It stands at his own goal (line x, goal centre y) and does not follow him. dir is the field
 * direction from the ship line (+1 or -1). ticks counts the ticks since the cast; the volley fires at ARROWSHIP_TICKS.
 * arrows counts the shots and attacks it blocked. Exists only while the phase is 'play'.
 */
export interface ArrowShip {
  id: number;
  /** Idx of the caster (Sun Quan). */
  ownerIdx: number;
  team: 0 | 1;
  x: number;
  y: number;
  dir: 1 | -1;
  ticks: number;
  arrows: number;
}

/**
 * A blade wave from Cao Cao's slash. It flies straight from its start point and ends on the first opponent it touches
 * or after SLASH_WAVE_RANGE px. Exists only while the phase is 'play'.
 */
export interface BladeWave {
  id: number;
  /** Idx of the caster (Cao Cao). */
  ownerIdx: number;
  team: 0 | 1;
  x: number;
  y: number;
  /** Unit direction of flight. */
  dirX: number;
  dirY: number;
  /** Distance flown so far, in px. */
  travelled: number;
}

/**
 * Xu Chu's swallowed ball. Kept apart from ball.special because a special shot ends on walls and goal nets, runs a keeper
 * save roll, and hits with fixed costs and stuns, none of which apply to the tiger ball. phase 'hold': the ball sits in his
 * mouth and cannot be picked up, for holdTicks more ticks. phase 'flight': the spat ball, a tiger ball until its first
 * landing. hit lists the opponents it has already knocked (each victim at most once).
 */
export interface TigerBall {
  tigerIdx: number;
  team: 0 | 1;
  phase: 'hold' | 'flight';
  holdTicks: number;
  hit: number[];
}

export type SimEvent =
  | { type: 'pickup'; playerIdx: number }
  | { type: 'bounce'; strength: number }
  | { type: 'attack'; playerIdx: number; kind: AttackKind }
  | { type: 'hit'; attackerIdx: number; victimIdx: number; kind: AttackKind; damage: number }
  | { type: 'down'; playerIdx: number }
  | { type: 'dive'; playerIdx: number }
  | { type: 'callPass'; playerIdx: number }
  | { type: 'looseBall'; playerIdx: number }
  | { type: 'kick'; playerIdx: number; kind: 'pass' | 'shot' | 'clear'; targetIdx: number }
  | { type: 'chargeFull'; playerIdx: number }
  /** A special is activated: a rampage starts or a roar fires. Emitted once per activation. */
  | { type: 'special'; playerIdx: number; kind: SpecialKind; name: string }
  /** The special ball is fired (J during a rampage). */
  | { type: 'specialShot'; playerIdx: number; kind: SpecialKind }
  /** A roar's shockwave centre and radius. */
  | { type: 'roar'; playerIdx: number; x: number; y: number; radius: number }
  /** Zhang Fei's roar knocks a free ball away from him; x, y is the ball's position at the roar. */
  | { type: 'roarBall'; playerIdx: number; x: number; y: number }
  | { type: 'rampageStart'; playerIdx: number }
  | { type: 'rampageEnd'; playerIdx: number }
  /** A summon starts: the summoner's position when he calls the riders. */
  | { type: 'summonStart'; playerIdx: number; x: number; y: number }
  /** One rider appears at (x, y). */
  | { type: 'riderSpawn'; riderId: number; x: number; y: number }
  /** A rider knocks down an opponent (x, y is the rider's position). */
  | { type: 'riderHit'; riderId: number; victimIdx: number; x: number; y: number }
  /** A rider vanishes (timer, or the phase left play). */
  | { type: 'riderEnd'; riderId: number; x: number; y: number }
  /** A lunge starts: the dash origin and unit direction. */
  | { type: 'lungeStart'; playerIdx: number; x: number; y: number; dirX: number; dirY: number }
  /** A lunge ends (timer, field edge, or phase change). */
  | { type: 'lungeEnd'; playerIdx: number; x: number; y: number }
  /** Zhao Yun restores stamina from a lunge bump (amount is the gain after the maxStamina cap). */
  | { type: 'lungeHeal'; playerIdx: number; amount: number }
  /** A ride starts: the unit direction of the dash. */
  | { type: 'rideStart'; playerIdx: number; dirX: number; dirY: number }
  /** A ride ends (timer, field edge, a goal, or the phase leaving play). */
  | { type: 'rideEnd'; playerIdx: number }
  /** The bike hits an opponent in its lane; x, y is the rider's position at the hit. */
  | { type: 'rideHit'; playerIdx: number; victimIdx: number; x: number; y: number }
  /** Sun Ce's sail starts (cast with L). */
  | { type: 'sailStart'; playerIdx: number }
  /** The sail hull touches an opponent: the victim is launched; x, y is the victim's position. The sail ends right after. */
  | { type: 'sailCrash'; playerIdx: number; victimIdx: number; x: number; y: number }
  /** A teammate boards the sail. */
  | { type: 'sailBoard'; playerIdx: number; passengerIdx: number }
  /** The passenger is released at his position when the sail ends. */
  | { type: 'sailDrop'; playerIdx: number; passengerIdx: number }
  /** The sail ends (timer, enemy crash, the sailor going down, or the phase leaving play). */
  | { type: 'sailEnd'; playerIdx: number }
  /** A leap starts (the back-hop begins). */
  | { type: 'leapStart'; playerIdx: number }
  /** A leap's back-hop ends and the flight begins. */
  | { type: 'leapFly'; playerIdx: number }
  /** A leap lands at (x, y); victimIdxs are the opponents it reached. */
  | { type: 'leapLand'; playerIdx: number; x: number; y: number; victimIdxs: number[] }
  /** A beam channel starts (the player stands still). */
  | { type: 'beamCharge'; playerIdx: number }
  /** The channel is cut short without striking (the caster was hit, or the phase left play). */
  | { type: 'beamCancel'; playerIdx: number }
  /** The beam completes and strikes one random opponent. */
  | { type: 'beamStrike'; playerIdx: number; victimIdx: number }
  /** Zhang Liao's fear: the caster and the opponents it reached (the fear's victims). */
  | { type: 'fear'; playerIdx: number; victimIdxs: number[] }
  | { type: 'specialEnd' }
  /** Xu Chu's tiger guard starts (cast without the ball). */
  | { type: 'tigerStart'; playerIdx: number }
  /** Xu Chu swallows an on-target shot; the ball is held at (x, y). */
  | { type: 'tigerSwallow'; playerIdx: number; x: number; y: number }
  /** The held ball is spat out as a high lob toward the opponent goal. */
  | { type: 'tigerSpit'; playerIdx: number }
  /** The guard runs out without a swallow: Xu Chu roars forward at victimIdxs. */
  | { type: 'tigerRoar'; playerIdx: number; victimIdxs: number[] }
  /** The guard ends without a roar (the phase left play). */
  | { type: 'tigerEnd'; playerIdx: number }
  /** Cao Cao's slash buff starts (cast without the ball). */
  | { type: 'slashStart'; playerIdx: number }
  /** The slash buff ends (timer, or the phase left play). */
  | { type: 'slashEnd'; playerIdx: number }
  /** One swing of the slash buff, along (dirX, dirY): a melee hit check in front of him, then one blade wave. */
  | { type: 'slashSwing'; playerIdx: number; dirX: number; dirY: number }
  /** A blade wave is fired at (x, y) flying along (dirX, dirY). */
  | { type: 'slashWave'; playerIdx: number; waveId: number; x: number; y: number; dirX: number; dirY: number }
  /** A blade wave ends at (x, y): hitIdx is the opponent it struck, or -1 when it ran out of range (or the phase left play). */
  | { type: 'slashWaveEnd'; waveId: number; x: number; y: number; hitIdx: number }
  /** Cao Cao restores stamina from a blade wave hit (amount is the gain after the maxStamina cap). */
  | { type: 'slashHeal'; playerIdx: number; amount: number }
  /** Zhen Ji's ice field is cast at (x, y) with this radius. */
  | { type: 'iceStart'; playerIdx: number; fieldId: number; x: number; y: number; radius: number }
  /** An ice field pulse: victimIdxs are the opponents it took stamina from. */
  | { type: 'icePulse'; fieldId: number; victimIdxs: number[] }
  /** An ice field ends (timer, or the phase left play). */
  | { type: 'iceEnd'; fieldId: number }
  /** Xiao Qiao's gust is set at (x, y) with this radius; it erupts after GUST_DELAY_TICKS. */
  | { type: 'gustMark'; playerIdx: number; gustId: number; x: number; y: number; radius: number }
  /** A gust erupts at (x, y): victimIdxs are the opponents it launched. */
  | { type: 'gustBlow'; gustId: number; x: number; y: number; victimIdxs: number[] }
  /** A gust ends without erupting (the phase left play). */
  | { type: 'gustEnd'; gustId: number }
  /** Daqiao's portal is set at (x, y) with this radius; it summons her teammates after PORTAL_SUMMON_DELAY_TICKS. */
  | { type: 'portalStart'; playerIdx: number; portalId: number; x: number; y: number; radius: number }
  /** The portal calls her teammates: summonedIdxs are the teammates moved to her (none if nobody was eligible). */
  | { type: 'portalSummon'; playerIdx: number; portalId: number; summonedIdxs: number[] }
  /** A summoned teammate arrives at (x, y), one event per summoned teammate. */
  | { type: 'portalArrive'; playerIdx: number; x: number; y: number }
  /** A portal ends (timer, or the phase left play). */
  | { type: 'portalEnd'; portalId: number }
  /** Zhou Yu's eastwind is cast at (x, y) with this radius; the opponents inside it are blown out at once (victimIdxs). */
  | { type: 'eastwindStart'; playerIdx: number; windId: number; x: number; y: number; radius: number; victimIdxs: number[] }
  /** An eastwind ends (timer, or the phase left play). */
  | { type: 'eastwindEnd'; windId: number }
  /** Sun Quan's ship is raised at (x, y) (his own goal, ship line x), facing dir, covering halfSpan either side of y. */
  | { type: 'arrowshipStart'; playerIdx: number; shipId: number; x: number; y: number; dir: 1 | -1; halfSpan: number }
  /** The ship blocks a shot ('ball') or an attack ('attack') at (x, y); arrows is its count after the block. */
  | { type: 'arrowshipBlock'; shipId: number; arrows: number; kind: 'ball' | 'attack'; x: number; y: number }
  /** The volley fires from the ship at (x, y): victimIdxs are the opponents it hit (area len x 2 * halfW). */
  | { type: 'arrowshipVolley'; shipId: number; x: number; y: number; dir: 1 | -1; len: number; halfW: number; arrows: number; victimIdxs: number[] }
  /** The ship is gone (volley fired, or the phase left play). */
  | { type: 'arrowshipEnd'; shipId: number }
  | { type: 'whistle'; reason: 'kickoff' | 'half' | 'full' }
  | { type: 'goal'; team: 0 | 1; scorerIdx: number }
  | { type: 'matchEnd'; score: [number, number] }
  | { type: 'pkStart' }
  | { type: 'pkKick'; shooterIdx: number }
  | { type: 'pkResult'; team: 0 | 1; outcome: 'goal' | 'save' | 'miss' }
  | { type: 'pkEnd'; winner: 0 | 1; score: [number, number] }
  | { type: 'save'; playerIdx: number; caught: boolean };

export type PkStage = 'order' | 'aim' | 'flight' | 'result' | 'done';

/** Penalty shootout state. Set on MatchState.pk when the 2nd half ends level. */
export interface PkState {
  stage: PkStage;
  stageTimer: number;
  /** Player idxs per team (5 each), null until chosen. */
  order: [number[] | null, number[] | null];
  kicks: [('goal' | 'miss')[], ('goal' | 'miss')[]];
  kickingTeam: 0 | 1;
  firstTeam: 0 | 1;
  shooterIdx: number;
  keeperIdx: number;
  /** Ticks J has been held since the press; -1 = meter not started. */
  meterTicks: number;
  /** 0..1, locked at release. */
  power: number;
  /** Locked at release. col 0 = top/far post, 1 = center, 2 = bottom/near post. */
  aimCol: number;
  aimHigh: boolean;
  guessCol: number;
  guessHigh: boolean;
  outcome: null | 'goal' | 'save' | 'miss';
  score: [number, number];
  winner: -1 | 0 | 1;
}

export type MatchPhase = 'kickoff' | 'play' | 'goal' | 'halftime' | 'fulltime' | 'pk';

export interface MatchState {
  phase: MatchPhase;
  /** Ticks remaining in timed phases. */
  phaseTimer: number;
  half: 1 | 2;
  /** Ticks remaining in the current half (counts down only in 'play'). */
  clockTicks: number;
  /** Configured half length in ticks. */
  halfTicks: number;
  score: [number, number];
  /** false in 1st half (team 0 attacks +x); true in 2nd half (team 0 attacks -x). */
  swapped: boolean;
  kickoffTeam: 0 | 1;
  firstKickoffTeam: 0 | 1;
  lastGoal: null | { team: 0 | 1; scorerIdx: number; tick: number };
  /** null until the penalty shootout starts. */
  pk: PkState | null;
}

export interface GameState {
  tick: number;
  /** mulberry32 state (uint32). */
  rng: number;
  /** 10 players: idx 0-4 team 0, 5-9 team 1; slot order GK,DF,MF,MF,FW. */
  players: Player[];
  /** Cavalry riders from a summon. Empty outside play. */
  riders: Rider[];
  /** Blade waves from a slash. Empty outside play. */
  waves: BladeWave[];
  /** Ice fields from Zhen Ji's icefield. Empty outside play. */
  iceFields: IceField[];
  /** Id given to the next ice field. */
  nextIceId: number;
  /** Gusts from Xiao Qiao's 吹飛. Empty outside play. */
  gusts: Gust[];
  /** Id given to the next gust. */
  nextGustId: number;
  /** Ships from Sun Quan's 受箭回舟. Empty outside play. */
  arrowships: ArrowShip[];
  /** Id given to the next arrowship. */
  nextArrowShipId: number;
  /** Portals from Daqiao's 時空之門. Empty outside play. */
  portals: Portal[];
  /** Id given to the next portal. */
  nextPortalId: number;
  /** Eastwind fields from Zhou Yu's 赤壁東風. Empty outside play. */
  eastwinds: EastWind[];
  /** Id given to the next eastwind. */
  nextEastWindId: number;
  ball: Ball;
  match: MatchState;
  /** Cleared at the start of every step. */
  events: SimEvent[];
}

export interface MatchSetup {
  seed: number;
  /** Each team is exactly 5 defs: GK, DF, MF, MF, FW. */
  teams: [CharacterDef[], CharacterDef[]];
  /** Half length in seconds. Default 120. */
  halfSeconds?: number;
  /** Start in 'play' with no kickoff wait (for fixtures). */
  startInPlay?: boolean;
}
