// Showroom special moves of the Wei generals: zhangliao, zhenji, xuchu, caocao, simayi.
import { moveTo, place } from "./actor";
import * as fx from "./fx";
import { Ctx, WHITE, chest, dizzyStars, dummyGetUp, dummyShell, dustAt, flinch, groundCF, impact, knockDummy, rel, sheetFx, shakeDummy, weaponTrail } from "./kit";
import { makeProp, placeProp } from "./props";

/** 張遼「遼來了」: ghost aura, red alarm, chains bind the dummy, then shatter. */
export function zhangliao(c: Ctx): void {
	const purple = Color3.fromRGB(180, 100, 255);
	const red = Color3.fromRGB(255, 50, 60);
	const me = c.actor.foot;
	const aura = fx.ball(me.add(new Vector3(0, 4.5, 0)), 10, purple, 0.55);
	fx.spawn(() => {
		fx.run(1.8, (a) => {
			const s = 10 + a * 12;
			aura.Size = new Vector3(s, s, s);
			aura.Transparency = 0.55 + a * 0.45;
		});
		aura.Destroy();
	});
	sheetFx(c, "ghost", rel(c, 0, 0, 5), 18, 1.6, purple);
	fx.ring(me.add(new Vector3(0, 0.4, 0)), 2, 28, 0.9, purple, 1.6, 0.6);
	fx.ring(me.add(new Vector3(0, 0.4, 0)), 1, 22, 1.1, red, 1.2, 0.5);
	fx.burst(me.add(new Vector3(0, 4, 0)), purple, 40, { size: 3, speed: 30 });
	fx.flash(red, 0.5, 0.5);
	fx.shake(0.6, 0.6);
	fx.label(c.dummy.foot.add(new Vector3(0, 11, 0)), "!", red, 5, 1.4);
	sheetFx(c, "alarm", c.dummy.foot.add(new Vector3(0, 6, 0)), 10, 0.9, red);
	fx.wait(0.6);
	// Chains close in on the dummy.
	const df = c.dummy.foot;
	for (let i = 0; i < 3; i++) {
		fx.ring(df.add(new Vector3(0, 1.4 + i * 2.6, 0)), 9, 2.2, 0.5, Color3.fromRGB(200, 170, 255), 0.6, 0.6, 1.6);
	}
	for (let i = 0; i < 6; i++) {
		const ang = (i / 6) * 2 * math.pi;
		const start = df.add(new Vector3(math.cos(ang) * 10, 10 + (i % 2) * 3, math.sin(ang) * 10));
		fx.bolt(start, chest(c), purple, 0.7, 0.7, 1.2, 7);
	}
	sheetFx(c, "chains", chest(c), 11, 1.4, WHITE);
	dummyShell(c, purple, 1.6, 0.7);
	shakeDummy(c, 1.6, 0.35);
	fx.shake(0.3, 0.5);
	fx.wait(1.6);
	// Shatter.
	sheetFx(c, "shatter", chest(c), 12, 0.6, WHITE);
	impact(c, chest(c), purple, 1.5);
	fx.flash(WHITE, 0.4, 0.3);
	fx.wait(0.4);
}

/** 甄姬「冰雨招來」: ice circle on the dummy, shards rain down and freeze the ground into spikes. */
export function zhenji(c: Ctx): void {
	const ice = Color3.fromRGB(140, 225, 255);
	const center = c.dummy.foot;
	fx.groundCircle(center, 15, 4, ice);
	fx.ring(center.add(new Vector3(0, 0.4, 0)), 3, 15, 0.7, WHITE, 1.4, 0.5);
	fx.burst(c.actor.foot.add(new Vector3(0, 5, 0)), ice, 30, { size: 2.4, speed: 26 });
	sheetFx(c, "snow", center.add(new Vector3(0, 6, 0)), 20, 2, WHITE);
	fx.flash(ice, 0.7, 0.4);
	fx.wait(0.45);
	dummyShell(c, ice, 3, 0.5);
	const n = 64;
	const px: number[] = [];
	const pz: number[] = [];
	const py: number[] = [];
	const delay: number[] = [];
	const landed: boolean[] = [];
	const parts: Part[] = [];
	for (let i = 0; i < n; i++) {
		const ang = math.random() * 2 * math.pi;
		const r = math.sqrt(math.random()) * 14;
		px.push(center.X + math.cos(ang) * r);
		pz.push(center.Z + math.sin(ang) * r);
		py.push(center.Y + 34);
		delay.push(math.random() * 2);
		landed.push(false);
		const shard = fx.block(new CFrame(px[i], py[i], pz[i]), new Vector3(0.8, 3.2, 0.8), i % 3 === 0 ? WHITE : ice);
		shard.Transparency = 1;
		parts.push(shard);
	}
	sheetFx(c, "rain", center.add(new Vector3(0, 12, 0)), 22, 2.4, ice);
	let elapsed = 0;
	let lastHit = 0;
	fx.run(2.8, (a, dt) => {
		elapsed += dt;
		for (let i = 0; i < n; i++) {
			if (elapsed < delay[i]) continue;
			const p = parts[i];
			if (!landed[i]) {
				py[i] -= 55 * dt;
				p.Transparency = 0;
				p.CFrame = new CFrame(px[i], py[i], pz[i]).mul(CFrame.Angles(0.3, 0, 0.2));
				if (py[i] <= center.Y + 1.5) {
					landed[i] = true;
					const h = 2.5 + math.random() * 3.5;
					p.Size = new Vector3(0.9, h, 0.9);
					p.CFrame = new CFrame(px[i], center.Y + h / 2 - 0.2, pz[i]).mul(CFrame.Angles((math.random() - 0.5) * 0.5, 0, (math.random() - 0.5) * 0.5));
					if (i % 3 === 0) fx.burst(new Vector3(px[i], center.Y + 0.5, pz[i]), ice, 4, { size: 1.2, speed: 14 });
				}
			}
		}
		if (elapsed - lastHit > 0.45) {
			lastHit = elapsed;
			flinch(c);
			fx.shake(0.12, 0.12);
		}
		if (a > 0.99) {
			for (const p of parts) p.Destroy();
		}
	});
	sheetFx(c, "spikes", center.add(new Vector3(0, 3, 0)), 16, 0.8, WHITE);
	sheetFx(c, "melt", center.add(new Vector3(0, 2, 0)), 14, 0.8, ice);
	impact(c, chest(c), ice, 1.4);
	fx.flash(WHITE, 0.5, 0.35);
	sheetFx(c, "shatter", chest(c), 12, 0.6, WHITE);
	fx.wait(0.5);
}

/** 許褚「惡虎吞天」: a giant tiger head rises, roars with a fire ring, swallows the dummy and spits it into the sky. */
export function xuchu(c: Ctx): void {
	const orange = Color3.fromRGB(255, 140, 30);
	const tiger = makeProp("xuchu_tiger", "tiger", orange, 0);
	const faceDir = c.look.mul(-1);
	const tigerPos = rel(c, 15, 0, 0);
	const down = new Vector3(0, -17, 0);
	placeProp(tiger, groundCF(tigerPos.add(down), faceDir));
	fx.ring(tigerPos.add(new Vector3(0, 0.4, 0)), 2, 16, 0.6, orange, 1.6, 0.6);
	fx.dust(tigerPos, 16, 6);
	fx.shake(0.7, 0.8);
	fx.run(0.6, (a) => {
		placeProp(tiger, groundCF(tigerPos.add(down.mul(1 - fx.easeOut(a))), faceDir));
	});
	// Roar: fire ring around the dummy, tiger pulses.
	sheetFx(c, "maw", tigerPos.add(new Vector3(0, 8, 0)), 18, 1, WHITE);
	sheetFx(c, "roar", rel(c, 9, 0, 8), 16, 1, WHITE);
	sheetFx(c, "fireRing", c.dummy.foot.add(new Vector3(0, 2, 0)), 18, 1.4, WHITE);
	fx.ring(c.dummy.foot.add(new Vector3(0, 0.5, 0)), 2, 11, 0.5, orange, 1.4, 0.8, 1.2);
	fx.ring(c.dummy.foot.add(new Vector3(0, 1.5, 0)), 1, 8, 0.6, Color3.fromRGB(255, 230, 90), 1.0, 0.6, 1);
	for (let i = 0; i < 10; i++) {
		const ang = (i / 10) * 2 * math.pi;
		fx.fireBurst(c.dummy.foot.add(new Vector3(math.cos(ang) * 10, 1, math.sin(ang) * 10)), 10, 4);
	}
	fx.flash(orange, 0.55, 0.5);
	fx.shake(1.0, 1.0);
	const baseScale = tiger.model.GetScale();
	for (let k = 0; k < 2; k++) {
		fx.run(0.25, (a) => {
			tiger.model.ScaleTo(baseScale * (1 + math.sin(a * math.pi) * 0.25));
		});
	}
	fx.wait(0.3);
	// Swallow and spit the dummy far away.
	fx.run(0.2, (a) => {
		placeProp(tiger, groundCF(tigerPos.add(c.look.mul(-6 * a)), faceDir));
	});
	impact(c, chest(c), orange, 1.6);
	dizzyStars(c, 2);
	fx.run(0.2, () => {});
	const d = c.dummy;
	const from = d.foot;
	const to = rel(c, 32, 0, 0);
	fx.run(1.1, (a) => {
		d.foot = from.Lerp(to, a);
		d.lift = math.sin(a * math.pi) * 16;
		d.tilt = a * math.pi / 2;
		d.yawAdd = a * 12;
		place(d);
		if (a < 0.8) fx.burst(d.foot.add(new Vector3(0, 5 + d.lift, 0)), orange, 2, { size: 1.6, speed: 6, life: 0.5 });
	});
	d.yawAdd = 0;
	d.lift = 0;
	place(d);
	fx.burst(d.foot.add(new Vector3(0, 1, 0)), orange, 30, { size: 2.6, speed: 30 });
	fx.dust(d.foot, 12, 6);
	fx.shake(0.7, 0.5);
	fx.run(0.4, (a) => {
		placeProp(tiger, groundCF(tigerPos.add(c.look.mul(-6)).add(down.mul(fx.easeIn(a))), faceDir));
	});
	tiger.model.Destroy();
	fx.wait(0.4);
}

/** 曹操「霸刀連斬」: a flurry of flying blade waves ending in a big X slash. */
export function caocao(c: Ctx): void {
	const blue = Color3.fromRGB(90, 160, 255);
	const gold = Color3.fromRGB(255, 220, 90);
	weaponTrail(c, true);
	const origin = rel(c, 2.5, 0, 5);
	const target = rel(c, 6.5, 0, 5);
	const spawnWave = (rollDeg: number, width: number, color: Color3, height: number): void => {
		const cf0 = CFrame.lookAt(origin.add(new Vector3(0, height - 5, 0)), target.add(new Vector3(0, height - 5, 0))).mul(CFrame.Angles(0, 0, math.rad(rollDeg)));
		const wave = fx.block(cf0, new Vector3(width, 0.5, 1.6), color);
		const t = fx.makeTrail(wave, new Vector3(-width / 2, 0, 0), new Vector3(width / 2, 0, 0), color);
		t.Enabled = true;
		t.Lifetime = 0.35;
		fx.spawn(() => {
			fx.run(0.2, (a) => {
				wave.CFrame = cf0.add(c.look.mul(a * 5));
			});
			wave.Destroy();
		});
	};
	const rolls = [35, -35, 70, -70, 10];
	for (let i = 0; i < 5; i++) {
		spawnWave(rolls[i], 9, i % 2 === 0 ? blue : gold, 5);
		sheetFx(c, "slash", rel(c, 3, 0, 5), 8, 0.3, blue);
		fx.wait(0.18);
		impact(c, chest(c), i % 2 === 0 ? blue : gold, 0.6);
		sheetFx(c, "sparks", chest(c), 6, 0.3, WHITE);
		flinch(c);
		fx.wait(0.04);
	}
	// Finale: crossing X.
	sheetFx(c, "constellation", rel(c, 4, 0, 8), 18, 1.2, WHITE);
	spawnWave(45, 14, blue, 5);
	spawnWave(-45, 14, gold, 5);
	sheetFx(c, "bladeWave", rel(c, 4, 0, 5), 14, 0.5, WHITE);
	fx.wait(0.25);
	impact(c, chest(c), WHITE, 1.6);
	fx.flash(WHITE, 0.35, 0.35);
	fx.shake(0.8, 0.5);
	weaponTrail(c, false);
	// Heal sparkles on the general.
	fx.burst(c.actor.foot.add(new Vector3(0, 4, 0)), Color3.fromRGB(110, 255, 140), 24, { size: 2, speed: 12, gravity: -8 });
	sheetFx(c, "heal", c.actor.foot.add(new Vector3(0, 4, 0)), 10, 0.8, WHITE);
	knockDummy(c, 6, 0.5);
	fx.wait(0.4);
	dummyGetUp(c);
}

/** 司馬懿「鷹視狼顧」: back-hop, then a crow-trailed leap and a landing shockwave that silences the dummy. */
export function simayi(c: Ctx): void {
	const purple = Color3.fromRGB(170, 80, 240);
	const a = c.actor;
	moveTo(a, rel(c, -6, 0), 0.35, 3);
	dustAt(a.foot);
	fx.ring(a.foot.add(new Vector3(0, 0.4, 0)), 1, 7, 0.4, purple, 1, 0.5);
	fx.burst(a.foot.add(new Vector3(0, 4, 0)), purple, 20, { size: 2, speed: 20 });
	fx.wait(0.15);
	// Crow trail: dark wing pairs left behind along the leap.
	const startFoot = a.foot;
	fx.spawn(() => {
		let last = 0;
		fx.run(0.7, (t) => {
			if (t - last < 0.05) return;
			last = t;
			const pos = a.foot.add(new Vector3(0, 4.5 + a.lift, 0));
			for (let side = -1; side <= 1; side += 2) {
				const wing = fx.block(CFrame.lookAt(pos, pos.add(c.look)).mul(CFrame.Angles(0, 0, side * 0.7)), new Vector3(2.4, 0.2, 1.1), side < 0 ? purple : Color3.fromRGB(60, 20, 110));
				fx.spawn(() => {
					const w0 = wing.CFrame;
					fx.run(0.5, (k) => {
						wing.CFrame = w0.add(new Vector3(side * k * 3, k * 2, 0)).add(c.look.mul(-k * 3));
						wing.Transparency = k;
					});
					wing.Destroy();
				});
			}
		});
	});
	sheetFx(c, "crows", startFoot.add(new Vector3(0, 5, 0)), 14, 0.9, WHITE);
	sheetFx(c, "smoke", startFoot.add(new Vector3(0, 3, 0)), 10, 0.8, WHITE);
	moveTo(a, rel(c, 3.2, 0), 0.7, 11);
	// Landing.
	const land = rel(c, 3.2, 0);
	fx.ring(land.add(new Vector3(0, 0.4, 0)), 1, 13, 0.5, purple, 1.8, 0.7);
	fx.ring(land.add(new Vector3(0, 0.5, 0)), 1, 9, 0.4, WHITE, 1, 0.5);
	sheetFx(c, "ring", land.add(new Vector3(0, 1, 0)), 14, 0.6, purple);
	sheetFx(c, "burst", land.add(new Vector3(0, 3, 0)), 12, 0.6, WHITE);
	dustAt(land, 5);
	fx.burst(land.add(new Vector3(0, 1, 0)), purple, 36, { size: 2.6, speed: 34 });
	fx.shake(0.7, 0.45);
	fx.flash(purple, 0.6, 0.3);
	impact(c, chest(c), purple, 1.1);
	flinch(c);
	fx.label(c.dummy.foot.add(new Vector3(0, 11, 0)), "沉默", purple, 5, 1.6);
	fx.wait(0.5);
	moveTo(a, c.origin, 0.4, 2);
	place(a);
	fx.wait(0.3);
}
