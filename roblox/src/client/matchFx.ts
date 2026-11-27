// In-match effect director: owns the effect root folder, the per-general effect modules (matchShu / matchWei / matchWu),
// and the generic combat feedback (hit sparks, knockdown dust, attack slashes). Fed with sim events and snapshot zones.
import type { SimEventLite, SnapZone } from "shared/net";
import { colorOf } from "./actor";
import * as fx from "./fx";
import { MatchCtx, Mount, SpecialModule, WHITE, en, higher, hitSpark, impactFx, sheet, shakeNear, starsFollow } from "./matchUtil";
import { ShuFx } from "./matchShu";
import { WeiFx } from "./matchWei";
import { WuFx } from "./matchWu";
import { LordFx } from "./lordFx";
import { damageNumber, flashVictim, knockDust } from "./hitFeedback";

const Workspace = game.GetService("Workspace");

/** At most this many generic hit effects per HIT_WINDOW seconds (a brawl must not flood the scene). */
const HIT_BUDGET = 6;
const HIT_WINDOW = 0.25;

export class MatchFx {
	private c: MatchCtx;
	private folder: Folder;
	private mods: SpecialModule[];
	private wei: WeiFx;
	private lord: LordFx;
	private hitCount = 0;
	private hitWindowStart = 0;
	/** Modules (by index in mods) that already logged an error; each is logged once. */
	private readonly failed = new Set<number>();

	constructor(c: MatchCtx) {
		this.c = c;
		let folder = Workspace.FindFirstChild("MatchFx") as Folder | undefined;
		if (folder === undefined) {
			folder = new Instance("Folder");
			folder.Name = "MatchFx";
			folder.Parent = Workspace;
		}
		this.folder = folder;
		this.wei = new WeiFx(c);
		this.lord = new LordFx(c);
		this.mods = [new ShuFx(c), this.wei, new WuFx(c), this.lord];
		fx.setRoot(folder);
	}

	/** Every effect parented through fx goes under the match folder (the showroom may have pointed fx elsewhere). */
	private ensureRoot(): void {
		if (this.folder.Parent === undefined) {
			const f = new Instance("Folder");
			f.Name = "MatchFx";
			f.Parent = Workspace;
			this.folder = f;
		}
		fx.setRoot(this.folder);
	}

	/** Removes every running effect and prop (new match / rematch). */
	reset(): void {
		this.ensureRoot();
		fx.reset();
		for (const m of this.mods) m.clear();
		this.hitCount = 0;
	}

	onEvent(e: SimEventLite): void {
		this.ensureRoot();
		const t = e.type;
		if (t === "attack") this.attack(e);
		else if (t === "hit") this.hit(e);
		else if (t === "down") this.down(e);
		else if (t === "special") {
			const idx = en(e, "playerIdx");
			const charId = this.c.charOf(idx);
			this.each((m) => m.special(idx, charId));
		}
		this.each((m) => m.handle(e));
	}

	/** Called every frame with the nearest snapshot's zones and the ball. */
	frame(dt: number, zones: SnapZone[], ballPos: Vector3, ballSpecial: string): void {
		this.ensureRoot();
		this.each((m) => m.frame(dt, zones));
		this.wei.ball(dt, ballPos, ballSpecial);
	}

	/**
	 * Runs one call on every module. A module that throws is logged once and its call skipped, so the others (the lord FX
	 * last in the list) still run.
	 */
	private each(fn: (m: SpecialModule) => void): void {
		for (let i = 0; i < this.mods.size(); i++) {
			const m = this.mods[i];
			const [ok, err] = pcall(() => fn(m));
			if (!ok && !this.failed.has(i)) {
				this.failed.add(i);
				warn(`[matchFx] module ${i} error: ${tostring(err)}`);
			}
		}
	}

	/** Mount placement (bike / boat / seat) for one player this frame, or undefined when he is on foot. */
	mount(idx: number, foot: Vector3, facing: Vector3, sp: string): Mount | undefined {
		for (const m of this.mods) {
			const r = m.mount(idx, foot, facing, sp);
			if (r !== undefined) return r;
		}
		return undefined;
	}

	/** Extra yaw (rad) for one player's model this frame: the sword whirl spins the lord (0 otherwise). */
	spin(idx: number): number {
		return this.lord.spinOf(idx);
	}

	/** Stars above a stunned player's head while ctx.stunned(idx) holds. */
	stars(idx: number): void {
		this.ensureRoot();
		starsFollow(this.c, idx, 4, () => this.c.stunned(idx));
	}

	private allowHit(): boolean {
		const now = os.clock();
		if (now - this.hitWindowStart > HIT_WINDOW) {
			this.hitWindowStart = now;
			this.hitCount = 0;
		}
		this.hitCount += 1;
		return this.hitCount <= HIT_BUDGET;
	}

	/** A normal swing: the attacker's own slash flipbook in front of him; a tackle kicks up dust. */
	private attack(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const kind = e["kind"] as string | undefined;
		const c = this.c;
		const me = c.foot(idx);
		if (kind === "tackle") {
			fx.dust(higher(me, 0.4), 4, 3.5);
			c.trails(idx, 0.5);
			return;
		}
		if (this.allowHit()) {
			const col = colorOf(c.charOf(idx));
			sheet(`${c.charOf(idx)}.slash`, higher(me, 4.5).add(c.facing(idx).mul(3.5)), 7, 0.3, col);
		}
		c.trails(idx, 0.4);
	}

	/** Victim feedback for every hit, not counted in the hit budget: red flash, damage number and knock dust. */
	private hitFeedback(attacker: number, victim: number, damage: number): void {
		const c = this.c;
		const vf = c.foot(victim);
		const af = c.foot(attacker);
		let dx = vf.X - af.X;
		let dz = vf.Z - af.Z;
		const mag = math.sqrt(dx * dx + dz * dz);
		if (mag > 0.01) {
			dx /= mag;
			dz /= mag;
		} else {
			const f = c.facing(attacker);
			dx = f.X;
			dz = f.Z;
		}
		flashVictim(c.model(victim));
		damageNumber(c.chest(victim).add(new Vector3(0, 2, 0)), dx, dz, damage);
		knockDust(vf, dx, dz);
	}

	private hit(e: SimEventLite): void {
		const attacker = en(e, "attackerIdx");
		const victim = en(e, "victimIdx");
		this.hitFeedback(attacker, victim, en(e, "damage"));
		if (!this.allowHit()) return;
		const kind = e["kind"] as string | undefined;
		const c = this.c;
		const col = colorOf(c.charOf(attacker));
		const p = c.chest(victim);
		const back = c.facing(attacker).mul(1.2);
		if (kind === "special") {
			impactFx(p, col, 1.1);
			shakeNear(c, p, 0.5, 0.25);
		} else if (kind === "tackle") {
			impactFx(p, col, 0.9);
			fx.dust(higher(c.foot(victim), 0.4), 4, 3.5);
			shakeNear(c, p, 0.4, 0.2);
		} else {
			hitSpark(p.sub(back), WHITE, 0.8);
			shakeNear(c, p, 0.2, 0.12);
		}
	}

	private down(e: SimEventLite): void {
		const idx = en(e, "playerIdx");
		const p = this.c.foot(idx);
		fx.dust(higher(p, 0.5), 8, 4);
		shakeNear(this.c, p, 0.3, 0.2);
	}
}
