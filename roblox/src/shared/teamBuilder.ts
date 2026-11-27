// Builds CharacterDef arrays for story matches: the player's team (lord, starter, recruits, own soldiers) and the
// enemy team of a stage. Story teams are never normalized (only the quick match getTeam() normalizes).
import { RAW_CHARACTERS, getTeam, type CharacterDef, type Role, type Stats } from "shared/game/data";
import type { Country, LordWeapon } from "shared/net";
import type { Profile } from "shared/profileTypes";
import { RIVAL, type StageDef } from "shared/story";

/** Formation roles by team size, in slot order. Slot idx within a team = position in this list. */
const ROLES_BY_SIZE: Role[][] = [
	[],
	["FW"],
	["DF", "FW"],
	["GK", "DF", "FW"],
	["GK", "DF", "MF", "FW"],
	["GK", "DF", "MF", "MF", "FW"],
];

const LORD_BASE_STATS: Stats = { power: 5, speed: 6, stamina: 6, technique: 5, defense: 4 };
const LORD_MAX_LEVEL = 30;
const STAT_CAP = 9;
const STAT_KEYS: (keyof Stats)[] = ["power", "speed", "stamina", "technique", "defense"];
const BOSS_STAT_SCALE = 0.75;
/** Role used for the boss of huangjin stage 2 (1v1, so it lands in slot 0 anyway). */
const HUANGJIN_BOSS_ROLE: Role = "FW";

function rolesFor(teamSize: number): Role[] {
	if (teamSize < 1 || teamSize > 5) {
		error(`teamBuilder: team size must be 1..5, got ${teamSize}`);
	}
	return ROLES_BY_SIZE[teamSize];
}

function copyStats(s: Stats): Stats {
	return { power: s.power, speed: s.speed, stamina: s.stamina, technique: s.technique, defense: s.defense };
}

/** Soldiers have no special: L does nothing, so a carrier can be hit and lose the ball. */
function soldierSpecial(): CharacterDef["special"] {
	return { name: "無", kind: "straight", mode: "none" };
}

/** RAW_CHARACTERS entry by id, or undefined. */
function findRaw(charId: string): CharacterDef | undefined {
	for (const d of RAW_CHARACTERS) {
		if (d.id === charId) return d;
	}
	return undefined;
}

function rawDef(charId: string): CharacterDef {
	const d = findRaw(charId);
	if (d === undefined) error(`teamBuilder: unknown general ${charId}`);
	return d;
}

/** Copy of a def with the slot role applied. */
function withRole(d: CharacterDef, role: Role): CharacterDef {
	return { ...d, role, stats: copyStats(d.stats), special: { ...d.special } };
}

function checkTeam(team: CharacterDef[], teamSize: number, label: string): CharacterDef[] {
	if (team.size() !== teamSize) {
		error(`teamBuilder: ${label} team has ${team.size()} players, expected ${teamSize}`);
	}
	return team;
}

/** Each lord weapon's special (name and mode match specialText.ts / the sim's special modes). */
const LORD_SPECIAL: Record<LordWeapon, CharacterDef["special"]> = {
	sword: { name: "天子劍・旋風斬", kind: "straight", mode: "whirl", noBall: true },
	spear: { name: "破陣槍・龍騰", kind: "straight", mode: "dragonspear", noBall: true },
	fan: { name: "鳳翼扇・羽風陣", kind: "straight", mode: "featherfan", noBall: true },
};

/** Lord (the player's own character). charId `lord_<userId>`. Lv1 5/6/6/5/4; each level after 1 adds +1 round-robin. Weapon sets def.weapon and the matching special. */
export function lordDef(
	userId: number,
	displayName: string,
	country: Country,
	level: number,
	weapon: LordWeapon,
): CharacterDef {
	const stats = copyStats(LORD_BASE_STATS);
	const steps = math.clamp(math.floor(level), 1, LORD_MAX_LEVEL) - 1;
	let k = 0;
	for (let i = 0; i < steps; i++) {
		// Skip stats already at the cap; at most one full loop.
		for (let tries = 0; tries < STAT_KEYS.size() && stats[STAT_KEYS[k]] >= STAT_CAP; tries++) {
			k = (k + 1) % STAT_KEYS.size();
		}
		if (stats[STAT_KEYS[k]] < STAT_CAP) stats[STAT_KEYS[k]] += 1;
		k = (k + 1) % STAT_KEYS.size();
	}
	return {
		id: `lord_${userId}`,
		name: displayName,
		country,
		role: "FW",
		size: "M",
		stats,
		weapon,
		special: { ...LORD_SPECIAL[weapon] },
	};
}

/** Huangjin soldier (黃巾兵, 3/4/4/3/3, M) or huangjin boss (黃巾頭目, 5/5/5/4/4, L). `country` is the enemy Setup country. */
export function soldierDef(kind: "huangjin" | "huangjinBoss", country: Country): CharacterDef {
	if (kind === "huangjin") {
		return {
			id: "xiaobing_huangjin",
			name: "黃巾兵",
			country,
			role: "MF",
			size: "M",
			stats: { power: 3, speed: 4, stamina: 4, technique: 3, defense: 3 },
			special: soldierSpecial(),
		};
	}
	return {
		id: "xiaobing_huangjin_boss",
		name: "黃巾頭目",
		country,
		role: "FW",
		size: "L",
		stats: { power: 5, speed: 5, stamina: 5, technique: 4, defense: 4 },
		special: soldierSpecial(),
	};
}

/** Own soldier used to fill a player team when there are not enough generals. */
function ownSoldierDef(country: Country): CharacterDef {
	return {
		id: `xiaobing_${country}`,
		name: "士兵",
		country,
		role: "MF",
		size: "M",
		stats: { power: 3, speed: 4, stamina: 4, technique: 3, defense: 3 },
		special: soldierSpecial(),
	};
}

/** Boss copy of a general with every stat scaled by 0.75 (rounded, min 1). */
export function bossDef(charId: string): CharacterDef {
	const d = rawDef(charId);
	const scale = (v: number): number => math.max(1, math.floor(v * BOSS_STAT_SCALE + 0.5));
	return {
		...d,
		stats: {
			power: scale(d.stats.power),
			speed: scale(d.stats.speed),
			stamina: scale(d.stats.stamina),
			technique: scale(d.stats.technique),
			defense: scale(d.stats.defense),
		},
		special: { ...d.special },
	};
}

/**
 * Player team for a story match, slot order = formation. The last slot is the lord (FW). The other slots take the
 * starter, then recruits in recruit order, then own soldiers. Each def gets the slot role.
 */
export function buildPlayerTeam(profile: Profile, lord: CharacterDef, teamSize: number): CharacterDef[] {
	const country = profile.country;
	const starter = profile.starter;
	if (country === undefined || starter === undefined) {
		error("teamBuilder: profile has no country or starter");
	}
	const roles = rolesFor(teamSize);

	const ids: string[] = [starter];
	for (const id of profile.recruited) {
		if (!ids.includes(id)) ids.push(id);
	}
	const pool: CharacterDef[] = [];
	for (const id of ids) {
		const d = findRaw(id);
		if (d !== undefined && pool.size() < teamSize - 1) pool.push(d);
	}

	const team: CharacterDef[] = [];
	for (let slot = 0; slot < teamSize - 1; slot++) {
		const base = slot < pool.size() ? pool[slot] : ownSoldierDef(country);
		team.push(withRole(base, roles[slot]));
	}
	team.push(withRole(lord, roles[teamSize - 1]));
	return checkTeam(team, teamSize, "player");
}

/** Slot for a boss: a free slot whose role matches its natural role; else the first free slot that is not the last. */
function pickBossSlot(taken: Map<number, CharacterDef>, roles: Role[], natural: Role): number {
	for (let i = 0; i < roles.size(); i++) {
		if (!taken.has(i) && roles[i] === natural) return i;
	}
	// No matching role: a non-GK boss goes to a field slot (prefer the attacking end), never in goal.
	if (natural !== "GK") {
		for (let i = roles.size() - 1; i >= 0; i--) {
			if (!taken.has(i) && roles[i] !== "GK") return i;
		}
	}
	for (let i = 0; i < roles.size(); i++) {
		if (!taken.has(i)) return i;
	}
	error("teamBuilder: no free slot for boss");
}

function firstFreeSlot(taken: Map<number, CharacterDef>, teamSize: number): number {
	for (let i = 0; i < teamSize; i++) {
		if (!taken.has(i)) return i;
	}
	error("teamBuilder: no free slot for soldier");
}

/**
 * Enemy team for a stage. rivalTeam = getTeam(rival) (normalized, the rival's full 5-player team). Otherwise bosses
 * are placed first, then huangjin soldiers fill the remaining slots; enemy side country = RIVAL[playerCountry].
 */
export function buildEnemyTeam(stage: StageDef, playerCountry: Country): CharacterDef[] {
	const roles = rolesFor(stage.teamSize);
	const awayCountry = RIVAL[playerCountry];

	if (stage.enemy.size() === 1 && stage.enemy[0].kind === "rivalTeam") {
		return checkTeam(getTeam(awayCountry), stage.teamSize, "rival");
	}
	if (stage.enemy.size() !== stage.teamSize) {
		error(`teamBuilder: stage ${stage.id} has ${stage.enemy.size()} enemy entries, expected ${stage.teamSize}`);
	}

	const taken = new Map<number, CharacterDef>();
	for (const e of stage.enemy) {
		if (e.kind === "general") {
			if (e.charId === undefined) error(`teamBuilder: stage ${stage.id} general without charId`);
			const natural = rawDef(e.charId).role;
			const slot = pickBossSlot(taken, roles, natural);
			taken.set(slot, withRole(bossDef(e.charId), roles[slot]));
		} else if (e.kind === "huangjinBoss") {
			const slot = pickBossSlot(taken, roles, HUANGJIN_BOSS_ROLE);
			taken.set(slot, withRole(soldierDef("huangjinBoss", awayCountry), roles[slot]));
		}
	}
	for (const e of stage.enemy) {
		if (e.kind === "huangjin") {
			const slot = firstFreeSlot(taken, stage.teamSize);
			taken.set(slot, withRole(soldierDef("huangjin", awayCountry), roles[slot]));
		}
	}

	const out: CharacterDef[] = [];
	for (let i = 0; i < stage.teamSize; i++) {
		const d = taken.get(i);
		if (d === undefined) error(`teamBuilder: stage ${stage.id} left an enemy slot empty`);
		out.push(d);
	}
	return checkTeam(out, stage.teamSize, "enemy");
}
