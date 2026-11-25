// In-match effect director: owns the effect root folder, the per-general effect modules (matchShu / matchWei / matchWu),
// and the generic combat feedback (hit sparks, knockdown dust, attack slashes). Fed with sim events and snapshot zones.
import type { SimEventLite, SnapZone } from "shared/net";
import { colorOf } from "./actor";
import * as fx from "./fx";
import { MatchCtx, Mount, SpecialModule, WHITE, en, higher, hitSpark, impactFx, sheet, shakeNear, starsFollow } from "./matchUtil";
import { ShuFx } from "./matchShu";
import { WeiFx } from "./matchWei";
import { WuFx } from "./matchWu";

const Workspace = game.GetService("Workspace");

/** At most this many generic hit effects per HIT_WINDOW seconds (a brawl must not flood the scene). */
const HIT_BUDGET = 6;
const HIT_WINDOW = 0.25;

export class MatchFx {
	private c: MatchCtx;
	private folder: Folder;
	private mods: SpecialModule[];
	private wei: WeiFx;
	private hitCount = 0;
	private hitWindowStart = 0;

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
		this.mods = [new ShuFx(c), this.wei, new WuFx(c)];
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
			for (const m of this.mods) m.special(idx, charId);
		}
		for (const m of this.mods) m.handle(e);
	}

	/** Called every frame with the nearest snapshot's zones and the ball. */
	frame(dt: number, zones: SnapZone[], ballPos: Vector3, ballSpecial: string): void {
		this.ensureRoot();
		for (const m of this.mods) m.frame(dt, zones);
		this.wei.ball(dt, ballPos, ballSpecial);
	}

	/** Mount placement (bike / boat / seat) for one player this frame, or undefined when he is on foot. */
	mount(idx: number, foot: Vector3, facing: Vector3, sp: string): Mount | undefined {
		for (const m of this.mods) {
			const r = m.mount(idx, foot, facing, sp);
			if (r !== undefined) return r;
		}
		return undefined;
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

	private hit(e: SimEventLite): void {
		if (!this.allowHit()) return;
		const attacker = en(e, "attackerIdx");
		const victim = en(e, "victimIdx");
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
