// 3D R15 avatar models for match players. Templates are cloned from ReplicatedStorage.Avatars (copied there by server/avatars.server.ts).
import { CHAR_ANIMS } from "./animIds";
import { attachWeapons } from "./weapons";

const ReplicatedStorage = game.GetService("ReplicatedStorage");
const ContentProvider = game.GetService("ContentProvider");

/** Fallback idle/run clips for characters without their own CHAR_ANIMS entry. */
export const DEFAULT_IDLE_ID = "rbxassetid://507766388";
export const DEFAULT_RUN_ID = "rbxassetid://913376220";
/** Smoothed horizontal foot speed (studs/s) above which an avatar switches to run. */
const MOVE_ON_SPEED = 4;
/** Smoothed speed (studs/s) below which an avatar switches back to idle. */
const MOVE_OFF_SPEED = 1.5;
/** Time constant (s) of the foot-speed low-pass filter. */
const SPEED_TAU = 0.12;
/** Minimum time (s) a moving/idle state must hold before it can flip. */
const STATE_HOLD = 0.25;
/** Foot speed (studs/s) at which the run animation plays at normal speed. */
const RUN_REF_SPEED = 14;
const FADE_TIME = 0.15;
const LYING_LIFT = 0.6;
const SHAKE_AMP = 0.25;

export interface AvatarView {
	model: Model;
	root: BasePart;
	footOffset: number;
	animator: Animator | undefined;
	idle: AnimationTrack | undefined;
	run: AnimationTrack | undefined;
	/** Idle animation asset id used by this avatar (per-character or default). */
	idleId: string;
	/** Run animation asset id used by this avatar (per-character or default). */
	runId: string;
	/** Clock time (os.clock) the current idle track was loaded or last started. */
	idleLoadedAt: number;
	/** Clock time (os.clock) the current run track was loaded or last started. */
	runLoadedAt: number;
	/** Clock time (os.clock) of the last track reload on this avatar (rate limit). */
	lastReloadAt: number;
	lastFoot: Vector3 | undefined;
	lastClock: number;
	/** Smoothed horizontal foot speed (studs/s). */
	speed: number;
	moving: boolean;
	/** Clock time at which `moving` last changed. */
	stateSince: number;
	/** Whether the run track is currently requested to play (drives Play/Stop transitions). */
	runState: boolean;
	/** Last horizontal facing (unit vector). Kept when a zero facing arrives. */
	facing: Vector3;
}

let avatarFolder: Instance | undefined;
let avatarFolderLooked = false;

/** Returns the cached ReplicatedStorage.Avatars folder; waits once (10 s), then gives up for good. */
function getAvatarFolder(): Instance | undefined {
	if (!avatarFolderLooked) {
		avatarFolderLooked = true;
		avatarFolder = ReplicatedStorage.WaitForChild("Avatars", 10);
	}
	return avatarFolder;
}

function makeAnimation(id: string): Animation {
	const anim = new Instance("Animation");
	anim.AnimationId = id;
	return anim;
}

/** One cached Animation instance per asset id, shared by all avatars. */
const animCache = new Map<string, Animation>();

function getAnim(id: string): Animation {
	const cached = animCache.get(id);
	if (cached !== undefined) return cached;
	const anim = makeAnimation(id);
	animCache.set(id, anim);
	return anim;
}

let preloadStarted = false;

/** Preloads the default and every per-character animation once per session. Runs in a spawned thread so callers never yield. */
function preloadAnimations(): void {
	if (preloadStarted) return;
	preloadStarted = true;
	task.spawn(() => {
		const ids: string[] = [DEFAULT_IDLE_ID, DEFAULT_RUN_ID];
		for (const [, anims] of pairs(CHAR_ANIMS)) {
			if (anims !== undefined) {
				if (anims.idle !== undefined) ids.push(anims.idle);
				if (anims.run !== undefined) ids.push(anims.run);
			}
		}
		const assets: Instance[] = [];
		for (const id of ids) {
			assets.push(getAnim(id));
		}
		pcall(() => {
			ContentProvider.PreloadAsync(assets);
		});
	});
}

export function getAvatarTemplate(charId: string): Model | undefined {
	const folder = getAvatarFolder();
	if (folder === undefined) return undefined;
	const found = folder.FindFirstChild(charId);
	if (found !== undefined && found.IsA("Model")) return found;
	return undefined;
}

function loadTrack(animator: Animator, anim: Animation): AnimationTrack | undefined {
	const [ok, track] = pcall(() => {
		return animator.LoadAnimation(anim);
	});
	if (ok && track !== undefined) return track;
	return undefined;
}

/** A track still at Length 0 this long after it was loaded/started is treated as broken and reloaded. */
const STALE_TRACK_TIME = 0.5;
/** Minimum gap (s) between track reloads on one avatar. */
const RELOAD_MIN_GAP = 1.0;

/** Returns a usable run track, reloading it first if it is missing or stuck at Length 0. */
function ensureRun(v: AvatarView): AnimationTrack | undefined {
	const animator = v.animator;
	const old = v.run;
	if (animator === undefined) return old;
	const now = os.clock();
	const stale = old !== undefined && old.Length === 0 && now - v.runLoadedAt > STALE_TRACK_TIME;
	if ((old === undefined || stale) && now - v.lastReloadAt >= RELOAD_MIN_GAP) {
		if (old !== undefined) {
			old.Stop(0);
			old.Destroy();
		}
		const track = loadTrack(animator, getAnim(v.runId));
		if (track !== undefined) {
			track.Looped = true;
			track.Priority = Enum.AnimationPriority.Movement;
		}
		v.run = track;
		v.runLoadedAt = now;
		v.lastReloadAt = now;
	}
	return v.run;
}

/** Returns a usable idle track, reloading it first if it is missing or stuck at Length 0. */
function ensureIdle(v: AvatarView): AnimationTrack | undefined {
	const animator = v.animator;
	const old = v.idle;
	if (animator === undefined) return old;
	const now = os.clock();
	const stale = old !== undefined && old.Length === 0 && now - v.idleLoadedAt > STALE_TRACK_TIME;
	if ((old === undefined || stale) && now - v.lastReloadAt >= RELOAD_MIN_GAP) {
		if (old !== undefined) {
			old.Stop(0);
			old.Destroy();
		}
		const track = loadTrack(animator, getAnim(v.idleId));
		if (track !== undefined) {
			track.Looped = true;
			track.Priority = Enum.AnimationPriority.Idle;
		}
		v.idle = track;
		v.idleLoadedAt = now;
		v.lastReloadAt = now;
	}
	return v.idle;
}

export function makeAvatar(template: Model, parent: Instance, height: number, charId: string): AvatarView {
	preloadAnimations();
	const charAnims = CHAR_ANIMS[charId];
	const idleId = charAnims?.idle ?? DEFAULT_IDLE_ID;
	const runId = charAnims?.run ?? DEFAULT_RUN_ID;

	const model = template.Clone();
	// Measure the template's own rest height first: AI-generated templates have different native scales.
	const [, restSize] = model.GetBoundingBox();
	const h0 = restSize.Y;
	if (h0 > 0) {
		model.ScaleTo(model.GetScale() * (height / h0));
	}

	const root = model.FindFirstChild("HumanoidRootPart") as BasePart;
	for (const d of model.GetDescendants()) {
		if (d.IsA("BasePart")) {
			d.Anchored = d === root;
			d.CanCollide = false;
			d.CanQuery = false;
			d.CanTouch = false;
			d.CastShadow = true;
		} else if (d.IsA("Humanoid")) {
			d.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None;
			pcall(() => {
				d.EvaluateStateMachine = false;
			});
		}
	}

	const humanoid = model.FindFirstChildOfClass("Humanoid");
	let animator: Animator | undefined;
	if (humanoid !== undefined) {
		animator = humanoid.FindFirstChildOfClass("Animator");
		if (animator === undefined) {
			animator = new Instance("Animator");
			animator.Parent = humanoid;
		}
	}

	model.Parent = parent;

	const [boxCF, boxSize] = model.GetBoundingBox();
	const footOffset = root.Position.Y - (boxCF.Y - boxSize.Y / 2);
	// Weapons go on after the body measurements so the sword/spear does not change the foot offset.
	const templateScale = template.GetScale();
	attachWeapons(model, charId, templateScale > 0 ? model.GetScale() / templateScale : 1);

	const view: AvatarView = {
		model,
		root,
		footOffset,
		animator,
		idle: undefined,
		run: undefined,
		idleId,
		runId,
		idleLoadedAt: 0,
		runLoadedAt: 0,
		lastReloadAt: -10,
		lastFoot: undefined,
		lastClock: 0,
		speed: 0,
		moving: false,
		stateSince: 0,
		runState: false,
		facing: new Vector3(1, 0, 0),
	};

	if (animator !== undefined) {
		const idle = loadTrack(animator, getAnim(idleId));
		if (idle !== undefined) {
			idle.Looped = true;
			idle.Priority = Enum.AnimationPriority.Idle;
			idle.Play(FADE_TIME);
			view.idleLoadedAt = os.clock();
		}
		view.idle = idle;
	}
	return view;
}

export function drawAvatar(v: AvatarView, foot: Vector3, fx: number, fz: number, act: string, now: number): void {
	const last = v.lastFoot;
	if (last !== undefined) {
		const dt = now - v.lastClock;
		if (dt > 0) {
			const dx = foot.X - last.X;
			const dz = foot.Z - last.Z;
			const raw = math.sqrt(dx * dx + dz * dz) / dt;
			v.speed += (raw - v.speed) * (1 - math.exp(-dt / SPEED_TAU));
		}
	}
	v.lastFoot = foot;
	v.lastClock = now;

	// Hysteresis with a minimum hold time so the state cannot chatter frame to frame.
	if (now - v.stateSince >= STATE_HOLD) {
		if (!v.moving && v.speed > MOVE_ON_SPEED) {
			v.moving = true;
			v.stateSince = now;
		} else if (v.moving && v.speed < MOVE_OFF_SPEED) {
			v.moving = false;
			v.stateSince = now;
		}
	}

	const len = math.sqrt(fx * fx + fz * fz);
	if (len > 1e-6) {
		v.facing = new Vector3(fx / len, 0, fz / len);
	}
	const base = CFrame.lookAt(foot, foot.add(v.facing));

	let rootCF: CFrame;
	if (act === "down") {
		rootCF = base.mul(new CFrame(0, LYING_LIFT, 0)).mul(CFrame.Angles(-math.pi / 2, 0, 0));
	} else {
		const shake = act === "hitstun" || act === "fear" ? math.sin(now * 40) * SHAKE_AMP : 0;
		rootCF = base.mul(new CFrame(0, v.footOffset, 0)).mul(new CFrame(shake, 0, 0));
	}
	v.root.CFrame = rootCF;

	// Only touch the tracks when the desired state actually changes.
	const wantRun = v.moving && act === "normal";
	if (wantRun !== v.runState) {
		v.runState = wantRun;
		if (wantRun) {
			const runAtSwitch = ensureRun(v);
			if (runAtSwitch !== undefined && !runAtSwitch.IsPlaying) {
				runAtSwitch.Play(FADE_TIME);
				v.runLoadedAt = os.clock();
			}
			const idleAtSwitch = v.idle;
			if (idleAtSwitch !== undefined && idleAtSwitch.IsPlaying) {
				idleAtSwitch.Stop(FADE_TIME);
			}
		} else {
			const runAtSwitch = v.run;
			if (runAtSwitch !== undefined && runAtSwitch.IsPlaying) {
				runAtSwitch.Stop(FADE_TIME);
			}
			const idleAtSwitch = ensureIdle(v);
			if (idleAtSwitch !== undefined && !idleAtSwitch.IsPlaying) {
				idleAtSwitch.Play(FADE_TIME);
				v.idleLoadedAt = os.clock();
			}
		}
	}
	// Per-frame stale check: reload (and restart) whichever track should be playing.
	if (wantRun) {
		const runBefore = v.run;
		const run = ensureRun(v);
		if (run !== undefined && run !== runBefore) {
			run.Play(FADE_TIME);
			v.runLoadedAt = os.clock();
		}
		if (run !== undefined) {
			run.AdjustSpeed(math.max(0.8, math.min(1.4, v.speed / RUN_REF_SPEED)));
		}
	} else {
		const idleBefore = v.idle;
		const idle = ensureIdle(v);
		if (idle !== undefined && idle !== idleBefore) {
			idle.Play(FADE_TIME);
			v.idleLoadedAt = os.clock();
		}
	}
}
