// Loads each player's profile on join and serves it to clients through the GetProfile remote.
import { loadProfile, releaseProfile, saveProfile, updateProfile } from "./profile";
import { defaultProfile, getProfileRemotes, type Profile } from "shared/profileTypes";

const Players = game.GetService("Players");

const remotes = getProfileRemotes();
const seen = new Set<Player>();

function summarize(p: Profile): string {
	return "Lv" + p.lordLevel + " coins " + p.coins + " recruited " + p.recruited.size() + " cleared " + p.cleared.size();
}

function resetProfile(player: Player): void {
	updateProfile(player, (p) => {
		const d = defaultProfile();
		p.version = d.version;
		p.country = d.country;
		p.starter = d.starter;
		p.lordLevel = d.lordLevel;
		p.lordXp = d.lordXp;
		p.coins = d.coins;
		p.recruited = d.recruited;
		p.cleared = d.cleared;
		p.lordClass = d.lordClass;
		p.owned = d.owned;
		p.loadout = d.loadout;
		p.lordWeapon = d.lordWeapon;
	});
	saveProfile(player);
	print("[profile] reset", player.Name);
}

/** Debug hook: server-side attribute DebugResetProfile = true resets this player's profile to defaults. */
function checkDebugReset(player: Player): void {
	if (player.GetAttribute("DebugResetProfile") !== true) return;
	player.SetAttribute("DebugResetProfile", undefined);
	resetProfile(player);
}

function onJoin(player: Player): void {
	if (seen.has(player)) return;
	seen.add(player);
	const p = loadProfile(player);
	print("[profile] loaded", player.Name, summarize(p));
	checkDebugReset(player);
	player.GetAttributeChangedSignal("DebugResetProfile").Connect(() => {
		task.spawn(checkDebugReset, player);
	});
}

remotes.GetProfile.OnServerInvoke = (player) => loadProfile(player);

Players.PlayerAdded.Connect((player) => {
	task.spawn(onJoin, player);
});

Players.PlayerRemoving.Connect((player) => {
	seen.delete(player);
	releaseProfile(player);
});

for (const player of Players.GetPlayers()) {
	task.spawn(onJoin, player);
}
