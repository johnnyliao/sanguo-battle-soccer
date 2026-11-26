// Match effects for the Wei generals: Zhang Liao fear, Sima Yi leap, Xu Chu tiger, Cao Cao slash waves, Zhen Ji ice field.
import { STUDS_PER_PX, type SimEventLite, type SnapZone } from "shared/net";
import * as fx from "./fx";
import { BladeWave, crossFlash, groundStreak } from "./bladeWave";
import { Handler, MatchCtx, Mount, RingSet, SpecialModule, W, WHITE, ZView, discPart, ea, emitterHost, en, expOut, higher, impactFx, setDisc, shakeNear, sheet, spawnLoop, syncZones } from "./matchUtil";
import { Prop, makeProp, placeProp } from "./props";

const PURPLE = Color3.fromRGB(180, 100, 255);
const RED = Color3.fromRGB(255, 50, 60);
const ORANGE = Color3.fromRGB(255, 140, 30);
const BLUE = Color3.fromRGB(90, 160, 255);
const GOLD = Color3.fromRGB(255, 220, 90);
const ICE = Color3.fromRGB(140, 225, 255);
const TIGER_SCALE = 0.75;

interface TigerView {
	idx: number;
	prop: Prop;
	born: number;
	killAt: number;
	pulse: number;
	baseScale: number;
	scale: number;
}

interface IceView extends ZView {
	centre: Vector3;
	r: number;
	team: number;
	disc: Part;
	ring: RingSet;
	spikes: Part[];
	spikeH: number[];
	rain: Part;
	t: number;
}

export class WeiFx implements SpecialModule {
	private c: MatchCtx;
	private on: Record<string, Handler> = {};
	private tigers = new Map<number, TigerView>();
	private waves = new Map<number, BladeWave>();
	private ices: IceView[] = [];
	private frost = new Map<number, RingSet>();
	private ballAcc = 0;

	constructor(c: MatchCtx) {
		this.c = c;
		this.on = {
			fear: (e) => this.fear(e),
			leapStart: (e) => this.leapStart(e),
			leapFly: (e) => this.leapFly(e),
			leapLand: (e) => this.leapLand(e),
			tigerStart: (e) => this.tigerStart(e),
			tigerSwallow: (e) => this.tigerSwallow(e),
			tigerSpit: (e) => this.tigerSpit(e),
			tigerRoar: (e) => this.tigerRoar(e),
			tigerEnd: (e) => this.tigerEnd(e),
			slashStart: (e) => this.slashStart(e),
			slashSwing: (e) => this.slashSwing(e),
			slashWave: (e) => this.slashWave(e),
			slashWaveEnd: (e) => this.slashWaveEnd(e),
			slashHeal: (e) => this.slashHeal(e),
			iceStart: (e) => this.iceStart(e),
			icePulse: (e) => this.icePulse(e),
			iceEnd: (e) => this.iceEnd(e),
		};
	}

	handle(e: SimEventLite): void {
		const h = this.on[e.type];
		if (h !== undefined) h(e);
	}

	special(_idx: number, _charId: string): void {}

	// ---------------------------------------------------------------- Zhang Liao

	/** War cry: a purple ghost wave spreads from him; the feared get an alarm mark and chains while they stand frozen. */
	private fear(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const c = this.c;
		const me = c.foot(idx);
		sheet("zhangliao.ghost", higher(me, 5), 9, 1.2, PURPLE);
		fx.ring(higher(me, 0.4), 2, 40, 0.9, PURPLE, 1.6, 0.6);
		fx.ring(higher(me, 0.5), 1, 32, 1.1, RED, 1.2, 0.5);
		fx.burst(higher(me, 4), PURPLE, 28, { size: 2.6, speed: 30 });
		shakeNear(c, me, 0.8, 0.6);
		for (const v of ea(e, "victimIdxs")) {
			const head = higher(c.foot(v), 10.5);
			fx.label(head, "!", RED, 4, 2);
			sheet("zhangliao.alarm", higher(c.foot(v), 6), 7, 0.9, RED);
			sheet("zhangliao.chains", c.chest(v), 9, 1.4, WHITE);
			this.chains(v);
		}
	}

	/** Purple bands wrapped around a feared player for as long as he stays in the fear action. */
	private chains(idx: number): void {
		const c = this.c;
		const bands: RingSet[] = [];
		for (let i = 0; i < 3; i++) bands.push(new RingSet(14, 0.25, 0.25, Color3.fromRGB(200, 170, 255)));
		spawnLoop(
			3.4,
			(t) => {
				const foot = c.foot(idx);
				for (let i = 0; i < bands.size(); i++) {
					const y = 1.6 + i * 2.6 + math.sin(t * 6 + i) * 0.3;
					bands[i].set(foot.add(new Vector3(0, y, 0)), 2.3, 0.5 + 0.15 * math.sin(t * 12 + i));
				}
				return c.actOf(idx) === "fear" || t < 0.4;
			},
			() => {
				for (const b of bands) b.destroy();
			},
		);
	}

	// ---------------------------------------------------------------- Sima Yi

	private leapStart(e: SimEventLite): void {
		const me = this.c.foot(en(e, "playerIdx"));
		fx.dust(higher(me, 0.5), 8, 5);
		fx.ring(higher(me, 0.4), 1, 6, 0.35, PURPLE, 1, 0.5);
		fx.burst(higher(me, 4), PURPLE, 14, { size: 1.8, speed: 16 });
		sheet("simayi.smoke", higher(me, 3), 9, 0.7, WHITE);
	}

	private leapFly(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const c = this.c;
		sheet("simayi.crows", higher(c.foot(idx), 5), 9, 0.9, WHITE);
		let acc = 0;
		// Crow afterimages: textured crow flipbooks dropped along the flight path (no flat coloured slabs).
		spawnLoop(
			0.7,
			(t, dt) => {
				acc += dt;
				if (acc > 0.07 && t < 0.55) {
					acc = 0;
					const pos = higher(c.foot(idx), 4.5);
					if (!sheet("simayi.crows", pos, 6, 0.5, PURPLE)) fx.burst(pos, PURPLE, 6, { size: 1.2, speed: 8 });
				}
				return true;
			},
			() => {},
		);
	}

	private leapLand(e: SimEventLite): void {
		const p = W(en(e, "x"), en(e, "y"));
		fx.ring(higher(p, 0.4), 1, 14, 0.5, PURPLE, 1.6, 0.7);
		fx.ring(higher(p, 0.5), 1, 9, 0.4, WHITE, 1, 0.5);
		sheet("simayi.ring", higher(p, 1), 9, 0.6, PURPLE);
		sheet("simayi.burst", higher(p, 3), 9, 0.6, WHITE);
		fx.dust(higher(p, 0.5), 10, 6);
		fx.burst(higher(p, 1), PURPLE, 24, { size: 2.2, speed: 30 });
		shakeNear(this.c, p, 0.8, 0.45);
		for (const v of ea(e, "victimIdxs")) {
			const foot = this.c.foot(v);
			fx.label(higher(foot, 10.5), "沉默", PURPLE, 4, 1.8);
			impactFx(this.c.chest(v), PURPLE, 0.8, "simayi.slash");
		}
	}

	// ---------------------------------------------------------------- Xu Chu

	private tigerStart(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const c = this.c;
		const old = this.tigers.get(idx);
		if (old !== undefined) {
			old.prop.model.Destroy();
			this.tigers.delete(idx);
		}
		const prop = makeProp("xuchu_tiger", "tiger", ORANGE, 0, undefined, TIGER_SCALE);
		const now = os.clock();
		this.tigers.set(idx, { idx, prop, born: now, killAt: now + 9, pulse: 0, baseScale: prop.model.GetScale(), scale: 1 });
		const me = c.foot(idx);
		fx.ring(higher(me, 0.4), 2, 12, 0.6, ORANGE, 1.4, 0.6);
		fx.dust(higher(me, 0.5), 12, 6);
		sheet("xuchu.fireRing", higher(me, 2), 9, 0.9, WHITE);
		shakeNear(c, me, 0.6, 0.6);
	}

	private tigerSwallow(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const p = W(en(e, "x"), en(e, "y"), 3);
		const t = this.tigers.get(idx);
		if (t !== undefined) t.pulse = 0.35;
		sheet("xuchu.maw", higher(p, 2), 9, 0.9, WHITE);
		fx.burst(p, ORANGE, 18, { size: 2.2, speed: 22 });
		fx.dust(higher(p, -2), 6, 5);
		shakeNear(this.c, p, 0.5, 0.3);
	}

	private tigerSpit(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const c = this.c;
		const t = this.tigers.get(idx);
		const mouth = higher(c.foot(idx), 7).add(c.facing(idx).mul(5));
		if (t !== undefined) {
			t.pulse = 0.4;
			t.killAt = os.clock() + 1.2;
		}
		sheet("xuchu.roar", mouth, 9, 0.9, WHITE);
		fx.fireBurst(mouth, 14, 3.2);
		shakeNear(c, mouth, 0.7, 0.4);
	}

	private tigerRoar(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const c = this.c;
		const me = c.foot(idx);
		const t = this.tigers.get(idx);
		if (t !== undefined) {
			t.pulse = 0.5;
			t.killAt = os.clock() + 1.1;
		}
		fx.ring(higher(me, 0.5), 2, 18, 0.6, ORANGE, 1.6, 0.8);
		fx.ring(higher(me, 1), 1, 12, 0.5, Color3.fromRGB(255, 230, 90), 1, 0.6);
		sheet("xuchu.roar", higher(me, 7).add(c.facing(idx).mul(5)), 9, 1, WHITE);
		for (const v of ea(e, "victimIdxs")) {
			sheet("xuchu.fireRing", higher(c.foot(v), 2), 9, 1, WHITE);
			fx.fireBurst(higher(c.foot(v), 1), 8, 3);
		}
		shakeNear(c, me, 1.0, 0.8);
	}

	private tigerEnd(e: SimEventLite): void {
		const t = this.tigers.get(en(e, "playerIdx"));
		if (t !== undefined) t.killAt = os.clock();
	}

	// ---------------------------------------------------------------- Cao Cao

	private slashStart(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const me = this.c.foot(idx);
		fx.ring(higher(me, 0.4), 6, 1, 0.4, BLUE, 1, 0.5);
		fx.burst(higher(me, 4.5), BLUE, 16, { size: 1.8, speed: 14 });
		sheet("caocao.constellation", higher(me, 6), 9, 1, WHITE);
		this.c.trails(idx, 5.2);
	}

	private slashSwing(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const dir = new Vector3(en(e, "dirX"), 0, en(e, "dirY"));
		const fwd = dir.Magnitude > 0.01 ? dir.Unit : this.c.facing(idx);
		sheet("caocao.slash", higher(this.c.foot(idx), 4.5).add(fwd.mul(3)), 7, 0.3, BLUE);
	}

	private slashWave(e: SimEventLite): void {
		const id = en(e, "waveId");
		const pos = W(en(e, "x"), en(e, "y"), 4.5);
		const d = new Vector3(en(e, "dirX"), 0, en(e, "dirY"));
		const dir = d.Magnitude > 0.01 ? d.Unit : new Vector3(1, 0, 0);
		const idx = en(e, "playerIdx");
		const col = id % 2 === 0 ? BLUE : GOLD;
		const foot = this.c.foot(idx);
		const old = this.waves.get(id);
		if (old !== undefined) old.destroy();
		this.waves.set(id, new BladeWave(pos, dir, col));
		groundStreak(foot, dir, col);
		fx.dust(higher(foot, 0.5), 5, 3);
		sheet("caocao.bladeWave", pos, 8, 0.4, WHITE);
	}

	private slashWaveEnd(e: SimEventLite): void {
		const id = en(e, "waveId");
		const w = this.waves.get(id);
		const hit = en(e, "hitIdx");
		const p = W(en(e, "x"), en(e, "y"), 4.5);
		if (hit >= 0) {
			const chest = this.c.chest(hit);
			const col = w?.color ?? BLUE;
			impactFx(chest, BLUE, 0.9, "caocao.sparks");
			crossFlash(chest, col);
			fx.burst(chest, col, 10, { size: 1.2, speed: 22 });
			if (w !== undefined) {
				w.destroy();
				this.waves.delete(id);
			}
		} else {
			fx.burst(p, BLUE, 6, { size: 1.2, speed: 10 });
			// Missed: the wave stays in the map until its fade-out is done (see frame()).
			if (w !== undefined) w.startFade();
		}
	}

	private slashHeal(e: SimEventLite): void {
		const p = this.c.chest(en(e, "playerIdx"));
		fx.burst(p, Color3.fromRGB(110, 255, 140), 14, { size: 1.8, speed: 10, gravity: -8 });
		sheet("caocao.heal", p, 7, 0.8, WHITE);
	}

	// ---------------------------------------------------------------- Zhen Ji

	private iceStart(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const centre = W(en(e, "x"), en(e, "y"));
		const r = en(e, "radius") * STUDS_PER_PX;
		fx.ring(higher(centre, 0.4), 3, r, 0.7, WHITE, 1.4, 0.5);
		fx.burst(higher(this.c.foot(idx), 5), ICE, 20, { size: 2, speed: 20 });
		sheet("zhenji.snow", higher(centre, 6), 9, 1.6, WHITE);
		sheet("zhenji.rain", higher(centre, 10), 9, 1.6, ICE);
		shakeNear(this.c, centre, 0.4, 0.4);
	}

	private icePulse(e: SimEventLite): void {
		for (const v of ea(e, "victimIdxs")) {
			const p = this.c.chest(v);
			sheet("zhenji.shatter", p, 7, 0.5, WHITE);
			fx.burst(p, ICE, 10, { size: 1.4, speed: 16 });
			fx.shards(p, ICE, 6, 18);
		}
	}

	private iceEnd(_e: SimEventLite): void {
		for (const v of this.ices) {
			sheet("zhenji.melt", higher(v.centre, 2), 9, 0.8, ICE);
			fx.burst(higher(v.centre, 1), ICE, 14, { size: 1.8, speed: 16 });
			break;
		}
	}

	private makeIce(z: SnapZone): IceView {
		const centre = W(z.x, z.y);
		const r = z.r * STUDS_PER_PX;
		const disc = discPart(higher(centre, 0.12), r, ICE, 0.75);
		const ring = new RingSet(32, 1, 0.4, ICE);
		const spikes: Part[] = [];
		const spikeH: number[] = [];
		for (let i = 0; i < 10; i++) {
			const ang = math.random() * 2 * math.pi;
			const rad = r * (0.25 + math.random() * 0.7);
			const h = 2.5 + math.random() * 3.5;
			const p = fx.block(new CFrame(centre.add(new Vector3(math.cos(ang) * rad, h / 2, math.sin(ang) * rad))), new Vector3(0.9, 0.1, 0.9), i % 3 === 0 ? WHITE : ICE, 0.15);
			spikes.push(p);
			spikeH.push(h);
		}
		const rain = emitterHost(higher(centre, 22), new Vector3(r * 2, 0.2, r * 2), ICE, 40, 0.9, 0.8, 28, 0, 0);
		const em = rain.FindFirstChildOfClass("ParticleEmitter");
		if (em !== undefined) em.EmissionDirection = Enum.NormalId.Bottom;
		return { x: z.x, y: z.y, seen: true, centre, r, team: z.team, disc, ring, spikes, spikeH, rain, t: 0 };
	}

	// ---------------------------------------------------------------- per frame

	frame(dt: number, zones: SnapZone[]): void {
		const c = this.c;
		const now = os.clock();
		// Tiger heads follow their general.
		for (const [idx, t] of this.tigers) {
			const age = now - t.born;
			const rise = math.min(1, age / 0.6);
			const sink = now > t.killAt ? math.min(1, (now - t.killAt) / 0.4) : 0;
			const face = c.facing(idx);
			const lift = -16 * (1 - (1 - (1 - rise) * (1 - rise))) - 16 * sink;
			const base = c.foot(idx).sub(face.mul(5)).add(new Vector3(0, lift, 0));
			if (t.pulse > 0) {
				t.pulse = math.max(0, t.pulse - dt);
				t.scale = 1 + math.sin((t.pulse / 0.5) * math.pi) * 0.25;
				t.prop.model.ScaleTo(t.baseScale * t.scale);
			}
			placeProp(t.prop, CFrame.lookAt(base, base.add(face)));
			if (sink >= 1) {
				t.prop.model.Destroy();
				this.tigers.delete(idx);
			}
		}
		// Blade waves chase their snapshot positions.
		for (const [id, w] of this.waves) {
			w.age += dt;
			if (w.fading) {
				if (w.place(dt)) {
					w.destroy();
					this.waves.delete(id);
				}
				continue;
			}
			let best: Vector3 | undefined;
			let bd = 14 * 14;
			for (const z of zones) {
				if (z.k !== "wave") continue;
				const p = W(z.x, z.y, 4.5);
				const d = p.sub(w.pos);
				const m = d.X * d.X + d.Z * d.Z;
				if (m < bd) {
					bd = m;
					best = p;
				}
			}
			if (best !== undefined) {
				const delta = best.sub(w.pos);
				const flat = new Vector3(delta.X, 0, delta.Z);
				if (flat.Magnitude > 0.05) w.dir = flat.Unit;
				w.pos = w.pos.add(delta.mul(expOut(dt, 25)));
			} else if (w.age > 1.5) {
				w.destroy();
				this.waves.delete(id);
				continue;
			}
			w.place(dt);
		}
		// Ice fields.
		this.ices = syncZones(
			this.ices,
			zones,
			"ice",
			6,
			(z) => this.makeIce(z),
			(v) => {
				v.t += dt;
				const g = math.min(1, v.t / 0.5);
				setDisc(v.disc, higher(v.centre, 0.12), v.r * (0.3 + 0.7 * g), 0.75 + 0.1 * math.sin(v.t * 6));
				v.ring.set(higher(v.centre, 0.2), v.r * (0.3 + 0.7 * g), 0.15);
				for (let i = 0; i < v.spikes.size(); i++) {
					const h = v.spikeH[i] * math.min(1, math.max(0, (v.t - i * 0.04) / 0.4));
					const p = v.spikes[i];
					p.Size = new Vector3(0.9, math.max(0.1, h), 0.9);
					p.CFrame = new CFrame(p.Position.X, h / 2, p.Position.Z);
				}
			},
			(v) => {
				v.disc.Destroy();
				v.ring.destroy();
				for (const s of v.spikes) s.Destroy();
				v.rain.Destroy();
			},
		);
		this.updateFrost();
	}

	/** Frost shells on opponents standing inside an ice field. */
	private updateFrost(): void {
		const c = this.c;
		const inside = new Set<number>();
		for (const v of this.ices) {
			for (let i = 0; i < c.count(); i++) {
				if (c.teamOf(i) === v.team) continue;
				const f = c.foot(i);
				const dx = f.X - v.centre.X;
				const dz = f.Z - v.centre.Z;
				if (dx * dx + dz * dz < v.r * v.r) inside.add(i);
			}
		}
		for (const i of inside) {
			let shell = this.frost.get(i);
			if (shell === undefined) {
				shell = new RingSet(14, 0.3, 0.2, ICE);
				this.frost.set(i, shell);
			}
			shell.set(higher(c.foot(i), 0.3), 2.2, 0.4 + 0.1 * math.sin(os.clock() * 8 + i));
		}
		for (const [i, shell] of this.frost) {
			if (!inside.has(i)) {
				shell.destroy();
				this.frost.delete(i);
			}
		}
	}

	/** Tiger-ball flight: ember puffs along the spat ball (called with the ball's world position). */
	ball(dt: number, pos: Vector3, special: string): void {
		if (special !== "tiger") return;
		this.ballAcc += dt;
		if (this.ballAcc > 0.07) {
			this.ballAcc = 0;
			fx.fireBurst(pos, 2, 2.4);
		}
	}

	mount(_idx: number, _foot: Vector3, _facing: Vector3, _sp: string): Mount | undefined {
		return undefined;
	}

	clear(): void {
		for (const [, t] of this.tigers) t.prop.model.Destroy();
		this.tigers.clear();
		for (const [, w] of this.waves) w.destroy();
		this.waves.clear();
		for (const v of this.ices) {
			v.disc.Destroy();
			v.ring.destroy();
			for (const s of v.spikes) s.Destroy();
			v.rain.Destroy();
		}
		this.ices = [];
		for (const [, s] of this.frost) s.destroy();
		this.frost.clear();
	}
}
