// 3D R15 avatar models for match players. Templates are cloned from ReplicatedStorage.Avatars (copied there by server/avatars.server.ts).
import { CHAR_ANIMS, SHARED_ANIMS } from "./animIds";
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
const SPEED_TAU = 0.05;
/** Minimum time (s) the run state must hold before it can flip back to idle. */
const STATE_HOLD = 0.25;
/** Minimum time (s) the idle state must hold before it can flip to run (short so starts feel instant). */
const START_HOLD = 0.04;
/** Foot speed (studs/s) at which the run animation plays at normal speed. */
const RUN_REF_SPEED = 7;
const FADE_TIME = 0.15;
/** Cross-fade (s) when an idle avatar starts running: short so the feet don't slide before the run clip takes over. */
const RUN_START_FADE = 0.05;
/**
 * Run clips with a built-in start-up and wind-down (legs nearly still for ~0.5-1.5 s at each end): loop only the
 * full-stride middle [start, end] (seconds), else the avatar freezes and slides each time the clip wraps.
 * Loop points were picked where leg/arm poses (and their motion) match, measured from the KeyframeSequences.
 */
const RUN_LOOP: Record<string, [number, number]> = {
	"rbxassetid://95464768606214": [0.567, 4.1], // caocao
	"rbxassetid://103448790801455": [0.9, 3.567], // guanyu
	"rbxassetid://134081281871778": [1.4, 4.067], // sunce
	"rbxassetid://85893275626604": [1.067, 3.833], // sunquan
	"rbxassetid://72455011180662": [0.8, 4.633], // xiaoqiao
	"rbxassetid://71478303740848": [1.5, 3.967], // zhangfei
	"rbxassetid://104333416659621": [1.633, 4.7], // zhangliao
	"rbxassetid://101320311313061": [0.967, 3.833], // zhouyu + zhugeliang
};
const LYING_LIFT = 0.6;
const SHAKE_AMP = 0.25;
/** Seconds in hitstun after which the avatar switches from the hit flinch to the stun loop. */
const STUN_AFTER = 0.45;
const SIT_ANIM = "rbxassetid://2506281703";

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
	charId: string;
	/** Action clips (attack / special / hit / knockdown / ...) loaded once per asset id. */
	tracks: Map<string, AnimationTrack>;
	/** Current action key ("" = none): attack | hit | stun | down | dive | getup | charge | special. */
	curKey: string;
	curTrack: AnimationTrack | undefined;
	curSince: number;
	curSecs: number;
	curHold: number;
	curSpeedSet: boolean;
	curHeld: boolean;
	/** Bumped by the renderer on every attack event so the attack clip restarts. */
	attackSeq: number;
	seenAttack: number;
	specialPending: boolean;
	sit: AnimationTrack | undefined;
	sitOn: boolean;
	/** True when the shared knockdown clip exists, so the root is not rotated to fake lying down. */
	hasClips: boolean;
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
				if (anims.attack !== undefined) ids.push(anims.attack);
				if (anims.special !== undefined) ids.push(anims.special);
			}
		}
		for (const id of [SHARED_ANIMS.hit, SHARED_ANIMS.knockdown, SHARED_ANIMS.getup, SHARED_ANIMS.stun, SIT_ANIM]) {
			if (id !== undefined) ids.push(id);
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
		charId,
		tracks: new Map<string, AnimationTrack>(),
		curKey: "",
		curTrack: undefined,
		curSince: 0,
		curSecs: 0,
		curHold: 0,
		curSpeedSet: false,
		curHeld: false,
		attackSeq: 0,
		seenAttack: 0,
		specialPending: false,
		sit: undefined,
		sitOn: false,
		hasClips: animator !== undefined && SHARED_ANIMS.knockdown !== undefined,
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

/** Loads (once) the action clip with this asset id. */
function actTrack(v: AvatarView, id: string | undefined, looped: boolean): AnimationTrack | undefined {
	if (id === undefined || v.animator === undefined) return undefined;
	const cached = v.tracks.get(id);
	if (cached !== undefined) return cached;
	const t = loadTrack(v.animator, getAnim(id));
	if (t === undefined) return undefined;
	t.Looped = looped;
	t.Priority = Enum.AnimationPriority.Action;
	v.tracks.set(id, t);
	return t;
}

function stopCur(v: AvatarView): void {
	const t = v.curTrack;
	if (t !== undefined && t.IsPlaying) t.Stop(0.12);
	v.curTrack = undefined;
	v.curKey = "";
}

/** Starts an action clip. secs > 0 stretches / squeezes it to that many seconds; hold > 0 freezes it at that fraction of its length. */
function startCur(v: AvatarView, key: string, id: string | undefined, looped: boolean, secs: number, hold: number, now: number): void {
	stopCur(v);
	const t = actTrack(v, id, looped);
	v.curKey = key;
	v.curSince = now;
	v.curSecs = secs;
	v.curHold = hold;
	v.curSpeedSet = false;
	v.curHeld = false;
	v.curTrack = t;
	if (t === undefined) return;
	t.Looped = looped;
	if (t.IsPlaying) t.Stop(0);
	t.Play(0.06);
	t.AdjustSpeed(1);
}

function tickCur(v: AvatarView): void {
	const t = v.curTrack;
	if (t === undefined || t.Length <= 0) return;
	if (!v.curSpeedSet) {
		v.curSpeedSet = true;
		if (v.curSecs > 0) t.AdjustSpeed(math.max(0.5, math.min(8, t.Length / v.curSecs)));
	}
	if (v.curHold > 0 && !v.curHeld && t.TimePosition >= t.Length * v.curHold) {
		v.curHeld = true;
		t.AdjustSpeed(0);
	}
	// Charging a shot while dribbling: let the run clip show instead of a frozen wind-up pose sliding across the pitch.
	if (v.curKey === "charge") {
		const w = v.moving ? 0.001 : 1;
		if (math.abs(t.WeightTarget - w) > 0.01) t.AdjustWeight(w, 0.1);
	}
}

/** Longest time (s) a finished-action clip is allowed to linger after the sim action has ended. */
function lingerFor(key: string): number {
	if (key === "special") return 2.5;
	if (key === "attack" || key === "hit" || key === "getup") return 0.5;
	return 0;
}

/** Maps the snapshot action to an action clip (priority over idle / run) and starts / stops it on changes. */
function updateAction(v: AvatarView, act: string, now: number): void {
	const ca = CHAR_ANIMS[v.charId];
	let want = "";
	if (act === "down") want = "down";
	else if (act === "hitstun") want = v.curKey === "stun" || (v.curKey === "hit" && now - v.curSince > STUN_AFTER) ? "stun" : "hit";
	else if (act === "recover") want = "getup";
	else if (act === "fear") want = "stun";
	else if (act === "punch" || act === "tackle") want = "attack";
	else if (act === "dive") want = "dive";
	else if (act === "charge") want = "charge";
	const reacting = act === "down" || act === "hitstun" || act === "recover" || act === "fear";
	if (want === "" && v.specialPending && !reacting) {
		want = "special";
		v.specialPending = false;
	} else if (reacting || want !== "") {
		v.specialPending = false;
	}
	let force = false;
	if (v.attackSeq !== v.seenAttack) {
		v.seenAttack = v.attackSeq;
		if (want === "attack" || want === "") {
			want = "attack";
			force = true;
		}
	}
	if (want === "" && v.curKey !== "" && v.curTrack !== undefined) {
		const lim = lingerFor(v.curKey);
		if (lim > 0 && v.curTrack.IsPlaying && now - v.curSince < lim) want = v.curKey;
	}
	if (want === v.curKey && !force) {
		tickCur(v);
		return;
	}
	if (want === "") stopCur(v);
	else if (want === "attack") startCur(v, "attack", ca?.attack, false, act === "tackle" ? 0.21 : 0.15, 0, now);
	else if (want === "hit") startCur(v, "hit", SHARED_ANIMS.hit, false, 0.35, 0, now);
	else if (want === "stun") startCur(v, "stun", SHARED_ANIMS.stun, true, 0, 0, now);
	else if (want === "down") startCur(v, "down", SHARED_ANIMS.knockdown, false, 0.5, 0.94, now);
	else if (want === "dive") startCur(v, "dive", SHARED_ANIMS.knockdown, false, 0.3, 0.94, now);
	else if (want === "getup") startCur(v, "getup", SHARED_ANIMS.getup, false, 0.35, 0, now);
	else if (want === "charge") startCur(v, "charge", ca?.attack, false, 0.3, 0.35, now);
	else startCur(v, "special", ca?.special, false, 0, 0, now);
	tickCur(v);
}

/** Loops the R15 sit clip over everything else while mounted. */
function setSit(v: AvatarView, on: boolean): void {
	if (on === v.sitOn) return;
	v.sitOn = on;
	if (on) {
		let t = v.sit;
		if (t === undefined && v.animator !== undefined) {
			t = loadTrack(v.animator, getAnim(SIT_ANIM));
			if (t !== undefined) {
				t.Looped = true;
				t.Priority = Enum.AnimationPriority.Action4;
			}
			v.sit = t;
		}
		if (t !== undefined) t.Play(0.1);
	} else if (v.sit !== undefined && v.sit.IsPlaying) {
		v.sit.Stop(0.15);
	}
}

/** Restarts the attack clip on the next draw (call on every attack event). */
export function triggerAttack(v: AvatarView): void {
	v.attackSeq += 1;
}

/** Plays the character's special clip once on the next draw (when the sim action is not a reaction). */
export function triggerSpecial(v: AvatarView): void {
	v.specialPending = true;
}

export function drawAvatar(v: AvatarView, foot: Vector3, fx: number, fz: number, act: string, now: number, rootOverride?: CFrame, mount?: string): void {
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
	const held = now - v.stateSince;
	if (!v.moving && held >= START_HOLD && v.speed > MOVE_ON_SPEED) {
		v.moving = true;
		v.stateSince = now;
	} else if (v.moving && held >= STATE_HOLD && v.speed < MOVE_OFF_SPEED) {
		v.moving = false;
		v.stateSince = now;
	}

	const len = math.sqrt(fx * fx + fz * fz);
	if (len > 1e-6) {
		v.facing = new Vector3(fx / len, 0, fz / len);
	}
	const base = CFrame.lookAt(foot, foot.add(v.facing));

	let rootCF: CFrame;
	if (rootOverride !== undefined) {
		rootCF = rootOverride;
	} else if (act === "down" && !v.hasClips) {
		rootCF = base.mul(new CFrame(0, LYING_LIFT, 0)).mul(CFrame.Angles(-math.pi / 2, 0, 0));
	} else {
		const shake = !v.hasClips && (act === "hitstun" || act === "fear") ? math.sin(now * 40) * SHAKE_AMP : 0;
		rootCF = base.mul(new CFrame(0, v.footOffset, 0)).mul(new CFrame(shake, 0, 0));
	}
	v.root.CFrame = rootCF;
	setSit(v, mount === "sit");
	updateAction(v, act, now);

	// Only touch the tracks when the desired state actually changes.
	// Attacks / charging keep the legs running underneath (the action clip overrides the upper body); otherwise a short
	// attack clip ends while the sim still carries the player forward and the idle pose slides across the pitch.
	const legsFree = act === "normal" || act === "punch" || act === "tackle" || act === "charge";
	const wantRun = v.moving && legsFree && rootOverride === undefined;
	if (wantRun !== v.runState) {
		v.runState = wantRun;
		if (wantRun) {
			const runAtSwitch = ensureRun(v);
			if (runAtSwitch !== undefined && !runAtSwitch.IsPlaying) {
				runAtSwitch.Play(RUN_START_FADE);
				v.runLoadedAt = os.clock();
			}
			const idleAtSwitch = v.idle;
			if (idleAtSwitch !== undefined && idleAtSwitch.IsPlaying) {
				idleAtSwitch.Stop(RUN_START_FADE);
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
			run.AdjustSpeed(math.max(1.6, math.min(2.8, v.speed / RUN_REF_SPEED)));
			const loop = RUN_LOOP[v.runId];
			if (loop !== undefined && run.IsPlaying && run.Length > 0) {
				const [l0, l1] = loop;
				const tp = run.TimePosition;
				if (tp < l0 - 0.01) run.TimePosition = l0;
				else if (tp >= l1) run.TimePosition = l0 + ((tp - l1) % (l1 - l0));
			}
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
