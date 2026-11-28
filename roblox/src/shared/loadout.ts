// Lord progression data (R3 phase 1): classes (流派), loadout items (weapons, specials), starter gear, the special pool of
// each class, the lord stat formula and the profile settle rule (old saves → classes). Pure data and helpers, shared by
// the server (profile, commands, team building) and the client (camp page). Display text for classes lives here.
import { RAW_CHARACTERS, type CharacterDef, type LordClass, type Role, type Stats } from "shared/game/data";
import type { LordWeapon } from "shared/net";
import type { Profile } from "shared/profileTypes";

export const LORD_CLASSES: LordClass[] = ["mengjiang", "junshi", "tiebi"];

/** Weapon category for class preferences. The basic attack of a lord weapon is a LordWeapon (sword / spear / fan). */
export type WeaponType = "sword" | "polearm" | "fan" | "heavy";

export interface LordClassInfo {
	name: string;
	position: string;
	role: Role;
	passive: string;
	passiveText: string;
	/** The two stats that grow on level-up (round-robin). */
	growth: [keyof Stats, keyof Stats];
	/** Equipping a weapon of one of these types gives +1 to every stat (cap 10). */
	preferred: WeaponType[];
	base: Stats;
	starterWeapon: string;
	starterSpecial: string;
	/** Specials this class may equip (lord specials and general charIds). */
	pool: string[];
}

const CLASS_INFO: Record<LordClass, LordClassInfo> = {
	mengjiang: {
		name: "猛將",
		position: "前鋒",
		role: "FW",
		passive: "破陣",
		passiveText: "持球被打時有護盾不掉球（每 3 秒一次）；擊倒敵人時大招冷卻縮短 2 秒",
		growth: ["power", "speed"],
		preferred: ["polearm", "heavy"],
		base: { power: 7, speed: 7, stamina: 5, technique: 5, defense: 3 },
		starterWeapon: "lord_spear",
		starterSpecial: "dragonspear",
		pool: ["dragonspear", "whirl", "zhaoyun", "zhangliao", "sunce", "machao"],
	},
	junshi: {
		name: "軍師",
		position: "中場",
		role: "MF",
		passive: "運籌",
		passiveText: "大招冷卻縮短 25%；傳球給隊友後，接球的隊友加速 2 秒",
		growth: ["technique", "stamina"],
		preferred: ["fan"],
		base: { power: 4, speed: 5, stamina: 6, technique: 8, defense: 4 },
		starterWeapon: "lord_fan",
		starterSpecial: "featherfan",
		pool: ["featherfan", "zhugeliang", "zhouyu", "xiaoqiao", "zhenji", "simayi"],
	},
	tiebi: {
		name: "鐵壁",
		position: "後衛",
		role: "DF",
		passive: "固守",
		passiveText: "鏟球範圍變大；被打倒地時每兩次有一次只會硬直；搶到球時全隊加速",
		growth: ["defense", "stamina"],
		preferred: ["sword", "heavy"],
		base: { power: 5, speed: 4, stamina: 7, technique: 4, defense: 7 },
		starterWeapon: "lord_sword",
		starterSpecial: "whirl",
		pool: ["whirl", "guanyu", "caocao", "daqiao", "zhangfei", "xuchu", "sunquan"],
	},
};

const LORD_WEAPON_IDS: string[] = ["lord_sword", "lord_spear", "lord_fan"];
const LORD_SPECIAL_IDS: string[] = ["whirl", "dragonspear", "featherfan"];
const LORD_WEAPON_NAMES: Record<string, string> = {
	lord_sword: "天子劍",
	lord_spear: "破陣槍",
	lord_fan: "鳳翼扇",
};
const LORD_SPECIAL_NAMES: Record<string, string> = {
	whirl: "天子劍・旋風斬",
	dragonspear: "破陣槍・龍騰",
	featherfan: "鳳翼扇・羽風陣",
};
const LORD_WEAPON_ATTACK: Record<string, LordWeapon> = {
	lord_sword: "sword",
	lord_spear: "spear",
	lord_fan: "fan",
};
/** Weapon category by item id: lord weapons and the generals whose weapon they stand for. */
const WEAPON_TYPE: Record<string, WeaponType> = {
	lord_sword: "sword",
	caocao: "sword",
	sunquan: "sword",
	zhouyu: "sword",
	lord_spear: "polearm",
	guanyu: "polearm",
	zhangfei: "polearm",
	zhaoyun: "polearm",
	machao: "polearm",
	lord_fan: "fan",
	zhugeliang: "fan",
	simayi: "fan",
	daqiao: "fan",
	xiaoqiao: "fan",
	zhenji: "fan",
	xuchu: "heavy",
	sunce: "heavy",
	zhangliao: "heavy",
};

/** Stat cap for lord stats (growth and the preferred-weapon bonus). */
export const LORD_STAT_CAP = 10;
/** Level cap of the lord (matches the story reward table). */
export const LORD_LEVEL_MAX = 30;

export function classInfo(cls: LordClass): LordClassInfo {
	return CLASS_INFO[cls];
}

export function parseLordClass(v: unknown): LordClass | undefined {
	if (v === "mengjiang" || v === "junshi" || v === "tiebi") return v;
	return undefined;
}

/** The starter gear of a class: its starter weapon and special (both granted and equipped when the class is chosen). */
export function starterGear(cls: LordClass): { weapon: string; special: string } {
	const info = CLASS_INFO[cls];
	return { weapon: info.starterWeapon, special: info.starterSpecial };
}

/** Specials a class may equip. */
export function classPool(cls: LordClass): string[] {
	return CLASS_INFO[cls].pool;
}

export function isGeneralId(id: string): boolean {
	return RAW_CHARACTERS.some((d) => d.id === id);
}

/** A weapon item id: a lord weapon or a general (whose weapon it stands for). */
export function isWeaponId(id: string): boolean {
	return LORD_WEAPON_IDS.includes(id) || isGeneralId(id);
}

/** A special item id: a lord special or a general (whose special it stands for). */
export function isSpecialId(id: string): boolean {
	return LORD_SPECIAL_IDS.includes(id) || isGeneralId(id);
}

/** Weapons that can be equipped now (general weapons come in phase P4). */
export function isEquippableWeapon(id: string): boolean {
	return LORD_WEAPON_IDS.includes(id);
}

/** Specials that can be equipped now: the lord specials and any general's own special. The class pool and ownership are
 *  checked by isLegalSpecial. */
export function isEquippableSpecial(id: string): boolean {
	return LORD_SPECIAL_IDS.includes(id) || isGeneralId(id);
}

/** A special may be in use: equippable now, in the class pool, and owned (the lord specials count as owned). */
export function isLegalSpecial(cls: LordClass, id: string, owned: string[]): boolean {
	if (!isEquippableSpecial(id) || !classPool(cls).includes(id)) return false;
	return LORD_SPECIAL_IDS.includes(id) || owned.includes(id);
}

/** Basic attack type of a lord weapon id, or undefined for anything else. */
export function lordWeaponAttack(id: string): LordWeapon | undefined {
	return LORD_WEAPON_ATTACK[id];
}

/** Special name of a lord special id or of a general's special (the general's own name), or undefined for anything else. */
export function lordSpecialName(id: string): string | undefined {
	const lordName = LORD_SPECIAL_NAMES[id];
	if (lordName !== undefined) return lordName;
	const def: CharacterDef | undefined = RAW_CHARACTERS.find((d) => d.id === id);
	return def === undefined ? undefined : def.special.name;
}

/** artIds SKILL_ICON key of each lord special: the icon of its weapon. */
const LORD_SPECIAL_ICON: Record<string, string> = {
	whirl: "lord_sword",
	dragonspear: "lord_spear",
	featherfan: "lord_fan",
};

/**
 * artIds SKILL_ICON key of the special in use. A lord's special is keyed by its weapon icon (whirl -> lord_sword, ...); a
 * lord using a general's special is keyed by that general's charId (found by the special's sim mode, unique per general);
 * a general's own special by the general's charId. mode is the special's sim mode.
 * undefined for soldiers and anything without an icon.
 */
export function specialIconKey(charId: string, mode: string): string | undefined {
	if (charId.sub(1, 5) === "lord_") {
		const weaponIcon = LORD_SPECIAL_ICON[mode];
		if (weaponIcon !== undefined) return weaponIcon;
		const owner: CharacterDef | undefined = RAW_CHARACTERS.find((d) => d.special.mode === mode);
		return owner === undefined ? undefined : owner.id;
	}
	return isGeneralId(charId) ? charId : undefined;
}

/** Category of a weapon item (lord weapon or general), or undefined when unknown. */
export function weaponTypeOf(id: string): WeaponType | undefined {
	return WEAPON_TYPE[id];
}

/** Display name of a weapon item: the lord weapon name, or 「<general>的兵器」. */
export function weaponItemName(id: string): string {
	const lordName = LORD_WEAPON_NAMES[id];
	if (lordName !== undefined) return lordName;
	const def = RAW_CHARACTERS.find((d) => d.id === id);
	return def === undefined ? id : `${def.name}的兵器`;
}

/** Display name of a special item: the lord special name, or the general's special name. */
export function specialItemName(id: string): string {
	const lordName = LORD_SPECIAL_NAMES[id];
	if (lordName !== undefined) return lordName;
	const def = RAW_CHARACTERS.find((d) => d.id === id);
	return def === undefined ? id : def.special.name;
}

/** Display name of a general charId for the camp page (falls back to the id). */
export function generalName(id: string): string {
	const def: CharacterDef | undefined = RAW_CHARACTERS.find((d) => d.id === id);
	return def === undefined ? id : def.name;
}

/** Lord stats: class base, plus level-up growth on the class's two growth stats (round-robin, skipping capped stats),
 *  plus +1 to every stat when the equipped weapon is of a preferred type. All stats capped at LORD_STAT_CAP. */
export function lordStatsFor(cls: LordClass, level: number, weaponId: string | undefined): Stats {
	const info = CLASS_INFO[cls];
	const s: Stats = {
		power: info.base.power,
		speed: info.base.speed,
		stamina: info.base.stamina,
		technique: info.base.technique,
		defense: info.base.defense,
	};
	const steps = math.clamp(math.floor(level), 1, LORD_LEVEL_MAX) - 1;
	let k = 0;
	for (let i = 0; i < steps; i++) {
		if (s[info.growth[k]] >= LORD_STAT_CAP) k = 1 - k;
		if (s[info.growth[k]] < LORD_STAT_CAP) s[info.growth[k]] += 1;
		k = 1 - k;
	}
	const wtype = weaponId === undefined ? undefined : weaponTypeOf(weaponId);
	if (wtype !== undefined && info.preferred.includes(wtype)) {
		s.power = math.min(LORD_STAT_CAP, s.power + 1);
		s.speed = math.min(LORD_STAT_CAP, s.speed + 1);
		s.stamina = math.min(LORD_STAT_CAP, s.stamina + 1);
		s.technique = math.min(LORD_STAT_CAP, s.technique + 1);
		s.defense = math.min(LORD_STAT_CAP, s.defense + 1);
	}
	return s;
}

function addOwned(list: string[], id: string): void {
	if (!list.includes(id)) list.push(id);
}

/** Choosing a class (first time or a switch): sets it, grants the class starter weapon and special (if not owned yet) and
 *  equips both. Mutates p only. */
export function chooseClassGear(p: Profile, cls: LordClass): void {
	p.lordClass = cls;
	const gear = starterGear(cls);
	addOwned(p.owned.weapons, gear.weapon);
	addOwned(p.owned.specials, gear.special);
	p.loadout.weapon = gear.weapon;
	p.loadout.special = gear.special;
}

/** Class for a save made before classes existed: from its old lord weapon (none = 鐵壁). */
export function legacyClass(w: LordWeapon | undefined): LordClass {
	if (w === "spear") return "mengjiang";
	if (w === "fan") return "junshi";
	return "tiebi";
}

/**
 * Makes the class and loadout of a profile consistent. Mutates p only; call after loading and after every class change.
 * - Old save (no lordClass, but a starter or an old lordWeapon): class from the old weapon. owned gets the class starter
 *   pair, and all three lord weapons and specials when the save had a lordWeapon (the old game let him pick any of them).
 *   The loadout becomes the class starter gear.
 * - Class set: the equipped weapon must be owned, and the equipped special must be owned and in the class pool; if not,
 *   the class starter item is equipped (and granted).
 * - No class and no starter (a new player): nothing changes.
 */
export function settleLoadout(p: Profile): void {
	if (p.lordClass === undefined) {
		if (p.starter === undefined && p.lordWeapon === undefined) return;
		const cls = legacyClass(p.lordWeapon);
		p.lordClass = cls;
		if (p.lordWeapon !== undefined) {
			for (const id of LORD_WEAPON_IDS) addOwned(p.owned.weapons, id);
			for (const id of LORD_SPECIAL_IDS) addOwned(p.owned.specials, id);
		}
		const gear = starterGear(cls);
		addOwned(p.owned.weapons, gear.weapon);
		addOwned(p.owned.specials, gear.special);
		p.loadout = { weapon: gear.weapon, special: gear.special };
		return;
	}
	const cls = p.lordClass;
	const gear = starterGear(cls);
	const lo = p.loadout;
	if (lo.weapon === undefined || !p.owned.weapons.includes(lo.weapon)) {
		lo.weapon = gear.weapon;
		addOwned(p.owned.weapons, gear.weapon);
	}
	if (lo.special === undefined || !p.owned.specials.includes(lo.special) || !classPool(cls).includes(lo.special)) {
		lo.special = gear.special;
		addOwned(p.owned.specials, gear.special);
	}
}

/** The weapon that is really in use: the equipped weapon when it can be equipped now, else the class starter weapon. */
export function effectiveWeapon(cls: LordClass, weaponId: string | undefined): string {
	return weaponId !== undefined && isEquippableWeapon(weaponId) ? weaponId : CLASS_INFO[cls].starterWeapon;
}

/** The special that is really in use: the equipped special when it is legal for the class and owned (see isLegalSpecial),
 *  else the class starter special. */
export function effectiveSpecial(cls: LordClass, specialId: string | undefined, owned: string[]): string {
	return specialId !== undefined && isLegalSpecial(cls, specialId, owned) ? specialId : CLASS_INFO[cls].starterSpecial;
}

/** Lord weapon attack type of the weapon in use (see effectiveWeapon). */
export function attackFor(weaponId: string | undefined, cls: LordClass): LordWeapon {
	const fromItem = weaponId === undefined ? undefined : lordWeaponAttack(weaponId);
	if (fromItem !== undefined) return fromItem;
	const fallback = lordWeaponAttack(starterGear(cls).weapon);
	return fallback === undefined ? "sword" : fallback;
}
