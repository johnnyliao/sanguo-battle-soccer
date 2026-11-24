import type { InputFrame } from "shared/sim/types";
import { ButtonLatch, buildInputFrame, DashDetector, inputsEqual } from "shared/logic/input";
import { FONT } from "./theme";

const UserInputService = game.GetService("UserInputService");
const GuiService = game.GetService("GuiService");

const SEND_INTERVAL = 0.1;
const STICK_RADIUS = 70;
const STICK_DEADZONE = 0.4;
const PAD_DEADZONE = 0.4;

type Action = "j" | "k" | "l";

function isPress(input: InputObject): boolean {
	return input.UserInputType === Enum.UserInputType.Touch || input.UserInputType === Enum.UserInputType.MouseButton1;
}

/**
 * Keyboard, gamepad and touch input. step() builds one InputFrame per call and hands it to `send` when it changed
 * or when 100 ms passed since the last send. Quick presses are latched so a tap shorter than one frame is not lost.
 */
export class Controls {
	private active = false;
	private readonly keys = new Set<Enum.KeyCode>();
	private readonly latch = new ButtonLatch<Action>();
	private readonly dash = new DashDetector();
	private padX = 0;
	private padY = 0;
	private last: InputFrame | undefined = undefined;
	private lastSent = -math.huge;

	// Touch state
	private touchMoveX: -1 | 0 | 1 = 0;
	private touchMoveY: -1 | 0 | 1 = 0;
	private touchDash = false;
	private readonly touchHeld: Record<Action, boolean> = { j: false, k: false, l: false };
	private stickTouch: InputObject | undefined = undefined;
	private stickOrigin = new Vector2(0, 0);
	private stickBase: Frame | undefined;
	private stickKnob: Frame | undefined;
	private specialButton: TextButton | undefined;
	private specialLabel: TextLabel | undefined;

	constructor(private readonly gui: ScreenGui, private readonly send: (frame: InputFrame) => void) {
		UserInputService.InputBegan.Connect((input) => this.onBegan(input));
		UserInputService.InputEnded.Connect((input) => this.onEnded(input));
		UserInputService.InputChanged.Connect((input) => this.onChanged(input));
		this.buildHints();
		if (UserInputService.TouchEnabled) this.buildTouch();
	}

	setActive(active: boolean): void {
		if (this.active === active) return;
		this.active = active;
		this.last = undefined;
		this.latch.clear();
	}

	/** Seconds until the special is ready (0 = ready). */
	setSpecialCooldown(sec: number): void {
		const text = sec > 0 ? string.format("%.1f", sec) : "就緒";
		if (this.specialLabel !== undefined) this.specialLabel.Text = `L 大招 ${text}`;
		if (this.specialButton !== undefined) {
			this.specialButton.Text = sec > 0 ? `大招\n${text}` : "大招";
			this.specialButton.BackgroundColor3 = sec > 0 ? Color3.fromRGB(70, 70, 80) : Color3.fromRGB(150, 60, 190);
		}
	}

	private onBegan(input: InputObject): void {
		const t = input.UserInputType;
		if (t === Enum.UserInputType.Keyboard || t === Enum.UserInputType.Gamepad1) {
			this.keys.add(input.KeyCode);
			const k = input.KeyCode;
			if (k === Enum.KeyCode.J || k === Enum.KeyCode.ButtonA) this.latch.press("j");
			else if (k === Enum.KeyCode.K || k === Enum.KeyCode.ButtonX) this.latch.press("k");
			else if (k === Enum.KeyCode.L || k === Enum.KeyCode.ButtonY) this.latch.press("l");
		}
	}

	private onEnded(input: InputObject): void {
		const t = input.UserInputType;
		if (t === Enum.UserInputType.Keyboard || t === Enum.UserInputType.Gamepad1) this.keys.delete(input.KeyCode);
		if (input === this.stickTouch) this.endStick();
	}

	private onChanged(input: InputObject): void {
		if (input.UserInputType === Enum.UserInputType.Gamepad1 && input.KeyCode === Enum.KeyCode.Thumbstick1) {
			this.padX = input.Position.X;
			this.padY = input.Position.Y;
		}
		if (input === this.stickTouch) this.moveStick(new Vector2(input.Position.X, input.Position.Y));
	}

	private down(...codes: Enum.KeyCode[]): boolean {
		for (const c of codes) if (this.keys.has(c)) return true;
		return false;
	}

	/** Call once per frame. */
	step(now: number): void {
		const K = Enum.KeyCode;
		const left = this.down(K.A, K.Left) || this.padX < -PAD_DEADZONE || this.down(K.DPadLeft);
		const right = this.down(K.D, K.Right) || this.padX > PAD_DEADZONE || this.down(K.DPadRight);
		const up = this.down(K.W, K.Up) || this.padY > PAD_DEADZONE || this.down(K.DPadUp);
		const downKey = this.down(K.S, K.Down) || this.padY < -PAD_DEADZONE || this.down(K.DPadDown);
		const heldJ = this.down(K.J, K.ButtonA) || this.touchHeld.j;
		const heldK = this.down(K.K, K.ButtonX) || this.touchHeld.k;
		const heldL = this.down(K.L, K.ButtonY) || this.touchHeld.l;

		const base = buildInputFrame(
			{ left, right, up, down: downKey, j: false, k: false, l: false, dashButton: false },
			false,
		);
		const doubleTap = this.dash.update(base.moveX, base.moveY, now);
		const shift = this.down(K.LeftShift, K.RightShift, K.ButtonR1);

		const moveX = left !== right ? base.moveX : this.touchMoveX;
		const moveY = up !== downKey ? base.moveY : this.touchMoveY;
		const frame: InputFrame = {
			moveX: moveX as -1 | 0 | 1,
			moveY: moveY as -1 | 0 | 1,
			dash: doubleTap || shift || this.touchDash,
			j: this.latch.consume("j", heldJ),
			k: this.latch.consume("k", heldK),
			l: this.latch.consume("l", heldL),
		};

		if (!this.active) return;
		if (this.last === undefined || !inputsEqual(frame, this.last) || now - this.lastSent >= SEND_INTERVAL) {
			this.last = frame;
			this.lastSent = now;
			this.send(frame);
		}
	}

	// ---- on-screen hints (keyboard) ------------------------------------------------------------------------------------

	private buildHints(): void {
		if (UserInputService.TouchEnabled && !UserInputService.KeyboardEnabled) return;
		const l = new Instance("TextLabel");
		l.BackgroundTransparency = 1;
		l.Size = UDim2.fromOffset(520, 22);
		l.Position = new UDim2(0, 12, 1, -30);
		l.Font = FONT;
		l.TextSize = 16;
		l.TextXAlignment = Enum.TextXAlignment.Left;
		l.TextColor3 = Color3.fromRGB(235, 235, 235);
		l.TextStrokeTransparency = 0.4;
		l.Text = "WASD/方向鍵 移動　Shift/連按 衝刺　J 攻擊射門(按住蓄力)　K 傳球/叫球　L 大招";
		l.Parent = this.gui;

		const cd = new Instance("TextLabel");
		cd.BackgroundTransparency = 1;
		cd.Size = UDim2.fromOffset(220, 26);
		cd.Position = new UDim2(1, -232, 1, -36);
		cd.Font = FONT;
		cd.TextSize = 22;
		cd.TextXAlignment = Enum.TextXAlignment.Right;
		cd.TextColor3 = Color3.fromRGB(255, 232, 140);
		cd.TextStrokeTransparency = 0.4;
		cd.Text = "L 大招 就緒";
		cd.Parent = this.gui;
		this.specialLabel = cd;
	}

	// ---- touch -----------------------------------------------------------------------------------------------------------

	private buildTouch(): void {
		// Left half of the screen is the joystick drag area.
		const zone = new Instance("Frame");
		zone.Name = "StickZone";
		zone.BackgroundTransparency = 1;
		zone.Size = UDim2.fromScale(0.5, 1);
		zone.Active = true;
		zone.Parent = this.gui;
		zone.InputBegan.Connect((input) => {
			if (input.UserInputType !== Enum.UserInputType.Touch || this.stickTouch !== undefined) return;
			this.stickTouch = input;
			this.stickOrigin = new Vector2(input.Position.X, input.Position.Y);
			this.showStick(true);
			this.moveStick(this.stickOrigin);
		});

		const base = new Instance("Frame");
		base.Name = "StickBase";
		base.AnchorPoint = new Vector2(0.5, 0.5);
		base.Size = UDim2.fromOffset(STICK_RADIUS * 2, STICK_RADIUS * 2);
		base.BackgroundColor3 = Color3.fromRGB(255, 255, 255);
		base.BackgroundTransparency = 0.8;
		base.BorderSizePixel = 0;
		base.Visible = false;
		const baseCorner = new Instance("UICorner");
		baseCorner.CornerRadius = new UDim(1, 0);
		baseCorner.Parent = base;
		base.Parent = this.gui;
		this.stickBase = base;

		const knob = new Instance("Frame");
		knob.Name = "StickKnob";
		knob.AnchorPoint = new Vector2(0.5, 0.5);
		knob.Size = UDim2.fromOffset(56, 56);
		knob.BackgroundColor3 = Color3.fromRGB(255, 255, 255);
		knob.BackgroundTransparency = 0.4;
		knob.BorderSizePixel = 0;
		knob.Visible = false;
		const knobCorner = new Instance("UICorner");
		knobCorner.CornerRadius = new UDim(1, 0);
		knobCorner.Parent = knob;
		knob.Parent = this.gui;
		this.stickKnob = knob;

		this.makeButton("j", "攻擊\n射門", 120, new UDim2(1, -90, 1, -90), Color3.fromRGB(210, 70, 60));
		this.makeButton("k", "傳球\n叫球", 84, new UDim2(1, -225, 1, -55), Color3.fromRGB(60, 140, 210));
		this.specialButton = this.makeButton("l", "大招", 84, new UDim2(1, -150, 1, -185), Color3.fromRGB(150, 60, 190));
	}

	private makeButton(action: Action, text: string, size: number, pos: UDim2, color: Color3): TextButton {
		const b = new Instance("TextButton");
		b.Name = `Btn_${action}`;
		b.AnchorPoint = new Vector2(0.5, 0.5);
		b.Size = UDim2.fromOffset(size, size);
		b.Position = pos;
		b.BackgroundColor3 = color;
		b.BackgroundTransparency = 0.25;
		b.BorderSizePixel = 0;
		b.AutoButtonColor = false;
		b.Font = FONT;
		b.TextSize = size > 100 ? 28 : 22;
		b.TextColor3 = new Color3(1, 1, 1);
		b.Text = text;
		const corner = new Instance("UICorner");
		corner.CornerRadius = new UDim(1, 0);
		corner.Parent = b;
		b.InputBegan.Connect((input) => {
			if (!isPress(input)) return;
			this.touchHeld[action] = true;
			this.latch.press(action);
		});
		b.InputEnded.Connect((input) => {
			if (isPress(input)) this.touchHeld[action] = false;
		});
		b.Parent = this.gui;
		return b;
	}

	/** Input positions ignore the top bar inset; this ScreenGui does not, so drawn positions add it back. */
	private drawAt(x: number, y: number): UDim2 {
		const [inset] = GuiService.GetGuiInset();
		return UDim2.fromOffset(x + inset.X, y + inset.Y);
	}

	private showStick(visible: boolean): void {
		if (this.stickBase !== undefined) {
			this.stickBase.Visible = visible;
			this.stickBase.Position = this.drawAt(this.stickOrigin.X, this.stickOrigin.Y);
		}
		if (this.stickKnob !== undefined) {
			this.stickKnob.Visible = visible;
			this.stickKnob.Position = this.drawAt(this.stickOrigin.X, this.stickOrigin.Y);
		}
	}

	private moveStick(pos: Vector2): void {
		const d = pos.sub(this.stickOrigin);
		const mag = d.Magnitude;
		const shown = mag > STICK_RADIUS ? d.mul(STICK_RADIUS / mag) : d;
		if (this.stickKnob !== undefined) {
			this.stickKnob.Position = this.drawAt(this.stickOrigin.X + shown.X, this.stickOrigin.Y + shown.Y);
		}
		const nx = shown.X / STICK_RADIUS;
		const ny = shown.Y / STICK_RADIUS;
		this.touchMoveX = nx > STICK_DEADZONE ? 1 : nx < -STICK_DEADZONE ? -1 : 0;
		this.touchMoveY = ny > STICK_DEADZONE ? 1 : ny < -STICK_DEADZONE ? -1 : 0;
		// Pushed to the edge of the stick = dash.
		this.touchDash = mag >= STICK_RADIUS;
	}

	private endStick(): void {
		this.stickTouch = undefined;
		this.touchMoveX = 0;
		this.touchMoveY = 0;
		this.touchDash = false;
		this.showStick(false);
	}
}
