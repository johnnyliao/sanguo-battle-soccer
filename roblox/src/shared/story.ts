// Story mode (chapter 1) data: starters, recruits, stage list. Pure data and helpers; never writes the profile.
import { COUNTRY_INFO, RAW_CHARACTERS } from "shared/game/data";
import type { Country } from "shared/net";
import type { Profile } from "shared/profileTypes";

/** Starter candidates per country (the player picks one of these at the first story start). */
export const STARTERS: Record<Country, string[]> = {
	shu: ["guanyu", "zhaoyun", "zhugeliang"],
	wei: ["zhangliao", "xuchu", "simayi"],
	wu: ["zhouyu", "sunce", "xiaoqiao"],
};

/** The two generals of the country that are never candidates: c (stage 6) and d (stage 7). */
export const EXTRA: Record<Country, [string, string]> = {
	shu: ["zhangfei", "machao"],
	wei: ["zhenji", "caocao"],
	wu: ["daqiao", "sunquan"],
};

/** The country the chapter-1 stage 8 fights against. */
export const RIVAL: Record<Country, Country> = {
	shu: "wei",
	wei: "wu",
	wu: "shu",
};

export const LAST_STAGE_ID = 8;

/** Stage 0 is the guided tutorial: one lord (with his weapon) against one 黃巾兵. */
export const TUTORIAL_STAGE_ID = 0;
/** The tutorial's match clock is effectively unlimited; the tutorial ends only through its steps. */
export const TUTORIAL_HALF_SECONDS = 3600;

export interface StageEnemy {
	/** huangjin = 黃巾兵, huangjinBoss = 黃巾頭目, general = a named general (boss), rivalTeam = the whole rival country team. */
	kind: "huangjin" | "huangjinBoss" | "general" | "rivalTeam";
	charId?: string;
}

export interface StageDef {
	id: number; // 0..8 (0 = tutorial)
	teamSize: number;
	/** One entry per enemy player (teamSize entries), except rivalTeam which is a single entry for the whole team. */
	enemy: StageEnemy[];
	bossCharId?: string;
	recruit?: string;
	title: string;
	intro: string[]; // 1-2 short lines shown at stage start
	recruitLine?: string;
	/** First team to this many goals wins at once (no clock, no halftime, no PK). Unset = normal timed match. */
	goalTarget?: number;
}

/** Display name for a general charId; falls back to the id. */
export function nameOf(charId: string): string {
	for (const d of RAW_CHARACTERS) {
		if (d.id === charId) return d.name;
	}
	return charId;
}

/** True if starter is one of the candidates of the country. */
export function isStarterFor(country: Country, starter: string): boolean {
	return STARTERS[country].includes(starter);
}

/** Profile.cleared key for a stage id. */
export function clearedKey(stageId: number): string {
	return tostring(stageId);
}

/**
 * Stage list for a player with this country and starter. a, b are the two unchosen candidates in listed order;
 * c and d are EXTRA[country][0] and [1].
 */
export function getStages(country: Country, starter: string): StageDef[] {
	if (!isStarterFor(country, starter)) {
		error(`getStages: ${starter} is not a starter of ${country}`);
	}
	const rival = RIVAL[country];
	const rest = STARTERS[country].filter((x) => x !== starter);
	const a = rest[0];
	const b = rest[1];
	const c = EXTRA[country][0];
	const d = EXTRA[country][1];
	const rivalName = COUNTRY_INFO[rival].name;

	return [
		{
			id: 0,
			teamSize: 1,
			enemy: [{ kind: "huangjin" }],
			title: "教學：主公初陣",
			intro: ["主公，先熟悉一下戰場吧！", "打倒那個黃巾兵，讓天下見識你的武藝！"],
		},
		{
			id: 1,
			teamSize: 1,
			enemy: [{ kind: "huangjin" }],
			title: "第一關 黃巾初陣",
			intro: ["黃巾賊作亂！主公親自上陣！", "先進 3 球就贏！"],
			goalTarget: 3,
		},
		{
			id: 2,
			teamSize: 1,
			enemy: [{ kind: "huangjinBoss" }],
			title: "第二關 黃巾頭目",
			intro: ["黃巾頭目橫行鄉里，主公前去討伐！"],
		},
		{
			id: 3,
			teamSize: 1,
			enemy: [{ kind: "general", charId: a }],
			bossCharId: a,
			recruit: a,
			title: `第三關 單挑${nameOf(a)}`,
			intro: [`${nameOf(a)}聞訊而來，欲與主公一決高下！`],
			recruitLine: `${nameOf(a)}心服口服，願隨主公征戰！`,
		},
		{
			id: 4,
			teamSize: 2,
			enemy: [{ kind: "huangjin" }, { kind: "huangjin" }],
			title: "第四關 雙將出陣",
			intro: ["黃巾兵再度來襲，主公與夥伴並肩迎敵！"],
		},
		{
			id: 5,
			teamSize: 2,
			enemy: [{ kind: "general", charId: b }, { kind: "huangjin" }],
			bossCharId: b,
			recruit: b,
			title: `第五關 ${nameOf(b)}`,
			intro: [`${nameOf(b)}率黃巾兵擋路！`],
			recruitLine: `${nameOf(b)}拱手相投，願助主公一臂之力！`,
		},
		{
			id: 6,
			teamSize: 3,
			enemy: [{ kind: "general", charId: c }, { kind: "huangjin" }, { kind: "huangjin" }],
			bossCharId: c,
			recruit: c,
			title: `第六關 ${nameOf(c)}`,
			intro: [`${nameOf(c)}率黃巾兵來襲！`],
			recruitLine: `${nameOf(c)}歸順主公，共襄大業！`,
		},
		{
			id: 7,
			teamSize: 4,
			enemy: [
				{ kind: "general", charId: d },
				{ kind: "huangjin" },
				{ kind: "huangjin" },
				{ kind: "huangjin" },
			],
			bossCharId: d,
			recruit: d,
			title: `第七關 ${nameOf(d)}`,
			intro: [`${nameOf(d)}親率大軍壓境！`],
			recruitLine: `${nameOf(d)}心悅誠服，從此追隨主公！`,
		},
		{
			id: 8,
			teamSize: 5,
			enemy: [{ kind: "rivalTeam" }],
			title: `第八關 ${rivalName}決戰`,
			intro: [`${rivalName}大軍壓境，第一章決戰！`],
		},
	];
}

/** Stage 0 (tutorial) is always open; stage k (k >= 1) opens once stage k-1 is in profile.cleared. */
export function isUnlocked(profile: Profile, stageId: number): boolean {
	if (stageId < TUTORIAL_STAGE_ID || stageId > LAST_STAGE_ID) return false;
	if (stageId === TUTORIAL_STAGE_ID) return true;
	// A stage already cleared stays open (older saves cleared stage 1 before the tutorial existed).
	return profile.cleared.includes(clearedKey(stageId)) || profile.cleared.includes(clearedKey(stageId - 1));
}
