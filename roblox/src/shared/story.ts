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

/**
 * What a defeated general says when he joins the lord (the post-victory recruit scene): two lines, by charId. The lord's
 * answer is added by the client. Falls back to the stage's recruitLine when a general has no entry.
 */
export const RECRUIT_LINES: Record<string, string[]> = {
	zhangfei: ["哈哈哈！好小子，有兩下子嘛！", "俺張飛服了！這個主公，俺認了！"],
	guanyu: ["好身手！我關雲長佩服。", "從今以後，願為主公效力！"],
	zhugeliang: ["勝負之數，早已在我心中。", "願為主公運籌帷幄，共定天下。"],
	machao: ["痛快！痛快！我馬孟起心服口服。", "西涼鐵騎，願隨主公縱橫天下！"],
	zhaoyun: ["將軍好身手，趙子龍佩服。", "一身是膽，願為主公赴湯蹈火！"],
	xuchu: ["嘿！好力氣，俺許仲康服了！", "以後誰敢欺負主公，俺第一個衝上去！"],
	caocao: ["哼，勝者為王，敗者為寇。", "孤敬你是條好漢，從今起隨孤縱橫天下！"],
	zhenji: ["妾身輸得心服口服。", "願以一片冰心，侍奉主公左右。"],
	simayi: ["嘿嘿……老夫算漏了一步。", "此後，老夫的計謀盡歸主公所用。"],
	zhangliao: ["好一個主公，張文遠心服口服。", "從今以後，這一身武藝都是主公的了！"],
	sunquan: ["江東的水，也比不上你的勇氣。", "好！孤願與主公同舟共濟。"],
	daqiao: ["哎呀，輸給你啦！", "我會好好幫主公照顧大家的，放心吧！"],
	zhouyu: ["這一局，周公瑾輸得心服。", "東風已至，願為主公助一臂之力。"],
	xiaoqiao: ["嘻嘻，你好厲害喔！", "以後我們就是一起的夥伴囉，多多指教！"],
	sunce: ["哈哈！痛快！痛快！", "我孫伯符服了，從今以後，江東的風為主公而吹！"],
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
			intro: ["黃巾頭目橫行鄉里，主公前去討伐！", "先進 3 球就贏！"],
			goalTarget: 3,
		},
		{
			id: 3,
			teamSize: 1,
			enemy: [{ kind: "general", charId: a }],
			bossCharId: a,
			recruit: a,
			title: `第三關 單挑${nameOf(a)}`,
			intro: [`${nameOf(a)}聞訊而來，欲與主公一決高下！`, "先進 3 球就贏！"],
			goalTarget: 3,
			recruitLine: `${nameOf(a)}心服口服，願隨主公征戰！`,
		},
		{
			id: 4,
			teamSize: 2,
			enemy: [{ kind: "huangjin" }, { kind: "huangjin" }],
			title: "第四關 雙將出陣",
			intro: ["黃巾兵再度來襲，主公與夥伴並肩迎敵！", "先進 3 球就贏！"],
			goalTarget: 3,
		},
		{
			id: 5,
			teamSize: 2,
			enemy: [{ kind: "general", charId: b }, { kind: "huangjin" }],
			bossCharId: b,
			recruit: b,
			title: `第五關 ${nameOf(b)}`,
			intro: [`${nameOf(b)}率黃巾兵擋路！`, "先進 3 球就贏！"],
			goalTarget: 3,
			recruitLine: `${nameOf(b)}拱手相投，願助主公一臂之力！`,
		},
		{
			id: 6,
			teamSize: 3,
			enemy: [{ kind: "general", charId: c }, { kind: "huangjin" }, { kind: "huangjin" }],
			bossCharId: c,
			recruit: c,
			title: `第六關 ${nameOf(c)}`,
			intro: [`${nameOf(c)}率黃巾兵來襲！`, "先進 3 球就贏！"],
			goalTarget: 3,
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
			intro: [`${nameOf(d)}親率大軍壓境！`, "先進 3 球就贏！"],
			goalTarget: 3,
			recruitLine: `${nameOf(d)}心悅誠服，從此追隨主公！`,
		},
		{
			id: 8,
			teamSize: 5,
			enemy: [{ kind: "rivalTeam" }],
			title: `第八關 ${rivalName}決戰`,
			intro: [`${rivalName}大軍壓境，第一章決戰！`, "先進 3 球就贏！"],
			goalTarget: 3,
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
