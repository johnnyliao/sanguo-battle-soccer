// Shared character data types (pure TS, used by src/sim and src/data).
export type Country = 'wei' | 'shu' | 'wu';
export type Role = 'GK' | 'DF' | 'MF' | 'FW';
export type BodySize = 'S' | 'M' | 'L';
/** Special shot behaviour: straight fast / zigzag / high lob that drops / pierce (knocks down players it hits) / beam (flat, knocks down every opponent in its path, cannot be saved). */
export type SpecialKind = 'straight' | 'zigzag' | 'lob' | 'pierce' | 'beam';

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
  /** 'rampage' (invincible run), 'roar' (shockwave), 'lunge' (invincible long dash), 'beam' (channel, then strikes one random opponent), 'summon' (five cavalry riders for 3 s), or 'fear' (instant: opponents stand still for 3 s). `noBall`: the special can be cast without the ball. `bumpPct`: share of the victim's maxStamina a contact hit of this special removes (default 8 flat). */
  special: {
    name: string;
    kind: SpecialKind;
    mode?: 'rampage' | 'roar' | 'lunge' | 'beam' | 'summon' | 'fear';
    noBall?: boolean;
    bumpPct?: number;
  };
}

export interface SizeParams {
  radius: number;
  mass: number;
}
