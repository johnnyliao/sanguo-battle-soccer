// Shared character data types (pure TS, used by src/sim and src/data).
export type Country = 'wei' | 'shu' | 'wu';
export type Role = 'GK' | 'DF' | 'MF' | 'FW';
export type BodySize = 'S' | 'M' | 'L';
/** Special shot behaviour: straight fast / zigzag / high lob that drops / pierce (knocks down players it hits). */
export type SpecialKind = 'straight' | 'zigzag' | 'lob' | 'pierce';

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
  /** 'rampage' (L with the ball: invincible run), 'roar' (L with or without the ball: shockwave), or 'lunge' (L with the ball: invincible long dash). */
  special: { name: string; kind: SpecialKind; mode?: 'rampage' | 'roar' | 'lunge' };
}

export interface SizeParams {
  radius: number;
  mass: number;
}
