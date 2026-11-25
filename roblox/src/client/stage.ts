// 3D showroom stage controller: enters / leaves the stage, runs the orbit camera and the demo actions
// (idle, run, attack, hit, knockdown + get-up, stun, special) for one general against a training dummy.
import { CHAR_ANIMS, SHARED_ANIMS } from "./animIds";
import {
	Actor,
	applySpeed,
	colorOf,
	destroyActor,
	makeDummy,
	makeGeneral,
	moveTo,
	place,
	playLoop,
	playOnce,
	resetActor,
	setBase,
	setTrails,
	tiltTo,
	waitTrack,
	warnOnce,
} from "./actor";
import * as fx from "./fx";
import { Ctx, WHITE, chest, flinch, flinchActor, impact, sheetFx, starsOn } from "./kit";
import { SPECIALS } from "./specials";
import { startWeaponAttack, weaponClassOf, weaponImpactPhase } from "./weaponPose";
import { STAGE_CENTER, StageEnv, buildStageEnv } from "./stageEnv";

const Workspace = game.GetService("Workspace");
const RunService = game.GetService("RunService");
const UserInputService = game.GetService("UserInputService");

export type ActionKind = "idle" | "run" | "attack" | "hit" | "knockdown" | "stun" | "special";

const LOOK = new Vector3(1, 0, 0);
const UP = new Vector3(0, 1, 0);
const RIGHT = LOOK.Cross(UP);
const DUMMY_DIST = 8;
const CAM_FOV = 50;
const CAM_BASE_RADIUS = 16.5;
const CAM_SPECIAL_RADIUS = 32;
const CAM_HEIGHT = 0;
/** Azimuth presets in radians: 前 (front), 側 (side), 斜 (3/4). 0 = camera beyond the dummy looking back at the general. */
export const CAM_PRESETS: number[] = [math.rad(58), math.rad(90), math.rad(48)];
/** Per preset: focus (0 = midpoint between the two, 1 = on the general) and a radius multiplier. */
const CAM_FOCUS: number[] = [1, 0, 0];
const CAM_RMUL: number[] = [1.0, 1.0, 1.25];
let presetIdx = 1;
const ORBIT_RATE = 0.3;
const STEP_NAME = "ShowroomStageCam";

let env: StageEnv | undefined;
let active = false;
let general: Actor | undefined;
let dummy: Actor | undefined;
let ctxChar = "";

// Camera state.
let azimuth = CAM_PRESETS[1];
let focus = 0;
let radius = CAM_BASE_RADIUS;
let radiusTarget = CAM_BASE_RADIUS;
let autoOrbit = false;
let animTime = 0;
let savedType: Enum.CameraType | undefined;
let savedCFrame: CFrame | undefined;
let savedFov = 70;
let savedLight: Map<Instance, Map<string, unknown>> | undefined;
let mouseConn: RBXScriptConnection | undefined;
let actionToken = 0;

function baseRadius(): number {
	const m = CAM_RMUL[presetIdx];
	if (ctxChar === "xuchu") return CAM_BASE_RADIUS * 1.4 * m;
	if (ctxChar === "zhangfei") return CAM_BASE_RADIUS * 1.2 * m;
	return CAM_BASE_RADIUS * m;
}

function midPoint(): Vector3 {
	return STAGE_CENTER.add(LOOK.mul(DUMMY_DIST / 2));
}

function updateCamera(dt: number): void {
	const cam = Workspace.CurrentCamera;
	if (cam === undefined || env === undefined) return;
	animTime += dt;
	env.animate(animTime);
	if (autoOrbit) azimuth += ORBIT_RATE * dt;
	if (UserInputService.IsKeyDown(Enum.KeyCode.Left)) azimuth -= 1.6 * dt;
	if (UserInputService.IsKeyDown(Enum.KeyCode.Right)) azimuth += 1.6 * dt;
	if (UserInputService.IsKeyDown(Enum.KeyCode.Up)) radiusTarget = math.max(6, radiusTarget - 12 * dt);
	if (UserInputService.IsKeyDown(Enum.KeyCode.Down)) radiusTarget = math.min(60, radiusTarget + 12 * dt);
	radius += (radiusTarget - radius) * (1 - math.exp(-3 * dt));
	const wantFocus = radiusTarget > CAM_SPECIAL_RADIUS * 0.7 ? 0 : CAM_FOCUS[presetIdx];
	focus += (wantFocus - focus) * (1 - math.exp(-4 * dt));
	const target = midPoint().Lerp(STAGE_CENTER.add(LOOK.mul(1.2)), focus).add(new Vector3(0, 4.6, 0));
	const dir = LOOK.mul(math.cos(azimuth)).add(RIGHT.mul(math.sin(azimuth)));
	const eye = target.add(dir.mul(radius)).add(new Vector3(0, CAM_HEIGHT + (radius - CAM_BASE_RADIUS) * 0.3, 0));
	const shake = fx.shakeOffset(dt);
	cam.CameraType = Enum.CameraType.Scriptable;
	cam.FieldOfView = CAM_FOV;
	cam.CFrame = CFrame.lookAt(eye.add(shake), target.add(shake));
}

function makeCtx(g: Actor, d: Actor): Ctx {
	return {
		charId: g.charId,
		actor: g,
		dummy: d,
		origin: g.homeFoot,
		look: LOOK,
		right: RIGHT,
		color: colorOf(g.charId),
	};
}

// ---------------------------------------------------------------- actions (run inside a guarded thread)

function doAttack(c: Ctx): void {
	const g = c.actor;
	const clip = playOnce(g, CHAR_ANIMS[g.charId]?.attack);
	let len = 0.8;
	if (clip === undefined) {
		warnOnce(`attack-${g.charId}`, `[showroom] ${g.charId}: no attack animation, using a lunge`);
	} else {
		let waited = 0;
		while (clip.Length <= 0 && waited < 0.6) waited += task.wait();
		if (clip.Length > 0) len = clip.Length;
	}
	const it = weaponImpactPhase(g.charId) ?? 0.4;
	startWeaponAttack(g.model, len);
	fx.wait(len * 0.1);
	setTrails(g, true);
	if (clip === undefined) {
		fx.spawn(() => {
			moveTo(g, g.homeFoot.add(LOOK.mul(2.4)), len * 0.28);
			moveTo(g, g.homeFoot, len * 0.4);
		});
	}
	fx.wait(len * (it - 0.1));
	// Impact moment (about 40% of the clip; class-specific for scripted weapons).
	const pos = chest(c).sub(LOOK.mul(0.8));
	const color = colorOf(g.charId);
	if (!sheetFx(c, "slash", pos, 9, 0.4, color)) {
		sheetFx(c, "impact", pos, 9, 0.4, color);
	}
	impact(c, pos, color, 1);
	flinch(c);
	fx.shake(0.4, 0.25);
	fx.flash(WHITE, 0.65, 0.18);
	if (weaponClassOf(g.charId) === "hammer") {
		fx.dust(g.foot.add(LOOK.mul(3)).add(new Vector3(0, 0.4, 0)), 16, 7);
		fx.shake(0.8, 0.35);
	}
	fx.wait(len * 0.3);
	setTrails(g, false);
	fx.wait(len * math.max(0.1, 1 - it - 0.3));
}

function doHit(c: Ctx): void {
	const g = c.actor;
	const clip = playOnce(g, SHARED_ANIMS.hit);
	if (clip === undefined) warnOnce("hit-anim", "[showroom] SHARED_ANIMS.hit missing, using a procedural wobble");
	const pos = g.foot.add(new Vector3(0, 5, 0));
	impact(c, pos, Color3.fromRGB(255, 90, 90), 0.8);
	fx.flash(Color3.fromRGB(255, 60, 60), 0.75, 0.25);
	flinchActor(g, LOOK.mul(-1));
	waitTrack(clip, 0.7);
}

function doKnockdown(c: Ctx): void {
	const g = c.actor;
	const down = playOnce(g, SHARED_ANIMS.knockdown);
	if (down === undefined) {
		warnOnce("knockdown-anim", "[showroom] SHARED_ANIMS.knockdown missing, using a procedural fall");
		tiltTo(g, math.pi / 2, 0.3);
		fx.dust(g.foot.add(new Vector3(0, 0.5, 0)), 12, 5);
		fx.shake(0.5, 0.3);
		fx.wait(0.9);
		tiltTo(g, 0, 0.5);
		return;
	}
	fx.spawn(() => {
		fx.wait(0.35);
		fx.dust(g.foot.add(new Vector3(0, 0.5, 0)), 12, 5);
		fx.shake(0.5, 0.3);
	});
	waitTrack(down, 1);
	const up = playOnce(g, SHARED_ANIMS.getup);
	if (up === undefined) {
		warnOnce("getup-anim", "[showroom] SHARED_ANIMS.getup missing");
		fx.wait(0.4);
		return;
	}
	waitTrack(up, 1);
}

function doStun(c: Ctx): void {
	const g = c.actor;
	const clip = playLoop(g, SHARED_ANIMS.stun);
	if (clip === undefined) warnOnce("stun-anim", "[showroom] SHARED_ANIMS.stun missing, using a procedural sway");
	starsOn(g, 3);
	fx.burst(g.foot.add(new Vector3(0, 8, 0)), Color3.fromRGB(255, 235, 60), 14, { size: 1.6, speed: 8, life: 0.8 });
	fx.run(3, (a) => {
		if (clip === undefined) {
			g.tilt = math.sin(a * 22) * 0.12;
			g.yawAdd = math.sin(a * 11) * 0.25;
			place(g);
		}
	});
}

function doSpecial(c: Ctx): void {
	const g = c.actor;
	const fn = SPECIALS[g.charId];
	if (fn === undefined) {
		warn(`[showroom] no special move for ${g.charId}`);
		return;
	}
	radiusTarget = baseRadius() + (CAM_SPECIAL_RADIUS - CAM_BASE_RADIUS) + (ctxChar === "sunquan" ? 8 : ctxChar === "machao" ? 8 : ctxChar === "guanyu" || ctxChar === "sunce" ? -6 : 0);
	const clip = playOnce(g, CHAR_ANIMS[g.charId]?.special);
	if (clip === undefined) warnOnce(`special-${g.charId}`, `[showroom] ${g.charId}: no special animation, effects only`);
	fn(c);
}

function perform(kind: ActionKind, g: Actor, d: Actor): boolean {
	const c = makeCtx(g, d);
	if (kind === "idle") {
		setBase(g, "idle");
		return true;
	}
	if (kind === "run") {
		setBase(g, "run");
		return true;
	}
	if (kind === "attack") doAttack(c);
	else if (kind === "hit") doHit(c);
	else if (kind === "knockdown") doKnockdown(c);
	else if (kind === "stun") doStun(c);
	else doSpecial(c);
	return false;
}

// ---------------------------------------------------------------- public API

/** Starts (or restarts) a demo action. Cancels whatever was running and resets both actors first. */
export function stageAction(kind: ActionKind): void {
	const g = general;
	const d = dummy;
	if (!active || g === undefined || d === undefined) return;
	actionToken += 1;
	const token = actionToken;
	fx.reset();
	resetActor(g);
	resetActor(d);
	radiusTarget = baseRadius();
	task.spawn(() => {
		let persistent = true;
		fx.guard(() => {
			persistent = perform(kind, g, d);
		});
		if (!persistent && token === actionToken) {
			resetActor(g);
			resetActor(d);
			radiusTarget = baseRadius();
		}
	});
}

export function stageSetSpeed(s: number): void {
	fx.setTimeScale(s);
	if (general !== undefined) applySpeed(general);
	if (dummy !== undefined) applySpeed(dummy);
}

export function stageSetPreset(i: number): void {
	autoOrbit = false;
	presetIdx = i;
	azimuth = CAM_PRESETS[i];
	radiusTarget = baseRadius();
}

/** Toggles the slow auto-orbit; returns the new state. */
export function stageToggleOrbit(): boolean {
	autoOrbit = !autoOrbit;
	return autoOrbit;
}

export function isStageActive(): boolean {
	return active;
}

function spawnActors(charId: string): boolean {
	if (env === undefined) return false;
	if (general !== undefined) destroyActor(general);
	if (dummy !== undefined) destroyActor(dummy);
	general = undefined;
	dummy = undefined;
	const g = makeGeneral(charId, env.folder, STAGE_CENTER, LOOK);
	if (g === undefined) return false;
	general = g;
	dummy = makeDummy(env.folder, STAGE_CENTER.add(LOOK.mul(DUMMY_DIST)), LOOK.mul(-1));
	applySpeed(g);
	return true;
}

/** Enters the stage (or switches general when already on it). Returns false when the general's avatar is not available. */
function applyStageLighting(): void {
	const L = game.GetService("Lighting");
	const saved = new Map<Instance, Map<string, unknown>>();
	const keep = (inst: Instance, props: Record<string, unknown>) => {
		const m = new Map<string, unknown>();
		for (const [k] of pairs(props)) m.set(k as string, (inst as unknown as Record<string, unknown>)[k as string]);
		saved.set(inst, m);
		for (const [k, v] of pairs(props)) (inst as unknown as Record<string, unknown>)[k as string] = v;
	};
	keep(L, { Brightness: 1.2, ExposureCompensation: -0.25, Ambient: Color3.fromRGB(125, 120, 150), OutdoorAmbient: Color3.fromRGB(125, 120, 150) });
	for (const c of L.GetChildren()) {
		if (c.IsA("BloomEffect")) keep(c, { Intensity: 0.15 });
		else if (c.IsA("DepthOfFieldEffect") || c.IsA("SunRaysEffect")) keep(c, { Enabled: false });
		else if (c.IsA("Atmosphere")) keep(c, { Density: 0, Haze: 0, Glare: 0 });
	}
	savedLight = saved;
}

function restoreLighting(): void {
	if (savedLight === undefined) return;
	for (const [inst, m] of savedLight) {
		for (const [k, v] of m) (inst as unknown as Record<string, unknown>)[k] = v;
	}
	savedLight = undefined;
}

export function enterStage(charId: string): boolean {
	if (env === undefined) env = buildStageEnv();
	if (!active) {
		const cam = Workspace.CurrentCamera;
		if (cam !== undefined) {
			savedType = cam.CameraType;
			savedCFrame = cam.CFrame;
			savedFov = cam.FieldOfView;
		}
		Workspace.SetAttribute("ShowroomActive", true);
		applyStageLighting();
		env.folder.Parent = Workspace;
		fx.setRoot(env.fxFolder);
		presetIdx = 1;
		azimuth = CAM_PRESETS[1];
		focus = 0;
		radius = CAM_BASE_RADIUS;
		radiusTarget = baseRadius();
		autoOrbit = false;
		RunService.BindToRenderStep(STEP_NAME, Enum.RenderPriority.Camera.Value + 2, updateCamera);
		mouseConn = UserInputService.InputChanged.Connect((input) => {
			if (input.UserInputType === Enum.UserInputType.MouseMovement && UserInputService.IsMouseButtonPressed(Enum.UserInputType.MouseButton2)) {
				azimuth -= input.Delta.X * 0.006;
			}
		});
		active = true;
	}
	actionToken += 1;
	fx.reset();
	ctxChar = charId;
	const ok = spawnActors(charId);
	if (!ok) warn(`[showroom] avatar for ${ctxChar} not available`);
	radiusTarget = baseRadius();
	return ok;
}

/** Leaves the stage: cancels effects, removes the actors and restores the match camera. */
export function leaveStage(): void {
	if (!active) return;
	active = false;
	actionToken += 1;
	fx.reset();
	fx.destroyFlash();
	RunService.UnbindFromRenderStep(STEP_NAME);
	if (mouseConn !== undefined) {
		mouseConn.Disconnect();
		mouseConn = undefined;
	}
	if (general !== undefined) destroyActor(general);
	if (dummy !== undefined) destroyActor(dummy);
	general = undefined;
	dummy = undefined;
	if (env !== undefined) env.folder.Parent = undefined;
	fx.setTimeScale(1);
	restoreLighting();
	const cam = Workspace.CurrentCamera;
	if (cam !== undefined) {
		if (savedType !== undefined) cam.CameraType = savedType;
		if (savedCFrame !== undefined) cam.CFrame = savedCFrame;
		cam.FieldOfView = savedFov;
	}
	Workspace.SetAttribute("ShowroomActive", false);
}
