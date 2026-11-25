// Showroom special moves of the Wei generals: zhangliao, zhenji, xuchu, caocao, simayi.
import { moveTo, place, playOnce } from "./actor";
import { CHAR_ANIMS } from "./animIds";
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
		fx.bolt(start, chest(c), purple, 0.3, 0.7, 1.2, 7);
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
	const center = rel(c, 4.5, 0);
	fx.groundCircle(center, 14, 4, ice);
	fx.ring(center.add(new Vector3(0, 0.4, 0)), 3, 14, 0.7, ice, 1.4, 0.5);
	fx.burst(c.actor.foot.add(new Vector3(0, 5, 0)), ice, 30, { size: 2.4, speed: 26 });
	fx.flash(ice, 0.85, 0.3);
	fx.wait(0.45);
	dummyShell(c, ice, 3, 0.85);
	const n = 64;
	const px: number[] = [];
	const pz: number[] = [];
	const py: number[] = [];
	const delay: number[] = [];
	const landed: boolean[] = [];
	const parts: Part[] = [];
	for (let i = 0; i < n; i++) {
		const ang = math.random() * 2 * math.pi;
		const r = math.sqrt(math.random()) * 13;
		px.push(center.X + math.cos(ang) * r);
		pz.push(center.Z + math.sin(ang) * r);
		py.push(center.Y + 34);
		delay.push(math.random() * 2);
		landed.push(false);
		const shard = fx.block(new CFrame(px[i], py[i], pz[i]), new Vector3(0.8, 3.2, 0.8), i % 3 === 0 ? WHITE : ice);
		shard.Transparency = 1;
		parts.push(shard);
	}
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
	sheetFx(c, "melt", center.add(new Vector3(0, 2, 0)), 12, 0.8, ice);
	fx.burst(center.add(new Vector3(0, 1, 0)), ice, 20, { size: 1.6, speed: 10 });
	fx.wait(0.8);
}

/** 許褚「惡虎吞天」: tiger-head aura on him, a ball flies in and is swallowed, 0.5 s later he spits a fire ball that lobs onto the dummy. */
export function xuchu(c: Ctx): void {
	const orange = Color3.fromRGB(255, 140, 30);
	const yellow = Color3.fromRGB(255, 220, 80);
	const sc = 1.15;
	const tigerPos = rel(c, 0.6, 0, -0.5);
	const tiger = makeProp("xuchu_tiger", "tiger", orange, 0, undefined, sc);
	for (const d of tiger.model.GetDescendants()) {
		if (d.IsA("BasePart")) d.Transparency = math.max(d.Transparency, 0.45);
	}
	placeProp(tiger, groundCF(tigerPos, c.look));
	fx.ring(c.actor.foot.add(new Vector3(0, 0.4, 0)), 1, 9, 0.5, orange, 1.4, 0.6);
	fx.burst(c.actor.foot.add(new Vector3(0, 4, 0)), orange, 24, { size: 2, speed: 16 });
	fx.flash(orange, 0.85, 0.3);
	fx.shake(0.4, 0.5);
	const mouth = tigerPos.add(new Vector3(0, 3.4 * sc, 0)).add(c.look.mul(2.1 * sc));
	fx.run(0.5, (a) => {
		tiger.model.ScaleTo(sc * (0.4 + 0.6 * fx.easeOut(a)));
		placeProp(tiger, groundCF(tigerPos, c.look));
	});
	// The ball arrives from the dummy side and is swallowed.
	const ball = fx.ball(rel(c, 16, 3, 4), 2.4, WHITE, 0);
	const from = ball.Position;
	fx.run(0.55, (a) => {
		ball.CFrame = new CFrame(from.Lerp(mouth, a).add(new Vector3(0, math.sin(a * math.pi) * 2, 0)));
	});
	ball.Destroy();
	fx.burst(mouth, orange, 18, { size: 1.8, speed: 14 });
	fx.shake(0.5, 0.3);
	for (let k = 0; k < 2; k++) {
		fx.run(0.12, (a) => {
			tiger.model.ScaleTo(sc * (1 + math.sin(a * math.pi) * 0.22));
		});
	}
	fx.wait(0.5);
	// Spit a fire ball in a high arc onto the dummy.
	const fire = fx.ball(mouth, 3.4, orange, 0.1);
	const core = fx.ball(mouth, 1.8, yellow, 0);
	const target = c.dummy.foot.add(new Vector3(0, 3, 0));
	fx.burst(mouth, yellow, 20, { size: 2, speed: 22 });
	fx.shake(0.5, 0.3);
	fx.run(0.8, (a) => {
		const p = mouth.Lerp(target, a).add(new Vector3(0, math.sin(a * math.pi) * 13, 0));
		fire.CFrame = new CFrame(p);
		core.CFrame = new CFrame(p);
		fx.fireBurst(p, 1, 2);
	});
	fire.Destroy();
	core.Destroy();
	impact(c, chest(c), orange, 1.5);
	fx.ring(c.dummy.foot.add(new Vector3(0, 0.5, 0)), 1, 10, 0.5, orange, 1.4, 0.8);
	for (let i = 0; i < 6; i++) {
		const ang = (i / 6) * 2 * math.pi;
		fx.fireBurst(c.dummy.foot.add(new Vector3(math.cos(ang) * 3, 0.6, math.sin(ang) * 3)), 6, 3);
	}
	fx.shake(0.9, 0.5);
	dizzyStars(c, 2.4);
	fx.spawn(() => {
		knockDummy(c, 3, 0.35, undefined, 1);
		fx.wait(0.2);
		dummyGetUp(c);
	});
	fx.run(0.4, (a) => {
		tiger.model.ScaleTo(sc * (1 - 0.6 * fx.easeIn(a)));
		placeProp(tiger, groundCF(tigerPos, c.look));
	});
	tiger.model.Destroy();
	fx.wait(1.4);
}

/** 曹操「霸刀連斬」: non-stop automatic slashes, each sending a blade wave at the dummy (stagger) while a green heal glow pulses on him. */
export function caocao(c: Ctx): void {
	const blue = Color3.fromRGB(90, 160, 255);
	const gold = Color3.fromRGB(255, 220, 90);
	const green = Color3.fromRGB(110, 255, 140);
	const a0 = c.actor;
	weaponTrail(c, true);
	const origin = rel(c, 2.5, 0, 5);
	const target = rel(c, 7, 0, 5);
	const spawnWave = (rollDeg: number, width: number, color: Color3): void => {
		const cf0 = CFrame.lookAt(origin, target).mul(CFrame.Angles(0, 0, math.rad(rollDeg)));
		const wave = fx.block(cf0, new Vector3(width, 0.5, 1.6), color);
		const t = fx.makeTrail(wave, new Vector3(-width / 2, 0, 0), new Vector3(width / 2, 0, 0), color);
		t.Enabled = true;
		t.Lifetime = 0.3;
		fx.spawn(() => {
			fx.run(0.18, (a) => {
				wave.CFrame = cf0.add(c.look.mul(a * 4.5));
			});
			wave.Destroy();
			impact(c, chest(c), color, 0.5);
			flinch(c);
		});
	};
	// Heal glow that stays on him for the whole flurry.
	const glow = fx.glow(Enum.PartType.Ball, new CFrame(a0.foot), new Vector3(7, 9.5, 7), green, 0.82);
	fx.spawn(() => {
		fx.run(2.6, (a) => {
			glow.CFrame = new CFrame(a0.foot.add(new Vector3(0, 4.4, 0)));
			glow.Transparency = 0.8 + math.sin(a * 40) * 0.06;
		});
		glow.Destroy();
	});
	const rolls = [35, -35, 70, -70, 10];
	const clipId = CHAR_ANIMS[c.charId]?.attack;
	for (let i = 0; i < 11; i++) {
		playOnce(a0, clipId, 2.2);
		spawnWave(rolls[i % 5], 8, i % 2 === 0 ? blue : gold);
		sheetFx(c, "slash", rel(c, 3, 0, 5), 7, 0.25, blue);
		fx.ring(a0.foot.add(new Vector3(0, 0.4, 0)), 2, 6, 0.4, green, 0.6, 0.4);
		fx.burst(a0.foot.add(new Vector3(0, 2, 0)), green, 4, { size: 1.2, speed: 6, gravity: -10, life: 0.7 });
		fx.shake(0.12, 0.1);
		fx.wait(0.2);
	}
	weaponTrail(c, false);
	fx.wait(0.4);
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
