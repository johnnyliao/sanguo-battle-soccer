import type { Command, Country, Remotes, Setup, SnapPk, Snapshot } from "../shared/net";
import { TICK_RATE } from "../shared/net";
import { TUTORIAL_STAGE_ID } from "../shared/story";
import { setInputEnabled } from "./input";
import { openShowroom } from "./showroom";
import { setBgm } from "./bgm";
import { ART } from "./artIds";
import { artCard, picture } from "./artUi";

const Players = game.GetService("Players");
const UserInputService = game.GetService("UserInputService");

export const COUNTRY_NAME: Record<Country, string> = { shu: "蜀", wei: "魏", wu: "吳" };
export const COUNTRY_COLOR: Record<Country, Color3> = {
	shu: Color3.fromRGB(0x2f, 0xa8, 0x4f),
	wei: Color3.fromRGB(0x2f, 0x6f, 0xd8),
	wu: Color3.fromRGB(0xd8, 0x3a, 0x2f),
};
/** Country banner art (512×1024) for the country select cards. */
export const COUNTRY_BANNER: Record<Country, string> = { shu: ART.banner_shu, wei: ART.banner_wei, wu: ART.banner_wu };
const GENERALS: Record<Country, string> = {
	shu: "張飛\n關羽\n諸葛亮\n馬超\n趙雲",
	wei: "許褚\n曹操\n甄姬\n司馬懿\n張遼",
	wu: "孫權\n大喬\n周瑜\n小喬\n孫策",
};
const COUNTRIES: Country[] = ["shu", "wei", "wu"];

export const WHITE = Color3.fromRGB(255, 255, 255);
export const BLACK = Color3.fromRGB(0, 0, 0);
export const GOLD = Color3.fromRGB(255, 217, 138);
export const GREY = Color3.fromRGB(90, 90, 90);
const BANNER_SECONDS = 2;

export function frame(parent: Instance, size: UDim2, pos: UDim2, color: Color3, transparency: number): Frame {
	const f = new Instance("Frame");
	f.Size = size;
	f.Position = pos;
	f.BackgroundColor3 = color;
	f.BackgroundTransparency = transparency;
	f.BorderSizePixel = 0;
	f.Parent = parent;
	return f;
}

/** Scaled text label: the box size controls the font size. */
export function text(parent: Instance, content: string, size: UDim2, pos: UDim2, anchor?: Vector2): TextLabel {
	const t = new Instance("TextLabel");
	t.BackgroundTransparency = 1;
	t.Size = size;
	t.Position = pos;
	if (anchor !== undefined) t.AnchorPoint = anchor;
	t.Font = Enum.Font.GothamBold;
	t.Text = content;
	t.TextColor3 = WHITE;
	t.TextScaled = true;
	t.TextStrokeTransparency = 0.2;
	t.TextStrokeColor3 = BLACK;
	t.Parent = parent;
	return t;
}

export function button(parent: Instance, content: string, size: UDim2, pos: UDim2, color: Color3): TextButton {
	const b = new Instance("TextButton");
	b.Size = size;
	b.Position = pos;
	b.BackgroundColor3 = color;
	b.BackgroundTransparency = 0.15;
	b.BorderSizePixel = 0;
	b.Text = content;
	b.Font = Enum.Font.GothamBold;
	b.TextColor3 = WHITE;
	b.TextScaled = true;
	const corner = new Instance("UICorner");
	corner.CornerRadius = new UDim(0.12, 0);
	corner.Parent = b;
	b.Parent = parent;
	return b;
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
}

/**
 * HUD for the match: top scoreboard and clock, centre phase banners, the PK panel, the fulltime panel with rematch /
 * change-country buttons, the country select screen, and the keyboard hint. Menus call setInputEnabled.
 */
export function createHud(
	remotes: Remotes,
	onMatchUi: (on: boolean) => void,
	onBackToMenu: () => void,
): {
	onSetup(s: Setup): void;
	onSnapshot(s: Snapshot): void;
	showCountrySelect(): void;
	clearMatchUi(): void;
} {
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "HudGui";
	gui.IgnoreGuiInset = true;
	gui.ResetOnSpawn = false;
	gui.DisplayOrder = 10;
	gui.Parent = playerGui;

	// Top scoreboard: home name, score, away name; the clock / status is a pill under the plate.
	const top = picture(gui, ART.hud_scoreboard, UDim2.fromScale(0.44, 0.17), UDim2.fromScale(0.5, 0.01));
	top.AnchorPoint = new Vector2(0.5, 0);
	// Art ratio 1024:192 (height follows the width); the team colours go on the names, the board stays neutral.
	const topRatio = new Instance("UIAspectRatioConstraint");
	topRatio.AspectRatio = 1024 / 192;
	topRatio.DominantAxis = Enum.DominantAxis.Width;
	topRatio.Parent = top;
	top.Visible = false;
	const homeName = text(top, "", UDim2.fromScale(0.2, 0.45), UDim2.fromScale(0.02, 0.05));
	const scoreLabel = text(top, "0 - 0", UDim2.fromScale(0.48, 0.55), UDim2.fromScale(0.26, 0.02));
	const awayName = text(top, "", UDim2.fromScale(0.2, 0.45), UDim2.fromScale(0.78, 0.05));
	// Team names: inset from the plate edges and capped in size so 黃巾軍 and the like stay inside the plate.
	for (const nameLabel of [homeName, awayName]) {
		const pad = new Instance("UIPadding");
		pad.PaddingLeft = new UDim(0.08, 0);
		pad.PaddingRight = new UDim(0.08, 0);
		pad.Parent = nameLabel;
		const cap = new Instance("UITextSizeConstraint");
		cap.MaxTextSize = 40;
		cap.Parent = nameLabel;
	}
	// Match status (clock, 先得 N 分獲勝, PK, 教學): a small pill just below the plate, not on its ornaments.
	const clockPill = frame(top, UDim2.fromScale(0.5, 0.22), UDim2.fromScale(0.5, 1.06), BLACK, 0.25);
	clockPill.AnchorPoint = new Vector2(0.5, 0);
	const clockCorner = new Instance("UICorner");
	clockCorner.CornerRadius = new UDim(0.5, 0);
	clockCorner.Parent = clockPill;
	const clockLabel = text(clockPill, "", UDim2.fromScale(0.9, 0.7), UDim2.fromScale(0.05, 0.15));

	// Centre banner on phase changes and goals.
	const banner = text(gui, "", UDim2.fromScale(0.6, 0.14), UDim2.fromScale(0.5, 0.42), new Vector2(0.5, 0.5));
	banner.Visible = false;
	banner.TextStrokeTransparency = 0;

	// Penalty shootout panel.
	const pkPanel = frame(gui, UDim2.fromScale(0.5, 0.2), UDim2.fromScale(0.5, 0.22), BLACK, 0.35);
	pkPanel.AnchorPoint = new Vector2(0.5, 0);
	pkPanel.Visible = false;
	const pkStage = text(pkPanel, "", UDim2.fromScale(0.96, 0.4), UDim2.fromScale(0.02, 0.03));
	const meterBack = frame(pkPanel, UDim2.fromScale(0.8, 0.14), UDim2.fromScale(0.1, 0.46), GREY, 0.2);
	const meterFill = frame(meterBack, UDim2.fromScale(0, 1), UDim2.fromScale(0, 0), GOLD, 0);
	const pkScore = text(pkPanel, "", UDim2.fromScale(0.96, 0.3), UDim2.fromScale(0.02, 0.66));

	// Fulltime panel.
	const fulltime = frame(gui, UDim2.fromScale(0.52, 0.56), UDim2.fromScale(0.5, 0.5), BLACK, 0.2);
	fulltime.AnchorPoint = new Vector2(0.5, 0.5);
	fulltime.Visible = false;
	text(fulltime, "比賽結束", UDim2.fromScale(0.96, 0.2), UDim2.fromScale(0.02, 0.03));
	const finalScore = text(fulltime, "", UDim2.fromScale(0.96, 0.2), UDim2.fromScale(0.02, 0.25));
	const rematchBtn = button(fulltime, "再來一場", UDim2.fromScale(0.42, 0.3), UDim2.fromScale(0.04, 0.55), GOLD);
	const changeBtn = button(fulltime, "換國家", UDim2.fromScale(0.42, 0.3), UDim2.fromScale(0.54, 0.55), GREY);

	// Keyboard hint, non-touch devices only.
	const hint = text(
		gui,
		"WASD 移動（雙擊衝刺）  J 攻擊/射門  K 傳球/叫球  L 大招",
		UDim2.fromScale(0.9, 0.05),
		UDim2.fromScale(0.5, 0.98),
		new Vector2(0.5, 1),
	);
	hint.Visible = false;

	let setup: Setup | undefined;
	let lastCountry: Country = "shu";
	// Snapshots are ignored while a menu is open or a new match is being started (until the next Setup).
	let ignoreSnaps = true;
	let prevPhase = "";
	let bannerToken = 0;

	const showBanner = (message: string): void => {
		bannerToken++;
		const my = bannerToken;
		banner.Text = message;
		banner.Visible = true;
		task.delay(BANNER_SECONDS, () => {
			if (my === bannerToken) banner.Visible = false;
		});
	};

	const nameOf = (idx: number): string => {
		if (setup === undefined) return "";
		const p = setup.players.find((sp) => sp.idx === idx);
		return p === undefined ? "" : p.name;
	};

	const goalMessage = (s: Snapshot): string => {
		for (const e of s.events) {
			if (e.type === "goal") {
				const name = nameOf(e.scorerIdx as number);
				return name === "" ? "進球！" : `進球！ ${name}`;
			}
		}
		return "進球！";
	};

	const updateTop = (s: Snapshot): void => {
		scoreLabel.Text = `${s.score[0]} - ${s.score[1]}`;
		if (s.phase === "pk") {
			clockLabel.Text = "PK 大戰";
			return;
		}
		if (setup !== undefined && setup.mode === "story" && setup.stageId === TUTORIAL_STAGE_ID) {
			clockLabel.Text = "教學";
			return;
		}
		if (setup !== undefined && setup.goalTarget !== undefined) {
			clockLabel.Text = `先得 ${setup.goalTarget} 分獲勝`;
			return;
		}
		const secs = math.floor(s.clockTicks / TICK_RATE);
		const half = s.half >= 2 ? "下半場" : "上半場";
		clockLabel.Text = `${half} ${pad2(math.floor(secs / 60))}:${pad2(secs % 60)}`;
	};

	const updatePk = (pk: SnapPk | undefined): void => {
		const live = pk !== undefined && pk.stage !== "done";
		pkPanel.Visible = live;
		if (pk === undefined || !live) return;

		const humanIdx = setup === undefined ? -1 : setup.humanIdx;
		const shooterHuman = pk.shooterIdx === humanIdx;
		const keeperHuman = pk.keeperIdx === humanIdx;
		const touchDevice = UserInputService.TouchEnabled;
		let msg = "";
		if (pk.stage === "aim") {
			if (shooterHuman) {
				msg = touchDevice
					? "按住攻擊鈕集力，放開射門；搖桿瞄準，按住傳球鈕射高"
					: "按住 J 集力，放開 J 射門；W/S 瞄準，按住 K 射高";
			} else if (keeperHuman) {
				msg = touchDevice ? "搖桿上下猜方向，按住傳球鈕猜高" : "按 W/S 猜方向，按住 K 猜高";
			} else {
				msg = `${nameOf(pk.shooterIdx)} 罰球中…`;
			}
		} else if (pk.stage === "order") {
			msg = "準備中…";
		} else if (pk.stage === "flight") {
			msg = "射門！";
		} else if (pk.stage === "result") {
			msg = pk.outcome === "goal" ? "進球！" : pk.outcome === "save" ? "撲救！" : pk.outcome === "miss" ? "射偏！" : "";
		}
		pkStage.Text = msg;
		meterBack.Visible = shooterHuman && pk.stage === "aim";
		meterFill.Size = UDim2.fromScale(pk.meter >= 0 ? math.clamp(pk.meter, 0, 1) : 0, 1);
		pkScore.Text = `PK  ${pk.score[0]} - ${pk.score[1]}`;
	};

	const onPhase = (s: Snapshot): void => {
		if (s.phase === "kickoff") showBanner("開球!");
		else if (s.phase === "goal") showBanner(goalMessage(s));
		else if (s.phase === "halftime") showBanner("中場休息");
		else if (s.phase === "pk") showBanner("PK 大戰");
	};

	// Country select (declared before the handlers that reference it; drawn above the other panels).
	const countrySelect = frame(gui, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), BLACK, 0.25);
	text(countrySelect, "三國戰鬥足球", UDim2.fromScale(0.8, 0.14), UDim2.fromScale(0.1, 0.04));
	// Hidden until the story menu's 快速比賽 button opens it.
	countrySelect.Visible = false;

	const startMatch = (country: Country): void => {
		lastCountry = country;
		ignoreSnaps = true;
		fulltime.Visible = false;
		countrySelect.Visible = false;
		setInputEnabled(false);
		const cmd: Command = { cmd: "start", country };
		remotes.Command.FireServer(cmd);
	};

	const changeCountry = (): void => {
		ignoreSnaps = true;
		fulltime.Visible = false;
		top.Visible = false;
		hint.Visible = false;
		countrySelect.Visible = true;
		setInputEnabled(false);
		onMatchUi(false);
		setBgm("menu");
	};

	// Hides the match panels and blocks snapshots until the next Setup (story mode takes over the menus).
	const clearMatchUi = (): void => {
		ignoreSnaps = true;
		fulltime.Visible = false;
		top.Visible = false;
		hint.Visible = false;
		countrySelect.Visible = false;
		setInputEnabled(false);
		onMatchUi(false);
	};

	COUNTRIES.forEach((c, i) => {
		// Banner card (1:2), centred in its slot.
		const b = artCard(countrySelect, COUNTRY_BANNER[c], 0.5, UDim2.fromScale(0.28, 0.52), UDim2.fromScale(0.05 + i * 0.317 + 0.14, 0.22));
		b.AnchorPoint = new Vector2(0.5, 0);
		text(b, COUNTRY_NAME[c], UDim2.fromScale(0.7, 0.12), UDim2.fromScale(0.15, 0.36));
		text(b, GENERALS[c], UDim2.fromScale(0.7, 0.2), UDim2.fromScale(0.15, 0.5));
		b.Activated.Connect(() => {
			startMatch(c);
		});
	});
	text(countrySelect, "你操控前鋒", UDim2.fromScale(0.8, 0.08), UDim2.fromScale(0.1, 0.84));
	const showroomBtn = button(countrySelect, "武將展示", UDim2.fromScale(0.3, 0.06), UDim2.fromScale(0.35, 0.755), GREY);
	showroomBtn.Activated.Connect(() => {
		openShowroom();
	});
	const backBtn = button(countrySelect, "返回", UDim2.fromScale(0.16, 0.09), UDim2.fromScale(0.02, 0.89), GREY);
	const backMin = new Instance("UISizeConstraint");
	backMin.MinSize = new Vector2(60, 60);
	backMin.Parent = backBtn;
	backBtn.Activated.Connect(() => {
		countrySelect.Visible = false;
		onBackToMenu();
	});
	setInputEnabled(false);
	setBgm("menu");

	rematchBtn.Activated.Connect(() => {
		startMatch(lastCountry);
	});
	changeBtn.Activated.Connect(() => {
		changeCountry();
	});

	const onSetup = (s: Setup): void => {
		setup = s;
		ignoreSnaps = false;
		prevPhase = "";
		countrySelect.Visible = false;
		fulltime.Visible = false;
		pkPanel.Visible = false;
		top.Visible = true;
		onMatchUi(true);
		homeName.Text = COUNTRY_NAME[s.home];
		homeName.TextColor3 = COUNTRY_COLOR[s.home];
		awayName.Text = s.awayLabel;
		awayName.TextColor3 = COUNTRY_COLOR[s.away];
		hint.Visible = !UserInputService.TouchEnabled;
		setInputEnabled(true);
		setBgm("match");
	};

	const onSnapshot = (s: Snapshot): void => {
		if (ignoreSnaps) return;
		updateTop(s);
		if (s.phase !== prevPhase) {
			prevPhase = s.phase;
			onPhase(s);
			if (s.phase === "pk") setBgm("pk");
			else if (s.phase === "fulltime") {
				// Victory jingle only when the human's team won (regulation score, then PK score); otherwise fade out.
				const myTeam = setup !== undefined && setup.humanIdx >= setup.players.size() / 2 ? 1 : 0;
				const sc = s.score[0] !== s.score[1] || s.pk === undefined ? s.score : s.pk.score;
				const won = sc[myTeam] > sc[1 - myTeam];
				setBgm(won ? "victory" : "none");
			}
		}
		updatePk(s.pk);
		const over = s.phase === "fulltime";
		// Story stages show the result screen (storyUi.ts) instead of this panel.
		fulltime.Visible = over && !(setup !== undefined && setup.mode === "story");
		if (over) {
			onMatchUi(false);
			finalScore.Text = `${s.score[0]} - ${s.score[1]}` + (s.pk !== undefined ? `   PK ${s.pk.score[0]} - ${s.pk.score[1]}` : "");
			setInputEnabled(false);
		}
	};

	return {
		onSetup(s: Setup) {
			onSetup(s);
		},
		onSnapshot(s: Snapshot) {
			onSnapshot(s);
		},
		showCountrySelect() {
			changeCountry();
		},
		clearMatchUi() {
			clearMatchUi();
		},
	};
}
