import type { Country } from "shared/data/types";
import { cameraFov, cameraTargetX, smooth } from "shared/logic/camera";
import type { WireEvent } from "shared/logic/events";
import { SnapshotBuffer } from "shared/logic/interp";
import {
	REMOTES_FOLDER,
	REMOTE_EVENTS,
	REMOTE_INPUT,
	REMOTE_LOBBY,
	REMOTE_PICK,
	REMOTE_READY,
	REMOTE_SNAP,
	type LobbyMsg,
} from "shared/logic/remotes";
import { FIELD_STUDS_D, FIELD_STUDS_W, STUDS_PER_PX } from "shared/logic/scale";
import { decodeSnapshot, type Snapshot } from "shared/logic/snapshot";
import { isCountry } from "shared/logic/slots";
import { TICK_HZ } from "shared/sim/constants";
import { Controls } from "./controls";
import { buildField } from "./field";
import { FxManager } from "./fx";
import { Hud } from "./hud";
import { PlayerView } from "./PlayerView";
import { countryName } from "./theme";

const RunService = game.GetService("RunService");
const ReplicatedStorage = game.GetService("ReplicatedStorage");
const Workspace = game.GetService("Workspace");

const RENDER_DELAY = 0.1;
const VISIBLE_STUDS = 45;
const CAM_DIST = 40;
const CAM_PITCH = math.rad(35);
const CAM_MARGIN = 4;
const CAM_FOLLOW_RATE = 4;
const BALL_DIAMETER = 1.1;

const remotes = ReplicatedStorage.WaitForChild(REMOTES_FOLDER) as Folder;
const lobbyRemote = remotes.WaitForChild(REMOTE_LOBBY) as RemoteEvent;
const eventsRemote = remotes.WaitForChild(REMOTE_EVENTS) as RemoteEvent;
const snapRemote = remotes.WaitForChild(REMOTE_SNAP) as UnreliableRemoteEvent;
const readyRemote = remotes.WaitForChild(REMOTE_READY) as RemoteEvent;
const pickRemote = remotes.WaitForChild(REMOTE_PICK) as RemoteEvent;
const inputRemote = remotes.WaitForChild(REMOTE_INPUT) as RemoteEvent;

// ---- world -------------------------------------------------------------------------------------------------------------
buildField();
const dynamic = new Instance("Folder");
dynamic.Name = "SanguoDynamic";
dynamic.Parent = Workspace;

const ball = new Instance("Part");
ball.Name = "Ball";
ball.Shape = Enum.PartType.Ball;
ball.Size = new Vector3(BALL_DIAMETER, BALL_DIAMETER, BALL_DIAMETER);
ball.Color = Color3.fromRGB(250, 250, 250);
ball.Material = Enum.Material.SmoothPlastic;
ball.Anchored = true;
ball.CanCollide = false;
ball.CanQuery = false;
ball.CanTouch = false;
ball.Position = new Vector3(FIELD_STUDS_W / 2, BALL_DIAMETER / 2, FIELD_STUDS_D / 2);
ball.Parent = dynamic;

const ballShadow = new Instance("Part");
ballShadow.Name = "BallShadow";
ballShadow.Shape = Enum.PartType.Cylinder;
ballShadow.Color = Color3.fromRGB(0, 0, 0);
ballShadow.Transparency = 0.55;
ballShadow.Material = Enum.Material.SmoothPlastic;
ballShadow.Anchored = true;
ballShadow.CanCollide = false;
ballShadow.CanQuery = false;
ballShadow.CanTouch = false;
ballShadow.CastShadow = false;
ballShadow.Size = new Vector3(0.05, BALL_DIAMETER, BALL_DIAMETER);
ballShadow.Parent = dynamic;

// ---- state -------------------------------------------------------------------------------------------------------------
const snapshots = new SnapshotBuffer();
let lobby: LobbyMsg | undefined = undefined;
let teams: [Country, Country] | undefined = undefined;
let views: (PlayerView | undefined)[] = [];
let lastPhase = "";
let lastScore: [number, number] = [-1, -1];
let latest: Snapshot | undefined = undefined;
let camX = FIELD_STUDS_W / 2;

const hud = new Hud((country) => pickRemote.FireServer(country));
const controls = new Controls(hud.gui, (frame) => inputRemote.FireServer(frame));
const fx = new FxManager(dynamic, (idx) => {
	const p = latest?.players[idx];
	return p === undefined ? undefined : [p.x, p.y];
});

function clearMatchVisuals(): void {
	for (const v of views) v?.destroy();
	views = [];
	fx.clear();
	snapshots.reset();
	latest = undefined;
	lastPhase = "";
	lastScore = [-1, -1];
	hud.setClock("");
	controls.setSpecialCooldown(0);
}

// ---- remotes -----------------------------------------------------------------------------------------------------------
lobbyRemote.OnClientEvent.Connect((msg: LobbyMsg) => {
	const prevMode = lobby?.mode;
	lobby = msg;
	if (msg.teams !== undefined && isCountry(msg.teams[0]) && isCountry(msg.teams[1])) {
		teams = [msg.teams[0], msg.teams[1]];
	} else {
		teams = undefined;
	}
	controls.setActive(msg.mode === "play" && msg.humanIdx >= 0);
	if (msg.mode === "pick") {
		clearMatchVisuals();
		hud.hideResult();
		hud.setScore(undefined, [0, 0]);
		hud.showPick(msg.canPick);
	} else if (msg.mode === "play") {
		hud.hidePick();
		hud.hideResult();
		if (prevMode !== "play") clearMatchVisuals();
		else {
			// A role change mid-match (a seat was freed): rebuild the tags so the marker moves.
			for (const v of views) v?.destroy();
			views = [];
		}
	} else {
		hud.hidePick();
		hud.showResult(teams, msg.score ?? [0, 0], msg.pk, msg.restartSec ?? 5);
	}
});

snapRemote.OnClientEvent.Connect((data: buffer) => {
	const snap = decodeSnapshot(data);
	if (snap !== undefined) snapshots.push(os.clock(), snap);
});

eventsRemote.OnClientEvent.Connect((list: WireEvent[]) => {
	for (const e of list) {
		fx.handle(e);
		if (e.t === "goal") {
			const side = e.team === 0 || e.team === 1 ? (teams !== undefined ? countryName(teams[e.team]) : "") : "";
			hud.toast(`進球！ ${side} ${e.n ?? ""}`, 3);
		} else if (e.t === "special") {
			hud.toast(`${e.m ?? ""}：${e.n ?? ""}`, 2);
		} else if (e.t === "pkResult") {
			hud.toast(e.n === "goal" ? "PK 進球！" : e.n === "save" ? "PK 撲救！" : "PK 射失", 2);
		} else if (e.t === "whistle" && e.n === "half") {
			hud.toast("中場休息", 2);
		}
	}
});

// ---- per-frame update ---------------------------------------------------------------------------------------------------
function ensureViews(s: Snapshot): void {
	const myIdx = lobby?.humanIdx ?? -1;
	const myTeam = myIdx >= 0 ? math.floor(myIdx / 5) : 0;
	for (let i = 0; i < s.players.size(); i++) {
		const p = s.players[i];
		const existing = views[i];
		if (existing === undefined || existing.charIdx !== p.charIdx) {
			existing?.destroy();
			views[i] = new PlayerView(dynamic, p.charIdx, i === myIdx, p.team === myTeam);
		}
	}
}

function clockText(s: Snapshot): string {
	if (s.phase === "pk") return "PK 大戰";
	const secs = math.ceil(s.clockTicks / TICK_HZ);
	const half = s.half === 1 ? "上半場" : "下半場";
	return `${half}  ${string.format("%02d:%02d", math.floor(secs / 60), secs % 60)}`;
}

function render(s: Snapshot): void {
	ensureViews(s);
	for (let i = 0; i < s.players.size(); i++) {
		const p = s.players[i];
		views[i]?.update(p.x, p.y, p.z, p.facing, p.down, p.rampage, p.stamina, p.maxStamina);
	}
	const bx = s.ball.x * STUDS_PER_PX;
	const bz = s.ball.y * STUDS_PER_PX;
	const by = BALL_DIAMETER / 2 + s.ball.z * STUDS_PER_PX;
	ball.Position = new Vector3(bx, by, bz);
	const shadowD = BALL_DIAMETER * math.max(0.4, 1 - s.ball.z * STUDS_PER_PX * 0.08);
	ballShadow.Size = new Vector3(0.05, shadowD, shadowD);
	ballShadow.CFrame = new CFrame(bx, 0.07, bz).mul(CFrame.Angles(0, 0, math.rad(90)));

	if (teams !== undefined && (s.score[0] !== lastScore[0] || s.score[1] !== lastScore[1])) {
		lastScore = [s.score[0], s.score[1]];
		hud.setScore(teams, s.score);
	}
	hud.setClock(clockText(s));
	if (s.phase !== lastPhase) {
		if (s.phase === "kickoff") hud.toast("開球", 1.2);
		else if (s.phase === "pk") hud.toast("PK 大戰（自動進行）", 2.5);
		lastPhase = s.phase;
	}
	const myIdx = lobby?.humanIdx ?? -1;
	if (myIdx >= 0) controls.setSpecialCooldown(s.players[myIdx].specialCooldown / TICK_HZ);
}

function updateCamera(camera: Camera, dt: number, s: Snapshot | undefined): void {
	const aspect = camera.ViewportSize.X / math.max(1, camera.ViewportSize.Y);
	camera.FieldOfView = cameraFov(VISIBLE_STUDS, CAM_DIST, aspect);
	const target = s !== undefined ? cameraTargetX(s.ball.x * STUDS_PER_PX, VISIBLE_STUDS / 2, FIELD_STUDS_W, CAM_MARGIN) : FIELD_STUDS_W / 2;
	camX = smooth(camX, target, dt, CAM_FOLLOW_RATE);
	const look = new Vector3(camX, 0, FIELD_STUDS_D / 2 + 1);
	const pos = look.add(new Vector3(0, math.sin(CAM_PITCH) * CAM_DIST, math.cos(CAM_PITCH) * CAM_DIST));
	camera.CFrame = CFrame.lookAt(pos, look);
}

let camera = Workspace.CurrentCamera;
while (camera === undefined) {
	Workspace.GetPropertyChangedSignal("CurrentCamera").Wait();
	camera = Workspace.CurrentCamera;
}
const cam: Camera = camera;

RunService.BindToRenderStep("SanguoCamera", Enum.RenderPriority.Camera.Value + 1, (dt) => {
	cam.CameraType = Enum.CameraType.Scriptable;
	const s = snapshots.sample(os.clock(), RENDER_DELAY);
	if (s !== undefined) {
		latest = s;
		render(s);
	}
	updateCamera(cam, dt, s);
});

RunService.Heartbeat.Connect(() => controls.step(os.clock()));

// Everything is connected: ask the server for the lobby state.
readyRemote.FireServer();
