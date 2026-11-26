// Three-Kingdoms stamina bar drawn over a player's head: dark lacquer frame, gold stroke, jewel caps,
// a lagging "ghost" damage bar and a gradient fill. Plain GuiObjects only; update() is driven by render.ts.
import { colourOf } from "./world";

export interface StaminaBar {
	root: Frame;
	update(fill: number, dt: number): void;
}

const BAR_W = 84;
const BAR_H = 12;
const INNER = 2;
const TRACK_W = BAR_W - INNER * 2;
const TRACK_H = BAR_H - INNER * 2;
const LACQUER_DARK = 0x2a0f0c;
const TRACK_DARK = 0x140806;
const GOLD = 0xd9a21b;
const GHOST = 0xfff0c0;
const DANGER = 0xff3b30;
/** Seconds the ghost bar waits after a drop before it starts shrinking. */
const GHOST_HOLD = 0.35;
/** Ghost shrink speed (fraction of the bar per second). */
const GHOST_SPEED = 0.8;
/** Exponential ease rate for the fill (about 0.1 s to settle). */
const FILL_RATE = 10;
const PULSE_HZ = 3;
const LOW_FILL = 0.3;

const GOLD_C = colourOf(GOLD);
const DANGER_C = colourOf(DANGER);
const WHITE_C = colourOf(0xffffff);
/** Band 0 = green (>0.6), 1 = yellow (>=0.3), 2 = red. */
const BAND_BASE: Color3[] = [colourOf(0x39c24a), colourOf(0xf2c230), colourOf(0xe0392b)];
/** Vertical gradient per band: lighter tint on top, base colour at the bottom. */
const BAND_GRAD: ColorSequence[] = BAND_BASE.map((c) => new ColorSequence(c.Lerp(WHITE_C, 0.45), c));

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function fillBand(st: number): number {
	if (st > 0.6) return 0;
	if (st >= 0.3) return 1;
	return 2;
}

/** Rotated square centred at (x, mid-height) of the bar. */
function diamond(parent: Frame, x: number, size: number, colour: Color3): Frame {
	const d = new Instance("Frame");
	d.AnchorPoint = new Vector2(0.5, 0.5);
	d.Position = UDim2.fromOffset(x, BAR_H / 2);
	d.Size = UDim2.fromOffset(size, size);
	d.Rotation = 45;
	d.BackgroundColor3 = colour;
	d.BorderSizePixel = 0;
	d.Parent = parent;
	return d;
}

/** Builds the bar under the name label. `parent` is the player's tag BillboardGui; `teamColour` fills the jewel. */
export function makeStaminaBar(parent: BillboardGui, teamColour: Color3): StaminaBar {
	const root = new Instance("Frame");
	root.Name = "StaminaBar";
	root.AnchorPoint = new Vector2(0.5, 0);
	root.Position = new UDim2(0.5, 0, 0, 22);
	root.Size = UDim2.fromOffset(BAR_W, BAR_H);
	root.BackgroundColor3 = colourOf(LACQUER_DARK);
	root.BorderSizePixel = 0;
	root.Parent = parent;

	const corner = new Instance("UICorner");
	corner.CornerRadius = new UDim(0, 3);
	corner.Parent = root;

	const stroke = new Instance("UIStroke");
	stroke.Color = GOLD_C;
	stroke.Thickness = 1.5;
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border;
	stroke.Parent = root;

	const track = new Instance("Frame");
	track.Name = "Track";
	track.Position = UDim2.fromOffset(INNER, INNER);
	track.Size = UDim2.fromOffset(TRACK_W, TRACK_H);
	track.BackgroundColor3 = colourOf(TRACK_DARK);
	track.BorderSizePixel = 0;
	track.ClipsDescendants = true;
	track.Parent = root;

	const trackCorner = new Instance("UICorner");
	trackCorner.CornerRadius = new UDim(0, 2);
	trackCorner.Parent = track;

	// Ghost first so the real fill draws over it.
	const ghost = new Instance("Frame");
	ghost.Name = "Ghost";
	ghost.Size = UDim2.fromScale(1, 1);
	ghost.BackgroundColor3 = colourOf(GHOST);
	ghost.BackgroundTransparency = 0.3;
	ghost.BorderSizePixel = 0;
	ghost.Parent = track;

	const fill = new Instance("Frame");
	fill.Name = "Fill";
	fill.Size = UDim2.fromScale(1, 1);
	fill.BackgroundColor3 = WHITE_C; // gradient carries the colour
	fill.BorderSizePixel = 0;
	fill.Parent = track;

	const grad = new Instance("UIGradient");
	grad.Rotation = 90;
	grad.Color = BAND_GRAD[0];
	grad.Parent = fill;

	// Thin glossy highlight across the top of the fill; child of fill so it follows the width.
	const gloss = new Instance("Frame");
	gloss.Name = "Gloss";
	gloss.Size = new UDim2(1, 0, 0, 1);
	gloss.BackgroundColor3 = WHITE_C;
	gloss.BackgroundTransparency = 0.6;
	gloss.BorderSizePixel = 0;
	gloss.Parent = fill;

	for (const q of [0.25, 0.5, 0.75]) {
		const tick = new Instance("Frame");
		tick.Name = "Tick";
		tick.AnchorPoint = new Vector2(0.5, 0);
		tick.Position = UDim2.fromScale(q, 0);
		tick.Size = UDim2.fromOffset(1, TRACK_H);
		tick.BackgroundColor3 = colourOf(0x000000);
		tick.BackgroundTransparency = 0.5;
		tick.BorderSizePixel = 0;
		tick.Parent = track;
	}

	// Jewel caps: gold diamond on the left with a team-colour pearl inside, smaller gold cap on the right.
	diamond(root, 0, 12, GOLD_C);
	diamond(root, 0, 7, teamColour);
	diamond(root, BAR_W, 8, GOLD_C);

	let shown = 1;
	let ghostV = 1;
	let holdT = 0;
	let band = -1;
	let clock = 0;
	let wasLow = false;

	return {
		root,
		update(st: number, dt: number): void {
			const target = math.max(0, math.min(1, st));

			// Real fill eases toward the target.
			shown = lerp(shown, target, math.min(1, dt * FILL_RATE));
			fill.Size = UDim2.fromScale(shown, 1);

			// Ghost: snaps up at once, lags after a drop, then shrinks toward the fill.
			if (target >= ghostV) {
				ghostV = target;
				holdT = 0;
			} else {
				holdT += dt;
				if (holdT > GHOST_HOLD) ghostV = math.max(target, ghostV - GHOST_SPEED * dt);
			}
			ghost.Size = UDim2.fromScale(ghostV, 1);

			const b = fillBand(target);
			if (b !== band) {
				band = b;
				grad.Color = BAND_GRAD[b];
			}

			// Low stamina: the gold stroke pulses toward red.
			clock += dt;
			const low = target < LOW_FILL;
			if (low) {
				const p = 0.5 + 0.5 * math.sin(clock * math.pi * 2 * PULSE_HZ);
				stroke.Color = GOLD_C.Lerp(DANGER_C, p);
			} else if (wasLow) {
				stroke.Color = GOLD_C;
			}
			wasLow = low;
		}
	};
}
