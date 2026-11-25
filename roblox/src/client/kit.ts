// Shared helpers for the showroom special moves: stage-relative coordinates, hit sparks, dummy reactions, riding props.
import { Actor, getTrack, place, playOnce, setTrails, tiltTo } from "./actor";
import * as fx from "./fx";
import { FX } from "./fxIds";
import { SHARED_ANIMS } from "./animIds";
import { Prop, placeProp } from "./props";

export interface Ctx {
	charId: string;
	actor: Actor;
	dummy: Actor;
	/** General's home foot position. */
	origin: Vector3;
	/** Horizontal unit vector from the general toward the dummy. */
	look: Vector3;
	/** Horizontal unit vector to the general's right-hand side (seen facing the dummy). */
	right: Vector3;
	color: Color3;
}

export type SpecialFn = (c: Ctx) => void;

export const WHITE = Color3.fromRGB(255, 255, 255);
/** Distance from the general to the dummy (studs). */
export const DUMMY_DIST = 7;

/** World position at `f` studs toward the dummy, `s` studs to the right and `h` studs up from the general's feet. */
export function rel(c: Ctx, f: number, s: number, h = 0): Vector3 {
	return c.origin.add(c.look.mul(f)).add(c.right.mul(s)).add(new Vector3(0, h, 0));
}

/** Chest of the dummy right now. */
export function chest(c: Ctx): Vector3 {
	return c.dummy.foot.add(new Vector3(0, 4.8 + c.dummy.lift, 0));
}

/** Plays the flipbook "<charId>.<name>" (or the generic "hit.spark" for name "hit.spark") when the sheet exists. */
export function sheetFx(c: Ctx, name: string, pos: Vector3, size: number, dur: number, color?: Color3): boolean {
	const key = name === "hit.spark" ? name : `${c.charId}.${name}`;
	const sheet = FX[key];
	if (sheet === undefined) return false;
	fx.flipbook(sheet, new CFrame(pos), size, dur, { color });
	return true;
}

/** Punchy impact: white flash core, colour burst, shards, ring, optional shake. */
export function impact(c: Ctx, pos: Vector3, color: Color3, big = 1): void {
	const flashBall = fx.ball(pos, 3 * big, WHITE, 0.2);
	fx.expire(flashBall, 0.25);
	const core = fx.ball(pos, 4 * big, color, 0.3);
	fx.expire(core, 0.25);
	fx.spawn(() => {
		fx.run(0.25, (a) => {
			const s = (3 + a * 6) * big;
			core.Size = new Vector3(s, s, s);
			core.Transparency = 0.3 + a * 0.7;
			flashBall.Transparency = 0.2 + a * 0.8;
		});
		core.Destroy();
		flashBall.Destroy();
	});
	fx.burst(pos, color, math.floor(24 * big), { size: 2.2 * big, speed: 36 * big });
	fx.burst(pos, WHITE, math.floor(10 * big), { size: 1.4 * big, speed: 24 * big });
	fx.shards(pos, color, math.floor(14 * big), 34 * big);
	fx.ring(new Vector3(pos.X, c.dummy.foot.Y + 0.4, pos.Z), 1, 7 * big, 0.35, color, 0.9, 0.4);
	if (!sheetFx(c, "impact", pos, 9 * big, 0.5, color)) sheetFx(c, "hit.spark", pos, 8 * big, 0.4);
	fx.shake(0.25 * big, 0.25);
}

/** Hit wobble on `target`, pushed back along `back` (uses the shared hit clip when it exists). Does not yield. */
export function flinchActor(target: Actor, back: Vector3): void {
	fx.spawn(() => {
		const clip = playOnce(target, SHARED_ANIMS.hit);
		if (clip !== undefined) return;
		const from = target.foot;
		fx.run(0.24, (a) => {
			target.tilt = math.sin(a * math.pi) * 0.35;
			target.foot = from.add(back.mul(math.sin(a * math.pi) * 0.8));
			place(target);
		});
		target.foot = from;
		target.tilt = 0;
		place(target);
	});
}

/** Dummy flinches away from the general. */
export function flinch(c: Ctx): void {
	flinchActor(c.dummy, c.look);
}

/** Dummy flies `dist` studs along `dir` (default away from the general) in `dur`, tilting onto its back. Yields. */
export function knockDummy(c: Ctx, dist: number, dur: number, dir?: Vector3, arc = 2): boolean {
	const d = c.dummy;
	const from = d.foot;
	const to = from.add((dir ?? c.look).mul(dist));
	return fx.run(dur, (a) => {
		d.foot = from.Lerp(to, fx.easeOut(a));
		d.lift = math.sin(a * math.pi) * arc;
		d.tilt = fx.lerp(0, math.pi / 2, math.min(1, a * 2.2));
		place(d);
	});
}

/** Dummy gets back up (tilt 0). Yields. */
export function dummyGetUp(c: Ctx): boolean {
	c.dummy.lift = 0;
	return tiltTo(c.dummy, 0, 0.4);
}

/** Yellow stars orbiting above an actor's head for `dur` scaled seconds. */
export function starsOn(target: Actor, dur: number): void {
	const stars: Part[] = [];
	for (let i = 0; i < 5; i++) {
		stars.push(fx.block(new CFrame(target.foot), new Vector3(0.9, 0.9, 0.3), Color3.fromRGB(255, 235, 60)));
	}
	fx.spawn(() => {
		fx.run(dur, (a) => {
			const head = target.foot.add(new Vector3(0, 8.2 + target.lift, 0));
			const fade = a > 0.85 ? (a - 0.85) / 0.15 : 0;
			for (let i = 0; i < stars.size(); i++) {
				const ang = a * 14 + (i / stars.size()) * 2 * math.pi;
				stars[i].CFrame = new CFrame(head.add(new Vector3(math.cos(ang) * 2.4, math.sin(ang * 2) * 0.3, math.sin(ang) * 2.4))).mul(CFrame.Angles(ang, ang, ang));
				stars[i].Transparency = fade;
			}
		});
		for (const s of stars) s.Destroy();
	});
}

export function dizzyStars(c: Ctx, dur: number): void {
	starsOn(c.dummy, dur);
}

/** Dummy-sized frozen / glowing shell (ice, curse, aura) that follows the dummy. */
export function dummyShell(c: Ctx, color: Color3, dur: number, transparency = 0.55): void {
	const shell = fx.glow(Enum.PartType.Block, new CFrame(c.dummy.foot), new Vector3(5.2, 9.6, 3.6), color, transparency);
	fx.spawn(() => {
		fx.run(dur, (a) => {
			shell.CFrame = new CFrame(c.dummy.foot.add(new Vector3(0, 4.6 + c.dummy.lift, 0)));
			shell.Transparency = a > 0.8 ? transparency + (1 - transparency) * ((a - 0.8) / 0.2) : transparency + math.sin(a * 25) * 0.08;
		});
		shell.Destroy();
	});
}

export function weaponTrail(c: Ctx, on: boolean): void {
	setTrails(c.actor, on);
}

/** Puts the prop at ground reference `cf` and the general on its seat. */
export function ride(c: Ctx, prop: Prop, cf: CFrame): void {
	const rootCF = placeProp(prop, cf);
	c.actor.root.CFrame = rootCF;
}

/** CFrame at ground point `p` facing along `dir`. */
export function groundCF(p: Vector3, dir: Vector3): CFrame {
	return CFrame.lookAt(p, p.add(dir));
}

/** Stage dust at the feet while something moves fast. */
export function dustAt(p: Vector3, size = 3): void {
	fx.dust(new Vector3(p.X, p.Y + 0.4, p.Z), 3, size);
}

/** Dummy trembles (hit-stun) for `dur` scaled seconds, then returns to where it was. */
export function shakeDummy(c: Ctx, dur: number, amp = 0.3): void {
	const d = c.dummy;
	const from = d.foot;
	fx.spawn(() => {
		fx.run(dur, (a) => {
			d.foot = from.add(c.right.mul(math.sin(a * 120) * amp * (1 - a * 0.5)));
			place(d);
		});
		d.foot = from;
		place(d);
	});
}

const SIT_ANIM = "rbxassetid://2506281703";

/** Loops the R15 sit clip over everything else while mounted. Returns the track (stop it with endSit). */
export function startSit(c: Ctx): AnimationTrack | undefined {
	const t = getTrack(c.actor, SIT_ANIM, true, Enum.AnimationPriority.Action4);
	if (t === undefined) return undefined;
	t.Play(0.1);
	t.AdjustSpeed(fx.getTimeScale());
	if (!c.actor.active.includes(t)) c.actor.active.push(t);
	return t;
}

export function endSit(t: AnimationTrack | undefined): void {
	if (t !== undefined && t.IsPlaying) t.Stop(0.15);
}
