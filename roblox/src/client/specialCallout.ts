// Cast callout for the lord's three specials: a diagonal name banner sliding in across the lower middle of the screen,
// with a short white flash for the human's lord. One banner at a time (a new cast replaces the old one). Timing is real
// time, so the banner keeps its length under the showroom time scale. clearCallout() removes it on match reset.
import type { SetupPlayer } from "shared/net";
import { SKILL_ICON } from "./artIds";
import { picture } from "./artUi";
import { WEAPON_SPECIAL } from "./actionBar";
import * as fx from "./fx";
import { WHITE } from "./matchUtil";

const Players = game.GetService("Players");

const BANNER_SECS = 1.2;
const SLIDE_SECS = 0.22;
const FADE_SECS = 0.25;
/** White flash for the human's cast: alpha 0.25 (transparency 0.75), 0.1 s. */
const FLASH_TRANSPARENCY = 0.75;
const FLASH_SECS = 0.1;
const BACK_DARK = Color3.fromRGB(20, 14, 8);

let gui: ScreenGui | undefined;
let banner: Frame | undefined;
let token = 0;

function ensureGui(): ScreenGui | undefined {
	if (gui !== undefined && gui.Parent !== undefined) return gui;
	const playerGui = Players.LocalPlayer.FindFirstChild("PlayerGui");
	if (playerGui === undefined) return undefined;
	const g = new Instance("ScreenGui");
	g.Name = "SpecialCallout";
	g.IgnoreGuiInset = true;
	g.ResetOnSpawn = false;
	g.DisplayOrder = 55;
	g.Parent = playerGui;
	gui = g;
	return g;
}

/** The human's SetupPlayer (name and icon of his special), see setCalloutHuman. */
let humanPlayer: SetupPlayer | undefined;

/** Match setup: the human's lord, whose special's name and icon the cast banners use. Call with the human's SetupPlayer. */
export function setCalloutHuman(me: SetupPlayer | undefined): void {
	humanPlayer = me;
}

/** Skill icon for a cast name: the human's special from the setup. The weapon mapping is only a fallback for a setup without specialName. */
function skillIconOf(name: string): string | undefined {
	const me = humanPlayer;
	if (me !== undefined && me.specialName !== undefined) {
		if (name !== me.specialName || me.specialIcon === undefined) return undefined;
		return SKILL_ICON[me.specialIcon];
	}
	if (name === WEAPON_SPECIAL.sword) return SKILL_ICON.lord_sword;
	if (name === WEAPON_SPECIAL.spear) return SKILL_ICON.lord_spear;
	if (name === WEAPON_SPECIAL.fan) return SKILL_ICON.lord_fan;
	return undefined;
}

/** Removes the banner (new cast, match reset). Running animations stop at their next step. */
export function clearCallout(): void {
	token += 1;
	if (banner !== undefined) {
		banner.Destroy();
		banner = undefined;
	}
}

/**
 * Shows `text` in a diagonal banner for BANNER_SECS. big = the human's own lord: full size plus the white flash.
 * Enemy lords get a smaller, quieter banner without the flash.
 */
export function callout(text: string, accent: Color3, big: boolean): void {
	const g = ensureGui();
	if (g === undefined) return;
	clearCallout();
	const mine = token;
	const scale = big ? 1 : 0.7;
	const baseT = big ? 0.25 : 0.45;
	const icon = skillIconOf(text);

	const frame = new Instance("Frame");
	frame.AnchorPoint = new Vector2(0.5, 0.5);
	frame.Size = UDim2.fromScale(0.5 * scale, 0.13 * scale);
	frame.Position = UDim2.fromScale(0.5, 0.74);
	frame.Rotation = -8;
	frame.BackgroundColor3 = BACK_DARK;
	frame.BackgroundTransparency = baseT;
	frame.BorderSizePixel = 0;
	frame.ZIndex = 5;
	frame.Parent = g;

	const stroke = new Instance("UIStroke");
	stroke.Color = accent;
	stroke.Thickness = big ? 3 : 2;
	stroke.Parent = frame;

	const label = new Instance("TextLabel");
	label.BackgroundTransparency = 1;
	label.AnchorPoint = new Vector2(0.5, 0.5);
	// With a skill icon on the left, the name sits to its right.
	label.Position = UDim2.fromScale(icon === undefined ? 0.5 : 0.63, 0.5);
	label.Size = icon === undefined ? UDim2.fromScale(0.94, 0.78) : UDim2.fromScale(0.72, 0.78);
	label.Text = text;
	label.Font = Enum.Font.GothamBlack;
	label.TextScaled = true;
	label.TextColor3 = WHITE;
	label.TextStrokeColor3 = accent;
	label.TextStrokeTransparency = 0;
	label.ZIndex = 6;
	label.Parent = frame;

	// Square icon, fitted to the banner height, on the left (it fades with the banner).
	const pic = icon === undefined ? undefined : picture(frame, icon, UDim2.fromScale(0.2, 0.8), UDim2.fromScale(0.03, 0.1));
	if (pic !== undefined) pic.ZIndex = 6;

	banner = frame;
	if (big) fx.flash(WHITE, FLASH_TRANSPARENCY, FLASH_SECS);

	task.spawn(() => {
		const t0 = os.clock();
		while (mine === token) {
			const t = os.clock() - t0;
			if (t >= BANNER_SECS) break;
			// Slide in from the lower left (ease-out), settle on the lower middle, then fade out at the end.
			const inK = math.min(1, t / SLIDE_SECS);
			const eased = 1 - (1 - inK) * (1 - inK);
			const outK = math.max(0, (t - (BANNER_SECS - FADE_SECS)) / FADE_SECS);
			frame.Position = UDim2.fromScale(0.5 - 0.36 * (1 - eased), 0.74 + 0.08 * (1 - eased));
			frame.BackgroundTransparency = baseT + (1 - baseT) * outK;
			stroke.Transparency = outK;
			label.TextTransparency = outK;
			label.TextStrokeTransparency = outK;
			if (pic !== undefined) pic.ImageTransparency = outK;
			task.wait();
		}
		if (mine === token) clearCallout();
	});
}
