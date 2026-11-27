// Story tutorial overlay (stage 0) and the first 2v2 pass hint (stage 4). The server decides the tutorial steps (Tutorial
// remote, from the match itself). This file draws the mentor panel (the starter general in 3D with typewriter lines), the
// step checklist, the top banner, the stamp and confetti, the in-world highlights and the screen arrow. Ball, enemy and
// goal positions are sim coordinates converted with simToWorld (net.ts). The button highlight lives in actionBar.ts.
import type { Remotes, Setup, SnapPlayer, Snapshot, TutorialStep } from "shared/net";
import { simToWorld, STUDS_PER_PX } from "shared/net";
import { getProfileRemotes, type Profile } from "shared/profileTypes";
import { clearedKey, nameOf, TUTORIAL_STAGE_ID } from "shared/story";
import { CHAR_ANIMS } from "./animIds";
import { actionBarTopPx, highlightButton, type HighlightTarget, WEAPON_SPECIAL } from "./actionBar";
import { getAvatarTemplate } from "./avatars";
import { ART, portraitFor } from "./artIds";
import { picture } from "./artUi";
import { BLACK, frame, GOLD, text, WHITE } from "./hud";
import { play } from "./sfx";

const Players = game.GetService("Players");
const RunService = game.GetService("RunService");
const TweenService = game.GetService("TweenService");
const UserInputService = game.GetService("UserInputService");
const Workspace = game.GetService("Workspace");

const PASS_HINT_STAGE_ID = 4;
const PASS_HINT_SECONDS = 7;
/** Checklist rows = tutorial steps 1..6. Step 7 means every row is done (the celebration). */
const CHECK_ROWS = 6;
const LAST_STEP = 7;
const CHECK_LABELS = ["移動", "射門", "普攻", "大招", "搶球", "實戰"];
const CHECK_SOUND = "zhugeliang_hit";
const STEP_DONE_SECONDS = 0.9;
/** A step that lasts this long gets a stronger mentor hint and a faster highlight pulse. */
const HINT_AFTER_SECONDS = 45;
/** Seconds per character of the mentor's typewriter line. */
const TYPE_SECONDS = 0.04;
const BANNER_TOP = 0.2;
const ARROW_PX = 40;
/** Gap in px between a target on screen and the arrow tip above it. */
const ARROW_GAP = 30;
const EDGE_PX = 24;
const TOP_BAND_PX = 140;
const BOTTOM_BAND_PX = 60;
const BOTTOM_BAND_TOUCH_PX = 180;
/** Sim height of the goal-mouth target (10 sim px = 2 studs). */
const GOAL_TARGET_Z = 10;
/** Sim sizes of the in-world highlights. */
const BALL_RING_PX = 22;
const ENEMY_RING_PX = 34;
const GOAL_FRAME_PX = 16;
const GOAL_POST_STUDS = 0.6;
const CONFETTI_COUNT = 36;
const RING_HEIGHT_STUDS = 0.3;
const MENTOR_FOV = 30;
const MENTOR_FRAME_DISTANCE = 2.2;
/** Touch devices: the mentor panel is shrunk and moved to the upper left, away from the touch joystick (lower left). */
const MENTOR_TOUCH_SCALE = 0.6;
const MENTOR_TOUCH_TOP = 0.36;
/** Step checklist: panel size (px at full scale), margin from the right edge, gap to the action bar / scoreboard, min scale. */
const CHECK_PANEL_W = 190;
const CHECK_PANEL_H = 262;
const CHECK_MARGIN = 12;
const CHECK_GAP = 8;
const CHECK_MIN_SCALE = 0.5;
/** The scoreboard row (hud.ts) spans x 28%..72% of the width and ends at 18% of the height. */
const SCOREBOARD_RIGHT = 0.72;
const SCOREBOARD_BOTTOM = 0.18;
const CARD = Color3.fromRGB(40, 40, 52);
const CREAM = Color3.fromRGB(255, 246, 225);
const INK = Color3.fromRGB(40, 30, 20);
const RED = Color3.fromRGB(230, 50, 50);
const CONFETTI_COLORS: Color3[] = [GOLD, Color3.fromRGB(230, 80, 70), Color3.fromRGB(80, 160, 240), Color3.fromRGB(90, 200, 110), WHITE];

/** The mentor's line when each step begins (index = step - 1). Step 4 gets the special's name appended. */
const MENTOR_LINES: string[] = [
	"主公！球就在前面，先走過去吧！",
	"帶球到右邊的球門，用力射門！",
	"那個黃巾兵站著發呆，過去打他一下！",
	"好身手！現在放出你的大招看看！",
	"他來搶球了！靠近他用攻擊把球搶回來！",
	"最後再進一球，讓天下見識你的實力！",
	"太厲害了，主公！你已經是合格的主公了！",
];

function corner(parent: GuiObject, radius: number): void {
	const c = new Instance("UICorner");
	c.CornerRadius = new UDim(radius, 0);
	c.Parent = parent;
}

/**
 * Places the step checklist clear of the action bar (read from its real button rects): the top-right corner, or just below
 * the scoreboard row when the corner would sit beside it. Scaled down (not below CHECK_MIN_SCALE) when the bar leaves too
 * little height for it.
 */
function layoutChecklist(panel: Frame, scale: UIScale, size: Vector2): void {
	const barTop = actionBarTopPx(size);
	const fit = (top: number): number => math.clamp((barTop - CHECK_GAP - top) / CHECK_PANEL_H, CHECK_MIN_SCALE, 1);
	let top = CHECK_GAP;
	let k = fit(top);
	if (size.X - CHECK_MARGIN - CHECK_PANEL_W * k < size.X * SCOREBOARD_RIGHT + CHECK_GAP) {
		top = size.Y * SCOREBOARD_BOTTOM + CHECK_GAP;
		k = fit(top);
	}
	scale.Scale = k;
	panel.Position = new UDim2(1, -CHECK_MARGIN, 0, top);
}

/** Banner copy for a tutorial step: headline and hint line. Touch players get the on-screen button wording. */
function stepCopy(step: number, touch: boolean, special: string): [string, string] {
	if (step === 1) return ["移動：走到球旁邊", touch ? "用左邊搖桿移動" : "WASD 移動"];
	if (step === 2) return ["射門：帶球射進右邊球門", touch ? "按攻擊鍵射門" : "按 J 射門（按住可以集氣）"];
	if (step === 3) return ["普攻：打倒黃巾兵", touch ? "靠近他按攻擊鍵" : "靠近他按 J 攻擊"];
	if (step === 4) return ["大招：放出你的大招", touch ? `按大招鍵：${special}` : `按 L：${special}`];
	if (step === 5) return ["搶球：把球搶回來", touch ? "靠近球按攻擊鍵搶球" : "靠近球按 J 搶球"];
	if (step === 6) return ["實戰：再進一球", touch ? "帶球衝向球門，按攻擊鍵射門" : "帶球衝向球門，按 J 射門"];
	return ["教學完成！", ""];
}

/** The mentor's line for a step; strong = the stronger hint after a long step. */
function mentorLine(step: number, special: string, strong: boolean, touch: boolean): string {
	if (step === 4) {
		if (strong) return touch ? "按大招鍵就能放大招喔！" : "按 L 就能放大招喔！";
		return `${MENTOR_LINES[3]}（${special}）`;
	}
	if (strong) {
		if (step === 1) return "慢慢來！看到發亮的球了嗎？朝它跑過去！";
		if (step === 2) return "看到右邊發亮的球門了嗎？帶球衝過去，用力射門！";
		if (step === 3) return "紅圈裡的黃巾兵就是目標，靠近他按攻擊！";
		if (step === 5) return "看到發亮的球了嗎？靠近它，攻擊把球搶回來！";
		if (step === 6) return "衝向發亮的球門，再射一次門！";
	}
	if (step >= 1 && step <= LAST_STEP) return MENTOR_LINES[step - 1];
	return "";
}

/** What the world highlight marks in a step: the ball, the opponent goal mouth or the enemy. */
type WorldMark = "ball" | "goal" | "enemy";

function worldMarkOf(step: number): WorldMark | undefined {
	if (step === 1 || step === 5) return "ball";
	if (step === 2 || step === 6) return "goal";
	if (step === 3 || step === 4) return "enemy";
	return undefined;
}

function buttonOf(step: number): HighlightTarget | undefined {
	if (step === 4) return "special";
	if (step === 2 || step === 3 || step === 5 || step === 6) return "attack";
	return undefined;
}

/** Plays an idle track on a mentor model; undefined when there is no id or the load fails. */
function playIdle(animator: Animator | undefined, id: string | undefined): AnimationTrack | undefined {
	if (animator === undefined || id === undefined) return undefined;
	const a: Animator = animator;
	const anim = new Instance("Animation");
	anim.AnimationId = id;
	const [ok, track] = pcall(() => {
		return a.LoadAnimation(anim);
	});
	if (!ok || track === undefined) return undefined;
	track.Looped = true;
	track.Priority = Enum.AnimationPriority.Idle;
	track.Play();
	return track;
}

/** One checklist row: the box, the gold check (hidden until done) and its pop scale. */
interface Row {
	frame: Frame;
	label: TextLabel;
	mark: Frame;
	markScale: UIScale;
}

export function createTutorialUi(remotes: Remotes): void {
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "TutorialGui";
	gui.IgnoreGuiInset = true;
	gui.ResetOnSpawn = false;
	gui.DisplayOrder = 15; // above the HUD (10), below the touch controls and the story screens (20)
	gui.Parent = playerGui;

	const profileRemotes = getProfileRemotes();
	const touchDevice = UserInputService.TouchEnabled && !UserInputService.KeyboardEnabled;

	// ---------- top banner: headline + hint line, gold outline ----------
	const banner = frame(gui, UDim2.fromScale(0.6, 0.15), UDim2.fromScale(0.5, BANNER_TOP), BLACK, 0.4);
	banner.AnchorPoint = new Vector2(0.5, 0);
	banner.Visible = false;
	corner(banner, 0.12);
	const accent = new Instance("UIStroke");
	accent.Color = GOLD;
	accent.Thickness = 3;
	accent.Parent = banner;
	const bannerScale = new Instance("UIScale");
	bannerScale.Parent = banner;
	const headline = text(banner, "", UDim2.fromScale(0.94, 0.58), UDim2.fromScale(0.03, 0.06));
	headline.TextStrokeTransparency = 0;
	const hintLine = text(banner, "", UDim2.fromScale(0.94, 0.3), UDim2.fromScale(0.03, 0.66));
	hintLine.TextColor3 = GOLD;
	hintLine.TextStrokeTransparency = 0;

	// ---------- big stamp for a finished step ----------
	const stamp = text(gui, "完成！", UDim2.fromScale(0.7, 0.2), UDim2.fromScale(0.5, 0.42), new Vector2(0.5, 0.5));
	stamp.TextColor3 = GOLD;
	stamp.TextStrokeTransparency = 0;
	stamp.Visible = false;
	const stampScale = new Instance("UIScale");
	stampScale.Parent = stamp;

	// ---------- step-1 control hint (keys on a PC, touch on a phone), shown during step 1 only ----------
	const controlHint = picture(gui, touchDevice ? ART.tut_touch : ART.tut_keys, UDim2.fromScale(0.2, 0.2), UDim2.fromScale(0.5, 0.37));
	controlHint.AnchorPoint = new Vector2(0.5, 0);
	controlHint.Visible = false;

	// ---------- mentor panel (bottom-left): 3D starter, name plate, speech bubble ----------
	const mentor = frame(gui, UDim2.fromOffset(340, 180), new UDim2(0, 12, 1, -12), BLACK, 0.3);
	mentor.AnchorPoint = new Vector2(0, 1);
	mentor.Visible = false;
	corner(mentor, 0.08);
	if (touchDevice) {
		const mentorScale = new Instance("UIScale");
		mentorScale.Scale = MENTOR_TOUCH_SCALE;
		mentorScale.Parent = mentor;
		mentor.AnchorPoint = new Vector2(0, 0);
		mentor.Position = new UDim2(0, 8, MENTOR_TOUCH_TOP, 0);
	}
	const vp = new Instance("ViewportFrame");
	vp.Size = UDim2.fromOffset(120, 180);
	vp.Position = UDim2.fromOffset(0, 0);
	vp.BackgroundColor3 = CARD;
	vp.BackgroundTransparency = 0;
	vp.BorderSizePixel = 0;
	vp.Ambient = Color3.fromRGB(200, 200, 200);
	vp.LightColor = WHITE;
	vp.LightDirection = new Vector3(-1, -1, -1);
	vp.Parent = mentor;
	// Delivered 2D bust portrait; preferred over the 3D viewport (which rendered black in testing).
	const portrait = new Instance("ImageLabel");
	portrait.Size = UDim2.fromOffset(120, 150);
	portrait.Position = UDim2.fromOffset(0, 0);
	portrait.BackgroundColor3 = CARD;
	portrait.BackgroundTransparency = 0;
	portrait.BorderSizePixel = 0;
	portrait.ScaleType = Enum.ScaleType.Fit;
	portrait.ZIndex = 2;
	portrait.Visible = false;
	portrait.Parent = mentor;
	const nameplate = frame(mentor, UDim2.fromOffset(120, 30), UDim2.fromOffset(0, 150), BLACK, 0.25);
	const nameLabel = text(nameplate, "", UDim2.fromScale(0.9, 0.7), UDim2.fromScale(0.05, 0.15));
	nameLabel.TextColor3 = GOLD;
	const bubble = frame(mentor, UDim2.fromOffset(204, 160), UDim2.fromOffset(128, 10), CREAM, 0.05);
	corner(bubble, 0.1);
	const bubbleLine = text(bubble, "", UDim2.fromScale(0.88, 0.8), UDim2.fromScale(0.06, 0.1));
	bubbleLine.TextColor3 = INK;
	bubbleLine.TextStrokeTransparency = 1;
	bubbleLine.TextXAlignment = Enum.TextXAlignment.Left;
	bubbleLine.TextYAlignment = Enum.TextYAlignment.Top;
	bubbleLine.Font = Enum.Font.GothamBold;

	// ---------- step checklist (right side) ----------
	const checkPanel = frame(gui, UDim2.fromOffset(CHECK_PANEL_W, CHECK_PANEL_H), new UDim2(1, -CHECK_MARGIN, 0, CHECK_GAP), BLACK, 0.35);
	checkPanel.AnchorPoint = new Vector2(1, 0);
	const checkScale = new Instance("UIScale");
	checkScale.Parent = checkPanel;
	checkPanel.Visible = false;
	corner(checkPanel, 0.06);
	text(checkPanel, "教學進度", UDim2.fromOffset(166, 30), UDim2.fromOffset(12, 6));
	const rows: Row[] = [];
	const doneRows: boolean[] = [];
	for (let i = 0; i < CHECK_ROWS; i++) {
		const rowFrame = frame(checkPanel, UDim2.fromOffset(166, 30), UDim2.fromOffset(12, 42 + i * 36), GOLD, 1);
		corner(rowFrame, 0.2);
		const box = frame(rowFrame, UDim2.fromOffset(24, 24), UDim2.fromOffset(6, 3), BLACK, 0.3);
		corner(box, 0.2);
		const boxStroke = new Instance("UIStroke");
		boxStroke.Color = GOLD;
		boxStroke.Thickness = 2;
		boxStroke.Parent = box;
		const mark = frame(rowFrame, UDim2.fromOffset(24, 24), UDim2.fromOffset(6, 3), GOLD, 1);
		mark.Visible = false;
		const markScale = new Instance("UIScale");
		markScale.Parent = mark;
		// Gold check: a short arm down-right and a long arm up-right.
		const shortArm = frame(mark, UDim2.fromOffset(8, 3), UDim2.fromOffset(9, 15), GOLD, 0);
		shortArm.AnchorPoint = new Vector2(0.5, 0.5);
		shortArm.Rotation = 45;
		const longArm = frame(mark, UDim2.fromOffset(14, 3), UDim2.fromOffset(15, 13), GOLD, 0);
		longArm.AnchorPoint = new Vector2(0.5, 0.5);
		longArm.Rotation = -45;
		const label = text(rowFrame, `${i + 1}  ${CHECK_LABELS[i]}`, UDim2.fromOffset(116, 24), UDim2.fromOffset(40, 3));
		label.TextXAlignment = Enum.TextXAlignment.Left;
		rows.push({ frame: rowFrame, label, mark, markScale });
		doneRows.push(false);
	}

	// ---------- in-world highlights: glowing ring under the ball / red ring under the enemy / goal-mouth frame ----------
	const hlFolder = new Instance("Folder");
	hlFolder.Name = "TutorialHighlights";
	hlFolder.Parent = Workspace;
	const makePart = (shape: Enum.PartType, color: Color3): Part => {
		const p = new Instance("Part");
		p.Anchored = true;
		p.CanCollide = false;
		p.CanQuery = false;
		p.CanTouch = false;
		p.CastShadow = false;
		p.Material = Enum.Material.Neon;
		p.Color = color;
		p.Shape = shape;
		p.Transparency = 1;
		p.Parent = hlFolder;
		return p;
	};
	const ballRing = makePart(Enum.PartType.Cylinder, GOLD);
	const enemyRing = makePart(Enum.PartType.Cylinder, RED);
	const goalParts: Part[] = [
		makePart(Enum.PartType.Block, GOLD),
		makePart(Enum.PartType.Block, GOLD),
		makePart(Enum.PartType.Block, GOLD),
	];

	/** Lays a flat ring (cylinder lying on the ground) of the given diameter in sim px at a world point. */
	const placeRing = (part: Part, at: Vector3, diameterPx: number): void => {
		const d = diameterPx * STUDS_PER_PX;
		part.Size = new Vector3(RING_HEIGHT_STUDS, d, d);
		part.CFrame = new CFrame(at.X, 0.15, at.Z).mul(CFrame.Angles(0, 0, math.rad(90)));
	};

	/** Puts the goal-mouth frame (two posts and a crossbar) on the opponent goal. */
	const placeGoal = (s: Setup): void => {
		const w = s.field.w;
		const d = s.field.d;
		const gh = s.field.goalHalfW;
		const h = GOAL_FRAME_PX / 2;
		const left = simToWorld(w, d / 2 - gh, h);
		const right = simToWorld(w, d / 2 + gh, h);
		const top = simToWorld(w, d / 2, GOAL_FRAME_PX);
		const postH = GOAL_FRAME_PX * STUDS_PER_PX;
		goalParts[0].Size = new Vector3(GOAL_POST_STUDS, postH, GOAL_POST_STUDS);
		goalParts[0].CFrame = new CFrame(left.X, postH / 2, left.Z);
		goalParts[1].Size = new Vector3(GOAL_POST_STUDS, postH, GOAL_POST_STUDS);
		goalParts[1].CFrame = new CFrame(right.X, postH / 2, right.Z);
		goalParts[2].Size = new Vector3(GOAL_POST_STUDS, GOAL_POST_STUDS, 2 * gh * STUDS_PER_PX);
		goalParts[2].CFrame = new CFrame(top.X, top.Y, top.Z);
	};

	// ---------- target arrow (tut_arrow art, points up at rotation 0) ----------
	const arrow = new Instance("ImageLabel");
	arrow.Name = "TutorialArrow";
	arrow.AnchorPoint = new Vector2(0.5, 0.5);
	arrow.Size = UDim2.fromOffset(ARROW_PX, ARROW_PX);
	arrow.BackgroundTransparency = 1;
	arrow.BorderSizePixel = 0;
	arrow.Image = ART.tut_arrow;
	arrow.ScaleType = Enum.ScaleType.Fit;
	arrow.Visible = false;
	arrow.Parent = gui;

	let setup: Setup | undefined;
	let lastSnap: Snapshot | undefined;
	let active = false; // the stage 0 tutorial is running
	let step = 0;
	let waiting = false; // a finished step's stamp is on screen; the next banner follows
	let stepToken = 0;
	let stepStartedAt = 0;
	let hintShown = false;
	let hintFast = false;
	let enemyIdx = -1;
	let hintToken = 0;
	let stampToken = 0;
	let sayToken = 0;
	let mentorToken = 0;
	let mentorModel: Model | undefined;
	let mentorBase: CFrame | undefined;
	let clock = 0;

	const showBanner = (head: string, hint: string): void => {
		headline.Text = head;
		hintLine.Text = hint;
		banner.Visible = true;
		// Slide down and settle with a small pulse.
		banner.Position = UDim2.fromScale(0.5, BANNER_TOP - 0.06);
		bannerScale.Scale = 1.08;
		TweenService.Create(
			banner,
			new TweenInfo(0.35, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
			{ Position: UDim2.fromScale(0.5, BANNER_TOP) },
		).Play();
		TweenService.Create(bannerScale, new TweenInfo(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
			Scale: 1,
		}).Play();
	};

	/** Big stamp (e.g. 「完成！」) that springs in, holds, then fades out. */
	const showStamp = (word: string, big: boolean): void => {
		stampToken++;
		const my = stampToken;
		stamp.Text = word;
		stamp.Visible = true;
		stamp.TextTransparency = 0;
		stamp.TextStrokeTransparency = 0;
		stampScale.Scale = big ? 2.4 : 2;
		TweenService.Create(stampScale, new TweenInfo(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
			Scale: 1,
		}).Play();
		task.delay(big ? 2.2 : 0.9, () => {
			if (my !== stampToken) return;
			TweenService.Create(stamp, new TweenInfo(0.4), { TextTransparency: 1, TextStrokeTransparency: 1 }).Play();
		});
		task.delay(big ? 2.7 : 1.3, () => {
			if (my === stampToken) stamp.Visible = false;
		});
	};

	/** Confetti pieces from a point (scale of the screen) that fall and fade. */
	const burst = (count: number, originX: number, originY: number, spread: number): void => {
		for (let i = 0; i < count; i++) {
			const piece = frame(
				gui,
				UDim2.fromOffset(math.random(6, 12), math.random(10, 18)),
				UDim2.fromScale(originX, originY),
				CONFETTI_COLORS[i % CONFETTI_COLORS.size()],
				0,
			);
			piece.Rotation = math.random(0, 360);
			const fall = TweenService.Create(
				piece,
				new TweenInfo(1.2 + math.random() * 0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
				{
					Position: UDim2.fromScale(originX + (math.random() - 0.5) * spread, originY + 0.3 + math.random() * 0.5),
					BackgroundTransparency: 1,
					Rotation: math.random(0, 720),
				},
			);
			fall.Play();
			task.delay(2.2, () => piece.Destroy());
		}
	};

	/** Types a mentor line one character at a time. A newer line cancels the older one. */
	const say = (line: string): void => {
		sayToken++;
		const my = sayToken;
		const [count] = utf8.len(line);
		const total = typeIs(count, "number") ? count : 0;
		bubbleLine.Text = line;
		if (total <= 0) {
			bubbleLine.MaxVisibleGraphemes = -1;
			return;
		}
		bubbleLine.MaxVisibleGraphemes = 0;
		task.spawn(() => {
			for (let i = 1; i <= total; i++) {
				if (my !== sayToken) return;
				bubbleLine.MaxVisibleGraphemes = i;
				task.wait(TYPE_SECONDS);
			}
		});
	};

	const specialName = (): string => {
		const s = setup;
		if (s === undefined) return WEAPON_SPECIAL.sword;
		const humanIdx = s.humanIdx;
		const me = s.players.find((p) => p.idx === humanIdx);
		if (me !== undefined && me.specialName !== undefined) return me.specialName;
		const weapon = me === undefined ? undefined : me.weapon;
		return weapon === undefined ? WEAPON_SPECIAL.sword : WEAPON_SPECIAL[weapon];
	};

	/** Shows a step's banner and the mentor's line for it. */
	const showStep = (n: number): void => {
		const special = specialName();
		const [head, hint] = stepCopy(n, touchDevice, special);
		showBanner(head, hint);
		say(mentorLine(n, special, false, touchDevice));
	};

	const showPassHint = (): void => {
		hintToken++;
		const my = hintToken;
		showBanner(
			"第一次 2 對 2！",
			touchDevice
				? "有球時按傳球鍵傳給隊友；沒球時按傳球鍵叫隊友傳給你"
				: "有球時按 K 傳給隊友；沒球時按 K 叫隊友傳給你",
		);
		task.delay(PASS_HINT_SECONDS, () => {
			if (my === hintToken) banner.Visible = false;
		});
	};

	/** Checklist rows for step n: rows before n are done (a newly done row pops its check), row n is current. */
	const updateRows = (n: number): void => {
		for (let i = 0; i < CHECK_ROWS; i++) {
			const row = rows[i];
			const done = n > i + 1;
			const current = n === i + 1;
			if (done && !doneRows[i]) {
				doneRows[i] = true;
				row.markScale.Scale = 0.3;
				TweenService.Create(row.markScale, new TweenInfo(0.4, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
					Scale: 1,
				}).Play();
			}
			row.mark.Visible = done;
			row.frame.BackgroundTransparency = current ? 0.6 : 1;
			row.label.TextColor3 = current || done ? GOLD : WHITE;
		}
	};

	const resetRows = (): void => {
		for (let i = 0; i < CHECK_ROWS; i++) doneRows[i] = false;
		updateRows(0);
	};

	/** Puts the starter general (3D, idle pose) into the mentor viewport and sets the name plate. */
	const mountMentor = (charId: string): void => {
		for (const c of vp.GetChildren()) c.Destroy();
		mentorModel = undefined;
		mentorBase = undefined;
		nameLabel.Text = nameOf(charId);
		const art = portraitFor(charId);
		if (art !== undefined) {
			portrait.Image = art;
			portrait.Visible = true;
			vp.Visible = false;
			return;
		}
		portrait.Visible = false;
		vp.Visible = true;
		const template = getAvatarTemplate(charId);
		if (template === undefined) return;

		const wm = new Instance("WorldModel");
		wm.Parent = vp;
		const model = template.Clone();
		model.PivotTo(new CFrame());
		const root = model.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
		if (root === undefined) {
			model.Destroy();
			return;
		}
		for (const d of model.GetDescendants()) {
			if (d.IsA("BasePart")) {
				d.Anchored = d === root;
				d.CanCollide = false;
				d.CanQuery = false;
				d.CanTouch = false;
			} else if (d.IsA("Humanoid")) {
				pcall(() => {
					d.EvaluateStateMachine = false;
				});
			}
		}
		let animator: Animator | undefined;
		const humanoid = model.FindFirstChildOfClass("Humanoid");
		if (humanoid !== undefined) {
			animator = humanoid.FindFirstChildOfClass("Animator");
			if (animator === undefined) {
				animator = new Instance("Animator");
				animator.Parent = humanoid;
			}
		}
		model.Parent = wm;
		playIdle(animator, CHAR_ANIMS[charId]?.idle);

		// Frame the model from the front (its look direction faces the camera), then sway it slowly.
		const [boxCF, boxSize] = model.GetBoundingBox();
		const center = boxCF.Position;
		const look = root.CFrame.LookVector;
		const cam = new Instance("Camera");
		cam.FieldOfView = MENTOR_FOV;
		cam.CFrame = CFrame.lookAt(center.add(look.mul(boxSize.Y * MENTOR_FRAME_DISTANCE)), center);
		cam.Parent = vp;
		vp.CurrentCamera = cam;
		mentorModel = model;
		mentorBase = model.GetPivot();
	};

	/** Loads the starter (profile) for the mentor; falls back to the lord's own character when the profile has none. */
	const loadMentor = (s: Setup): void => {
		const my = mentorToken;
		task.spawn(() => {
			let charId: string | undefined;
			const [ok, result] = pcall(() => profileRemotes.GetProfile.InvokeServer());
			if (ok) charId = (result as Profile).starter;
			if (charId === undefined) {
				const me = s.players.find((p) => p.idx === s.humanIdx);
				charId = me === undefined ? undefined : me.charId;
			}
			if (my !== mentorToken || charId === undefined) return;
			mountMentor(charId);
		});
	};

	/** Everything off: tutorial, pass hint, stamp, arrow, checklist, mentor and button highlight. Pending timers are cancelled. */
	const hideAll = (): void => {
		active = false;
		waiting = false;
		step = 0;
		stepToken++;
		hintToken++;
		stampToken++;
		sayToken++;
		mentorToken++;
		banner.Visible = false;
		stamp.Visible = false;
		arrow.Visible = false;
		controlHint.Visible = false;
		mentor.Visible = false;
		checkPanel.Visible = false;
		highlightButton(undefined);
	};

	/** The enemy player in a snapshot (the opponent of the lord), or undefined before setup. */
	const enemyOf = (s: Snapshot): SnapPlayer | undefined =>
		enemyIdx >= 0 && enemyIdx < s.players.size() ? s.players[enemyIdx] : undefined;

	/** The sim point of the current step's world target: ball, opponent goal mouth or enemy. */
	const worldTarget = (): Vector3 | undefined => {
		if (setup === undefined) return undefined;
		const mark = worldMarkOf(step);
		if (mark === "goal") return simToWorld(setup.field.w, setup.field.d / 2, GOAL_TARGET_Z);
		if (lastSnap === undefined) return undefined;
		if (mark === "ball") {
			const b = lastSnap.ball;
			return simToWorld(b.x, b.y, b.z);
		}
		if (mark === "enemy") {
			const e = enemyOf(lastSnap);
			return e === undefined ? undefined : simToWorld(e.x, e.y, e.z);
		}
		return undefined;
	};

	/**
	 * Arrow for the current step: [tip x, tip y, direction x, direction y] in screen px, or undefined when nothing to point at.
	 * A target off screen gets the arrow pinned at the screen edge (band) along the line from the centre to the target.
	 */
	const arrowTarget = (): [number, number, number, number] | undefined => {
		const cam = Workspace.CurrentCamera;
		const world = worldTarget();
		if (cam === undefined || world === undefined) return undefined;

		const vs = cam.ViewportSize;
		const W = vs.X;
		const H = vs.Y;
		const [p] = cam.WorldToViewportPoint(world);
		const inFront = p.Z > 0;
		const bottom = touchDevice ? BOTTOM_BAND_TOUCH_PX : BOTTOM_BAND_PX;
		if (inFront && p.X >= EDGE_PX && p.X <= W - EDGE_PX && p.Y >= TOP_BAND_PX && p.Y <= H - bottom) {
			return [p.X, p.Y - ARROW_GAP, 0, 1];
		}

		const cx = W / 2;
		const cy = H / 2;
		let dx = p.X - cx;
		let dy = p.Y - cy;
		if (!inFront) {
			dx = -dx;
			dy = -dy;
		}
		let len = math.sqrt(dx * dx + dy * dy);
		if (len < 1e-6) {
			dx = 0;
			dy = -1;
			len = 1;
		}
		dx /= len;
		dy /= len;
		let t = math.huge;
		if (dx > 0) t = math.min(t, (W - EDGE_PX - cx) / dx);
		else if (dx < 0) t = math.min(t, (EDGE_PX - cx) / dx);
		if (dy > 0) t = math.min(t, (H - bottom - cy) / dy);
		else if (dy < 0) t = math.min(t, (TOP_BAND_PX - cy) / dy);
		return [cx + dx * t, cy + dy * t, dx, dy];
	};

	/** Puts the arrow so its tip sits at (tipX, tipY) pointing along (dirX, dirY), with a small bounce. */
	const placeArrow = (tipX: number, tipY: number, dirX: number, dirY: number): void => {
		const bob = math.sin(clock * (hintFast ? 14 : 7)) * 6;
		const back = ARROW_PX / 2 + bob;
		arrow.Rotation = math.deg(math.atan2(dirX, -dirY));
		arrow.Position = UDim2.fromOffset(tipX - dirX * back, tipY - dirY * back);
		arrow.Visible = true;
	};

	/** In-world highlight for the current step: pulsing ring or goal frame, hidden when the step has none. */
	const updateWorld = (): void => {
		const mark = active ? worldMarkOf(step) : undefined;
		const pulse = 0.5 + 0.5 * math.sin(clock * (hintFast ? 10 : 5));
		const alpha = 0.2 + 0.5 * (1 - pulse);
		ballRing.Transparency = 1;
		enemyRing.Transparency = 1;
		for (const g of goalParts) g.Transparency = 1;
		if (mark === "ball" && lastSnap !== undefined) {
			const b = lastSnap.ball;
			placeRing(ballRing, simToWorld(b.x, b.y, 0), BALL_RING_PX * (1 + 0.08 * pulse));
			ballRing.Transparency = alpha;
		} else if (mark === "enemy" && lastSnap !== undefined) {
			const e = enemyOf(lastSnap);
			if (e !== undefined) {
				placeRing(enemyRing, simToWorld(e.x, e.y, 0), ENEMY_RING_PX * (1 + 0.08 * pulse));
				enemyRing.Transparency = alpha;
			}
		} else if (mark === "goal" && setup !== undefined) {
			placeGoal(setup);
			for (const g of goalParts) g.Transparency = alpha;
		}
	};

	/** Long-step hint: after HINT_AFTER_SECONDS on one step the mentor says a stronger hint once and the pulse speeds up. */
	const checkHint = (): void => {
		if (hintShown || step < 1 || step > CHECK_ROWS) return;
		if (os.clock() - stepStartedAt < HINT_AFTER_SECONDS) return;
		hintShown = true;
		hintFast = true;
		highlightButton(buttonOf(step), true);
		say(mentorLine(step, specialName(), true, touchDevice));
	};

	RunService.RenderStepped.Connect((dt) => {
		clock += dt;
		if (checkPanel.Visible) layoutChecklist(checkPanel, checkScale, gui.AbsoluteSize);
		if (mentor.Visible && mentorModel !== undefined && mentorBase !== undefined) {
			mentorModel.PivotTo(mentorBase.mul(CFrame.Angles(0, math.sin(clock * 0.8) * 0.35, 0)));
		}
		updateWorld();
		if (!active || waiting || step < 1 || step > CHECK_ROWS) {
			arrow.Visible = false;
			return;
		}
		checkHint();
		const target = arrowTarget();
		if (target === undefined) {
			arrow.Visible = false;
			return;
		}
		placeArrow(target[0], target[1], target[2], target[3]);
	});

	// ---------- server events ----------
	remotes.Setup.OnClientEvent.Connect((raw: unknown) => {
		const s = raw as Setup;
		setup = s;
		lastSnap = undefined;
		hideAll();
		if (s.mode !== "story") return;
		if (s.stageId === TUTORIAL_STAGE_ID) {
			active = true;
			const human = s.players.find((p) => p.idx === s.humanIdx);
			const enemy = human === undefined ? undefined : s.players.find((p) => p.team !== human.team);
			enemyIdx = enemy === undefined ? -1 : enemy.idx;
			resetRows();
			checkPanel.Visible = true;
			mentor.Visible = true;
			loadMentor(s);
			return;
		}
		if (s.stageId === PASS_HINT_STAGE_ID) {
			const my = hintToken;
			task.spawn(() => {
				const [ok, result] = pcall(() => profileRemotes.GetProfile.InvokeServer());
				if (my !== hintToken) return;
				if (ok && !(result as Profile).cleared.includes(clearedKey(PASS_HINT_STAGE_ID))) showPassHint();
			});
		}
	});

	remotes.Tutorial.OnClientEvent.Connect((raw: unknown) => {
		if (!active) return;
		const n = (raw as TutorialStep).step;
		const prev = step;
		step = n;
		controlHint.Visible = n === 1;
		stepToken++;
		const my = stepToken;
		stepStartedAt = os.clock();
		hintShown = false;
		hintFast = false;
		updateRows(n);
		highlightButton(buttonOf(n));
		if (prev < 1 || n <= prev) {
			// The first step, or a repeat: no stamp.
			showStep(n);
			return;
		}
		// Step prev is done: stamp, confetti, chime. Then the next step's banner and line follow.
		play(CHECK_SOUND);
		if (n === LAST_STEP) {
			showStamp("教學完成！", true);
			burst(CONFETTI_COUNT, 0.5, 0.35, 0.9);
			task.delay(0.6, () => {
				if (my === stepToken) burst(CONFETTI_COUNT, 0.3, 0.35, 0.6);
			});
			task.delay(1.2, () => {
				if (my === stepToken) burst(CONFETTI_COUNT, 0.7, 0.35, 0.6);
			});
			showBanner("教學完成！", "");
			say(mentorLine(LAST_STEP, specialName(), false, touchDevice));
			return;
		}
		showStamp("完成！", false);
		burst(CONFETTI_COUNT, 0.5, 0.3, 0.6);
		waiting = true;
		task.delay(STEP_DONE_SECONDS, () => {
			if (my !== stepToken) return;
			waiting = false;
			showStep(n);
		});
	});

	remotes.Snapshot.OnClientEvent.Connect((raw: unknown) => {
		const s = raw as Snapshot;
		if (s.phase === "fulltime") {
			hideAll();
			return;
		}
		if (active) lastSnap = s;
	});
}
