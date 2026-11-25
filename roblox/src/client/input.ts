import type { ClientInput, Remotes } from "../shared/net";
import { TouchControls } from "./touch";

const Players = game.GetService("Players");
const RunService = game.GetService("RunService");
const StarterGui = game.GetService("StarterGui");
const UserInputService = game.GetService("UserInputService");

/** Double-tap window in frames (same as the web DashDetector: 15 ticks). */
const DOUBLE_TAP_TICKS = 15;
/** The held state is resent at least this often (seconds) as a keep-alive. */
const KEEP_ALIVE_SECONDS = 0.5;

type Dir = "left" | "right" | "up" | "down";
const DIRS: Dir[] = ["left", "right", "up", "down"];

/** Port of src/input/DashDetector.ts: dash latches on a quick re-press of a direction and stays while it is held. */
class DashDetector {
	private tick = 0;
	private held: Record<Dir, boolean> = { left: false, right: false, up: false, down: false };
	private lastRelease: Record<Dir, number> = { left: -100000, right: -100000, up: -100000, down: -100000 };
	private dashDir: Dir | undefined;

	update(moveX: number, moveY: number): boolean {
		this.tick++;
		const now: Record<Dir, boolean> = {
			left: moveX < 0,
			right: moveX > 0,
			up: moveY < 0,
			down: moveY > 0,
		};
		for (const dir of DIRS) {
			if (now[dir] && !this.held[dir]) {
				if (this.tick - this.lastRelease[dir] <= DOUBLE_TAP_TICKS) this.dashDir = dir;
			} else if (!now[dir] && this.held[dir]) {
				this.lastRelease[dir] = this.tick;
				if (this.dashDir === dir) this.dashDir = undefined;
			}
			this.held[dir] = now[dir];
		}
		return this.dashDir !== undefined;
	}
}

const heldKeys = new Set<Enum.KeyCode>();
let pendingJ = false;
let pendingK = false;
let pendingL = false;
let inputEnabled = true;
let touch: TouchControls | undefined;
const dashDetector = new DashDetector();
let lastSent: ClientInput | undefined;
let sinceSend = 0;

function keyDown(...keys: Enum.KeyCode[]): boolean {
	for (const key of keys) {
		if (heldKeys.has(key)) return true;
	}
	return false;
}

function zeroInput(): ClientInput {
	return { moveX: 0, moveY: 0, dash: false, j: false, k: false, l: false };
}

function sameInput(a: ClientInput, b: ClientInput): boolean {
	return (
		a.moveX === b.moveX &&
		a.moveY === b.moveY &&
		a.dash === b.dash &&
		a.j === b.j &&
		a.k === b.k &&
		a.l === b.l
	);
}

/** Samples keyboard and touch once per frame and merges them (same rules as src/input/LocalInput.ts). */
function sample(): ClientInput {
	const t = touch !== undefined ? touch.state() : undefined;
	const pressJ = pendingJ;
	const pressK = pendingK;
	const pressL = pendingL;
	pendingJ = false;
	pendingK = false;
	pendingL = false;
	if (!inputEnabled) {
		dashDetector.update(0, 0);
		return zeroInput();
	}

	const tx = t !== undefined ? t.moveX : 0;
	const ty = t !== undefined ? t.moveY : 0;
	const left = keyDown(Enum.KeyCode.A, Enum.KeyCode.Left) || tx < 0;
	const right = keyDown(Enum.KeyCode.D, Enum.KeyCode.Right) || tx > 0;
	const up = keyDown(Enum.KeyCode.W, Enum.KeyCode.Up) || ty < 0;
	const down = keyDown(Enum.KeyCode.S, Enum.KeyCode.Down) || ty > 0;
	const moveX = left === right ? 0 : left ? -1 : 1;
	const moveY = up === down ? 0 : up ? -1 : 1;

	const doubleTap = dashDetector.update(moveX, moveY);
	return {
		moveX,
		moveY,
		dash: doubleTap || keyDown(Enum.KeyCode.LeftShift) || (t !== undefined && t.dash),
		j: pressJ || keyDown(Enum.KeyCode.J) || (t !== undefined && t.j),
		k: pressK || keyDown(Enum.KeyCode.K) || (t !== undefined && t.k),
		l: pressL || keyDown(Enum.KeyCode.L) || (t !== undefined && t.l),
	};
}

/** Turns off Roblox's default character controls (there are no avatars, but the touch thumbstick may still show). */
function disableDefaultControls(): void {
	pcall(() => {
		const mod = Players.LocalPlayer.WaitForChild("PlayerScripts").WaitForChild("PlayerModule", 10);
		if (mod === undefined) return;
		const pm = require(mod as ModuleScript) as {
			GetControls(this: unknown): { Disable(this: unknown): void };
		};
		pm.GetControls().Disable();
	});
	pcall(() => {
		StarterGui.SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false);
	});
	pcall(() => {
		StarterGui.SetCoreGuiEnabled(Enum.CoreGuiType.Health, false);
	});
}

/**
 * Starts keyboard + touch input. Sends the merged ClientInput to the server on every change (and every 0.5 s).
 * Call once, before any match starts. Input starts enabled; call setInputEnabled(false) while menus are open.
 */
export function startInput(remotes: Remotes): { getTouch(): TouchControls | undefined } {
	// PlayerModule may never appear (no avatar); never block startup on it.
	task.spawn(disableDefaultControls);

	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "InputGui";
	gui.IgnoreGuiInset = true;
	gui.ResetOnSpawn = false;
	gui.DisplayOrder = 20;
	gui.Parent = playerGui;

	if (UserInputService.TouchEnabled) {
		touch = new TouchControls(gui);
		touch.setVisible(inputEnabled);
	}

	UserInputService.InputBegan.Connect((input, gameProcessed) => {
		if (input.UserInputType !== Enum.UserInputType.Keyboard) return;
		// Keys swallowed by chat or other GUI are ignored.
		if (gameProcessed) return;
		heldKeys.add(input.KeyCode);
		if (input.KeyCode === Enum.KeyCode.J) pendingJ = true;
		else if (input.KeyCode === Enum.KeyCode.K) pendingK = true;
		else if (input.KeyCode === Enum.KeyCode.L) pendingL = true;
	});

	UserInputService.InputEnded.Connect((input) => {
		if (input.UserInputType === Enum.UserInputType.Keyboard) heldKeys.delete(input.KeyCode);
	});

	RunService.Heartbeat.Connect((dt) => {
		const nextInput = sample();
		sinceSend += dt;
		if (lastSent === undefined || sinceSend >= KEEP_ALIVE_SECONDS || !sameInput(lastSent, nextInput)) {
			remotes.Input.FireServer(nextInput);
			lastSent = nextInput;
			sinceSend = 0;
		}
	});

	return {
		getTouch() {
			return touch;
		},
	};
}

/** Zeroes and blocks input while a menu is open; re-enables it when the match starts. Also shows/hides touch controls. */
export function setInputEnabled(enabled: boolean): void {
	inputEnabled = enabled;
	if (touch !== undefined) touch.setVisible(enabled);
}

/** Penalty shootout on or off: relabels the touch J / K buttons and hides the special. */
export function setPkMode(on: boolean): void {
	if (touch !== undefined) touch.setPk(on);
}
