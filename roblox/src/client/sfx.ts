// Match sound effects: maps sim events to Roblox Creator Store sounds (Pro Sound Effects library, licensed by Roblox
// for use in any experience). Non-positional 2D sounds played from SoundService; each play is a short-lived clone so
// overlapping hits don't cut each other off.
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

const CUES: Record<string, Cue> = {
	whistle: { id: "rbxassetid://9118113825", volume: 0.5, maxLen: 0, gap: 0.3 }, // Referee Whistle 2
	kick: { id: "rbxassetid://9119322058", volume: 0.7, maxLen: 0.6, gap: 0.05 }, // Soccer Ball Kicks Bounces 5
	bounce: { id: "rbxassetid://9119319842", volume: 0.3, maxLen: 0.5, gap: 0.25 }, // Soccer Ball Bounces On Grass 4
	save: { id: "rbxassetid://9119335569", volume: 0.7, maxLen: 0, gap: 0.2 }, // Soccer Goalie Deflection 201
	punch: { id: "rbxassetid://9117971499", volume: 0.5, maxLen: 0.8, gap: 0.05 }, // Punch Crack And Thud 1
	heavy: { id: "rbxassetid://9113524242", volume: 0.6, maxLen: 1.0, gap: 0.08 }, // Body Impact 3
	down: { id: "rbxassetid://9113480915", volume: 0.5, maxLen: 0, gap: 0.1 }, // Body Fall Thud 2
	swing: { id: "rbxassetid://9114374276", volume: 0.3, maxLen: 0.5, gap: 0.05 }, // Fast Pass By Airy Whoosh 11
	special: { id: "rbxassetid://9125585526", volume: 0.45, maxLen: 2.5, gap: 0.3 }, // Gong Chinese Style Single Hit 2
	goal: { id: "rbxassetid://9120975307", volume: 0.6, maxLen: 0, gap: 1 }, // Wrestling Crowd 2
};

/** Sim event type -> cue key (events needing a field check are handled in cueFor). */
const BY_TYPE: Record<string, string> = {
	whistle: "whistle",
	kick: "kick",
	pkKick: "kick",
	bounce: "bounce",
	save: "save",
	down: "down",
	attack: "swing",
	// special: "special", // gong muted 2026-11-26 (too loud/busy); cue kept for later
	goal: "goal",
	rideHit: "heavy",
	riderHit: "heavy",
	sailCrash: "heavy",
};

const templates = new Map<string, Sound>();
const lastPlayed = new Map<string, number>();
let folder: Folder | undefined;

function template(key: string): Sound | undefined {
	const cue = CUES[key];
	if (cue === undefined) return undefined;
	let s = templates.get(key);
	if (s === undefined) {
		if (folder === undefined) {
			folder = new Instance("Folder");
			folder.Name = "MatchSfx";
			folder.Parent = SoundService;
		}
		s = new Instance("Sound");
		s.Name = key;
		s.SoundId = cue.id;
		s.Volume = cue.volume;
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
	const cue = CUES[key];
	const t = template(key);
	if (cue === undefined || t === undefined) return;
	const now = os.clock();
	const last = lastPlayed.get(key);
	if (last !== undefined && now - last < cue.gap) return;
	lastPlayed.set(key, now);
	const s = t.Clone();
	s.Parent = t.Parent;
	s.Play();
	if (cue.maxLen > 0) {
		task.delay(cue.maxLen, () => {
			if (s.Parent === undefined) return;
			TweenService.Create(s, new TweenInfo(0.15), { Volume: 0 }).Play();
		});
		Debris.AddItem(s, cue.maxLen + 0.3);
	} else {
		Debris.AddItem(s, 10);
	}
}

function cueFor(e: SimEventLite): string | undefined {
	const t = e.type;
	if (t === "hit") {
		const kind = e["kind"] as string | undefined;
		return kind === "tackle" || kind === "special" ? "heavy" : "punch";
	}
	if (t === "pkResult") return (e["outcome"] as string | undefined) === "goal" ? "goal" : undefined;
	return BY_TYPE[t];
}

/** Plays the sound for one sim event (no-op for events without a sound). */
export function onEvent(e: SimEventLite): void {
	const key = cueFor(e);
	if (key !== undefined) play(key);
}
