// Persistent player profile (save data) shared shape and remotes. Server owns the data; clients read it via GetProfile.
import type { LordClass } from "shared/game/data";
import type { LordWeapon } from "shared/net";
import type { CosmeticsSave } from "shared/cosmetics";
const ReplicatedStorage = game.GetService("ReplicatedStorage");
const RunService = game.GetService("RunService");

export type Country = "shu" | "wei" | "wu";

/** Version 2: lord classes, owned items and loadout (version 1 saves are migrated on load, see loadout.ts settleLoadout). */
export const PROFILE_VERSION = 2;

/** Items the lord owns: weapon ids (lord_* or a general charId) and special ids (whirl / dragonspear / featherfan or a general charId). */
export interface OwnedItems {
	weapons: string[];
	specials: string[];
}

/** Equipped items. Undefined only before the lord has a class. */
export interface Loadout {
	weapon?: string;
	special?: string;
}

export interface Profile {
	version: number;
	country?: Country;
	starter?: string;
	lordLevel: number;
	lordXp: number;
	coins: number;
	recruited: string[];
	cleared: string[];
	/** The lord's class (流派). Undefined until chosen. */
	lordClass?: LordClass;
	owned: OwnedItems;
	loadout: Loadout;
	/** Lord cosmetic parts (R3b-2): per-slot picks and the auto flag. Undefined in old saves (read as auto with no picks). */
	cosmetics?: CosmeticsSave;
	/** Old save field (version 1). Read only by the migration; nothing writes it any more. */
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
			owned: { weapons: [], specials: [] },
			loadout: {},
		cosmetics: { auto: true, picks: {} },
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
