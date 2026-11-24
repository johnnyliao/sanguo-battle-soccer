// Compact snapshot encoding (pure; uses the Luau `buffer` type only). One snapshot is about 180 bytes, well under the
// 900 byte limit of an UnreliableRemoteEvent.
import { CHARACTERS } from "../data/characters";
import type { GameState, MatchPhase, PlayerAction } from "../sim/types";

export const PLAYER_ACTIONS: PlayerAction[] = [
	"normal", "punch", "tackle", "hitstun", "down", "recover", "charge", "dive", "lunge", "cast", "fear", "leap",
	"tiger", "slash", "ride", "icefield",
];
export const MATCH_PHASES: MatchPhase[] = ["kickoff", "play", "goal", "halftime", "fulltime", "pk"];

const HEADER_BYTES = 19;
const PLAYER_BYTES = 16;
const PLAYER_COUNT = 10;
export const SNAPSHOT_BYTES = HEADER_BYTES + PLAYER_BYTES * PLAYER_COUNT;

export interface SnapPlayer {
	x: number;
	y: number;
	z: number;
	/** Facing angle in radians, atan2(facingY, facingX) in sim space. */
	facing: number;
	action: PlayerAction;
	stamina: number;
	maxStamina: number;
	/** Ticks until the special can be used again. */
	specialCooldown: number;
	down: boolean;
	team: 0 | 1;
	/** Index into CHARACTERS. */
	charIdx: number;
	rampage: boolean;
}

export interface Snapshot {
	tick: number;
	phase: MatchPhase;
	half: 1 | 2;
	clockTicks: number;
	score: [number, number];
	ball: { x: number; y: number; z: number; ownerIdx: number };
	players: SnapPlayer[];
}

export function charIndex(charId: string): number {
	for (let i = 0; i < CHARACTERS.size(); i++) if (CHARACTERS[i].id === charId) return i;
	return 0;
}

function clampInt(v: number, lo: number, hi: number): number {
	return math.min(hi, math.max(lo, math.floor(v + 0.5)));
}

/** Position values are stored in tenths of a px (error up to 0.05 px). */
function q10(v: number): number {
	return clampInt(v * 10, -32768, 32767);
}

export function encodeSnapshot(state: GameState): buffer {
	const b = buffer.create(SNAPSHOT_BYTES);
	const m = state.match;
	buffer.writeu32(b, 0, state.tick);
	buffer.writeu8(b, 4, MATCH_PHASES.indexOf(m.phase));
	buffer.writeu8(b, 5, m.half);
	buffer.writeu16(b, 6, clampInt(m.clockTicks, 0, 65535));
	buffer.writeu8(b, 8, clampInt(m.score[0], 0, 255));
	buffer.writeu8(b, 9, clampInt(m.score[1], 0, 255));
	buffer.writei16(b, 10, q10(state.ball.x));
	buffer.writei16(b, 12, q10(state.ball.y));
	buffer.writei16(b, 14, q10(state.ball.z));
	buffer.writei8(b, 16, state.ball.ownerIdx);
	// bytes 17..18 reserved (zero)
	for (let i = 0; i < PLAYER_COUNT; i++) {
		const p = state.players[i];
		const o = HEADER_BYTES + i * PLAYER_BYTES;
		buffer.writei16(b, o, q10(p.x));
		buffer.writei16(b, o + 2, q10(p.y));
		buffer.writei16(b, o + 4, q10(p.z));
		const angle = math.atan2(p.facingY, p.facingX);
		buffer.writeu8(b, o + 6, math.floor(((angle + math.pi) / (2 * math.pi)) * 256) % 256);
		buffer.writeu8(b, o + 7, math.max(0, PLAYER_ACTIONS.indexOf(p.action)));
		buffer.writeu16(b, o + 8, clampInt(p.stamina * 10, 0, 65535));
		buffer.writeu16(b, o + 10, clampInt(p.maxStamina * 10, 0, 65535));
		buffer.writeu16(b, o + 12, clampInt(p.specialCooldown, 0, 65535));
		const flags = (p.action === "down" ? 1 : 0) + (p.team === 1 ? 2 : 0) + (p.rampageTicks > 0 ? 4 : 0);
		buffer.writeu8(b, o + 14, flags);
		buffer.writeu8(b, o + 15, charIndex(p.charId));
	}
	return b;
}

/** Returns undefined when the buffer has the wrong size or an out-of-range enum code. */
export function decodeSnapshot(b: buffer): Snapshot | undefined {
	if (buffer.len(b) !== SNAPSHOT_BYTES) return undefined;
	const phase = MATCH_PHASES[buffer.readu8(b, 4)];
	const half = buffer.readu8(b, 5);
	if (phase === undefined || (half !== 1 && half !== 2)) return undefined;
	const players: SnapPlayer[] = [];
	for (let i = 0; i < PLAYER_COUNT; i++) {
		const o = HEADER_BYTES + i * PLAYER_BYTES;
		const action = PLAYER_ACTIONS[buffer.readu8(b, o + 7)];
		const flags = buffer.readu8(b, o + 14);
		const charIdx = buffer.readu8(b, o + 15);
		if (action === undefined || charIdx >= CHARACTERS.size()) return undefined;
		players.push({
			x: buffer.readi16(b, o) / 10,
			y: buffer.readi16(b, o + 2) / 10,
			z: buffer.readi16(b, o + 4) / 10,
			facing: (buffer.readu8(b, o + 6) / 256) * 2 * math.pi - math.pi,
			action,
			stamina: buffer.readu16(b, o + 8) / 10,
			maxStamina: buffer.readu16(b, o + 10) / 10,
			specialCooldown: buffer.readu16(b, o + 12),
			down: (flags & 1) !== 0,
			team: (flags & 2) !== 0 ? 1 : 0,
			charIdx,
			rampage: (flags & 4) !== 0,
		});
	}
	return {
		tick: buffer.readu32(b, 0),
		phase,
		half,
		clockTicks: buffer.readu16(b, 6),
		score: [buffer.readu8(b, 8), buffer.readu8(b, 9)],
		ball: {
			x: buffer.readi16(b, 10) / 10,
			y: buffer.readi16(b, 12) / 10,
			z: buffer.readi16(b, 14) / 10,
			ownerIdx: buffer.readi8(b, 16),
		},
		players,
	};
}
