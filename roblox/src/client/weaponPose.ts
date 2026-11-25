// Stage-only weapon orientation controller. For long / heavy weapons (spear, glaive, axes, hammer, whip) the rigid hand Weld is
// disabled and the weapon CFrame is set every frame: the grip point follows the hand's grip attachment, while the ORIENTATION
// (and an optional slide offset) comes from code, using the general's frame (F forward toward the dummy, U up, S right).
import * as fx from "./fx";

const RunService = game.GetService("RunService");

type WClass = "spear" | "glaive" | "axes" | "hammer" | "whip";

const CLASS_OF: Record<string, WClass> = {
	zhaoyun: "spear",
	zhangfei: "spear",
	machao: "spear",
	guanyu: "glaive",
	zhangliao: "axes",
	sunce: "hammer",
	xuchu: "hammer",
	zhenji: "whip",
};

/** Attack phase (0..1) at which the hit lands, per class. */
const IMPACT: Record<WClass, number> = { spear: 0.45, glaive: 0.5, axes: 0.55, hammer: 0.52, whip: 0.5 };

/** Stage-only size multiplier for oversized weapons (grip attachments are scaled with the part). */
const WSCALE: Record<string, number> = { xuchu: 0.62, sunce: 0.75 };

interface Piece {
	part: BasePart;
	grip: Attachment;
	weld: Weld | undefined;
	/** Local long axis (unit, pointing from the grip toward the far end) and local flat normal. */
	ax: Vector3;
	nm: Vector3;
	gripLocal: Vector3;
	side: number;
	/** Thickness of the weapon across its flat normal (used to keep wide heads clear of the body). */
	span: number;
}

interface Ctl {
	cls: WClass;
	root: BasePart;
	pieces: Piece[];
	hands: Map<Piece, Attachment>;
	conn: RBXScriptConnection | undefined;
	len: number;
	elapsed: number;
	attacking: boolean;
	/** Forced forward-level pose (spear lunge in the special). */
	hold: boolean;
	/** Alternate rest pose (hand held high: weapon points forward-down, away from the face). */
	alt: boolean;
}

const ctls = new Map<Model, Ctl>();

function axisVec(i: number): Vector3 {
	if (i === 0) return new Vector3(1, 0, 0);
	if (i === 1) return new Vector3(0, 1, 0);
	return new Vector3(0, 0, 1);
}

function comp(v: Vector3, i: number): number {
	if (i === 0) return v.X;
	if (i === 1) return v.Y;
	return v.Z;
}

function clamp01(x: number): number {
	return math.clamp(x, 0, 1);
}

/** Smoothstep of t over [a, b]. */
function sm(a: number, b: number, t: number): number {
	const x = clamp01((t - a) / (b - a));
	return x * x * (3 - 2 * x);
}

function nlerp(a: Vector3, b: Vector3, k: number): Vector3 {
	const v = a.Lerp(b, k);
	return v.Magnitude > 0.001 ? v.Unit : a;
}

function unit(v: Vector3): Vector3 {
	return v.Unit;
}

interface PoseOut {
	d: Vector3;
	n: Vector3;
	off: Vector3;
}

function poseFor(cls: WClass, t: number, side: number, span: number, F: Vector3, U: Vector3, S: Vector3, attacking: boolean, alt = false): PoseOut {
	const tt = attacking ? t : 0;
	const rec = 1 - sm(0.75, 1, tt);
	if (cls === "spear" || cls === "glaive") {
		const rest = cls === "spear" ? unit(U.mul(0.985).add(F.mul(0.174))) : unit(U.mul(0.5).add(F.mul(0.86)));
		if (cls === "spear") {
			// Quick draw-back with the spear levelled at chest height, then a hard drive forward, hold, recover.
			const pull = sm(0, 0.22, tt);
			const drive = sm(0.22, 0.42, tt);
			const keep = 1 - sm(0.68, 1, tt);
			const lvl = unit(F.add(U.mul(0.02)));
			const d = nlerp(rest, lvl, sm(0, 0.16, tt) * keep);
			const offF = (-0.6 * pull * (1 - drive) + 2.4 * drive) * keep;
			return { d, n: S, off: F.mul(offF).sub(U.mul(0.4 * pull * keep)) };
		}
		const behind = unit(F.mul(-0.6).add(U.mul(0.75)).add(S.mul(0.35)));
		const phi = math.rad(135 - 200 * sm(0.3, 0.6, tt));
		const h = F.mul(math.cos(phi)).add(S.mul(math.sin(phi)));
		let d = nlerp(rest, behind, sm(0, 0.3, tt));
		d = nlerp(d, h, sm(0.3, 0.4, tt));
		d = nlerp(d, rest, sm(0.75, 1, tt));
		const n = S.Lerp(U, sm(0.3, 0.4, tt) * rec);
		return { d, n, off: new Vector3(0, 0, 0) };
	}
	if (cls === "hammer") {
		// Rest: shaft resting back over the shoulder (head behind / above, never in front of the face).
		// Attack: lift high behind the head, then a full overhead slam down in front, hold, recover.
		const rest = alt ? unit(F.mul(0.7).sub(U.mul(0.55)).add(S.mul(0.25))) : unit(U.mul(0.8).add(S.mul(0.55)).add(F.mul(0.1)));
		const high = unit(U.mul(0.85).sub(F.mul(0.52)));
		const wind = sm(0, 0.4, tt);
		const slam = sm(0.4, 0.52, tt);
		const rc = sm(0.78, 1, tt);
		const psi = math.rad(-31 + 136 * slam * slam);
		let d = nlerp(rest, high, wind);
		if (tt >= 0.4) d = U.mul(math.cos(psi)).add(F.mul(math.sin(psi)));
		d = nlerp(d, rest, rc);
		const a = wind * (1 - slam);
		const b = slam * (1 - rc);
		const off = U.mul(0.15 * a - 0.2 * b).add(F.mul(-0.2 * a + 0.4 * b));
		return { d, n: S, off };
	}
	if (cls === "axes") {
		const rest = unit(F.mul(0.8).sub(U.mul(0.55)));
		const up = unit(U.mul(0.95).add(F.mul(0.1)).add(S.mul(0.3 * side)));
		const chop = unit(F.mul(0.7).sub(U.mul(0.7)).sub(S.mul(0.45 * side)));
		let d = nlerp(rest, up, sm(0, 0.4, tt));
		d = nlerp(d, chop, sm(0.4, 0.55, tt));
		d = nlerp(d, rest, sm(0.75, 1, tt));
		return { d, n: S.mul(side), off: new Vector3(0, 0, 0) };
	}
	// whip
	const rest = unit(U.mul(-0.95).add(F.mul(0.15)));
	const back = unit(F.mul(-0.7).add(U.mul(0.7)));
	const fwd = unit(F.sub(U.mul(0.1)));
	let d = nlerp(rest, back, sm(0, 0.35, tt));
	d = nlerp(d, fwd, sm(0.35, 0.55, tt));
	d = nlerp(d, rest, sm(0.7, 1, tt));
	return { d, n: S, off: new Vector3(0, 0, 0) };
}

function step(model: Model, c: Ctl, dt: number): void {
	if (model.Parent === undefined) {
		if (c.conn !== undefined) c.conn.Disconnect();
		ctls.delete(model);
		return;
	}
	let t = 0;
	if (c.attacking) {
		c.elapsed += dt * fx.getTimeScale();
		t = clamp01(c.elapsed / c.len);
		if (c.elapsed >= c.len + 0.2) c.attacking = false;
	}
	const look = c.root.CFrame.LookVector;
	const flat = new Vector3(look.X, 0, look.Z);
	const F = flat.Magnitude > 0.01 ? flat.Unit : new Vector3(1, 0, 0);
	const U = new Vector3(0, 1, 0);
	const S = F.Cross(U);
	for (const p of c.pieces) {
		const hand = c.hands.get(p);
		if (hand === undefined) continue;
		let po = poseFor(c.cls, t, p.side, p.span, F, U, S, c.attacking, c.cls === "hammer" && c.alt);
		if (c.hold) po = { d: unit(F.add(U.mul(0.02))), n: S, off: F.mul(1.6) };
		const d = po.d;
		let n = po.n.sub(d.mul(po.n.Dot(d)));
		if (n.Magnitude < 0.05) n = U.sub(d.mul(U.Dot(d)));
		if (n.Magnitude < 0.05) n = S.sub(d.mul(S.Dot(d)));
		n = n.Unit;
		const wb = CFrame.fromMatrix(new Vector3(0, 0, 0), d, n);
		const lb = CFrame.fromMatrix(new Vector3(0, 0, 0), p.ax, p.nm);
		const rot = wb.mul(lb.Inverse());
		const pos = hand.WorldPosition.add(po.off).sub(rot.VectorToWorldSpace(p.gripLocal));
		p.part.CFrame = new CFrame(pos).mul(rot);
	}
}

/** Takes over the weapon of a stage general (no-op for sword / fan classes). */
export function initWeaponPose(model: Model, charId: string, root: BasePart): void {
	const cls = CLASS_OF[charId];
	if (cls === undefined) return;
	const weapon = model.FindFirstChild("Weapon");
	if (weapon === undefined) return;
	const c: Ctl = { cls, root, pieces: [], hands: new Map<Piece, Attachment>(), conn: undefined, len: 1, elapsed: 0, attacking: false, hold: false, alt: charId === "sunce" };
	const k = WSCALE[charId];
	if (k !== undefined) {
		const all: Instance[] = [weapon];
		for (const d of weapon.GetDescendants()) all.push(d);
		for (const d of all) {
			if (d.IsA("BasePart")) d.Size = d.Size.mul(k);
			else if (d.IsA("Attachment")) d.Position = d.Position.mul(k);
		}
	}
	for (const d of weapon.GetDescendants()) {
		if (!d.IsA("Attachment") || (d.Name !== "RightGrip" && d.Name !== "LeftGrip")) continue;
		const part = d.Parent;
		if (part === undefined || !part.IsA("BasePart")) continue;
		const isRight = d.Name === "RightGrip";
		const hand = model.FindFirstChild(isRight ? "RightHand" : "LeftHand");
		if (hand === undefined) continue;
		const handGrip = hand.FindFirstChild(isRight ? "RightGripAttachment" : "LeftGripAttachment");
		if (handGrip === undefined || !handGrip.IsA("Attachment")) continue;
		const s = part.Size;
		let ai = 0;
		if (s.Y >= s.X && s.Y >= s.Z) ai = 1;
		else if (s.Z >= s.X && s.Z >= s.Y) ai = 2;
		let ni = -1;
		for (let i = 0; i < 3; i++) {
			if (i === ai) continue;
			if (ni < 0 || comp(s, i) < comp(s, ni)) ni = i;
		}
		const g = comp(d.Position, ai);
		const sign = g > 0 ? -1 : 1;
		const weld = part.FindFirstChild("WeaponGrip");
		let w: Weld | undefined;
		if (weld !== undefined && weld.IsA("Weld")) {
			weld.Enabled = false;
			w = weld;
		}
		part.Anchored = true;
		const piece: Piece = {
			part,
			grip: d,
			weld: w,
			ax: axisVec(ai).mul(sign),
			nm: axisVec(ni),
			gripLocal: d.Position,
			side: isRight ? 1 : -1,
			span: comp(s, ni),
		};
		c.pieces.push(piece);
		c.hands.set(piece, handGrip);
	}
	if (c.pieces.size() === 0) return;
	c.conn = RunService.RenderStepped.Connect((dt) => step(model, c, dt));
	ctls.set(model, c);
}

/** Attack phase (0..1) at which the hit should land for this character, or undefined when not controlled. */
export function weaponImpactPhase(charId: string): number | undefined {
	const cls = CLASS_OF[charId];
	return cls === undefined ? undefined : IMPACT[cls];
}

export function weaponClassOf(charId: string): string | undefined {
	return CLASS_OF[charId];
}

/** Starts the scripted attack; `len` is the attack clip length in clip seconds. */
export function startWeaponAttack(model: Model, len: number): void {
	const c = ctls.get(model);
	if (c === undefined) return;
	c.len = len;
	c.elapsed = 0;
	c.attacking = true;
}

/** Forces the weapon level and pointing forward (true) or back to the normal pose (false). */
export function holdWeaponForward(model: Model, on: boolean): void {
	const c = ctls.get(model);
	if (c !== undefined) c.hold = on;
}

export function resetWeaponPose(model: Model): void {
	const c = ctls.get(model);
	if (c === undefined) return;
	c.hold = false;
	c.attacking = false;
	c.elapsed = 0;
}
