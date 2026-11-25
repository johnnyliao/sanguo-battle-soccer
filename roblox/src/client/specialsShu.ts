// Showroom special moves of the Shu generals: zhangfei, guanyu, zhugeliang, machao, zhaoyun.
import { moveTo, place } from "./actor";
import * as fx from "./fx";
import { Ctx, DUMMY_DIST, WHITE, chest, dizzyStars, dummyGetUp, dustAt, flinch, groundCF, impact, knockDummy, rel, ride, sheetFx, weaponTrail } from "./kit";
import { Prop, makeProp, placeProp } from "./props";

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
	const bike = makeProp("guanyu_bike", "bike", Color3.fromRGB(220, 40, 40), c.actor.footOffset);
	const start = rel(c, -16, 0);
	const finish = rel(c, 28, 0);
	ride(c, bike, groundCF(start, c.look));
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
	place(c.actor);
	fx.wait(0.9);
	dummyGetUp(c);
}

/** 諸葛亮「破魔光彈」: half a second of charging, then a beam of light strikes down from the sky. */
export function zhugeliang(c: Ctx): void {
	const cyan = Color3.fromRGB(110, 235, 255);
	const orbPos = rel(c, 1.8, 1.2, 6.6);
	const orb = fx.ball(orbPos, 0.4, cyan, 0.1);
	const core = fx.ball(orbPos, 0.2, WHITE, 0);
	sheetFx(c, "charge", orbPos, 9, 0.6, cyan);
	for (let i = 0; i < 3; i++) {
		fx.spawn(() => {
			fx.wait(i * 0.15);
			fx.ring(orbPos, 9, 0.6, 0.45, i === 1 ? WHITE : cyan, 0.4, 0.4);
		});
	}
	fx.run(0.55, (a) => {
		const s = 0.4 + a * 3.8;
		orb.Size = new Vector3(s, s, s);
		core.Size = new Vector3(s * 0.5, s * 0.5, s * 0.5);
		if (a > 0.3 && math.random() > 0.5) fx.burst(orbPos.add(fx.randDir().mul(6)), cyan, 1, { size: 1.4, speed: 1, life: 0.3 });
	});
	// Launch into the sky, then strike.
	const sky = c.dummy.foot.add(new Vector3(0, 60, 0));
	fx.bolt(orbPos, sky, cyan, 1.2, 0.35, 2.4, 10);
	fx.flash(cyan, 0.7, 0.3);
	fx.run(0.3, (a) => {
		const p = orbPos.Lerp(sky, a);
		orb.CFrame = new CFrame(p);
		core.CFrame = new CFrame(p);
	});
	orb.Destroy();
	core.Destroy();
	fx.wait(0.15);
	sheetFx(c, "ball", c.dummy.foot.add(new Vector3(0, 6, 0)), 14, 0.8, WHITE);
	fx.pillar(c.dummy.foot, 3.8, 80, 0.9, cyan);
	fx.laser(sky, c.dummy.foot, WHITE, 3, 0.7);
	fx.bolt(sky.add(new Vector3(5, 0, 0)), chest(c), cyan, 0.8, 0.6, 2.4, 10);
	fx.flash(WHITE, 0.1, 0.6);
	fx.shake(1.1, 0.7);
	impact(c, chest(c), cyan, 1.9);
	sheetFx(c, "impact", chest(c), 14, 0.6, WHITE);
	fx.ring(c.dummy.foot.add(new Vector3(0, 0.5, 0)), 2, 16, 0.6, cyan, 1.8, 0.7);
	fx.ring(c.dummy.foot.add(new Vector3(0, 0.6, 0)), 1, 11, 0.5, WHITE, 1, 0.5);
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

/** 趙雲「遊龍穿刺」: three quick dragon thrusts and a huge piercing lunge through the dummy. */
export function zhaoyun(c: Ctx): void {
	const gold = Color3.fromRGB(255, 225, 100);
	const a = c.actor;
	fx.ring(a.foot.add(new Vector3(0, 0.4, 0)), 8, 1, 0.4, gold, 0.8, 0.5);
	fx.burst(a.foot.add(new Vector3(0, 4.5, 0)), gold, 24, { size: 2, speed: 16 });
	fx.shake(0.2, 0.4);
	weaponTrail(c, true);
	fx.wait(0.4);
	for (let i = 0; i < 3; i++) {
		const tip = rel(c, 3.6, 0, 4.5);
		fx.laser(rel(c, 0, 0, 4.5), tip, i === 1 ? WHITE : gold, 1.6, 0.3);
		sheetFx(c, "thrust", tip, 8, 0.3, gold);
		moveTo(a, rel(c, 3.4, 0), 0.1);
		impact(c, chest(c), gold, 0.8);
		flinch(c);
		fx.shake(0.4, 0.2);
		fx.wait(0.06);
		moveTo(a, c.origin, 0.16);
		fx.wait(0.07);
	}
	// Grand lunge: a dragon of gold orbs rushes through the dummy.
	sheetFx(c, "lunge", rel(c, 6, 0, 5), 20, 0.7, WHITE);
	fx.flash(gold, 0.6, 0.3);
	const from = a.foot;
	const to = rel(c, 12, 0);
	let hit = false;
	let acc = 0;
	fx.run(0.22, (t, dt) => {
		acc += dt;
		a.foot = from.Lerp(to, t);
		place(a);
		const orb = fx.ball(a.foot.add(new Vector3(0, 4.5, 0)), 3.6 * (1 - t * 0.4), gold, 0.15);
		fx.spawn(() => {
			fx.run(0.4, (k) => {
				const s = 3.6 * (1 - k);
				orb.Size = new Vector3(s, s, s);
				orb.Transparency = 0.15 + k * 0.85;
			});
			orb.Destroy();
		});
		if (!hit && t > 0.55) {
			hit = true;
			impact(c, chest(c), gold, 1.8);
			sheetFx(c, "burst", chest(c), 14, 0.6, WHITE);
			fx.shake(1.0, 0.5);
			fx.flash(WHITE, 0.3, 0.35);
			fx.spawn(() => {
				knockDummy(c, 9, 0.55, undefined, 3);
			});
		}
	});
	fx.laser(rel(c, 0, 0, 4.5), rel(c, 14, 0, 4.5), gold, 3.2, 0.5);
	weaponTrail(c, false);
	fx.wait(0.4);
	moveTo(a, c.origin, 0.4, 1);
	fx.wait(0.4);
	dummyGetUp(c);
}
