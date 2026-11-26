// Shared building blocks for the in-match combat effects (matchFx / matchShu / matchWei / matchWu): the context the
// effect modules read the live players through, event field readers, zone syncing and a few small effect helpers.
import { STUDS_PER_PX, type SimEventLite, type SnapZone } from "shared/net";
import * as fx from "./fx";
import { FX, FX_BAD } from "./fxIds";

export const WHITE = Color3.fromRGB(255, 255, 255);
export const SPARKLE = "rbxasset://textures/particles/sparkles_main.dds";
export const UP = new Vector3(0, 1, 0);

/** Read-only view of the live match used by the effect modules. All positions are world studs. */
export interface MatchCtx {
	foot: (idx: number) => Vector3;
	facing: (idx: number) => Vector3;
	chest: (idx: number) => Vector3;
	hand: (idx: number) => Vector3;
	charOf: (idx: number) => string;
	teamOf: (idx: number) => number;
	actOf: (idx: number) => string;
	stunned: (idx: number) => boolean;
	footOffset: (idx: number) => number;
	/** Turns the weapon trails of a player on for `dur` seconds. */
	trails: (idx: number, dur: number) => void;
	focusX: () => number;
	focusZ: () => number;
	count: () => number;
}

/** Per-frame root placement of a mounted / carried player. pose: "sit" | "stand". */
export interface Mount {
	cf: CFrame;
	pose: string;
}

export interface SpecialModule {
	handle(e: SimEventLite): void;
	special(idx: number, charId: string): void;
	frame(dt: number, zones: SnapZone[]): void;
	mount(idx: number, foot: Vector3, facing: Vector3, sp: string): Mount | undefined;
	clear(): void;
}

export type Handler = (e: SimEventLite) => void;

export function en(e: SimEventLite, k: string): number {
	return (e[k] as number | undefined) ?? 0;
}

export function ea(e: SimEventLite, k: string): number[] {
	return (e[k] as number[] | undefined) ?? [];
}

/** Sim px position -> world ground / height position. */
export function W(x: number, y: number, h = 0): Vector3 {
	return new Vector3(x * STUDS_PER_PX, h, y * STUDS_PER_PX);
}

export function higher(v: Vector3, h: number): Vector3 {
	return v.add(new Vector3(0, h, 0));
}

/** Plays a flipbook sheet by key (no-op when the sheet is not uploaded). */
export function sheet(key: string, pos: Vector3, size: number, dur: number, color?: Color3): boolean {
	const s = FX[key];
	if (s === undefined || FX_BAD.has(s.id)) return false;
	fx.flipbook(s, new CFrame(pos), math.min(size, 7), dur, { color, soft: true });
	return true;
}

/** Camera shake only when `pos` is close to what the camera is looking at; keeps the match readable. */
export function shakeNear(c: MatchCtx, pos: Vector3, amp: number, dur: number): void {
	const dx = pos.X - c.focusX();
	const dz = pos.Z - c.focusZ();
	if (dx * dx + dz * dz < 3000) fx.shake(math.min(amp * 0.6, 0.9), math.min(dur, 0.8));
}

/** Small hit spark: flipbook when available, otherwise a short burst. */
export function hitSpark(pos: Vector3, color: Color3, big: number): void {
	if (!sheet("hit.spark", pos, 5 * big, 0.3)) {
		fx.burst(pos, WHITE, math.floor(6 * big), { size: 1.2 * big, speed: 22 * big, life: 0.4 });
	}
	fx.burst(pos, color, math.floor(8 * big), { size: 1.5 * big, speed: 26 * big, life: 0.5 });
}

/** Punchy impact (match-sized): flash ball, burst, shards, ground ring and an optional character sheet. */
export function impactFx(pos: Vector3, color: Color3, big: number, sheetKey?: string): void {
	// Small, faint, short flash (never bigger than ~2.2 studs so players stay readable).
	const flashBall = fx.ball(pos, math.min(2.2, 1.4 * big), WHITE, 0.75);
	fx.expire(flashBall, 0.3);
	fx.spawn(() => {
		fx.run(0.18, (a) => {
			const s = math.min(2.2, (1.4 + a * 0.8) * big);
			flashBall.Size = new Vector3(s, s, s);
			flashBall.Transparency = 0.75 + a * 0.25;
		});
		flashBall.Destroy();
	});
	fx.burst(pos, color, math.floor(14 * big), { size: 1.8 * big, speed: 28 * big, life: 0.6 });
	fx.burst(pos, WHITE, math.floor(6 * big), { size: 0.9 * big, speed: 18 * big, life: 0.4 });
	if (big >= 1) {
		fx.shards(pos, color, math.floor(8 * big), 26 * big);
		fx.ring(new Vector3(pos.X, 0.4, pos.Z), 1, 5 * big, 0.3, color, 0.8, 0.4);
	}
	if (sheetKey === undefined || !sheet(sheetKey, pos, 8 * big, 0.5, color)) {
		hitSpark(pos, color, big);
	}
}

/** Runs step(t, dt) every frame for up to maxDur seconds on its own thread; stops when step returns false or fx.reset() happens. */
export function spawnLoop(maxDur: number, step: (t: number, dt: number) => boolean, done?: () => void): void {
	const gen = fx.currentGeneration();
	task.spawn(() => {
		let t = 0;
		while (t < maxDur) {
			const dt = task.wait();
			if (gen !== fx.currentGeneration()) break;
			t += dt;
			const [ok, cont] = pcall(() => step(t, dt));
			if (!ok) {
				warn(`[matchfx] ${tostring(cont)}`);
				break;
			}
			if (cont !== true) break;
		}
		if (done !== undefined) done();
	});
}

/** Yellow stars orbiting above a player's head while alive() holds (max `dur` s). */
export function starsFollow(c: MatchCtx, idx: number, dur: number, alive: () => boolean): void {
	const stars: Part[] = [];
	for (let i = 0; i < 4; i++) {
		stars.push(fx.block(new CFrame(c.foot(idx)), new Vector3(0.8, 0.8, 0.3), Color3.fromRGB(255, 235, 60)));
	}
	spawnLoop(
		dur,
		(t) => {
			const head = higher(c.foot(idx), 9.4);
			for (let i = 0; i < stars.size(); i++) {
				const ang = t * 12 + (i / stars.size()) * 2 * math.pi;
				stars[i].CFrame = new CFrame(head.add(new Vector3(math.cos(ang) * 2.2, math.sin(ang * 2) * 0.3, math.sin(ang) * 2.2))).mul(CFrame.Angles(ang, ang, ang));
			}
			return alive() || t < 0.3;
		},
		() => {
			for (const s of stars) s.Destroy();
		},
	);
}

/** Glowing afterimage orbs left behind a moving point (dragon trail). getPos is read each frame. */
export function trailOrbs(getPos: () => Vector3, dur: number, color: Color3, color2: Color3, size: number, every: number): void {
	let orbs: { p: Part; age: number }[] = [];
	let acc = 0;
	const osz = math.min(size, 1.4);
	every = math.max(every, 0.06);
	spawnLoop(
		dur,
		(t, dt) => {
			acc += dt;
			if (acc >= every) {
				acc = 0;
				orbs.push({ p: fx.ball(getPos(), osz, math.random() > 0.5 ? color : color2, 0.75), age: 0 });
			}
			const keep: { p: Part; age: number }[] = [];
			for (const o of orbs) {
				o.age += dt;
				const k = o.age / 0.3;
				if (k >= 1) {
					o.p.Destroy();
				} else {
					const s = osz * (1 - k);
					o.p.Size = new Vector3(s, s, s);
					o.p.Transparency = 0.75 + k * 0.25;
					keep.push(o);
				}
			}
			orbs = keep;
			return true;
		},
		() => {
			for (const o of orbs) o.p.Destroy();
		},
	);
}

/** Persistent flat ring made of blocks; set() moves / resizes it every frame. */
export class RingSet {
	private segs: Part[] = [];
	private n: number;
	private width: number;
	private height: number;

	constructor(n: number, width: number, height: number, color: Color3) {
		this.n = n;
		this.width = width;
		this.height = height;
		for (let i = 0; i < n; i++) {
			this.segs.push(fx.block(new CFrame(), new Vector3(width, height, 1), color));
		}
	}

	set(centre: Vector3, r: number, transparency: number): void {
		const arc = ((2 * math.pi * math.max(r, 0.2)) / this.n) * 1.12;
		for (let i = 0; i < this.n; i++) {
			const ang = (i / this.n) * 2 * math.pi;
			const p = centre.add(new Vector3(math.cos(ang) * r, 0, math.sin(ang) * r));
			const tangent = new Vector3(-math.sin(ang), 0, math.cos(ang));
			const s = this.segs[i];
			s.CFrame = CFrame.lookAt(p, p.add(tangent));
			s.Size = new Vector3(this.width, this.height, arc);
			s.Transparency = transparency;
		}
	}

	destroy(): void {
		for (const s of this.segs) s.Destroy();
		this.segs = [];
	}
}

/** Flat translucent ground disc (neon cylinder). */
export function discPart(centre: Vector3, r: number, color: Color3, transparency: number): Part {
	return fx.glow(Enum.PartType.Cylinder, new CFrame(centre).mul(CFrame.Angles(0, 0, math.pi / 2)), new Vector3(0.2, r * 2, r * 2), color, math.max(transparency, 0.85));
}

export function setDisc(p: Part, centre: Vector3, r: number, transparency: number): void {
	p.Size = new Vector3(0.2, math.max(r * 2, 0.1), math.max(r * 2, 0.1));
	p.CFrame = new CFrame(centre).mul(CFrame.Angles(0, 0, math.pi / 2));
	p.Transparency = math.max(transparency, 0.85);
}

/** A host part with a continuous ParticleEmitter. Destroy the host to remove both. */
export function emitterHost(pos: Vector3, size: Vector3, color: Color3, rate: number, partSize: number, life: number, speed: number, gravity: number, spread: number): Part {
	const host = fx.anchorPart(pos);
	host.Size = size;
	const e = new Instance("ParticleEmitter");
	e.Texture = SPARKLE;
	e.Color = new ColorSequence(color);
	e.LightEmission = 1;
	e.Size = new NumberSequence([new NumberSequenceKeypoint(0, partSize), new NumberSequenceKeypoint(1, 0)]);
	e.Transparency = new NumberSequence([new NumberSequenceKeypoint(0, 0.1), new NumberSequenceKeypoint(1, 1)]);
	e.Lifetime = new NumberRange(life * 0.7, life);
	e.Speed = new NumberRange(speed * 0.6, speed);
	e.SpreadAngle = new Vector2(spread, spread);
	e.Acceleration = new Vector3(0, -gravity, 0);
	e.Rate = rate;
	e.Parent = host;
	return host;
}

export interface ZView {
	x: number;
	y: number;
	seen: boolean;
}

/**
 * Keeps a list of per-zone views in step with the snapshot zones of one kind: each zone is matched to the nearest unmatched
 * view within maxPx (sim px), new zones get a view from make(), views whose zone is gone go to drop(). Returns the new list.
 */
export function syncZones<V extends ZView>(views: V[], zs: SnapZone[], kind: string, maxPx: number, make: (z: SnapZone) => V, upd: (v: V, z: SnapZone) => void, drop: (v: V) => void): V[] {
	for (const v of views) v.seen = false;
	for (const z of zs) {
		if (z.k !== kind) continue;
		let best: V | undefined;
		let bd = maxPx * maxPx;
		for (const v of views) {
			if (v.seen) continue;
			const dx = v.x - z.x;
			const dy = v.y - z.y;
			const d = dx * dx + dy * dy;
			if (d <= bd) {
				bd = d;
				best = v;
			}
		}
		let v = best;
		if (v === undefined) {
			v = make(z);
			views.push(v);
		}
		v.seen = true;
		v.x = z.x;
		v.y = z.y;
		upd(v, z);
	}
	const keep: V[] = [];
	for (const v of views) {
		if (v.seen) keep.push(v);
		else drop(v);
	}
	return keep;
}

export function expOut(dt: number, rate: number): number {
	return 1 - math.exp(-dt * rate);
}
