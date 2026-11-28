// Match effects for the Wu generals: Sun Ce sail, Xiao Qiao gust, Da Qiao portal, Zhou Yu eastwind, Sun Quan arrowship.
import { STUDS_PER_PX, type SimEventLite, type SnapZone } from "shared/net";
import * as fx from "./fx";
import { Handler, MatchCtx, Mount, RingSet, SpecialModule, W, WHITE, ZView, discPart, ea, emitterHost, en, expOut, higher, impactFx, setDisc, shakeNear, sheet, spawnLoop, syncZones } from "./matchUtil";
import { Prop, makeProp, placeProp } from "./props";

const WATER = Color3.fromRGB(70, 210, 255);
const PINK = Color3.fromRGB(255, 140, 200);
const MAGENTA = Color3.fromRGB(255, 110, 235);
const CYAN = Color3.fromRGB(110, 240, 255);
const GREEN = Color3.fromRGB(120, 255, 170);
const WIND = Color3.fromRGB(230, 255, 240);
const GOLD = Color3.fromRGB(255, 215, 90);
const WARM = Color3.fromRGB(255, 120, 70);

interface BoatView {
	prop: Prop;
	dir: Vector3;
	rootPos: Vector3;
	wake: Part;
}

interface GustView extends ZView {
	centre: Vector3;
	r: number;
	disc: Part;
	ring: RingSet;
	petals: Part[];
	t: number;
}

interface PortalView extends ZView {
	centre: Vector3;
	r: number;
	team: number;
	disc: Part;
	ring: RingSet;
	runes: Part[];
	t: number;
}

interface WindView extends ZView {
	centre: Vector3;
	r: number;
	disc: Part;
	ring: RingSet;
	lines: Part[];
	sparkle: Part;
	t: number;
}

interface ShipView extends ZView {
	prop: Prop;
	base: Vector3;
	dir: number;
	heading: Vector3;
	rise: number;
	arrows: Prop[];
}

export class WuFx implements SpecialModule {
	private c: MatchCtx;
	private on: Record<string, Handler> = {};
	private boats = new Map<number, BoatView>();
	private passengers = new Map<number, number>();
	private gusts: GustView[] = [];
	private portals: PortalView[] = [];
	private winds: WindView[] = [];
	private ships: ShipView[] = [];
	private chains = new Map<number, RingSet[]>();

	constructor(c: MatchCtx) {
		this.c = c;
		this.on = {
			sailStart: (e) => this.sailStart(e),
			sailCrash: (e) => this.sailCrash(e),
			sailBoard: (e) => this.sailBoard(e),
			sailDrop: (e) => this.sailDrop(e),
			sailEnd: (e) => this.sailEnd(e),
			gustMark: (e) => this.gustMark(e),
			gustBlow: (e) => this.gustBlow(e),
			portalStart: (e) => this.portalStart(e),
			portalSummon: (e) => this.portalSummon(e),
			portalArrive: (e) => this.portalArrive(e),
			eastwindStart: (e) => this.eastwindStart(e),
			arrowshipStart: (e) => this.arrowshipStart(e),
			arrowshipBlock: (e) => this.arrowshipBlock(e),
			arrowshipVolley: (e) => this.arrowshipVolley(e),
		};
	}

	handle(e: SimEventLite): void {
		const h = this.on[e.type];
		if (h !== undefined) h(e);
	}

	special(_idx: number, _charId: string): void {}

	// ---------------------------------------------------------------- Sun Ce

	private sailStart(e: SimEventLite): void {
		const me = this.c.foot(en(e, "playerIdx"));
		fx.ring(higher(me, 0.4), 1, 10, 0.5, WATER, 1.4, 0.5);
		fx.burst(higher(me, 2), WATER, 26, { size: 2.2, speed: 26 });
		sheet("sunce.splash", higher(me, 3), 9, 0.7, WHITE);
		shakeNear(this.c, me, 0.3, 0.4);
	}

	private sailCrash(e: SimEventLite): void {
		const v = en(e, "victimIdx");
		const p = this.c.chest(v);
		impactFx(p, WATER, 1.7, "sunce.smash");
		sheet("sunce.splinter", p, 9, 0.6, WHITE);
		fx.ring(new Vector3(p.X, 0.5, p.Z), 2, 14, 0.6, WHITE, 1.4, 0.6);
		fx.burst(p, WHITE, 24, { size: 2.4, speed: 34 });
		fx.dust(new Vector3(p.X, 0.5, p.Z), 8, 5);
		shakeNear(this.c, p, 1.2, 0.6);
	}

	private sailBoard(e: SimEventLite): void {
		const sailor = en(e, "playerIdx");
		const pass = en(e, "passengerIdx");
		this.passengers.set(pass, sailor);
		const p = this.c.foot(pass);
		fx.ring(higher(p, 0.4), 1, 5, 0.35, WATER, 1, 0.5);
		fx.burst(higher(p, 3), WATER, 10, { size: 1.6, speed: 14 });
	}

	private sailDrop(e: SimEventLite): void {
		const pass = en(e, "passengerIdx");
		this.passengers.delete(pass);
		const p = this.c.foot(pass);
		fx.ring(higher(p, 0.4), 1, 5, 0.35, WATER, 1, 0.5);
	}

	private sailEnd(e: SimEventLite): void {
		const sailor = en(e, "playerIdx");
		const keep: number[] = [];
		for (const [pass, s] of this.passengers) {
			if (s === sailor) keep.push(pass);
		}
		for (const pass of keep) this.passengers.delete(pass);
		const p = this.c.foot(sailor);
		sheet("sunce.wake", higher(p, 2), 9, 0.6, WATER);
		fx.burst(higher(p, 2), WATER, 20, { size: 2.2, speed: 22 });
	}

	// ---------------------------------------------------------------- Xiao Qiao

	private gustMark(e: SimEventLite): void {
		const centre = W(en(e, "x"), en(e, "y"));
		sheet("xiaoqiao.mark", higher(centre, 0.6), 9, 0.6, PINK);
		sheet("xiaoqiao.markHold", higher(centre, 0.8), 9, 0.7, PINK);
		fx.burst(higher(centre, 6), PINK, 18, { size: 1.6, speed: 4, life: 1.2, gravity: 6, spread: 180 });
	}

	private gustBlow(e: SimEventLite): void {
		const centre = W(en(e, "x"), en(e, "y"));
		fx.spiral(() => centre, 10, 18, PINK, 1.8, 56, 1.3, true, WHITE);
		sheet("xiaoqiao.gust", higher(centre, 6), 9, 1.2, PINK);
		sheet("xiaoqiao.petals", higher(centre, 9), 9, 1.4, PINK);
		fx.ring(higher(centre, 0.5), 2, 18, 0.6, PINK, 1.4, 0.6);
		fx.burst(higher(centre, 2), PINK, 26, { size: 2, speed: 26, life: 1 });
		shakeNear(this.c, centre, 0.8, 0.6);
		for (const v of ea(e, "victimIdxs")) {
			impactFx(this.c.chest(v), PINK, 0.8, "xiaoqiao.impact");
		}
	}

	private makeGust(z: SnapZone): GustView {
		const centre = W(z.x, z.y);
		const r = z.r * STUDS_PER_PX;
		const disc = discPart(higher(centre, 0.12), r, PINK, 0.8);
		const ring = new RingSet(28, 1, 0.4, PINK);
		const petals: Part[] = [];
		for (let i = 0; i < 12; i++) {
			petals.push(fx.block(new CFrame(centre), new Vector3(1.4, 0.15, 1), i % 2 === 0 ? PINK : WHITE));
		}
		return { x: z.x, y: z.y, seen: true, centre, r, disc, ring, petals, t: 0 };
	}

	// ---------------------------------------------------------------- Da Qiao

	private portalStart(e: SimEventLite): void {
		const centre = W(en(e, "x"), en(e, "y"));
		const r = en(e, "radius") * STUDS_PER_PX;
		sheet("daqiao.form", higher(centre, 1.5), 9, 1.2, WHITE);
		fx.ring(higher(centre, 0.4), 2, r, 0.6, CYAN, 1.4, 0.5);
		fx.burst(higher(centre, 3), MAGENTA, 24, { size: 2.2, speed: 22, life: 1 });
		shakeNear(this.c, centre, 0.4, 0.4);
	}

	private portalSummon(e: SimEventLite): void {
		const p = this.c.chest(en(e, "playerIdx"));
		sheet("daqiao.summon", p, 9, 0.8, WHITE);
		fx.burst(p, MAGENTA, 16, { size: 1.8, speed: 18 });
	}

	/** A summoned teammate arrives: light pillar at the arrival point and at the spot he vanished from. */
	private portalArrive(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const to = W(en(e, "x"), en(e, "y"));
		const from = this.c.foot(idx);
		fx.pillar(to, 1.0, 36, 0.6, MAGENTA, true);
		fx.burst(higher(to, 2), CYAN, 14, { size: 1.8, speed: 16 });
		const dx = from.X - to.X;
		const dz = from.Z - to.Z;
		if (dx * dx + dz * dz > 64) {
			fx.pillar(from, 1.0, 36, 0.5, CYAN, true);
			fx.burst(higher(from, 2), MAGENTA, 12, { size: 1.6, speed: 14 });
		}
	}

	private makePortal(z: SnapZone): PortalView {
		const centre = W(z.x, z.y);
		const r = z.r * STUDS_PER_PX;
		const disc = discPart(higher(centre, 0.12), r, MAGENTA, 0.8);
		const ring = new RingSet(32, 1.2, 0.4, MAGENTA);
		const runes: Part[] = [];
		for (let i = 0; i < 24; i++) {
			runes.push(fx.block(new CFrame(centre), new Vector3(1.4, 0.3, 1.4), math.floor(i / 8) === 1 ? CYAN : MAGENTA));
		}
		return { x: z.x, y: z.y, seen: true, centre, r, team: z.team, disc, ring, runes, t: 0 };
	}

	// ---------------------------------------------------------------- Zhou Yu

	private eastwindStart(e: SimEventLite): void {
		const centre = W(en(e, "x"), en(e, "y"));
		const r = en(e, "radius") * STUDS_PER_PX;
		fx.ring(higher(centre, 0.5), 3, r * 1.15, 0.5, WIND, 1.6, 0.6);
		fx.ring(higher(centre, 0.6), 2, r, 0.7, GREEN, 1.2, 0.5);
		fx.spiral(() => centre, 9, 14, GREEN, 1.2, 44, 1.2, true, WIND);
		sheet("zhouyu.active", higher(centre, 1), 9, 1.2, WHITE);
		sheet("zhouyu.burst", higher(centre, 3), 9, 0.7, WHITE);
		sheet("zhouyu.tornado", higher(centre, 6), 9, 1.2, WHITE);
		shakeNear(this.c, centre, 0.8, 0.6);
		for (const v of ea(e, "victimIdxs")) {
			const p = this.c.chest(v);
			impactFx(p, GREEN, 0.9, "zhouyu.slash");
			fx.dust(new Vector3(p.X, 0.5, p.Z), 6, 5);
		}
	}

	private makeWind(z: SnapZone): WindView {
		const centre = W(z.x, z.y);
		const r = z.r * STUDS_PER_PX;
		const disc = discPart(higher(centre, 0.12), r, GREEN, 0.82);
		const ring = new RingSet(32, 1.2, 0.4, WIND);
		const lines: Part[] = [];
		for (let i = 0; i < 14; i++) {
			lines.push(fx.glow(Enum.PartType.Block, new CFrame(centre), new Vector3(0.3, 0.3, 6), WIND, 0.2));
		}
		const sparkle = emitterHost(higher(centre, 1), new Vector3(r * 1.6, 0.2, r * 1.6), WIND, 14, 1, 1.6, 3, 0, 180);
		return { x: z.x, y: z.y, seen: true, centre, r, disc, ring, lines, sparkle, t: 0 };
	}

	// ---------------------------------------------------------------- Sun Quan

	private arrowshipStart(e: SimEventLite): void {
		const p = W(en(e, "x"), en(e, "y"));
		fx.ring(higher(p, 0.4), 2, 15, 0.7, WATER, 1.6, 0.6);
		fx.ring(higher(p, 0.5), 1, 10, 0.5, WHITE, 1, 0.5);
		fx.burst(higher(p, 2), WATER, 34, { size: 2.6, speed: 30 });
		sheet("sunquan.emerge", higher(p, 6), 9, 0.9, WHITE);
		shakeNear(this.c, p, 0.7, 0.6);
	}

	private flyArrow(arrow: Prop, a: Vector3, b: Vector3, dur: number, arcH: number, destroy: boolean): void {
		spawnLoop(
			dur + 0.2,
			(t) => {
				const k = math.min(1, t / dur);
				const p = a.Lerp(b, k).add(new Vector3(0, math.sin(k * math.pi) * arcH, 0));
				const k2 = math.min(1, k + 0.03);
				const q = a.Lerp(b, k2).add(new Vector3(0, math.sin(k2 * math.pi) * arcH, 0));
				const d = q.sub(p);
				placeProp(arrow, CFrame.lookAt(p, p.add(d.Magnitude > 0.01 ? d : new Vector3(0, 0, -1))));
				return k < 1;
			},
			() => {
				if (destroy) arrow.model.Destroy();
			},
		);
	}

	/** Stops an incoming shot or attack: an arrow sticks into the hull. */
	private arrowshipBlock(e: SimEventLite): void {
		const ship = this.ships[0];
		const p = W(en(e, "x"), en(e, "y"), 3);
		fx.burst(p, WHITE, 8, { size: 1.2, speed: 14 });
		shakeNear(this.c, p, 0.3, 0.2);
		if (ship === undefined || ship.arrows.size() >= 10) return;
		const side = ship.dir;
		const hull = ship.base.add(new Vector3(side * 3.2, 3.5 + math.random() * 2.5, (math.random() - 0.5) * 16));
		const arrow = makeProp("arrow", "arrow", GOLD, 0);
		ship.arrows.push(arrow);
		this.flyArrow(arrow, hull.add(new Vector3(side * 9, 3, 0)), hull, 0.18, 1, false);
	}

	/** Volley: the ship turns bow-first toward the field and looses arrows along it. */
	private arrowshipVolley(e: SimEventLite): void {
		const ship = this.ships[0];
		const dir = en(e, "dir") >= 0 ? 1 : -1;
		const len = en(e, "len") * STUDS_PER_PX;
		const halfW = en(e, "halfW") * STUDS_PER_PX;
		const base = ship !== undefined ? ship.base : W(en(e, "x"), en(e, "y"));
		sheet("sunquan.volley", higher(base, 8), 9, 0.8, WHITE);
		shakeNear(this.c, base, 0.5, 0.4);
		const n = 14;
		for (let i = 0; i < n; i++) {
			fx.spawn(() => {
				fx.wait(0.3 + i * 0.035);
				const arrow = makeProp("arrow", "arrow", i % 2 === 0 ? GOLD : WARM, 0);
				const zOff = (math.random() * 2 - 1) * halfW * 0.6;
				const from = base.add(new Vector3(dir * 7, 5 + (i % 3), zOff * 0.3));
				const to = base.add(new Vector3(dir * len * (0.55 + math.random() * 0.45), 1 + math.random() * 3, zOff));
				this.flyArrow(arrow, from, to, 0.6, 7, true);
				if (i % 3 === 0) {
					fx.wait(0.6);
					fx.burst(to, GOLD, 4, { size: 1, speed: 10 });
				}
			});
		}
		for (const v of ea(e, "victimIdxs")) {
			fx.spawn(() => {
				fx.wait(0.6);
				impactFx(this.c.chest(v), WARM, 1.3, "sunquan.impact");
				shakeNear(this.c, this.c.chest(v), 0.6, 0.3);
			});
		}
	}

	private makeShip(z: SnapZone): ShipView {
		const base = W(z.x, z.y);
		const dir = z.dir >= 0 ? 1 : -1;
		const prop = makeProp("sunquan_ship", "ship", Color3.fromRGB(150, 50, 45), 0);
		return { x: z.x, y: z.y, seen: true, prop, base, dir, heading: new Vector3(0, 0, 1), rise: 0, arrows: [] };
	}

	/** The zone is gone (volley fired or the ship ended): the ship swings its bow toward the field, lingers while the arrows fly, then sinks. */
	private dropShip(s: ShipView): void {
		const prop = s.prop;
		const base = s.base;
		const start = s.heading;
		const target = new Vector3(s.dir, 0, 0);
		const arrows = s.arrows;
		fx.ring(higher(base, 0.4), 2, 12, 0.5, WATER, 1.2, 0.5);
		spawnLoop(
			1.5,
			(t) => {
				const kt = math.min(1, t / 0.35);
				const h = start.Lerp(target, kt * (2 - kt));
				const heading = h.Magnitude > 0.01 ? h.Unit : target;
				const sink = t > 0.95 ? math.min(1, (t - 0.95) / 0.5) : 0;
				const pos = base.add(new Vector3(0, -16 * sink * sink, 0));
				placeProp(prop, CFrame.lookAt(pos, pos.add(heading)));
				return sink < 1;
			},
			() => {
				fx.burst(higher(base, 1), WATER, 18, { size: 2.2, speed: 22 });
				prop.model.Destroy();
				for (const a of arrows) a.model.Destroy();
			},
		);
	}

	// ---------------------------------------------------------------- per frame

	frame(dt: number, zones: SnapZone[]): void {
		const c = this.c;
		this.gusts = syncZones(
			this.gusts,
			zones,
			"gust",
			6,
			(z) => this.makeGust(z),
			(v) => {
				v.t += dt;
				const g = math.min(1, v.t / 0.25);
				const pulse = 0.8 - math.min(1, v.t / 0.5) * 0.25;
				setDisc(v.disc, higher(v.centre, 0.12), v.r * g, pulse);
				v.ring.set(higher(v.centre, 0.2), v.r * (1 - 0.35 * math.min(1, v.t / 0.5)), 0.2);
				for (let i = 0; i < v.petals.size(); i++) {
					const ang = v.t * 9 + (i / v.petals.size()) * 2 * math.pi;
					const rad = v.r * (0.35 + 0.4 * ((i % 3) / 2)) * g;
					v.petals[i].CFrame = new CFrame(v.centre.add(new Vector3(math.cos(ang) * rad, 0.5 + (i % 4) * 0.5, math.sin(ang) * rad))).mul(CFrame.Angles(ang, ang * 0.7, 0));
				}
			},
			(v) => {
				v.disc.Destroy();
				v.ring.destroy();
				for (const p of v.petals) p.Destroy();
			},
		);

		this.portals = syncZones(
			this.portals,
			zones,
			"portal",
			6,
			(z) => this.makePortal(z),
			(v) => {
				v.t += dt;
				const g = math.min(1, v.t / 0.3);
				setDisc(v.disc, higher(v.centre, 0.12), v.r * g, 0.78 + 0.08 * math.sin(v.t * 8));
				v.ring.set(higher(v.centre, 0.2), v.r * g, 0.15);
				const radii = [0.85, 0.58, 0.32];
				for (let i = 0; i < v.runes.size(); i++) {
					const rr = math.floor(i / 8);
					const ang = ((i % 8) / 8) * 2 * math.pi + v.t * (rr % 2 === 0 ? 4 : -4);
					const rad = v.r * radii[rr] * g;
					v.runes[i].CFrame = new CFrame(v.centre.add(new Vector3(math.cos(ang) * rad, 0.4, math.sin(ang) * rad))).mul(CFrame.Angles(0, ang * 2, 0));
				}
			},
			(v) => {
				v.disc.Destroy();
				v.ring.destroy();
				for (const p of v.runes) p.Destroy();
			},
		);

		this.winds = syncZones(
			this.winds,
			zones,
			"eastwind",
			6,
			(z) => this.makeWind(z),
			(v) => {
				v.t += dt;
				const g = math.min(1, v.t / 0.3);
				setDisc(v.disc, higher(v.centre, 0.12), v.r * g, 0.82 + 0.06 * math.sin(v.t * 5));
				v.ring.set(higher(v.centre, 0.2), v.r * g, 0.2);
				for (let i = 0; i < v.lines.size(); i++) {
					const ang = v.t * 5 + (i / v.lines.size()) * 2 * math.pi;
					const rad = v.r * (0.5 + 0.45 * (((i * 7) % 5) / 4)) * g;
					const pos = v.centre.add(new Vector3(math.cos(ang) * rad, 0.8 + (i % 4) * 1.4, math.sin(ang) * rad));
					v.lines[i].CFrame = CFrame.lookAt(pos, pos.add(new Vector3(-math.sin(ang), 0, math.cos(ang))));
				}
			},
			(v) => {
				v.disc.Destroy();
				v.ring.destroy();
				for (const p of v.lines) p.Destroy();
				v.sparkle.Destroy();
			},
		);

		this.ships = syncZones(
			this.ships,
			zones,
			"arrowship",
			12,
			(z) => this.makeShip(z),
			(v) => {
				v.rise = math.min(1, v.rise + dt / 0.7);
				const lift = -16 * (1 - v.rise) * (1 - v.rise);
				const pos = v.base.add(new Vector3(0, lift, 0));
				placeProp(v.prop, CFrame.lookAt(pos, pos.add(v.heading)));
			},
			(v) => this.dropShip(v),
		);

		this.updateBoats();
		this.updateChains();
		const pending: number[] = [];
		for (const [pass, sailor] of this.passengers) {
			if (!this.boats.has(sailor)) pending.push(pass);
		}
		for (const pass of pending) this.passengers.delete(pass);
	}

	private updateBoats(): void {
		for (const [, b] of this.boats) {
			const pos = b.rootPos.sub(b.dir.mul(5));
			b.wake.CFrame = new CFrame(new Vector3(pos.X, 0.8, pos.Z));
		}
	}

	/** Chain bands around opponents standing inside a portal. */
	private updateChains(): void {
		const c = this.c;
		const inside = new Set<number>();
		for (const v of this.portals) {
			for (let i = 0; i < c.count(); i++) {
				if (c.teamOf(i) === v.team) continue;
				const f = c.foot(i);
				const dx = f.X - v.centre.X;
				const dz = f.Z - v.centre.Z;
				if (dx * dx + dz * dz < v.r * v.r) inside.add(i);
			}
		}
		const now = os.clock();
		for (const i of inside) {
			let bands = this.chains.get(i);
			if (bands === undefined) {
				bands = [];
				for (let k = 0; k < 2; k++) bands.push(new RingSet(14, 0.25, 0.25, k === 0 ? MAGENTA : CYAN));
				this.chains.set(i, bands);
			}
			const foot = c.foot(i);
			for (let k = 0; k < bands.size(); k++) {
				bands[k].set(foot.add(new Vector3(0, 1.2 + k * 3, 0)), 2.3, 0.5);
			}
		}
		for (const [i, bands] of this.chains) {
			if (!inside.has(i)) {
				for (const b of bands) b.destroy();
				this.chains.delete(i);
			}
		}
	}

	mount(idx: number, foot: Vector3, facing: Vector3, sp: string): Mount | undefined {
		const sailing = sp === "sail" && this.c.specialOf(idx) === "sail";
		let boat = this.boats.get(idx);
		if (sailing) {
			if (boat === undefined) {
				const prop = makeProp("sunce_boat", "boat", Color3.fromRGB(40, 110, 220), this.c.footOffset(idx), undefined, 1.8);
				const wake = emitterHost(foot, new Vector3(3, 0.2, 3), WATER, 60, 1.8, 0.6, 14, 28, 50);
				boat = { prop, dir: facing, rootPos: foot, wake };
				this.boats.set(idx, boat);
			}
			const nd = boat.dir.Lerp(facing, 0.2);
			if (nd.Magnitude > 0.01) boat.dir = nd.Unit;
			const rootCF = placeProp(boat.prop, CFrame.lookAt(foot, foot.add(boat.dir)));
			boat.rootPos = rootCF.Position;
			return { cf: rootCF, pose: "stand" };
		}
		if (boat !== undefined) {
			boat.prop.model.Destroy();
			boat.wake.Destroy();
			this.boats.delete(idx);
		}
		const sailor = this.passengers.get(idx);
		if (sailor !== undefined) {
			const sb = this.boats.get(sailor);
			if (sb !== undefined) {
				const att = sb.prop.model.FindFirstChild("Seat2", true);
				let pos = sb.rootPos.sub(sb.dir.mul(3));
				if (att !== undefined && att.IsA("Attachment")) {
					pos = att.WorldPosition.add(new Vector3(0, this.c.footOffset(idx), 0));
				}
				return { cf: CFrame.lookAt(pos, pos.add(sb.dir)), pose: "stand" };
			}
		}
		return undefined;
	}

	clear(): void {
		for (const [, b] of this.boats) {
			b.prop.model.Destroy();
			b.wake.Destroy();
		}
		this.boats.clear();
		this.passengers.clear();
		for (const v of this.gusts) {
			v.disc.Destroy();
			v.ring.destroy();
			for (const p of v.petals) p.Destroy();
		}
		this.gusts = [];
		for (const v of this.portals) {
			v.disc.Destroy();
			v.ring.destroy();
			for (const p of v.runes) p.Destroy();
		}
		this.portals = [];
		for (const v of this.winds) {
			v.disc.Destroy();
			v.ring.destroy();
			for (const p of v.lines) p.Destroy();
			v.sparkle.Destroy();
		}
		this.winds = [];
		for (const v of this.ships) {
			v.prop.model.Destroy();
			for (const a of v.arrows) a.model.Destroy();
		}
		this.ships = [];
		for (const [, bands] of this.chains) {
			for (const b of bands) b.destroy();
		}
		this.chains.clear();
	}
}
