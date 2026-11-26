// Cao Cao's blade wave (刀氣): a vertical neon crescent (white-hot core + coloured glow layer), sword-trail tips,
// a backward spark emitter and a point light. Visual only. The wave is one Model; its parts are placed each frame
// from a root CFrame plus local offsets that are fixed at build time.
import * as fx from "./fx";
import { SPARKLE, WHITE } from "./matchUtil";

const RADIUS = 3.8; // core arc radius (studs)
const HALF_SPAN = math.rad(70); // half of the 140 degree arc
const CENTRE_Z = 2; // arc centre (local -Z is forward, so the convex side faces the travel direction)
const CORE_N = 14;
const GLOW_N = 10;
const GLOW_K = 1.22; // glow arc radius factor (slightly larger arc)
const CORE_THICK = 1.2; // crescent thickness at the middle
const TAPER_MIN = 0.12; // thickness at the sharp tips
const GLOW_TRANSPARENCY = 0.45;
const POP_TIME = 0.06;
const FADE_TIME = 0.15;
const ROLL = math.rad(25);

interface Piece {
	part: Part;
	pos: Vector3; // local position in the wave frame (before pop scaling)
	rot: CFrame; // local rotation
	size: Vector3; // size at full scale
	alpha: number; // base transparency
}

/** Crescent thickness at u in [-1, 1] (full at the apex, sharp at the tips). */
function thickAt(u: number, k: number): number {
	const a = math.abs(u);
	return math.max(TAPER_MIN, CORE_THICK * k * (1 - a * math.sqrt(a)));
}

/** Adds n neon segments along the crescent arc to out. Local frame: forward = -Z, up = +Y. */
function arcPieces(out: Piece[], parent: Model, n: number, radius: number, k: number, depth: number, color: Color3, alpha: number): void {
	const step = (2 * HALF_SPAN) / n;
	const len = radius * step * 1.3;
	for (let i = 0; i < n; i++) {
		const th = -HALF_SPAN + (i + 0.5) * step;
		const s = math.sin(th);
		const c = math.cos(th);
		const normal = new Vector3(0, s, -c);
		const tangent = new Vector3(0, c, s);
		const pos = new Vector3(0, radius * s, CENTRE_Z - radius * c);
		const rot = CFrame.fromMatrix(new Vector3(0, 0, 0), normal, new Vector3(-1, 0, 0), tangent);
		const size = new Vector3(thickAt(th / HALF_SPAN, k), depth, len);
		const part = fx.block(new CFrame(pos).mul(rot), size, color, alpha);
		part.Parent = parent;
		out.push({ part, pos, rot, size, alpha });
	}
}

export class BladeWave {
	pos: Vector3;
	dir: Vector3;
	readonly color: Color3;
	age = 0;
	fading = false;
	private fadeT = 0;
	private pop = 0;
	private pieces: Piece[] = [];
	private trails: Trail[] = [];
	private emitter: ParticleEmitter;
	private light: PointLight;
	private model: Model;

	constructor(pos: Vector3, dir: Vector3, color: Color3) {
		this.pos = pos;
		this.dir = dir;
		this.color = color;
		const model = new Instance("Model");
		model.Name = "BladeWave";
		this.model = model;
		const core = color.Lerp(WHITE, 0.82);
		arcPieces(this.pieces, model, GLOW_N, RADIUS * GLOW_K, GLOW_K * 1.6, 0.6, color, GLOW_TRANSPARENCY);
		const coreStart = this.pieces.size();
		arcPieces(this.pieces, model, CORE_N, RADIUS, 1, 0.35, core, 0);
		const mid = this.pieces[coreStart + math.floor(CORE_N / 2)].part;
		const first = this.pieces[coreStart].part;
		const last = this.pieces[coreStart + CORE_N - 1].part;

		// Sword-trail streaks from both arc tips.
		this.trails.push(fx.makeTrail(first, new Vector3(0, 0, -0.6), new Vector3(0, 0, -0.1), color));
		this.trails.push(fx.makeTrail(last, new Vector3(0, 0, 0.6), new Vector3(0, 0, 0.1), color));
		for (const t of this.trails) {
			t.Color = new ColorSequence([new ColorSequenceKeypoint(0, WHITE), new ColorSequenceKeypoint(0.4, color), new ColorSequenceKeypoint(1, color)]);
			t.Transparency = new NumberSequence([new NumberSequenceKeypoint(0, 0.05), new NumberSequenceKeypoint(1, 1)]);
			t.WidthScale = new NumberSequence([new NumberSequenceKeypoint(0, 1), new NumberSequenceKeypoint(1, 0)]);
			t.Lifetime = 0.18 / fx.getTimeScale();
			t.Enabled = true;
		}

		// Sparks streaming backwards off the middle of the arc (EmissionDirection Left = local -X = backwards at the apex).
		const em = new Instance("ParticleEmitter");
		em.Texture = SPARKLE;
		em.Color = new ColorSequence(core, color);
		em.LightEmission = 1;
		em.Size = new NumberSequence([new NumberSequenceKeypoint(0, 0.4), new NumberSequenceKeypoint(1, 0)]);
		em.Transparency = new NumberSequence([new NumberSequenceKeypoint(0, 0.1), new NumberSequenceKeypoint(1, 1)]);
		em.Lifetime = new NumberRange(0.2, 0.35);
		em.Speed = new NumberRange(2, 5);
		em.SpreadAngle = new Vector2(35, 35);
		em.EmissionDirection = Enum.NormalId.Left;
		em.Rate = 40;
		em.TimeScale = fx.getTimeScale();
		em.Parent = mid;
		this.emitter = em;

		const light = new Instance("PointLight");
		light.Color = color;
		light.Range = 10;
		light.Brightness = 2;
		light.Parent = mid;
		this.light = light;

		this.place(0);
		model.Parent = fx.getParent();
	}

	/** Moves / orients the wave to pos + dir, plays the 60% -> 100% pop-in, and the fade-out once startFade() was called. Returns true when the fade has finished. */
	place(dt: number): boolean {
		let s = 1;
		if (!this.fading) {
			this.pop = math.min(1, this.pop + dt / POP_TIME);
			s = 0.6 + 0.4 * this.pop;
		}
		let a = 0;
		if (this.fading) {
			this.fadeT = math.min(FADE_TIME, this.fadeT + dt);
			a = this.fadeT / FADE_TIME;
			s = s * (1 + 0.25 * a);
			this.light.Brightness = 2 * (1 - a);
		}
		const root = CFrame.lookAt(this.pos, this.pos.add(this.dir)).mul(CFrame.Angles(0, 0, ROLL));
		for (const pc of this.pieces) {
			pc.part.Size = pc.size.mul(s);
			pc.part.CFrame = root.mul(new CFrame(pc.pos.mul(s))).mul(pc.rot);
			if (this.fading) pc.part.Transparency = pc.alpha + (1 - pc.alpha) * a;
		}
		return this.fading && a >= 1;
	}

	/** Miss: stops sparks and streaks; the wave then expands and fades (place() reports when done). */
	startFade(): void {
		if (this.fading) return;
		this.fading = true;
		this.emitter.Enabled = false;
		for (const t of this.trails) t.Enabled = false;
	}

	destroy(): void {
		this.model.Destroy();
	}
}

/** Thin neon streak along the ground in the launch direction; stretches and fades over 0.2 s. */
export function groundStreak(foot: Vector3, dir: Vector3, color: Color3): void {
	const p = new Vector3(foot.X, 0.3, foot.Z);
	const part = fx.block(CFrame.lookAt(p, p.add(dir)), new Vector3(0.6, 0.2, 6), color, 0.2);
	fx.expire(part, 0.4);
	fx.spawn(() => {
		fx.run(0.2, (a) => {
			part.Size = new Vector3(0.6 * (1 - a * 0.5), 0.2, 6 * (1 + a));
			part.Transparency = 0.2 + 0.8 * a;
		});
		part.Destroy();
	});
}

/** Bright cross-shaped slash at a hit point: two white bars crossing (with a coloured halo) that scale out and fade over 0.15 s. */
export function crossFlash(pos: Vector3, color: Color3): void {
	const items: { part: Part; w: number; l: number; t0: number }[] = [];
	for (const ang of [40, -40]) {
		const cf = new CFrame(pos).mul(CFrame.Angles(0, 0, math.rad(ang)));
		items.push({ part: fx.block(cf, new Vector3(1, 7, 0.3), color, 0.5), w: 1, l: 7, t0: 0.5 });
		items.push({ part: fx.block(cf, new Vector3(0.35, 6.5, 0.3), WHITE, 0), w: 0.35, l: 6.5, t0: 0 });
	}
	for (const it of items) fx.expire(it.part, 0.4);
	fx.spawn(() => {
		fx.run(0.15, (a) => {
			const s = 1 + 0.6 * a;
			for (const it of items) {
				it.part.Size = new Vector3(it.w, it.l * s, 0.3);
				it.part.Transparency = it.t0 + (1 - it.t0) * a;
			}
		});
		for (const it of items) it.part.Destroy();
	});
}
