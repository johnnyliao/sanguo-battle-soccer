// Match effects for the Shu generals: Zhang Fei roar, Guan Yu bike ride, Zhuge Liang orb, Ma Chao riders, Zhao Yun lunge.
import type { SimEventLite, SnapZone } from "shared/net";
import * as fx from "./fx";
import { Handler, MatchCtx, Mount, SpecialModule, W, WHITE, ZView, en, expOut, higher, impactFx, shakeNear, sheet, spawnLoop, syncZones, trailOrbs } from "./matchUtil";
import { Prop, makeProp, placeProp } from "./props";

const ORANGE = Color3.fromRGB(255, 120, 40);
const YELLOW = Color3.fromRGB(255, 220, 70);
const GREEN = Color3.fromRGB(70, 255, 130);
const GOLD = Color3.fromRGB(255, 215, 80);
const CYAN = Color3.fromRGB(110, 235, 255);

interface Beam {
	orb: Part;
	core: Part;
	alive: boolean;
	flying: boolean;
}

interface Bike {
	prop: Prop;
	acc: number;
}

interface RiderView extends ZView {
	prop: Prop;
	pos: Vector3;
	dir: Vector3;
	acc: number;
	phase: number;
}

export class ShuFx implements SpecialModule {
	private c: MatchCtx;
	private on: Record<string, Handler> = {};
	private beams = new Map<number, Beam>();
	private bikes = new Map<number, Bike>();
	private riders: RiderView[] = [];
	private riderCount = 0;

	constructor(c: MatchCtx) {
		this.c = c;
		this.on = {
			roar: (e) => this.roar(e),
			roarBall: (e) => this.roarBall(e),
			rideStart: (e) => this.rideStart(e),
			rideHit: (e) => this.rideHit(e),
			rideEnd: (e) => this.rideEnd(e),
			beamCharge: (e) => this.beamCharge(e),
			beamCancel: (e) => this.beamCancel(e),
			beamStrike: (e) => this.beamStrike(e),
			summonStart: (e) => this.summonStart(e),
			riderSpawn: (e) => this.riderSpawn(e),
			riderHit: (e) => this.riderHit(e),
			riderEnd: (e) => this.riderEnd(e),
			lungeStart: (e) => this.lungeStart(e),
			lungeEnd: (e) => this.lungeEnd(e),
			lungeHeal: (e) => this.lungeHeal(e),
		};
	}

	handle(e: SimEventLite): void {
		const h = this.on[e.type];
		if (h !== undefined) h(e);
	}

	/** Special activation: Zhang Fei inhales (energy rings pulled in) just before the roar rings. */
	special(idx: number, charId: string): void {
		if (charId !== "zhangfei") return;
		const me = this.c.foot(idx);
		fx.ring(higher(me, 0.5), 9, 1.5, 0.3, ORANGE, 0.8, 0.5);
		sheet("zhangfei.charge", higher(me, 5), 9, 0.5, ORANGE);
		fx.burst(higher(me, 6), ORANGE, 14, { size: 1.6, speed: -10, life: 0.4 });
	}

	// ---------------------------------------------------------------- Zhang Fei

	private roar(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const centre = W(en(e, "x"), en(e, "y"));
		const r = math.max(en(e, "radius") * 0.2, 8);
		const cols = [ORANGE, YELLOW, WHITE];
		for (let i = 0; i < 3; i++) {
			const col = cols[i];
			fx.spawn(() => {
				fx.wait(i * 0.1);
				fx.ring(higher(centre, 0.6), 2, r, 0.55, col, 1.8, 0.8);
			});
		}
		sheet("zhangfei.wave", higher(centre, 5), 9, 0.8, WHITE);
		fx.dust(higher(centre, 0.5), 18, 8);
		const face = this.c.facing(idx);
		fx.burst(higher(this.c.foot(idx), 7.2).add(face.mul(2)), YELLOW, 24, { size: 2.4, speed: 40, spread: 35, life: 0.6 });
		shakeNear(this.c, centre, 1.4, 0.8);
	}

	private roarBall(e: SimEventLite): void {
		const p = W(en(e, "x"), en(e, "y"), 1);
		fx.ring(higher(p, 0.3), 1, 6, 0.3, YELLOW, 0.8, 0.4);
		fx.burst(p, YELLOW, 10, { size: 1.4, speed: 22 });
	}

	// ---------------------------------------------------------------- Guan Yu

	private rideStart(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const me = this.c.foot(idx);
		fx.ring(higher(me, 0.4), 1, 8, 0.45, GREEN, 1.2, 0.5);
		fx.burst(higher(me, 3), GREEN, 20, { size: 2, speed: 22 });
		sheet("guanyu.ring", higher(me, 3), 9, 0.6, GREEN);
		sheet("guanyu.dragon", higher(me, 4), 9, 0.9, WHITE);
		this.c.trails(idx, 0.7);
		const c = this.c;
		trailOrbs(() => higher(c.foot(idx), 2.8), 0.6, GREEN, GOLD, 3, 0.04);
		shakeNear(c, me, 0.5, 0.3);
	}

	private rideHit(e: SimEventLite): void {
		const v = en(e, "victimIdx");
		const p = this.c.chest(v);
		impactFx(p, GREEN, 1.3, "guanyu.impact");
		shakeNear(this.c, p, 0.8, 0.4);
	}

	private rideEnd(e: SimEventLite): void {
		const me = this.c.foot(en(e, "playerIdx"));
		fx.burst(higher(me, 2), GOLD, 18, { size: 2, speed: 22 });
		fx.dust(higher(me, 0.4), 8, 5);
	}

	// ---------------------------------------------------------------- Zhuge Liang

	private killBeam(idx: number): void {
		const b = this.beams.get(idx);
		if (b === undefined) return;
		b.alive = false;
		b.orb.Destroy();
		b.core.Destroy();
		this.beams.delete(idx);
	}

	private makeBeam(idx: number): Beam {
		this.killBeam(idx);
		const p = this.c.hand(idx);
		const beam: Beam = { orb: fx.ball(p, 0.4, CYAN, 0.4), core: fx.ball(p, 0.2, WHITE, 0.3), alive: true, flying: false };
		fx.expire(beam.orb, 4);
		fx.expire(beam.core, 4);
		this.beams.set(idx, beam);
		return beam;
	}

	private beamCharge(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const c = this.c;
		const beam = this.makeBeam(idx);
		sheet("zhugeliang.charge", c.hand(idx), 9, 0.6, CYAN);
		for (let i = 0; i < 3; i++) {
			fx.spawn(() => {
				fx.wait(i * 0.15);
				fx.ring(higher(c.foot(idx), 0.5), 6, 0.6, 0.4, i === 1 ? WHITE : CYAN, 0.4, 0.4);
			});
		}
		spawnLoop(1.6, (t) => {
			if (!beam.alive || beam.flying) return false;
			const pos = c.hand(idx);
			const s = 0.4 + math.min(1, t / 0.5) * 1.2;
			beam.orb.Size = new Vector3(s, s, s);
			beam.core.Size = new Vector3(s * 0.5, s * 0.5, s * 0.5);
			beam.orb.CFrame = new CFrame(pos);
			beam.core.CFrame = new CFrame(pos);
			if (t > 0.15 && math.random() > 0.6) fx.burst(pos.add(fx.randDir().mul(4)), CYAN, 1, { size: 1.2, speed: 1, life: 0.3 });
			return true;
		});
	}

	private beamCancel(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const b = this.beams.get(idx);
		if (b !== undefined) fx.burst(b.orb.Position, CYAN, 10, { size: 1.4, speed: 14 });
		this.killBeam(idx);
	}

	/** The orb flies horizontally from his hand to the victim's chest, then explodes. */
	private beamStrike(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const victim = en(e, "victimIdx");
		const c = this.c;
		let beam = this.beams.get(idx);
		if (beam === undefined) beam = this.makeBeam(idx);
		const b = beam;
		b.flying = true;
		const start = c.hand(idx);
		const trail = fx.makeTrail(b.orb, new Vector3(0, 0.9, 0), new Vector3(0, -0.9, 0), CYAN);
		trail.Lifetime = 0.25;
		trail.Enabled = true;
		const FLY = 0.3;
		spawnLoop(
			1,
			(t) => {
				const target = c.chest(victim);
				const a = math.min(1, t / FLY);
				const p = start.Lerp(target, a);
				const s = 1.6 + math.sin(t * 40) * 0.2;
				b.orb.Size = new Vector3(s, s, s);
				b.core.Size = new Vector3(s * 0.5, s * 0.5, s * 0.5);
				b.orb.CFrame = new CFrame(p);
				b.core.CFrame = new CFrame(p);
				if (a >= 1) {
					impactFx(target, CYAN, 1.8, "zhugeliang.impact");
					sheet("zhugeliang.ball", target, 9, 0.7, WHITE);
					fx.ring(new Vector3(target.X, 0.5, target.Z), 2, 12, 0.5, CYAN, 1.6, 0.6);
					shakeNear(c, target, 1.0, 0.5);
					return false;
				}
				return true;
			},
			() => {
				this.killBeam(idx);
			},
		);
	}

	// ---------------------------------------------------------------- Ma Chao

	private summonStart(e: SimEventLite): void {
		const me = this.c.foot(en(e, "playerIdx"));
		fx.ring(higher(me, 0.4), 1, 9, 0.5, GOLD, 1.2, 0.5);
		fx.burst(higher(me, 3), GOLD, 22, { size: 2, speed: 20 });
		sheet("machao.summon", higher(me, 3), 9, 0.7, GOLD);
		fx.dust(higher(me, 0.5), 10, 6);
		shakeNear(this.c, me, 0.5, 0.4);
	}

	private riderSpawn(e: SimEventLite): void {
		const p = W(en(e, "x"), en(e, "y"));
		fx.ring(higher(p, 0.4), 1, 6, 0.4, GOLD, 1, 0.5);
		fx.burst(higher(p, 3), GOLD, 10, { size: 1.8, speed: 16 });
		sheet("machao.burst", higher(p, 3), 7, 0.5, GOLD);
	}

	private riderHit(e: SimEventLite): void {
		const p = this.c.chest(en(e, "victimIdx"));
		impactFx(p, GOLD, 1, "machao.burst");
		shakeNear(this.c, p, 0.5, 0.3);
	}

	private riderEnd(e: SimEventLite): void {
		const p = W(en(e, "x"), en(e, "y"), 0.5);
		fx.dust(p, 6, 5);
		sheet("machao.smoke", higher(p, 2), 7, 0.5, WHITE);
	}

	// ---------------------------------------------------------------- Zhao Yun

	private lungeStart(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const c = this.c;
		const me = c.foot(idx);
		const dir = new Vector3(en(e, "dirX"), 0, en(e, "dirY"));
		const fwd = dir.Magnitude > 0.01 ? dir.Unit : c.facing(idx);
		fx.ring(higher(me, 0.4), 6, 1, 0.3, GOLD, 0.8, 0.5);
		fx.burst(higher(me, 4.5), GOLD, 14, { size: 1.8, speed: 14 });
		sheet("zhaoyun.lunge", higher(me, 5).add(fwd.mul(5)), 9, 0.6, WHITE);
		c.trails(idx, 0.5);
		trailOrbs(() => higher(c.foot(idx), 4.5), 0.45, GOLD, WHITE, 3.4, 0.025);
		shakeNear(c, me, 0.6, 0.3);
	}

	private lungeEnd(e: SimEventLite): void {
		const p = W(en(e, "x"), en(e, "y"), 2);
		fx.burst(p, GOLD, 20, { size: 2, speed: 26 });
		sheet("zhaoyun.burst", higher(p, 2), 9, 0.5, WHITE);
		fx.dust(higher(p, -1.5), 8, 5);
		shakeNear(this.c, p, 0.6, 0.3);
	}

	private lungeHeal(e: SimEventLite): void {
		const p = this.c.chest(en(e, "playerIdx"));
		fx.burst(p, Color3.fromRGB(110, 255, 140), 12, { size: 1.4, speed: 8, gravity: -6 });
	}

	// ---------------------------------------------------------------- per frame

	frame(dt: number, zones: SnapZone[]): void {
		const c = this.c;
		this.riders = syncZones(
			this.riders,
			zones,
			"rider",
			70,
			(z) => {
				const target = W(z.x, z.y);
				this.riderCount += 1;
				const prop = makeProp("machao_rider", "horse", this.riderCount % 2 === 0 ? Color3.fromRGB(255, 230, 190) : Color3.fromRGB(190, 60, 40), 0);
				const v: RiderView = { x: z.x, y: z.y, seen: true, prop, pos: target, dir: new Vector3(z.team === 0 ? 1 : -1, 0, 0), acc: 0, phase: this.riderCount };
				return v;
			},
			(v, z) => {
				const target = W(z.x, z.y);
				const delta = target.sub(v.pos);
				const flat = new Vector3(delta.X, 0, delta.Z);
				if (flat.Magnitude > 0.05) {
					const nd = v.dir.Lerp(flat.Unit, 0.35);
					if (nd.Magnitude > 0.01) v.dir = nd.Unit;
				}
				v.pos = v.pos.add(delta.mul(expOut(dt, 20)));
				v.acc += dt;
				const bob = math.abs(math.sin(os.clock() * 14 + v.phase)) * 0.5;
				placeProp(v.prop, CFrame.lookAt(v.pos.add(new Vector3(0, bob, 0)), v.pos.add(new Vector3(0, bob, 0)).add(v.dir)));
				if (v.acc > 0.3) {
					v.acc = 0;
					fx.dust(higher(v.pos, 0.5), 2, 3.5);
				}
			},
			(v) => {
				fx.burst(higher(v.pos, 3), GOLD, 6, { size: 1.6, speed: 10 });
				v.prop.model.Destroy();
			},
		);
		for (const [idx, bike] of this.bikes) {
			bike.acc += dt;
			if (bike.acc > 0.1) {
				bike.acc = 0;
				fx.dust(higher(c.foot(idx), 0.4), 2, 3);
			}
		}
	}

	mount(idx: number, foot: Vector3, facing: Vector3, sp: string): Mount | undefined {
		const riding = sp === "ride" && this.c.charOf(idx) === "guanyu";
		let bike = this.bikes.get(idx);
		if (!riding) {
			if (bike !== undefined) {
				bike.prop.model.Destroy();
				this.bikes.delete(idx);
			}
			return undefined;
		}
		if (bike === undefined) {
			bike = { prop: makeProp("guanyu_bike", "bike", Color3.fromRGB(220, 40, 40), this.c.footOffset(idx), new Vector3(0, 0.6, 0)), acc: 0 };
			this.bikes.set(idx, bike);
		}
		const rootCF = placeProp(bike.prop, CFrame.lookAt(foot, foot.add(facing)));
		return { cf: rootCF, pose: "sit" };
	}

	clear(): void {
		for (const [, b] of this.beams) {
			b.orb.Destroy();
			b.core.Destroy();
		}
		this.beams.clear();
		for (const [, b] of this.bikes) b.prop.model.Destroy();
		this.bikes.clear();
		for (const r of this.riders) r.prop.model.Destroy();
		this.riders = [];
	}
}
