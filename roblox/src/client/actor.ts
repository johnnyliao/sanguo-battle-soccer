// Showroom stage actors: the general and the training dummy. Wraps an avatar (anchored HumanoidRootPart driven by CFrame)
// with a simple pose model (foot position, facing, backward tilt, spin), cached animation tracks and weapon trails.
import { CHAR_ANIMS } from "./animIds";
import { DEFAULT_RUN_ID, getAvatarTemplate, makeAvatar } from "./avatars";
import * as fx from "./fx";
import { initWeaponPose, resetWeaponPose } from "./weaponPose";

const AVATAR_HEIGHT = 8.8;
const FADE = 0.12;
const DUMMY_GREY = Color3.fromRGB(120, 115, 108);

export interface Actor {
	charId: string;
	model: Model;
	root: BasePart;
	footOffset: number;
	/** True when the model is a real R15 avatar (root.CFrame drives it); false for the parts fallback dummy (PivotTo). */
	isRig: boolean;
	animator: Animator | undefined;
	idle: AnimationTrack | undefined;
	cache: Map<string, AnimationTrack>;
	/** Currently playing one-shot tracks. */
	active: AnimationTrack[];
	loops: AnimationTrack[];
	trails: Trail[];
	foot: Vector3;
	look: Vector3;
	/** Backward tilt about the feet (radians, pi/2 = lying on the back). */
	tilt: number;
	/** Extra yaw about the vertical axis (spin). */
	yawAdd: number;
	/** Extra world-space lift (jump / flight). */
	lift: number;
	homeFoot: Vector3;
	homeLook: Vector3;
}

/** Bright signature colour per character (weapon trail and effect tint). */
export const CHAR_COLOR: Record<string, Color3> = {
	guanyu: Color3.fromRGB(70, 255, 120),
	zhangfei: Color3.fromRGB(255, 120, 40),
	zhaoyun: Color3.fromRGB(255, 235, 120),
	zhugeliang: Color3.fromRGB(110, 230, 255),
	machao: Color3.fromRGB(255, 200, 60),
	zhangliao: Color3.fromRGB(190, 110, 255),
	simayi: Color3.fromRGB(170, 90, 255),
	xuchu: Color3.fromRGB(255, 140, 30),
	caocao: Color3.fromRGB(90, 160, 255),
	sunce: Color3.fromRGB(60, 210, 255),
	zhenji: Color3.fromRGB(170, 235, 255),
	xiaoqiao: Color3.fromRGB(255, 130, 200),
	daqiao: Color3.fromRGB(255, 110, 230),
	sunquan: Color3.fromRGB(255, 90, 80),
	zhouyu: Color3.fromRGB(255, 80, 60),
};

export function colorOf(charId: string): Color3 {
	return CHAR_COLOR[charId] ?? Color3.fromRGB(255, 255, 255);
}

export function poseCF(a: Actor): CFrame {
	const groundLift = math.abs(math.sin(a.tilt)) * 1.0 + a.lift;
	const base = CFrame.lookAt(a.foot.add(new Vector3(0, groundLift, 0)), a.foot.add(new Vector3(0, groundLift, 0)).add(a.look)).mul(CFrame.Angles(0, a.yawAdd, 0));
	return base.mul(CFrame.Angles(a.tilt, 0, 0)).mul(new CFrame(0, a.footOffset, 0));
}

export function place(a: Actor): void {
	const cf = poseCF(a);
	if (a.isRig) {
		a.root.CFrame = cf;
	} else {
		a.model.PivotTo(cf);
	}
}

function makeActor(charId: string, model: Model, root: BasePart, footOffset: number, isRig: boolean, animator: Animator | undefined, foot: Vector3, look: Vector3): Actor {
	return {
		charId,
		model,
		root,
		footOffset,
		isRig,
		animator,
		idle: undefined,
		cache: new Map<string, AnimationTrack>(),
		active: [],
		loops: [],
		trails: [],
		foot,
		look,
		tilt: 0,
		yawAdd: 0,
		lift: 0,
		homeFoot: foot,
		homeLook: look,
	};
}

/** Builds the general (full avatar with weapon) at `foot` facing `look`. */
export function makeGeneral(charId: string, parent: Instance, foot: Vector3, look: Vector3): Actor | undefined {
	const template = getAvatarTemplate(charId);
	if (template === undefined) return undefined;
	const view = makeAvatar(template, parent, AVATAR_HEIGHT, charId);
	const a = makeActor(charId, view.model, view.root, view.footOffset, true, view.animator, foot, look);
	a.idle = view.idle;
	buildTrails(a);
	initWeaponPose(a.model, charId, a.root);
	place(a);
	return a;
}

function destroyAll(list: Instance[]): void {
	for (const i of list) i.Destroy();
}

function tintGrey(model: Model): void {
	const kill: Instance[] = [];
	for (const d of model.GetDescendants()) {
		if (d.IsA("SurfaceAppearance") || d.IsA("Decal") || d.IsA("Texture") || d.IsA("Shirt") || d.IsA("Pants") || d.IsA("ShirtGraphic") || d.IsA("CharacterMesh")) {
			kill.push(d);
		} else if (d.IsA("MeshPart")) {
			d.TextureID = "";
			d.Color = DUMMY_GREY;
			d.Material = Enum.Material.SmoothPlastic;
		} else if (d.IsA("BasePart") && d.Name !== "HumanoidRootPart") {
			d.Color = DUMMY_GREY;
			d.Material = Enum.Material.SmoothPlastic;
		}
	}
	destroyAll(kill);
}

function partsDummy(parent: Instance, foot: Vector3, look: Vector3): Actor {
	const model = new Instance("Model");
	model.Name = "Dummy";
	const specs: [Vector3, Vector3][] = [
		[new Vector3(2.2, 2.8, 1.2), new Vector3(0, 4.4, 0)],
		[new Vector3(0.9, 3, 0.9), new Vector3(-0.6, 1.5, 0)],
		[new Vector3(0.9, 3, 0.9), new Vector3(0.6, 1.5, 0)],
		[new Vector3(0.8, 2.8, 0.8), new Vector3(-1.6, 4.4, 0)],
		[new Vector3(0.8, 2.8, 0.8), new Vector3(1.6, 4.4, 0)],
	];
	const root = new Instance("Part");
	root.Name = "HumanoidRootPart";
	root.Size = new Vector3(1, 1, 1);
	root.Transparency = 1;
	root.Anchored = true;
	root.CanCollide = false;
	root.CanQuery = false;
	root.CanTouch = false;
	root.CFrame = new CFrame(0, 3.9, 0);
	root.Parent = model;
	const addPart = (p: Part): void => {
		p.CanCollide = false;
		p.CanQuery = false;
		p.CanTouch = false;
		p.Anchored = false;
		p.Color = DUMMY_GREY;
		p.Material = Enum.Material.SmoothPlastic;
		p.Parent = model;
		const w = new Instance("WeldConstraint");
		w.Part0 = root;
		w.Part1 = p;
		w.Parent = p;
	};
	for (const [size, pos] of specs) {
		const p = new Instance("Part");
		p.Size = size;
		p.CFrame = new CFrame(pos);
		addPart(p);
	}
	const head = new Instance("Part");
	head.Shape = Enum.PartType.Ball;
	head.Size = new Vector3(1.9, 1.9, 1.9);
	head.CFrame = new CFrame(0, 6.7, 0);
	addPart(head);
	const band = new Instance("Part");
	band.Size = new Vector3(2.3, 0.7, 1.3);
	band.CFrame = new CFrame(0, 4.8, 0);
	band.Material = Enum.Material.Neon;
	addPart(band);
	band.Color = Color3.fromRGB(255, 60, 60);
	band.Material = Enum.Material.Neon;
	model.PrimaryPart = root;
	model.Parent = parent;
	const a = makeActor("dummy", model, root, 3.9, false, undefined, foot, look);
	place(a);
	return a;
}

/** Grey training dummy: a tinted avatar clone (can play the shared hit clips); parts dummy when no avatar is available. */
export function makeDummy(parent: Instance, foot: Vector3, look: Vector3): Actor {
	for (const id of ["zhaoyun", "caocao", "guanyu", "zhangfei", "xuchu"]) {
		const template = getAvatarTemplate(id);
		if (template === undefined) continue;
		const view = makeAvatar(template, parent, AVATAR_HEIGHT, "dummy");
		view.model.Name = "Dummy";
		// Strip the cloned character's weapon, face and clothing; keep only a neutral grey body.
		const weapon = view.model.FindFirstChild("Weapon");
		if (weapon !== undefined) weapon.Destroy();
		tintGrey(view.model);
		const a = makeActor("dummy", view.model, view.root, view.footOffset, true, view.animator, foot, look);
		a.idle = view.idle;
		place(a);
		return a;
	}
	return partsDummy(parent, foot, look);
}

export function destroyActor(a: Actor): void {
	for (const t of a.active) t.Stop(0);
	a.model.Destroy();
}

// ---------------------------------------------------------------- weapon trails

function buildTrails(a: Actor): void {
	const weapon = a.model.FindFirstChild("Weapon");
	if (weapon === undefined) return;
	const color = colorOf(a.charId);
	for (const d of weapon.GetDescendants()) {
		if (!d.IsA("Attachment") || (d.Name !== "RightGrip" && d.Name !== "LeftGrip")) continue;
		const part = d.Parent;
		if (part === undefined || !part.IsA("BasePart")) continue;
		const s = part.Size;
		// Longest axis of the weapon part is its blade / shaft; the tip is the end farther from the grip.
		let axis = new Vector3(0, 1, 0);
		let half = s.Y / 2;
		let gripComp = d.Position.Y;
		if (s.X >= s.Y && s.X >= s.Z) {
			axis = new Vector3(1, 0, 0);
			half = s.X / 2;
			gripComp = d.Position.X;
		} else if (s.Z >= s.Y && s.Z >= s.X) {
			axis = new Vector3(0, 0, 1);
			half = s.Z / 2;
			gripComp = d.Position.Z;
		}
		const tipSign = gripComp > 0 ? -1 : 1;
		a.trails.push(fx.makeTrail(part, axis.mul(tipSign * half * 0.7), axis.mul(tipSign * half), color));
	}
}

export function setTrails(a: Actor, on: boolean): void {
	for (const t of a.trails) {
		t.Enabled = on;
		t.Lifetime = 0.18 / fx.getTimeScale();
		t.Transparency = new NumberSequence([new NumberSequenceKeypoint(0, 0.35), new NumberSequenceKeypoint(1, 1)]);
	}
}

// ---------------------------------------------------------------- animation

const warned = new Set<string>();

export function warnOnce(key: string, msg: string): void {
	if (warned.has(key)) return;
	warned.add(key);
	warn(msg);
}

export function getTrack(a: Actor, id: string, looped: boolean, priority: Enum.AnimationPriority): AnimationTrack | undefined {
	const cached = a.cache.get(id);
	if (cached !== undefined) {
		cached.Looped = looped;
		cached.Priority = priority;
		return cached;
	}
	if (a.animator === undefined) return undefined;
	const animator = a.animator;
	const anim = new Instance("Animation");
	anim.AnimationId = id;
	const [ok, track] = pcall(() => {
		return animator.LoadAnimation(anim);
	});
	if (!ok || track === undefined) return undefined;
	track.Looped = looped;
	track.Priority = priority;
	a.cache.set(id, track);
	return track;
}

/** Plays a clip once at Action priority on top of the base loop. Returns the track (undefined without an id). */
export function playOnce(a: Actor, id: string | undefined, speedMul = 1): AnimationTrack | undefined {
	if (id === undefined) return undefined;
	const t = getTrack(a, id, false, Enum.AnimationPriority.Action);
	if (t === undefined) return undefined;
	if (t.IsPlaying) t.Stop(0);
	t.Play(FADE);
	t.AdjustSpeed(fx.getTimeScale() * speedMul);
	if (!a.active.includes(t)) a.active.push(t);
	return t;
}

/** Plays a clip in a loop at Action priority (stun, etc.). */
export function playLoop(a: Actor, id: string | undefined): AnimationTrack | undefined {
	if (id === undefined) return undefined;
	const t = getTrack(a, id, true, Enum.AnimationPriority.Action);
	if (t === undefined) return undefined;
	if (!t.IsPlaying) t.Play(FADE);
	t.AdjustSpeed(fx.getTimeScale());
	if (!a.active.includes(t)) a.active.push(t);
	return t;
}

/** Waits for the clip's own length (in clip seconds, scaled by the time scale). Falls back to `fallback` when the length is unknown. */
export function waitTrack(t: AnimationTrack | undefined, fallback: number): boolean {
	if (t === undefined) return fx.wait(fallback);
	let waited = 0;
	while (t.Length <= 0 && waited < 0.6) {
		waited += task.wait();
	}
	const len = t.Length > 0 ? t.Length : fallback;
	return fx.wait(len);
}

export function stopActions(a: Actor): void {
	for (const t of a.active) {
		if (t.IsPlaying) t.Stop(FADE);
	}
	a.active = [];
}

/** Base loop: idle or run. */
export function setBase(a: Actor, kind: "idle" | "run"): void {
	const runId = CHAR_ANIMS[a.charId]?.run ?? DEFAULT_RUN_ID;
	const run = getTrack(a, runId, true, Enum.AnimationPriority.Movement);
	if (kind === "run") {
		if (run !== undefined) {
			if (!run.IsPlaying) run.Play(FADE);
			run.AdjustSpeed(fx.getTimeScale());
			if (!a.loops.includes(run)) a.loops.push(run);
		}
		if (a.idle !== undefined && a.idle.IsPlaying) a.idle.Stop(FADE);
	} else {
		if (run !== undefined && run.IsPlaying) run.Stop(FADE);
		if (a.idle !== undefined) {
			if (!a.idle.IsPlaying) a.idle.Play(FADE);
			a.idle.AdjustSpeed(fx.getTimeScale());
		}
	}
}

/** Re-applies the global time scale to everything currently playing. */
export function applySpeed(a: Actor): void {
	const s = fx.getTimeScale();
	for (const t of a.active) {
		if (t.IsPlaying) t.AdjustSpeed(s);
	}
	for (const t of a.loops) {
		if (t.IsPlaying) t.AdjustSpeed(s);
	}
	if (a.idle !== undefined && a.idle.IsPlaying) a.idle.AdjustSpeed(s);
	for (const t of a.trails) t.Lifetime = 0.3 / s;
}

/** Back to the home pose: no action clips, no tilt / spin / lift, idle loop, trails off. */
export function resetActor(a: Actor): void {
	stopActions(a);
	resetWeaponPose(a.model);
	setTrails(a, false);
	a.foot = a.homeFoot;
	a.look = a.homeLook;
	a.tilt = 0;
	a.yawAdd = 0;
	a.lift = 0;
	setBase(a, "idle");
	place(a);
}

// ---------------------------------------------------------------- pose tweens (all yield; return false when cancelled)

export function moveTo(a: Actor, to: Vector3, dur: number, arc = 0): boolean {
	const from = a.foot;
	return fx.run(dur, (t) => {
		a.foot = from.Lerp(to, t);
		a.lift = math.sin(t * math.pi) * arc;
		place(a);
	});
}

export function tiltTo(a: Actor, target: number, dur: number): boolean {
	const from = a.tilt;
	return fx.run(dur, (t) => {
		a.tilt = fx.lerp(from, target, fx.easeOut(t));
		place(a);
	});
}

/** Faces the actor toward a horizontal direction. */
export function face(a: Actor, dir: Vector3): void {
	const flat = new Vector3(dir.X, 0, dir.Z);
	if (flat.Magnitude > 0.01) a.look = flat.Unit;
	place(a);
}
