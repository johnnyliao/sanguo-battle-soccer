// Builds CharacterDef arrays for story matches: the player's team (lord, starter, recruits, own soldiers) and the
// enemy team of a stage. Story teams are never normalized (only the quick match getTeam() normalizes).
import { RAW_CHARACTERS, getTeam, type CharacterDef, type LordClass, type Role, type Stats } from "shared/game/data";
import { attackFor, classInfo, effectiveSpecial, effectiveWeapon, lordSpecialName, lordStatsFor } from "shared/loadout";
import type { Country } from "shared/net";
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

/** Formation slot preference of each class (first role with a free slot wins): 猛將 FW; 軍師 MF, FW when the team has no MF;
 *  鐵壁 DF. In a 1v1 the only slot is FW for everyone. */
const LORD_SLOT_PREF: Record<LordClass, Role[]> = {
	mengjiang: ["FW", "MF", "DF"],
	junshi: ["MF", "FW", "DF"],
	tiebi: ["DF", "MF", "FW"],
};

/** Slot index of the lord in a team of teamSize: the first slot whose role matches his class (see LORD_SLOT_PREF). */
export function lordSlot(lordClass: LordClass, teamSize: number): number {
	const roles = rolesFor(teamSize);
	for (const want of LORD_SLOT_PREF[lordClass]) {
		for (let i = 0; i < roles.size(); i++) {
			if (roles[i] === want) return i;
		}
	}
	error(`teamBuilder: no slot for lord class ${lordClass} in a team of ${teamSize}`);
}

/**
 * Lord (the player's own character), charId `lord_<userId>`, built from the profile: role = class position (the team slot
 * decides the real role, see buildPlayerTeam), stats = lordStatsFor(class, level, equipped weapon), weapon = attack type of
 * the equipped weapon, special = the equipped special. Items that cannot be equipped yet fall back to the class starter.
 */
export function lordDef(userId: number, displayName: string, country: Country, profile: Profile): CharacterDef {
	const cls = profile.lordClass;
	if (cls === undefined) error("teamBuilder: lord has no class");
	const equipWeapon = effectiveWeapon(cls, profile.loadout.weapon);
	const specialId = effectiveSpecial(cls, profile.loadout.special, profile.owned.specials);
	const general = RAW_CHARACTERS.find((d) => d.id === specialId);
	return {
		id: `lord_${userId}`,
		name: displayName,
		country,
		role: classInfo(cls).role,
		size: "M",
		stats: lordStatsFor(cls, profile.lordLevel, equipWeapon),
		weapon: attackFor(equipWeapon, cls),
		lordClass: cls,
		// A general's special is copied whole (kind, mode, noBall, bumpPct, name); a lord special keeps the straight shot.
		special:
			general !== undefined
				? { ...general.special }
				: {
						name: lordSpecialName(specialId) ?? specialId,
						kind: "straight",
						mode: specialId as CharacterDef["special"]["mode"],
						noBall: true,
					},
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

/** Formation line, back to front: the distance between two roles is the difference of their indices here. */
const LINE: Role[] = ["GK", "DF", "MF", "FW"];
/** Order in which the slots pick their general: goal first (the most limited), then attack, midfield and defence. */
const SLOT_PRIORITY: Role[] = ["GK", "FW", "MF", "DF"];

/** Who plays in a slot of the player team. */
export type SlotFill = { kind: "lord" } | { kind: "general"; def: CharacterDef } | { kind: "soldier" };

/** One slot of the player lineup: its formation role and who plays there. */
export interface LineupSlot {
	role: Role;
	fill: SlotFill;
}

/**
 * Distance on the line GK–DF–MF–FW between a general's natural role and a slot role, or undefined when he may not play
 * there. Goal takes only a GK or a DF general: an attacker or midfielder is never put in goal (a soldier is used instead).
 */
function fitDistance(natural: Role, slot: Role): number | undefined {
	if (slot === "GK" && natural !== "GK" && natural !== "DF") return undefined;
	return math.abs(LINE.indexOf(natural) - LINE.indexOf(slot));
}

/**
 * Slot assignment of a player team (pure and deterministic). The lord keeps lordIdx. The other slots are filled in
 * SLOT_PRIORITY order (formation order within a role). Each slot takes the available general with the smallest
 * fitDistance; ties go to the earlier general in `generals` (starter first, then recruits in recruit order). A slot with
 * no fitting general gets an own soldier. A general keeps his natural role when it matches the slot.
 */
export function assignSlots(roles: Role[], lordIdx: number, generals: CharacterDef[]): SlotFill[] {
	const fills: SlotFill[] = roles.map((): SlotFill => ({ kind: "soldier" }));
	fills[lordIdx] = { kind: "lord" };
	const free: CharacterDef[] = [...generals];
	for (const want of SLOT_PRIORITY) {
		for (let slot = 0; slot < roles.size(); slot++) {
			if (slot === lordIdx || roles[slot] !== want) continue;
			let best: number | undefined;
			let bestDist = math.huge;
			for (let g = 0; g < free.size(); g++) {
				const dist = fitDistance(free[g].role, want);
				if (dist !== undefined && dist < bestDist) {
					best = g;
					bestDist = dist;
				}
			}
			if (best !== undefined) {
				fills[slot] = { kind: "general", def: free[best] };
				free.remove(best);
			}
		}
	}
	return fills;
}

/**
 * Lineup of the player team of a story match with teamSize players, in formation order: the same slot rule as
 * buildPlayerTeam (see assignSlots). The generals are the starter, then the recruits in recruit order.
 */
export function lineupFor(profile: Profile, teamSize: number): LineupSlot[] {
	const cls = profile.lordClass;
	const starter = profile.starter;
	if (cls === undefined || starter === undefined) error("teamBuilder: profile has no starter or class");
	const roles = rolesFor(teamSize);

	const ids: string[] = [starter];
	for (const id of profile.recruited) {
		if (!ids.includes(id)) ids.push(id);
	}
	const generals: CharacterDef[] = [];
	for (const id of ids) {
		const d = findRaw(id);
		if (d !== undefined) generals.push(d);
	}
	const fills = assignSlots(roles, lordSlot(cls, teamSize), generals);
	return roles.map((role, i): LineupSlot => ({ role, fill: fills[i] }));
}

/** Short label of a lineup slot for the server log, e.g. "GK:許褚". */
function describeSlot(s: LineupSlot): string {
	const fill = s.fill;
	const who = fill.kind === "lord" ? "主公" : fill.kind === "general" ? fill.def.name : "士兵";
	return `${s.role}:${who}`;
}

/**
 * Player team for a story match, in formation order (see lineupFor): the lord takes the slot lordSlot() gives his class,
 * generals take the slots of their role (or the nearest role), leftover slots take own soldiers. Each def gets its slot
 * role. Prints the slots once for testers.
 */
export function buildPlayerTeam(profile: Profile, lord: CharacterDef, teamSize: number): CharacterDef[] {
	const country = profile.country;
	if (country === undefined) error("teamBuilder: profile has no country");
	const lineup = lineupFor(profile, teamSize);

	const team: CharacterDef[] = [];
	for (const slot of lineup) {
		const fill = slot.fill;
		if (fill.kind === "lord") team.push(withRole(lord, slot.role));
		else if (fill.kind === "general") team.push(withRole(fill.def, slot.role));
		else team.push(withRole(ownSoldierDef(country), slot.role));
	}
	print(`[team] slots ${lineup.map(describeSlot).join(" ")}`);
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
