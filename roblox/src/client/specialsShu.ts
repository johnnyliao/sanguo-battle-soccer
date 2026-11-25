// Showroom special moves of the Shu generals: zhangfei, guanyu, zhugeliang, machao, zhaoyun.
import { moveTo, place } from "./actor";
import * as fx from "./fx";
import { Ctx, DUMMY_DIST, WHITE, chest, dizzyStars, dummyGetUp, dustAt, endSit, flinch, groundCF, impact, knockDummy, rel, ride, sheetFx, startSit, weaponTrail } from "./kit";
import { Prop, makeProp, placeProp } from "./props";
import { holdWeaponForward } from "./weaponPose";

/** 張飛「當陽怒吼」: inhale, then a roar that sends triple shockwave rings, dust and a huge shake. */
export function zhangfei(c: Ctx): void {
	const orange = Color3.fromRGB(255, 120, 40);
	const yellow = Color3.fromRGB(255, 220, 70);
	const me = c.actor.foot;
	fx.ring(me.add(new Vector3(0, 0.5, 0)), 16, 2, 0.5, orange, 1, 0.6);
	fx.ring(me.add(new Vector3(0, 0.5, 0)), 22, 3, 0.6, yellow, 0.8, 0.5);
	sheetFx(c, "charge", me.add(new Vector3(0, 5, 0)), 12, 0.6, orange);
	fx.burst(me.add(new Vector3(0, 6, 0)), orange, 24, { size: 2, speed: -12 });
	fx.shake(0.25, 0.5);
	fx.wait(0.55);
	// Roar.
	const mouth = rel(c, 0, 0, 7.2);
	const cols = [orange, yellow, WHITE];
	for (let i = 0; i < 3; i++) {
		const col = cols[i];
		fx.spawn(() => {
			fx.wait(i * 0.18);
			fx.ring(rel(c, 2, 0, 0.6), 2, 34, 0.75, col, 2.2, 1);
		});
	}
	sheetFx(c, "wave", rel(c, 7, 0, 6), 22, 0.9, WHITE);
	fx.burst(mouth.add(c.look.mul(2)), yellow, 40, { size: 3, speed: 50, spread: 35 });
	fx.dust(rel(c, 8, 0, 0.5), 24, 9);
	fx.dust(rel(c, 14, 4, 0.5), 14, 7);
	fx.dust(rel(c, 14, -4, 0.5), 14, 7);
	fx.flash(WHITE, 0.35, 0.5);
	fx.shake(1.5, 1.1);
	fx.wait(0.3);
	impact(c, chest(c), orange, 1.6);
	sheetFx(c, "impact", chest(c), 12, 0.6, WHITE);
	dizzyStars(c, 2.4);
	knockDummy(c, 6, 0.5);
	fx.wait(1.3);
	dummyGetUp(c);
}

/** 關羽「騎士衝擊」: a green dragon-trailed bike dash straight through the dummy. */
export function guanyu(c: Ctx): void {
	const green = Color3.fromRGB(70, 255, 130);
	const gold = Color3.fromRGB(255, 220, 80);
	const bike = makeProp("guanyu_bike", "bike", Color3.fromRGB(220, 40, 40), c.actor.footOffset, new Vector3(0, 0.6, 0));
	const start = rel(c, -16, 0);
	const finish = rel(c, 28, 0);
	ride(c, bike, groundCF(start, c.look));
	const sit = startSit(c);
	fx.ring(start.add(new Vector3(0, 0.4, 0)), 1, 9, 0.5, green, 1.2, 0.5);
	fx.burst(start.add(new Vector3(0, 3, 0)), green, 30, { size: 2.4, speed: 26 });
	sheetFx(c, "ring", start.add(new Vector3(0, 3, 0)), 12, 0.6, green);
	fx.flash(green, 0.75, 0.3);
	fx.wait(0.4);
	weaponTrail(c, true);
	sheetFx(c, "dragon", start.add(new Vector3(0, 4, 0)), 16, 0.9, WHITE);
	const hitAt = (DUMMY_DIST - 1 + 16) / 44;
	let hit = false;
	let lastDrop = 0;
	let elapsed = 0;
	fx.run(0.9, (a, dt) => {
		elapsed += dt;
		const p = start.Lerp(finish, a);
		ride(c, bike, groundCF(p, c.look));
		if (elapsed - lastDrop > 0.03) {
			lastDrop = elapsed;
			const orb = fx.ball(p.add(new Vector3(0, 2.8, 0)), 3.4, math.random() > 0.5 ? green : gold, 0.2);
			fx.spawn(() => {
				fx.run(0.45, (k) => {
					const s = 3.4 * (1 - k);
					orb.Size = new Vector3(s, s, s);
					orb.Transparency = 0.2 + k * 0.8;
				});
				orb.Destroy();
			});
			fx.fireBurst(p.sub(c.look.mul(4.5)).add(new Vector3(0, 1.5, 0)), 2, 2.4);
			if (math.random() > 0.6) dustAt(p, 3);
		}
		if (!hit && a >= hitAt) {
			hit = true;
			impact(c, chest(c), green, 1.5);
			sheetFx(c, "impact", chest(c), 11, 0.5, WHITE);
			fx.flash(WHITE, 0.4, 0.3);
			fx.shake(0.9, 0.5);
			fx.spawn(() => {
				knockDummy(c, 13, 0.6, c.right, 3);
			});
		}
	});
	fx.burst(finish.add(new Vector3(0, 2, 0)), gold, 30, { size: 2.4, speed: 30 });
	fx.dust(finish, 14, 6);
	weaponTrail(c, false);
	bike.model.Destroy();
	endSit(sit);
	place(c.actor);
	fx.wait(0.9);
	dummyGetUp(c);
}

/** 諸葛亮「破魔光彈」: 0.5 s charge with an orb growing at his hand, then the orb flies horizontally to the dummy and explodes. */
export function zhugeliang(c: Ctx): void {
	const cyan = Color3.fromRGB(110, 235, 255);
	const handOf = (): Vector3 => {
		const h = c.actor.model.FindFirstChild("RightHand");
		if (h !== undefined && h.IsA("BasePart")) return h.Position.add(new Vector3(0, 0.6, 0)).add(c.look.mul(0.8));
		return rel(c, 1.4, 1, 5.6);
	};
	const orb = fx.ball(handOf(), 0.4, cyan, 0.1);
	const core = fx.ball(handOf(), 0.2, WHITE, 0);
	sheetFx(c, "charge", handOf(), 7, 0.6, cyan);
	fx.ring(c.actor.foot.add(new Vector3(0, 0.4, 0)), 6, 1, 0.5, cyan, 0.8, 0.4);
	fx.run(0.5, (a) => {
		const s = 0.4 + a * 2.6;
		const p = handOf();
		orb.Size = new Vector3(s, s, s);
		core.Size = new Vector3(s * 0.5, s * 0.5, s * 0.5);
		orb.CFrame = new CFrame(p);
		core.CFrame = new CFrame(p);
		if (math.random() > 0.4) fx.burst(p.add(fx.randDir().mul(4)), cyan, 1, { size: 1, speed: -8, life: 0.3 });
	});
	// Flight: straight and level from the hand to the dummy's chest.
	const start = handOf();
	const target = chest(c).sub(c.look.mul(0.6));
	const flat = new Vector3(target.X, start.Y, target.Z);
	fx.flash(cyan, 0.8, 0.2);
	fx.run(0.3, (a, dt) => {
		const p = start.Lerp(flat, a);
		orb.CFrame = new CFrame(p);
		core.CFrame = new CFrame(p);
		fx.burst(p, cyan, 1, { size: 1.2, speed: 3, life: 0.35 });
		if (dt > 0) fx.laser(p.sub(c.look.mul(2.5)), p, cyan, 0.8, 0.15);
	});
	orb.Destroy();
	core.Destroy();
	sheetFx(c, "ball", flat, 7, 0.6, cyan);
	impact(c, flat, cyan, 1.9);
	sheetFx(c, "impact", flat, 7, 0.5, cyan);
	fx.ring(c.dummy.foot.add(new Vector3(0, 0.5, 0)), 2, 14, 0.6, cyan, 1.6, 0.6);
	fx.flash(cyan, 0.8, 0.25);
	fx.shake(1.0, 0.5);
	knockDummy(c, 3, 0.4, undefined, 1);
	fx.wait(1.0);
	dummyGetUp(c);
}

/** 馬超「西涼鐵騎」: five cavalry charge in a line across the stage, flattening the dummy. */
export function machao(c: Ctx): void {
	const gold = Color3.fromRGB(255, 205, 70);
	const sides = [-10, -5, 0, 5, 10];
	const fromF = -36;
	const toF = 42;
	const riders: Prop[] = [];
	for (let i = 0; i < 5; i++) {
		const rider = makeProp("machao_rider", "horse", i % 2 === 0 ? Color3.fromRGB(255, 230, 190) : Color3.fromRGB(190, 60, 40), 0);
		const p = rel(c, fromF, sides[i]);
		placeProp(rider, groundCF(p, c.look));
		riders.push(rider);
		fx.ring(p.add(new Vector3(0, 0.4, 0)), 1, 7, 0.5, gold, 1, 0.5);
		fx.burst(p.add(new Vector3(0, 3, 0)), gold, 14, { size: 2, speed: 18 });
		sheetFx(c, "summon", p.add(new Vector3(0, 3, 0)), 9, 0.6, gold);
	}
	fx.flash(gold, 0.75, 0.4);
	fx.shake(0.4, 0.5);
	fx.wait(0.55);
	const hitA = (DUMMY_DIST - 1 - fromF) / (toF - fromF);
	const hits: boolean[] = [false, false, false, false, false];
	let firstHit = false;
	let elapsed = 0;
	let lastDust = 0;
	fx.run(1.7, (t, dt) => {
		elapsed += dt;
		for (let i = 0; i < 5; i++) {
			const a = math.max(0, math.min(1, (t - i * 0.07) / 0.72));
			const f = fx.lerp(fromF, toF, a);
			const p = rel(c, f, sides[i]).add(new Vector3(0, math.abs(math.sin(elapsed * 14 + i)) * 0.5, 0));
			placeProp(riders[i], groundCF(p, c.look));
			if (!hits[i] && a >= hitA && math.abs(sides[i]) <= 5) {
				hits[i] = true;
				impact(c, chest(c), gold, 0.9);
				sheetFx(c, "burst", chest(c), 9, 0.4, WHITE);
				fx.shake(0.6, 0.3);
				if (!firstHit) {
					firstHit = true;
					fx.spawn(() => {
						knockDummy(c, 4, 0.45, undefined, 2);
					});
				}
			}
		}
		if (elapsed - lastDust > 0.08) {
			lastDust = elapsed;
			for (let i = 0; i < 5; i++) {
				const a = math.max(0, math.min(1, (t - i * 0.07) / 0.72));
				if (a > 0 && a < 1) {
					const p = rel(c, fx.lerp(fromF, toF, a), sides[i]);
					fx.dust(p.add(new Vector3(0, 0.5, 0)), 2, 3.5);
					sheetFx(c, "smoke", p.add(new Vector3(0, 2, 0)), 6, 0.4, WHITE);
				}
			}
		}
	});
	for (const r of riders) {
		fx.burst(r.model.GetPivot().Position, gold, 10, { size: 2, speed: 14 });
		r.model.Destroy();
	}
	fx.wait(0.4);
	dummyGetUp(c);
}

/** 趙雲「遊龍穿刺」: instant lunge (no wind-up), spear level and forward, dragon helix trail, dummy sent flying. */
export function zhaoyun(c: Ctx): void {
	const gold = Color3.fromRGB(255, 225, 100);
	const a = c.actor;
	weaponTrail(c, true);
	holdWeaponForward(a.model, true);
	sheetFx(c, "lunge", rel(c, 4, 0, 4.6), 8, 0.5, gold);
	fx.flash(gold, 0.88, 0.15);
	fx.ring(a.foot.add(new Vector3(0, 0.4, 0)), 1, 7, 0.3, gold, 1, 0.4);
	const from = a.foot;
	const to = rel(c, 6.4, 0);
	let hit = false;
	let ang = 0;
	fx.run(0.25, (t, dt) => {
		a.foot = from.Lerp(to, fx.easeOut(t));
		a.tilt = -0.25;
		place(a);
		ang += dt * 60;
		const mid = a.foot.add(new Vector3(0, 4.4, 0));
		// Dragon helix: two gold orbs winding around the travel axis, left behind as a fading trail.
		for (let k = 0; k < 2; k++) {
			const th = ang + k * math.pi;
			const p = mid.add(new Vector3(0, math.sin(th) * 1.8, 0)).add(c.right.mul(math.cos(th) * 1.8)).sub(c.look.mul(1.5));
			const orb = fx.ball(p, 1.9, k === 0 ? gold : WHITE, 0.1);
			fx.spawn(() => {
				fx.run(0.4, (u) => {
					const s = 1.9 * (1 - u);
					orb.Size = new Vector3(s, s, s);
					orb.Transparency = 0.1 + u * 0.9;
				});
				orb.Destroy();
			});
		}
		fx.dust(a.foot.add(new Vector3(0, 0.4, 0)), 1, 3);
		if (!hit && t > 0.55) {
			hit = true;
			impact(c, chest(c), gold, 1.1);
			sheetFx(c, "burst", chest(c), 8, 0.5, gold);
			fx.shake(1.0, 0.5);
			fx.flash(gold, 0.85, 0.2);
			fx.spawn(() => {
				knockDummy(c, 10, 0.6, undefined, 3.5);
			});
		}
	});
	a.tilt = 0;
	place(a);
	fx.laser(rel(c, 0, 0, 4.5), rel(c, 13, 0, 4.5), gold, 2.4, 0.4);
	fx.wait(0.35);
	holdWeaponForward(a.model, false);
	weaponTrail(c, false);
	moveTo(a, c.origin, 0.4, 1);
	fx.wait(0.5);
	dummyGetUp(c);
}
