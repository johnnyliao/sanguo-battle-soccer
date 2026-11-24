// Input handling shared by client and server (pure, no Roblox services).
import { EMPTY_INPUT, type InputFrame } from "../sim/types";

function isAxis(v: unknown): v is -1 | 0 | 1 {
	return typeIs(v, "number") && (v === -1 || v === 0 || v === 1);
}

/** Validates an untrusted remote payload. Returns a clean InputFrame, or undefined if any field has a wrong type or range. */
export function sanitizeInput(raw: unknown): InputFrame | undefined {
	if (!typeIs(raw, "table")) return undefined;
	const t = raw as Record<string, unknown>;
	const moveX = t["moveX"];
	const moveY = t["moveY"];
	const dash = t["dash"];
	const j = t["j"];
	const k = t["k"];
	const l = t["l"];
	if (!isAxis(moveX) || !isAxis(moveY)) return undefined;
	if (!typeIs(dash, "boolean") || !typeIs(j, "boolean") || !typeIs(k, "boolean") || !typeIs(l, "boolean")) {
		return undefined;
	}
	return { moveX: moveX === 0 ? 0 : moveX, moveY: moveY === 0 ? 0 : moveY, dash, j, k, l };
}

export function inputsEqual(a: InputFrame, b: InputFrame): boolean {
	return a.moveX === b.moveX && a.moveY === b.moveY && a.dash === b.dash && a.j === b.j && a.k === b.k && a.l === b.l;
}

/**
 * Server side: keeps the latest frame per slot and latches button presses (j, k, l) so a press and release that both
 * arrive between two sim ticks still reaches the sim as one pressed tick. Mirrors the web game's ButtonLatch.
 */
export class InputLatch {
	private latest: InputFrame = { ...EMPTY_INPUT };
	private pressedJ = false;
	private pressedK = false;
	private pressedL = false;

	receive(f: InputFrame): void {
		if (f.j && !this.latest.j) this.pressedJ = true;
		if (f.k && !this.latest.k) this.pressedK = true;
		if (f.l && !this.latest.l) this.pressedL = true;
		this.latest = f;
	}

	/** Frame for one sim tick. Call exactly once per tick; clears the latched presses. */
	consume(): InputFrame {
		const f: InputFrame = {
			...this.latest,
			j: this.latest.j || this.pressedJ,
			k: this.latest.k || this.pressedK,
			l: this.latest.l || this.pressedL,
		};
		this.pressedJ = false;
		this.pressedK = false;
		this.pressedL = false;
		return f;
	}

	reset(): void {
		this.latest = { ...EMPTY_INPUT };
		this.pressedJ = false;
		this.pressedK = false;
		this.pressedL = false;
	}
}

/** Client side: keeps a quick press alive until the next sample. */
export class ButtonLatch<K extends string> {
	private latched = new Set<K>();

	press(key: K): void {
		this.latched.add(key);
	}

	/** True if held now or pressed since the last consume(). Clears the latch for that key. */
	consume(key: K, held: boolean): boolean {
		const wasPressed = this.latched.delete(key);
		return held || wasPressed;
	}

	clear(): void {
		this.latched.clear();
	}
}

/** Double-tap window in seconds (press, release, press again within it). The web game uses 15 ticks at 60 Hz. */
const DOUBLE_TAP_SEC = 0.25;

type Dir = "left" | "right" | "up" | "down";
const DIRS: Dir[] = ["left", "right", "up", "down"];

/** Double-tap dash detector (port of the web game's DashDetector, time-based). Call update() once per sample. */
export class DashDetector {
	private held: Record<Dir, boolean> = { left: false, right: false, up: false, down: false };
	private lastRelease: Record<Dir, number> = { left: -math.huge, right: -math.huge, up: -math.huge, down: -math.huge };
	private dashDir: Dir | undefined = undefined;

	update(moveX: number, moveY: number, now: number): boolean {
		const pressed: Record<Dir, boolean> = { left: moveX < 0, right: moveX > 0, up: moveY < 0, down: moveY > 0 };
		for (const dir of DIRS) {
			if (pressed[dir] && !this.held[dir]) {
				if (now - this.lastRelease[dir] <= DOUBLE_TAP_SEC) this.dashDir = dir;
			} else if (!pressed[dir] && this.held[dir]) {
				this.lastRelease[dir] = now;
				if (this.dashDir === dir) this.dashDir = undefined;
			}
			this.held[dir] = pressed[dir];
		}
		return this.dashDir !== undefined;
	}
}

export interface RawInput {
	left: boolean;
	right: boolean;
	up: boolean;
	down: boolean;
	j: boolean;
	k: boolean;
	l: boolean;
	dashButton: boolean;
}

/** Raw held state plus the double-tap dash result to an InputFrame. */
export function buildInputFrame(raw: RawInput, dash: boolean): InputFrame {
	const moveX = raw.left === raw.right ? 0 : raw.left ? -1 : 1;
	const moveY = raw.up === raw.down ? 0 : raw.up ? -1 : 1;
	return { moveX, moveY, dash: dash || raw.dashButton, j: raw.j, k: raw.k, l: raw.l };
}
