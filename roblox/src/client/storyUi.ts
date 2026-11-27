// Story mode UI (chapter 1): main menu, first-time intro + country + starter, stage map, pre-match dialogue and the
// result screen. Each screen is a full-screen frame in its own ScreenGui above the match HUD. Look and helpers come
// from hud.ts. The server owns the profile: this file reads it (GetProfile / ProfileChanged) and fires commands only.
import { RAW_CHARACTERS, type CharacterDef, type LordClass, type Stats } from "shared/game/data";
import type { Command, Country, Remotes, StoryResult } from "shared/net";
import { getProfileRemotes, type Profile } from "shared/profileTypes";
import {
	classInfo,
	classPool,
	effectiveSpecial,
	effectiveWeapon,
	generalName,
	isEquippableSpecial,
	isEquippableWeapon,
	isGeneralId,
	LORD_CLASSES,
	lordStatsFor,
	specialItemName,
	weaponItemName,
	weaponTypeOf,
	type WeaponType,
} from "shared/loadout";
import {
	clearedKey,
	getStages,
	isUnlocked,
	LAST_STAGE_ID,
	nameOf,
	RECRUIT_LINES,
	STARTERS,
	TUTORIAL_STAGE_ID,
	type StageDef,
} from "shared/story";
import { lineupFor, type LineupSlot } from "shared/teamBuilder";
import { setBgm } from "./bgm";
import { ART, ART4, portraitFor, skillIconFor, SKILL_ICON, WEAPON_ICON } from "./artIds";
import { artButton, artCard, CARD_ASPECT, picture, type ArtSkin } from "./artUi";
import { BLACK, button, COUNTRY_BANNER, COUNTRY_COLOR, COUNTRY_NAME, frame, GOLD, GREY, text, WHITE } from "./hud";

const Players = game.GetService("Players");
const TweenService = game.GetService("TweenService");
const Workspace = game.GetService("Workspace");
const GuiService = game.GetService("GuiService");

const BG = Color3.fromRGB(18, 20, 34);
const PANEL = Color3.fromRGB(34, 38, 62);
const GREEN = Color3.fromRGB(0x3a, 0x8a, 0x4a);
const YELLOW = Color3.fromRGB(190, 140, 30);
/** Text colours on the parchment dialogue box. */
const INK = Color3.fromRGB(60, 40, 22);
const DIALOG_NAME = Color3.fromRGB(150, 40, 24);
const LORD_MAX_LEVEL = 30;
/** Chapter map art size (1920×1080); the stop fractions below are of this box. */
const MAP_W = 1920;
const MAP_H = 1080;
/** Stage node width as a fraction of the map box width (the node is square on screen). */
const NODE_W = 0.075;
/** Stage label column, in node units (the node is 144 px wide on the 1920×1080 map, so 200 px = 200 / 144). */
const LABEL_W = 1.39;
/** Row pitch, chip height, top pad and node-to-label gap of the label column (node units). */
const LABEL_ROW = 0.236;
const LABEL_CHIP = 0.194;
const LABEL_PAD = 0.035;
const LABEL_GAP = 0.097;
/** Map and camp header buttons: height in px (phones need at least 60 px), and the gap below the Roblox top bar. */
const HEADER_H = 64;
const HEADER_PAD = 10;
const TOAST_SECONDS = 2.5;
const STARTER_TIMEOUT_SECONDS = 5;
const NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八"];
const ROLE_NAME: Record<string, string> = { GK: "守門", DF: "後衛", MF: "中場", FW: "前鋒" };
const COUNTRIES: Country[] = ["wei", "shu", "wu"];
const FLAVOUR: Record<Country, string> = {
	wei: "挾天子以令諸侯，兵多將廣",
	shu: "仁義之師，義薄雲天",
	wu: "江東子弟，勇猛善戰",
};
const INTRO_LINES: string[] = ["天下大亂，群雄並起……", "主公，是時候建立你的霸業了！"];
const STAT_ROWS: { label: string; key: keyof Stats }[] = [
	{ label: "力量", key: "power" },
	{ label: "速度", key: "speed" },
	{ label: "體力", key: "stamina" },
	{ label: "技巧", key: "technique" },
	{ label: "守備", key: "defense" },
];
/** Lord class colours (the card frame tint). */
const CLASS_COLOR: Record<LordClass, Color3> = {
	mengjiang: Color3.fromRGB(150, 58, 46),
	junshi: Color3.fromRGB(52, 120, 92),
	tiebi: Color3.fromRGB(60, 90, 150),
};
const WEAPON_TYPE_NAME: Record<WeaponType, string> = { sword: "劍類", polearm: "長兵", fan: "扇類", heavy: "重兵" };
/** Batch 4 lord art by class: the class card (512×768), the badge (emblem) and the passive icon. */
const CLASS_ART: Record<LordClass, string> = {
	mengjiang: ART4.class_mengjiang,
	junshi: ART4.class_junshi,
	tiebi: ART4.class_tiebi,
};
const CLASS_EMBLEM: Record<LordClass, string> = {
	mengjiang: ART4.emblem_mengjiang,
	junshi: ART4.emblem_junshi,
	tiebi: ART4.emblem_tiebi,
};
const CLASS_PASSIVE_ICON: Record<LordClass, string> = {
	mengjiang: ART4.passive_pozhen,
	junshi: ART4.passive_yunchou,
	tiebi: ART4.passive_gushou,
};
const WEAPON_TYPE_ICON: Record<WeaponType, string> = {
	sword: ART4.weapon_type_sword,
	polearm: ART4.weapon_type_polearm,
	fan: ART4.weapon_type_fan,
	heavy: ART4.weapon_type_heavy,
};
const LOCKED_TEXT = Color3.fromRGB(150, 150, 156);
const LOCKED_BG = Color3.fromRGB(60, 60, 66);
/** The camp slot whose option grid is open: the class, the weapon or the special. */
type CampSlot = "class" | "weapon" | "special";
/** One pickable (or locked) entry of a camp option grid. locked = why it cannot be picked (undefined = pickable). */
interface CampOption {
	id: string;
	name: string;
	detail: string;
	icon: string | undefined;
	selected: boolean;
	locked: string | undefined;
}
/** Stage node stops on the chapter map, index = stage id (0 = tutorial). Fractions from bg_map_ch1_nodes.json; side = where the
 *  label panel sits (R right, L left, U above, D below). */
interface MapStop {
	u: number;
	v: number;
	side: "R" | "L" | "U" | "D";
}
const MAP_STOPS: MapStop[] = [
	{ u: 0.112405, v: 0.688865, side: "D" },
	{ u: 0.189866, v: 0.477074, side: "L" },
	{ u: 0.278975, v: 0.31441, side: "U" },
	{ u: 0.370996, v: 0.472707, side: "D" },
	{ u: 0.47583, v: 0.631004, side: "D" },
	{ u: 0.580664, v: 0.485808, side: "U" },
	{ u: 0.676762, v: 0.327511, side: "U" },
	{ u: 0.782178, v: 0.491266, side: "D" },
	{ u: 0.861969, v: 0.283843, side: "U" },
];

/** Hooks into hud.ts: the quick-match country select and the match reset. */
export interface MatchHooks {
	showCountrySelect(): void;
	clearMatchUi(): void;
}

function bigButton(parent: Instance, content: string, size: UDim2, pos: UDim2, color: Color3): TextButton {
	const b = button(parent, content, size, pos, color);
	const min = new Instance("UISizeConstraint");
	min.MinSize = new Vector2(60, 60);
	min.Parent = b;
	return b;
}

/** Art button (btn_red / btn_blue / btn_gold) with the label on top, same minimum size as bigButton. */
function bigArt(parent: Instance, skin: ArtSkin, content: string, size: UDim2, pos: UDim2): ImageButton {
	const b = artButton(parent, skin, size, pos);
	text(b, content, UDim2.fromScale(0.8, 0.5), UDim2.fromScale(0.1, 0.25));
	const min = new Instance("UISizeConstraint");
	min.MinSize = new Vector2(60, 60);
	min.Parent = b;
	return b;
}

function rounded(gui: GuiObject, radius: number): void {
	const c = new Instance("UICorner");
	c.CornerRadius = new UDim(radius, 0);
	c.Parent = gui;
}

/** Icon + number group in the result reward row: children laid out left to right, centred. */
function groupLayout(parent: Instance): void {
	const list = new Instance("UIListLayout");
	list.FillDirection = Enum.FillDirection.Horizontal;
	list.HorizontalAlignment = Enum.HorizontalAlignment.Center;
	list.VerticalAlignment = Enum.VerticalAlignment.Center;
	list.Padding = new UDim(0, 6);
	list.Parent = parent;
}

/** Invisible full-screen button: taps anywhere call onTap. Add it first so other controls draw above it. */
function tapLayer(parent: Instance, onTap: () => void): void {
	const b = new Instance("TextButton");
	b.Size = UDim2.fromScale(1, 1);
	b.BackgroundTransparency = 1;
	b.Text = "";
	b.Parent = parent;
	b.Activated.Connect(onTap);
}

/** Small rounded label chip (role, team size, status). */
function tag(parent: Instance, content: string, size: UDim2, pos: UDim2, color: Color3): void {
	const f = frame(parent, size, pos, color, 0.1);
	rounded(f, 0.3);
	text(f, content, UDim2.fromScale(0.9, 0.7), UDim2.fromScale(0.05, 0.15));
}

/** Bottom colour of the xp fill gradient (the top colour is the tint, the bottom is halfway to this orange). */
const BAR_ORANGE = Color3.fromRGB(240, 130, 20);

/**
 * XP bar at the bar_frame's 8:1 ratio, with no background. The fill sits inside the frame's inner groove (the channel
 * between the two rails, measured from bar_frame.png 512×64: rows 29–35, columns about 10%–90%); the groove is a dark
 * translucent slot so empty progress reads as a slot. bar_frame is drawn on top. fill is the box to resize (width =
 * share of the groove); tint recolours the gold→orange gradient.
 */
interface XpBar {
	fill: Frame;
	tint(color: Color3): void;
}
function xpBar(parent: Instance, size: UDim2, pos: UDim2): XpBar {
	const track = frame(parent, size, pos, WHITE, 1);
	const ratio = new Instance("UIAspectRatioConstraint");
	ratio.AspectRatio = 8;
	ratio.DominantAxis = Enum.DominantAxis.Width;
	ratio.Parent = track;
	const groove = frame(track, UDim2.fromScale(0.8, 0.1094), UDim2.fromScale(0.1, 0.4531), BLACK, 0.45);
	groove.ClipsDescendants = true;
	rounded(groove, 0.5);
	const fill = frame(groove, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), WHITE, 0);
	rounded(fill, 0.5);
	const gradient = new Instance("UIGradient");
	gradient.Rotation = 90;
	gradient.Parent = fill;
	const paint = (top: Color3): void => {
		gradient.Color = new ColorSequence(top, top.Lerp(BAR_ORANGE, 0.5));
	};
	paint(GOLD);
	const frameArt = picture(track, ART.bar_frame, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0));
	frameArt.ZIndex = 2;
	return {
		fill,
		tint(color: Color3): void {
			paint(color);
		},
	};
}

/** Breathing size for the current stage node. Stops when the scale is destroyed. */
function breathe(scale: UIScale): void {
	task.spawn(() => {
		while (scale.Parent !== undefined) {
			TweenService.Create(
				scale,
				new TweenInfo(0.7, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, 0, true),
				{ Scale: 1.08 },
			).Play();
			task.wait(1.4);
		}
	});
}

function needFor(level: number): number {
	return 100 * level;
}

/** Share of the level bar filled by carry-over xp (full at the level cap). */
function xpFraction(level: number, xp: number): number {
	if (level >= LORD_MAX_LEVEL) return 1;
	return math.clamp(xp / needFor(level), 0, 1);
}

/** Carry-over xp shown at a level: always 0..need of that level (never negative, never above the bar). */
function carriedXp(level: number, xp: number): number {
	return math.clamp(xp, 0, needFor(level));
}

/** Result / header caption under the xp bar: level and xp into the level, e.g. "Lv 2 → 經驗 30/200". */
function barCaption(level: number, xp: number): string {
	return level >= LORD_MAX_LEVEL ? `Lv ${level} → 已滿級` : `Lv ${level} → 經驗 ${carriedXp(level, xp)}/${needFor(level)}`;
}

/**
 * Carry-over xp at the level the lord ends a stage on. The profile's lordXp is the server's value once it is for that level
 * (ProfileChanged arrives before StoryResult); otherwise the total is worked out from the start xp and the result's xp.
 */
function carryAfter(r: StoryResult, startXp: number, p: Profile | undefined): number {
	if (p !== undefined && p.lordLevel === r.levelAfter) return carriedXp(r.levelAfter, p.lordXp);
	let rest = startXp + r.xp;
	let lv = r.levelBefore;
	while (lv < r.levelAfter && rest >= needFor(lv)) {
		rest -= needFor(lv);
		lv++;
	}
	return carriedXp(lv, rest);
}

/** Lord title with the class, e.g. "主公 Lv 3・猛將" (no class part until one is chosen). */
function lordTitle(p: Profile): string {
	const cls = p.lordClass;
	return cls === undefined ? `主公 Lv ${p.lordLevel}` : `主公 Lv ${p.lordLevel}・${classInfo(cls).name}`;
}

/** Icon of a weapon item (WEAPON_ICON by item id: the general's weapon, or the lord weapon). */
function weaponArt(id: string): string | undefined {
	return WEAPON_ICON[id];
}

/**
 * Item slot: the item icon inside the gold slot_frame (256, transparent centre). The box is square (height from size.Y) and
 * the frame draws over the icon. dim sets the icon's transparency (locked options).
 */
function slotIcon(parent: Instance, icon: string | undefined, size: UDim2, pos: UDim2, dim = 0): Frame {
	const box = frame(parent, size, pos, BLACK, 1);
	const ratio = new Instance("UIAspectRatioConstraint");
	ratio.AspectRatio = 1;
	ratio.DominantAxis = Enum.DominantAxis.Height;
	ratio.Parent = box;
	if (icon !== undefined) {
		const img = picture(box, icon, UDim2.fromScale(0.72, 0.72), UDim2.fromScale(0.14, 0.14));
		img.ImageTransparency = dim;
	}
	picture(box, ART4.slot_frame, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0));
	return box;
}

/** Skill icon of a special item: the lord specials use the icon of their weapon. */
function specialIcon(id: string): string | undefined {
	if (id === "whirl") return SKILL_ICON.lord_sword;
	if (id === "dragonspear") return SKILL_ICON.lord_spear;
	if (id === "featherfan") return SKILL_ICON.lord_fan;
	return SKILL_ICON[id];
}

/** Top edge in px of the map and camp headers: below the Roblox top bar (IgnoreGuiInset ignores it), plus a margin. */
function headerTopPx(): number {
	const [topLeft] = GuiService.GetGuiInset();
	return topLeft.Y + HEADER_PAD;
}

/** Card row: the cards sit side by side and centred, with a gap of 3% of the row width. Each card's LayoutOrder is its index. */
function cardRow(area: Frame): void {
	const list = new Instance("UIListLayout");
	list.FillDirection = Enum.FillDirection.Horizontal;
	list.HorizontalAlignment = Enum.HorizontalAlignment.Center;
	list.VerticalAlignment = Enum.VerticalAlignment.Center;
	list.Padding = new UDim(0.03, 0);
	list.SortOrder = Enum.SortOrder.LayoutOrder;
	list.Parent = area;
}

/** Removes the cards of a row; the row's UIListLayout stays. */
function clearCards(area: Frame): void {
	for (const child of area.GetChildren()) {
		if (child.IsA("GuiObject")) child.Destroy();
	}
}

/** Draws a card's children above its colour window (CardColor, ZIndex 1). */
function liftCard(card: GuiObject): void {
	for (const child of card.GetChildren()) {
		if (child.IsA("GuiObject") && child.Name !== "CardColor" && child.Name !== "CardFrame") child.ZIndex = 3;
	}
}

/** Caps a TextScaled label at max px, so short text does not grow past the design size. */
function capText(label: TextLabel, max: number): void {
	const c = new Instance("UITextSizeConstraint");
	c.MaxTextSize = max;
	c.Parent = label;
}

/** Short label of a stat key (力量 …). */
function statLabel(key: keyof Stats): string {
	for (const row of STAT_ROWS) {
		if (row.key === key) return row.label;
	}
	return "";
}

/** Options of a camp slot: the classes; the lord weapons plus owned general weapons; the special pool of the class. */
function campOptions(p: Profile, cls: LordClass, slot: CampSlot): CampOption[] {
	const out: CampOption[] = [];
	if (slot === "class") {
		for (const c of LORD_CLASSES) {
			const info = classInfo(c);
			out.push({
				id: c,
				name: info.name,
				detail: `${info.position}・${info.passive}`,
				icon: CLASS_EMBLEM[c],
				selected: c === cls,
				locked: undefined,
			});
		}
		return out;
	}
	if (slot === "weapon") {
		const ids: string[] = ["lord_sword", "lord_spear", "lord_fan"];
		for (const id of p.owned.weapons) {
			if (!ids.includes(id)) ids.push(id);
		}
		for (const id of ids) {
			const owned = p.owned.weapons.includes(id);
			const wt = weaponTypeOf(id);
			const locked = !owned ? "尚未取得" : !isEquippableWeapon(id) ? "即將開放" : undefined;
			out.push({
				id,
				name: weaponItemName(id),
				detail: wt === undefined ? "" : WEAPON_TYPE_NAME[wt],
				icon: weaponArt(id),
				selected: effectiveWeapon(cls, p.loadout.weapon) === id,
				locked,
			});
		}
		return out;
	}
	for (const id of classPool(cls)) {
		const owned = p.owned.specials.includes(id);
		const locked = !owned ? (isGeneralId(id) ? `打敗 ${generalName(id)} 取得` : "尚未取得") : !isEquippableSpecial(id) ? "即將開放" : undefined;
		out.push({
			id,
			name: specialItemName(id),
			detail: "可裝備",
			icon: specialIcon(id),
			selected: effectiveSpecial(cls, p.loadout.special) === id,
			locked,
		});
	}
	return out;
}

function charDef(id: string): CharacterDef | undefined {
	return RAW_CHARACTERS.find((d) => d.id === id);
}

/**
 * Option grid of a camp slot, shared by the camp page and the pre-match loadout: one button per option (locked ones dimmed,
 * the current one outlined), the slot title and a back button. onPick gets the picked option; onBack leaves the grid.
 */
function optionGrid(
	parent: Frame,
	p: Profile,
	cls: LordClass,
	slot: CampSlot,
	backLabel: string,
	onPick: (o: CampOption) => void,
	onBack: () => void,
): void {
	const title = slot === "class" ? "選擇流派" : slot === "weapon" ? "選擇武器" : "選擇大招";
	text(parent, title, UDim2.fromScale(0.5, 0.06), UDim2.fromScale(0.4, 0.15));
	campOptions(p, cls, slot).forEach((o, i) => {
		const col = i % 3;
		const rowIdx = math.floor(i / 3);
		const opt = bigButton(parent, "", UDim2.fromScale(0.185, 0.2), UDim2.fromScale(0.4 + col * 0.197, 0.23 + rowIdx * 0.22), o.locked === undefined ? PANEL : LOCKED_BG);
		if (o.selected) {
			const stroke = new Instance("UIStroke");
			stroke.Color = GOLD;
			stroke.Thickness = 4;
			stroke.Parent = opt;
		}
		slotIcon(opt, o.icon, UDim2.fromScale(0.28, 0.8), UDim2.fromScale(0.03, 0.1), o.locked !== undefined ? 0.6 : 0);
		// Weapon tiles: the weapon type's badge in the icon's bottom-left corner.
		const wt = slot === "weapon" ? weaponTypeOf(o.id) : undefined;
		if (wt !== undefined) picture(opt, WEAPON_TYPE_ICON[wt], UDim2.fromScale(0.13, 0.3), UDim2.fromScale(0, 0.7));
		const nameLabel = text(opt, o.name, UDim2.fromScale(0.64, 0.42), UDim2.fromScale(0.34, 0.08));
		nameLabel.TextXAlignment = Enum.TextXAlignment.Left;
		nameLabel.TextColor3 = o.locked === undefined ? WHITE : LOCKED_TEXT;
		const sub = o.locked !== undefined ? o.locked : o.selected ? "裝備中" : o.detail;
		const subLabel = text(opt, sub, UDim2.fromScale(0.64, 0.3), UDim2.fromScale(0.34, 0.56));
		subLabel.TextXAlignment = Enum.TextXAlignment.Left;
		subLabel.TextColor3 = o.locked !== undefined ? LOCKED_TEXT : o.selected ? GOLD : WHITE;
		opt.Activated.Connect(() => onPick(o));
	});
	const backBtn = bigButton(parent, backLabel, UDim2.fromScale(0.2, 0.08), UDim2.fromScale(0.4, 0.9), GREY);
	backBtn.Activated.Connect(() => onBack());
}

/** The generals the lord owns: the starter first, then the recruits in recruit order. */
function ownedGenerals(p: Profile): string[] {
	const out: string[] = [];
	if (p.starter !== undefined) out.push(p.starter);
	for (const id of p.recruited) {
		if (!out.includes(id)) out.push(id);
	}
	return out;
}

/**
 * 麾下武將: a horizontal scroller of the owned generals (starter first, then recruits, no repeats). The scroller is a fixed
 * band of the camp layout; each card is as tall as the scroller, a square portrait with the name below it, and the card
 * width follows from its height (UIAspectRatioConstraint), so the row fits any screen height.
 */
function rosterRow(parent: Frame, p: Profile, size: UDim2, pos: UDim2): void {
	const row = new Instance("ScrollingFrame");
	row.Size = size;
	row.Position = pos;
	row.BackgroundTransparency = 1;
	row.BorderSizePixel = 0;
	row.ScrollBarThickness = 6;
	row.ScrollingDirection = Enum.ScrollingDirection.X;
	row.AutomaticCanvasSize = Enum.AutomaticSize.X;
	row.CanvasSize = UDim2.fromScale(0, 1);
	row.Parent = parent;
	const list = new Instance("UIListLayout");
	list.FillDirection = Enum.FillDirection.Horizontal;
	list.VerticalAlignment = Enum.VerticalAlignment.Center;
	list.Padding = new UDim(0, 8);
	list.Parent = row;
	ownedGenerals(p).forEach((id, i) => {
		const card = frame(row, UDim2.fromScale(0, 0.94), UDim2.fromScale(0, 0), PANEL, 0.1);
		card.LayoutOrder = i;
		rounded(card, 0.08);
		const cardRatio = new Instance("UIAspectRatioConstraint");
		cardRatio.AspectRatio = 0.8;
		cardRatio.DominantAxis = Enum.DominantAxis.Height;
		cardRatio.Parent = card;
		const portrait = portraitFor(id);
		if (portrait !== undefined) {
			const face = picture(card, portrait, UDim2.fromScale(0.7, 0.7), UDim2.fromScale(0.5, 0.05));
			face.AnchorPoint = new Vector2(0.5, 0);
			const faceRatio = new Instance("UIAspectRatioConstraint");
			faceRatio.AspectRatio = 1;
			faceRatio.DominantAxis = Enum.DominantAxis.Height;
			faceRatio.Parent = face;
		}
		text(card, nameOf(id), UDim2.fromScale(0.92, 0.2), UDim2.fromScale(0.04, 0.77));
	});
}

/** One line of a scripted scene on the dialog box. portrait is the speaker's art (undefined = no portrait). */
interface SceneLine {
	speaker: string;
	portrait: string | undefined;
	text: string;
}

/** Post-victory recruit scene: the general's own lines (RECRUIT_LINES, else the stage's recruitLine), then the lord's answer. */
function recruitScene(charId: string, stage: StageDef | undefined): SceneLine[] {
	const name = nameOf(charId);
	const art = portraitFor(charId);
	const given: string[] | undefined = RECRUIT_LINES[charId];
	const fallback = stage === undefined || stage.recruitLine === undefined ? `${name}願隨主公征戰！` : stage.recruitLine;
	const lines: SceneLine[] = [];
	for (const line of given === undefined ? [fallback] : given) {
		lines.push({ speaker: name, portrait: art, text: line });
	}
	lines.push({ speaker: "主公", portrait: portraitFor("lord_sword"), text: `歡迎加入，${name}！有你相助，天下大有可為！` });
	return lines;
}

/** Sparkle stars around the centre of a banner: each twinkles and turns, staggered, until its screen is cleared. */
function sparkle(parent: Instance, count: number): void {
	for (let i = 0; i < count; i++) {
		const a = (i / count) * math.pi * 2;
		const star = text(parent, "★", UDim2.fromScale(0.07, 0.1), UDim2.fromScale(0.5 + 0.42 * math.cos(a), 0.45 + 0.36 * math.sin(a)), new Vector2(0.5, 0.5));
		star.TextColor3 = GOLD;
		task.spawn(() => {
			task.wait(i * 0.15);
			if (star.Parent === undefined) return;
			TweenService.Create(
				star,
				new TweenInfo(0.6, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
				{ TextTransparency: 0.85, Rotation: 90 },
			).Play();
		});
	}
}

export function createStoryUi(remotes: Remotes, hud: MatchHooks): { showMainMenu: () => void } {
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "StoryGui";
	gui.IgnoreGuiInset = true;
	// Keep the screens clear of the iPhone notch and home indicator (the top bar is handled by headerTopPx).
	gui.ScreenInsets = Enum.ScreenInsets.DeviceSafeInsets;
	gui.ResetOnSpawn = false;
	gui.DisplayOrder = 20;
	gui.Parent = playerGui;

	const profileRemotes = getProfileRemotes();
	let profile: Profile | undefined;
	let pickedCountry: Country | undefined;
	let selectedStarter: string | undefined;
	let pendingStarter = false;
	let starterAttempt = 0;
	let introIndex = 0;
	let dialogueStage: StageDef | undefined;
	let dialogueIndex = 0;
	let matchLevel = 1;
	let matchXp = 0;
	let resultToken = 0;
	let resultStageId = 1;
	let toastToken = 0;
	let barTween: Tween | undefined;
	let selectedClass: LordClass | undefined;
	let classChoice: LordClass | undefined;
	let pendingClass = false;
	let classAttempt = 0;
	let campSlot: CampSlot | undefined;
	/** Scripted scene on the dialog box (the recruit scene): its lines, the current one, and what runs when it ends. */
	let scene: SceneLine[] | undefined;
	let sceneIndex = 0;
	let sceneDone: (() => void) | undefined;
	/** Pre-match loadout: the stage being prepared and the option grid open on it (weapon / special). */
	let loadoutStage: StageDef | undefined;
	let loadoutSlot: CampSlot | undefined;

	const screens: Frame[] = [];
	const screen = (transparency: number, color: Color3): Frame => {
		const f = frame(gui, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), color, transparency);
		f.Visible = false;
		screens.push(f);
		return f;
	};
	const show = (target: Frame | undefined): void => {
		for (const s of screens) s.Visible = s === target;
	};

	// ---------- main menu ----------
	const menuScreen = screen(0.05, BG);
	picture(menuScreen, ART.bg_menu, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), Enum.ScaleType.Crop);
	picture(menuScreen, ART.logo, UDim2.fromScale(0.6, 0.26), UDim2.fromScale(0.2, 0.02));
	text(menuScreen, "主公征戰，三國英雄齊聚足球場", UDim2.fromScale(0.6, 0.07), UDim2.fromScale(0.2, 0.28));
	const storyBtn = bigArt(menuScreen, "red", "主公征戰", UDim2.fromScale(0.36, 0.26), UDim2.fromScale(0.1, 0.42));
	const quickBtn = bigArt(menuScreen, "blue", "快速比賽", UDim2.fromScale(0.36, 0.26), UDim2.fromScale(0.54, 0.42));
	// Lord corner: level badge and title, coin icon and count.
	picture(menuScreen, ART.icon_level, UDim2.fromScale(0.045, 0.08), UDim2.fromScale(0.6, 0.02));
	const lordLabel = text(menuScreen, "", UDim2.fromScale(0.2, 0.08), UDim2.fromScale(0.655, 0.02));
	picture(menuScreen, ART.icon_coin, UDim2.fromScale(0.045, 0.08), UDim2.fromScale(0.86, 0.02));
	const menuCoin = text(menuScreen, "", UDim2.fromScale(0.08, 0.08), UDim2.fromScale(0.91, 0.02));

	// ---------- first-time intro ----------
	const introScreen = screen(0.05, BG);
	picture(introScreen, ART.bg_intro, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), Enum.ScaleType.Crop);
	tapLayer(introScreen, () => {
		introIndex++;
		if (introIndex >= INTRO_LINES.size()) {
			showCountry();
			return;
		}
		introLabel.Text = INTRO_LINES[introIndex];
	});
	const introLabel = text(introScreen, "", UDim2.fromScale(0.8, 0.3), UDim2.fromScale(0.1, 0.3));
	text(introScreen, "點一下繼續", UDim2.fromScale(0.3, 0.07), UDim2.fromScale(0.35, 0.8));

	// ---------- first-time country pick ----------
	const countryScreen = screen(0.05, BG);
	text(countryScreen, "選擇你的國家", UDim2.fromScale(0.8, 0.12), UDim2.fromScale(0.1, 0.03));
	COUNTRIES.forEach((c, i) => {
		// Banner card (1:2), centred in its slot; the country name and flavour sit in the banner's empty middle.
		const b = artCard(countryScreen, COUNTRY_BANNER[c], 0.5, UDim2.fromScale(0.28, 0.6), UDim2.fromScale(0.05 + i * 0.317 + 0.14, 0.18));
		b.AnchorPoint = new Vector2(0.5, 0);
		text(b, `${COUNTRY_NAME[c]}國`, UDim2.fromScale(0.7, 0.12), UDim2.fromScale(0.15, 0.36));
		text(b, FLAVOUR[c], UDim2.fromScale(0.7, 0.2), UDim2.fromScale(0.15, 0.5));
		b.Activated.Connect(() => {
			pickedCountry = c;
			showClass();
		});
	});
	const countryBack = bigButton(countryScreen, "返回", UDim2.fromScale(0.18, 0.1), UDim2.fromScale(0.02, 0.86), GREY);
	countryBack.Activated.Connect(() => showMainMenu());

	// ---------- first-time starter pick ----------
	const starterScreen = screen(0.05, BG);
	text(starterScreen, "選一位你的第一員大將", UDim2.fromScale(0.6, 0.08), UDim2.fromScale(0.02, 0.02));
	const starterStatus = text(starterScreen, "", UDim2.fromScale(0.36, 0.08), UDim2.fromScale(0.62, 0.02));
	const cardArea = frame(starterScreen, UDim2.fromScale(1, 0.7), UDim2.fromScale(0, 0.13), BG, 1);
	cardRow(cardArea);
	const starterBack = bigButton(starterScreen, "返回", UDim2.fromScale(0.18, 0.1), UDim2.fromScale(0.02, 0.86), GREY);
	starterBack.Activated.Connect(() => showClass());
	const confirmBtn = bigButton(starterScreen, "就決定是你了！", UDim2.fromScale(0.42, 0.1), UDim2.fromScale(0.55, 0.86), GREEN);
	confirmBtn.Activated.Connect(() => confirmStarter());

	// ---------- first-time lord class pick (after the country, before the starter) ----------
	const classScreen = screen(0.05, BG);
	text(classScreen, "選擇你的流派", UDim2.fromScale(0.6, 0.08), UDim2.fromScale(0.02, 0.02));
	const classStatus = text(classScreen, "", UDim2.fromScale(0.36, 0.08), UDim2.fromScale(0.62, 0.02));
	const classCardArea = frame(classScreen, UDim2.fromScale(1, 0.6), UDim2.fromScale(0, 0.13), BG, 1);
	cardRow(classCardArea);
	// Detail strip between the class cards and the buttons: growth, preferred weapon type, starter weapon and special.
	const classDetail = frame(classScreen, UDim2.fromScale(0.96, 0.09), UDim2.fromScale(0.02, 0.75), PANEL, 0.05);
	rounded(classDetail, 0.2);
	const classBack = bigButton(classScreen, "返回", UDim2.fromScale(0.18, 0.1), UDim2.fromScale(0.02, 0.86), GREY);
	classBack.Activated.Connect(() => showCountry());
	const classConfirm = bigButton(classScreen, "就是這個流派！", UDim2.fromScale(0.42, 0.1), UDim2.fromScale(0.55, 0.86), GREEN);
	classConfirm.Activated.Connect(() => confirmClass());

	// ---------- lord camp (from the stage map header; rebuilt on every profile change) ----------
	const campScreen = screen(0.05, BG);

	// ---------- stage map (rebuilt on every show) ----------
	const mapScreen = screen(0.08, BG);

	// ---------- pre-match loadout (after the dialogue, before the stage starts; the tutorial skips it; rebuilt on every change) ----------
	const loadoutScreen = screen(0.05, BG);

	// ---------- pre-match dialogue ----------
	const dialogueScreen = screen(0.15, BG);
	tapLayer(dialogueScreen, () => advanceDialogue());
	const dialogueTitle = text(dialogueScreen, "", UDim2.fromScale(0.6, 0.1), UDim2.fromScale(0.2, 0.04));
	const skipBtn = bigButton(dialogueScreen, "跳過", UDim2.fromScale(0.16, 0.1), UDim2.fromScale(0.82, 0.03), GREY);
	skipBtn.Activated.Connect(() => {
		if (scene !== undefined) endScene();
		else afterPreMatchDialogue();
	});
	// Dialog box art (1024×256 scroll, 4:1): the speaker's portrait goes in its round left slot, name and lines on the parchment.
	const speakerBox = picture(dialogueScreen, ART.dialog_box, UDim2.fromScale(0.92, 0.34), UDim2.fromScale(0.5, 0.56));
	speakerBox.AnchorPoint = new Vector2(0.5, 0);
	const boxRatio = new Instance("UIAspectRatioConstraint");
	boxRatio.AspectRatio = 4;
	boxRatio.DominantAxis = Enum.DominantAxis.Height;
	boxRatio.Parent = speakerBox;
	// Round portrait slot: measured from the art's transparent oval (x 0.093–0.292, y 0.184–0.785 of the box), so the slot is
	// a circle as tall as the oval, centred on it. ClipsDescendants + UICorner(1) crop the portrait to that circle.
	// The slot fills the whole oval hole (0.199 × 0.601 of the 4:1 box ≈ 1.32:1) on a parchment backing, so no dark edges show.
	const speakerSlot = frame(speakerBox, UDim2.fromScale(0.199, 0.601), UDim2.fromScale(0.192, 0.484), Color3.fromRGB(240, 222, 180), 0);
	speakerSlot.AnchorPoint = new Vector2(0.5, 0.5);
	speakerSlot.ClipsDescendants = true;
	const slotRatio = new Instance("UIAspectRatioConstraint");
	slotRatio.AspectRatio = 1.32;
	slotRatio.DominantAxis = Enum.DominantAxis.Height;
	slotRatio.Parent = speakerSlot;
	rounded(speakerSlot, 1);
	// Bust portrait (512×512, head in the upper half): zoomed 1.25×, with the face (about y 0.3 of the image) centred in the slot.
	const speakerPortrait = picture(speakerSlot, "", UDim2.fromScale(1.25, 1.25), UDim2.fromScale(0.5, 0.75), Enum.ScaleType.Crop);
	speakerPortrait.AnchorPoint = new Vector2(0.5, 0.5);
	// Text sits on the parchment only: fractions of the art (interior measured at x 0.34–0.86, y 0.33–0.68; the scroll's top and
	// bottom edges fall outside that). Padding and TextScaled keep the glyphs inside the scroll.
	const speakerLabel = text(speakerBox, "", UDim2.fromScale(0.52, 0.14), UDim2.fromScale(0.34, 0.33));
	speakerLabel.TextColor3 = DIALOG_NAME;
	speakerLabel.TextStrokeTransparency = 1;
	speakerLabel.TextXAlignment = Enum.TextXAlignment.Left;
	const lineLabel = text(speakerBox, "", UDim2.fromScale(0.52, 0.2), UDim2.fromScale(0.34, 0.48));
	lineLabel.TextColor3 = INK;
	lineLabel.TextStrokeTransparency = 1;
	lineLabel.TextXAlignment = Enum.TextXAlignment.Left;
	lineLabel.TextYAlignment = Enum.TextYAlignment.Top;
	lineLabel.TextWrapped = true;
	for (const label of [speakerLabel, lineLabel]) {
		const pad = new Instance("UIPadding");
		pad.PaddingLeft = new UDim(0, 8);
		pad.PaddingRight = new UDim(0, 12);
		pad.PaddingTop = new UDim(0, 4);
		pad.PaddingBottom = new UDim(0, 4);
		pad.Parent = label;
		const cap = new Instance("UITextSizeConstraint");
		cap.MaxTextSize = label === lineLabel ? 30 : 26;
		cap.Parent = label;
	}
	// 點一下繼續: a dark pill under the scroll's bottom-right corner (outside the art), white text and a pulsing ▼.
	const hintPill = frame(speakerBox, UDim2.fromScale(0.2, 0.13), UDim2.fromScale(0.96, 1.05), BLACK, 0.25);
	hintPill.AnchorPoint = new Vector2(1, 0);
	rounded(hintPill, 0.5);
	text(hintPill, "點一下繼續", UDim2.fromScale(0.7, 0.76), UDim2.fromScale(0.05, 0.12));
	const hintArrow = text(hintPill, "▼", UDim2.fromScale(0.15, 0.76), UDim2.fromScale(0.8, 0.12));
	TweenService.Create(
		hintArrow,
		new TweenInfo(0.5, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
		{ TextTransparency: 0.7 },
	).Play();

	// ---------- result (overlay over the finished match) ----------
	const resultScreen = screen(0.3, BLACK);
	const panel = frame(resultScreen, UDim2.fromScale(0.62, 0.9), UDim2.fromScale(0.5, 0.5), PANEL, 0.05);
	panel.AnchorPoint = new Vector2(0.5, 0.5);
	rounded(panel, 0.04);
	// Headline art: the chapter-clear title on a chapter clear, else the victory / defeat title (set in showResult).
	const chapterPic = picture(panel, ART.title_chapter_clear, UDim2.fromScale(0.8, 0.22), UDim2.fromScale(0.1, 0.02));
	chapterPic.Visible = false;
	const resultPic = picture(panel, ART.title_victory, UDim2.fromScale(0.8, 0.22), UDim2.fromScale(0.1, 0.02));
	// Reward row: [icon] 經驗 +N … [icon] 銅錢 +N, centred, each icon right beside its number.
	const rewardRow = frame(panel, UDim2.fromScale(0.9, 0.08), UDim2.fromScale(0.05, 0.255), BLACK, 1);
	const rewardList = new Instance("UIListLayout");
	rewardList.FillDirection = Enum.FillDirection.Horizontal;
	rewardList.HorizontalAlignment = Enum.HorizontalAlignment.Center;
	rewardList.VerticalAlignment = Enum.VerticalAlignment.Center;
	rewardList.Padding = new UDim(0, 8);
	rewardList.Parent = rewardRow;
	const xpGroup = frame(rewardRow, UDim2.fromScale(0.4, 1), UDim2.fromScale(0, 0), BLACK, 1);
	xpGroup.LayoutOrder = 1;
	groupLayout(xpGroup);
	const xpIcon = picture(xpGroup, ART.icon_xp, UDim2.fromScale(0.2, 0.9), UDim2.fromScale(0, 0));
	xpIcon.LayoutOrder = 1;
	const xpLabel = text(xpGroup, "經驗 +0", UDim2.fromScale(0.5, 0.9), UDim2.fromScale(0, 0));
	xpLabel.LayoutOrder = 2;
	xpLabel.TextXAlignment = Enum.TextXAlignment.Left;
	const coinGroup = frame(rewardRow, UDim2.fromScale(0.4, 1), UDim2.fromScale(0, 0), BLACK, 1);
	coinGroup.LayoutOrder = 2;
	groupLayout(coinGroup);
	const coinIcon = picture(coinGroup, ART.icon_coin, UDim2.fromScale(0.2, 0.9), UDim2.fromScale(0, 0));
	coinIcon.LayoutOrder = 1;
	const coinLabel = text(coinGroup, "銅錢 +0", UDim2.fromScale(0.5, 0.9), UDim2.fromScale(0, 0));
	coinLabel.LayoutOrder = 2;
	coinLabel.TextXAlignment = Enum.TextXAlignment.Left;
	// XP bar centred under the reward row, with its level / xp caption right under the bar's right end.
	const resultBar = xpBar(panel, UDim2.fromScale(0.6, 0.1), UDim2.fromScale(0.2, 0.345));
	const barFill = resultBar.fill;
	const barText = text(panel, "", UDim2.fromScale(0.6, 0.04), UDim2.fromScale(0.2, 0.44));
	barText.TextXAlignment = Enum.TextXAlignment.Right;
	// Level up: title art (45% of the panel width, 1024:384) with a pop-in, and a big gold "Lv N" beside it.
	const lvPic = picture(panel, ART.title_levelup, UDim2.fromScale(0.45, 0.207), UDim2.fromScale(0.325, 0.5935));
	lvPic.AnchorPoint = new Vector2(0.5, 0.5);
	lvPic.Visible = false;
	const lvPicScale = new Instance("UIScale");
	lvPicScale.Scale = 0;
	lvPicScale.Parent = lvPic;
	const lvFlash = text(panel, "", UDim2.fromScale(0.28, 0.12), UDim2.fromScale(0.58, 0.5935), new Vector2(0, 0.5));
	lvFlash.TextColor3 = GOLD;
	lvFlash.Visible = false;
	const lvFlashScale = new Instance("UIScale");
	lvFlashScale.Scale = 0;
	lvFlashScale.Parent = lvFlash;
	// Recruit: a small line under the level-up (the recruit banner itself is shown before the result, see showRecruitBanner).
	const recruitLine = text(panel, "", UDim2.fromScale(0.9, 0.035), UDim2.fromScale(0.05, 0.82));
	recruitLine.TextColor3 = GOLD;
	recruitLine.Visible = false;
	// Recruit banner: the title art with the general's portrait, the name line and sparkles. Built fresh on every recruit.
	const bannerScreen = screen(0.25, BLACK);
	const nextBtn = bigArt(panel, "blue", "下一關", UDim2.fromScale(0.28, 0.1), UDim2.fromScale(0.03, 0.86));
	const retryBtn = bigArt(panel, "gold", "再打一次", UDim2.fromScale(0.28, 0.1), UDim2.fromScale(0.36, 0.86));
	const mapBtn = bigArt(panel, "blue", "回地圖", UDim2.fromScale(0.28, 0.1), UDim2.fromScale(0.69, 0.86));
	nextBtn.Visible = false;
	retryBtn.Visible = false;
	mapBtn.Visible = false;

	// ---------- toast (built last so it draws above the screens) ----------
	const toast = text(gui, "", UDim2.fromScale(0.6, 0.06), UDim2.fromScale(0.5, 0.95), new Vector2(0.5, 0.5));
	toast.Visible = false;

	const showToast = (message: string): void => {
		toastToken++;
		const my = toastToken;
		toast.Text = message;
		toast.Visible = true;
		task.delay(TOAST_SECONDS, () => {
			if (my === toastToken) toast.Visible = false;
		});
	};

	const refreshLordLabel = (): void => {
		const p = profile;
		lordLabel.Text = p === undefined ? "" : lordTitle(p);
		menuCoin.Text = p === undefined ? "" : `${p.coins}`;
	};

	/** Fetches the profile from the server (yields). Keeps the last good copy when the call fails. */
	const refreshProfile = (): Profile | undefined => {
		const [ok, result] = pcall(() => profileRemotes.GetProfile.InvokeServer());
		if (ok) profile = result as Profile;
		refreshLordLabel();
		return profile;
	};

	const showMainMenu = (): void => {
		hud.clearMatchUi();
		show(menuScreen);
		setBgm("menu");
		refreshLordLabel();
	};

	const showCountry = (): void => {
		show(countryScreen);
		setBgm("menu");
	};

	const showIntro = (): void => {
		introIndex = 0;
		introLabel.Text = INTRO_LINES[0];
		show(introScreen);
		setBgm("menu");
	};

	const showStarter = (): void => {
		const c = pickedCountry;
		if (c === undefined) {
			showCountry();
			return;
		}
		selectedStarter = undefined;
		pendingStarter = false;
		starterStatus.Text = "";
		clearCards(cardArea);
		const strokes: [string, UIStroke][] = [];
		STARTERS[c].forEach((id, i) => {
			const def = charDef(id);
			if (def === undefined) return;
			// Rare card frame (512×768) in the country colour: portrait fills the picture window; the name plate sits under it,
			// the skill line and the stat bars (two columns) sit in the blue box.
			const card = artCard(cardArea, ART.card_frame_rare, CARD_ASPECT, UDim2.fromScale(0.3, 1), UDim2.fromScale(0, 0), COUNTRY_COLOR[c]);
			card.LayoutOrder = i;
			const stroke = new Instance("UIStroke");
			stroke.Color = GOLD;
			stroke.Thickness = 6;
			stroke.Enabled = false;
			stroke.Parent = card;
			const entry: [string, UIStroke] = [id, stroke];
			strokes.push(entry);
			const portrait = portraitFor(id);
			if (portrait !== undefined) picture(card, portrait, UDim2.fromScale(0.8, 0.46), UDim2.fromScale(0.1, 0.15));
			const plate = frame(card, UDim2.fromScale(0.79, 0.08), UDim2.fromScale(0.11, 0.565), BLACK, 0.15);
			plate.ZIndex = 4;
			const nameLabel = text(plate, def.name, UDim2.fromScale(0.6, 0.9), UDim2.fromScale(0.04, 0.05));
			nameLabel.TextColor3 = GOLD;
			nameLabel.TextXAlignment = Enum.TextXAlignment.Left;
			nameLabel.ZIndex = 5;
			tag(plate, ROLE_NAME[def.role], UDim2.fromScale(0.2, 0.6), UDim2.fromScale(0.76, 0.2), PANEL);
			const skill = skillIconFor(id);
			if (skill !== undefined) picture(card, skill, UDim2.fromScale(0.1, 0.05), UDim2.fromScale(0.1, 0.715));
			const skillLine = text(card, `必殺：${def.special.name}`, UDim2.fromScale(0.68, 0.055), UDim2.fromScale(0.22, 0.715));
			capText(skillLine, 24);
			STAT_ROWS.forEach((row, r) => {
				// Stats 1–3 in the left column, 4–5 in the right one; rows share one height so no label is clipped.
				const x = r < 3 ? 0.09 : 0.52;
				const y = 0.775 + (r < 3 ? r : r - 3) * 0.033;
				text(card, row.label, UDim2.fromScale(0.13, 0.03), UDim2.fromScale(x, y));
				const bar = frame(card, UDim2.fromScale(0.23, 0.024), UDim2.fromScale(x + 0.14, y + 0.004), BLACK, 0.3);
				// Solid gold fill under the art fill: the stat value stays visible even if the bar art does not draw.
				// Plain gold fill (the bar art is unreadable at this size).
				const fill = frame(bar, UDim2.fromScale(def.stats[row.key] / 10, 1), UDim2.fromScale(0, 0), GOLD, 0);
				fill.ZIndex = 5;
				rounded(bar, 0.5);
				rounded(fill, 0.5);
			});
			liftCard(card);
			card.Activated.Connect(() => {
				selectedStarter = id;
				for (const [sid, st] of strokes) st.Enabled = sid === id;
			});
		});
		show(starterScreen);
		setBgm("menu");
	};

	/** After the first starter is saved, the first-time flow goes straight into the stage 0 tutorial dialogue. */
	const goToTutorialAfterStarter = (): void => {
		pendingStarter = false;
		const p = profile;
		if (p === undefined || p.country === undefined || p.starter === undefined) {
			showMap();
			return;
		}
		const tutorial = getStages(p.country, p.starter).find((st) => st.id === TUTORIAL_STAGE_ID);
		if (tutorial === undefined) showMap();
		else openDialogue(tutorial);
	};

	const confirmStarter = (): void => {
		const c = pickedCountry;
		const id = selectedStarter;
		if (c === undefined || id === undefined) {
			showToast("先選一位武將吧！");
			return;
		}
		pendingStarter = true;
		starterAttempt++;
		const attempt = starterAttempt;
		starterStatus.Text = "正在收下這位大將……";
		const cmd: Command = { cmd: "chooseStarter", country: c, starter: id };
		remotes.Command.FireServer(cmd);
		task.delay(STARTER_TIMEOUT_SECONDS, () => {
			if (attempt !== starterAttempt || !pendingStarter) return;
			task.spawn(() => {
				// No ProfileChanged in time: ask the server whether the starter was saved anyway.
				const p = refreshProfile();
				if (attempt !== starterAttempt || !pendingStarter) return;
				if (p !== undefined && p.starter !== undefined) {
					goToTutorialAfterStarter();
					return;
				}
				starterStatus.Text = "連線逾時，請再按一次「就決定是你了！」";
			});
		});
	};

	/** Detail strip under the class cards: growth, preferred weapon type, starter weapon and starter special of cls. */
	const showDetail = (cls: LordClass): void => {
		clearCards(classDetail);
		const info = classInfo(cls);
		let prefNames = "";
		info.preferred.forEach((t) => {
			prefNames += (prefNames === "" ? "" : "・") + WEAPON_TYPE_NAME[t];
		});
		const cells: [string | undefined, string][] = [
			[undefined, `成長：${statLabel(info.growth[0])}、${statLabel(info.growth[1])}`],
			[WEAPON_TYPE_ICON[info.preferred[0]], `偏好：${prefNames}`],
			[weaponArt(info.starterWeapon), `起手武器：${weaponItemName(info.starterWeapon)}`],
			[specialIcon(info.starterSpecial), `起手大招：${specialItemName(info.starterSpecial)}`],
		];
		cells.forEach(([icon, content], k) => {
			const cell = frame(classDetail, UDim2.fromScale(0.25, 1), UDim2.fromScale(k * 0.25, 0), BLACK, 1);
			let textX = 0.03;
			if (icon !== undefined) {
				picture(cell, icon, UDim2.fromScale(0.2, 0.8), UDim2.fromScale(0.02, 0.1));
				textX = 0.25;
			}
			const label = text(cell, content, UDim2.fromScale(0.97 - textX, 0.8), UDim2.fromScale(textX, 0.1));
			label.TextXAlignment = Enum.TextXAlignment.Left;
			capText(label, 24);
		});
	};

	/** Lord class cards (first-time flow only, after the country): the pick is saved, then the starter pick follows. */
	const showClass = (): void => {
		pendingClass = false;
		classStatus.Text = "";
		clearCards(classCardArea);
		const strokes: [LordClass, UIStroke][] = [];
		const focus = selectedClass ?? LORD_CLASSES[0];
		selectedClass = focus;
		LORD_CLASSES.forEach((cls, i) => {
			const info = classInfo(cls);
			// Rare card frame in the class colour. The class art fills the picture window; the emblem badge is in its top-right
			// corner; the name plate (name + position chip) sits under the window; the blue box has the passive and a short text.
			const card = artCard(classCardArea, ART.card_frame_rare, CARD_ASPECT, UDim2.fromScale(0.3, 1), UDim2.fromScale(0, 0), CLASS_COLOR[cls]);
			card.LayoutOrder = i;
			const stroke = new Instance("UIStroke");
			stroke.Color = GOLD;
			stroke.Thickness = 6;
			stroke.Enabled = focus === cls;
			stroke.Parent = card;
			strokes.push([cls, stroke]);
			picture(card, CLASS_ART[cls], UDim2.fromScale(0.86, 0.56), UDim2.fromScale(0.07, 0.1));
			picture(card, CLASS_EMBLEM[cls], UDim2.fromScale(0.16, 0.1), UDim2.fromScale(0.72, 0.14));
			const plate = frame(card, UDim2.fromScale(0.79, 0.08), UDim2.fromScale(0.11, 0.565), BLACK, 0.15);
			plate.ZIndex = 4;
			const nameLabel = text(plate, info.name, UDim2.fromScale(0.6, 0.9), UDim2.fromScale(0.04, 0.05));
			nameLabel.TextColor3 = GOLD;
			nameLabel.TextXAlignment = Enum.TextXAlignment.Left;
			nameLabel.ZIndex = 5;
			tag(plate, info.position, UDim2.fromScale(0.2, 0.6), UDim2.fromScale(0.76, 0.2), PANEL);
			picture(card, CLASS_PASSIVE_ICON[cls], UDim2.fromScale(0.1, 0.05), UDim2.fromScale(0.1, 0.715));
			const head = text(card, `被動・${info.passive}`, UDim2.fromScale(0.68, 0.055), UDim2.fromScale(0.22, 0.715));
			capText(head, 30);
			const passive = text(card, info.passiveText, UDim2.fromScale(0.8, 0.09), UDim2.fromScale(0.1, 0.78));
			passive.TextWrapped = true;
			capText(passive, 28);
			liftCard(card);
			card.Activated.Connect(() => {
				selectedClass = cls;
				for (const [k, st] of strokes) st.Enabled = k === cls;
				showDetail(cls);
			});
		});
		showDetail(focus);
		show(classScreen);
		setBgm("menu");
	};

	/** After the class is saved: the first-time flow goes on to the starter pick, otherwise to the map. */
	const afterClass = (): void => {
		pendingClass = false;
		const p = profile;
		if (p !== undefined && p.starter === undefined) showStarter();
		else showMap();
	};

	const confirmClass = (): void => {
		const cls = selectedClass;
		if (cls === undefined) {
			showToast("先選一個流派吧！");
			return;
		}
		pendingClass = true;
		classChoice = cls;
		classAttempt++;
		const attempt = classAttempt;
		classStatus.Text = "正在收下這個流派……";
		const cmd: Command = { cmd: "chooseClass", lordClass: cls };
		remotes.Command.FireServer(cmd);
		task.delay(STARTER_TIMEOUT_SECONDS, () => {
			if (attempt !== classAttempt || !pendingClass) return;
			task.spawn(() => {
				// No ProfileChanged in time: ask the server whether the class was saved anyway.
				const p = refreshProfile();
				if (attempt !== classAttempt || !pendingClass) return;
				if (p !== undefined && p.lordClass === cls) {
					afterClass();
					return;
				}
				classStatus.Text = "連線逾時，請再按一次「就是這個流派！」";
			});
		});
	};

	/** A picked camp option: a locked one only says why; any other sends the command (unless it is the current one) and closes the grid. */
	const pickCampOption = (slot: CampSlot, o: CampOption, after: () => void): void => {
		if (o.locked !== undefined) {
			showToast(`${o.name}：${o.locked}`);
			return;
		}
		if (!o.selected) {
			const cmd: Command =
				slot === "class"
					? { cmd: "chooseClass", lordClass: o.id as LordClass }
					: { cmd: "equip", slot: slot === "weapon" ? "weapon" : "special", id: o.id };
			remotes.Command.FireServer(cmd);
		}
		after();
	};

	/** Lord camp page: summary with the stats on the left; the three slots, or the option grid of the slot being edited, on the right. Rebuilt from the profile. */
	const renderCamp = (): void => {
		const p = profile;
		campScreen.ClearAllChildren();
		picture(campScreen, ART4.camp_bg, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), Enum.ScaleType.Crop);
		if (p === undefined || p.lordClass === undefined) return;
		const cls = p.lordClass;
		const info = classInfo(cls);
		const campTop = headerTopPx();
		const bodyTop = campTop + HEADER_H + HEADER_PAD;
		const back = bigArt(campScreen, "blue", "返回地圖", new UDim2(0.16, 0, 0, HEADER_H), new UDim2(0.02, 0, 0, campTop));
		back.Activated.Connect(() => leaveCamp());
		text(campScreen, "主公營帳", new UDim2(0.3, 0, 0, HEADER_H), new UDim2(0.35, 0, 0, campTop));
		// Everything below the header goes in body, so its fractions start under the header.
		const body = frame(campScreen, new UDim2(1, 0, 1, -bodyTop), new UDim2(0, 0, 0, bodyTop), BLACK, 1);

		// Summary (left): title, class, passive, then the five stats; a gold number is the bonus from the weapon in use.
		const left = frame(body, UDim2.fromScale(0.36, 0.8), UDim2.fromScale(0.02, 0.15), PANEL, 0.1);
		rounded(left, 0.04);
		text(left, lordTitle(p), UDim2.fromScale(0.74, 0.08), UDim2.fromScale(0.05, 0.03));
		picture(left, CLASS_EMBLEM[cls], UDim2.fromScale(0.12, 0.1), UDim2.fromScale(0.84, 0.02));
		const classLabel = text(left, `${info.name}・${info.position}`, UDim2.fromScale(0.9, 0.07), UDim2.fromScale(0.05, 0.12));
		classLabel.TextColor3 = GOLD;
		picture(left, CLASS_PASSIVE_ICON[cls], UDim2.fromScale(0.08, 0.12), UDim2.fromScale(0.05, 0.2));
		text(left, `被動・${info.passive}：${info.passiveText}`, UDim2.fromScale(0.8, 0.16), UDim2.fromScale(0.15, 0.2));
		text(left, "能力值（金色為武器加成）", UDim2.fromScale(0.9, 0.05), UDim2.fromScale(0.05, 0.4));
		const base = lordStatsFor(cls, p.lordLevel, undefined);
		const total = lordStatsFor(cls, p.lordLevel, effectiveWeapon(cls, p.loadout.weapon));
		STAT_ROWS.forEach((row, r) => {
			const y = 0.46 + r * 0.085;
			const v = total[row.key];
			const bonus = v - base[row.key];
			text(left, row.label, UDim2.fromScale(0.2, 0.065), UDim2.fromScale(0.05, y));
			const bar = frame(left, UDim2.fromScale(0.42, 0.05), UDim2.fromScale(0.27, y + 0.008), BLACK, 0.3);
			frame(bar, UDim2.fromScale(v / 10, 1), UDim2.fromScale(0, 0), GOLD, 0);
			text(left, `${v}`, UDim2.fromScale(0.1, 0.065), UDim2.fromScale(0.72, y));
			if (bonus > 0) {
				const plus = text(left, `+${bonus}`, UDim2.fromScale(0.13, 0.065), UDim2.fromScale(0.83, y));
				plus.TextColor3 = BAR_ORANGE;
			}
		});

		const weaponNow = effectiveWeapon(cls, p.loadout.weapon);
		const specialNow = effectiveSpecial(cls, p.loadout.special);
		if (campSlot === undefined) {
			const rows: { key: CampSlot; label: string; value: string; icon: string | undefined }[] = [
				{ key: "class", label: "流派", value: `${info.name}・${info.position}`, icon: CLASS_EMBLEM[cls] },
				{ key: "weapon", label: "武器", value: weaponItemName(weaponNow), icon: weaponArt(weaponNow) },
				{ key: "special", label: "大招", value: specialItemName(specialNow), icon: specialIcon(specialNow) },
			];
			rows.forEach((row, i) => {
				const slot = bigButton(body, "", UDim2.fromScale(0.58, 0.18), UDim2.fromScale(0.4, 0.13 + i * 0.2), PANEL);
				const slotLabel = text(slot, row.label, UDim2.fromScale(0.16, 0.3), UDim2.fromScale(0.25, 0.08));
				slotLabel.TextColor3 = GOLD;
				slotIcon(slot, row.icon, UDim2.fromScale(0.2, 0.8), UDim2.fromScale(0.03, 0.1));
				text(slot, row.value, UDim2.fromScale(0.68, 0.42), UDim2.fromScale(0.25, 0.45));
				slot.Activated.Connect(() => {
					campSlot = row.key;
					renderCamp();
				});
			});
			text(body, "麾下武將", UDim2.fromScale(0.3, 0.06), UDim2.fromScale(0.4, 0.72));
			rosterRow(body, p, UDim2.fromScale(0.58, 0.19), UDim2.fromScale(0.4, 0.79));
		} else {
			const slot = campSlot;
			optionGrid(
				body,
				p,
				cls,
				slot,
				"返回營帳",
				(o) =>
					pickCampOption(slot, o, () => {
						campSlot = undefined;
						renderCamp();
					}),
				() => {
					campSlot = undefined;
					renderCamp();
				},
			);
		}
	};

	/** Opens the lord camp from the stage map header. */
	const showCamp = (): void => {
		if (profile === undefined || profile.lordClass === undefined) {
			showMap();
			return;
		}
		campSlot = undefined;
		renderCamp();
		show(campScreen);
		setBgm("menu");
	};

	/** Leaves the lord camp for the stage map. */
	const leaveCamp = (): void => {
		campSlot = undefined;
		showMap();
	};

	/**
	 * The chapter map canvas: the 1920×1080 art at the scale that covers the viewport (ScaleType Crop: scale = max of the
	 * two ratios, centred). The stop fractions are of this canvas, so a node lands on the same road point on any screen;
	 * the map screen clips the part that overflows.
	 */
	let mapBox: Frame | undefined;
	const fitMapBox = (): void => {
		const box = mapBox;
		const cam = Workspace.CurrentCamera;
		if (box === undefined || cam === undefined) return;
		const vp = cam.ViewportSize;
		const k = math.max(vp.X / MAP_W, vp.Y / MAP_H);
		box.Size = UDim2.fromOffset(MAP_W * k, MAP_H * k);
	};

	const showMap = (): void => {
		const p = profile;
		if (p === undefined || p.country === undefined || p.starter === undefined) {
			showMainMenu();
			return;
		}
		hud.clearMatchUi();
		setBgm("menu");
		const country = p.country;
		const starter = p.starter;
		const stages = getStages(country, starter);
		mapScreen.ClearAllChildren();
		// The map covers the whole screen; the screen clips the overflow of the canvas below.
		mapScreen.ClipsDescendants = true;

		// Chapter map canvas (see fitMapBox). The stage nodes go in this canvas.
		const box = frame(mapScreen, UDim2.fromScale(1, 1), UDim2.fromScale(0.5, 0.5), BLACK, 1);
		box.AnchorPoint = new Vector2(0.5, 0.5);
		picture(box, ART.bg_map_ch1, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), Enum.ScaleType.Stretch);
		mapBox = box;
		fitMapBox();

		// Compact header across the top (back, chapter, lord camp, lord panel). The stage labels are all below it.
		const headTop = headerTopPx();
		const back = bigArt(mapScreen, "blue", "返回主選單", new UDim2(0.145, 0, 0, HEADER_H), new UDim2(0.01, 0, 0, headTop));
		back.Activated.Connect(() => showMainMenu());
		text(mapScreen, "第一章", new UDim2(0.07, 0, 0, HEADER_H), new UDim2(0.165, 0, 0, headTop));
		const campBtn = bigArt(mapScreen, "gold", "主公營帳", new UDim2(0.16, 0, 0, HEADER_H), new UDim2(0.24, 0, 0, headTop));
		campBtn.Activated.Connect(() => showCamp());

		// Lord panel: title and xp on the top row; xp bar and coins on the bottom row.
		const lvPanel = frame(mapScreen, new UDim2(0.37, 0, 0, HEADER_H), new UDim2(0.62, 0, 0, headTop), BLACK, 0.3);
		rounded(lvPanel, 0.1);
		// Class emblem beside the title (when a class is chosen); the title starts after it.
		const mapCls = p.lordClass;
		if (mapCls !== undefined) picture(lvPanel, CLASS_EMBLEM[mapCls], UDim2.fromScale(0.07, 0.4), UDim2.fromScale(0.015, 0.06));
		text(lvPanel, lordTitle(p), UDim2.fromScale(0.42, 0.4), UDim2.fromScale(mapCls === undefined ? 0.02 : 0.1, 0.06));
		text(
			lvPanel,
			p.lordLevel >= LORD_MAX_LEVEL ? "已滿級" : `經驗 ${carriedXp(p.lordLevel, p.lordXp)} / ${needFor(p.lordLevel)}`,
			UDim2.fromScale(0.44, 0.4),
			UDim2.fromScale(0.54, 0.06),
		);
		const lordXp = xpBar(lvPanel, UDim2.fromScale(0.44, 0.1), UDim2.fromScale(0.02, 0.52));
		lordXp.fill.Size = UDim2.fromScale(xpFraction(p.lordLevel, p.lordXp), 1);
		picture(lvPanel, ART.icon_coin, UDim2.fromScale(0.08, 0.4), UDim2.fromScale(0.5, 0.53));
		text(lvPanel, `${p.coins}`, UDim2.fromScale(0.36, 0.4), UDim2.fromScale(0.6, 0.53));

		// Roster (bottom left, clear of the nodes): starter first, then recruits in recruit order.
		const names: string[] = [nameOf(starter)];
		p.recruited.forEach((id) => names.push(nameOf(id)));
		const roster = text(mapScreen, `麾下：${names.join("、")}`, UDim2.fromScale(0.7, 0.04), UDim2.fromScale(0.01, 0.935));
		roster.TextXAlignment = Enum.TextXAlignment.Left;

		// Stage nodes sit on the road stops of the chapter map (MAP_STOPS, by stage id; 0 = tutorial).
		stages.forEach((stage) => {
			buildNode(box, p, stage, MAP_STOPS[stage.id]);
		});
		show(mapScreen);
	};

	const buildNode = (box: Frame, p: Profile, stage: StageDef, stop: MapStop): void => {
		const cleared = p.cleared.includes(clearedKey(stage.id));
		const unlocked = isUnlocked(p, stage.id);
		const current = unlocked && !cleared;
		const isBoss = stage.bossCharId !== undefined || stage.recruit !== undefined;
		// Node medallion (square, centred on its stop); locked nodes are dimmed.
		const node = new Instance("ImageButton");
		node.BackgroundTransparency = 1;
		node.BorderSizePixel = 0;
		node.AutoButtonColor = false;
		node.ScaleType = Enum.ScaleType.Fit;
		node.Image = isBoss ? ART.node_boss : ART.node_normal;
		node.ImageTransparency = unlocked ? 0 : 0.35;
		node.AnchorPoint = new Vector2(0.5, 0.5);
		node.Position = UDim2.fromScale(stop.u, stop.v);
		node.Size = UDim2.fromScale(NODE_W, NODE_W * (MAP_W / MAP_H));
		node.Parent = box;
		const ratio = new Instance("UIAspectRatioConstraint");
		ratio.AspectRatio = 1;
		ratio.Parent = node;
		const nodeScale = new Instance("UIScale");
		nodeScale.Parent = node;
		if (current) breathe(nodeScale);
		node.Activated.Connect(() => {
			if (!unlocked) {
				showToast("先打贏前一關才能挑戰喔！");
				return;
			}
			openDialogue(stage);
		});

		const [short] = string.gsub(stage.title, "^第.-關 ", "");
		const isTutorial = stage.id === TUTORIAL_STAGE_ID;
		// Tags (one chip per row) only for unlocked stages: team size, goal, recruit, cleared.
		const tags: { content: string; color: Color3 }[] = [];
		if (unlocked) {
			tags.push({ content: `${stage.teamSize} 對 ${stage.teamSize}`, color: PANEL });
			if (stage.goalTarget !== undefined) tags.push({ content: `先得 ${stage.goalTarget} 分`, color: PANEL });
			if (stage.recruit !== undefined && !p.recruited.includes(stage.recruit)) tags.push({ content: "可收服！", color: YELLOW });
			if (cleared) tags.push({ content: "已通關", color: GOLD });
		}
		// One compact column: title row, name row, then the chips. The panel is as tall as its rows and sits beside the node
		// on the side the stop table gives (R right, L left, U above, D below), so the rows never overlap each other.
		const rowCount = 2 + tags.size();
		const panel = frame(
			node,
			UDim2.fromScale(LABEL_W, (rowCount - 1) * LABEL_ROW + LABEL_CHIP + 2 * LABEL_PAD),
			UDim2.fromScale(0, 0),
			BLACK,
			0.35,
		);
		rounded(panel, 0.1);
		if (stop.side === "R") {
			panel.AnchorPoint = new Vector2(0, 0.5);
			panel.Position = UDim2.fromScale(1 + LABEL_GAP, 0.5);
		} else if (stop.side === "L") {
			panel.AnchorPoint = new Vector2(1, 0.5);
			panel.Position = UDim2.fromScale(-LABEL_GAP, 0.5);
		} else if (stop.side === "U") {
			panel.AnchorPoint = new Vector2(0.5, 1);
			panel.Position = UDim2.fromScale(0.5, -LABEL_GAP);
		} else {
			panel.AnchorPoint = new Vector2(0.5, 0);
			panel.Position = UDim2.fromScale(0.5, 1 + LABEL_GAP);
		}
		const titleLabel = text(
			panel,
			isTutorial ? "教學" : `第${NUMERALS[stage.id - 1]}關`,
			UDim2.fromScale(0.92, LABEL_CHIP),
			UDim2.fromScale(0.04, LABEL_PAD),
		);
		titleLabel.TextColor3 = GOLD;
		// The stage's short title only once (the enemy name is not repeated under it).
		text(panel, isTutorial ? "主公初陣" : short, UDim2.fromScale(0.92, LABEL_CHIP), UDim2.fromScale(0.04, LABEL_PAD + LABEL_ROW));
		tags.forEach((tg, i) => {
			tag(panel, tg.content, UDim2.fromScale(0.92, LABEL_CHIP), UDim2.fromScale(0.04, LABEL_PAD + (i + 2) * LABEL_ROW), tg.color);
		});

		if (!unlocked) {
			// Padlock over the medallion; the stage number and title above stay readable.
			picture(node, ART.node_locked, UDim2.fromScale(0.55, 0.55), UDim2.fromScale(0.225, 0.225));
			return;
		}
		// Boss portrait: a small round head at the node's top-right.
		const bossArt = stage.bossCharId === undefined ? undefined : portraitFor(stage.bossCharId);
		if (bossArt !== undefined) {
			const head = picture(node, bossArt, UDim2.fromScale(0.46, 0.46), UDim2.fromScale(0.7, -0.08));
			rounded(head, 0.5);
		}
		if (cleared) picture(node, ART.node_cleared, UDim2.fromScale(0.55, 0.55), UDim2.fromScale(0.225, 0.225));
	};

	const openDialogue = (stage: StageDef): void => {
		hud.clearMatchUi();
		dialogueStage = stage;
		dialogueIndex = 0;
		dialogueTitle.Text = stage.title;
		// The slot is never empty: the stage boss speaks if there is one, else the player's starter general, else the lord.
		const starter = profile === undefined ? undefined : profile.starter;
		const speakerId = stage.bossCharId !== undefined ? stage.bossCharId : starter;
		speakerLabel.Text = speakerId !== undefined ? nameOf(speakerId) : "主公";
		const speakerArt = speakerId !== undefined ? portraitFor(speakerId) : undefined;
		speakerPortrait.Image = speakerArt ?? portraitFor("lord_sword") ?? "";
		lineLabel.Text = stage.intro[0];
		setBgm("menu");
		show(dialogueScreen);
	};

	const advanceDialogue = (): void => {
		const lines = scene;
		if (lines !== undefined) {
			sceneIndex++;
			if (sceneIndex >= lines.size()) endScene();
			else showSceneLine();
			return;
		}
		const stage = dialogueStage;
		if (stage === undefined) return;
		dialogueIndex++;
		if (dialogueIndex >= stage.intro.size()) {
			afterPreMatchDialogue();
			return;
		}
		lineLabel.Text = stage.intro[dialogueIndex];
	};

	/** Shows the current line of the scripted scene on the dialog box. */
	const showSceneLine = (): void => {
		const lines = scene;
		if (lines === undefined) return;
		const line = lines[sceneIndex];
		speakerLabel.Text = line.speaker;
		speakerPortrait.Image = line.portrait ?? "";
		lineLabel.Text = line.text;
	};

	/** Ends the scripted scene and runs what follows it (the recruit banner). */
	const endScene = (): void => {
		const done = sceneDone;
		scene = undefined;
		sceneDone = undefined;
		if (done !== undefined) done();
	};

	/** The pre-match dialogue is over: the tutorial starts at once; every other stage opens the loadout first. */
	const afterPreMatchDialogue = (): void => {
		const stage = dialogueStage;
		if (stage === undefined) return;
		if (stage.id === TUTORIAL_STAGE_ID) startStoryMatch(stage);
		else showLoadout(stage);
	};

	const startStoryMatch = (stage: StageDef): void => {
		dialogueStage = undefined;
		loadoutStage = undefined;
		loadoutSlot = undefined;
		const p = profile;
		matchLevel = p === undefined ? 1 : p.lordLevel;
		matchXp = p === undefined ? 0 : p.lordXp;
		show(undefined);
		hud.clearMatchUi();
		const cmd: Command = { cmd: "story", stageId: stage.id };
		remotes.Command.FireServer(cmd);
	};

	/** Pre-match loadout page: the stage, the lord's class (with a link to the camp), the weapon and special slots, and our
	 *  lineup. A slot opens its option grid (the camp page's grid) in place of the page. Rebuilt from the profile. */
	const renderLoadout = (): void => {
		const p = profile;
		const stage = loadoutStage;
		loadoutScreen.ClearAllChildren();
		if (p === undefined || stage === undefined || p.lordClass === undefined) return;
		const cls = p.lordClass;
		const info = classInfo(cls);
		const headTop = headerTopPx();
		const bodyTop = headTop + HEADER_H + HEADER_PAD;
		const back = bigArt(loadoutScreen, "blue", "返回地圖", new UDim2(0.16, 0, 0, HEADER_H), new UDim2(0.02, 0, 0, headTop));
		back.Activated.Connect(() => {
			loadoutStage = undefined;
			loadoutSlot = undefined;
			dialogueStage = undefined;
			showMap();
		});
		text(loadoutScreen, "出戰準備", new UDim2(0.3, 0, 0, HEADER_H), new UDim2(0.35, 0, 0, headTop));
		const body = frame(loadoutScreen, new UDim2(1, 0, 1, -bodyTop), new UDim2(0, 0, 0, bodyTop), BLACK, 1);

		const openSlot = loadoutSlot;
		if (openSlot !== undefined) {
			optionGrid(
				body,
				p,
				cls,
				openSlot,
				"返回",
				(o) =>
					pickCampOption(openSlot, o, () => {
						loadoutSlot = undefined;
						renderLoadout();
					}),
				() => {
					loadoutSlot = undefined;
					renderLoadout();
				},
			);
			return;
		}

		const goal = stage.goalTarget === undefined ? "" : `・先得 ${stage.goalTarget} 分`;
		text(body, `${stage.title}・${stage.teamSize} 對 ${stage.teamSize}${goal}`, UDim2.fromScale(0.9, 0.07), UDim2.fromScale(0.05, 0.01));
		picture(body, CLASS_EMBLEM[cls], UDim2.fromScale(0.05, 0.07), UDim2.fromScale(0.05, 0.11));
		const classLine = text(body, `流派：${info.name}・${info.position}（${info.passive}）`, UDim2.fromScale(0.55, 0.07), UDim2.fromScale(0.1, 0.11));
		classLine.TextColor3 = GOLD;
		const toCamp = bigButton(body, "去營帳換流派", UDim2.fromScale(0.3, 0.08), UDim2.fromScale(0.68, 0.1), GREY);
		toCamp.Activated.Connect(() => {
			loadoutStage = undefined;
			loadoutSlot = undefined;
			dialogueStage = undefined;
			showCamp();
		});

		const weaponNow = effectiveWeapon(cls, p.loadout.weapon);
		const specialNow = effectiveSpecial(cls, p.loadout.special);
		const picks: { key: CampSlot; label: string; value: string; icon: string | undefined }[] = [
			{ key: "weapon", label: "武器", value: weaponItemName(weaponNow), icon: weaponArt(weaponNow) },
			{ key: "special", label: "大招", value: specialItemName(specialNow), icon: specialIcon(specialNow) },
		];
		picks.forEach((pick, i) => {
			const box = bigButton(body, "", UDim2.fromScale(0.44, 0.2), UDim2.fromScale(0.05 + i * 0.5, 0.22), PANEL);
			const label = text(box, pick.label, UDim2.fromScale(0.16, 0.3), UDim2.fromScale(0.25, 0.08));
			label.TextColor3 = GOLD;
			slotIcon(box, pick.icon, UDim2.fromScale(0.2, 0.8), UDim2.fromScale(0.03, 0.1));
			text(box, pick.value, UDim2.fromScale(0.68, 0.42), UDim2.fromScale(0.25, 0.45));
			box.Activated.Connect(() => {
				loadoutSlot = pick.key;
				renderLoadout();
			});
		});

		// Our lineup: each player with his position (the same slot rule as the match, see teamBuilder lineupFor).
		text(body, "出戰陣容", UDim2.fromScale(0.3, 0.06), UDim2.fromScale(0.05, 0.44));
		lineupFor(p, stage.teamSize).forEach((s, i) => {
			const card = frame(body, UDim2.fromScale(0.17, 0.3), UDim2.fromScale(0.05 + i * 0.19, 0.52), PANEL, 0.1);
			rounded(card, 0.06);
			tag(card, ROLE_NAME[s.role], UDim2.fromScale(0.5, 0.1), UDim2.fromScale(0.25, 0.03), BLACK);
			const fill = s.fill;
			let who = "士兵";
			let art: string | undefined;
			if (fill.kind === "lord") {
				who = "主公";
				art = portraitFor("lord_sword");
			} else if (fill.kind === "general") {
				who = fill.def.name;
				art = portraitFor(fill.def.id);
			}
			if (art !== undefined) picture(card, art, UDim2.fromScale(0.7, 0.6), UDim2.fromScale(0.15, 0.17));
			text(card, who, UDim2.fromScale(0.85, 0.16), UDim2.fromScale(0.075, 0.8));
		});

		const start = bigArt(body, "red", "出戰！", UDim2.fromScale(0.3, 0.12), UDim2.fromScale(0.35, 0.86));
		start.Activated.Connect(() => startStoryMatch(stage));
	};

	/** Opens the loadout for a stage (after its pre-match dialogue). */
	const showLoadout = (stage: StageDef): void => {
		if (profile === undefined || profile.lordClass === undefined) {
			startStoryMatch(stage);
			return;
		}
		loadoutStage = stage;
		loadoutSlot = undefined;
		renderLoadout();
		show(loadoutScreen);
		setBgm("menu");
	};

	const tweenBar = (fraction: number, seconds: number): void => {
		if (barTween !== undefined) barTween.Cancel();
		barTween = TweenService.Create(barFill, new TweenInfo(seconds), { Size: UDim2.fromScale(fraction, 1) });
		barTween.Play();
	};

	/** Recruit scene after a won stage that recruits a general: his lines on the dialog box, then the banner, then the result. */
	const playRecruitScene = (r: StoryResult): void => {
		const recruited = r.recruited;
		if (recruited === undefined) {
			showResult(r);
			return;
		}
		const p = profile;
		const stage: StageDef | undefined =
			p !== undefined && p.country !== undefined && p.starter !== undefined
				? getStages(p.country, p.starter).find((st) => st.id === r.stageId)
				: undefined;
		scene = recruitScene(recruited, stage);
		sceneIndex = 0;
		sceneDone = () => showRecruitBanner(r);
		dialogueTitle.Text = `收服 ${nameOf(recruited)}`;
		showSceneLine();
		show(dialogueScreen);
		setBgm("menu");
	};

	/** The recruit banner: the title art with the general's portrait, 「<name> 加入了我軍！」 and sparkles. Tap goes on to the result. */
	const showRecruitBanner = (r: StoryResult): void => {
		const recruited = r.recruited;
		if (recruited === undefined) {
			showResult(r);
			return;
		}
		bannerScreen.ClearAllChildren();
		let taken = false;
		tapLayer(bannerScreen, () => {
			if (taken) return;
			taken = true;
			showResult(r);
		});
		const pic = picture(bannerScreen, ART.title_recruit, UDim2.fromScale(0.8, 0.3), UDim2.fromScale(0.1, 0.2));
		const pop = new Instance("UIScale");
		pop.Scale = 0.3;
		pop.Parent = pic;
		TweenService.Create(pop, new TweenInfo(0.5, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale: 1 }).Play();
		const art = portraitFor(recruited);
		if (art !== undefined) {
			const face = picture(pic, art, UDim2.fromScale(0.15, 0.78), UDim2.fromScale(0.5, 0.5));
			face.AnchorPoint = new Vector2(0.5, 0.5);
		}
		const name = text(bannerScreen, `${nameOf(recruited)} 加入了我軍！`, UDim2.fromScale(0.8, 0.1), UDim2.fromScale(0.1, 0.58));
		name.TextColor3 = GOLD;
		sparkle(bannerScreen, 8);
		text(bannerScreen, "點一下繼續", UDim2.fromScale(0.3, 0.06), UDim2.fromScale(0.35, 0.9));
		show(bannerScreen);
	};

	const showResult = (r: StoryResult): void => {
		resultToken++;
		const token = resultToken;
		resultStageId = r.stageId;

		resultPic.Image = r.won ? ART.title_victory : ART.title_defeat;
		resultPic.Visible = !r.chapterClear;
		chapterPic.Visible = r.chapterClear;
		const recruited = r.recruited;
		recruitLine.Visible = recruited !== undefined;
		if (recruited !== undefined) recruitLine.Text = `收服 ${nameOf(recruited)}！`;
		const levelUp = r.levelAfter > r.levelBefore;
		lvFlash.Text = `Lv ${r.levelAfter}`;
		lvFlash.Visible = false;
		lvPic.Visible = false;
		lvPicScale.Scale = 0;
		lvFlashScale.Scale = 0;
		xpLabel.Text = "經驗 +0";
		coinLabel.Text = "銅錢 +0";
		nextBtn.Visible = false;
		retryBtn.Visible = false;
		mapBtn.Visible = false;
		const startXp = matchLevel === r.levelBefore ? matchXp : 0;
		if (barTween !== undefined) barTween.Cancel();
		barTween = undefined;
		resultBar.tint(GOLD);
		barFill.Size = UDim2.fromScale(xpFraction(r.levelBefore, startXp), 1);
		barText.Text = barCaption(r.levelBefore, startXp);
		show(resultScreen);

		task.spawn(() => {
			task.wait(0.4);
			const steps = 20;
			for (let i = 1; i <= steps; i++) {
				if (token !== resultToken) return;
				xpLabel.Text = `經驗 +${math.floor((r.xp * i) / steps)}`;
				coinLabel.Text = `銅錢 +${math.floor((r.coins * i) / steps)}`;
				task.wait(0.04);
			}
			// Carry-over xp at the final level, always 0..need of that level (see carryAfter).
			const carry = carryAfter(r, startXp, profile);
			if (levelUp) {
				tweenBar(1, 0.5);
				task.wait(0.6);
				if (token !== resultToken) return;
				lvPic.Visible = true;
				lvFlash.Visible = true;
				TweenService.Create(lvPicScale, new TweenInfo(0.45, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale: 1 }).Play();
				TweenService.Create(lvFlashScale, new TweenInfo(0.45, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale: 1 }).Play();
				resultBar.tint(WHITE);
				task.wait(0.15);
				if (token !== resultToken) return;
				resultBar.tint(GOLD);
				barFill.Size = UDim2.fromScale(0, 1);
				task.wait(0.2);
				if (token !== resultToken) return;
			}
			barText.Text = barCaption(r.levelAfter, carry);
			tweenBar(xpFraction(r.levelAfter, carry), 0.6);
			task.wait(0.8);
			if (token !== resultToken) return;
			nextBtn.Visible = r.won && r.stageId < LAST_STAGE_ID;
			retryBtn.Visible = true;
			mapBtn.Visible = true;
		});
	};

	// ---------- wiring ----------
	const enterStory = (): void => {
		const p = refreshProfile();
		if (p === undefined) {
			showToast("連線失敗，請再試一次");
			return;
		}
		// Without a starter the first-time flow runs (intro, country, class, starter); a class already chosen is shown again.
		if (p.starter === undefined) showIntro();
		else showMap();
	};

	storyBtn.Activated.Connect(() => {
		task.spawn(() => enterStory());
	});
	quickBtn.Activated.Connect(() => {
		show(undefined);
		hud.showCountrySelect();
	});
	nextBtn.Activated.Connect(() => {
		task.spawn(() => {
			const p = refreshProfile();
			const nextId = resultStageId + 1;
			const nextStage =
				p !== undefined && p.country !== undefined && p.starter !== undefined && isUnlocked(p, nextId)
					? getStages(p.country, p.starter).find((st) => st.id === nextId)
					: undefined;
			if (nextStage !== undefined) openDialogue(nextStage);
			else showMap();
		});
	});
	retryBtn.Activated.Connect(() => {
		task.spawn(() => {
			const p = refreshProfile();
			if (p === undefined || p.country === undefined || p.starter === undefined) {
				showMap();
				return;
			}
			const again = getStages(p.country, p.starter).find((st) => st.id === resultStageId);
			if (again !== undefined) openDialogue(again);
			else showMap();
		});
	});
	mapBtn.Activated.Connect(() => {
		task.spawn(() => {
			refreshProfile();
			showMap();
		});
	});

	profileRemotes.ProfileChanged.OnClientEvent.Connect((p: unknown) => {
		const updated = p as Profile;
		profile = updated;
		refreshLordLabel();
		if (pendingClass && classChoice !== undefined && updated.lordClass === classChoice) afterClass();
		if (campScreen.Visible) renderCamp();
		if (loadoutScreen.Visible) renderLoadout();
		if (pendingStarter && updated.starter !== undefined) goToTutorialAfterStarter();
	});
	remotes.StoryResult.OnClientEvent.Connect((r: unknown) => {
		playRecruitScene(r as StoryResult);
	});
	// A new match starting: drop every story overlay (and any pending result animation) so nothing stale stays on top.
	remotes.Setup.OnClientEvent.Connect(() => {
		resultToken++;
		toastToken++;
		dialogueStage = undefined;
		scene = undefined;
		sceneDone = undefined;
		toast.Visible = false;
		show(undefined);
	});

	const camera = Workspace.CurrentCamera;
	if (camera !== undefined) camera.GetPropertyChangedSignal("ViewportSize").Connect(() => fitMapBox());

	showMainMenu();
	task.spawn(() => {
		refreshProfile();
	});
	return { showMainMenu };
}
