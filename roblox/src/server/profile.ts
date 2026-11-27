// Server-side save data for player profiles. DataStore with in-memory fallback (Studio / unpublished place).
import { defaultProfile, getProfileRemotes, parseLordWeapon, PROFILE_VERSION, type Country, type Profile } from "shared/profileTypes";

const DataStoreService = game.GetService("DataStoreService");
const Players = game.GetService("Players");

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
	return { ...p, recruited: [...p.recruited], cleared: [...p.cleared] };
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

/** Fills missing fields from defaults and replaces invalid ones. Never throws. */
function sanitizeProfile(raw: unknown): Profile {
	const d = defaultProfile();
	if (!typeIs(raw, "table")) return d;
	const r = raw as { [key: string]: unknown };
	const starter = r.starter;
	return {
		version: PROFILE_VERSION,
		country: parseCountry(r.country),
		starter: typeIs(starter, "string") ? starter : undefined,
		lordLevel: asNumber(r.lordLevel, d.lordLevel, 1),
		lordXp: asNumber(r.lordXp, d.lordXp, 0),
		coins: asNumber(r.coins, d.coins, 0),
		recruited: asStringArray(r.recruited),
		cleared: asStringArray(r.cleared),
		lordWeapon: parseLordWeapon(r.lordWeapon),
	};
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

/** Loads (or returns the cached) profile for a player. Yields while loading. */
export function loadProfile(player: Player): Profile {
	const cached = cache.get(player);
	if (cached !== undefined) return cached;
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
