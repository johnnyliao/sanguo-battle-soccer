// Persistent player profile (save data) shared shape and remotes. Server owns the data; clients read it via GetProfile.
import type { LordWeapon } from "shared/net";
const ReplicatedStorage = game.GetService("ReplicatedStorage");
const RunService = game.GetService("RunService");

export type Country = "shu" | "wei" | "wu";

export const PROFILE_VERSION = 1;

export interface Profile {
	version: number;
	country?: Country;
	starter?: string;
	lordLevel: number;
	lordXp: number;
	coins: number;
	recruited: string[];
	cleared: string[];
	/** The lord's weapon. Undefined until chosen (older saves have none). */
	lordWeapon?: LordWeapon;
}

/** Returns v when it is one of the three lord weapons, else undefined. */
export function parseLordWeapon(v: unknown): LordWeapon | undefined {
	if (v === "sword" || v === "spear" || v === "fan") return v;
	return undefined;
}

export function defaultProfile(): Profile {
	return {
		version: PROFILE_VERSION,
		lordLevel: 1,
		lordXp: 0,
		coins: 0,
		recruited: [],
		cleared: [],
	};
}

// ---------- remotes ----------

export const PROFILE_FOLDER = "ProfileNet";

export interface ProfileRemotes {
	GetProfile: RemoteFunction; // client -> server: () => Profile
	ProfileChanged: RemoteEvent; // server -> client: (profile: Profile)
}

/** Server creates the folder + remotes; clients wait for them. */
export function getProfileRemotes(): ProfileRemotes {
	if (RunService.IsServer()) {
		let folder = ReplicatedStorage.FindFirstChild(PROFILE_FOLDER) as Folder | undefined;
		if (!folder) {
			folder = new Instance("Folder");
			folder.Name = PROFILE_FOLDER;
			folder.Parent = ReplicatedStorage;
		}
		if (!folder.FindFirstChild("GetProfile")) {
			const f = new Instance("RemoteFunction");
			f.Name = "GetProfile";
			f.Parent = folder;
		}
		if (!folder.FindFirstChild("ProfileChanged")) {
			const e = new Instance("RemoteEvent");
			e.Name = "ProfileChanged";
			e.Parent = folder;
		}
		return {
			GetProfile: folder.FindFirstChild("GetProfile") as RemoteFunction,
			ProfileChanged: folder.FindFirstChild("ProfileChanged") as RemoteEvent,
		};
	}
	const folder = ReplicatedStorage.WaitForChild(PROFILE_FOLDER) as Folder;
	return {
		GetProfile: folder.WaitForChild("GetProfile") as RemoteFunction,
		ProfileChanged: folder.WaitForChild("ProfileChanged") as RemoteEvent,
	};
}
