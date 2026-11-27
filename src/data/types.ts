// Shared character data types (pure TS, used by src/sim and src/data).
export type Country = 'wei' | 'shu' | 'wu';
export type Role = 'GK' | 'DF' | 'MF' | 'FW';
export type BodySize = 'S' | 'M' | 'L';
/** Special shot behaviour: straight fast / zigzag / high lob that drops / pierce (knocks down players it hits) / beam (flat, knocks down every opponent in its path, cannot be saved). */
export type SpecialKind = 'straight' | 'zigzag' | 'lob' | 'pierce' | 'beam';
/** Lord weapon (basic attack changes): sword (double hit), spear (long reach), fan (wind projectile). */
export type Weapon = 'sword' | 'spear' | 'fan';
/** The lord's class (流派): 猛將 mengjiang = FW, 軍師 junshi = MF, 鐵壁 tiebi = DF. Only the lord has one. */
export type LordClass = 'mengjiang' | 'junshi' | 'tiebi';

export interface Stats {
  power: number;
  speed: number;
  stamina: number;
  technique: number;
  defense: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  country: Country;
  role: Role;
  size: BodySize;
  stats: Stats;
  /** 'rampage' (invincible run), 'roar' (shockwave), 'lunge' (invincible long dash), 'beam' (channel, then strikes one random opponent), 'summon' (five cavalry riders for 3 s), 'fear' (instant: opponents stand still for 3 s), or 'leap' (back-hop then a long flight; landing silences and drains nearby opponents), or 'tiger' (a 5 s guard that swallows an on-target shot and spits it out as a lob, or roars forward when it runs out), or 'slash' (a 5 s buff: blade waves fly at the nearest opponent on his facing side, 2 per second), or 'ride' (a 0.5 s invincible motorcycle dash along his facing that hits the opponents in its lane), or 'icefield' (an ice field fixed at his cast point for 4 s: opponents inside move at 15% speed and lose stamina in pulses), or 'sail' (a 4 s boat: he moves at 1.5x and is invincible; the hull launches the first opponent it touches, and one teammate can board), or 'gust' (a 0.5 s delay after a cast at the nearest opponent on his facing side, then a cherry-blossom gust at that point launches the opponents within 90 px), or 'portal' (a 0.5 s delay after a cast at his position, then his teammates are summoned around him; for 2 s the field slows opponents inside to 30% and takes stamina in pulses), or 'eastwind' (instant: opponents within 150 px are blown outside the circle and their carriers drop the ball; for 3 s the field slows opponents inside to 15% and takes stamina in pulses), or 'whirl' (lord only: a 72-tick spin at 50% speed that knocks back every opponent within 90 px once, 20% each, dropping their balls), or 'dragonspear' (lord only: 15-tick windup, then a piercing spear down the facing that knocks down each opponent on its path, 25% each), or 'featherfan' (lord only: instant 90-degree fan, 160 px, slows opponents inside to 50% for 3 s and pulls a nearby ball to him). 'none' (no special at all: L does nothing, the AI never casts it; story soldiers). `noBall`: the special can be cast without the ball. `bumpPct`: share of the victim's maxStamina a contact hit of this special removes (default 8 flat). */
  /** Optional lord weapon: changes the basic attack (see Weapon). Absent for every other character. */
  weapon?: Weapon;
  /** The lord's class; enables that class's passive in the sim. */
  lordClass?: LordClass;
  special: {
    name: string;
    kind: SpecialKind;
    mode?: 'none' | 'rampage' | 'roar' | 'lunge' | 'beam' | 'summon' | 'fear' | 'leap' | 'tiger' | 'slash' | 'ride' | 'icefield' | 'sail' | 'gust' | 'portal' | 'arrowship' | 'eastwind' | 'whirl' | 'dragonspear' | 'featherfan';
    noBall?: boolean;
    bumpPct?: number;
  };
}

export interface SizeParams {
  radius: number;
  mass: number;
}
