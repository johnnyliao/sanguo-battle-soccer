// Lord ranks (R3b-1, 主公階級): the lord's level maps to one of 11 ranks. A rank sets the lord's gear look (client
// rankGear.ts), the title over the head and the camp label. Also the lord's xp curve (xpToNext). Pure data and helpers,
// shared by the server (level-up loop, rank-up result) and the client (xp bars, title, gear).

export type HeadwearKind = "cloth" | "leather" | "iron" | "plume" | "phoenix" | "dragon";
export type MetalKind = "cloth" | "leather" | "iron" | "silver" | "gold";
export type CapeKind = "none" | "short" | "long" | "gold" | "dragon";

export interface RankDef {
	tier: number;
	minLevel: number;
	name: string;
	headwear: HeadwearKind;
	/** Metal parts (helmet, shoulder guards, chest plate). */
	metal: MetalKind;
	cape: CapeKind;
	/** Number of back flag poles. */
	backFlags: 0 | 1 | 2 | 4;
	/** Gold light and sparkles around the lord. */
	glow: boolean;
}

export const LORD_MAX_LEVEL = 30;

export const RANKS: RankDef[] = [
	{ tier: 1, minLevel: 1, name: "小兵", headwear: "cloth", metal: "cloth", cape: "none", backFlags: 0, glow: false },
	{ tier: 2, minLevel: 3, name: "伍長", headwear: "leather", metal: "leather", cape: "none", backFlags: 0, glow: false },
	{ tier: 3, minLevel: 6, name: "什長", headwear: "leather", metal: "leather", cape: "short", backFlags: 0, glow: false },
	{ tier: 4, minLevel: 9, name: "百夫長", headwear: "iron", metal: "iron", cape: "long", backFlags: 0, glow: false },
	{ tier: 5, minLevel: 12, name: "校尉", headwear: "plume", metal: "iron", cape: "long", backFlags: 0, glow: false },
	{ tier: 6, minLevel: 15, name: "都尉", headwear: "plume", metal: "silver", cape: "long", backFlags: 0, glow: false },
	{ tier: 7, minLevel: 18, name: "偏將軍", headwear: "plume", metal: "silver", cape: "long", backFlags: 1, glow: false },
	{ tier: 8, minLevel: 21, name: "中郎將", headwear: "plume", metal: "silver", cape: "gold", backFlags: 2, glow: false },
	{ tier: 9, minLevel: 24, name: "鎮軍將軍", headwear: "phoenix", metal: "gold", cape: "gold", backFlags: 2, glow: false },
	{ tier: 10, minLevel: 27, name: "驃騎將軍", headwear: "phoenix", metal: "gold", cape: "gold", backFlags: 4, glow: true },
	{ tier: 11, minLevel: 30, name: "大將軍統領", headwear: "dragon", metal: "gold", cape: "dragon", backFlags: 4, glow: true },
];

/** The rank of a level: the highest tier whose minLevel is at or below it. */
export function rankFor(level: number): RankDef {
	let found = RANKS[0];
	for (const r of RANKS) {
		if (level >= r.minLevel) found = r;
	}
	return found;
}

/** The rank of a tier number (clamped to 1..11). */
export function rankByTier(tier: number): RankDef {
	return RANKS[math.clamp(tier, 1, RANKS.size()) - 1];
}

/** The next rank above a level, or undefined at the top rank. */
export function nextRank(level: number): RankDef | undefined {
	for (const r of RANKS) {
		if (r.minLevel > level) return r;
	}
	return undefined;
}

/** Xp needed to go from this level to the next one (60 + 20 × level). */
export function xpToNext(level: number): number {
	return 60 + 20 * level;
}
