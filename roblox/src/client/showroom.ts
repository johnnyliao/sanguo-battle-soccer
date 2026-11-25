// 武將展示: all 15 generals in a 3x5 grid (each in its own ViewportFrame); clicking one enters the 3D showroom stage (stage.ts).
// The grid's idle / run animations can be switched and slowed down. Built once on first open, then shown and hidden.
import { CHAR_ANIMS } from "./animIds";
import { getAvatarTemplate } from "./avatars";
import { ActionKind, enterStage, leaveStage, stageAction, stageSetPreset, stageSetSpeed, stageToggleOrbit } from "./stage";

const Players = game.GetService("Players");

const WHITE = Color3.fromRGB(255, 255, 255);
const BLACK = Color3.fromRGB(0, 0, 0);
const ACTION_COLOR = Color3.fromRGB(70, 110, 220);
const SPECIAL_COLOR = Color3.fromRGB(220, 60, 90);
const GOLD = Color3.fromRGB(255, 217, 138);
const GREY = Color3.fromRGB(90, 90, 90);
const PANEL = Color3.fromRGB(24, 24, 32);
const CARD = Color3.fromRGB(40, 40, 52);
const FADE_TIME = 0.15;
const CAMERA_FOV = 30;
/** Camera distance as a multiple of the body's bounding-box height. */
const FRAME_DISTANCE = 2.2;
const SPEEDS: number[] = [1, 0.5, 0.25];
const SPEED_LABELS: string[] = ["1x", "0.5x", "0.25x"];

type Mode = "idle" | "run";

interface General {
	id: string;
	name: string;
}

interface Kingdom {
	name: string;
	color: Color3;
	generals: General[];
}

const KINGDOMS: Kingdom[] = [
	{
		name: "魏",
		color: Color3.fromRGB(0x2e, 0x6f, 0xd6),
		generals: [
			{ id: "xuchu", name: "許褚" },
			{ id: "caocao", name: "曹操" },
			{ id: "zhenji", name: "甄姬" },
			{ id: "simayi", name: "司馬懿" },
			{ id: "zhangliao", name: "張遼" },
		],
	},
	{
		name: "蜀",
		color: Color3.fromRGB(0x2f, 0x9e, 0x44),
		generals: [
			{ id: "zhangfei", name: "張飛" },
			{ id: "guanyu", name: "關羽" },
			{ id: "zhugeliang", name: "諸葛亮" },
			{ id: "machao", name: "馬超" },
			{ id: "zhaoyun", name: "趙雲" },
		],
	},
	{
		name: "吳",
		color: Color3.fromRGB(0xd6, 0x45, 0x3d),
		generals: [
			{ id: "sunquan", name: "孫權" },
			{ id: "daqiao", name: "大喬" },
			{ id: "zhouyu", name: "周瑜" },
			{ id: "xiaoqiao", name: "小喬" },
			{ id: "sunce", name: "孫策" },
		],
	},
];

/** One rendered general: the model inside its own WorldModel plus its idle and run tracks. */
interface Showcase {
	model: Model;
	idle: AnimationTrack | undefined;
	run: AnimationTrack | undefined;
	/** Bounding-box centre of the framed model (spin axis). */
	center: Vector3;
	/** Model pivot right after framing (spin start). */
	basePivot: CFrame;
}

interface ShowroomHandle {
	show(): void;
}

// Module state. Declared before any function that uses it.
let showroom: ShowroomHandle | undefined;
let building = false;
let showing = false;
let mode: Mode = "idle";
let speed = 1;
const grid: Showcase[] = [];

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
function label(parent: Instance, content: string, size: UDim2, pos: UDim2): TextLabel {
	const t = new Instance("TextLabel");
	t.BackgroundTransparency = 1;
	t.Size = size;
	t.Position = pos;
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

function makeViewport(parent: Instance, size: UDim2, pos: UDim2): ViewportFrame {
	const vp = new Instance("ViewportFrame");
	vp.Size = size;
	vp.Position = pos;
	vp.BackgroundColor3 = CARD;
	vp.BackgroundTransparency = 0;
	vp.BorderSizePixel = 0;
	vp.Ambient = Color3.fromRGB(200, 200, 200);
	vp.LightColor = WHITE;
	vp.LightDirection = new Vector3(-1, -1, -1);
	vp.Parent = parent;
	return vp;
}

/** Loads one looped animation track; undefined when there is no id or the load fails. */
function loadTrack(animator: Animator | undefined, id: string | undefined, priority: Enum.AnimationPriority): AnimationTrack | undefined {
	if (animator === undefined || id === undefined) return undefined;
	const a: Animator = animator;
	const anim = new Instance("Animation");
	anim.AnimationId = id;
	const [ok, track] = pcall(() => {
		return a.LoadAnimation(anim);
	});
	if (!ok || track === undefined) return undefined;
	track.Looped = true;
	track.Priority = priority;
	return track;
}

/** Clones a general into the viewport's WorldModel, frames it from the front and loads its animations. */
function spawnShowcase(vp: ViewportFrame, charId: string): Showcase | undefined {
	const template = getAvatarTemplate(charId);
	if (template === undefined) return undefined;

	const wm = new Instance("WorldModel");
	wm.Parent = vp;

	const model = template.Clone();
	model.PivotTo(new CFrame());
	const root = model.FindFirstChild("HumanoidRootPart") as BasePart;
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

	const [boxCF, boxSize] = model.GetBoundingBox();
	const center = boxCF.Position;
	const look = root.CFrame.LookVector;
	const cam = new Instance("Camera");
	cam.FieldOfView = CAMERA_FOV;
	cam.CFrame = CFrame.lookAt(center.add(look.mul(boxSize.Y * FRAME_DISTANCE)), center);
	cam.Parent = vp;
	vp.CurrentCamera = cam;

	const anims = CHAR_ANIMS[charId];
	const idle = loadTrack(animator, anims?.idle, Enum.AnimationPriority.Idle);
	const run = loadTrack(animator, anims?.run, Enum.AnimationPriority.Movement);

	return { model, idle, run, center, basePivot: model.GetPivot() };
}

function setTrack(t: AnimationTrack | undefined, on: boolean): void {
	if (t === undefined) return;
	if (on) {
		if (!t.IsPlaying) t.Play(FADE_TIME);
		t.AdjustSpeed(speed);
	} else if (t.IsPlaying) {
		t.Stop(FADE_TIME);
	}
}

function applyShowcase(s: Showcase): void {
	setTrack(s.idle, showing && mode === "idle");
	setTrack(s.run, showing && mode === "run");
}

function applyAll(): void {
	for (const s of grid) applyShowcase(s);
}

/** Builds the whole screen (grid and stage UI) and returns its show handle. Yields while the avatar folder loads. */
function buildShowroom(): ShowroomHandle {
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const screen = new Instance("ScreenGui");
	screen.Name = "ShowroomGui";
	screen.IgnoreGuiInset = false; // keep the top bar (返回 etc.) clear of the Roblox menu icons
	screen.ResetOnSpawn = false;
	screen.DisplayOrder = 50;
	screen.Enabled = false;
	screen.Parent = playerGui;

	const bg = frame(screen, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), PANEL, 0);

	// Top bar.
	const title = label(screen, "武將展示", UDim2.fromScale(0.16, 0.07), UDim2.fromScale(0.02, 0.015));
	const backBtn = button(screen, "返回", UDim2.fromScale(0.12, 0.07), UDim2.fromScale(0.02, 0.015), GREY);
	backBtn.Visible = false;
	const modeBtns: Record<Mode, TextButton> = {
		idle: button(screen, "待機", UDim2.fromScale(0.1, 0.07), UDim2.fromScale(0.2, 0.015), GREY),
		run: button(screen, "跑步", UDim2.fromScale(0.1, 0.07), UDim2.fromScale(0.31, 0.015), GREY),
	};
	const speedBtns: TextButton[] = [];
	const closeBtn = button(screen, "關閉", UDim2.fromScale(0.08, 0.07), UDim2.fromScale(0.9, 0.015), GREY);

	const refreshButtons = (): void => {
		modeBtns.idle.BackgroundColor3 = mode === "idle" ? GOLD : GREY;
		modeBtns.run.BackgroundColor3 = mode === "run" ? GOLD : GREY;
		SPEEDS.forEach((v, i) => {
			speedBtns[i].BackgroundColor3 = speed === v ? GOLD : GREY;
		});
	};

	SPEEDS.forEach((v, i) => {
		speedBtns.push(button(screen, SPEED_LABELS[i], UDim2.fromScale(0.07, 0.07), UDim2.fromScale(0.44 + i * 0.08, 0.015), GREY));
	});

	// Grid container (cards are added below) and the 3D stage UI.
	const gridFrame = frame(screen, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), BLACK, 1);
	const stageFrame = frame(screen, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), BLACK, 1);
	stageFrame.Visible = false;
	const stageName = label(stageFrame, "", UDim2.fromScale(0.2, 0.08), UDim2.fromScale(0.69, 0.01));
	const flat: General[] = [];
	for (const k of KINGDOMS) {
		for (const g of k.generals) flat.push(g);
	}
	let stageIndex = -1;
	const prevBtn = button(stageFrame, "上一位", UDim2.fromScale(0.13, 0.09), UDim2.fromScale(0.16, 0.01), GREY);
	const nextBtn = button(stageFrame, "下一位", UDim2.fromScale(0.13, 0.09), UDim2.fromScale(0.3, 0.01), GREY);
	const actions: [string, ActionKind][] = [
		["待機", "idle"],
		["跑步", "run"],
		["普攻", "attack"],
		["受擊", "hit"],
		["倒地起身", "knockdown"],
		["暈眩", "stun"],
		["大招", "special"],
	];
	const actionBtns: TextButton[] = [];
	actions.forEach(([name, kind], i) => {
		const b = button(stageFrame, name, UDim2.fromScale(0.128, 0.14), UDim2.fromScale(0.02 + i * 0.1385, 0.84), kind === "special" ? SPECIAL_COLOR : ACTION_COLOR);
		actionBtns.push(b);
		b.Activated.Connect(() => {
			stageAction(kind);
		});
	});
	const camNames = ["前", "側", "斜"];
	camNames.forEach((n, i) => {
		const b = button(stageFrame, n, UDim2.fromScale(0.07, 0.11), UDim2.fromScale(0.92, 0.2 + i * 0.13), GREY);
		b.Activated.Connect(() => {
			stageSetPreset(i);
		});
	});
	const orbitBtn = button(stageFrame, "自轉", UDim2.fromScale(0.07, 0.11), UDim2.fromScale(0.92, 0.2 + 3 * 0.13), GREY);
	orbitBtn.Activated.Connect(() => {
		orbitBtn.BackgroundColor3 = stageToggleOrbit() ? GOLD : GREY;
	});

	const setGridChrome = (on: boolean): void => {
		bg.Visible = on;
		gridFrame.Visible = on;
		title.Visible = on;
		closeBtn.Visible = on;
		modeBtns.idle.Visible = on;
		modeBtns.run.Visible = on;
		backBtn.Visible = !on;
		stageFrame.Visible = !on;
	};

	const closeStage = (): void => {
		if (stageIndex < 0) return;
		stageIndex = -1;
		leaveStage();
		setGridChrome(true);
	};

	const openStage = (idx: number): void => {
		const n = flat.size();
		stageIndex = (idx + n) % n;
		const g = flat[stageIndex];
		setGridChrome(false);
		orbitBtn.BackgroundColor3 = GREY;
		stageName.Text = g.name;
		const ok = enterStage(g.id);
		stageSetSpeed(speed);
		if (!ok) stageName.Text = `${g.name}（無模型）`;
		stageAction("idle");
	};

	// Grid view: 3 kingdoms x 5 generals.
	KINGDOMS.forEach((k, r) => {
		const y = 0.1 + r * 0.295;
		const tag = frame(gridFrame, UDim2.fromScale(0.05, 0.28), UDim2.fromScale(0.01, y), k.color, 0.1);
		label(tag, k.name, UDim2.fromScale(0.8, 0.3), UDim2.fromScale(0.1, 0.35));
		k.generals.forEach((g, i) => {
			const x = 0.08 + i * 0.182;
			const vp = makeViewport(gridFrame, UDim2.fromScale(0.176, 0.23), UDim2.fromScale(x, y));
			const showcase = spawnShowcase(vp, g.id);
			if (showcase !== undefined) grid.push(showcase);
			label(gridFrame, g.name, UDim2.fromScale(0.176, 0.055), UDim2.fromScale(x, y + 0.235));
			const hit = button(gridFrame, "", UDim2.fromScale(0.176, 0.23), UDim2.fromScale(x, y), WHITE);
			hit.BackgroundTransparency = 1;
			const gi = flat.indexOf(g);
			hit.Activated.Connect(() => {
				openStage(gi);
			});
		});
	});

	// The country-select screen lives in HudGui; hide it while the showroom is open (it would cover the 3D stage).
	const setHud = (on: boolean): void => {
		const hud = game.GetService("Players").LocalPlayer?.FindFirstChild("PlayerGui")?.FindFirstChild("HudGui");
		if (hud !== undefined && hud.IsA("ScreenGui")) hud.Enabled = on;
	};

	const showScreen = (): void => {
		showing = true;
		setHud(false);
		screen.Enabled = true;
		refreshButtons();
		applyAll();
	};

	const hideScreen = (): void => {
		closeStage();
		showing = false;
		screen.Enabled = false;
		setHud(true);
		applyAll();
	};

	modeBtns.idle.Activated.Connect(() => {
		mode = "idle";
		refreshButtons();
		applyAll();
	});
	modeBtns.run.Activated.Connect(() => {
		mode = "run";
		refreshButtons();
		applyAll();
	});
	SPEEDS.forEach((v, i) => {
		speedBtns[i].Activated.Connect(() => {
			speed = v;
			refreshButtons();
			applyAll();
			if (stageIndex >= 0) stageSetSpeed(v);
		});
	});
	backBtn.Activated.Connect(() => {
		closeStage();
	});
	prevBtn.Activated.Connect(() => {
		if (stageIndex >= 0) openStage(stageIndex - 1);
	});
	nextBtn.Activated.Connect(() => {
		if (stageIndex >= 0) openStage(stageIndex + 1);
	});
	closeBtn.Activated.Connect(() => {
		hideScreen();
	});

	refreshButtons();
	return {
		show() {
			showScreen();
		},
	};
}

/** Opens the 武將展示 screen. Builds it on the first call (in a spawned thread), then just shows it. Idempotent. */
export function openShowroom(): void {
	if (showroom !== undefined) {
		showroom.show();
		return;
	}
	if (building) return;
	building = true;
	task.spawn(() => {
		const built = buildShowroom();
		showroom = built;
		building = false;
		built.show();
	});
}
