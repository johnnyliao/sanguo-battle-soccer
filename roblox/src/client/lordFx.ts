// Lord weapon effects for the lords (charId lord_*): the sword whirl (the lord spins, orbiting sword-qi crescents, ground
// disc, gold aura, light shake per hit), the dragonspear (charge column and runes, the flying golden dragon with ember
// trail, impact shockwave, scorch line; power shots carry a flame trail), the fan's wind puff, and the feather fan (wind
// blades, feather burst, phoenix silhouette, feather vortex on victims, feather pull arc, speed-boost trail). Visual only.
// Whirl, charge and feather effects follow sim events; the spear and the puff follow their snapshot zones (k "spear" /
// "puff"). The whirl also follows its snapshot zone (k "whirl", idx = the lord), so the spin shows even if whirlStart is
// missed. Everything is removed on match reset.
//
// WHERE THE FX LIVE (for finding them in Studio Explorer):
// - All lord FX parts (whirl blades, ground disc, aura, wind emitter, dragonspear column / runes / dragon, spear and puff
//   models, feathers, phoenix, wind arcs, slow rings) are created by fx.block / fx.glow / fx.ball / fx.burst and sit directly
//   under Workspace.MatchFx (a Folder made by matchFx.ts; cleared on each new match). The parts are unnamed: while a whirl
//   runs, look for 21 Neon Blocks (7 blades x 3 segments, 0.3 wide) and one Cylinder of diameter ~28 studs.
// - Part positions use simToWorld (matchUtil W / render.ts foot), so they include the pitch centring offset. The whirl
//   centre is the lord's foot + 3.2 studs; the whirl radius is LORD_WHIRL_RADIUS * STUDS_PER_PX (14 studs).
// - The lord's own body is the avatar model under Workspace.Actors (render.ts), spun by spinOf() via render.ts drawPlayers.
import { LORD_DRAGON_HALF_WIDTH, LORD_DRAGON_STEP, LORD_FEATHER_RADIUS, LORD_FEATHER_SLOW_TICKS, LORD_WHIRL_RADIUS, LORD_WINDPUFF_STEP } from "shared/game/sim/constants";
import { STUDS_PER_PX, TICK_RATE, type SimEventLite, type SnapZone } from "shared/net";
import * as fx from "./fx";
import { crossFlash } from "./bladeWave";
import { shake } from "./camera";
import * as sfx from "./sfx";
import { callout, clearCallout } from "./specialCallout";
import { MatchCtx, Mount, RingSet, SpecialModule, W, WHITE, ZView, ea, emitterHost, en, expOut, hitSpark, impactFx, shakeNear, syncZones, trailOrbs } from "./matchUtil";

const GOLD = Color3.fromRGB(255, 200, 60);
const GOLD_HOT = Color3.fromRGB(255, 245, 200);
const ORANGE = Color3.fromRGB(255, 130, 40);
const RED_GOLD = Color3.fromRGB(255, 95, 35);
const SWORD_WHITE = Color3.fromRGB(255, 250, 230);
const JADE = Color3.fromRGB(120, 255, 170);
const JADE_PALE = Color3.fromRGB(225, 255, 235);
const FEATHER = Color3.fromRGB(235, 255, 245);
const SCORCH = Color3.fromRGB(120, 60, 20);

/** Cast callout names and accent colours (sword gold-white, spear gold-red, fan jade-green). */
const SWORD_NAME = "天子劍・旋風斬";
const SPEAR_NAME = "破陣槍・龍騰";
const FAN_NAME = "鳳翼扇・羽風陣";
const SWORD_ACCENT = Color3.fromRGB(255, 240, 190);
const SPEAR_ACCENT = Color3.fromRGB(255, 110, 50);
const FAN_ACCENT = Color3.fromRGB(150, 255, 190);

/** Height (studs) of the whirl centre, the spear and the puff above the ground. */
const FLY_H = 4.5;
/** Sim px per second -> studs per second. */
const PX_PER_SEC = TICK_RATE * STUDS_PER_PX;
const SPEAR_SPEED = LORD_DRAGON_STEP * PX_PER_SEC;
const PUFF_SPEED = LORD_WINDPUFF_STEP * PX_PER_SEC;
const WHIRL_R = LORD_WHIRL_RADIUS * STUDS_PER_PX;
/** Whirl: the lord spins 2.5 turns per second; blades per whirl; fade-out time (s); light shake interval (s). */
const WHIRL_SPIN = 2.5 * 2 * math.pi;
const WHIRL_FADE = 0.25;
const WHIRL_BLADES = 7;
const WHIRL_SHAKE_EVERY = 0.5;
/** Feather slow mark duration (s): the slow lasts LORD_FEATHER_SLOW_TICKS. */
const SLOW_SECS = LORD_FEATHER_SLOW_TICKS / TICK_RATE;
/** Feather fan: cone angle used when the sim does not send angleDeg, wind-blade segments, arc life (s), feathers per burst. */
const CONE_DEG_DEFAULT = 120;
const ARC_SEGS = 12;
const ARC_LIFE = 0.55;
const FEATHER_COUNT = 22;
const PULL_FLIGHTS = 9;
const PULL_TRAILS = 5;
/** Speed-boost trail length (s) and the phoenix silhouette life (s) / rise (studs). */
const BOOST_SECS = 1.5;
const PHOENIX_LIFE = 0.8;
const PHOENIX_RISE = 3;
/** Dragonspear charge: longest wait (s) before the charge gives up, and the fizzle shrink time (s). */
const CHARGE_MAX = 0.6;
const CHARGE_FIZZLE = 0.15;
const RUNE_N = 6;
/** Dragon: body segments, studs between segments. */
const DRAGON_SEGS = 12;
const DRAGON_GAP = 1.35;
/** A power shot (dragonFire withBall) is matched to its snapshot spear within this many px / seconds. */
const POWER_MATCH_PX = 120;
const POWER_MATCH_SECS = 0.6;
/** Sound window around the camera look-at point (studs), same as the renderer's culling. */
const SFX_HALF = 40;

/** Horizontal unit vector (world) from sim direction components. */
function dirVec(x: number, y: number): Vector3 {
	const d = new Vector3(x, 0, y);
	return d.Magnitude > 0.01 ? d.Unit : new Vector3(1, 0, 0);
}

/** A spear / puff view keeps its displayed position moving at the sim speed and eases toward the snapshot position. */
interface SpearView extends ZView {
	target: Vector3;
	pos: Vector3;
	dir: Vector3;
	origin: Vector3;
	age: number;
	head: Part;
	snout: Part;
	hornL: Part;
	hornR: Part;
	eyeL: Part;
	eyeR: Part;
	segs: Part[];
	glow: Part;
	host: Part;
}

interface PuffView extends ZView {
	target: Vector3;
	pos: Vector3;
	dir: Vector3;
	t: number;
	ball: Part;
	motes: Part[];
}

/** One crescent sword-qi blade: three neon segments (outer tips, middle) and a sword trail on the middle one. */
interface Blade {
	segs: Part[];
	trail: Trail;
}

interface WhirlView {
	idx: number;
	ring: RingSet;
	disc: Part;
	aura: Part;
	wind: Part;
	blades: Blade[];
	/** Accumulated spin (rad) while running. */
	spin: number;
	shakeT: number;
	/** -1 while the whirl runs; seconds since whirlEnd while fading. */
	endT: number;
}

interface ChargeView {
	idx: number;
	core: Part;
	column: Part;
	inner: Part;
	runes: Part[];
	motes: Part[];
	age: number;
	/** -1 while charging; seconds since the charge ended (fired or fizzled). */
	endT: number;
}

interface ArcView {
	segs: Part[];
	centre: Vector3;
	base: Vector3;
	half: number;
	r: number;
	age: number;
	delay: number;
}

interface SlowMark {
	idx: number;
	age: number;
	ring: RingSet;
	orbs: Part[];
}

/** A small part moved by hand each frame (feathers): fades with its age. */
interface Mote {
	part: Part;
	pos: Vector3;
	vel: Vector3;
	spin: Vector3;
	drag: number;
	age: number;
	life: number;
	alpha0: number;
}

/** A feather flying from the lost ball to the lord's feet along a short arc. */
interface Flight {
	part: Part;
	from: Vector3;
	lord: number;
	age: number;
	delay: number;
	dur: number;
}

interface WingSeg {
	part: Part;
	s: number;
	k: number;
}

/** Translucent phoenix silhouette behind the fan caster (wings flap, rises, fades). */
interface Phoenix {
	idx: number;
	age: number;
	body: Part;
	head: Part;
	beak: Part;
	tail: Part[];
	wings: WingSeg[];
}

interface PowerShot {
	x: number;
	y: number;
	t: number;
}

export class LordFx implements SpecialModule {
	private c: MatchCtx;
	private spears: SpearView[] = [];
	private puffs: PuffView[] = [];
	private whirls: WhirlView[] = [];
	private charges: ChargeView[] = [];
	private arcs: ArcView[] = [];
	private marks: SlowMark[] = [];
	private motes: Mote[] = [];
	private flights: Flight[] = [];
	private phoenixes: Phoenix[] = [];
	private powerShots: PowerShot[] = [];

	constructor(c: MatchCtx) {
		this.c = c;
	}

	handle(e: SimEventLite): void {
		const t = e.type;
		const idx = en(e, "playerIdx");
		if (t === "whirlStart") {
			this.startWhirl(idx);
			this.cast(idx, SWORD_NAME, SWORD_ACCENT);
		} else if (t === "whirlEnd") this.endWhirl(idx);
		else if (t === "whirlHit") this.whirlHit(e, idx);
		else if (t === "dragonCharge") {
			this.startCharge(idx);
			this.cast(idx, SPEAR_NAME, SPEAR_ACCENT);
		} else if (t === "dragonCancel") this.endCharge(idx, true);
		else if (t === "dragonFire") this.dragonFire(e, idx);
		else if (t === "dragonHit") this.dragonHit(e);
		else if (t === "windpuffSpawn") fx.burst(this.at(e, FLY_H), JADE, 8, { size: 1, speed: 10, life: 0.35 });
		else if (t === "windpuffHit") {
			const p = this.at(e, FLY_H);
			fx.burst(p, JADE, 12, { size: 1.4, speed: 18, life: 0.45 });
			hitSpark(p, JADE, 0.6);
		} else if (t === "windpuffBall") fx.burst(this.at(e, 1.5), JADE, 8, { size: 1, speed: 12, life: 0.35 });
		else if (t === "featherStart") this.featherStart(e);
		else if (t === "featherPull") this.featherPull(e);
		else if (t === "featherBoost") this.boostTrail(idx);
	}

	/** Lord specials have no special-start hook of their own (the events above carry them). */
	special(_idx: number, _charId: string): void {}

	/** The lord's effects never mount a player. */
	mount(_idx: number, _foot: Vector3, _facing: Vector3, _sp: string): Mount | undefined {
		return undefined;
	}

	/** Extra yaw (rad) for the lord's model: the whirl spins him, then he settles back to his facing. 0 = no override. */
	spinOf(idx: number): number {
		for (const w of this.whirls) {
			if (w.idx !== idx) continue;
			const a = w.spin % (2 * math.pi);
			if (w.endT < 0) return a;
			// Unwind the leftover angle the short way round while the whirl fades.
			const d = a > math.pi ? a - 2 * math.pi : a;
			return d * (1 - math.min(1, w.endT / WHIRL_FADE));
		}
		return 0;
	}

	/** Called every render frame with the nearest snapshot's zones. */
	frame(dt: number, zones: SnapZone[]): void {
		this.syncWhirlZones(zones);
		this.spears = syncZones(
			this.spears,
			zones,
			"spear",
			60,
			(z) => this.makeSpear(z),
			(v, z) => this.updateSpear(v, z, dt),
			(v) => this.dropSpear(v),
		);
		this.puffs = syncZones(
			this.puffs,
			zones,
			"puff",
			40,
			(z) => this.makePuff(z),
			(v, z) => this.updatePuff(v, z, dt),
			(v) => this.dropPuff(v),
		);
		this.updateWhirls(dt);
		this.updateCharges(dt);
		this.updateArcs(dt);
		this.updateMarks(dt);
		this.updateMotes(dt);
		this.updateFlights(dt);
		this.updatePhoenixes(dt);
	}

	clear(): void {
		clearCallout();
		for (const s of this.spears) this.destroySpear(s);
		for (const p of this.puffs) this.destroyPuff(p);
		for (const w of this.whirls) this.destroyWhirl(w);
		for (const ch of this.charges) this.destroyCharge(ch);
		for (const a of this.arcs) {
			for (const s of a.segs) s.Destroy();
		}
		for (const m of this.marks) {
			m.ring.destroy();
			for (const o of m.orbs) o.Destroy();
		}
		for (const m of this.motes) m.part.Destroy();
		for (const f of this.flights) f.part.Destroy();
		for (const p of this.phoenixes) this.destroyPhoenix(p);
		this.spears = [];
		this.puffs = [];
		this.whirls = [];
		this.charges = [];
		this.arcs = [];
		this.marks = [];
		this.motes = [];
		this.flights = [];
		this.phoenixes = [];
		this.powerShots = [];
	}

	// ---------------------------------------------------------------- shared helpers

	/** World position of a sim event's x / y at height h; falls back to the named lord's feet when the event has no position. */
	private at(e: SimEventLite, h: number): Vector3 {
		const x = e["x"];
		const y = e["y"];
		if (typeIs(x, "number") && typeIs(y, "number")) return W(x, y, h);
		return this.c.foot(en(e, "playerIdx")).add(new Vector3(0, h, 0));
	}

	/** Camera shake: the human's own lord shakes the screen directly, other lords only when they happen near the view. */
	private quake(idx: number, pos: Vector3, amp: number, dur: number): void {
		if (idx >= 0 && idx === this.c.humanIdx()) shake(amp, dur);
		else shakeNear(this.c, pos, amp, dur);
	}

	/** Sound layering is culled like the event sounds: only what is near the camera plays. */
	private audible(pos: Vector3): boolean {
		return math.abs(pos.X - this.c.focusX()) <= SFX_HALF && math.abs(pos.Z - this.c.focusZ()) <= SFX_HALF;
	}

	/** Cast banner (full size + flash for the human's lord, smaller for the others). */
	private cast(idx: number, name: string, accent: Color3): void {
		callout(name, accent, idx === this.c.humanIdx());
	}

	// ---------------------------------------------------------------- sword whirl

	private startWhirl(idx: number): void {
		for (const w of this.whirls) {
			if (w.idx === idx && w.endT < 0) return;
		}
		const centre = this.c.foot(idx).add(new Vector3(0, 3.2, 0));
		const blades: Blade[] = [];
		for (let i = 0; i < WHIRL_BLADES; i++) {
			const segs: Part[] = [];
			for (let k = 0; k < 3; k++) {
				const len = k === 1 ? 2.6 : 2.0;
				segs.push(fx.block(new CFrame(centre), new Vector3(0.3, 0.5, len), k === 1 ? SWORD_WHITE : GOLD_HOT, 0.1));
			}
			const trail = fx.makeTrail(segs[1], new Vector3(0, 0, -1.4), new Vector3(0, 0, 1.4), GOLD);
			trail.Enabled = true;
			blades.push({ segs, trail });
		}
		const disc = fx.glow(Enum.PartType.Cylinder, new CFrame(centre), new Vector3(0.2, WHIRL_R * 2, WHIRL_R * 2), GOLD, 0.5);
		const wind = emitterHost(centre, new Vector3(1, 1, 1), SWORD_WHITE, 35, 0.9, 0.5, 14, 0, 180);
		const aura = fx.ball(centre, 6.5, GOLD, 0.78);
		this.whirls.push({ idx, ring: new RingSet(16, 0.5, 0.6, GOLD), disc, aura, wind, blades, spin: 0, shakeT: 0, endT: -1 });
	}

	private endWhirl(idx: number): void {
		for (const w of this.whirls) {
			if (w.idx !== idx || w.endT >= 0) continue;
			w.endT = 0;
			for (const b of w.blades) b.trail.Enabled = false;
			const em = w.wind.FindFirstChildOfClass("ParticleEmitter");
			if (em !== undefined) em.Enabled = false;
		}
	}

	/**
	 * The whirl also follows the snapshot: a whirl zone (the lord's whirlTicks > 0) starts the spin when whirlStart was missed,
	 * and a running whirl whose zone is gone ends (the same as whirlEnd). A lord that already has a whirl view (running or
	 * fading) is left alone, so a stale snapshot cannot restart a whirl that has ended.
	 */
	private syncWhirlZones(zones: SnapZone[]): void {
		const live = new Set<number>();
		for (const z of zones) {
			if (z.k !== "whirl" || z.idx === undefined) continue;
			live.add(z.idx);
			if (!this.hasWhirl(z.idx)) this.startWhirl(z.idx);
		}
		for (const w of this.whirls) {
			if (w.endT < 0 && !live.has(w.idx)) this.endWhirl(w.idx);
		}
	}

	private hasWhirl(idx: number): boolean {
		for (const w of this.whirls) {
			if (w.idx === idx) return true;
		}
		return false;
	}

	/** Each sword-qi hit: white-gold sparks, a cross flash and a small shake. */
	private whirlHit(e: SimEventLite, idx: number): void {
		const p = this.at(e, FLY_H);
		crossFlash(p, GOLD);
		hitSpark(p, SWORD_WHITE, 0.8);
		fx.burst(p, GOLD_HOT, 8, { size: 1, speed: 16, life: 0.35 });
		this.quake(idx, p, 0.2, 0.15);
		if (this.audible(p)) sfx.play("heavy");
	}

	private destroyWhirl(w: WhirlView): void {
		w.ring.destroy();
		w.disc.Destroy();
		w.aura.Destroy();
		w.wind.Destroy();
		for (const b of w.blades) {
			for (const s of b.segs) s.Destroy();
		}
	}

	private updateWhirls(dt: number): void {
		const keep: WhirlView[] = [];
		for (const w of this.whirls) {
			if (w.endT >= 0) w.endT += dt;
			if (w.endT >= WHIRL_FADE) {
				this.destroyWhirl(w);
				continue;
			}
			const running = w.endT < 0;
			const k = running ? 0 : w.endT / WHIRL_FADE;
			const tr = 0.15 + 0.85 * k;
			const foot = this.c.foot(w.idx);
			const centre = foot.add(new Vector3(0, 3.2, 0));
			const ground = new Vector3(foot.X, 0.3, foot.Z);
			if (running) {
				w.spin += dt * WHIRL_SPIN;
				w.shakeT -= dt;
				if (w.shakeT <= 0) {
					w.shakeT = WHIRL_SHAKE_EVERY;
					this.quake(w.idx, centre, 0.12, 0.45);
				}
			}
			w.ring.set(ground, WHIRL_R, tr);
			w.disc.CFrame = new CFrame(ground).mul(CFrame.Angles(0, 0, math.pi / 2));
			w.disc.Transparency = 0.45 + 0.55 * k;
			w.aura.CFrame = new CFrame(centre);
			w.aura.Transparency = 0.78 + 0.22 * k;
			w.wind.CFrame = new CFrame(centre);

			const n = w.blades.size();
			for (let i = 0; i < n; i++) {
				const ang = w.spin + (i / n) * 2 * math.pi;
				const outward = new Vector3(math.cos(ang), 0, math.sin(ang));
				const tangent = new Vector3(-math.sin(ang), 0, math.cos(ang));
				// The middle segment bulges outward on the orbit, the tips curve back inward: a crescent.
				const mid = centre.add(outward.mul(WHIRL_R + 0.6));
				const b = w.blades[i];
				b.segs[1].CFrame = CFrame.lookAt(mid, mid.add(tangent));
				for (let j = 0; j < 2; j++) {
					const s = j === 0 ? -1 : 1;
					const tip = mid.add(tangent.mul(s * 1.9)).sub(outward.mul(0.5));
					const tipDir = CFrame.Angles(0, -s * math.rad(25), 0).VectorToWorldSpace(tangent);
					b.segs[j === 0 ? 0 : 2].CFrame = CFrame.lookAt(tip, tip.add(tipDir));
				}
				for (const sg of b.segs) sg.Transparency = tr;
			}
			keep.push(w);
		}
		this.whirls = keep;
	}

	// ---------------------------------------------------------------- dragonspear

	/** Golden column, rotating ground runes and a glow at the hand during the windup; fizzles on dragonCancel, shrinks away on dragonFire. */
	private startCharge(idx: number): void {
		const hand = this.c.hand(idx);
		const foot = this.c.foot(idx);
		const core = fx.ball(hand, 0.6, GOLD_HOT, 0.2);
		const motes: Part[] = [];
		for (let i = 0; i < 6; i++) motes.push(fx.ball(hand, 0.5, GOLD, 0.1));
		const column = fx.glow(Enum.PartType.Cylinder, new CFrame(foot), new Vector3(0.1, 2.6, 2.6), GOLD, 0.7);
		const inner = fx.glow(Enum.PartType.Cylinder, new CFrame(foot), new Vector3(0.1, 1, 1), GOLD_HOT, 0.4);
		const runes: Part[] = [];
		for (let i = 0; i < RUNE_N; i++) runes.push(fx.block(new CFrame(foot), new Vector3(0.9, 0.12, 0.35), GOLD_HOT, 0.2));
		this.charges.push({ idx, core, column, inner, runes, motes, age: 0, endT: -1 });
	}

	private endCharge(idx: number, fizzle: boolean): void {
		for (const ch of this.charges) {
			if (ch.idx !== idx || ch.endT >= 0) continue;
			ch.endT = 0;
			if (fizzle) fx.burst(this.c.hand(idx), GOLD, 8, { size: 0.9, speed: 10, life: 0.3 });
		}
	}

	private destroyCharge(ch: ChargeView): void {
		ch.core.Destroy();
		ch.column.Destroy();
		ch.inner.Destroy();
		for (const r of ch.runes) r.Destroy();
		for (const m of ch.motes) m.Destroy();
	}

	private updateCharges(dt: number): void {
		const keep: ChargeView[] = [];
		for (const ch of this.charges) {
			let shrink = 1;
			if (ch.endT < 0) {
				ch.age += dt;
				if (ch.age > CHARGE_MAX) ch.endT = 0;
			}
			if (ch.endT >= 0) {
				ch.endT += dt;
				shrink = math.max(0, 1 - ch.endT / CHARGE_FIZZLE);
			}
			if (ch.endT >= CHARGE_FIZZLE) {
				this.destroyCharge(ch);
				continue;
			}
			const hand = this.c.hand(ch.idx);
			const foot = this.c.foot(ch.idx);
			const k = ch.endT < 0 ? math.min(1, ch.age / 0.25) : 1;
			const d = math.max(0.05, (0.6 + 1.6 * k) * shrink);
			ch.core.CFrame = new CFrame(hand);
			ch.core.Size = new Vector3(d, d, d);

			// Golden column rising from the feet; the runes turn on the ground under the lord.
			const height = math.max(0.05, 9 * k * shrink);
			const width = math.max(0.05, (1.2 + 1.4 * k) * shrink);
			ch.column.CFrame = new CFrame(foot.add(new Vector3(0, height / 2, 0))).mul(CFrame.Angles(0, 0, math.pi / 2));
			ch.column.Size = new Vector3(height, width, width);
			ch.inner.CFrame = new CFrame(foot.add(new Vector3(0, height / 2, 0))).mul(CFrame.Angles(0, 0, math.pi / 2));
			ch.inner.Size = new Vector3(height, width * 0.4, width * 0.4);
			const spinRunes = ch.age * 4;
			for (let i = 0; i < ch.runes.size(); i++) {
				const a = spinRunes + (i / ch.runes.size()) * 2 * math.pi;
				const p = foot.add(new Vector3(math.cos(a) * 3.4, 0.25, math.sin(a) * 3.4));
				ch.runes[i].CFrame = new CFrame(p).mul(CFrame.Angles(0, -a, 0));
				ch.runes[i].Transparency = 1 - shrink * 0.8;
			}

			const r = 3.4 + (0.4 - 3.4) * k;
			for (let i = 0; i < ch.motes.size(); i++) {
				const a = ch.age * 14 + (i / ch.motes.size()) * 2 * math.pi;
				const p = hand.add(new Vector3(math.cos(a) * r, math.sin(a) * r * 0.5, math.sin(a) * r));
				const m = ch.motes[i];
				m.CFrame = new CFrame(p);
				const ms = math.max(0.05, 0.5 * shrink);
				m.Size = new Vector3(ms, ms, ms);
			}
			keep.push(ch);
		}
		this.charges = keep;
	}

	/** A power shot (dragonFire withBall) is remembered by its spot so the spear spawned from it can be marked. */
	private takePowerShot(x: number, y: number): boolean {
		const now = os.clock();
		let hit = false;
		const keep: PowerShot[] = [];
		for (const s of this.powerShots) {
			if (now - s.t > POWER_MATCH_SECS) continue;
			if (!hit && math.abs(s.x - x) < POWER_MATCH_PX && math.abs(s.y - y) < POWER_MATCH_PX) {
				hit = true;
				continue;
			}
			keep.push(s);
		}
		this.powerShots = keep;
		return hit;
	}

	private dragonFire(e: SimEventLite, idx: number): void {
		this.endCharge(idx, false);
		const p = this.at(e, FLY_H);
		fx.burst(p, GOLD_HOT, 10, { size: 1.4, speed: 18, life: 0.35 });
		if (e["withBall"] === true) this.powerShots.push({ x: en(e, "x"), y: en(e, "y"), t: os.clock() });
		this.quake(idx, p, 0.7, 0.4);
		if (idx === this.c.humanIdx()) fx.flash(GOLD_HOT, 0.8, 0.12);
		if (this.audible(p)) sfx.play("zhangfei_roar");
	}

	/** Shockwave ring, spark burst, medium shake and a scorch where the dragon struck. */
	private dragonHit(e: SimEventLite): void {
		const p = this.at(e, FLY_H);
		impactFx(p, GOLD, 1.2);
		fx.ring(new Vector3(p.X, 0.3, p.Z), 2, 13, 0.35, GOLD_HOT, 1.6, 0.6);
		hitSpark(p, RED_GOLD, 1.3);
		this.quake(-1, p, 0.4, 0.3);
		if (this.audible(p)) sfx.play("hit_spear");
	}

	private makeSpear(z: SnapZone): SpearView {
		const pos = W(z.x, z.y, FLY_H);
		const dir = dirVec(z.dx ?? 0, z.dy ?? 0);
		const power = this.takePowerShot(z.x, z.y);
		const cf = CFrame.lookAt(pos, pos.add(dir));
		const head = fx.block(cf, new Vector3(2.2, 2.0, 3.2), power ? GOLD_HOT : GOLD);
		const snout = fx.block(cf, new Vector3(1.5, 1.2, 1.4), GOLD_HOT);
		const hornL = fx.block(cf, new Vector3(0.3, 0.3, 2.0), GOLD_HOT);
		const hornR = fx.block(cf, new Vector3(0.3, 0.3, 2.0), GOLD_HOT);
		const eyeL = fx.ball(pos, 0.5, WHITE);
		const eyeR = fx.ball(pos, 0.5, WHITE);
		// Bright trail along the flight path, from the head.
		const trail = fx.makeTrail(head, new Vector3(0, 0, 1.6), new Vector3(0, 0, -1.6), GOLD);
		trail.Enabled = true;
		const segs: Part[] = [];
		for (let i = 0; i < DRAGON_SEGS; i++) segs.push(fx.ball(pos, 2, i % 2 === 0 ? GOLD : RED_GOLD, 0.15));
		const glow = fx.ball(pos, power ? 5 : 3.2, power ? GOLD_HOT : GOLD, 0.8);
		// Ember emitter at the tail: a power shot (ball riding the dragon) burns hotter.
		const host = emitterHost(pos, new Vector3(0.5, 0.5, 0.5), power ? GOLD_HOT : ORANGE, power ? 140 : 70, 1.2, 0.5, 4, 0, 30);
		return { x: z.x, y: z.y, seen: false, target: pos, pos, dir, origin: pos, age: 0, head, snout, hornL, hornR, eyeL, eyeR, segs, glow, host };
	}

	private updateSpear(v: SpearView, z: SnapZone, dt: number): void {
		v.target = W(z.x, z.y, FLY_H);
		v.pos = v.pos.add(v.dir.mul(SPEAR_SPEED * dt)).Lerp(v.target, expOut(dt, 12));
		v.age += dt;
		const cf = CFrame.lookAt(v.pos, v.pos.add(v.dir));
		const side = new Vector3(-v.dir.Z, 0, v.dir.X);
		v.head.CFrame = cf;
		v.snout.CFrame = cf.mul(new CFrame(0, -0.1, -1.9));
		v.hornL.CFrame = cf.mul(new CFrame(-0.8, 1.0, 0.6)).mul(CFrame.Angles(math.rad(-35), 0, math.rad(18)));
		v.hornR.CFrame = cf.mul(new CFrame(0.8, 1.0, 0.6)).mul(CFrame.Angles(math.rad(-35), 0, math.rad(-18)));
		v.eyeL.CFrame = cf.mul(new CFrame(-0.95, 0.4, -0.7));
		v.eyeR.CFrame = cf.mul(new CFrame(0.95, 0.4, -0.7));
		// Body: segments trail behind the head on a sine wave that grows toward the tail.
		let tail = v.pos;
		for (let i = 0; i < v.segs.size(); i++) {
			const k = i + 1;
			const back = v.pos.sub(v.dir.mul(k * DRAGON_GAP));
			const phase = v.age * 16 - k * 0.75;
			const p = back.add(side.mul(math.sin(phase) * (0.5 + 0.12 * k))).add(new Vector3(0, math.sin(phase + 1.57) * 0.2, 0));
			const d = math.max(0.7, 2.1 - k * 0.12);
			v.segs[i].Size = new Vector3(d, d, d);
			v.segs[i].CFrame = new CFrame(p);
			tail = p;
		}
		v.host.CFrame = new CFrame(tail);
		v.glow.CFrame = new CFrame(v.pos);
	}

	private destroySpear(v: SpearView): void {
		v.head.Destroy();
		v.snout.Destroy();
		v.hornL.Destroy();
		v.hornR.Destroy();
		v.eyeL.Destroy();
		v.eyeR.Destroy();
		for (const s of v.segs) s.Destroy();
		v.glow.Destroy();
		v.host.Destroy();
	}

	/** A spear that leaves the zone list (range end or hit) fizzles into a burst and leaves a fading scorch line. */
	private dropSpear(v: SpearView): void {
		fx.burst(v.pos, GOLD, 10, { size: 1.2, speed: 14, life: 0.4 });
		this.scorch(v.origin, v.pos);
		this.destroySpear(v);
	}

	/** Fading light line on the ground from the launch spot to where the dragon ended. */
	private scorch(from: Vector3, to: Vector3): void {
		const a = new Vector3(from.X, 0.25, from.Z);
		const b = new Vector3(to.X, 0.25, to.Z);
		const len = b.sub(a).Magnitude;
		if (len < 2) return;
		const cf = CFrame.lookAt(a.Lerp(b, 0.5), b);
		const wide = fx.block(cf, new Vector3(LORD_DRAGON_HALF_WIDTH * STUDS_PER_PX, 0.1, len), SCORCH, 0.5);
		const core = fx.block(cf, new Vector3(0.6, 0.1, len), GOLD_HOT, 0.2);
		fx.spawn(() => {
			fx.run(1.2, (f) => {
				wide.Transparency = 0.5 + 0.5 * f;
				core.Transparency = 0.2 + 0.8 * f;
			});
			wide.Destroy();
			core.Destroy();
		});
	}

	// ---------------------------------------------------------------- fan wind puff

	private makePuff(z: SnapZone): PuffView {
		const pos = W(z.x, z.y, FLY_H);
		const ball = fx.ball(pos, 2.6, JADE, 0.2);
		const tr = fx.makeTrail(ball, new Vector3(-1, 0, 0), new Vector3(1, 0, 0), JADE);
		tr.Lifetime = 0.15;
		tr.Enabled = true;
		const motes: Part[] = [];
		for (let i = 0; i < 3; i++) motes.push(fx.ball(pos, 0.9, JADE_PALE, 0.1));
		return { x: z.x, y: z.y, seen: false, target: pos, pos, dir: dirVec(z.dx ?? 0, z.dy ?? 0), t: 0, ball, motes };
	}

	private updatePuff(v: PuffView, z: SnapZone, dt: number): void {
		v.target = W(z.x, z.y, FLY_H);
		v.pos = v.pos.add(v.dir.mul(PUFF_SPEED * dt)).Lerp(v.target, expOut(dt, 12));
		v.t += dt;
		v.ball.CFrame = CFrame.lookAt(v.pos, v.pos.add(v.dir));
		for (let i = 0; i < v.motes.size(); i++) {
			const a = v.t * 15 + (i / v.motes.size()) * 2 * math.pi;
			v.motes[i].CFrame = new CFrame(v.pos.add(new Vector3(math.cos(a) * 1.7, math.sin(a * 2) * 0.5, math.sin(a) * 1.7)));
		}
	}

	private destroyPuff(v: PuffView): void {
		v.ball.Destroy();
		for (const m of v.motes) m.Destroy();
	}

	private dropPuff(v: PuffView): void {
		fx.burst(v.pos, JADE, 6, { size: 1, speed: 10, life: 0.3 });
		this.destroyPuff(v);
	}

	// ---------------------------------------------------------------- feather fan

	/** Wind blades sweep out over the cone, a feather burst, a phoenix behind the caster, a vortex on each victim (slow). */
	private featherStart(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const centre = this.at(e, FLY_H * 0.9);
		const angleDeg = en(e, "angleDeg");
		const half = math.rad(angleDeg > 0 ? angleDeg : CONE_DEG_DEFAULT) / 2;
		const base = dirVec(en(e, "dirX"), en(e, "dirY"));
		const radiusPx = en(e, "radius") > 0 ? en(e, "radius") : LORD_FEATHER_RADIUS;
		const r = radiusPx * STUDS_PER_PX;

		// Two wind-blade arcs: the second trails the first slightly and sits a little inside it.
		for (let layer = 0; layer < 2; layer++) {
			const segs: Part[] = [];
			for (let i = 0; i < ARC_SEGS; i++) segs.push(fx.block(new CFrame(centre), new Vector3(0.5, 1.8, 1), layer === 0 ? JADE : JADE_PALE, 0.25));
			this.arcs.push({ segs, centre, base, half, r: layer === 0 ? r : r * 0.85, age: 0, delay: layer * 0.08 });
		}

		for (let i = 0; i < FEATHER_COUNT; i++) {
			const a = -half + math.random() * 2 * half;
			const d = CFrame.Angles(0, a, 0).VectorToWorldSpace(base);
			const spd = 16 + math.random() * 12;
			const part = fx.block(new CFrame(centre), new Vector3(0.15, 1.2, 0.5), FEATHER, 0.1);
			const spin = new Vector3(math.random() * 10 - 5, math.random() * 10 - 5, math.random() * 10 - 5);
			this.addMote(part, centre.add(d.mul(2)), d.mul(spd), 1.4, 0.9 + math.random() * 0.2, spin);
		}
		fx.burst(centre, JADE_PALE, 14, { size: 1.2, speed: 14, life: 0.5 });
		this.quake(idx, centre, 0.4, 0.3);

		if (idx >= 0) this.phoenixes.push(this.makePhoenix(idx));
		if (this.audible(centre)) sfx.play("swing_fan");

		for (const v of ea(e, "victimIdxs")) this.markSlow(v);
		if (e["boost"] === true || en(e, "boostTicks") > 0) this.boostTrail(idx);
	}

	private addMote(part: Part, pos: Vector3, vel: Vector3, drag: number, life: number, spin: Vector3): void {
		this.motes.push({ part, pos, vel, spin, drag, age: 0, life, alpha0: part.Transparency });
	}

	private updateMotes(dt: number): void {
		const keep: Mote[] = [];
		for (const m of this.motes) {
			m.age += dt;
			if (m.age >= m.life) {
				m.part.Destroy();
				continue;
			}
			m.pos = m.pos.add(m.vel.mul(dt));
			m.vel = m.vel.mul(math.exp(-m.drag * dt));
			const k = m.age / m.life;
			m.part.CFrame = new CFrame(m.pos).mul(CFrame.Angles(m.spin.X * m.age, m.spin.Y * m.age, m.spin.Z * m.age));
			m.part.Transparency = m.alpha0 + (1 - m.alpha0) * k * k;
			keep.push(m);
		}
		this.motes = keep;
	}

	private updateArcs(dt: number): void {
		const keep: ArcView[] = [];
		for (const a of this.arcs) {
			a.age += dt;
			if (a.age >= a.delay + ARC_LIFE) {
				for (const s of a.segs) s.Destroy();
				continue;
			}
			const t = a.age - a.delay;
			const k = math.clamp(t / 0.3, 0, 1);
			const rad = a.r * (0.15 + 0.85 * (1 - (1 - k) * (1 - k)));
			const fade = math.clamp((t - 0.12) / 0.4, 0, 1);
			const tr = t < 0 ? 1 : 0.25 + 0.75 * fade;
			for (let i = 0; i < a.segs.size(); i++) {
				const alpha = -a.half + (2 * a.half * i) / (ARC_SEGS - 1);
				const v = CFrame.Angles(0, alpha, 0).VectorToWorldSpace(a.base);
				const p = a.centre.add(v.mul(rad));
				const seg = a.segs[i];
				seg.CFrame = CFrame.lookAt(p, p.add(new Vector3(-v.Z, 0, v.X)));
				seg.Size = new Vector3(0.5, 1.8, rad * 0.25 + 0.6);
				seg.Transparency = tr;
			}
			keep.push(a);
		}
		this.arcs = keep;
	}

	/** Phoenix silhouette: body, head, beak, tail and six wing segments (translucent neon); placed each frame. */
	private makePhoenix(idx: number): Phoenix {
		const wings: WingSeg[] = [];
		for (const s of [-1, 1]) {
			for (let k = 0; k < 3; k++) {
				wings.push({ part: fx.block(new CFrame(), new Vector3(1.7, 0.18, 0.9), k === 2 ? GOLD : JADE, 1), s, k });
			}
		}
		const tail: Part[] = [];
		for (let i = 0; i < 3; i++) tail.push(fx.block(new CFrame(), new Vector3(0.9, 0.2, 2.6), i === 0 ? GOLD : JADE, 1));
		return {
			idx,
			age: 0,
			body: fx.block(new CFrame(), new Vector3(1.2, 1.0, 3.6), JADE_PALE, 1),
			head: fx.ball(this.c.foot(idx), 1.5, JADE, 1),
			beak: fx.block(new CFrame(), new Vector3(0.4, 0.4, 1.4), GOLD, 1),
			tail,
			wings,
		};
	}

	private updatePhoenixes(dt: number): void {
		const keep: Phoenix[] = [];
		for (const p of this.phoenixes) {
			p.age += dt;
			if (p.age >= PHOENIX_LIFE) {
				this.destroyPhoenix(p);
				continue;
			}
			const foot = this.c.foot(p.idx);
			const f = this.c.facing(p.idx);
			const k = math.min(1, p.age / PHOENIX_LIFE);
			// Behind the caster, rising; faded in quickly, out in the last 0.25 s.
			const pos = foot.sub(f.mul(5)).add(new Vector3(0, 6 + PHOENIX_RISE * k, 0));
			const fadeIn = math.min(1, p.age / 0.12);
			const fadeOut = math.clamp((p.age - (PHOENIX_LIFE - 0.25)) / 0.25, 0, 1);
			const tr = 1 - 0.5 * fadeIn * (1 - fadeOut);
			const base = CFrame.lookAt(pos, pos.add(f));
			p.body.CFrame = base;
			p.body.Transparency = tr;
			p.head.CFrame = base.mul(new CFrame(0, 0.3, -2.4));
			p.head.Transparency = tr;
			p.beak.CFrame = base.mul(new CFrame(0, 0.1, -3.4));
			p.beak.Transparency = tr;
			p.tail[0].CFrame = base.mul(new CFrame(0, 0, 2.6));
			p.tail[1].CFrame = base.mul(new CFrame(-0.8, 0, 2.6)).mul(CFrame.Angles(0, math.rad(20), 0));
			p.tail[2].CFrame = base.mul(new CFrame(0.8, 0, 2.6)).mul(CFrame.Angles(0, -math.rad(20), 0));
			for (const t of p.tail) t.Transparency = tr;
			const flap = math.sin(p.age * 12) * 0.45;
			for (const w of p.wings) {
				const x = w.s * (1.2 + w.k * 1.5);
				const roll = w.s * (0.25 + flap * (1 + 0.4 * w.k));
				w.part.CFrame = base.mul(new CFrame(x, 0.2, 0.3)).mul(CFrame.Angles(0, 0, roll));
				w.part.Transparency = tr;
			}
			keep.push(p);
		}
		this.phoenixes = keep;
	}

	private destroyPhoenix(p: Phoenix): void {
		p.body.Destroy();
		p.head.Destroy();
		p.beak.Destroy();
		for (const t of p.tail) t.Destroy();
		for (const w of p.wings) w.part.Destroy();
	}

	/** Blue-white ring and six feathers spiralling up a victim for the slow's duration; re-slowing restarts it. */
	private markSlow(idx: number): void {
		for (const m of this.marks) {
			if (m.idx === idx) {
				m.age = 0;
				return;
			}
		}
		const foot = this.c.foot(idx);
		const orbs: Part[] = [];
		for (let i = 0; i < 6; i++) orbs.push(fx.block(new CFrame(foot), new Vector3(0.25, 1.1, 0.5), FEATHER, 0.1));
		this.marks.push({ idx, age: 0, ring: new RingSet(12, 0.35, 0.3, JADE), orbs });
	}

	private updateMarks(dt: number): void {
		const keep: SlowMark[] = [];
		for (const m of this.marks) {
			m.age += dt;
			if (m.age >= SLOW_SECS) {
				m.ring.destroy();
				for (const o of m.orbs) o.Destroy();
				continue;
			}
			const foot = this.c.foot(m.idx);
			const tr = 0.3 + 0.7 * math.clamp((m.age - (SLOW_SECS - 0.5)) / 0.5, 0, 1);
			m.ring.set(foot.add(new Vector3(0, 0.15, 0)), 3.2, tr);
			for (let i = 0; i < m.orbs.size(); i++) {
				// Vortex: each feather climbs while the circle shrinks, then restarts from the ground.
				const ph = (m.age * 0.7 + i / m.orbs.size()) % 1;
				const r = 2.8 * (1 - 0.5 * ph);
				const h = 0.6 + 4.6 * ph;
				const a = m.age * 6 + ph * 4;
				m.orbs[i].CFrame = new CFrame(foot.add(new Vector3(math.cos(a) * r, h, math.sin(a) * r))).mul(CFrame.Angles(a, a * 0.5, 0));
				m.orbs[i].Transparency = tr;
			}
			keep.push(m);
		}
		this.marks = keep;
	}

	/** Feathers fly from the lost ball's old spot along a short arc to the lord's feet; the first few leave a jade trail. */
	private featherPull(e: SimEventLite): void {
		const lord = en(e, "playerIdx");
		const from = this.at(e, 1.5);
		fx.burst(from, FEATHER, 8, { size: 1, speed: 10, life: 0.35 });
		for (let i = 0; i < PULL_FLIGHTS; i++) {
			const part = fx.block(new CFrame(from), new Vector3(0.15, 1.2, 0.5), FEATHER, 1);
			if (i < PULL_TRAILS) {
				const trail = fx.makeTrail(part, new Vector3(0, 0, -0.7), new Vector3(0, 0, 0.7), JADE);
				trail.Enabled = true;
			}
			const start = from.add(new Vector3(math.random() * 3 - 1.5, math.random() * 1.5, math.random() * 3 - 1.5));
			this.flights.push({ part, from: start, lord, age: 0, delay: i * 0.03, dur: 0.4 + math.random() * 0.1 });
		}
	}

	private updateFlights(dt: number): void {
		const keep: Flight[] = [];
		for (const f of this.flights) {
			f.age += dt;
			const t = (f.age - f.delay) / f.dur;
			if (t >= 1) {
				f.part.Destroy();
				continue;
			}
			if (t >= 0) {
				const to = this.c.foot(f.lord).add(new Vector3(0, 1.2, 0));
				const p = f.from.Lerp(to, t).add(new Vector3(0, math.sin(t * math.pi) * 5, 0));
				f.part.CFrame = new CFrame(p).mul(CFrame.Angles(f.age * 14, f.age * 10, 0));
				f.part.Transparency = 1 - math.clamp((1 - t) * 5, 0, 1);
			}
			keep.push(f);
		}
		this.flights = keep;
	}

	/** Green wind trail behind a lord for the speed boost (1.5 s). */
	private boostTrail(idx: number): void {
		trailOrbs(
			() => {
				const f = this.c.facing(idx);
				return this.c.foot(idx).add(new Vector3(-f.X * 2.5, 3, -f.Z * 2.5));
			},
			BOOST_SECS,
			JADE,
			JADE_PALE,
			1.2,
			0.05,
		);
	}
}
