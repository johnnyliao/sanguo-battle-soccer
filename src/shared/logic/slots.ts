// Human slot assignment (pure). Slot 0 = team 0 (the country the first player picked), slot 1 = the opponent team.
import type { Country } from "../data/types";

export type Slots = [number | undefined, number | undefined];

export const COUNTRIES: Country[] = ["wei", "shu", "wu"];

export function isCountry(v: unknown): v is Country {
	return v === "wei" || v === "shu" || v === "wu";
}

/** Slot index of a user, or -1 for a spectator. */
export function slotOf(slots: Slots, userId: number): number {
	if (slots[0] === userId) return 0;
	if (slots[1] === userId) return 1;
	return -1;
}

/** Gives the user the lowest free slot (no change if already seated). Returns the slot, or -1 if both are taken. */
export function assignSlot(slots: Slots, userId: number): number {
	const existing = slotOf(slots, userId);
	if (existing !== -1) return existing;
	if (slots[0] === undefined) {
		slots[0] = userId;
		return 0;
	}
	if (slots[1] === undefined) {
		slots[1] = userId;
		return 1;
	}
	return -1;
}

export function releaseSlot(slots: Slots, userId: number): void {
	if (slots[0] === userId) slots[0] = undefined;
	if (slots[1] === userId) slots[1] = undefined;
}

/** Player index a slot controls: the FW (slot order GK, DF, MF, MF, FW) of that team. */
export function humanIdxForSlot(slot: number): number {
	return slot < 0 ? -1 : slot * 5 + 4;
}

/** Per-player flags: true where a human controls the player (an empty slot stays AI). */
export function humanMask(slots: Slots, playerCount: number): boolean[] {
	const mask: boolean[] = [];
	for (let i = 0; i < playerCount; i++) mask.push(false);
	for (let s = 0; s < 2; s++) {
		if (slots[s] !== undefined) mask[humanIdxForSlot(s)] = true;
	}
	return mask;
}

/** Opponent of the picked country. `r` is a uniform number in [0, 1). */
export function pickOpponent(country: Country, r: number): Country {
	const others: Country[] = [];
	for (const c of COUNTRIES) if (c !== country) others.push(c);
	return others[math.min(others.size() - 1, math.floor(r * others.size()))];
}
