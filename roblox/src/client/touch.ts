const RunService = game.GetService("RunService");
const UserInputService = game.GetService("UserInputService");

/** Held state of the joystick. The action buttons are read from actionBar.ts (isActionHeld / takeActionPresses). */
export interface TouchState {
	moveX: number; // -1 | 0 | 1
	moveY: number; // -1 | 0 | 1
	dash: boolean;
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

/**
 * Touch input for phones: a floating thumbstick on the left half. The attack (J), pass / call (K) and special (L)
 * buttons on the right are real GuiButtons in actionBar.ts, so a touch that lands on one is sunk by the GUI and never
 * starts the stick. Multi-touch: each finger is tracked by its InputObject.
 */
export class TouchControls {
	private readonly gui: ScreenGui;
	private readonly root: Frame;
	private readonly stickBase: Frame;
	private readonly knob: Frame;
	private readonly claims = new Map<InputObject, StickClaim>();
	private visible = true;

	constructor(gui: ScreenGui) {
		this.gui = gui;
		this.root = frame(gui, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), WHITE, 1);

		this.stickBase = circle(this.root, STICK_R * 2, WHITE, 0.85);
		this.knob = circle(this.stickBase, KNOB_R * 2, WHITE, 0.6);
		this.knob.Position = new UDim2(0.5, 0, 0.5, 0);

		UserInputService.TouchStarted.Connect((input, gameProcessed) => {
			this.onTouchStarted(input, gameProcessed);
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

	/** Current joystick state, once per sample. All false while hidden. */
	state(): TouchState {
		const out: TouchState = { moveX: 0, moveY: 0, dash: false };
		if (!this.visible) return out;
		for (const [, claim] of this.claims) {
			const dx = claim.x - claim.ox;
			const dy = claim.y - claim.oy;
			const len = math.sqrt(dx * dx + dy * dy);
			if (len <= STICK_DEADZONE) continue;
			if (math.abs(dx) > AXIS_RATIO * len) out.moveX = dx > 0 ? 1 : -1;
			if (math.abs(dy) > AXIS_RATIO * len) out.moveY = dy > 0 ? 1 : -1;
			if (len > DASH_RATIO * STICK_R) out.dash = true;
		}
		return out;
	}

	/** Shows or hides the stick. Hiding also drops any finger currently held. */
	setVisible(visible: boolean): void {
		this.visible = visible;
		this.root.Visible = visible;
		if (!visible) this.claims.clear();
	}

	private findStick(): StickClaim | undefined {
		for (const [, claim] of this.claims) return claim;
		return undefined;
	}

	/** A touch that the GUI sank (it landed on an action button or another GUI) never starts the stick. */
	private onTouchStarted(input: InputObject, gameProcessed: boolean): void {
		if (!this.visible || gameProcessed) return;
		const x = input.Position.X;
		const y = input.Position.Y;
		if (x < this.gui.AbsoluteSize.X * 0.5 && this.findStick() === undefined) {
			this.claims.set(input, { kind: "stick", ox: x, oy: y, x, y });
		}
	}

	private onTouchMoved(input: InputObject): void {
		const claim = this.claims.get(input);
		if (claim === undefined) return;
		claim.x = input.Position.X;
		claim.y = input.Position.Y;
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
