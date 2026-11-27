// Server match sessions. Each player has at most one MatchInstance (quick match or story stage) that only that player
// sees. Routes Command/Input, steps every instance from Heartbeat, and pays story rewards to the profile.
import { COUNTRY_INFO, getTeam, SIZE_PARAMS } from "shared/game/data";
import { createInitialState, defaultFieldFor, type GameState, type MatchSetup } from "shared/game/sim";
import { getRemotes, type Country, type Setup, type SetupPlayer, type StoryResult } from "shared/net";
import { buildEnemyTeam, buildPlayerTeam, lordDef } from "shared/teamBuilder";
import {
	clearedKey,
	getStages,
	isStarterFor,
	isUnlocked,
	LAST_STAGE_ID,
	RIVAL,
	TUTORIAL_HALF_SECONDS,
	TUTORIAL_STAGE_ID,
	type StageDef,
} from "shared/story";
import { parseLordWeapon } from "shared/profileTypes";
import { loadProfile, updateProfile } from "./profile";
import { MatchInstance } from "./matchInstance";

const Players = game.GetService("Players");
const RunService = game.GetService("RunService");

const COUNTRIES: Country[] = ["shu", "wei", "wu"];
/** Idx of the human-controlled player in the quick match (home FW). */
const HUMAN_IDX = 4;
/** Story rewards. */
const WIN_XP = 100;
const WIN_COINS = 50;
const LOSE_XP = 30;
const LOSE_COINS = 10;
const XP_PER_LEVEL_STEP = 100;
const MAX_LORD_LEVEL = 30;

const remotes = getRemotes();
Players.CharacterAutoLoads = false;

/** The one running match per player. */
const sessions = new Map<Player, MatchInstance>();
/** Story matches that have not reached fulltime yet (the lord's weapon cannot change while one runs). */
const runningStories = new Set<MatchInstance>();

function parseCountry(v: unknown): Country | undefined {
	if (v === "shu" || v === "wei" || v === "wu") return v;
	return undefined;
}

function pickAway(home: Country): Country {
	const others = COUNTRIES.filter((c) => c !== home);
	return others[math.random(0, others.size() - 1)];
}

function newSeed(): number {
	return (os.time() + math.random(1, 1000000000)) % 2147483647;
}

function buildSetup(
	state: GameState,
	home: Country,
	away: Country,
	humanIdx: number,
	mode: "quick" | "story",
	stageId: number | undefined,
	awayLabel: string,
): Setup {
	const players = state.players.map(
		(p): SetupPlayer => ({
			idx: p.idx,
			charId: p.charId,
			name: p.name,
			team: p.team,
			role: p.role,
			size: p.size,
			radius: p.radius,
			weapon: p.weapon,
		}),
	);
	return {
		home,
		away,
		humanIdx,
		halfTicks: state.match.halfTicks,
		players,
		teamSize: state.teamSize,
		field: { w: state.field.w, d: state.field.d, goalHalfW: state.field.goalHalfW },
		mode,
		stageId,
		awayLabel,
	};
}

/** Replaces the player's running match (if any) with inst. */
function replaceSession(player: Player, inst: MatchInstance): void {
	const old = sessions.get(player);
	if (old !== undefined) {
		old.destroy();
		runningStories.delete(old);
	}
	sessions.set(player, inst);
}

function startQuick(player: Player, home: Country): void {
	const away = pickAway(home);
	const seed = newSeed();
	const state = createInitialState({ seed, teams: [getTeam(home), getTeam(away)] }, SIZE_PARAMS);
	const setup = buildSetup(state, home, away, HUMAN_IDX, "quick", undefined, COUNTRY_INFO[away].name);
	replaceSession(player, new MatchInstance(player, state, seed, HUMAN_IDX, setup));
}

function isRivalStage(stage: StageDef): boolean {
	return stage.enemy.size() === 1 && stage.enemy[0].kind === "rivalTeam";
}

function startStory(player: Player, raw: unknown): void {
	if (!typeIs(raw, "number")) return;
	const stageId = math.floor(raw);
	const profile = loadProfile(player);
	const country = profile.country;
	const starter = profile.starter;
	if (country === undefined || starter === undefined || !isStarterFor(country, starter)) {
		warn(`[story] start ignored, no starter yet: ${player.Name}`);
		return;
	}
	if (!isUnlocked(profile, stageId)) {
		warn(`[story] stage ${stageId} is locked for ${player.Name}`);
		return;
	}
	const stage = getStages(country, starter).find((st) => st.id === stageId);
	if (stage === undefined) return;

	const lord = lordDef(player.UserId, player.DisplayName, country, profile.lordLevel, profile.lordWeapon ?? "sword");
	const home = buildPlayerTeam(profile, lord, stage.teamSize);
	const away = buildEnemyTeam(stage, country);
	const seed = newSeed();
	const setupInput: MatchSetup = { seed, teams: [home, away], field: defaultFieldFor(stage.teamSize) };
	// Tutorial and goal-target stages have no clock: the match ends by its steps or by the goal target.
	if (stage.id === TUTORIAL_STAGE_ID || stage.goalTarget !== undefined) setupInput.halfSeconds = TUTORIAL_HALF_SECONDS;
	const state = createInitialState(setupInput, SIZE_PARAMS);

	// Dev hook (off unless attribute set): DebugStoryWin = true ends the stage at once as a 1-0 win.
	if (player.GetAttribute("DebugStoryWin") === true) {
		state.match.score[0] = 1;
		state.match.score[1] = 0;
		state.match.phase = "fulltime";
	}

	const humanIdx = stage.teamSize - 1; // home team's last slot is the lord (FW)
	const awayLabel = isRivalStage(stage) ? COUNTRY_INFO[RIVAL[country]].name : "黃巾軍";
	const setup = buildSetup(state, country, RIVAL[country], humanIdx, "story", stage.id, awayLabel);
	if (stage.goalTarget !== undefined) setup.goalTarget = stage.goalTarget;
	const inst = new MatchInstance(player, state, seed, humanIdx, setup, (done: MatchInstance) => {
		task.spawn(finishStory, done, stage);
	});
	replaceSession(player, inst);
	runningStories.add(inst);
	print(`[story] start ${player.Name} stage ${stage.id} teamSize ${stage.teamSize}`);
}

/** Pays the rewards for a finished story match and tells the owner. Yields (profile update). */
function finishStory(inst: MatchInstance, stage: StageDef): void {
	const player = inst.player;
	runningStories.delete(inst);
	if (sessions.get(player) !== inst) return;
	const s = inst.state;
	const pk = s.match.pk;
	const sc = pk === undefined || s.match.score[0] !== s.match.score[1] ? s.match.score : pk.score;
	const humanTeam = inst.humanIdx < s.teamSize ? 0 : 1;
	const won = sc[humanTeam] > sc[1 - humanTeam];

	const xp = won ? WIN_XP : LOSE_XP;
	const coins = won ? WIN_COINS : LOSE_COINS;
	const before = loadProfile(player);
	const levelBefore = before.lordLevel;
	const newRecruit =
		won && stage.recruit !== undefined && !before.recruited.includes(stage.recruit) ? stage.recruit : undefined;

	const after = updateProfile(player, (p) => {
		p.lordXp += xp;
		p.coins += coins;
		while (p.lordLevel < MAX_LORD_LEVEL && p.lordXp >= XP_PER_LEVEL_STEP * p.lordLevel) {
			p.lordXp -= XP_PER_LEVEL_STEP * p.lordLevel;
			p.lordLevel += 1;
		}
		if (won) {
			const key = clearedKey(stage.id);
			if (!p.cleared.includes(key)) p.cleared.push(key);
			if (newRecruit !== undefined && !p.recruited.includes(newRecruit)) p.recruited.push(newRecruit);
		}
	});

	const result: StoryResult = {
		stageId: stage.id,
		won,
		xp,
		coins,
		levelBefore,
		levelAfter: after.lordLevel,
		recruited: newRecruit,
		chapterClear: won && stage.id === LAST_STAGE_ID,
	};
	remotes.StoryResult.FireClient(player, result);
	print(
		`[story] result ${player.Name} stage ${stage.id} ${won ? "win" : "loss"} score ${sc[0]}-${sc[1]} ` +
			`xp +${xp} coins +${coins} Lv ${levelBefore}->${after.lordLevel}` +
			(newRecruit !== undefined ? ` recruited ${newRecruit}` : ""),
	);
}

/** Sets the lord's weapon. Ignored while this player's story match is running (the sim fixes the weapon at kickoff). */
function chooseWeapon(player: Player, rawWeapon: unknown): void {
	const weapon = parseLordWeapon(rawWeapon);
	if (weapon === undefined) {
		warn(`[profile] chooseWeapon rejected from ${player.Name}`);
		return;
	}
	const current = sessions.get(player);
	if (current !== undefined && runningStories.has(current)) {
		warn(`[profile] chooseWeapon ignored, story match running: ${player.Name}`);
		return;
	}
	updateProfile(player, (p) => {
		p.lordWeapon = weapon;
	});
	print(`[profile] weapon chosen ${player.Name} ${weapon}`);
}

function chooseStarter(player: Player, rawCountry: unknown, rawStarter: unknown): void {
	const country = parseCountry(rawCountry);
	if (country === undefined || !typeIs(rawStarter, "string") || !isStarterFor(country, rawStarter)) {
		warn(`[story] chooseStarter rejected from ${player.Name}`);
		return;
	}
	const starter: string = rawStarter;
	const profile = loadProfile(player);
	if (profile.starter !== undefined) {
		warn(`[story] chooseStarter ignored, ${player.Name} already has a starter`);
		return;
	}
	updateProfile(player, (p) => {
		p.country = country;
		p.starter = starter;
	});
	print(`[story] starter chosen ${player.Name} ${country} ${starter}`);
}

// Commands from the menu. "start" = quick match, "story" = story stage, "chooseStarter" = first story pick,
// "chooseWeapon" = lord weapon.
remotes.Command.OnServerEvent.Connect((player, raw) => {
	if (!typeIs(raw, "table")) return;
	const r = raw as { cmd?: unknown; country?: unknown; stageId?: unknown; starter?: unknown; weapon?: unknown };
	if (r.cmd === "start") {
		const country = parseCountry(r.country);
		if (country === undefined) return;
		startQuick(player, country);
	} else if (r.cmd === "story") {
		startStory(player, r.stageId);
	} else if (r.cmd === "chooseStarter") {
		chooseStarter(player, r.country, r.starter);
	} else if (r.cmd === "chooseWeapon") {
		chooseWeapon(player, r.weapon);
	}
});

// Raw held buttons from each player go to that player's own match only.
remotes.Input.OnServerEvent.Connect((player, raw) => {
	const inst = sessions.get(player);
	if (inst === undefined) return;
	inst.setInput(raw);
});

Players.PlayerRemoving.Connect((player: Player) => {
	const inst = sessions.get(player);
	if (inst === undefined) return;
	inst.destroy();
	runningStories.delete(inst);
	sessions.delete(player);
});

RunService.Heartbeat.Connect((dt: number) => {
	const list: MatchInstance[] = [];
	sessions.forEach((inst) => {
		list.push(inst);
	});
	for (const inst of list) {
		inst.update(dt);
	}
});
