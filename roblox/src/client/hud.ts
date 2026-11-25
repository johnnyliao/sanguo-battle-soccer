import type { Command, Country, Remotes, Setup, SnapPk, Snapshot } from "../shared/net";
import { TICK_RATE } from "../shared/net";
import { setInputEnabled, setPkMode } from "./input";
import { openShowroom } from "./showroom";

const Players = game.GetService("Players");
const UserInputService = game.GetService("UserInputService");

const COUNTRY_NAME: Record<Country, string> = { shu: "蜀", wei: "魏", wu: "吳" };
const COUNTRY_COLOR: Record<Country, Color3> = {
	shu: Color3.fromRGB(0x2f, 0xa8, 0x4f),
	wei: Color3.fromRGB(0x2f, 0x6f, 0xd8),
	wu: Color3.fromRGB(0xd8, 0x3a, 0x2f),
};
const GENERALS: Record<Country, string> = {
	shu: "張飛\n關羽\n諸葛亮\n馬超\n趙雲",
	wei: "許褚\n曹操\n甄姬\n司馬懿\n張遼",
	wu: "孫權\n大喬\n周瑜\n小喬\n孫策",
};
const COUNTRIES: Country[] = ["shu", "wei", "wu"];

const WHITE = Color3.fromRGB(255, 255, 255);
const BLACK = Color3.fromRGB(0, 0, 0);
const GOLD = Color3.fromRGB(255, 217, 138);
const GREY = Color3.fromRGB(90, 90, 90);
const BANNER_SECONDS = 2;

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

/** Scaled text label: the box size controls the font size. */
function text(parent: Instance, content: string, size: UDim2, pos: UDim2, anchor?: Vector2): TextLabel {
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

function button(parent: Instance, content: string, size: UDim2, pos: UDim2, color: Color3): TextButton {
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
	onSpecialState: (cooldown: number, reason: string) => void,
): { onSetup(s: Setup): void; onSnapshot(s: Snapshot): void } {
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "HudGui";
	gui.IgnoreGuiInset = true;
	gui.ResetOnSpawn = false;
	gui.DisplayOrder = 10;
	gui.Parent = playerGui;

	// Top scoreboard: home name, score, away name, then half and clock below.
	const top = frame(gui, UDim2.fromScale(0.44, 0.17), UDim2.fromScale(0.5, 0.01), BLACK, 0.4);
	top.AnchorPoint = new Vector2(0.5, 0);
	top.Visible = false;
	const homeName = text(top, "", UDim2.fromScale(0.2, 0.45), UDim2.fromScale(0.02, 0.05));
	const scoreLabel = text(top, "0 - 0", UDim2.fromScale(0.48, 0.55), UDim2.fromScale(0.26, 0.02));
	const awayName = text(top, "", UDim2.fromScale(0.2, 0.45), UDim2.fromScale(0.78, 0.05));
	const clockLabel = text(top, "", UDim2.fromScale(0.6, 0.35), UDim2.fromScale(0.2, 0.6));

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
		const secs = math.floor(s.clockTicks / TICK_RATE);
		const half = s.half >= 2 ? "下半場" : "上半場";
		clockLabel.Text = `${half} ${pad2(math.floor(secs / 60))}:${pad2(secs % 60)}`;
	};

	const updatePk = (pk: SnapPk | undefined): void => {
		const live = pk !== undefined && pk.stage !== "done";
		setPkMode(live);
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
	};

	COUNTRIES.forEach((c, i) => {
		const b = button(countrySelect, "", UDim2.fromScale(0.28, 0.52), UDim2.fromScale(0.05 + i * 0.317, 0.22), COUNTRY_COLOR[c]);
		text(b, COUNTRY_NAME[c], UDim2.fromScale(0.92, 0.2), UDim2.fromScale(0.04, 0.02));
		text(b, GENERALS[c], UDim2.fromScale(0.84, 0.7), UDim2.fromScale(0.08, 0.27));
		b.Activated.Connect(() => {
			startMatch(c);
		});
	});
	text(countrySelect, "你操控前鋒", UDim2.fromScale(0.8, 0.08), UDim2.fromScale(0.1, 0.84));
	const showroomBtn = button(countrySelect, "武將展示", UDim2.fromScale(0.3, 0.06), UDim2.fromScale(0.35, 0.755), GREY);
	showroomBtn.Activated.Connect(() => {
		openShowroom();
	});
	setInputEnabled(false);

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
		setPkMode(false);
		top.Visible = true;
		homeName.Text = COUNTRY_NAME[s.home];
		homeName.TextColor3 = COUNTRY_COLOR[s.home];
		awayName.Text = COUNTRY_NAME[s.away];
		awayName.TextColor3 = COUNTRY_COLOR[s.away];
		hint.Visible = !UserInputService.TouchEnabled;
		setInputEnabled(true);
	};

	const onSnapshot = (s: Snapshot): void => {
		if (ignoreSnaps) return;
		onSpecialState(s.cooldown, s.blockReason);
		updateTop(s);
		if (s.phase !== prevPhase) {
			prevPhase = s.phase;
			onPhase(s);
		}
		updatePk(s.pk);
		const over = s.phase === "fulltime";
		fulltime.Visible = over;
		if (over) {
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
	};
}
