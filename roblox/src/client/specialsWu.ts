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

/** 孫權「受箭回舟」: a warship rises broadside in front of him, the ball bounces off and arrows stick in the hull, then it turns and looses a volley. */
export function sunquan(c: Ctx): void {
	const water = Color3.fromRGB(80, 200, 255);
	const gold = Color3.fromRGB(255, 215, 90);
	const warm = Color3.fromRGB(255, 120, 70);
	const sc = 0.8;
	const shipPos = rel(c, 3.4, 0);
	const ship = makeProp("sunquan_ship", "ship", Color3.fromRGB(150, 50, 45), 0, undefined, sc);
	const down = new Vector3(0, -13, 0);
	// Broadside: the bow points to the general's right, the long hull spans the goal mouth.
	const broadside = c.right;
	placeProp(ship, groundCF(shipPos.add(down), broadside));
	fx.ring(shipPos.add(new Vector3(0, 0.4, 0)), 2, 13, 0.8, water, 1.4, 0.6);
	fx.burst(shipPos.add(new Vector3(0, 2, 0)), water, 40, { size: 2.6, speed: 30 });
	fx.shake(0.6, 0.7);
	fx.flash(water, 0.85, 0.3);
	fx.run(0.7, (a) => {
		placeProp(ship, groundCF(shipPos.add(down.mul(1 - fx.easeOut(a))), broadside));
	});
	fx.burst(shipPos.add(new Vector3(0, 3, 0)), WHITE, 20, { size: 2, speed: 20 });
	// The ball flies at the ship, bounces off, and arrows thud into the hull.
	const hullF = 3.4 + 3.3;
	const ball = fx.ball(rel(c, 16, 3, 4), 2.4, WHITE, 0);
	const b0 = ball.Position;
	const hitP = rel(c, hullF, 1.5, 4.5);
	fx.run(0.5, (a) => {
		ball.CFrame = new CFrame(b0.Lerp(hitP, a));
	});
	fx.burst(hitP, WHITE, 14, { size: 1.6, speed: 18 });
	fx.shake(0.4, 0.25);
	const hullArrows: Prop[] = [];
	for (let i = 0; i < 6; i++) {
		const hull = rel(c, hullF - 0.2, (i - 2.5) * 1.7, 3.6 + (i % 2) * 1.7);
		const from = rel(c, hullF + 11, (i - 2.5) * 1.7 + 2, 8 + (i % 2) * 3);
		const arrow = makeProp("arrow", "arrow", gold, 0);
		hullArrows.push(arrow);
		fx.spawn(() => {
			fx.wait(0.1 + i * 0.12);
			flyArrow(arrow, from, hull, 0.3, 3);
			arrow.model.Parent = ship.model;
			fx.burst(hull, WHITE, 6, { size: 1.1, speed: 12 });
			fx.shake(0.15, 0.1);
		});
	}
	const bounceTo = rel(c, 19, 7, 0.8);
	fx.run(0.8, (a) => {
		ball.CFrame = new CFrame(hitP.Lerp(bounceTo, a).add(new Vector3(0, math.sin(a * math.pi) * 6, 0)));
	});
	ball.Destroy();
	fx.wait(0.7);
	// The ship turns bow-first toward the dummy.
	fx.run(0.5, (a) => {
		const dir = broadside.Lerp(c.look, fx.easeOut(a)).Unit;
		placeProp(ship, groundCF(shipPos, dir));
	});
	sheetFx(c, "volley", shipPos.add(new Vector3(0, 8, 0)), 12, 0.8, warm);
	fx.flash(warm, 0.85, 0.25);
	fx.shake(0.4, 0.4);
	const n = 18;
	for (let i = 0; i < n; i++) {
		const from = shipPos.add(c.look.mul(5)).add(c.right.mul((i % 6) - 2.5)).add(new Vector3(0, 6 + (i % 3), 0));
		const to = c.dummy.foot.add(new Vector3((math.random() - 0.5) * 3, 2 + math.random() * 5, (math.random() - 0.5) * 3));
		const arrow = makeProp("arrow", "arrow", i % 2 === 0 ? gold : warm, 0);
		fx.spawn(() => {
			fx.wait(i * 0.04);
			flyArrow(arrow, from, to, 0.55, 5);
			arrow.model.Destroy();
			fx.burst(to, gold, 5, { size: 1.2, speed: 14 });
			if (i % 4 === 0) {
				flinch(c);
				fx.shake(0.2, 0.15);
			}
		});
	}
	fx.wait(0.55 + n * 0.04);
	impact(c, chest(c), warm, 1.3);
	knockDummy(c, 6, 0.5, c.look, 2);
	fx.wait(0.4);
	fx.run(0.5, (a) => {
		placeProp(ship, groundCF(shipPos.add(down.mul(fx.easeIn(a))), c.look));
	});
	fx.ring(shipPos.add(new Vector3(0, 0.4, 0)), 2, 13, 0.6, water, 1.4, 0.5);
	fx.burst(shipPos.add(new Vector3(0, 1, 0)), water, 24, { size: 2.4, speed: 24 });
	ship.model.Destroy();
	for (const h of hullArrows) h.model.Destroy();
	dummyGetUp(c);
}

/** 大喬「時空之門」: a big rune circle under her, then allies arrive beside her as pillars of light; enemies in the circle are slowed and chained. */
export function daqiao(c: Ctx): void {
	const pink = Color3.fromRGB(255, 110, 235);
	const cyan = Color3.fromRGB(110, 240, 255);
	const centre = c.actor.foot;
	fx.groundCircle(centre, 15, 3.4, pink);
	sheetFx(c, "form", centre.add(new Vector3(0, 1.2, 0)), 22, 1.2, pink);
	fx.ring(centre.add(new Vector3(0, 0.4, 0)), 2, 15, 0.6, cyan, 1.4, 0.5);
	fx.flash(pink, 0.85, 0.3);
	fx.shake(0.3, 0.4);
	const runeRadii = [13, 9, 5];
	const runes: Part[] = [];
	for (let r = 0; r < 3; r++) {
		for (let i = 0; i < 8; i++) {
			runes.push(fx.block(new CFrame(centre), new Vector3(1.4, 0.3, 1.4), r === 1 ? cyan : pink));
		}
	}
	fx.spawn(() => {
		fx.run(3.4, (a) => {
			const grow = math.min(1, a * 6) * math.min(1, (1 - a) * 6);
			for (let r = 0; r < 3; r++) {
				for (let i = 0; i < 8; i++) {
					const ang = (i / 8) * 2 * math.pi + a * (r % 2 === 0 ? 5 : -5);
					const p = centre.add(new Vector3(math.cos(ang) * runeRadii[r] * grow, 0.4, math.sin(ang) * runeRadii[r] * grow));
					runes[r * 8 + i].CFrame = new CFrame(p).mul(CFrame.Angles(0, ang * 2, 0));
				}
			}
		});
		for (const p of runes) p.Destroy();
	});
	fx.wait(0.5);
	// Allies teleport in beside her: pillars of light.
	const spots: [number, number][] = [
		[-3, 4.5],
		[-3, -4.5],
		[-6, 2],
		[-6, -2],
		[1.5, 6.5],
	];
	for (let i = 0; i < spots.size(); i++) {
		const p = rel(c, spots[i][0], spots[i][1]);
		fx.spawn(() => {
			fx.wait(i * 0.12);
			fx.pillar(p, 1.0, 16, 0.8, i % 2 === 0 ? pink : cyan);
			fx.burst(p.add(new Vector3(0, 1, 0)), i % 2 === 0 ? pink : cyan, 12, { size: 1.6, speed: 12 });
			fx.ring(p.add(new Vector3(0, 0.4, 0)), 1, 5, 0.4, WHITE, 0.8, 0.4);
		});
	}
	sheetFx(c, "summon", centre.add(new Vector3(0, 4, 0)), 12, 0.7, pink);
	fx.wait(0.6);
	// Enemies inside the circle: chains wrap the dummy, it moves sluggishly.
	sheetFx(c, "chain", chest(c), 9, 1.4, pink);
	for (let k = 0; k < 3; k++) {
		fx.spawn(() => {
			fx.wait(k * 0.3);
			for (let i = 0; i < 4; i++) {
				const ang = (i / 4) * 2 * math.pi + k;
				const src = centre.add(new Vector3(math.cos(ang) * 13, 0.5, math.sin(ang) * 13));
				fx.bolt(src, chest(c), i % 2 === 0 ? pink : cyan, 0.5, 0.35, 1.0, 8);
			}
		});
	}
	shakeDummy(c, 1.8, 0.25);
	const d = c.dummy;
	const home = d.foot;
	fx.run(1.8, (a) => {
		d.foot = home.sub(c.look.mul(fx.easeOut(a) * 1.5));
		d.tilt = math.sin(a * 6) * 0.1;
		place(d);
	});
	impact(c, chest(c), pink, 0.9);
	d.tilt = 0;
	place(d);
	fx.wait(0.8);
}

/** Tall translucent funnel: stacked discs with a spinning bar each, plus flat leaves swirling around it. */
function tornado(centreFn: () => Vector3, height: number, dur: number, green: Color3, white: Color3): void {
	const n = 9;
	const discs: Part[] = [];
	const bars: Part[] = [];
	for (let i = 0; i < n; i++) {
		const col = i % 2 === 0 ? white : green;
		discs.push(fx.glow(Enum.PartType.Cylinder, new CFrame(centreFn()), new Vector3(0.35, 1, 1), col, 0.6));
		bars.push(fx.glow(Enum.PartType.Block, new CFrame(centreFn()), new Vector3(1, 0.5, 1), white, 0.2));
	}
	fx.spiral(centreFn, 6.5, height, white, dur, 44, 1.3, true, green);
	fx.spawn(() => {
		fx.run(dur, (a) => {
			const grow = math.min(1, a * 4) * math.min(1, (1 - a) * 4);
			const base = centreFn();
			for (let i = 0; i < n; i++) {
				const f = i / (n - 1);
				const d = (3 + 11 * f) * grow + 0.02;
				const pos = base.add(new Vector3(0, 0.6 + f * height * grow, 0));
				discs[i].Size = new Vector3(0.35, d, d);
				discs[i].CFrame = new CFrame(pos).mul(CFrame.Angles(0, 0, math.pi / 2));
				bars[i].Size = new Vector3(d * 0.96, 0.5, 1.1);
				bars[i].CFrame = new CFrame(pos).mul(CFrame.Angles(0, a * 11 * (1 + f) + i, 0));
			}
		});
		for (const p of discs) p.Destroy();
		for (const p of bars) p.Destroy();
	});
}

/** Streaks of wind racing around a circle on the ground. */
function windLines(centre: Vector3, radius: number, dur: number, color: Color3): void {
	const n = 16;
	const lines: Part[] = [];
	for (let i = 0; i < n; i++) lines.push(fx.glow(Enum.PartType.Block, new CFrame(centre), new Vector3(0.3, 0.3, 6), color, 0.15));
	fx.spawn(() => {
		fx.run(dur, (a) => {
			const fade = math.min(1, a * 5) * math.min(1, (1 - a) * 5);
			for (let i = 0; i < n; i++) {
				const ang = a * 9 + (i / n) * 2 * math.pi;
				const r = radius * (0.55 + 0.45 * ((i * 7) % 5) / 4);
				const pos = centre.add(new Vector3(math.cos(ang) * r, 0.8 + (i % 4) * 1.4, math.sin(ang) * r));
				const tangent = new Vector3(-math.sin(ang), 0, math.cos(ang));
				lines[i].CFrame = CFrame.lookAt(pos, pos.add(tangent));
				lines[i].Transparency = 1 - fade * 0.85;
			}
		});
		for (const p of lines) p.Destroy();
	});
}

/** 周瑜「赤壁東風」: a wind circle around the cast point blows the dummy out of the circle, then the wind zone keeps swirling for 3 s. */
export function zhouyu(c: Ctx): void {
	const green = Color3.fromRGB(120, 255, 170);
	const wind = Color3.fromRGB(230, 255, 240);
	const centre = rel(c, 4, 0);
	const radius = 11;
	fx.groundCircle(centre, radius, 5.2, green);
	fx.ring(centre.add(new Vector3(0, 0.5, 0)), 3, radius, 0.6, wind, 1.5, 0.6);
	fx.ring(centre.add(new Vector3(0, 0.5, 0)), 2, radius - 2, 0.9, green, 1.2, 0.6);
	windLines(centre, radius - 1, 5, wind);
	fx.burst(c.actor.foot.add(new Vector3(0, 5, 0)), green, 20, { size: 2, speed: 22 });
	fx.shake(0.4, 0.6);
	fx.wait(0.6);
	// The dummy is blown out of the circle.
	const d = c.dummy;
	const from = d.foot;
	const to = rel(c, 4 + radius + 5, 0);
	impact(c, chest(c), green, 0.9);
	sheetFx(c, "tornado", centre.add(new Vector3(0, 6, 0)), 10, 1.2, green);
	fx.run(0.7, (a) => {
		d.foot = from.Lerp(to, fx.easeOut(a));
		d.lift = math.sin(a * math.pi) * 3;
		d.yawAdd = a * 8;
		d.tilt = math.min(1, a * 2) * 1.2;
		place(d);
	});
	d.yawAdd = 0;
	d.lift = 0;
	place(d);
	fx.dust(d.foot, 10, 5);
	fx.shake(0.5, 0.3);
	// The wind zone stays (swirl keeps racing); sparkles drift.
	fx.burst(centre.add(new Vector3(0, 3, 0)), wind, 30, { size: 1.2, speed: 4, life: 2, gravity: 0, spread: 180 });
	fx.wait(2.2);
	dummyGetUp(c);
	fx.wait(1.0);
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
	tornado(() => c.dummy.foot, 14, 2.6, pink, WHITE);
	sheetFx(c, "gust", centre.add(new Vector3(0, 6, 0)), 9, 1.4, pink);
	sheetFx(c, "petals", centre.add(new Vector3(0, 9, 0)), 8, 1.6, pink);
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
	const boat = makeProp("sunce_boat", "boat", Color3.fromRGB(40, 110, 220), c.actor.footOffset, undefined, 1.8);
	const startF = -17;
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
