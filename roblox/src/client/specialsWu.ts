// Showroom special moves of the Wu generals: sunquan, daqiao, zhouyu, xiaoqiao, sunce.
import { place } from "./actor";
import * as fx from "./fx";
import { Ctx, DUMMY_DIST, WHITE, chest, dizzyStars, dummyGetUp, flinch, groundCF, impact, knockDummy, rel, ride, sheetFx, shakeDummy } from "./kit";
import { Prop, makeProp, placeProp } from "./props";

const UP = new Vector3(0, 1, 0);

/** Flies an arrow prop on a parabola from `a` to `b` in `dur`; returns after landing (call inside fx.spawn). */
function flyArrow(arrow: Prop, a: Vector3, b: Vector3, dur: number, arcH: number): void {
	fx.run(dur, (t) => {
		const p = a.Lerp(b, t).add(new Vector3(0, math.sin(t * math.pi) * arcH, 0));
		const t2 = math.min(1, t + 0.03);
		const q = a.Lerp(b, t2).add(new Vector3(0, math.sin(t2 * math.pi) * arcH, 0));
		const dir = q.sub(p);
		placeProp(arrow, CFrame.lookAt(p, p.add(dir.Magnitude > 0.01 ? dir : new Vector3(0, 0, -1))));
	});
}

/** 孫權「受箭回舟」: a warship rises from the water, takes arrows, turns and looses a volley. */
export function sunquan(c: Ctx): void {
	const water = Color3.fromRGB(80, 200, 255);
	const gold = Color3.fromRGB(255, 215, 90);
	const warm = Color3.fromRGB(255, 120, 70);
	const shipPos = rel(c, 3, 17);
	const ship = makeProp("sunquan_ship", "ship", Color3.fromRGB(150, 50, 45), 0);
	const down = new Vector3(0, -16, 0);
	placeProp(ship, groundCF(shipPos.add(down), c.look));
	fx.ring(shipPos.add(new Vector3(0, 0.4, 0)), 2, 17, 0.8, water, 1.6, 0.6);
	fx.ring(shipPos.add(new Vector3(0, 0.5, 0)), 1, 12, 0.6, WHITE, 1, 0.5);
	fx.burst(shipPos.add(new Vector3(0, 2, 0)), water, 50, { size: 3, speed: 36 });
	sheetFx(c, "emerge", shipPos.add(new Vector3(0, 6, 0)), 22, 0.9, WHITE);
	fx.shake(0.7, 0.8);
	fx.flash(water, 0.75, 0.4);
	fx.run(0.7, (a) => {
		placeProp(ship, groundCF(shipPos.add(down.mul(1 - fx.easeOut(a))), c.look));
	});
	fx.burst(shipPos.add(new Vector3(0, 3, 0)), WHITE, 30, { size: 2.4, speed: 24 });
	fx.wait(0.2);
	// Arrows stick into the hull.
	const hullArrows: Prop[] = [];
	for (let i = 0; i < 6; i++) {
		const hull = shipPos.sub(c.right.mul(4.7)).add(c.look.mul((i - 2.5) * 3)).add(new Vector3(0, 4.4 + (i % 2) * 1.6, 0));
		const from = rel(c, 3 + (i - 2.5) * 3 + 12, 4 + (i % 3), 7 + (i % 2) * 3);
		const arrow = makeProp("arrow", "arrow", gold, 0);
		hullArrows.push(arrow);
		fx.spawn(() => {
			fx.wait(i * 0.11);
			flyArrow(arrow, from, hull, 0.3, 3);
			fx.burst(hull, WHITE, 8, { size: 1.2, speed: 14 });
			fx.shake(0.15, 0.12);
		});
	}
	fx.wait(1.1);
	// Ship turns toward the dummy.
	const aim = new Vector3(c.dummy.foot.X - shipPos.X, 0, c.dummy.foot.Z - shipPos.Z).Unit;
	fx.run(0.5, (a) => {
		const dir = c.look.Lerp(aim, fx.easeOut(a));
		placeProp(ship, groundCF(shipPos, dir));
	});
	sheetFx(c, "volley", shipPos.add(new Vector3(0, 8, 0)), 18, 0.8, WHITE);
	fx.flash(warm, 0.75, 0.3);
	fx.shake(0.4, 0.4);
	// Volley.
	const n = 18;
	for (let i = 0; i < n; i++) {
		const from = shipPos.add(aim.mul(6)).add(c.look.mul((i % 6) - 2.5)).add(new Vector3(0, 6 + (i % 3), 0));
		const to = c.dummy.foot.add(new Vector3((math.random() - 0.5) * 3, 2 + math.random() * 5, (math.random() - 0.5) * 3));
		const arrow = makeProp("arrow", "arrow", i % 2 === 0 ? gold : warm, 0);
		fx.spawn(() => {
			fx.wait(i * 0.04);
			flyArrow(arrow, from, to, 0.55, 8);
			arrow.model.Destroy();
			fx.burst(to, gold, 5, { size: 1.2, speed: 14 });
			if (i % 4 === 0) {
				flinch(c);
				fx.shake(0.2, 0.15);
			}
		});
	}
	fx.wait(0.55 + n * 0.04);
	sheetFx(c, "impact", chest(c), 13, 0.6, WHITE);
	impact(c, chest(c), warm, 1.5);
	fx.flash(WHITE, 0.4, 0.3);
	knockDummy(c, 6, 0.5, aim, 2);
	fx.wait(0.4);
	fx.run(0.5, (a) => {
		placeProp(ship, groundCF(shipPos.add(down.mul(fx.easeIn(a))), aim));
	});
	fx.ring(shipPos.add(new Vector3(0, 0.4, 0)), 2, 15, 0.6, water, 1.4, 0.5);
	fx.burst(shipPos.add(new Vector3(0, 1, 0)), water, 30, { size: 2.6, speed: 28 });
	ship.model.Destroy();
	for (const h of hullArrows) h.model.Destroy();
	dummyGetUp(c);
}

/** 大喬「時空之門」: a rune circle and a vertical portal; chains of light drag the dummy toward the gate. */
export function daqiao(c: Ctx): void {
	const pink = Color3.fromRGB(255, 110, 235);
	const cyan = Color3.fromRGB(110, 240, 255);
	const centre = c.dummy.foot;
	const portalPos = rel(c, DUMMY_DIST + 9, 0, 7.5);
	fx.groundCircle(centre, 16, 3.2, pink);
	sheetFx(c, "form", centre.add(new Vector3(0, 1.5, 0)), 30, 1.2, WHITE);
	fx.ring(centre.add(new Vector3(0, 0.4, 0)), 2, 16, 0.6, cyan, 1.4, 0.5);
	fx.flash(pink, 0.7, 0.4);
	fx.shake(0.3, 0.4);
	fx.wait(0.5);
	// Rotating rune rings on the floor and the vertical portal.
	const runeRadii = [14, 10, 6];
	const runes: Part[] = [];
	for (let r = 0; r < 3; r++) {
		for (let i = 0; i < 8; i++) {
			runes.push(fx.block(new CFrame(centre), new Vector3(1.4, 0.3, 1.4), r === 1 ? cyan : pink));
		}
	}
	const portalBits: Part[] = [];
	for (let i = 0; i < 32; i++) {
		portalBits.push(fx.block(new CFrame(portalPos), new Vector3(1.1, 1.1, 2.6), i % 2 === 0 ? pink : cyan));
	}
	const disc = fx.glow(Enum.PartType.Cylinder, CFrame.lookAt(portalPos, portalPos.add(c.look)).mul(CFrame.Angles(0, math.pi / 2, 0)), new Vector3(0.3, 12, 12), pink, 0.5);
	fx.spawn(() => {
		fx.run(3, (a) => {
			const grow = math.min(1, a * 5) * math.min(1, (1 - a) * 6);
			for (let r = 0; r < 3; r++) {
				for (let i = 0; i < 8; i++) {
					const ang = (i / 8) * 2 * math.pi + a * (r % 2 === 0 ? 5 : -5);
					const p = centre.add(new Vector3(math.cos(ang) * runeRadii[r] * grow, 0.4, math.sin(ang) * runeRadii[r] * grow));
					runes[r * 8 + i].CFrame = new CFrame(p).mul(CFrame.Angles(0, ang * 2, 0));
				}
			}
			for (let i = 0; i < 32; i++) {
				const ang = (i / 32) * 2 * math.pi + a * 3;
				const rad = 6.2 * grow;
				const p = portalPos.add(c.right.mul(math.cos(ang) * rad)).add(UP.mul(math.sin(ang) * rad));
				const tangent = c.right.mul(-math.sin(ang)).add(UP.mul(math.cos(ang)));
				portalBits[i].CFrame = CFrame.lookAt(p, p.add(tangent));
			}
			const ds = 12 * grow * (1 + 0.06 * math.sin(a * 40));
			disc.Size = new Vector3(0.3, ds, ds);
			disc.Transparency = 0.45 + 0.15 * math.sin(a * 30);
		});
		for (const p of runes) p.Destroy();
		for (const p of portalBits) p.Destroy();
		disc.Destroy();
	});
	sheetFx(c, "active", portalPos, 16, 1.4, WHITE);
	fx.burst(portalPos, pink, 40, { size: 2.6, speed: 24, life: 1.2 });
	fx.wait(0.4);
	// Chains from the portal drag the dummy.
	sheetFx(c, "chain", chest(c), 12, 1.4, WHITE);
	for (let k = 0; k < 4; k++) {
		fx.spawn(() => {
			fx.wait(k * 0.35);
			for (let i = 0; i < 4; i++) {
				const ang = (i / 4) * 2 * math.pi + k;
				const src = portalPos.add(c.right.mul(math.cos(ang) * 5.5)).add(UP.mul(math.sin(ang) * 5.5));
				fx.bolt(src, chest(c), i % 2 === 0 ? pink : cyan, 0.5, 0.35, 1.0, 8);
			}
		});
	}
	shakeDummy(c, 1.6, 0.3);
	const d = c.dummy;
	const home = d.foot;
	fx.run(1.6, (a) => {
		d.foot = home.add(c.look.mul(fx.easeOut(a) * 5));
		d.tilt = math.sin(a * 6) * 0.15;
		place(d);
	});
	sheetFx(c, "summon", centre.add(new Vector3(0, 4, 0)), 14, 0.7, WHITE);
	sheetFx(c, "burst", chest(c), 14, 0.6, WHITE);
	impact(c, chest(c), pink, 1.5);
	fx.flash(WHITE, 0.45, 0.35);
	fx.shake(0.9, 0.5);
	d.tilt = 0;
	place(d);
	fx.wait(0.6);
}

/** 周瑜「赤壁東風」: a fiery east-wind tornado rolls in and blows the dummy across the stage. */
export function zhouyu(c: Ctx): void {
	const red = Color3.fromRGB(255, 90, 60);
	const wind = Color3.fromRGB(190, 255, 220);
	const centre = c.dummy.foot;
	fx.groundCircle(centre, 15, 4, red);
	sheetFx(c, "slash", rel(c, 3, 0, 5), 12, 0.5, red);
	fx.burst(c.actor.foot.add(new Vector3(0, 5, 0)), red, 24, { size: 2.4, speed: 24 });
	fx.flash(red, 0.75, 0.4);
	fx.wait(0.45);
	let tc = rel(c, 1.5, 0, 0.5);
	fx.spiral(() => tc, 6, 17, red, 2.4, 64, 1.2, false, wind);
	fx.spiral(() => tc, 4, 17, WHITE, 2.4, 40, 0.8, false, red);
	sheetFx(c, "tornado", rel(c, 3, 0, 8), 22, 1.6, WHITE);
	const aim = rel(c, DUMMY_DIST, 0, 0.5);
	const start = tc;
	fx.run(0.9, (a) => {
		tc = start.Lerp(aim, a);
		if (math.random() > 0.7) fx.dust(tc, 2, 4);
	});
	// Blast: dummy flies backward spinning.
	sheetFx(c, "burst", chest(c), 15, 0.6, WHITE);
	fx.ring(aim, 2, 20, 0.6, wind, 1.6, 0.7);
	fx.ring(aim, 1, 14, 0.5, red, 1.2, 0.6);
	fx.flash(WHITE, 0.4, 0.3);
	fx.shake(1.0, 0.7);
	impact(c, chest(c), red, 1.4);
	const d = c.dummy;
	const from = d.foot;
	const to = rel(c, DUMMY_DIST + 15, 0);
	fx.run(0.9, (a) => {
		tc = aim.Lerp(to, a);
		d.foot = from.Lerp(to, fx.easeOut(a));
		d.lift = math.sin(a * math.pi) * 5;
		d.yawAdd = a * 14;
		d.tilt = math.min(1, a * 2) * (math.pi / 2);
		place(d);
	});
	d.yawAdd = 0;
	d.lift = 0;
	place(d);
	fx.dust(d.foot, 14, 6);
	fx.shake(0.5, 0.3);
	// The east-wind field stays where the dummy landed and slows it.
	sheetFx(c, "active", d.foot.add(new Vector3(0, 2, 0)), 18, 1, WHITE);
	fx.groundCircle(d.foot, 11, 1.8, red);
	sheetFx(c, "slow", d.foot.add(new Vector3(0, 3, 0)), 12, 1.2, wind);
	fx.wait(1.5);
	dummyGetUp(c);
}

/** 小喬「吹飛」: a sakura mark appears under the dummy, then a petal tornado lifts and spins it away. */
export function xiaoqiao(c: Ctx): void {
	const pink = Color3.fromRGB(255, 140, 200);
	const centre = c.dummy.foot;
	fx.groundCircle(centre, 8, 2.2, pink);
	sheetFx(c, "mark", centre.add(new Vector3(0, 0.6, 0)), 15, 1, pink);
	sheetFx(c, "markHold", centre.add(new Vector3(0, 0.8, 0)), 15, 1.2, pink);
	for (let i = 0; i < 3; i++) {
		fx.spawn(() => {
			fx.wait(i * 0.3);
			fx.ring(centre.add(new Vector3(0, 0.5, 0)), 8, 1.5, 0.5, i === 1 ? WHITE : pink, 0.7, 0.4);
		});
	}
	fx.burst(centre.add(new Vector3(0, 8, 0)), pink, 30, { size: 1.8, speed: 4, life: 1.4, gravity: 6, spread: 180 });
	fx.wait(1.0);
	// Petal tornado.
	fx.spiral(() => c.dummy.foot, 6.5, 16, pink, 2.5, 90, 1.3, true, WHITE);
	sheetFx(c, "gust", centre.add(new Vector3(0, 6, 0)), 20, 1.4, WHITE);
	sheetFx(c, "petals", centre.add(new Vector3(0, 9, 0)), 18, 1.6, WHITE);
	fx.ring(centre.add(new Vector3(0, 0.5, 0)), 2, 14, 0.6, pink, 1.4, 0.6);
	fx.flash(pink, 0.65, 0.4);
	fx.shake(0.7, 0.6);
	const d = c.dummy;
	fx.run(1.2, (a) => {
		d.lift = fx.easeOut(a) * 8;
		d.yawAdd = a * 16;
		d.tilt = math.sin(a * 8) * 0.2;
		place(d);
		if (math.random() > 0.6) fx.burst(d.foot.add(new Vector3(0, 4 + d.lift, 0)), pink, 2, { size: 1.4, speed: 8, life: 0.6 });
	});
	// Drop.
	fx.run(0.35, (a) => {
		d.lift = 8 * (1 - fx.easeIn(a));
		d.tilt = fx.easeIn(a) * (math.pi / 2);
		d.yawAdd += 0.3;
		place(d);
	});
	d.yawAdd = 0;
	d.lift = 0;
	place(d);
	sheetFx(c, "impact", chest(c), 12, 0.5, WHITE);
	impact(c, chest(c), pink, 1.5);
	fx.dust(d.foot, 12, 6);
	fx.burst(d.foot.add(new Vector3(0, 2, 0)), pink, 50, { size: 2, speed: 30, life: 1.2 });
	fx.flash(WHITE, 0.5, 0.3);
	fx.shake(0.9, 0.5);
	fx.wait(1.0);
	dummyGetUp(c);
}

/** 孫策「揚帆起航」: rides a boat across the stage on a wake of spray and smashes the dummy skyward. */
export function sunce(c: Ctx): void {
	const water = Color3.fromRGB(70, 210, 255);
	const boat = makeProp("sunce_boat", "boat", Color3.fromRGB(40, 110, 220), c.actor.footOffset);
	const startF = -24;
	const endF = 11;
	const start = rel(c, startF, 0);
	const finish = rel(c, endF, 0);
	ride(c, boat, groundCF(start, c.look));
	fx.ring(start.add(new Vector3(0, 0.4, 0)), 1, 11, 0.6, water, 1.4, 0.5);
	fx.burst(start.add(new Vector3(0, 2, 0)), water, 40, { size: 2.6, speed: 30 });
	sheetFx(c, "splash", start.add(new Vector3(0, 3, 0)), 14, 0.7, WHITE);
	fx.flash(water, 0.78, 0.35);
	fx.shake(0.3, 0.4);
	fx.wait(0.5);
	const hitA = (DUMMY_DIST - 4 - startF) / (endF - startF);
	let hit = false;
	let elapsed = 0;
	let lastWake = 0;
	fx.run(1.4, (a, dt) => {
		elapsed += dt;
		const t = a * (1.25 - 0.25 * a);
		const p = start.Lerp(finish, t);
		ride(c, boat, groundCF(p, c.look));
		if (elapsed - lastWake > 0.03) {
			lastWake = elapsed;
			for (let side = -1; side <= 1; side += 2) {
				const spot = p.sub(c.look.mul(5)).add(c.right.mul(side * 3)).add(new Vector3(0, 0.6, 0));
				const blob = fx.ball(spot, 2.6, side < 0 ? water : WHITE, 0.2);
				fx.spawn(() => {
					fx.run(0.6, (k) => {
						const s = 2.6 * (1 + k * 0.8);
						blob.Size = new Vector3(s, s * 0.4, s);
						blob.CFrame = new CFrame(spot.add(c.right.mul(side * k * 4)));
						blob.Transparency = 0.2 + k * 0.8;
					});
					blob.Destroy();
				});
			}
			fx.burst(p.add(new Vector3(0, 1.5, 0)).sub(c.look.mul(3)), water, 3, { size: 1.8, speed: 14 });
		}
		if (!hit && t >= hitA) {
			hit = true;
			sheetFx(c, "splinter", chest(c), 13, 0.6, WHITE);
			impact(c, chest(c), water, 1.9);
			fx.ring(c.dummy.foot.add(new Vector3(0, 0.5, 0)), 2, 16, 0.6, WHITE, 1.6, 0.7);
			fx.burst(chest(c), WHITE, 50, { size: 3, speed: 40 });
			fx.flash(WHITE, 0.3, 0.4);
			fx.shake(1.3, 0.7);
			fx.spawn(() => {
				knockDummy(c, 17, 1.0, c.look, 13);
				fx.dust(c.dummy.foot, 10, 6);
				fx.shake(0.5, 0.3);
			});
		}
	});
	sheetFx(c, "wake", finish.add(new Vector3(0, 2, 0)), 14, 0.6, water);
	fx.burst(finish.add(new Vector3(0, 2, 0)), water, 30, { size: 2.6, speed: 26 });
	fx.shards(finish.add(new Vector3(0, 3, 0)), Color3.fromRGB(70, 130, 255), 14, 30, 1.2);
	boat.model.Destroy();
	place(c.actor);
	fx.wait(0.5);
	sheetFx(c, "dizzy", c.dummy.foot.add(new Vector3(0, 8, 0)), 8, 1.4, WHITE);
	dizzyStars(c, 2.2);
	fx.wait(1.2);
	dummyGetUp(c);
}
