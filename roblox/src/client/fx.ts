// Showroom effect engine: neon primitives, flipbooks, shockwaves, bolts, bursts, screen shake / flash.
// Everything runs on a global time scale (the 1x / 0.5x / 0.25x buttons) and in a "generation": reset() bumps the
// generation, destroys every effect part and makes all running fx loops stop at their next step.
import { FxSheet } from "./fxIds";

const Workspace = game.GetService("Workspace");
const Debris = game.GetService("Debris");
const Players = game.GetService("Players");

const SPARKLE_TEXTURE = "rbxasset://textures/particles/sparkles_main.dds";
const FIRE_TEXTURE = "rbxasset://textures/particles/fire_main.dds";
const SMOKE_TEXTURE = "rbxasset://textures/particles/smoke_main.dds";
/** Assumed pixel size of a (square) flipbook sheet; only the BillboardGui fallback needs it. */
const MAX_SHEET = 9;
const SHEET_PX = 512; // fx-upload sheets are 512x512 (2x2 grid of 256 cells)

let timeScale = 1;
let generation = 0;
let fxRoot: Instance | undefined;
let shakeAmp = 0;
let shakeLeft = 0;
let shakeTotal = 1;
let flashGui: ScreenGui | undefined;
let flashFrame: Frame | undefined;
let flashToken = 0;

export function setTimeScale(s: number): void {
	timeScale = s;
}

export function getTimeScale(): number {
	return timeScale;
}

export function setRoot(root: Instance): void {
	fxRoot = root;
}

export function getParent(): Instance {
	return fxRoot ?? Workspace;
}

export function currentGeneration(): number {
	return generation;
}

/** Stops every running fx loop, removes all effect instances and clears shake / flash. */
export function reset(): void {
	generation += 1;
	shakeAmp = 0;
	shakeLeft = 0;
	if (fxRoot !== undefined) fxRoot.ClearAllChildren();
	flashToken += 1;
	if (flashFrame !== undefined) flashFrame.BackgroundTransparency = 1;
}

const CANCELLED = "showroom-cancelled";

/** Runs step(alpha 0..1, scaledDt) every frame for `dur` scaled seconds. Yields. Throws (caught by guard / spawn) when reset() cancels it. */
export function run(dur: number, step: (a: number, dt: number) => void): boolean {
	const gen = generation;
	if (dur <= 0) {
		step(1, 0);
		return true;
	}
	let t = 0;
	while (t < dur) {
		const dt = task.wait() * timeScale;
		if (gen !== generation) error(CANCELLED);
		t += dt;
		step(math.min(1, t / dur), dt);
	}
	return true;
}

/** Scaled wait. Throws when cancelled. */
export function wait(sec: number): boolean {
	return run(sec, () => {});
}

/** Runs fn, swallowing the cancel signal thrown by run() (real errors are warned). */
export function guard(fn: () => void): void {
	const [ok, err] = pcall(fn);
	if (!ok && err !== CANCELLED) warn(`[showroom] ${tostring(err)}`);
}

/** Starts a cancellable effect thread that does not block the caller. */
export function spawn(fn: () => void): void {
	task.spawn(() => {
		guard(fn);
	});
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function easeOut(a: number): number {
	return 1 - (1 - a) * (1 - a);
}

export function easeIn(a: number): number {
	return a * a;
}

/** Real-time seconds that an effect of `sec` scaled seconds needs, plus a margin (Debris safety net). */
export function expire(inst: Instance, sec: number): void {
	Debris.AddItem(inst, sec / timeScale + 1.5);
}

export function hue(h: number, s = 0.85, v = 1): Color3 {
	return Color3.fromHSV(h - math.floor(h), s, v);
}

/** Bright neon part (anchored, no collisions). */
export function glow(shape: Enum.PartType, cf: CFrame, size: Vector3, color: Color3, transparency = 0): Part {
	const p = new Instance("Part");
	p.Shape = shape;
	p.Anchored = true;
	p.CanCollide = false;
	p.CanQuery = false;
	p.CanTouch = false;
	p.CastShadow = false;
	p.Material = Enum.Material.Neon;
	p.Color = color;
	p.Transparency = transparency;
	p.Size = size;
	p.CFrame = cf;
	p.Parent = getParent();
	return p;
}

export function block(cf: CFrame, size: Vector3, color: Color3, transparency = 0): Part {
	return glow(Enum.PartType.Block, cf, size, color, transparency);
}

export function ball(pos: Vector3, diameter: number, color: Color3, transparency = 0): Part {
	return glow(Enum.PartType.Ball, new CFrame(pos), new Vector3(diameter, diameter, diameter), color, transparency);
}

/** Invisible anchored part used as an emitter / billboard host. */
export function anchorPart(pos: Vector3): Part {
	const p = new Instance("Part");
	p.Anchored = true;
	p.CanCollide = false;
	p.CanQuery = false;
	p.CanTouch = false;
	p.CastShadow = false;
	p.Transparency = 1;
	p.Size = new Vector3(0.2, 0.2, 0.2);
	p.CFrame = new CFrame(pos);
	p.Parent = getParent();
	return p;
}

export function randDir(): Vector3 {
	const v = new Vector3(math.random() * 2 - 1, math.random() * 2 - 1, math.random() * 2 - 1);
	if (v.Magnitude < 0.01) return new Vector3(0, 1, 0);
	return v.Unit;
}

// ---------------------------------------------------------------- screen shake / flash

export function shake(amp: number, dur: number): void {
	if (amp >= shakeAmp * (shakeLeft / shakeTotal)) {
		shakeAmp = amp;
		shakeLeft = dur;
		shakeTotal = dur;
	}
}

/** Camera offset for this frame (real dt). The stage camera adds it to its CFrame. */
export function shakeOffset(dt: number): Vector3 {
	if (shakeLeft <= 0) return new Vector3(0, 0, 0);
	shakeLeft -= dt;
	const k = math.max(0, shakeLeft / shakeTotal);
	const a = shakeAmp * k;
	return new Vector3((math.random() - 0.5) * 2 * a, (math.random() - 0.5) * 2 * a, (math.random() - 0.5) * 2 * a);
}

function ensureFlash(): Frame | undefined {
	if (flashFrame !== undefined && flashFrame.Parent !== undefined) return flashFrame;
	const playerGui = Players.LocalPlayer.FindFirstChild("PlayerGui");
	if (playerGui === undefined) return undefined;
	const gui = new Instance("ScreenGui");
	gui.Name = "ShowroomFlash";
	gui.IgnoreGuiInset = true;
	gui.ResetOnSpawn = false;
	gui.DisplayOrder = 60;
	gui.Parent = playerGui;
	const f = new Instance("Frame");
	f.Size = UDim2.fromScale(1, 1);
	f.BorderSizePixel = 0;
	f.BackgroundTransparency = 1;
	f.Active = false;
	f.Parent = gui;
	flashGui = gui;
	flashFrame = f;
	return f;
}

/** Full-screen colour flash: starts at `startTransparency` and fades out over `dur` scaled seconds. */
export function flash(color: Color3, startTransparency: number, dur: number): void {
	const f = ensureFlash();
	if (f === undefined) return;
	const start = math.max(startTransparency, 0.6);
	flashToken += 1;
	const mine = flashToken;
	f.BackgroundColor3 = color;
	f.BackgroundTransparency = start;
	// Real-time fade (never stuck by time scale); latest flash wins; always ends fully transparent.
	task.spawn(() => {
		const t0 = os.clock();
		const len = math.max(dur, 0.15) + 0.2;
		while (mine === flashToken) {
			const a = math.min(1, (os.clock() - t0) / len);
			f.BackgroundTransparency = lerp(start, 1, a);
			if (a >= 1) break;
			task.wait();
		}
		if (mine === flashToken) f.BackgroundTransparency = 1;
	});
}

export function destroyFlash(): void {
	if (flashGui !== undefined) {
		flashGui.Destroy();
		flashGui = undefined;
		flashFrame = undefined;
	}
}

// ---------------------------------------------------------------- particles

export interface BurstOpts {
	size?: number;
	speed?: number;
	life?: number;
	gravity?: number;
	texture?: string;
	spread?: number;
}

/** Colour burst: a ParticleEmitter that emits `count` particles at once. */
export function burst(pos: Vector3, color: Color3, count: number, o?: BurstOpts): void {
	const host = anchorPart(pos);
	const e = new Instance("ParticleEmitter");
	const size = o?.size ?? 1.6;
	const life = o?.life ?? 0.8;
	const speed = o?.speed ?? 30;
	e.Texture = o?.texture ?? SPARKLE_TEXTURE;
	e.Color = new ColorSequence(color);
	e.LightEmission = 1;
	e.Size = new NumberSequence([new NumberSequenceKeypoint(0, size), new NumberSequenceKeypoint(1, 0)]);
	e.Transparency = new NumberSequence([new NumberSequenceKeypoint(0, 0), new NumberSequenceKeypoint(0.7, 0.2), new NumberSequenceKeypoint(1, 1)]);
	e.Lifetime = new NumberRange(life * 0.6, life);
	e.Speed = new NumberRange(math.min(speed * 0.4, speed), math.max(speed * 0.4, speed));
	e.SpreadAngle = new Vector2(o?.spread ?? 180, o?.spread ?? 180);
	e.Acceleration = new Vector3(0, -(o?.gravity ?? 20), 0);
	e.Rotation = new NumberRange(0, 360);
	e.RotSpeed = new NumberRange(-200, 200);
	e.Drag = 2;
	e.Rate = 0;
	e.TimeScale = timeScale;
	e.Parent = host;
	e.Emit(count);
	expire(host, life);
}

/** Fire / smoke style burst helpers built on burst(). */
export function fireBurst(pos: Vector3, count: number, size = 3): void {
	burst(pos, Color3.fromRGB(255, 150, 40), count, { texture: FIRE_TEXTURE, size, life: 1, speed: 14, gravity: -8, spread: 60 });
}

export function dust(pos: Vector3, count: number, size = 4): void {
	burst(pos, Color3.fromRGB(215, 200, 170), count, { texture: SMOKE_TEXTURE, size, life: 1.1, speed: 16, gravity: -2, spread: 90 });
}

/** Neon shards flying outward under gravity. */
export function shards(pos: Vector3, color: Color3, n: number, speed: number, size = 0.7, life = 0.9): void {
	const items: Part[] = [];
	const vels: Vector3[] = [];
	for (let i = 0; i < n; i++) {
		const p = block(new CFrame(pos), new Vector3(size * 0.5, size * 0.5, size * 2), color);
		items.push(p);
		const d = randDir();
		vels.push(d.mul(speed * (0.4 + math.random() * 0.6)).add(new Vector3(0, speed * 0.25, 0)));
	}
	spawn(() => {
		const pts: Vector3[] = [];
		for (let i = 0; i < n; i++) pts.push(pos);
		run(life, (a, dt) => {
			for (let i = 0; i < n; i++) {
				vels[i] = vels[i].add(new Vector3(0, -60 * dt, 0));
				pts[i] = pts[i].add(vels[i].mul(dt));
				const part = items[i];
				part.CFrame = CFrame.lookAt(pts[i], pts[i].add(vels[i].Magnitude > 0.1 ? vels[i] : new Vector3(0, 0, 1)));
				const s = size * (1 - a);
				part.Size = new Vector3(s * 0.5, s * 0.5, s * 2.5);
			}
		});
		for (const p of items) p.Destroy();
	});
}

/** Flat neon ring (hollow) built from segments. Expands r0 -> r1 in `dur`, holds for `hold`, then fades in 0.3. */
export function ring(pos: Vector3, r0: number, r1: number, dur: number, color: Color3, width = 1.2, height = 0.6, hold = 0): void {
	const n = 28;
	const segs: Part[] = [];
	for (let i = 0; i < n; i++) {
		segs.push(block(new CFrame(pos), new Vector3(width, height, 1), color));
	}
	spawn(() => {
		const place = (r: number, tr: number): void => {
			const arc = ((2 * math.pi * math.max(r, 0.2)) / n) * 1.12;
			for (let i = 0; i < n; i++) {
				const ang = (i / n) * 2 * math.pi;
				const p = pos.add(new Vector3(math.cos(ang) * r, 0, math.sin(ang) * r));
				const tangent = new Vector3(-math.sin(ang), 0, math.cos(ang));
				segs[i].CFrame = CFrame.lookAt(p, p.add(tangent));
				segs[i].Size = new Vector3(width, height, arc);
				segs[i].Transparency = tr;
			}
		};
		run(dur, (a) => {
			place(lerp(r0, r1, easeOut(a)), a * a * (hold > 0 ? 0.1 : 0.7));
		});
		if (hold > 0) {
			run(hold, (a) => {
				place(r1, 0.1 + math.sin(a * 18) * 0.12);
			});
		}
		run(0.3, (a) => {
			place(r1, lerp(hold > 0 ? 0.1 : 0.7, 1, a));
		});
		for (const s of segs) s.Destroy();
	});
}

/** Glowing ground disc with a pulsing transparency and an outline ring; lasts `dur`, fades in / out. */
export function groundCircle(pos: Vector3, radius: number, dur: number, color: Color3, outline = true): void {
	const disc = glow(
		Enum.PartType.Cylinder,
		new CFrame(pos.add(new Vector3(0, 0.15, 0))).mul(CFrame.Angles(0, 0, math.pi / 2)),
		new Vector3(0.2, radius * 2, radius * 2),
		color,
		1,
	);
	if (outline) ring(pos.add(new Vector3(0, 0.2, 0)), radius, radius, 0.01, color, 1.2, 0.4, dur);
	spawn(() => {
		run(dur, (a) => {
			const fade = math.min(1, a * 6) * math.min(1, (1 - a) * 6);
			disc.Transparency = 1 - fade * (0.55 + 0.15 * math.sin(a * 30));
		});
		disc.Destroy();
	});
}

/** Vertical neon column (pillar of light) that pulses and fades. */
export function pillar(pos: Vector3, radius: number, height: number, dur: number, color: Color3): void {
	const cf = new CFrame(pos.add(new Vector3(0, height / 2, 0))).mul(CFrame.Angles(0, 0, math.pi / 2));
	const outer = glow(Enum.PartType.Cylinder, cf, new Vector3(height, radius * 2, radius * 2), color, 0.4);
	const core = glow(Enum.PartType.Cylinder, cf, new Vector3(height, radius, radius), Color3.fromRGB(255, 255, 255), 0.05);
	spawn(() => {
		run(dur, (a) => {
			const k = 1 + 0.15 * math.sin(a * 40);
			const shrink = a < 0.7 ? 1 : 1 - (a - 0.7) / 0.3;
			outer.Size = new Vector3(height, radius * 2 * k * shrink, radius * 2 * k * shrink);
			core.Size = new Vector3(height, radius * k * shrink, radius * k * shrink);
		});
		outer.Destroy();
		core.Destroy();
	});
}

/** Straight neon beam between two points; width pulses then thins out. */
export function laser(p0: Vector3, p1: Vector3, color: Color3, width: number, dur: number): void {
	const len = p1.sub(p0).Magnitude;
	if (len < 0.1) return;
	const mid = p0.add(p1).div(2);
	const cf = CFrame.lookAt(mid, p1).mul(CFrame.Angles(0, math.pi / 2, 0));
	const outer = glow(Enum.PartType.Cylinder, cf, new Vector3(len, width, width), color, 0.3);
	const core = glow(Enum.PartType.Cylinder, cf, new Vector3(len, width * 0.45, width * 0.45), Color3.fromRGB(255, 255, 255), 0);
	spawn(() => {
		run(dur, (a) => {
			const w = width * (1 + 0.2 * math.sin(a * 50)) * (1 - a * a);
			outer.Size = new Vector3(len, w, w);
			core.Size = new Vector3(len, w * 0.45, w * 0.45);
		});
		outer.Destroy();
		core.Destroy();
	});
}

/** Jagged lightning bolt between two points (re-rolled a few times so it crackles). */
export function bolt(p0: Vector3, p1: Vector3, color: Color3, width: number, dur: number, jitter = 1.6, segments = 9): void {
	const segs: Part[] = [];
	for (let i = 0; i < segments; i++) segs.push(block(new CFrame(p0), new Vector3(width, width, 1), color));
	const dir = p1.sub(p0);
	spawn(() => {
		const rolls = 4;
		let last = -1;
		run(dur, (a) => {
			const roll = math.floor(a * rolls);
			if (roll === last) return;
			last = roll;
			const pts: Vector3[] = [p0];
			for (let i = 1; i < segments; i++) {
				pts.push(p0.add(dir.mul(i / segments)).add(randDir().mul(jitter)));
			}
			pts.push(p1);
			for (let i = 0; i < segments; i++) {
				const a0 = pts[i];
				const a1 = pts[i + 1];
				const l = a1.sub(a0).Magnitude;
				segs[i].CFrame = CFrame.lookAt(a0.add(a1).div(2), a1);
				segs[i].Size = new Vector3(width, width, l + 0.1);
				segs[i].Transparency = a * 0.6;
			}
		});
		for (const s of segs) s.Destroy();
	});
}

// ---------------------------------------------------------------- flipbooks

export interface FlipbookOpts {
	color?: Color3;
	/** Final size = size * grow (default 1.3). */
	grow?: number;
	/** Force the BillboardGui fallback. */
	billboard?: boolean;
}

/** Plays a flipbook sheet once at `cf` (position used) in `size` studs for `dur` scaled seconds. Particle version when the sheet is full, billboard otherwise. */
export function flipbook(sheet: FxSheet, cf: CFrame, sizeIn: number, dur: number, o?: FlipbookOpts): void {
	const size = math.min(sizeIn, MAX_SHEET); // huge sheets show their rectangular edges / white out the screen
	const full = sheet.frames >= sheet.grid * sheet.grid;
	if (o?.billboard === true || !full) {
		flipbookBillboard(sheet, cf.Position, size, dur, o);
		return;
	}
	const host = anchorPart(cf.Position);
	const e = new Instance("ParticleEmitter");
	e.Texture = sheet.id;
	e.FlipbookLayout = sheet.grid >= 4 ? Enum.ParticleFlipbookLayout.Grid4x4 : Enum.ParticleFlipbookLayout.Grid2x2;
	e.FlipbookMode = Enum.ParticleFlipbookMode.OneShot;
	e.LightEmission = 1;
	e.Color = new ColorSequence(o?.color ?? Color3.fromRGB(255, 255, 255));
	e.Size = new NumberSequence([new NumberSequenceKeypoint(0, size * 0.7), new NumberSequenceKeypoint(1, size * (o?.grow ?? 1.3))]);
	e.Transparency = new NumberSequence([new NumberSequenceKeypoint(0, 0), new NumberSequenceKeypoint(0.8, 0), new NumberSequenceKeypoint(1, 0.6)]);
	e.Lifetime = new NumberRange(dur, dur);
	e.Speed = new NumberRange(0, 0);
	e.Rate = 0;
	e.Rotation = new NumberRange(0, 0);
	e.TimeScale = timeScale;
	e.Parent = host;
	e.Emit(1);
	expire(host, dur);
}

/** Camera-facing BillboardGui that steps ImageRectOffset through the sheet (assumes a SHEET_PX square sheet). */
export function flipbookBillboard(sheet: FxSheet, pos: Vector3, size: number, dur: number, o?: FlipbookOpts): void {
	const host = anchorPart(pos);
	const bb = new Instance("BillboardGui");
	bb.Size = UDim2.fromScale(size, size);
	bb.AlwaysOnTop = false;
	bb.LightInfluence = 0;
	bb.Parent = host;
	const img = new Instance("ImageLabel");
	img.BackgroundTransparency = 1;
	img.Size = UDim2.fromScale(1, 1);
	img.Image = sheet.id;
	img.ImageColor3 = o?.color ?? Color3.fromRGB(255, 255, 255);
	const cell = SHEET_PX / sheet.grid;
	img.ImageRectSize = new Vector2(cell, cell);
	img.Parent = bb;
	const grow = o?.grow ?? 1.3;
	spawn(() => {
		run(dur, (a) => {
			const idx = math.min(sheet.frames - 1, math.floor(a * sheet.frames));
			img.ImageRectOffset = new Vector2((idx % sheet.grid) * cell, math.floor(idx / sheet.grid) * cell);
			const s = size * lerp(0.7, grow, easeOut(a));
			bb.Size = UDim2.fromScale(s, s);
			img.ImageTransparency = a > 0.8 ? (a - 0.8) * 3 : 0;
		});
		host.Destroy();
	});
	expire(host, dur);
}

// ---------------------------------------------------------------- trail

/** Adds a bright Trail between two attachments on `part` (local offsets). Disabled until enabled. */
export function makeTrail(part: BasePart, localBase: Vector3, localTip: Vector3, color: Color3): Trail {
	const a0 = new Instance("Attachment");
	a0.Name = "TrailBase";
	a0.Position = localBase;
	a0.Parent = part;
	const a1 = new Instance("Attachment");
	a1.Name = "TrailTip";
	a1.Position = localTip;
	a1.Parent = part;
	const t = new Instance("Trail");
	t.Attachment0 = a0;
	t.Attachment1 = a1;
	t.Color = new ColorSequence(color, Color3.fromRGB(255, 255, 255));
	t.Transparency = new NumberSequence([new NumberSequenceKeypoint(0, 0.05), new NumberSequenceKeypoint(1, 1)]);
	t.LightEmission = 1;
	t.Lifetime = 0.3 / timeScale;
	t.FaceCamera = true;
	t.MinLength = 0.05;
	t.Enabled = false;
	t.Parent = part;
	return t;
}

/** Text billboard above a position (e.g. "!" alarm, "沉默"). Destroyed after `dur` scaled seconds. */
export function label(pos: Vector3, text: string, color: Color3, sizeStuds: number, dur: number): void {
	const host = anchorPart(pos);
	const bb = new Instance("BillboardGui");
	bb.Size = UDim2.fromScale(sizeStuds * 2, sizeStuds);
	bb.AlwaysOnTop = true;
	bb.Parent = host;
	const t = new Instance("TextLabel");
	t.BackgroundTransparency = 1;
	t.Size = UDim2.fromScale(1, 1);
	t.Text = text;
	t.Font = Enum.Font.GothamBlack;
	t.TextScaled = true;
	t.TextColor3 = color;
	t.TextStrokeTransparency = 0;
	t.TextStrokeColor3 = Color3.fromRGB(0, 0, 0);
	t.Parent = bb;
	spawn(() => {
		run(dur, (a) => {
			const pop = a < 0.15 ? 0.5 + a * 3.3 : 1;
			bb.Size = UDim2.fromScale(sizeStuds * 2 * pop, sizeStuds * pop);
			host.CFrame = new CFrame(pos.add(new Vector3(0, a * 2, 0)));
			t.TextTransparency = a > 0.7 ? (a - 0.7) / 0.3 : 0;
			t.TextStrokeTransparency = t.TextTransparency;
		});
		host.Destroy();
	});
	expire(host, dur);
}

/** Orbiting neon spiral (tornado / petals): n small parts winding around a moving centre. */
export function spiral(centerFn: () => Vector3, radius: number, height: number, color: Color3, dur: number, n = 48, partSize = 0.9, flat = false, color2?: Color3): void {
	const parts: Part[] = [];
	for (let i = 0; i < n; i++) {
		const c = color2 !== undefined && i % 2 === 1 ? color2 : color;
		const size = flat ? new Vector3(partSize * 1.6, partSize * 0.15, partSize) : new Vector3(partSize, partSize, partSize);
		parts.push(block(new CFrame(centerFn()), size, c));
	}
	spawn(() => {
		run(dur, (a) => {
			const c = centerFn();
			const grow = math.min(1, a * 5) * math.min(1, (1 - a) * 4);
			for (let i = 0; i < n; i++) {
				const frac = i / n;
				const ang = a * 14 + frac * 11;
				const r = radius * (0.25 + 0.75 * frac) * grow;
				const p = c.add(new Vector3(math.cos(ang) * r, frac * height * grow, math.sin(ang) * r));
				parts[i].CFrame = new CFrame(p).mul(CFrame.Angles(ang, ang * 0.7, 0));
			}
		});
		for (const p of parts) p.Destroy();
	});
}
