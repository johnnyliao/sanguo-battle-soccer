// Match action bar: attack (J), pass / call (K) and special (L) buttons at the bottom-right of the match screen, the same
// on PC and touch. Each button has a transparent GuiButton on top of the drawn circle, so Roblox does the hit testing
// (no manual coordinate math). Touch and mouse presses on those buttons are tracked here and read by input.ts, which
// merges them with the keys and the joystick into the same ClientInput.
import type { LordWeapon, Setup, SetupPlayer, Snapshot } from "shared/net";
import { TICK_RATE } from "shared/net";
import { RAW_CHARACTERS } from "shared/game/data";
import { SPECIAL_COOLDOWN_TICKS } from "shared/game/sim/constants";
import { ART, skillIconFor, SKILL_ICON } from "./artIds";
import { picture } from "./artUi";
import { play } from "./sfx";
import { getCamMode, toggleCamMode } from "./camera";

const Players = game.GetService("Players");
const RunService = game.GetService("RunService");
const UserInputService = game.GetService("UserInputService");

export type ActionKey = "j" | "k" | "l";

/** Lord weapon specials: the lord's special name depends on his weapon. */
export const WEAPON_SPECIAL: Record<LordWeapon, string> = {
	sword: "天子劍・旋風斬",
	spear: "破陣槍・龍騰",
	fan: "鳳翼扇・羽風陣",
};

interface ButtonDef {
	key: ActionKey;
	/** Centre offset from the bottom-right corner of the screen, in px at full scale. */
	offX: number;
	offY: number;
	/** Diameter in px at full scale. */
	d: number;
}

/** Attack is the big one at the corner, pass above it, special to its left. */
const DEFS: ButtonDef[] = [
	{ key: "j", offX: 64, offY: 64, d: 128 },
	{ key: "k", offX: 64, offY: 186, d: 100 },
	{ key: "l", offX: 192, offY: 64, d: 108 },
];
const MARGIN = 12;
/** Full size at 600 px screen height and up; 0.75 on a 390 px phone (landscape). */
const SCALE_REF_H = 600;
const SCALE_MIN = 0.75;
const PRESS_FLASH_SECONDS = 0.18;
const PRESS_SCALE = 0.88;
const POP_SECONDS = 0.35;
const POPUP_SECONDS = 1.2;
/** Camera view toggle: round button at the top-right corner, and the mode name shown for CAM_TOAST_SECONDS. */
const CAM_BTN_D = 56;
const CAM_TOAST_SECONDS = 1.5;
const SPARKLE_SECONDS = 0.6;
const SPARKLE_COUNT = 10;
/** Longest time (seconds) the cooldown is extrapolated past the last snapshot. */
const MAX_EXTRAPOLATE = 0.05;
const READY_SOUND = "zhugeliang_hit";
const STAMINA_REASON = "體力不足";

const WHITE = Color3.fromRGB(255, 255, 255);
const BLACK = Color3.fromRGB(0, 0, 0);
const GOLD = Color3.fromRGB(255, 217, 138);
const RED = Color3.fromRGB(150, 24, 28);
const GREY = Color3.fromRGB(92, 92, 98);

/** One attack / pass / special button. */
interface Btn {
	def: ButtonDef;
	/** Circle box; its position and size follow the layout and the press scale. */
	wrap: Frame;
	/** Transparent GuiButton over the circle at full size (not scaled by the press); it receives the touch / click. */
	hit: TextButton;
	body: Frame;
	/** The button art (btn_attack / btn_pass / btn_special). */
	pic: ImageLabel;
	label: TextLabel;
	badge: TextLabel;
	flash: Frame;
	held: boolean;
	flashT: number;
	scale: number;
	/** Tutorial highlight: pulsing ring around the button and a bouncing arrow beside it. */
	hlStroke: UIStroke;
	hlArrow: TextLabel;
}

/** The special button's extra parts: gold halo, skill icon, cooldown shade, seconds, and the status texts. */
interface Special {
	btn: Btn;
	halo: Frame;
	haloStroke: UIStroke;
	icon: ImageLabel;
	sweep: Frame;
	sweepGrad: UIGradient;
	num: TextLabel;
	pill: TextLabel;
	popup: TextLabel;
}

interface Sparkle {
	f: Frame;
	cx: number;
	cy: number;
	s: number;
	ang: number;
	t: number;
}

let gui: ScreenGui | undefined;
const btns: Btn[] = [];
let special: Special | undefined;
let matchOn = false;
let humanIdx = -1;
let snapCd = 0;
let snapPhase = "";
let snapTime = 0;
let blockReason = "";
let holding = false;
let pkLive = false;
let readyPending = false;
let popT: number | undefined;
let popupT: number | undefined;
let camToast: TextLabel | undefined;
let camToastT: number | undefined;
let clock = 0;
const pressed: Record<ActionKey, boolean> = { j: false, k: false, l: false };
/** Touch / mouse pointers that began on a button, with the key each one holds until it lifts (a finger may slide off). */
const pointers = new Map<InputObject, ActionKey>();
/** Keys whose press began since the last takeActionPresses() call, so a quick tap still counts. */
let newPresses = new Set<ActionKey>();
let sparkles: Sparkle[] = [];
/** Button the tutorial highlights (undefined = none) and whether its pulse runs faster (a long step). */
let highlightKey: ActionKey | undefined;
let highlightFast = false;

function disc(parent: Instance, color: Color3, transparency: number): Frame {
	const f = new Instance("Frame");
	f.AnchorPoint = new Vector2(0.5, 0.5);
	f.Position = UDim2.fromScale(0.5, 0.5);
	f.Size = UDim2.fromScale(1, 1);
	f.BackgroundColor3 = color;
	f.BackgroundTransparency = transparency;
	f.BorderSizePixel = 0;
	const corner = new Instance("UICorner");
	corner.CornerRadius = new UDim(0.5, 0);
	corner.Parent = f;
	f.Parent = parent;
	return f;
}

function rect(parent: Instance, size: UDim2, pos: UDim2, color: Color3, transparency: number, rotation: number): Frame {
	const f = new Instance("Frame");
	f.AnchorPoint = new Vector2(0.5, 0.5);
	f.Size = size;
	f.Position = pos;
	f.BackgroundColor3 = color;
	f.BackgroundTransparency = transparency;
	f.BorderSizePixel = 0;
	f.Rotation = rotation;
	f.Parent = parent;
	return f;
}

/** Scaled text label, centred on its position. */
function label(parent: Instance, content: string, size: UDim2, pos: UDim2): TextLabel {
	const t = new Instance("TextLabel");
	t.AnchorPoint = new Vector2(0.5, 0.5);
	t.BackgroundTransparency = 1;
	t.Size = size;
	t.Position = pos;
	t.Font = Enum.Font.GothamBlack;
	t.Text = content;
	t.TextColor3 = WHITE;
	t.TextScaled = true;
	t.TextStrokeTransparency = 0.2;
	t.TextStrokeColor3 = BLACK;
	t.Parent = parent;
	return t;
}

/** A touch or left click that began on a button: it holds that key until the pointer lifts. */
function onButtonBegan(key: ActionKey, input: InputObject): void {
	if (input.UserInputType !== Enum.UserInputType.Touch && input.UserInputType !== Enum.UserInputType.MouseButton1) return;
	pointers.set(input, key);
	newPresses.add(key);
}

function buildBtn(screen: ScreenGui, def: ButtonDef): Btn {
	const wrap = new Instance("Frame");
	wrap.AnchorPoint = new Vector2(0.5, 0.5);
	wrap.BackgroundTransparency = 1;
	wrap.BorderSizePixel = 0;
	wrap.Parent = screen;

	const hit = new Instance("TextButton");
	hit.AnchorPoint = new Vector2(0.5, 0.5);
	hit.BackgroundTransparency = 1;
	hit.BorderSizePixel = 0;
	hit.AutoButtonColor = false;
	hit.Text = "";
	hit.Parent = screen;
	hit.InputBegan.Connect((input: InputObject) => {
		onButtonBegan(def.key, input);
	});

	// The body is transparent: the button art is the circle, and the children sit on top of it.
	const body = disc(wrap, BLACK, 1);
	const artId = def.key === "j" ? ART.btn_attack : def.key === "k" ? ART.btn_pass : ART.btn_special;
	const pic = picture(body, artId, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0));

	let text = "";
	if (def.key === "j") {
		text = "攻擊\n／射門";
	} else if (def.key === "k") {
		text = "傳球";
	}
	const lab = label(
		body,
		text,
		def.key === "j" ? UDim2.fromScale(0.9, 0.36) : UDim2.fromScale(0.8, 0.5),
		def.key === "j" ? UDim2.fromScale(0.5, 0.77) : UDim2.fromScale(0.5, 0.5),
	);
	lab.ZIndex = 3;

	const badge = label(body, def.key === "j" ? "J" : def.key === "k" ? "K" : "L", UDim2.fromOffset(26, 22), UDim2.fromScale(0.04, 0.04));
	badge.AnchorPoint = new Vector2(0, 0);
	badge.BackgroundColor3 = BLACK;
	badge.BackgroundTransparency = 0.3;
	badge.TextColor3 = GOLD;
	badge.ZIndex = 4;
	badge.Visible = UserInputService.KeyboardEnabled;
	const badgeCorner = new Instance("UICorner");
	badgeCorner.CornerRadius = new UDim(0.25, 0);
	badgeCorner.Parent = badge;

	const flash = disc(body, WHITE, 1);
	flash.ZIndex = 5;

	const hlRing = disc(wrap, WHITE, 1);
	hlRing.Size = UDim2.fromScale(1.2, 1.2);
	hlRing.ZIndex = 0;
	const hlStroke = new Instance("UIStroke");
	hlStroke.Color = WHITE;
	hlStroke.Thickness = 4;
	hlStroke.Transparency = 1;
	hlStroke.Parent = hlRing;

	const hlArrow = label(screen, "▼", UDim2.fromOffset(34, 34), UDim2.fromOffset(0, 0));
	hlArrow.TextColor3 = GOLD;
	hlArrow.Rotation = -45;
	hlArrow.Visible = false;

	return { def, wrap, hit, body, pic, label: lab, badge, flash, held: false, flashT: 0, scale: 1, hlStroke, hlArrow };
}

function buildSpecial(screen: ScreenGui, b: Btn): Special {
	const halo = disc(b.wrap, GOLD, 1);
	halo.Size = UDim2.fromScale(1.24, 1.24);
	halo.ZIndex = 0;
	const haloStroke = new Instance("UIStroke");
	haloStroke.Color = GOLD;
	haloStroke.Thickness = 4;
	haloStroke.Transparency = 1;
	haloStroke.Parent = halo;

	// Skill icon (the human's special) in the upper middle of the button; the image is set in onActionSetup.
	const icon = picture(b.body, "", UDim2.fromScale(0.46, 0.46), UDim2.fromScale(0.5, 0.42));
	icon.AnchorPoint = new Vector2(0.5, 0.5);

	const sweep = disc(b.body, BLACK, 0.3);
	sweep.Visible = false;
	sweep.ZIndex = 2;
	const sweepGrad = new Instance("UIGradient");
	sweepGrad.Rotation = 90;
	sweepGrad.Parent = sweep;

	b.label.Text = "大招";
	b.label.Size = UDim2.fromScale(0.9, 0.2);
	b.label.Position = UDim2.fromScale(0.5, 0.82);
	const num = label(b.body, "", UDim2.fromScale(0.6, 0.42), UDim2.fromScale(0.5, 0.42));
	num.ZIndex = 3;

	const pill = label(screen, "", UDim2.fromOffset(150, 26), UDim2.fromOffset(0, 0));
	pill.AnchorPoint = new Vector2(0.5, 1);
	pill.BackgroundColor3 = BLACK;
	pill.BackgroundTransparency = 0.25;
	pill.Visible = false;
	const pillCorner = new Instance("UICorner");
	pillCorner.CornerRadius = new UDim(0.5, 0);
	pillCorner.Parent = pill;

	const popup = label(screen, "大招就緒！", UDim2.fromOffset(220, 40), UDim2.fromOffset(0, 0));
	popup.AnchorPoint = new Vector2(0.5, 1);
	popup.TextColor3 = GOLD;
	popup.TextStrokeTransparency = 0;
	popup.Visible = false;

	return { btn: b, halo, haloStroke, icon, sweep, sweepGrad, num, pill, popup };
}

/** Full size at a tall screen, smaller on phones. */
function barScale(size: Vector2): number {
	return math.clamp(size.Y / SCALE_REF_H, SCALE_MIN, 1);
}

/** Centre of a button in screen px for the given viewport size and scale. */
function centreOf(def: ButtonDef, size: Vector2, s: number): [number, number] {
	return [size.X - (MARGIN + def.offX) * s, size.Y - (MARGIN + def.offY) * s];
}

/** Seconds of cooldown left in ticks, extrapolated from the last snapshot while the sim is in play. */
function remainingTicks(now: number): number {
	if (snapCd <= 0) return 0;
	if (snapPhase !== "play") return snapCd;
	const elapsed = math.min(now - snapTime, MAX_EXTRAPOLATE);
	return math.max(0, snapCd - elapsed * TICK_RATE);
}

/** Cooldown shade: dark over the top `frac` of the circle, so the bright part grows up from the bottom as it recovers. */
function shadeSequence(frac: number): NumberSequence {
	if (frac <= 0.02) return new NumberSequence(1);
	if (frac >= 0.98) return new NumberSequence(0);
	return new NumberSequence([
		new NumberSequenceKeypoint(0, 0),
		new NumberSequenceKeypoint(frac, 0),
		new NumberSequenceKeypoint(frac + 0.01, 1),
		new NumberSequenceKeypoint(1, 1),
	]);
}

/** Short special name: the part after "・" for the long lord names (天子劍・旋風斬 -> 旋風斬). */
function shortName(full: string): string {
	const [, stop] = string.find(full, "・", 1, true);
	return stop === undefined ? full : string.sub(full, stop + 1);
}

function specialNameOf(me: SetupPlayer | undefined): string {
	if (me === undefined) return "大招";
	if (me.specialName !== undefined) return me.specialName;
	if (me.weapon !== undefined) return WEAPON_SPECIAL[me.weapon];
	const def = RAW_CHARACTERS.find((c) => c.id === me.charId);
	return def === undefined ? "大招" : def.special.name;
}

/** Icon image of the human's special: from the setup's specialIcon key, else the old charId / weapon lookup. */
function specialIconOf(me: SetupPlayer): string {
	if (me.specialIcon !== undefined) return SKILL_ICON[me.specialIcon] ?? "";
	return skillIconFor(me.charId, me.weapon) ?? "";
}

function spawnSparkles(screen: ScreenGui, cx: number, cy: number, s: number): void {
	for (let i = 0; i < SPARKLE_COUNT; i++) {
		const f = rect(screen, UDim2.fromOffset(9 * s, 9 * s), UDim2.fromOffset(cx, cy), i % 2 === 0 ? GOLD : WHITE, 0, 45);
		sparkles.push({ f, cx, cy, s, ang: (i / SPARKLE_COUNT) * math.pi * 2 + math.random() * 0.3, t: 0 });
	}
}

function updateSparkles(dt: number): void {
	const alive: Sparkle[] = [];
	for (const sk of sparkles) {
		sk.t += dt;
		if (sk.t >= SPARKLE_SECONDS) {
			sk.f.Destroy();
			continue;
		}
		const p = sk.t / SPARKLE_SECONDS;
		const dist = (28 + 64 * p) * sk.s;
		sk.f.Position = UDim2.fromOffset(sk.cx + math.cos(sk.ang) * dist, sk.cy + math.sin(sk.ang) * dist);
		sk.f.BackgroundTransparency = p;
		alive.push(sk);
	}
	sparkles = alive;
}

function updateBtn(b: Btn, dt: number, size: Vector2, s: number): void {
	const isSpecial = b.def.key === "l";
	const isHeld = pressed[b.def.key];
	if (isHeld && !b.held) b.flashT = PRESS_FLASH_SECONDS;
	b.held = isHeld;
	b.flashT = math.max(0, b.flashT - dt);
	let target = isHeld ? PRESS_SCALE : 1;
	if (isSpecial && popT !== undefined) target *= 1 + 0.25 * (1 - popT / POP_SECONDS);
	b.scale += (target - b.scale) * math.min(1, dt * 18);
	const d = b.def.d * s * b.scale;
	const [cx, cy] = centreOf(b.def, size, s);
	b.wrap.Position = UDim2.fromOffset(cx, cy);
	b.wrap.Size = UDim2.fromOffset(d, d);
	b.wrap.Visible = !(isSpecial && pkLive);
	const full = b.def.d * s;
	b.hit.Position = UDim2.fromOffset(cx, cy);
	b.hit.Size = UDim2.fromOffset(full, full);
	b.hit.Visible = b.wrap.Visible;
	b.badge.Size = UDim2.fromOffset(26 * s, 22 * s);
	b.flash.BackgroundTransparency = 1 - 0.55 * (b.flashT / PRESS_FLASH_SECONDS);

	// Tutorial highlight: pulsing ring, and an arrow at the upper-left diagonal that bounces toward the button.
	const on = highlightKey === b.def.key && !(isSpecial && pkLive);
	const pulse = 0.5 + 0.5 * math.sin(clock * (highlightFast ? 10 : 5));
	b.hlStroke.Color = isSpecial ? GOLD : WHITE;
	b.hlStroke.Transparency = on ? 0.1 + 0.5 * (1 - pulse) : 1;
	b.hlStroke.Thickness = 3 + 2 * pulse;
	b.hlArrow.Visible = on;
	if (on) {
		const reach = (d * 0.5) + 26 * s + 4 * s * math.sin(clock * (highlightFast ? 16 : 8));
		const diag = math.sqrt(0.5);
		b.hlArrow.Size = UDim2.fromOffset(34 * s, 34 * s);
		b.hlArrow.Position = UDim2.fromOffset(cx - reach * diag, cy - reach * diag);
	}
}

/** Special button state: cooldown shade and seconds, red / grey when blocked, gold halo when ready, pill and popup. */
function updateSpecial(sp: Special, size: Vector2, s: number, rem: number, cooling: boolean, ready: boolean): void {
	const [cx, cy] = centreOf(DEFS[2], size, s);
	const top = cy - (DEFS[2].d * s) / 2;
	const shown = !pkLive;

	let reason = "";
	if (cooling) {
		sp.sweep.Visible = true;
		sp.sweepGrad.Transparency = shadeSequence(rem / SPECIAL_COOLDOWN_TICKS);
		sp.num.Text = `${math.ceil(rem / TICK_RATE)}`;
	} else {
		sp.sweep.Visible = false;
		sp.num.Text = "";
		reason = blockReason;
	}
	// Disabled art and a dimmed icon while cooling down or blocked (stamina, ball, ...).
	const unusable = cooling || reason !== "";
	sp.btn.pic.Image = unusable ? ART.btn_special_disabled : ART.btn_special;
	sp.icon.ImageTransparency = unusable ? 0.4 : 0;

	if (ready && shown) {
		const pulse = 0.5 + 0.5 * math.sin(clock * 4);
		sp.halo.BackgroundTransparency = 0.8 + 0.1 * pulse;
		sp.haloStroke.Transparency = 0.1 + 0.4 * (1 - pulse);
	} else {
		sp.halo.BackgroundTransparency = 1;
		sp.haloStroke.Transparency = 1;
	}

	sp.pill.Visible = shown && reason !== "";
	sp.pill.Text = reason;
	sp.pill.BackgroundColor3 = reason === STAMINA_REASON ? RED : GREY;
	sp.pill.Size = UDim2.fromOffset(150 * s, 26 * s);
	sp.pill.Position = UDim2.fromOffset(cx, top - 10 * s);

	if (popupT !== undefined && shown) {
		const p = popupT / POPUP_SECONDS;
		const fade = p < 0.6 ? 0 : (p - 0.6) / 0.4;
		sp.popup.Visible = true;
		sp.popup.Size = UDim2.fromOffset(220 * s, 40 * s);
		sp.popup.Position = UDim2.fromOffset(cx, top - 36 * s - 24 * s * p);
		sp.popup.TextTransparency = fade;
		sp.popup.TextStrokeTransparency = fade;
	} else {
		sp.popup.Visible = false;
	}
}

/** Top-right round "視角" button (GuiButton, so Roblox does the hit test) and the toast that names the view. */
function buildCamButton(screen: ScreenGui): void {
	const btn = new Instance("TextButton");
	btn.Name = "CamModeButton";
	btn.AnchorPoint = new Vector2(1, 0);
	btn.Position = new UDim2(1, -MARGIN, 0.3, 0); // right edge, below the top-right tutorial panel, above the action buttons
	btn.Size = UDim2.fromOffset(CAM_BTN_D, CAM_BTN_D);
	btn.BackgroundColor3 = BLACK;
	btn.BackgroundTransparency = 0.35;
	btn.BorderSizePixel = 0;
	btn.AutoButtonColor = false;
	btn.Font = Enum.Font.GothamBlack;
	btn.Text = "視角";
	btn.TextColor3 = WHITE;
	btn.TextScaled = true;
	btn.TextStrokeTransparency = 0.2;
	btn.TextStrokeColor3 = BLACK;
	btn.Parent = screen;
	const corner = new Instance("UICorner");
	corner.CornerRadius = new UDim(0.5, 0);
	corner.Parent = btn;
	const stroke = new Instance("UIStroke");
	stroke.Color = GOLD;
	stroke.Thickness = 2;
	stroke.Parent = btn;
	btn.Activated.Connect(() => {
		toggleCamView();
	});

	camToast = label(screen, "", UDim2.fromOffset(260, 44), UDim2.fromScale(0.5, 0.2));
	camToast.TextColor3 = GOLD;
	camToast.Visible = false;
}

/**
 * Switches the match camera between the side and behind views (the V key and the top-right button). The mode name
 * shows at the top of the screen for CAM_TOAST_SECONDS, during a match only.
 */
export function toggleCamView(): void {
	toggleCamMode();
	if (!matchOn || camToast === undefined) return;
	camToast.Text = getCamMode() === "side" ? "視角：側面" : "視角：背後";
	camToastT = 0;
}

/** Per-frame drawing: press scale and flash, cooldown interpolation, ready effects. */
function update(screen: ScreenGui, dt: number): void {
	clock += dt;
	if (!matchOn) return;
	const size = screen.AbsoluteSize;
	const s = barScale(size);
	const rem = remainingTicks(os.clock());
	const cooling = rem > 0;
	const ready = !cooling && blockReason === "";
	if (cooling) readyPending = true;
	if (popT !== undefined) {
		popT += dt;
		if (popT >= POP_SECONDS) popT = undefined;
	}
	if (popupT !== undefined) {
		popupT += dt;
		if (popupT >= POPUP_SECONDS) popupT = undefined;
	}
	if (ready && readyPending) {
		// The first time the special is usable again after a cast: pop, sparkles, chime and the popup.
		readyPending = false;
		popT = 0;
		popupT = 0;
		const [cx, cy] = centreOf(DEFS[2], size, s);
		spawnSparkles(screen, cx, cy, s);
		play(READY_SOUND);
	}
	if (camToast !== undefined && camToastT !== undefined) {
		camToastT += dt;
		const p = camToastT / CAM_TOAST_SECONDS;
		if (p >= 1) {
			camToastT = undefined;
			camToast.Visible = false;
		} else {
			const fade = p < 0.67 ? 0 : (p - 0.67) / 0.33;
			camToast.Visible = true;
			camToast.TextTransparency = fade;
			camToast.TextStrokeTransparency = fade;
		}
	}
	for (const b of btns) updateBtn(b, dt, size, s);
	if (special !== undefined) updateSpecial(special, size, s, rem, cooling, ready);
	updateSparkles(dt);
}

/** Builds the bar. Call once at startup; it stays hidden until setActionMatch(true). */
export function createActionBar(): void {
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const screen = new Instance("ScreenGui");
	screen.Name = "ActionBarGui";
	screen.IgnoreGuiInset = true;
	// Keep the bar clear of the iPhone notch and home indicator (device cutouts only; the top bar is still ignored).
	screen.ScreenInsets = Enum.ScreenInsets.DeviceSafeInsets;
	screen.ResetOnSpawn = false;
	// Above the HUD (10), below the tutorial banner and arrow (15) and the touch layer (20).
	screen.DisplayOrder = 12;
	screen.Enabled = false;
	screen.Parent = playerGui;
	gui = screen;

	for (const def of DEFS) btns.push(buildBtn(screen, def));
	special = buildSpecial(screen, btns[2]);
	buildCamButton(screen);

	RunService.RenderStepped.Connect((dt) => {
		if (gui !== undefined) update(gui, dt);
	});
	// A pointer lifts anywhere (even off the button it pressed): release its key.
	UserInputService.InputEnded.Connect((input: InputObject) => {
		pointers.delete(input);
	});
}

/** Shows the bar during a match (quick or story) and hides it on menus and result screens. */
export function setActionMatch(on: boolean): void {
	matchOn = on;
	if (gui !== undefined) gui.Enabled = on;
	if (!on) {
		popT = undefined;
		popupT = undefined;
		pointers.clear();
		newPresses = new Set<ActionKey>();
	}
}

/** Human's setup: which player he controls and his special's name. Resets the cooldown state for the new match. */
export function onActionSetup(s: Setup): void {
	humanIdx = s.humanIdx;
	const me = s.players.find((p) => p.idx === s.humanIdx);
	if (special !== undefined) {
		special.btn.label.Text = shortName(specialNameOf(me));
		special.icon.Image = me === undefined ? "" : specialIconOf(me);
	}
	snapCd = 0;
	snapPhase = "";
	blockReason = "";
	holding = false;
	pkLive = false;
	readyPending = false;
	popT = undefined;
	popupT = undefined;
	for (const sk of sparkles) sk.f.Destroy();
	sparkles = [];
}

/** Cooldown, block reason and ball possession from each snapshot; relabels attack and pass. */
export function onActionSnapshot(s: Snapshot): void {
	snapCd = s.cooldown;
	snapPhase = s.phase;
	snapTime = os.clock();
	blockReason = s.blockReason;
	holding = s.ball.owner === humanIdx;
	pkLive = s.pk !== undefined && s.pk.stage !== "done";
	if (btns.size() === 0) return;
	btns[0].label.Text = pkLive || holding ? "射門" : "攻擊\n／射門";
	btns[1].label.Text = pkLive ? "高球" : holding ? "傳球" : "叫球";
}

/** Keys held this frame (keyboard, touch or mouse), for the press flash and shrink. */
export function setActionPressed(j: boolean, k: boolean, l: boolean): void {
	pressed.j = j;
	pressed.k = k;
	pressed.l = l;
}

/** True while a touch or mouse press that began on this button is still down. */
export function isActionHeld(key: ActionKey): boolean {
	for (const [, k] of pointers) {
		if (k === key) return true;
	}
	return false;
}

/** Buttons pressed since the last call (a quick tap counts even if it lifted before the sample). Clears the record. */
export function takeActionPresses(): Set<ActionKey> {
	const out = newPresses;
	newPresses = new Set<ActionKey>();
	return out;
}

/** Screen y (px) of the top edge of the highest action button (the pass button), for placing HUD panels clear of the bar. */
export function actionBarTopPx(size: Vector2): number {
	const s = barScale(size);
	let top = size.Y;
	for (const def of DEFS) {
		const [, cy] = centreOf(def, size, s);
		top = math.min(top, cy - (def.d * s) / 2);
	}
	return top;
}

/** The special button's frame, for pointing at it (tutorial). */
export function getSpecialButton(): Frame | undefined {
	return special === undefined ? undefined : special.btn.wrap;
}

export type HighlightTarget = "attack" | "pass" | "special";
const HIGHLIGHT_KEY: Record<HighlightTarget, ActionKey> = { attack: "j", pass: "k", special: "l" };

/** Tutorial: highlights one button (pulsing ring + bouncing arrow); undefined clears it. fast = the faster pulse for a long step. */
export function highlightButton(which: HighlightTarget | undefined, fast = false): void {
	highlightKey = which === undefined ? undefined : HIGHLIGHT_KEY[which];
	highlightFast = fast;
}
