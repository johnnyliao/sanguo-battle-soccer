// Lord cosmetic parts (R3b-2, 外觀部件): a data table of every part, the slot it goes in, the lord rank tier that unlocks
// it (shared/rank.ts), and the rules for what the lord wears (resolveLook). Pure data and helpers, shared by the server
// (command checks, SetupPlayer look) and the client (camp appearance page, rankGear applyLook, promotion list).
import type { Profile } from "shared/profileTypes";
import { rankFor } from "shared/rank";

export type Slot = "helmet" | "shoulder" | "chest" | "cape" | "back" | "beast" | "trail" | "orbit" | "entrance" | "goal";

/** Every slot, in the order the camp page lists them. */
export const SLOTS: Slot[] = ["helmet", "shoulder", "chest", "cape", "back", "beast", "trail", "orbit", "entrance", "goal"];

export const SLOT_NAME: Record<Slot, string> = {
	helmet: "頭盔",
	shoulder: "肩甲",
	chest: "胸甲",
	cape: "披風",
	back: "背飾",
	beast: "神獸",
	trail: "足跡",
	orbit: "環繞",
	entrance: "進場",
	goal: "進球",
};

export interface CosmeticDef {
	id: string;
	slot: Slot;
	/** Rank tier (1..11) that unlocks the part. */
	unlockTier: number;
	name: string;
}

/** Every part, in unlock order (the table is sorted by unlockTier; latestFor relies on that). */
export const COSMETICS: CosmeticDef[] = [
	{ id: "helmet_cloth", slot: "helmet", unlockTier: 1, name: "布頭巾" },
	{ id: "chest_rags", slot: "chest", unlockTier: 1, name: "破布衣" },
	{ id: "helmet_leather", slot: "helmet", unlockTier: 2, name: "皮盔" },
	{ id: "shoulder_leather", slot: "shoulder", unlockTier: 2, name: "皮護肩" },
	{ id: "trail_dust", slot: "trail", unlockTier: 2, name: "塵土" },
	{ id: "chest_leather", slot: "chest", unlockTier: 3, name: "皮甲" },
	{ id: "cape_brown", slot: "cape", unlockTier: 3, name: "褐披風" },
	{ id: "back_pennant", slot: "back", unlockTier: 3, name: "小三角旗" },
	{ id: "helmet_iron_plume", slot: "helmet", unlockTier: 4, name: "鐵盔紅纓" },
	{ id: "cape_red", slot: "cape", unlockTier: 4, name: "紅披風" },
	{ id: "trail_sparks", slot: "trail", unlockTier: 4, name: "火星" },
	{ id: "entrance_fire", slot: "entrance", unlockTier: 4, name: "火光" },
	{ id: "chest_iron", slot: "chest", unlockTier: 5, name: "鐵甲" },
	{ id: "helmet_eyeglow", slot: "helmet", unlockTier: 5, name: "發光眼縫盔" },
	{ id: "cape_flame", slot: "cape", unlockTier: 5, name: "流派色火焰邊披風" },
	{ id: "chest_silver_shiny", slot: "chest", unlockTier: 6, name: "反光亮銀甲" },
	{ id: "shoulder_silver", slot: "shoulder", unlockTier: 6, name: "亮銀護肩" },
	{ id: "back_flags2", slot: "back", unlockTier: 6, name: "雙靠旗" },
	{ id: "orbit_weapons", slot: "orbit", unlockTier: 6, name: "小兵器繞圈" },
	{ id: "chest_silver_gold", slot: "chest", unlockTier: 7, name: "銀甲金邊" },
	{ id: "trail_light", slot: "trail", unlockTier: 7, name: "流派色光軌" },
	{ id: "goal_emblem", slot: "goal", unlockTier: 7, name: "巨大流派徽章" },
	{ id: "entrance_flags", slot: "entrance", unlockTier: 7, name: "旗海" },
	{ id: "shoulder_lion", slot: "shoulder", unlockTier: 8, name: "獅頭噴氣護肩" },
	{ id: "back_flags4", slot: "back", unlockTier: 8, name: "四面靠旗" },
	{ id: "back_wings_aura", slot: "back", unlockTier: 8, name: "戰氣光翼" },
	{ id: "chest_gold", slot: "chest", unlockTier: 9, name: "金甲" },
	{ id: "helmet_phoenix", slot: "helmet", unlockTier: 9, name: "鳳翅盔" },
	{ id: "cape_gold", slot: "cape", unlockTier: 9, name: "金紋披風" },
	{ id: "beast_chihu", slot: "beast", unlockTier: 9, name: "赤虎" },
	{ id: "beast_qingluan", slot: "beast", unlockTier: 9, name: "青鸞" },
	{ id: "beast_xuangui", slot: "beast", unlockTier: 9, name: "玄龜" },
	{ id: "entrance_roar", slot: "entrance", unlockTier: 9, name: "神獸咆哮" },
	{ id: "chest_gold_thunder", slot: "chest", unlockTier: 10, name: "雷紋流光金甲" },
	{ id: "orbit_halo", slot: "orbit", unlockTier: 10, name: "頭頂光環" },
	{ id: "trail_vortex", slot: "trail", unlockTier: 10, name: "戰氣漩渦" },
	{ id: "helmet_dragon", slot: "helmet", unlockTier: 11, name: "龍首盔" },
	{ id: "chest_dragon", slot: "chest", unlockTier: 11, name: "金龍甲" },
	{ id: "shoulder_dragon", slot: "shoulder", unlockTier: 11, name: "金龍肩甲" },
	{ id: "cape_dragon", slot: "cape", unlockTier: 11, name: "金龍披風" },
	{ id: "back_wings_gold", slot: "back", unlockTier: 11, name: "金色光翼" },
	{ id: "beast_jinlong", slot: "beast", unlockTier: 11, name: "金龍盤繞" },
	{ id: "trail_dragonscale", slot: "trail", unlockTier: 11, name: "金龍鱗光軌" },
	{ id: "entrance_pillar", slot: "entrance", unlockTier: 11, name: "天降金光柱" },
	{ id: "goal_dragon", slot: "goal", unlockTier: 11, name: "金龍飛越" },
];

/** Chosen parts per slot: a part id, or "none" (wear nothing in that slot). */
export type LookMap = Partial<Record<Slot, string>>;

/** Save data: auto = the unpicked slots wear the latest unlocked part; picks = the slots the player picked by hand. */
export interface CosmeticsSave {
	auto: boolean;
	picks: Partial<Record<Slot, string>>;
}

export function isSlot(v: unknown): v is Slot {
	return typeIs(v, "string") && SLOTS.includes(v as Slot);
}

export function cosmeticDef(id: string): CosmeticDef | undefined {
	return COSMETICS.find((d) => d.id === id);
}

/** Every part unlocked at this rank tier. */
export function unlockedFor(tier: number): CosmeticDef[] {
	return COSMETICS.filter((d) => d.unlockTier <= tier);
}

/** The newest part of a slot unlocked at this tier (the last one in table order), or undefined. */
export function latestFor(slot: Slot, tier: number): string | undefined {
	let found: string | undefined;
	for (const d of COSMETICS) {
		if (d.slot === slot && d.unlockTier <= tier) found = d.id;
	}
	return found;
}

export function isCosmeticUnlocked(id: string, tier: number): boolean {
	const d = cosmeticDef(id);
	return d !== undefined && d.unlockTier <= tier;
}

/** Parts that appear when the rank goes from fromTier up to toTier (both excluded / included as in rankUp). */
export function unlockedBetween(fromTier: number, toTier: number): CosmeticDef[] {
	return COSMETICS.filter((d) => d.unlockTier > fromTier && d.unlockTier <= toTier);
}

/** The auto look of a rank tier: the latest part of every slot. */
export function lookForTier(tier: number): LookMap {
	const look: LookMap = {};
	for (const slot of SLOTS) {
		const id = latestFor(slot, tier);
		if (id !== undefined) look[slot] = id;
	}
	return look;
}

/** Save data of a profile, with the default when the save has none (old saves). */
export function cosmeticsOf(p: Profile): CosmeticsSave {
	return p.cosmetics ?? { auto: true, picks: {} };
}

/**
 * What the lord wears. Per slot: a valid hand pick (an unlocked part of that slot, or "none") wins; otherwise the
 * slot gets the latest unlocked part when auto is on, and nothing when auto is off.
 */
export function resolveLook(p: Profile): LookMap {
	const tier = rankFor(p.lordLevel).tier;
	const cos = cosmeticsOf(p);
	const look: LookMap = {};
	for (const slot of SLOTS) {
		const pick = cos.picks[slot];
		let id: string | undefined;
		if (pick === "none") {
			id = "none";
		} else if (pick !== undefined && isCosmeticUnlocked(pick, tier) && cosmeticDef(pick)?.slot === slot) {
			id = pick;
		} else if (cos.auto) {
			id = latestFor(slot, tier);
		}
		if (id !== undefined) look[slot] = id;
	}
	return look;
}
