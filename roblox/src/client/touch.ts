import { TICK_RATE } from "../shared/net";

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

type ButtonKey = "j" | "k" | "l";

interface ButtonDef {
	key: ButtonKey;
	/** Centre offset from the bottom-right corner of the screen, in pixels. */
	offX: number;
	offY: number;
	/** Diameter in pixels. */
	d: number;
	label: string;
	/** Label during the penalty shootout. Undefined = the button is hidden during it. */
	pkLabel?: string;
}

/** Buttons sit at the bottom-right: J big at the corner, K above J, L left of J. */
const BUTTONS: ButtonDef[] = [
	{ key: "j", offX: 84, offY: 84, d: 116, label: "攻擊\n射門", pkLabel: "射門" },
	{ key: "k", offX: 84, offY: 214, d: 88, label: "傳球\n叫球", pkLabel: "高球" },
	{ key: "l", offX: 214, offY: 84, d: 100, label: "大招" },
];

/** Joystick rest centre: 110 from the left edge, 110 from the bottom. */
const STICK_OFF_X = 110;
const STICK_OFF_Y = 110;
const STICK_R = 62;
const KNOB_R = 24;
const STICK_DEADZONE = 12;
const AXIS_RATIO = 0.38;
const DASH_RATIO = 0.85;

const WHITE = Color3.fromRGB(255, 255, 255);
const BLACK = Color3.fromRGB(0, 0, 0);
const GOLD = Color3.fromRGB(255, 217, 138);
const DARK = Color3.fromRGB(34, 34, 34);

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

function label(parent: Instance, content: string, textSize: number): TextLabel {
	const t = new Instance("TextLabel");
	t.BackgroundTransparency = 1;
	t.Size = UDim2.fromScale(1, 1);
	t.Font = Enum.Font.GothamBold;
	t.Text = content;
	t.TextColor3 = WHITE;
	t.TextSize = textSize;
	t.TextStrokeTransparency = 0.2;
	t.TextStrokeColor3 = BLACK;
	t.Parent = parent;
	return t;
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
	def: ButtonDef;
}

type Claim = StickClaim | ButtonClaim;

/**
 * On-screen controls for phones: a floating thumbstick on the left half and the attack (J), pass / call (K) and
 * special (L) buttons on the right. Multi-touch: each finger is tracked by its InputObject.
 * Port of the web src/input/TouchControls.ts logic, drawn with Roblox GUI.
 */
export class TouchControls {
	private readonly gui: ScreenGui;
	private readonly root: Frame;
	private readonly buttonFrames: Frame[] = [];
	private readonly buttonLabels: TextLabel[] = [];
	private readonly blockHint: TextLabel;
	private readonly stickBase: Frame;
	private readonly knob: Frame;
	private readonly claims = new Map<InputObject, Claim>();
	private readonly pendingPress = new Set<ButtonKey>();
	private visible = true;
	private pk = false;
	private cooldownTicks = 0;
	private block = "";

	constructor(gui: ScreenGui) {
		this.gui = gui;
		this.root = frame(gui, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), WHITE, 1);

		for (const def of BUTTONS) {
			const b = circle(this.root, def.d, WHITE, 0.75);
			b.Position = new UDim2(1, -def.offX, 1, -def.offY);
			this.buttonFrames.push(b);
			this.buttonLabels.push(label(b, def.label, def.key === "l" ? 18 : 16));
		}

		this.blockHint = label(this.root, "", 13);
		this.blockHint.Size = UDim2.fromOffset(200, 20);
		this.blockHint.AnchorPoint = new Vector2(0.5, 1);
		this.blockHint.Position = new UDim2(1, -214, 1, -138);
		this.blockHint.Visible = false;

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
				out[claim.def.key] = true;
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

	/** Penalty shootout on or off: relabels J and K and hides the special button. */
	setPk(on: boolean): void {
		this.pk = on;
	}

	/** The human's special: cooldown in ticks (0 = ready) and why it cannot be cast ("" = can cast). */
	setSpecialState(cooldownTicks: number, blockReason: string): void {
		this.cooldownTicks = cooldownTicks;
		this.block = blockReason;
	}

	/** Shows or hides all controls. Hiding also drops any finger currently held. */
	setVisible(visible: boolean): void {
		this.visible = visible;
		this.root.Visible = visible;
		if (!visible) {
			this.claims.clear();
			this.pendingPress.clear();
		}
	}

	private isActive(def: ButtonDef): boolean {
		return !this.pk || def.pkLabel !== undefined;
	}

	private inCircle(x: number, y: number, def: ButtonDef): boolean {
		const size = this.gui.AbsoluteSize;
		const dx = x - (size.X - def.offX);
		const dy = y - (size.Y - def.offY);
		return math.sqrt(dx * dx + dy * dy) <= def.d / 2;
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
		for (const def of BUTTONS) {
			if (this.isActive(def) && this.inCircle(x, y, def)) {
				this.claims.set(input, { kind: "button", def });
				this.pendingPress.add(def.key);
				return;
			}
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
		} else if (!this.inCircle(x, y, claim.def)) {
			// Sliding off a button releases it.
			this.claims.delete(input);
		}
	}

	private draw(): void {
		if (!this.visible) return;
		const pressedKeys = new Set<ButtonKey>();
		for (const [, claim] of this.claims) {
			if (claim.kind === "button") pressedKeys.add(claim.def.key);
		}
		const cooling = this.cooldownTicks > 0;
		const ready = !cooling && this.block === "";

		BUTTONS.forEach((def, i) => {
			const b = this.buttonFrames[i];
			const t = this.buttonLabels[i];
			const pressed = pressedKeys.has(def.key);
			b.Visible = this.isActive(def);
			if (def.key === "l") {
				// Ready: gold. Otherwise dark, showing the cooldown seconds (or the label when only blocked).
				b.BackgroundColor3 = ready ? GOLD : DARK;
				b.BackgroundTransparency = ready ? (pressed ? 0 : 0.1) : 0.45;
				t.Text = cooling ? `${math.ceil(this.cooldownTicks / TICK_RATE)}` : "大招";
			} else {
				b.BackgroundColor3 = pressed ? GOLD : WHITE;
				b.BackgroundTransparency = pressed ? 0.3 : 0.75;
				t.Text = this.pk && def.pkLabel !== undefined ? def.pkLabel : def.label;
			}
		});

		this.blockHint.Visible = !this.pk && !cooling && this.block !== "";
		this.blockHint.Text = this.block;

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
