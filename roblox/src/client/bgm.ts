// Background music: one looping track per game screen, cross-faded. Tracks from Roblox's licensed music
// library (APM / DistroKid), picked by the user on 2026-11-26. A key with no id plays silence.
const SoundService = game.GetService("SoundService");
const TweenService = game.GetService("TweenService");

export type BgmKey = "menu" | "match" | "pk" | "victory" | "none";

interface Track {
	id: number | undefined;
	volume: number;
	loop: boolean;
}

const TRACKS: Record<Exclude<BgmKey, "none">, Track> = {
	menu: { id: 112388981050505, volume: 0.35, loop: true }, // Echoes of the Great Wall
	match: { id: undefined, volume: 0.25, loop: true }, // TODO: user picking (round 2)
	pk: { id: 9041879299, volume: 0.3, loop: true }, // Territory Conquest Alternate 2
	victory: { id: 1836860398, volume: 0.45, loop: false }, // Winning Spirit
};

const FADE = 1;
let current: BgmKey = "none";
let playing: Sound | undefined;
let folder: Folder | undefined;

function fadeOut(s: Sound): void {
	const tw = TweenService.Create(s, new TweenInfo(FADE), { Volume: 0 });
	tw.Completed.Connect(() => s.Destroy());
	tw.Play();
}

/** Switches to the track for `key` (no-op if it is already playing). */
export function setBgm(key: BgmKey): void {
	if (key === current) return;
	current = key;
	if (playing !== undefined) {
		fadeOut(playing);
		playing = undefined;
	}
	if (key === "none") return;
	const t = TRACKS[key];
	if (t.id === undefined) return;
	if (folder === undefined) {
		folder = new Instance("Folder");
		folder.Name = "Bgm";
		folder.Parent = SoundService;
	}
	const s = new Instance("Sound");
	s.Name = key;
	s.SoundId = `rbxassetid://${t.id}`;
	s.Looped = t.loop;
	s.Volume = 0;
	s.Parent = folder;
	s.Play();
	TweenService.Create(s, new TweenInfo(FADE), { Volume: t.volume }).Play();
	playing = s;
}
