import { actionHitTest, type ActionKey } from "./actionBar";

const RunService = game.GetService("RunService");
const UserInputService = game.GetService("UserInputService");

/** Held state of the on-screen controls. */
export interface TouchState {
	moveX: number; // -1 | 0 | 1
	moveY: number; // -1 | 0 | 1
	dash: boolean;
	j: boolean;
	k: boolean;
	l: boolean;
}

/** Joystick rest centre: 110 from the left edge, 110 from the bottom. */
const STICK_OFF_X = 110;
const STICK_OFF_Y = 110;
const STICK_R = 62;
const KNOB_R = 24;
const STICK_DEADZONE = 12;
const AXIS_RATIO = 0.38;
const DASH_RATIO = 0.85;

const WHITE = Color3.fromRGB(255, 255, 255);

function frame(parent: Instance, size: UDim2, pos: UDim2, color: Color3, transparency: number): Frame {
	const f = new Instance("Frame");
	f.Size = size;
	f.Position = pos;
	f.BackgroundColor3 = color;
	f.BackgroundTransparency = transparency;
	f.BorderSizePixel = 0;
	f.Parent = parent;
	return f;
}

/** A centred circular frame of diameter d (pixels). */
function circle(parent: Instance, d: number, color: Color3, transparency: number): Frame {
	const f = new Instance("Frame");
	f.AnchorPoint = new Vector2(0.5, 0.5);
	f.Size = UDim2.fromOffset(d, d);
	f.BackgroundColor3 = color;
	f.BackgroundTransparency = transparency;
	f.BorderSizePixel = 0;
	const corner = new Instance("UICorner");
	corner.CornerRadius = new UDim(0.5, 0);
	corner.Parent = f;
	f.Parent = parent;
	return f;
}

interface StickClaim {
	kind: "stick";
	ox: number;
	oy: number;
	x: number;
	y: number;
}

interface ButtonClaim {
	kind: "button";
	key: ActionKey;
}

type Claim = StickClaim | ButtonClaim;

/**
 * Touch input for phones: a floating thumbstick on the left half, and the attack (J), pass / call (K) and special (L)
 * buttons on the right. The buttons are drawn by actionBar.ts; this class hit-tests them with actionHitTest.
 * Multi-touch: each finger is tracked by its InputObject.
 */
export class TouchControls {
	private readonly gui: ScreenGui;
	private readonly root: Frame;
	private readonly stickBase: Frame;
	private readonly knob: Frame;
	private readonly claims = new Map<InputObject, Claim>();
	private readonly pendingPress = new Set<ActionKey>();
	private visible = true;

	constructor(gui: ScreenGui) {
		this.gui = gui;
		this.root = frame(gui, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), WHITE, 1);

		this.stickBase = circle(this.root, STICK_R * 2, WHITE, 0.85);
		this.knob = circle(this.stickBase, KNOB_R * 2, WHITE, 0.6);
		this.knob.Position = new UDim2(0.5, 0, 0.5, 0);

		UserInputService.TouchStarted.Connect((input) => {
			this.onTouchStarted(input);
		});
		UserInputService.TouchMoved.Connect((input) => {
			this.onTouchMoved(input);
		});
		UserInputService.TouchEnded.Connect((input) => {
			this.claims.delete(input);
		});
		RunService.RenderStepped.Connect(() => {
			this.draw();
		});
	}

	/**
	 * Current held state, once per sample. A button pressed since the previous call is reported as held even if it was
	 * already released (a quick tap). All false while hidden.
	 */
	state(): TouchState {
		const out: TouchState = { moveX: 0, moveY: 0, dash: false, j: false, k: false, l: false };
		if (!this.visible) {
			this.pendingPress.clear();
			return out;
		}
		for (const [, claim] of this.claims) {
			if (claim.kind === "button") {
				out[claim.key] = true;
				continue;
			}
			const dx = claim.x - claim.ox;
			const dy = claim.y - claim.oy;
			const len = math.sqrt(dx * dx + dy * dy);
			if (len <= STICK_DEADZONE) continue;
			if (math.abs(dx) > AXIS_RATIO * len) out.moveX = dx > 0 ? 1 : -1;
			if (math.abs(dy) > AXIS_RATIO * len) out.moveY = dy > 0 ? 1 : -1;
			if (len > DASH_RATIO * STICK_R) out.dash = true;
		}
		for (const key of this.pendingPress) out[key] = true;
		this.pendingPress.clear();
		return out;
	}

	/** Shows or hides the stick. Hiding also drops any finger currently held. */
	setVisible(visible: boolean): void {
		this.visible = visible;
		this.root.Visible = visible;
		if (!visible) {
			this.claims.clear();
			this.pendingPress.clear();
		}
	}

	private findStick(): StickClaim | undefined {
		for (const [, claim] of this.claims) {
			if (claim.kind === "stick") return claim;
		}
		return undefined;
	}

	private onTouchStarted(input: InputObject): void {
		if (!this.visible) return;
		const x = input.Position.X;
		const y = input.Position.Y;
		const key = actionHitTest(x, y);
		if (key !== undefined) {
			this.claims.set(input, { kind: "button", key });
			this.pendingPress.add(key);
			return;
		}
		if (x < this.gui.AbsoluteSize.X * 0.5 && this.findStick() === undefined) {
			this.claims.set(input, { kind: "stick", ox: x, oy: y, x, y });
		}
	}

	private onTouchMoved(input: InputObject): void {
		const claim = this.claims.get(input);
		if (claim === undefined) return;
		const x = input.Position.X;
		const y = input.Position.Y;
		if (claim.kind === "stick") {
			claim.x = x;
			claim.y = y;
		} else if (actionHitTest(x, y) !== claim.key) {
			// Sliding off a button releases it.
			this.claims.delete(input);
		}
	}

	private draw(): void {
		if (!this.visible) return;
		const stick = this.findStick();
		const size = this.gui.AbsoluteSize;
		let ox = STICK_OFF_X;
		let oy = size.Y - STICK_OFF_Y;
		let kx = 0;
		let ky = 0;
		if (stick !== undefined) {
			ox = stick.ox;
			oy = stick.oy;
			const dx = stick.x - stick.ox;
			const dy = stick.y - stick.oy;
			const len = math.sqrt(dx * dx + dy * dy);
			const scale = len > STICK_R ? STICK_R / len : 1;
			kx = dx * scale;
			ky = dy * scale;
		}
		this.stickBase.Position = UDim2.fromOffset(ox, oy);
		this.stickBase.BackgroundTransparency = stick !== undefined ? 0.6 : 0.85;
		this.knob.Position = new UDim2(0.5, kx, 0.5, ky);
		this.knob.BackgroundTransparency = stick !== undefined ? 0.3 : 0.6;
	}
}
