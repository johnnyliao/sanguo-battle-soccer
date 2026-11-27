// Match sound effects: maps sim events to Roblox Creator Store sounds (Pro Sound Effects library, licensed by Roblox
// for use in any experience). Non-positional 2D sounds played from SoundService; each play is a short-lived clone so
// overlapping hits don't cut each other off. Picks chosen by the user on 2026-11-26 (audition page round 1).
import type { SimEventLite } from "shared/net";

const SoundService = game.GetService("SoundService");
const Debris = game.GetService("Debris");
const TweenService = game.GetService("TweenService");

interface Cue {
	id: string;
	volume: number;
	/** Stop (with a short fade) after this many seconds; 0 = play to the end. */
	maxLen: number;
	/** Minimum seconds between two plays of this cue (keeps bursts of events from stacking). */
	gap: number;
}

function cue(id: number, volume: number, maxLen = 0, gap = 0.05): Cue {
	return { id: `rbxassetid://${id}`, volume, maxLen, gap };
}

const CUES: Record<string, Cue> = {
	// --- match ---
	whistle: cue(9118113825, 0.5, 0, 0.3), // Referee Whistle 2
	kick: cue(9119322058, 0.7, 0.6), // Soccer Ball Kicks Bounces 5
	bounce: cue(9119319842, 0.3, 0.5, 0.25), // Soccer Ball Bounces On Grass 4
	save: cue(9119335569, 0.7, 0, 0.2), // Soccer Goalie Deflection 201
	down: cue(9113480915, 0.5, 0, 0.1), // Body Fall Thud 2
	goal: cue(9120975307, 0.6, 0, 1), // Wrestling Crowd 2
	// --- generic fallbacks (used where no per-weapon pick exists yet) ---
	swing: cue(9114374276, 0.3, 0.5), // Fast Pass By Airy Whoosh 11
	punch: cue(9117971499, 0.5, 0.8), // Punch Crack And Thud 1
	heavy: cue(9113535176, 0.6, 1.0, 0.08), // Body Slam Low End Thump 1 (tackle / special hits)
	// --- weapon swings ---
	swing_glaive: cue(9113077334, 0.4, 0.7), // Air Whoosh Heavy Bys And Impacts 1
	swing_axe: cue(9120729339, 0.4, 0.7), // Whoosh Heavy Punches 7
	swing_hammer: cue(9113305619, 0.45, 0.8), // Baseball Bat Swing 5
	swing_whip: cue(9113611449, 0.4, 0.7), // Buggy Whip Light Crack Swish 6
	swing_sword: cue(9119749145, 0.4, 0.7), // Sword Swish 102
	swing_fan: cue(9113840530, 0.35, 0.7), // Cloth Whooshes Light Air Wind 1
	// --- weapon hits ---
	hit_spear: cue(9114487369, 0.55, 0.6), // Flesh Stab 11
	hit_glaive: cue(9116481543, 0.55, 0.8), // Meat Chop Big Meaty Impacts 4
	hit_axe: cue(9116482367, 0.55, 0.8), // Meat Chop Big Meaty Impacts 14
	hit_hammer: cue(9113225986, 0.6, 1.0), // Axe Impact Giant Thuddy Hits 5
	hit_whip: cue(9113615753, 0.5, 0.6), // Buggy Whip Slap Light Crack 6
	hit_fan: cue(9114771714, 0.5, 0.8), // Hand Slap Claps 1
	hit_sword: cue(9119748927, 0.55, 0.7), // Sword Stab 1
	// --- specials ---
	zhangfei_roar: cue(9116302323, 0.6, 0, 0.3), // Lion Roar Short Blast Attack 2
	zhugeliang_charge: cue(9125973882, 0.5, 0, 0.3), // Energy Charge Up 1
	guanyu_ride: cue(9114896727, 0.5, 1.6, 0.3), // Kawasaki Z1000 Motorcycle 1
	zhugeliang_hit: cue(9116394876, 0.5, 1.5, 0.3), // Magic Glows Chiming Hits 2
	zhangliao_fear: cue(9113980319, 0.55, 2.0, 0.3), // Creature Mix Giant Crab Monster Roar 1
	xiaoqiao_gust: cue(9120718279, 0.5, 0, 0.3), // Whoosh Fast Swish By 1
	zhaoyun_lunge: cue(9126229255, 0.5, 0, 0.3), // Whoosh By Fast Airy Swooshing 2
	machao_cavalry: cue(117237268224853, 0.6, 0, 0.3), // Horse Neigh 2 (player upload, picked 2026-11-26)
	xuchu_guard: cue(9120048719, 0.55, 2.2, 0.3), // Tiger Roars 10
	xuchu_swallow: cue(9114688489, 0.6, 0, 0.3), // Gulping Slurp 4
	xuchu_spit: cue(9114810804, 0.6, 0, 0.3), // Spitting 1
	caocao_wave: cue(9114328260, 0.3, 0.8, 0.15), // Energy Cloud Whooshing By Fast 2 (fires every 0.2 s for 5 s)
	zhenji_ice: cue(9125611419, 0.5, 2.5, 0.3), // Ice Freeze Large Piece Crackles
	zhenji_pulse: cue(9114855626, 0.4, 1.0, 0.3), // Ice Block Shatter 1
	simayi_leap: cue(9113819586, 0.5, 0, 0.3), // Cloth Flap 11
	simayi_land: cue(9118686853, 0.6, 0, 0.3), // Rocks Dirt Impacts In Ground 30
	sunce_sail: cue(9120585252, 0.45, 2.5, 0.3), // Water Splash Big 1
	sunce_crash: cue(9114543259, 0.6, 1.5, 0.3), // Furniture Heavy Drops 4
	daqiao_portal: cue(9116418035, 0.5, 2.5, 0.3), // Magic Tone Falling Shimmer 3
	daqiao_summon: cue(9125648149, 0.5, 0, 0.3), // Magic Zoom Up Whoosh 8
	sunquan_ship: cue(9120881979, 0.6, 0, 0.3), // Wood Groan Creak 9
	sunquan_block: cue(9113160235, 0.5, 1.0, 0.15), // Arrow In And Hit 1
	sunquan_volley: cue(9113166218, 0.6, 0, 0.3), // Arrow Out Whooshing Pass By 2
	zhouyu_wind: cue(9120748924, 0.5, 0, 0.3), // Wind Burst Vortex Blasts 2
	// --- lord weapons (existing picks, longer cut for the whirl) ---
	lord_whirl: cue(9119749145, 0.5, 1.3, 0.3), // Sword Swish 102 (same file as swing_sword)
};

/** Weapon class per general (drives the swing and hit sounds). */
const WEAPON_OF: Record<string, string> = {
	zhaoyun: "spear",
	zhangfei: "spear",
	machao: "spear",
	guanyu: "glaive",
	zhangliao: "axe",
	sunce: "hammer",
	xuchu: "hammer",
	zhenji: "whip",
	caocao: "sword",
	sunquan: "sword",
	zhouyu: "sword",
	zhugeliang: "fan",
	simayi: "fan",
	xiaoqiao: "fan",
	daqiao: "fan",
};

/** Sim event type -> cue key for events that need no field check. */
const BY_TYPE: Record<string, string> = {
	whistle: "whistle",
	kick: "kick",
	pkKick: "kick",
	bounce: "bounce",
	save: "save",
	down: "down",
	goal: "goal",
	rideHit: "heavy",
	riderHit: "heavy",
	roar: "zhangfei_roar",
	beamCharge: "zhugeliang_charge",
	beamStrike: "zhugeliang_hit",
	rideStart: "guanyu_ride",
	fear: "zhangliao_fear",
	gustBlow: "xiaoqiao_gust",
	lungeStart: "zhaoyun_lunge",
	summonStart: "machao_cavalry",
	tigerStart: "xuchu_guard",
	tigerRoar: "xuchu_guard",
	tigerSwallow: "xuchu_swallow",
	tigerSpit: "xuchu_spit",
	slashWave: "caocao_wave",
	iceStart: "zhenji_ice",
	leapStart: "simayi_leap",
	leapLand: "simayi_land",
	sailStart: "sunce_sail",
	sailCrash: "sunce_crash",
	portalStart: "daqiao_portal",
	portalSummon: "daqiao_summon",
	arrowshipStart: "sunquan_ship",
	arrowshipBlock: "sunquan_block",
	arrowshipVolley: "sunquan_volley",
	eastwindStart: "zhouyu_wind",
	whirlStart: "lord_whirl",
	whirlHit: "hit_sword",
	dragonCharge: "zhugeliang_charge",
	dragonFire: "zhaoyun_lunge",
	dragonHit: "heavy",
	windpuffSpawn: "swing_fan",
	windpuffHit: "hit_fan",
	featherStart: "zhouyu_wind",
	featherPull: "xiaoqiao_gust",
};

const templates = new Map<string, Sound>();
const lastPlayed = new Map<string, number>();
let folder: Folder | undefined;

function template(key: string): Sound | undefined {
	const c = CUES[key];
	if (c === undefined) return undefined;
	let s = templates.get(key);
	if (s === undefined) {
		if (folder === undefined) {
			folder = new Instance("Folder");
			folder.Name = "MatchSfx";
			folder.Parent = SoundService;
		}
		s = new Instance("Sound");
		s.Name = key;
		s.SoundId = c.id;
		s.Volume = c.volume;
		s.Parent = folder;
		templates.set(key, s);
	}
	return s;
}

/** Creates the Sound templates up front so the assets start loading before the first event. */
export function preload(): void {
	for (const [key] of pairs(CUES)) template(key as string);
}

export function play(key: string): void {
	const c = CUES[key];
	const t = template(key);
	if (c === undefined || t === undefined) return;
	const now = os.clock();
	const last = lastPlayed.get(key);
	if (last !== undefined && now - last < c.gap) return;
	lastPlayed.set(key, now);
	const s = t.Clone();
	s.Parent = t.Parent;
	s.Play();
	if (c.maxLen > 0) {
		task.delay(c.maxLen, () => {
			if (s.Parent === undefined) return;
			TweenService.Create(s, new TweenInfo(0.15), { Volume: 0 }).Play();
		});
		Debris.AddItem(s, c.maxLen + 0.3);
	} else {
		Debris.AddItem(s, 10);
	}
}

/** Per-weapon cue `${prefix}_${class}` for the general, or the fallback when that pick doesn't exist. */
function weaponCue(prefix: string, charId: string | undefined, fallback: string): string {
	const cls = charId !== undefined ? WEAPON_OF[charId] : undefined;
	const key = cls !== undefined ? `${prefix}_${cls}` : undefined;
	return key !== undefined && CUES[key] !== undefined ? key : fallback;
}

function cueFor(e: SimEventLite, charOf: (idx: number) => string | undefined): string | undefined {
	const t = e.type;
	if (t === "attack") return weaponCue("swing", charOf((e["playerIdx"] as number | undefined) ?? -1), "swing");
	if (t === "hit") {
		const kind = e["kind"] as string | undefined;
		if (kind === "tackle" || kind === "special") return "heavy";
		return weaponCue("hit", charOf((e["attackerIdx"] as number | undefined) ?? -1), "punch");
	}
	if (t === "icePulse") {
		const v = e["victimIdxs"];
		return typeIs(v, "table") && (v as unknown[]).size() > 0 ? "zhenji_pulse" : undefined;
	}
	if (t === "pkResult") return (e["outcome"] as string | undefined) === "goal" ? "goal" : undefined;
	return BY_TYPE[t];
}

/** Plays the sound for one sim event (no-op for events without a sound). charOf maps a player index to its charId. */
export function onEvent(e: SimEventLite, charOf: (idx: number) => string | undefined): void {
	const key = cueFor(e, charOf);
	if (key !== undefined) play(key);
}
