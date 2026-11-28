// Server-side save data for player profiles. DataStore with in-memory fallback (Studio / unpublished place).
import { defaultProfile, getProfileRemotes, parseLordWeapon, PROFILE_VERSION, type Country, type Profile } from "shared/profileTypes";
import { isSpecialId, isWeaponId, parseLordClass, settleLoadout } from "shared/loadout";
import { RAW_CHARACTERS } from "shared/game/data";
import { LORD_MAX_LEVEL } from "shared/rank";
import { cosmeticDef, SLOTS, type CosmeticsSave } from "shared/cosmetics";

const DataStoreService = game.GetService("DataStoreService");
const Players = game.GetService("Players");
const RunService = game.GetService("RunService");

const STORE_NAME = "SanguoProfile_v1";
const ATTEMPTS = 3;
const RETRY_WAIT = 1;
const AUTOSAVE_INTERVAL = 60;
const BIND_TO_CLOSE_TIMEOUT = 25;

const remotes = getProfileRemotes();

const cache = new Map<Player, Profile>();
/** Players whose profile changed since the last save. */
const dirty = new Set<Player>();
/** Players whose load is in progress (dedupes concurrent loadProfile calls). */
const loading = new Set<Player>();
/** Load failed after retries: defaults are used and nothing is written back, so real data is not overwritten. */
const readOnly = new Set<Player>();
const memoryStore = new Map<string, Profile>();
let memoryMode = false;

type StoreResult = { kind: "ok"; value: unknown } | { kind: "unavailable"; err: string } | { kind: "failed"; err: string };

function keyFor(player: Player): string {
	return "u_" + tostring(player.UserId);
}

function copyProfile(p: Profile): Profile {
	return {
		...p,
		recruited: [...p.recruited],
		cleared: [...p.cleared],
		owned: { weapons: [...p.owned.weapons], specials: [...p.owned.specials] },
		loadout: { ...p.loadout },
		cosmetics: p.cosmetics === undefined ? undefined : { auto: p.cosmetics.auto, picks: { ...p.cosmetics.picks } },
	};
}

function parseCountry(v: unknown): Country | undefined {
	if (v === "shu" || v === "wei" || v === "wu") return v;
	return undefined;
}

function asNumber(v: unknown, def: number, min: number): number {
	return typeIs(v, "number") && v === v && v >= min && v < math.huge ? v : def;
}

function asStringArray(v: unknown): string[] {
	const out: string[] = [];
	if (typeIs(v, "table")) {
		for (const x of v as unknown[]) {
			if (typeIs(x, "string")) out.push(x);
		}
	}
	return out;
}

/** Keeps the strings that pass the id check (unknown ids and duplicates are dropped). */
function asItemIds(v: unknown, valid: (id: string) => boolean): string[] {
	const out: string[] = [];
	for (const id of asStringArray(v)) {
		if (valid(id) && !out.includes(id)) out.push(id);
	}
	return out;
}

/** Cosmetic save: auto (default on) and the hand picks that name a real part of their slot (or "none"). */
function sanitizeCosmetics(raw: unknown): CosmeticsSave {
	const out: CosmeticsSave = { auto: true, picks: {} };
	if (!typeIs(raw, "table")) return out;
	const r = raw as { [key: string]: unknown };
	const auto = r.auto;
	if (typeIs(auto, "boolean")) out.auto = auto;
	const picks = r.picks;
	if (typeIs(picks, "table")) {
		const pk = picks as { [key: string]: unknown };
		for (const slot of SLOTS) {
			const id = pk[slot];
			if (typeIs(id, "string") && (id === "none" || cosmeticDef(id)?.slot === slot)) out.picks[slot] = id;
		}
	}
	return out;
}

/** Fills missing fields from defaults and replaces invalid ones, then settles the lord's class and loadout (old saves
 *  are migrated here). Never throws. */
function sanitizeProfile(raw: unknown): Profile {
	const d = defaultProfile();
	if (!typeIs(raw, "table")) return d;
	const r = raw as { [key: string]: unknown };
	const starter = r.starter;
	const owned = typeIs(r.owned, "table") ? (r.owned as { [key: string]: unknown }) : {};
	const loadout = typeIs(r.loadout, "table") ? (r.loadout as { [key: string]: unknown }) : {};
	const p: Profile = {
		version: PROFILE_VERSION,
		country: parseCountry(r.country),
		starter: typeIs(starter, "string") ? starter : undefined,
		lordLevel: asNumber(r.lordLevel, d.lordLevel, 1),
		lordXp: asNumber(r.lordXp, d.lordXp, 0),
		coins: asNumber(r.coins, d.coins, 0),
		recruited: asStringArray(r.recruited),
		cleared: asStringArray(r.cleared),
		lordClass: parseLordClass(r.lordClass),
		owned: {
			weapons: asItemIds(owned.weapons, isWeaponId),
			specials: asItemIds(owned.specials, isSpecialId),
		},
		loadout: {
			weapon: typeIs(loadout.weapon, "string") && isWeaponId(loadout.weapon) ? loadout.weapon : undefined,
			special: typeIs(loadout.special, "string") && isSpecialId(loadout.special) ? loadout.special : undefined,
		},
		lordWeapon: parseLordWeapon(r.lordWeapon),
		cosmetics: sanitizeCosmetics(r.cosmetics),
	};
	settleLoadout(p);
	return p;
}

/** Switches the session to in-memory profiles. Warns only on the first switch. */
function enterMemoryMode(err: string): void {
	if (memoryMode) return;
	memoryMode = true;
	warn("[profile] DataStore unavailable, using in-memory profiles: " + err);
}

function hasText(s: string, needle: string): boolean {
	const [start] = string.find(s, needle, 1, true);
	return start !== undefined;
}

function isUnavailableError(err: string): boolean {
	return hasText(err, "API") || hasText(err, "Studio") || hasText(err, "publish");
}

function readStore(key: string): StoreResult {
	let lastErr = "";
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		const [ok, res] = pcall((): unknown => {
			const [value] = DataStoreService.GetDataStore(STORE_NAME).GetAsync<unknown>(key);
			return value;
		});
		if (ok) return { kind: "ok", value: res };
		lastErr = tostring(res);
		if (attempt === 1 && isUnavailableError(lastErr)) return { kind: "unavailable", err: lastErr };
		if (attempt < ATTEMPTS) task.wait(RETRY_WAIT);
	}
	return { kind: "failed", err: lastErr };
}

function writeStore(key: string, value: Profile): StoreResult {
	let lastErr = "";
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		const [ok, res] = pcall(() => {
			DataStoreService.GetDataStore(STORE_NAME).UpdateAsync<unknown, Profile>(
				key,
				() => value as unknown as LuaTuple<[Profile]>,
			);
		});
		if (ok) return { kind: "ok", value: undefined };
		lastErr = tostring(res);
		if (attempt === 1 && isUnavailableError(lastErr)) return { kind: "unavailable", err: lastErr };
		if (attempt < ATTEMPTS) task.wait(RETRY_WAIT);
	}
	return { kind: "failed", err: lastErr };
}

function fetchProfile(key: string): { profile: Profile; failed: boolean } {
	if (game.PlaceId === 0) enterMemoryMode("game.PlaceId is 0 (place not published)");
	if (!memoryMode) {
		const result = readStore(key);
		if (result.kind === "ok") return { profile: sanitizeProfile(result.value), failed: false };
		if (result.kind === "failed") {
			warn("[profile] load failed after retries, profile is read-only this session: " + key + " " + result.err);
			return { profile: defaultProfile(), failed: true };
		}
		enterMemoryMode(result.err);
	}
	const m = memoryStore.get(key);
	return { profile: m !== undefined ? sanitizeProfile(m) : defaultProfile(), failed: false };
}

/**
 * Studio only: a Player with attribute DebugGrantAll = true gets every general's charId in owned.specials and owned.weapons.
 * The attribute is cleared, then the change is marked dirty and pushed to the client like any other change.
 */
function applyDebugGrant(player: Player, p: Profile): void {
	if (!RunService.IsStudio() || player.GetAttribute("DebugGrantAll") !== true) return;
	player.SetAttribute("DebugGrantAll", undefined);
	for (const d of RAW_CHARACTERS) {
		if (!p.owned.specials.includes(d.id)) p.owned.specials.push(d.id);
		if (!p.owned.weapons.includes(d.id)) p.owned.weapons.push(d.id);
	}
	dirty.add(player);
	remotes.ProfileChanged.FireClient(player, p);
	print(`[profile] debug grant all ${player.Name}`);
}

/**
 * Studio only: a Player with attribute DebugLordLevel = n (number) gets lordLevel n (clamped to 1..30) and lordXp 0.
 * The attribute is cleared, then the change is marked dirty and pushed to the client.
 */
function applyDebugLordLevel(player: Player, p: Profile): void {
	if (!RunService.IsStudio()) return;
	const raw = player.GetAttribute("DebugLordLevel");
	if (!typeIs(raw, "number")) return;
	player.SetAttribute("DebugLordLevel", undefined);
	p.lordLevel = math.clamp(math.floor(raw), 1, LORD_MAX_LEVEL);
	p.lordXp = 0;
	dirty.add(player);
	remotes.ProfileChanged.FireClient(player, p);
	print(`[profile] debug lord level ${player.Name} -> ${p.lordLevel}`);
}

/** Loads (or returns the cached) profile for a player. Yields while loading. */
export function loadProfile(player: Player): Profile {
	const cached = cache.get(player);
	if (cached !== undefined) {
		applyDebugGrant(player, cached);
		applyDebugLordLevel(player, cached);
		return cached;
	}
	while (loading.has(player)) task.wait(0.1);
	const again = cache.get(player);
	if (again !== undefined) return again;

	loading.add(player);
	const fetched = fetchProfile(keyFor(player));
	loading.delete(player);
	if (fetched.failed) readOnly.add(player);
	// Player left while loading: hand back the data but do not cache it (nothing would release it).
	if (player.Parent === undefined) return fetched.profile;
	cache.set(player, fetched.profile);
	applyDebugGrant(player, fetched.profile);
	applyDebugLordLevel(player, fetched.profile);
	return fetched.profile;
}

/** Cached profile, or undefined if not loaded yet. */
export function getProfile(player: Player): Profile | undefined {
	return cache.get(player);
}

/** Mutates the cached profile, marks it dirty and notifies the client. Loads first if needed (yields). */
export function updateProfile(player: Player, mutator: (p: Profile) => void): Profile {
	let p = cache.get(player);
	if (p === undefined) p = loadProfile(player);
	mutator(p);
	if (cache.get(player) === p) {
		dirty.add(player);
		remotes.ProfileChanged.FireClient(player, p);
	}
	return p;
}

/** Best-effort save of the cached profile. Yields. */
export function saveProfile(player: Player): void {
	const p = cache.get(player);
	if (p === undefined) return;
	if (readOnly.has(player)) {
		warn("[profile] not saved (load failed this session, read-only): " + player.Name);
		return;
	}
	const key = keyFor(player);
	const snapshot = copyProfile(p);
	dirty.delete(player);

	if (!memoryMode) {
		const result = writeStore(key, snapshot);
		if (result.kind === "failed") {
			dirty.add(player);
			warn("[profile] save failed for " + player.Name + ", will retry on next autosave: " + result.err);
			return;
		}
		if (result.kind === "ok") {
			print("[profile] saved", player.Name);
			return;
		}
		enterMemoryMode(result.err);
	}
	memoryStore.set(key, snapshot);
	print("[profile] saved (memory)", player.Name);
}

/** Saves, then drops the player's cached profile. Call on PlayerRemoving. Yields. */
export function releaseProfile(player: Player): void {
	saveProfile(player);
	cache.delete(player);
	dirty.delete(player);
	readOnly.delete(player);
}

// Autosave dirty profiles every AUTOSAVE_INTERVAL seconds.
task.spawn(() => {
	while (true) {
		task.wait(AUTOSAVE_INTERVAL);
		const list: Player[] = [];
		for (const p of dirty) list.push(p);
		for (const p of list) task.spawn(() => saveProfile(p));
	}
});

// Save every cached profile on server shutdown, in parallel, waiting up to BIND_TO_CLOSE_TIMEOUT seconds.
game.BindToClose(() => {
	const list = Players.GetPlayers();
	let pending = list.size();
	if (pending === 0) return;
	for (const p of list) {
		task.spawn(() => {
			saveProfile(p);
			pending--;
		});
	}
	const start = os.clock();
	while (pending > 0 && os.clock() - start < BIND_TO_CLOSE_TIMEOUT) task.wait(0.2);
});
