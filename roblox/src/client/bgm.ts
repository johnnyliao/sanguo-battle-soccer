// Background music: one track per game screen, cross-faded. Tracks from Roblox's licensed music library
// (APM / DistroKid), picked by the user on 2026-11-26. A key with several ids plays them in random order
// (never the same one twice in a row); a single-id key loops (or plays once when loop is false).
const SoundService = game.GetService("SoundService");
const TweenService = game.GetService("TweenService");

export type BgmKey = "menu" | "match" | "pk" | "victory" | "none";

interface Track {
	ids: number[];
	volume: number;
	loop: boolean;
}

const TRACKS: Record<Exclude<BgmKey, "none">, Track> = {
	menu: { ids: [112388981050505], volume: 0.35, loop: true }, // Echoes of the Great Wall
	// 晨风剑影破长空 / Steel Answers Steel 以鋒對鋒 / What Waits at the Summit 峰頂之敵 — shuffled
	match: { ids: [107364391858605, 91628804945837, 91572314653289], volume: 0.25, loop: true },
	pk: { ids: [9041879299], volume: 0.3, loop: true }, // Territory Conquest Alternate 2
	victory: { ids: [1836860398], volume: 0.45, loop: false }, // Winning Spirit
};

const FADE = 1;
const rng = new Random();
let current: BgmKey = "none";
let playing: Sound | undefined;
let lastId: number | undefined;
let folder: Folder | undefined;

function fadeOut(s: Sound): void {
	const tw = TweenService.Create(s, new TweenInfo(FADE), { Volume: 0 });
	tw.Completed.Connect(() => s.Destroy());
	tw.Play();
}

/** Random id from the list, avoiding the one that just played when there is a choice. */
function pickId(ids: number[]): number {
	if (ids.size() === 1) return ids[0];
	const pool = ids.filter((id) => id !== lastId);
	return pool[rng.NextInteger(0, pool.size() - 1)];
}

function startTrack(key: Exclude<BgmKey, "none">, fadeIn: boolean): void {
	const t = TRACKS[key];
	if (t.ids.size() === 0) return;
	if (folder === undefined) {
		folder = new Instance("Folder");
		folder.Name = "Bgm";
		folder.Parent = SoundService;
	}
	const id = pickId(t.ids);
	lastId = id;
	const s = new Instance("Sound");
	s.Name = key;
	s.SoundId = `rbxassetid://${id}`;
	const shuffle = t.ids.size() > 1;
	s.Looped = t.loop && !shuffle;
	s.Volume = fadeIn ? 0 : t.volume;
	s.Parent = folder;
	if (shuffle && t.loop) {
		s.Ended.Connect(() => {
			if (playing !== s || current !== key) return;
			s.Destroy();
			startTrack(key, false);
		});
	}
	s.Play();
	if (fadeIn) TweenService.Create(s, new TweenInfo(FADE), { Volume: t.volume }).Play();
	playing = s;
}

/** Switches to the music for `key` (no-op if it is already playing). */
export function setBgm(key: BgmKey): void {
	if (key === current) return;
	current = key;
	if (playing !== undefined) {
		fadeOut(playing);
		playing = undefined;
	}
	if (key !== "none") startTrack(key, true);
}
