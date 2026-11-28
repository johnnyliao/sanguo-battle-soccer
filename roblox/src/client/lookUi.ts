// Lord camp "外觀" page (R3b-2): ten slot buttons on the left (slot name and the part worn there), the parts of the chosen
// slot on the right (a "不穿" entry first; unlocked parts tap to wear, locked ones grey with their unlock level), and an
// "自動穿最新" switch on top. Rebuilt from the profile on every call. The camp owns the screen and sends the commands
// through the callbacks. Built in its own file to keep storyUi.ts under the Luau local limit.
import type { Profile } from "shared/profileTypes";
import { COSMETICS, cosmeticsOf, resolveLook, SLOTS, SLOT_NAME, type Slot } from "shared/cosmetics";
import { rankByTier, rankFor } from "shared/rank";
import { ART4, PART_ICON } from "./artIds";
import { artButton, picture } from "./artUi";
import { BLACK, frame, GOLD, text, WHITE } from "./hud";

/** Same header height and gap as storyUi (the camp header row). */
const HEADER_H = 64;
const HEADER_PAD = 10;
const LOCKED_BG = Color3.fromRGB(60, 60, 66);
const LOCKED_TEXT = Color3.fromRGB(150, 150, 156);
/** Colour block shown in place of an icon (no part icons yet). */
const SLOT_COLOUR: Record<Slot, Color3> = {
	helmet: Color3.fromRGB(150, 150, 160),
	shoulder: Color3.fromRGB(120, 90, 60),
	chest: Color3.fromRGB(90, 110, 150),
	cape: Color3.fromRGB(150, 40, 40),
	back: Color3.fromRGB(200, 160, 60),
	beast: Color3.fromRGB(60, 140, 90),
	trail: Color3.fromRGB(170, 130, 80),
	orbit: Color3.fromRGB(120, 170, 220),
	entrance: Color3.fromRGB(230, 120, 40),
	goal: Color3.fromRGB(210, 180, 60),
};
/** Slots whose effects come in R3b-3; their parts are saved but do not show yet. */
const EFFECT_SLOTS: Slot[] = ["beast", "trail", "orbit", "entrance", "goal"];

export interface LookActions {
	onSelect: (slot: Slot) => void;
	onPick: (slot: Slot, id: string) => void;
	onAuto: () => void;
	onBack: () => void;
}

/** A label that fills a box and wraps (names, unlock notes). */
function wrapped(parent: Instance, content: string, size: UDim2, pos: UDim2): TextLabel {
	const t = text(parent, content, size, pos);
	t.TextWrapped = true;
	return t;
}

/** Part icon: a square in the upper half of the cell. A locked part's icon is dimmed to grey. */
function partIcon(parent: Instance, icon: string, locked: boolean): void {
	const img = picture(parent, icon, UDim2.fromScale(0.5, 0.5), UDim2.fromScale(0.5, 0.03));
	img.AnchorPoint = new Vector2(0.5, 0);
	const ratio = new Instance("UIAspectRatioConstraint");
	ratio.AspectRatio = 1;
	ratio.DominantAxis = Enum.DominantAxis.Height;
	ratio.Parent = img;
	if (locked) img.ImageColor3 = Color3.fromRGB(90, 90, 90);
}

/** Gold outline on a cell (the part worn in its slot). */
function wornStroke(parent: Instance, thickness: number): void {
	const stroke = new Instance("UIStroke");
	stroke.Color = GOLD;
	stroke.Thickness = thickness;
	stroke.Parent = parent;
}

/**
 * Draws the appearance page into `page` (a full-screen frame). top = px top of the header row (below the Roblox top bar);
 * selected = the slot whose parts are listed on the right.
 */
export function renderLookPage(page: Frame, p: Profile, selected: Slot, top: number, actions: LookActions): void {
	page.ClearAllChildren();
	picture(page, ART4.camp_bg, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), Enum.ScaleType.Crop);
	const tier = rankFor(p.lordLevel).tier;
	const look = resolveLook(p);
	const cos = cosmeticsOf(p);
	const bodyTop = top + HEADER_H + HEADER_PAD;

	// Header: back to the camp, title, and the auto switch (shows "開" when nothing is picked by hand; a tap clears the picks).
	const back = artButton(page, "blue", new UDim2(0.16, 0, 0, HEADER_H), new UDim2(0.02, 0, 0, top));
	text(back, "返回營帳", UDim2.fromScale(0.8, 0.5), UDim2.fromScale(0.1, 0.25));
	back.Activated.Connect(() => actions.onBack());
	text(page, "主公外觀", new UDim2(0.2, 0, 0, HEADER_H), new UDim2(0.22, 0, 0, top));
	let manual = 0;
	for (const slot of SLOTS) {
		if (cos.picks[slot] !== undefined) manual++;
	}
	const auto = artButton(page, "gold", new UDim2(0.36, 0, 0, HEADER_H), new UDim2(0.6, 0, 0, top));
	text(auto, manual === 0 ? "自動穿最新：開" : `自動穿最新（${manual} 格手選）`, UDim2.fromScale(0.9, 0.5), UDim2.fromScale(0.05, 0.25));
	auto.Activated.Connect(() => actions.onAuto());

	// Body: everything below the header, so its fractions start under it.
	const body = frame(page, new UDim2(1, 0, 1, -bodyTop), new UDim2(0, 0, 0, bodyTop), BLACK, 1);

	// Left: the ten slots, each showing the part worn there.
	SLOTS.forEach((slot, i) => {
		const worn = look[slot];
		const def = worn === undefined || worn === "none" ? undefined : COSMETICS.find((d) => d.id === worn);
		const cell = artButton(body, "blue", UDim2.fromScale(0.3, 0.092), UDim2.fromScale(0.02, 0.01 + i * 0.097));
		text(cell, SLOT_NAME[slot], UDim2.fromScale(0.3, 0.8), UDim2.fromScale(0.03, 0.1)).TextColor3 = GOLD;
		wrapped(cell, def !== undefined ? def.name : "不穿", UDim2.fromScale(0.62, 0.8), UDim2.fromScale(0.35, 0.1));
		if (slot === selected) wornStroke(cell, 3);
		cell.Activated.Connect(() => actions.onSelect(slot));
	});

	// Right: "不穿" then every part of the selected slot in a 3-column grid (9 cells at most).
	const wornNow = look[selected];
	const options: { id: string; name: string; unlockTier: number }[] = [{ id: "none", name: "不穿", unlockTier: 0 }];
	for (const d of COSMETICS) {
		if (d.slot === selected) options.push({ id: d.id, name: d.name, unlockTier: d.unlockTier });
	}
	options.forEach((o, i) => {
		const pos = UDim2.fromScale(0.36 + (i % 3) * 0.21, 0.01 + math.floor(i / 3) * 0.33);
		const size = UDim2.fromScale(0.2, 0.3);
		const isWorn = o.id === "none" ? wornNow === undefined || wornNow === "none" : wornNow === o.id;
		const icon: string | undefined = PART_ICON[o.id];
		if (o.unlockTier <= tier) {
			const cell = artButton(body, "blue", size, pos);
			if (icon !== undefined) {
				partIcon(cell, icon, false);
				wrapped(cell, o.name, UDim2.fromScale(0.9, 0.36), UDim2.fromScale(0.05, 0.56)).TextColor3 = WHITE;
			} else {
				const swatch = frame(cell, UDim2.fromScale(0.22, 0.6), UDim2.fromScale(0.05, 0.2), SLOT_COLOUR[selected], 0);
				swatch.ZIndex = cell.ZIndex + 1;
				wrapped(cell, o.name, UDim2.fromScale(0.66, 0.8), UDim2.fromScale(0.3, 0.1)).TextColor3 = WHITE;
			}
			if (isWorn) wornStroke(cell, 4);
			cell.Activated.Connect(() => actions.onPick(selected, o.id));
		} else {
			const cell = frame(body, size, pos, LOCKED_BG, 0.1);
			const lv = rankByTier(o.unlockTier).minLevel;
			const note = `${o.name}（Lv.${lv}）解鎖`;
			if (icon !== undefined) {
				partIcon(cell, icon, true);
				wrapped(cell, note, UDim2.fromScale(0.9, 0.36), UDim2.fromScale(0.05, 0.56)).TextColor3 = LOCKED_TEXT;
			} else {
				const swatch = frame(cell, UDim2.fromScale(0.22, 0.6), UDim2.fromScale(0.05, 0.2), LOCKED_BG, 0);
				swatch.ZIndex = cell.ZIndex + 1;
				wrapped(cell, note, UDim2.fromScale(0.66, 0.8), UDim2.fromScale(0.3, 0.1)).TextColor3 = LOCKED_TEXT;
			}
		}
	});
	if (EFFECT_SLOTS.includes(selected)) {
		wrapped(body, "特效部件（R3b-3 上線後才會在場上看到）", UDim2.fromScale(0.62, 0.07), UDim2.fromScale(0.36, 0.93));
	}
}
