// Story mode UI (chapter 1): main menu, first-time intro + country + starter, stage map, pre-match dialogue and the
// result screen. Each screen is a full-screen frame in its own ScreenGui above the match HUD. Look and helpers come
// from hud.ts. The server owns the profile: this file reads it (GetProfile / ProfileChanged) and fires commands only.
import { RAW_CHARACTERS, type CharacterDef, type Stats } from "shared/game/data";
import type { Command, Country, LordWeapon, Remotes, StoryResult } from "shared/net";
import { getProfileRemotes, type Profile } from "shared/profileTypes";
import {
	clearedKey,
	getStages,
	isUnlocked,
	LAST_STAGE_ID,
	nameOf,
	STARTERS,
	TUTORIAL_STAGE_ID,
	type StageDef,
} from "shared/story";
import { setBgm } from "./bgm";
import { ART, portraitFor, skillIconFor, SKILL_ICON } from "./artIds";
import { artButton, artCard, barImage, CARD_ASPECT, picture, type ArtSkin } from "./artUi";
import { BLACK, button, COUNTRY_BANNER, COUNTRY_COLOR, COUNTRY_NAME, frame, GOLD, GREY, text, WHITE } from "./hud";

const Players = game.GetService("Players");
const TweenService = game.GetService("TweenService");
const Workspace = game.GetService("Workspace");

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
/** Lord weapon cards: one-line feel, basic attack and special (names match specialText.ts). */
interface WeaponCard {
	key: LordWeapon;
	name: string;
	color: Color3;
	feel: string;
	basic: string;
	specialName: string;
	specialEffect: string;
}
const WEAPON_CARDS: WeaponCard[] = [
	{
		key: "sword",
		name: "劍",
		color: Color3.fromRGB(60, 90, 150),
		feel: "平衡好上手",
		basic: "快速二連斬",
		specialName: "天子劍・旋風斬",
		specialEffect: "原地旋轉，把周圍敵人全部打飛",
	},
	{
		key: "spear",
		name: "槍",
		color: Color3.fromRGB(150, 58, 46),
		feel: "距離長、力量大",
		basic: "長距離突刺",
		specialName: "破陣槍・龍騰",
		specialEffect: "擲出金龍槍氣，直線穿透擊倒",
	},
	{
		key: "fan",
		name: "扇",
		color: Color3.fromRGB(52, 120, 92),
		feel: "遠距控場、會吸球",
		basic: "扇風彈：遠距離推開敵人和球",
		specialName: "鳳翼扇・羽風陣",
		specialEffect: "前方羽毛旋風讓敵人變慢，還能把球吸過來",
	},
];
const WEAPON_NAME: Record<LordWeapon, string> = { sword: "劍", spear: "槍", fan: "扇" };
const WEAPON_ART: Record<LordWeapon, string> = { sword: ART.weapon_sword, spear: ART.weapon_spear, fan: ART.weapon_fan };
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

/**
 * XP bar: grey track at the bar_frame's 8:1 ratio (so the ornament ends are not sliced), a solid gold fill under the
 * bar_fill art, and the bar_frame art on top. fill is the box to resize (width = share of the bar); tint recolours the fill.
 */
interface XpBar {
	fill: Frame;
	tint(color: Color3): void;
}
function xpBar(parent: Instance, size: UDim2, pos: UDim2): XpBar {
	const track = frame(parent, size, pos, GREY, 0.2);
	const ratio = new Instance("UIAspectRatioConstraint");
	ratio.AspectRatio = 8;
	ratio.DominantAxis = Enum.DominantAxis.Width;
	ratio.Parent = track;
	const fill = frame(track, UDim2.fromScale(0, 1), UDim2.fromScale(0, 0), GOLD, 1);
	const gold = frame(fill, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), GOLD, 0);
	const art = barImage(fill, ART.bar_fill, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0));
	picture(track, ART.bar_frame, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0));
	return {
		fill,
		tint(color: Color3): void {
			gold.BackgroundColor3 = color;
			art.ImageColor3 = color;
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

/** Lord title with the weapon name, e.g. "主公 Lv 3・劍" (no weapon part until one is chosen). */
function lordTitle(p: Profile): string {
	return p.lordWeapon === undefined ? `主公 Lv ${p.lordLevel}` : `主公 Lv ${p.lordLevel}・${WEAPON_NAME[p.lordWeapon]}`;
}

function charDef(id: string): CharacterDef | undefined {
	return RAW_CHARACTERS.find((d) => d.id === id);
}

export function createStoryUi(remotes: Remotes, hud: MatchHooks): { showMainMenu: () => void } {
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "StoryGui";
	gui.IgnoreGuiInset = true;
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
	let selectedWeapon: LordWeapon | undefined;
	let weaponChoice: LordWeapon | undefined;
	let pendingWeapon = false;
	let weaponAttempt = 0;
	let weaponFromMap = false;

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
			showWeapon(false);
		});
	});
	const countryBack = bigButton(countryScreen, "返回", UDim2.fromScale(0.18, 0.1), UDim2.fromScale(0.02, 0.86), GREY);
	countryBack.Activated.Connect(() => showMainMenu());

	// ---------- first-time starter pick ----------
	const starterScreen = screen(0.05, BG);
	text(starterScreen, "選一位你的第一員大將", UDim2.fromScale(0.6, 0.08), UDim2.fromScale(0.02, 0.02));
	const starterStatus = text(starterScreen, "", UDim2.fromScale(0.36, 0.08), UDim2.fromScale(0.62, 0.02));
	const cardArea = frame(starterScreen, UDim2.fromScale(1, 0.7), UDim2.fromScale(0, 0.13), BG, 1);
	const starterBack = bigButton(starterScreen, "返回", UDim2.fromScale(0.18, 0.1), UDim2.fromScale(0.02, 0.86), GREY);
	starterBack.Activated.Connect(() => showWeapon(false));
	const confirmBtn = bigButton(starterScreen, "就決定是你了！", UDim2.fromScale(0.42, 0.1), UDim2.fromScale(0.55, 0.86), GREEN);
	confirmBtn.Activated.Connect(() => confirmStarter());

	// ---------- lord weapon pick (first time after the country, or from the map header) ----------
	const weaponScreen = screen(0.05, BG);
	text(weaponScreen, "選擇你的主公武器", UDim2.fromScale(0.6, 0.08), UDim2.fromScale(0.02, 0.02));
	const weaponStatus = text(weaponScreen, "", UDim2.fromScale(0.36, 0.08), UDim2.fromScale(0.62, 0.02));
	const weaponCardArea = frame(weaponScreen, UDim2.fromScale(1, 0.7), UDim2.fromScale(0, 0.13), BG, 1);
	const weaponBack = bigButton(weaponScreen, "返回", UDim2.fromScale(0.18, 0.1), UDim2.fromScale(0.02, 0.86), GREY);
	weaponBack.Activated.Connect(() => {
		pendingWeapon = false;
		if (weaponFromMap) showMap();
		else if (profile !== undefined && profile.starter !== undefined) showMainMenu();
		else showCountry();
	});
	const weaponConfirm = bigButton(weaponScreen, "就用這把！", UDim2.fromScale(0.42, 0.1), UDim2.fromScale(0.55, 0.86), GREEN);
	weaponConfirm.Activated.Connect(() => confirmWeapon());

	// ---------- stage map (rebuilt on every show) ----------
	const mapScreen = screen(0.08, BG);

	// ---------- pre-match dialogue ----------
	const dialogueScreen = screen(0.15, BG);
	tapLayer(dialogueScreen, () => advanceDialogue());
	const dialogueTitle = text(dialogueScreen, "", UDim2.fromScale(0.6, 0.1), UDim2.fromScale(0.2, 0.04));
	const skipBtn = bigButton(dialogueScreen, "跳過", UDim2.fromScale(0.16, 0.1), UDim2.fromScale(0.82, 0.03), GREY);
	skipBtn.Activated.Connect(() => startStoryMatch());
	// Dialog box art (1024×256 scroll, 4:1): the speaker's portrait goes in its round left slot, name and lines on the parchment.
	const speakerBox = picture(dialogueScreen, ART.dialog_box, UDim2.fromScale(0.92, 0.34), UDim2.fromScale(0.5, 0.56));
	speakerBox.AnchorPoint = new Vector2(0.5, 0);
	const boxRatio = new Instance("UIAspectRatioConstraint");
	boxRatio.AspectRatio = 4;
	boxRatio.DominantAxis = Enum.DominantAxis.Height;
	boxRatio.Parent = speakerBox;
	const speakerPortrait = picture(speakerBox, "", UDim2.fromScale(0.21, 0.74), UDim2.fromScale(0.09, 0.1));
	speakerPortrait.Visible = false;
	// Text sits on the parchment only: fractions of the art (x 0.33–0.78 right of the portrait oval, y 0.24–0.76 between the
	// scroll's top edge and its bottom ornaments). placeDialogueText moves it; padding and TextScaled keep it inside.
	const speakerLabel = text(speakerBox, "", UDim2.fromScale(0.45, 0.13), UDim2.fromScale(0.33, 0.24));
	speakerLabel.TextColor3 = DIALOG_NAME;
	speakerLabel.TextStrokeTransparency = 1;
	speakerLabel.TextXAlignment = Enum.TextXAlignment.Left;
	const lineLabel = text(speakerBox, "", UDim2.fromScale(0.45, 0.36), UDim2.fromScale(0.33, 0.4));
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
	picture(panel, ART.icon_xp, UDim2.fromScale(0.07, 0.1), UDim2.fromScale(0.05, 0.29));
	const xpLabel = text(panel, "經驗 +0", UDim2.fromScale(0.36, 0.1), UDim2.fromScale(0.13, 0.29));
	picture(panel, ART.icon_coin, UDim2.fromScale(0.07, 0.1), UDim2.fromScale(0.51, 0.29));
	const coinLabel = text(panel, "銅錢 +0", UDim2.fromScale(0.36, 0.1), UDim2.fromScale(0.59, 0.29));
	// XP bar: width sets the height through the 8:1 frame ratio (about 0.09 of the panel height), centred under the labels.
	const resultBar = xpBar(panel, UDim2.fromScale(0.6, 0.1), UDim2.fromScale(0.2, 0.405));
	const barFill = resultBar.fill;
	const lvPic = picture(panel, ART.title_levelup, UDim2.fromScale(0.62, 0.1), UDim2.fromScale(0.05, 0.5));
	lvPic.Visible = false;
	const lvFlash = text(panel, "", UDim2.fromScale(0.2, 0.1), UDim2.fromScale(0.72, 0.5));
	lvFlash.TextColor3 = GOLD;
	lvFlash.Visible = false;
	// Recruit: title art with the recruited general's portrait in its empty middle.
	const recruitPic = picture(panel, ART.title_recruit, UDim2.fromScale(0.9, 0.18), UDim2.fromScale(0.05, 0.62));
	const recruitPortrait = picture(recruitPic, "", UDim2.fromScale(0.15, 0.78), UDim2.fromScale(0.5, 0.5));
	recruitPortrait.AnchorPoint = new Vector2(0.5, 0.5);
	const recruitLine = text(panel, "", UDim2.fromScale(0.9, 0.04), UDim2.fromScale(0.05, 0.81));
	recruitLine.TextColor3 = GOLD;
	recruitPic.Visible = false;
	recruitLine.Visible = false;
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
		cardArea.ClearAllChildren();
		const strokes: [string, UIStroke][] = [];
		STARTERS[c].forEach((id, i) => {
			const def = charDef(id);
			if (def === undefined) return;
			// Rare card frame (512×768) in the country colour: portrait in the top window, name and stats below it.
			const card = artCard(cardArea, ART.card_frame_rare, CARD_ASPECT, UDim2.fromScale(0.28, 1), UDim2.fromScale(0.05 + i * 0.317, 0), COUNTRY_COLOR[c]);
			const stroke = new Instance("UIStroke");
			stroke.Color = GOLD;
			stroke.Thickness = 6;
			stroke.Enabled = false;
			stroke.Parent = card;
			const entry: [string, UIStroke] = [id, stroke];
			strokes.push(entry);
			const portrait = portraitFor(id);
			if (portrait !== undefined) picture(card, portrait, UDim2.fromScale(0.68, 0.33), UDim2.fromScale(0.16, 0.13));
			text(card, def.name, UDim2.fromScale(0.5, 0.075), UDim2.fromScale(0.1, 0.46));
			tag(card, ROLE_NAME[def.role], UDim2.fromScale(0.2, 0.05), UDim2.fromScale(0.7, 0.475), PANEL);
			const skill = skillIconFor(id);
			if (skill !== undefined) picture(card, skill, UDim2.fromScale(0.1, 0.06), UDim2.fromScale(0.06, 0.6));
			text(card, `必殺：${def.special.name}`, UDim2.fromScale(0.72, 0.06), UDim2.fromScale(0.2, 0.6));
			STAT_ROWS.forEach((row, r) => {
				const y = 0.685 + r * 0.05;
				text(card, row.label, UDim2.fromScale(0.24, 0.04), UDim2.fromScale(0.06, y));
				const bar = frame(card, UDim2.fromScale(0.6, 0.035), UDim2.fromScale(0.32, y + 0.005), BLACK, 0.3);
				// Solid gold fill under the art fill: the stat value stays visible even if the bar art does not draw.
				frame(bar, UDim2.fromScale(def.stats[row.key] / 10, 1), UDim2.fromScale(0, 0), GOLD, 0);
				barImage(bar, ART.bar_fill, UDim2.fromScale(def.stats[row.key] / 10, 1), UDim2.fromScale(0, 0));
				barImage(bar, ART.bar_frame, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0));
			});
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

	/** Opens the weapon screen. fromMap: opened from the map header (back returns to the map). */
	const showWeapon = (fromMap: boolean): void => {
		weaponFromMap = fromMap;
		pendingWeapon = false;
		const p = profile;
		selectedWeapon = p === undefined ? undefined : p.lordWeapon;
		weaponStatus.Text = "";
		weaponCardArea.ClearAllChildren();
		const strokes: [LordWeapon, UIStroke][] = [];
		WEAPON_CARDS.forEach((w, i) => {
			// Rare card frame in the weapon colour: weapon art in the top window, the text in the panel below.
			const card = artCard(weaponCardArea, ART.card_frame_rare, CARD_ASPECT, UDim2.fromScale(0.28, 1), UDim2.fromScale(0.05 + i * 0.317, 0), w.color);
			const stroke = new Instance("UIStroke");
			stroke.Color = GOLD;
			stroke.Thickness = 6;
			stroke.Enabled = selectedWeapon === w.key;
			stroke.Parent = card;
			strokes.push([w.key, stroke]);
			picture(card, WEAPON_ART[w.key], UDim2.fromScale(0.56, 0.3), UDim2.fromScale(0.22, 0.13));
			text(card, w.name, UDim2.fromScale(0.5, 0.06), UDim2.fromScale(0.1, 0.46));
			text(card, w.feel, UDim2.fromScale(0.8, 0.05), UDim2.fromScale(0.1, 0.53));
			text(card, `普攻：${w.basic}`, UDim2.fromScale(0.8, 0.06), UDim2.fromScale(0.1, 0.6));
			picture(card, SKILL_ICON[`lord_${w.key}`], UDim2.fromScale(0.1, 0.06), UDim2.fromScale(0.04, 0.665));
			const specialLine = text(card, `大招：${w.specialName}`, UDim2.fromScale(0.72, 0.06), UDim2.fromScale(0.2, 0.665));
			specialLine.TextColor3 = GOLD;
			text(card, w.specialEffect, UDim2.fromScale(0.86, 0.14), UDim2.fromScale(0.07, 0.75));
			card.Activated.Connect(() => {
				selectedWeapon = w.key;
				for (const [k, st] of strokes) st.Enabled = k === w.key;
			});
		});
		show(weaponScreen);
		setBgm("menu");
	};

	/** After the weapon is saved: first-time flow goes on to the starter pick, otherwise to the map. */
	const afterWeapon = (): void => {
		pendingWeapon = false;
		const p = profile;
		if (p !== undefined && p.starter === undefined) showStarter();
		else showMap();
	};

	const confirmWeapon = (): void => {
		const w = selectedWeapon;
		if (w === undefined) {
			showToast("先選一把武器吧！");
			return;
		}
		pendingWeapon = true;
		weaponChoice = w;
		weaponAttempt++;
		const attempt = weaponAttempt;
		weaponStatus.Text = "正在收下這把武器……";
		const cmd: Command = { cmd: "chooseWeapon", weapon: w };
		remotes.Command.FireServer(cmd);
		task.delay(STARTER_TIMEOUT_SECONDS, () => {
			if (attempt !== weaponAttempt || !pendingWeapon) return;
			task.spawn(() => {
				// No ProfileChanged in time: ask the server whether the weapon was saved anyway.
				const p = refreshProfile();
				if (attempt !== weaponAttempt || !pendingWeapon) return;
				if (p !== undefined && p.lordWeapon === w) {
					afterWeapon();
					return;
				}
				weaponStatus.Text = "連線逾時，請再按一次「就用這把！」";
			});
		});
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

		// Compact header across the top (back, chapter, weapon, lord panel). The stage labels are all below it.
		const back = bigArt(mapScreen, "blue", "返回主選單", UDim2.fromScale(0.145, 0.07), UDim2.fromScale(0.01, 0.012));
		back.Activated.Connect(() => showMainMenu());
		text(mapScreen, "第一章", UDim2.fromScale(0.07, 0.06), UDim2.fromScale(0.165, 0.02));
		const weaponBtn = bigArt(
			mapScreen,
			"gold",
			`換武器：${p.lordWeapon === undefined ? "未選" : WEAPON_NAME[p.lordWeapon]}`,
			UDim2.fromScale(0.16, 0.07),
			UDim2.fromScale(0.24, 0.012),
		);
		weaponBtn.Activated.Connect(() => showWeapon(true));

		// Lord panel: title and xp on the top row; xp bar and coins on the bottom row.
		const lvPanel = frame(mapScreen, UDim2.fromScale(0.37, 0.08), UDim2.fromScale(0.62, 0.012), BLACK, 0.3);
		rounded(lvPanel, 0.1);
		text(lvPanel, lordTitle(p), UDim2.fromScale(0.5, 0.4), UDim2.fromScale(0.02, 0.06));
		text(
			lvPanel,
			p.lordLevel >= LORD_MAX_LEVEL ? "已滿級" : `經驗 ${p.lordXp} / ${needFor(p.lordLevel)}`,
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

	/** Name and lines go right of the portrait oval; with no portrait (narration) they shift left, so no empty oval is left beside them. */
	const placeDialogueText = (hasPortrait: boolean): void => {
		const left = hasPortrait ? 0.33 : 0.12;
		const width = 0.78 - left;
		speakerLabel.Position = UDim2.fromScale(left, 0.24);
		speakerLabel.Size = UDim2.fromScale(width, 0.13);
		lineLabel.Position = UDim2.fromScale(left, 0.4);
		lineLabel.Size = UDim2.fromScale(width, 0.36);
	};

	const openDialogue = (stage: StageDef): void => {
		hud.clearMatchUi();
		dialogueStage = stage;
		dialogueIndex = 0;
		dialogueTitle.Text = stage.title;
		speakerLabel.Text = stage.bossCharId !== undefined ? nameOf(stage.bossCharId) : "旁白";
		// The speaker's portrait in the box's left slot; narration (no speaker) shows none.
		const speakerArt = stage.bossCharId === undefined ? undefined : portraitFor(stage.bossCharId);
		speakerPortrait.Image = speakerArt ?? "";
		speakerPortrait.Visible = speakerArt !== undefined;
		placeDialogueText(speakerArt !== undefined);
		lineLabel.Text = stage.intro[0];
		setBgm("menu");
		show(dialogueScreen);
	};

	const advanceDialogue = (): void => {
		const stage = dialogueStage;
		if (stage === undefined) return;
		dialogueIndex++;
		if (dialogueIndex >= stage.intro.size()) {
			startStoryMatch();
			return;
		}
		lineLabel.Text = stage.intro[dialogueIndex];
	};

	const startStoryMatch = (): void => {
		const stage = dialogueStage;
		if (stage === undefined) return;
		dialogueStage = undefined;
		const p = profile;
		matchLevel = p === undefined ? 1 : p.lordLevel;
		matchXp = p === undefined ? 0 : p.lordXp;
		show(undefined);
		hud.clearMatchUi();
		const cmd: Command = { cmd: "story", stageId: stage.id };
		remotes.Command.FireServer(cmd);
	};

	const tweenBar = (fraction: number, seconds: number): void => {
		if (barTween !== undefined) barTween.Cancel();
		barTween = TweenService.Create(barFill, new TweenInfo(seconds), { Size: UDim2.fromScale(fraction, 1) });
		barTween.Play();
	};

	const showResult = (r: StoryResult): void => {
		resultToken++;
		const token = resultToken;
		resultStageId = r.stageId;
		const p = profile;
		const stages: StageDef[] =
			p !== undefined && p.country !== undefined && p.starter !== undefined ? getStages(p.country, p.starter) : [];
		const stage: StageDef | undefined = stages.find((st) => st.id === r.stageId);

		resultPic.Image = r.won ? ART.title_victory : ART.title_defeat;
		resultPic.Visible = !r.chapterClear;
		chapterPic.Visible = r.chapterClear;
		const recruited = r.recruited;
		recruitPic.Visible = recruited !== undefined;
		recruitLine.Visible = recruited !== undefined;
		if (recruited !== undefined) {
			const line = stage === undefined || stage.recruitLine === undefined ? "" : stage.recruitLine;
			recruitPortrait.Image = portraitFor(recruited) ?? "";
			recruitLine.Text = `收服 ${nameOf(recruited)}！${line}`;
		}
		const levelUp = r.levelAfter > r.levelBefore;
		lvFlash.Text = `Lv ${r.levelAfter}`;
		lvFlash.Visible = false;
		lvPic.Visible = false;
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
			// Carry-over xp at the final level: the total minus the thresholds of every level gained.
			let carry = startXp + r.xp;
			for (let lv = r.levelBefore; lv < r.levelAfter; lv++) carry -= needFor(lv);
			if (levelUp) {
				tweenBar(1, 0.5);
				task.wait(0.6);
				if (token !== resultToken) return;
				lvPic.Visible = true;
				lvFlash.Visible = true;
				resultBar.tint(WHITE);
				task.wait(0.15);
				if (token !== resultToken) return;
				resultBar.tint(GOLD);
				barFill.Size = UDim2.fromScale(0, 1);
				task.wait(0.2);
				if (token !== resultToken) return;
			}
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
		if (p.country === undefined || p.starter === undefined) showIntro();
		else if (p.lordWeapon === undefined) showWeapon(false);
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
		if (pendingWeapon && weaponChoice !== undefined && updated.lordWeapon === weaponChoice) afterWeapon();
		if (pendingStarter && updated.starter !== undefined) goToTutorialAfterStarter();
	});
	remotes.StoryResult.OnClientEvent.Connect((r: unknown) => {
		showResult(r as StoryResult);
	});
	// A new match starting: drop every story overlay (and any pending result animation) so nothing stale stays on top.
	remotes.Setup.OnClientEvent.Connect(() => {
		resultToken++;
		toastToken++;
		dialogueStage = undefined;
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
