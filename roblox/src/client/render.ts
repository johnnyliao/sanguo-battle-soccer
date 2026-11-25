// Client-side 3D renderer. Builds player / ball / zone instances from server snapshots and draws them
// about 100 ms behind the newest snapshot, interpolated by tick. Call update(dt) from RenderStepped.
import { Country, SetupPlayer, Setup, SnapBall, SnapPlayer, SnapZone, Snapshot, STUDS_PER_PX, TICK_RATE, simToWorld } from "shared/net";
import { colourOf } from "./world";
import { SPRITES, SpriteSheet, animFor } from "./sprites";

/** Render this many ticks (100 ms at 60 Hz) behind the newest snapshot. */
const INTERP_DELAY_TICKS = 6;
/** Beyond this drift (ticks) the render clock jumps to its target instead of easing. */
const DRIFT_SNAP_TICKS = 12;
/** A player/ball moving more than this many sim px between snapshots is not lerped (teleport / kickoff reset). */
const SNAP_DIST_PX = 60;
/** Snapshots kept in the buffer. */
const MAX_BUFFER = 90;
/** Horizontal foot speed (studs/s) above which a sprite character plays its run animation. */
const SPRITE_MOVE_SPEED = 3;

const TEAM_COLOUR: Record<Country, number> = { shu: 0x2fa84f, wei: 0x2f6fd8, wu: 0xd83a2f };
const SIZE_HEIGHT: Record<string, number> = { S: 4.5, M: 5.5, L: 6.5 };
const BODY_W = 2.4;
const BODY_D = 1.6;
const HEAD_D = 1.6;
const BALL_R = 0.8;
const GK_SHADE = 0.65;
const HEAD_SHADE = 1.35;
const HUMAN_RING_COLOUR = 0xffd700;
const BALL_TRAIL_COLOUR = 0xffb020;
const ZONE_COLOUR: Record<string, number> = { ice: 0x9fdcff, gust: 0xff8ac8, portal: 0x9b59ff, eastwind: 0xb8f5b0 };
const PATCH_OFFSETS: Vector3[] = [new Vector3(0.74, 0, 0), new Vector3(0, 0.74, 0), new Vector3(-0.3, -0.25, 0.66)];

const Workspace = game.GetService("Workspace");

interface PlayerView {
	model: Model;
	body: Part;
	head: Part;
	aura: Part;
	shadow: Part;
	ring: Part;
	glow: Highlight;
	barBack: Frame;
	barFill: Frame;
	height: number;
	fx: number;
	fz: number;
	/** Set only for characters that have a sprite sheet; the colour block is then hidden. */
	sprite: SpriteView | undefined;
}

interface SpriteView {
	sheet: SpriteSheet;
	scale: number; // studs per sheet px
	anchor: Part;
	bill: BillboardGui;
	img: ImageLabel;
	shown: string; // image asset currently on the label
	animName: string;
	animStart: number; // os.clock() when animName started
	lastFoot: Vector3 | undefined;
	lastClock: number;
}

interface BallView {
	part: Part;
	patches: Part[];
	shadow: Part;
	trail: Trail;
}

interface ZoneView {
	disc: Part;
	boat: Part;
	bow: Part;
	horse: Part;
	horseHead: Part;
	wave: Part;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function distPx(a: SnapBall | SnapPlayer, b: SnapBall | SnapPlayer): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	const dz = a.z - b.z;
	return math.sqrt(dx * dx + dy * dy + dz * dz);
}

function auraColour(sp: string): Color3 {
	if (sp === "rampage") return colourOf(0xff3b30);
	if (sp === "sail") return colourOf(0x4fc3f7);
	if (sp === "ride") return colourOf(0x8d6e63);
	return colourOf(0xffd700);
}

function staminaColour(st: number): Color3 {
	if (st > 0.6) return colourOf(0x3ddc4f);
	if (st >= 0.3) return colourOf(0xffd23a);
	return colourOf(0xff3b30);
}

function makePart(parent: Instance, name: string, shape: Enum.PartType, size: Vector3, colour: Color3, transparency: number): Part {
	const p = new Instance("Part");
	p.Name = name;
	p.Shape = shape;
	p.Anchored = true;
	p.CanCollide = false;
	p.CanQuery = false;
	p.CanTouch = false;
	p.Size = size;
	p.Color = colour;
	p.Transparency = transparency;
	p.Parent = parent;
	return p;
}

/** Flat ground disc (cylinder laid down: its axis is X, rotated to Y). */
function groundCF(x: number, y: number, z: number): CFrame {
	return new CFrame(x, y, z).mul(CFrame.Angles(0, 0, math.pi / 2));
}

/** Invisible anchor part plus a camera-facing BillboardGui showing the sheet's current cell. */
function makeSprite(model: Model, sheet: SpriteSheet): SpriteView {
	const scale = STUDS_PER_PX * sheet.displayHeight / sheet.frameH;
	const anchor = makePart(model, "SpriteAnchor", Enum.PartType.Block, new Vector3(0.2, 0.2, 0.2), colourOf(0x000000), 1);

	const bill = new Instance("BillboardGui");
	bill.Name = "SpriteBillboard";
	bill.Size = new UDim2(sheet.frameW * scale, 0, sheet.frameH * scale, 0);
	bill.AlwaysOnTop = false;
	bill.LightInfluence = 0;
	bill.MaxDistance = 1000;
	bill.Adornee = anchor;
	bill.Parent = anchor;

	const img = new Instance("ImageLabel");
	img.Size = UDim2.fromScale(1, 1);
	img.BackgroundTransparency = 1;
	img.ScaleType = Enum.ScaleType.Stretch;
	img.Image = sheet.image;
	img.ImageRectSize = new Vector2(sheet.frameW, sheet.frameH);
	img.Parent = bill;

	return { sheet, scale, anchor, bill, img, shown: sheet.image, animName: "", animStart: 0, lastFoot: undefined, lastClock: 0 };
}

/** Positions the sprite at the foot point, picks the mirrored sheet by facing, and advances the animation frame. */
function drawSprite(sp: SpriteView, foot: Vector3, fx: number, act: string, spMode: string, now: number): void {
	let moving = false;
	const last = sp.lastFoot;
	if (last !== undefined) {
		const dt = now - sp.lastClock;
		if (dt > 0) {
			const dx = foot.X - last.X;
			const dz = foot.Z - last.Z;
			moving = math.sqrt(dx * dx + dz * dz) / dt > SPRITE_MOVE_SPEED;
		}
	}
	sp.lastFoot = foot;
	sp.lastClock = now;

	const sheet = sp.sheet;
	const flipped = fx < 0;
	const image = flipped ? sheet.imageFlip : sheet.image;
	const ax = flipped ? sheet.frameW - sheet.anchorX : sheet.anchorX;
	if (sp.shown !== image) {
		sp.img.Image = image;
		sp.shown = image;
	}
	sp.anchor.CFrame = new CFrame(foot);
	sp.bill.StudsOffset = new Vector3((sheet.frameW / 2 - ax) * sp.scale, (sheet.anchorY - sheet.frameH / 2) * sp.scale, 0);

	let name = animFor(act, spMode, moving);
	let def = sheet.anims[name];
	if (def === undefined) {
		name = "idle";
		def = sheet.anims[name];
	}
	if (name !== sp.animName) {
		sp.animName = name;
		sp.animStart = now;
	}
	const n = def.frames.size();
	const raw = math.floor((now - sp.animStart) * def.fps);
	const k = def.loop ? raw % n : math.min(raw, n - 1);
	const idx = def.frames[k];
	sp.img.ImageRectOffset = new Vector2((idx % sheet.cols) * sheet.frameW, math.floor(idx / sheet.cols) * sheet.frameH);
}

export class Renderer {
	private actors: Instance;
	private setup: Setup | undefined;
	private buffer: Snapshot[] = [];
	private renderTick = 0;
	private clockReady = false;
	private players: PlayerView[] = [];
	private ball: BallView | undefined;
	private zones: ZoneView[] = [];
	private focusX = 0;
	private ballSpin = 0;
	private lastBallPos = new Vector3(0, 0, 0);

	constructor() {
		let folder = Workspace.FindFirstChild("Actors");
		if (folder === undefined) {
			const created = new Instance("Folder");
			created.Name = "Actors";
			created.Parent = Workspace;
			folder = created;
		}
		this.actors = folder;
	}

	/** (Re)creates the 10 player actors and the ball. Old actors are removed. */
	onSetup(s: Setup): void {
		this.actors.ClearAllChildren();
		this.setup = s;
		this.buffer = [];
		this.clockReady = false;
		this.players = [];
		for (const p of s.players) {
			this.players[p.idx] = this.makePlayer(p, s);
		}
		this.ball = this.makeBall();
		this.zones = [];
	}

	/** Pushes a snapshot into the interpolation buffer. */
	onSnapshot(s: Snapshot): void {
		this.buffer.push(s);
		while (this.buffer.size() > MAX_BUFFER) {
			this.buffer.shift();
		}
	}

	/** Interpolates the buffered snapshots and applies them to the instances. Call every frame. */
	update(dt: number): void {
		const n = this.buffer.size();
		if (this.setup === undefined || n === 0) return;
		const latest = this.buffer[n - 1];
		const target = latest.tick - INTERP_DELAY_TICKS;
		if (!this.clockReady) {
			this.renderTick = target;
			this.clockReady = true;
		}
		this.renderTick += dt * TICK_RATE;
		const drift = this.renderTick - target;
		if (drift > DRIFT_SNAP_TICKS || drift < -DRIFT_SNAP_TICKS) {
			this.renderTick = target;
		} else {
			this.renderTick += (target - this.renderTick) * math.min(1, dt * 2);
		}
		this.renderTick = math.max(this.buffer[0].tick, math.min(latest.tick, this.renderTick));
		while (this.buffer.size() > 2 && this.buffer[1].tick <= this.renderTick) {
			this.buffer.shift();
		}

		const [a, b, t] = this.segment(this.renderTick);
		const cur = t < 0.5 ? a : b;
		this.drawPlayers(a, b, t);
		this.drawBall(a, b, t);
		this.drawZones(cur.zones);
	}

	/** Interpolated ball world X (studs), used by the camera. */
	getFocusX(): number {
		return this.focusX;
	}

	private segment(rt: number): [Snapshot, Snapshot, number] {
		const buf = this.buffer;
		const last = buf.size() - 1;
		if (rt <= buf[0].tick) return [buf[0], buf[0], 0];
		if (rt >= buf[last].tick) return [buf[last], buf[last], 0];
		for (let i = 0; i < last; i++) {
			const b = buf[i + 1];
			if (b.tick >= rt) {
				const a = buf[i];
				const span = b.tick - a.tick;
				return [a, b, span > 0 ? (rt - a.tick) / span : 0];
			}
		}
		return [buf[last], buf[last], 0];
	}

	private drawPlayers(a: Snapshot, b: Snapshot, t: number): void {
		const now = os.clock();
		const useB = t >= 0.5;
		for (let i = 0; i < this.players.size(); i++) {
			const v = this.players[i];
			const pa = a.players[i];
			const pb = b.players[i];
			if (v === undefined || pa === undefined || pb === undefined) continue;
			const cur = useB ? pb : pa;
			const snapped = distPx(pa, pb) > SNAP_DIST_PX;

			let x = cur.x;
			let y = cur.y;
			let z = cur.z;
			let st = cur.st;
			if (!snapped) {
				x = lerp(pa.x, pb.x, t);
				y = lerp(pa.y, pb.y, t);
				z = lerp(pa.z, pb.z, t);
				st = lerp(pa.st, pb.st, t);
				const fx = lerp(pa.fx, pb.fx, t);
				const fy = lerp(pa.fy, pb.fy, t);
				if (fx * fx + fy * fy > 1e-6) {
					const len = math.sqrt(fx * fx + fy * fy);
					v.fx = fx / len;
					v.fz = fy / len;
				}
			} else if (cur.fx * cur.fx + cur.fy * cur.fy > 1e-6) {
				const len = math.sqrt(cur.fx * cur.fx + cur.fy * cur.fy);
				v.fx = cur.fx / len;
				v.fz = cur.fy / len;
			}

			const foot = simToWorld(x, y, z);
			const act = cur.a;
			const lying = act === "down";
			let lean = 0;
			if (act === "punch" || act === "tackle") lean = -0.35;
			else if (act === "dive") lean = -1.2;
			const shake = act === "hitstun" || act === "fear" ? math.sin(now * 40) * 0.35 : 0;

			const base = CFrame.lookAt(foot, foot.add(new Vector3(v.fx, 0, v.fz))).mul(new CFrame(shake, 0, 0));
			const bodyLen = v.height - 1.8;
			const bodyCF = lying
				? base.mul(new CFrame(0, 0.8, 0)).mul(CFrame.Angles(math.pi / 2, 0, 0))
				: base.mul(CFrame.Angles(lean, 0, 0)).mul(new CFrame(0, 0.6 + bodyLen / 2, 0));
			v.body.CFrame = bodyCF;
			const spr = v.sprite;
			if (spr !== undefined) {
				v.head.CFrame = new CFrame(foot.add(new Vector3(0, spr.sheet.anchorY * spr.scale, 0)));
				drawSprite(spr, foot, v.fx, act, cur.sp, now);
			} else {
				v.head.CFrame = bodyCF.mul(new CFrame(0, bodyLen / 2 + 0.4, 0));
			}
			v.aura.CFrame = bodyCF;
			v.aura.Transparency = cur.sp === "" ? 1 : 0.6;
			v.aura.Color = auraColour(cur.sp);
			v.glow.Enabled = cur.inv;
			v.shadow.CFrame = groundCF(foot.X, 0.08, foot.Z);
			v.ring.CFrame = groundCF(foot.X, 0.12, foot.Z);

			const fill = math.max(0, math.min(1, st));
			v.barFill.Size = UDim2.fromScale(fill, 1);
			v.barFill.BackgroundColor3 = staminaColour(fill);
		}
	}

	private drawBall(a: Snapshot, b: Snapshot, t: number): void {
		const bv = this.ball;
		if (bv === undefined) return;
		const cur = t < 0.5 ? a.ball : b.ball;
		const pa = a.ball;
		const pb = b.ball;
		let pos: Vector3;
		if (distPx(pa, pb) > SNAP_DIST_PX) {
			pos = simToWorld(cur.x, cur.y, cur.z);
		} else {
			pos = simToWorld(lerp(pa.x, pb.x, t), lerp(pa.y, pb.y, t), lerp(pa.z, pb.z, t));
		}
		const moved = pos.sub(this.lastBallPos).Magnitude;
		this.lastBallPos = pos;
		this.ballSpin += moved / BALL_R;

		const centre = new CFrame(pos.X, pos.Y + BALL_R, pos.Z).mul(CFrame.Angles(0, this.ballSpin, 0));
		bv.part.CFrame = centre;
		for (let i = 0; i < bv.patches.size(); i++) {
			bv.patches[i].CFrame = centre.mul(new CFrame(PATCH_OFFSETS[i]));
		}
		bv.shadow.CFrame = groundCF(pos.X, 0.08, pos.Z);
		bv.trail.Enabled = cur.special !== "";
		this.focusX = pos.X;
	}

	private drawZones(zs: SnapZone[]): void {
		while (this.zones.size() < zs.size()) {
			this.zones.push(this.makeZone());
		}
		for (let i = 0; i < this.zones.size(); i++) {
			const v = this.zones[i];
			const z = zs[i];
			if (z === undefined) {
				this.hideZone(v);
			} else {
				this.showZone(v, z);
			}
		}
	}

	private hideZone(v: ZoneView): void {
		v.disc.Transparency = 1;
		v.boat.Transparency = 1;
		v.bow.Transparency = 1;
		v.horse.Transparency = 1;
		v.horseHead.Transparency = 1;
		v.wave.Transparency = 1;
	}

	private showZone(v: ZoneView, z: SnapZone): void {
		this.hideZone(v);
		const cx = z.x * STUDS_PER_PX;
		const cz = z.y * STUDS_PER_PX;
		const r = z.r * STUDS_PER_PX;
		const dir = z.dir === 0 ? 1 : z.dir;
		if (z.k === "arrowship") {
			v.boat.Size = new Vector3(3.2, 1.4, math.max(2 * r, 6));
			v.boat.CFrame = new CFrame(cx, 0.7, cz);
			v.boat.Transparency = 0;
			v.bow.Size = new Vector3(1.6, 1.4, 1.6);
			v.bow.CFrame = new CFrame(cx + dir * 2.1, 0.7, cz);
			v.bow.Transparency = 0;
		} else if (z.k === "rider") {
			v.horse.CFrame = new CFrame(cx, 1.8, cz);
			v.horse.Transparency = 0;
			v.horseHead.CFrame = new CFrame(cx + dir * 1.8, 2.5, cz);
			v.horseHead.Transparency = 0;
		} else if (z.k === "wave") {
			v.wave.Size = new Vector3(0.6, 2.4, math.max(2 * r, 8));
			v.wave.CFrame = new CFrame(cx, 1.2, cz);
			v.wave.Transparency = 0.2;
		} else {
			const d = math.max(r, 0.5) * 2;
			v.disc.Size = new Vector3(0.1, d, d);
			v.disc.CFrame = groundCF(cx, 0.12, cz);
			v.disc.Color = colourOf(ZONE_COLOUR[z.k] ?? 0xffffff);
			v.disc.Transparency = 0.5;
		}
	}

	private makePlayer(p: SetupPlayer, s: Setup): PlayerView {
		const country: Country = p.team === 0 ? s.home : s.away;
		const hex = TEAM_COLOUR[country];
		const gk = p.role === "GK";
		const height = SIZE_HEIGHT[p.size] ?? 5.5;
		const bodyLen = height - 1.8;
		const human = p.idx === s.humanIdx;

		const model = new Instance("Model");
		model.Name = `Player${p.idx}`;
		const body = makePart(model, "Body", Enum.PartType.Block, new Vector3(BODY_W, bodyLen, BODY_D), colourOf(hex, gk ? GK_SHADE : 1), 0);
		const head = makePart(model, "Head", Enum.PartType.Ball, new Vector3(HEAD_D, HEAD_D, HEAD_D), colourOf(hex, HEAD_SHADE), 0);
		const aura = makePart(model, "Aura", Enum.PartType.Ball, new Vector3(3.4, 3.4, 3.4), colourOf(0xffd700), 1);
		const shadow = makePart(model, "Shadow", Enum.PartType.Cylinder, new Vector3(0.1, 2.6, 2.6), colourOf(0x000000), 0.5);
		const ring = makePart(model, "Ring", Enum.PartType.Cylinder, new Vector3(0.12, 3.6, 3.6), colourOf(HUMAN_RING_COLOUR), human ? 0.3 : 1);

		const sheet = SPRITES[p.charId];
		let sprite: SpriteView | undefined;
		if (sheet !== undefined) {
			body.Transparency = 1;
			head.Transparency = 1;
			sprite = makeSprite(model, sheet);
		}

		const glow = new Instance("Highlight");
		glow.Name = "Glow";
		glow.FillColor = colourOf(0xffd700);
		glow.OutlineColor = colourOf(0xffd700);
		glow.FillTransparency = 0.6;
		glow.OutlineTransparency = 0;
		glow.Enabled = false;
		glow.Adornee = model;
		glow.Parent = model;

		const tag = new Instance("BillboardGui");
		tag.Name = "Tag";
		tag.Size = UDim2.fromOffset(120, 36);
		tag.StudsOffset = new Vector3(0, 1.4, 0);
		tag.AlwaysOnTop = true;
		tag.Adornee = head;
		tag.Parent = head;

		const name = new Instance("TextLabel");
		name.Size = UDim2.fromOffset(120, 18);
		name.BackgroundTransparency = 1;
		name.Text = p.name;
		name.TextColor3 = colourOf(0xffffff);
		name.TextStrokeTransparency = 0;
		name.TextStrokeColor3 = colourOf(0x000000);
		name.Font = Enum.Font.GothamBold;
		name.TextSize = 14;
		name.Parent = tag;

		const barBack = new Instance("Frame");
		barBack.Position = UDim2.fromOffset(30, 22);
		barBack.Size = UDim2.fromOffset(60, 6);
		barBack.BackgroundColor3 = colourOf(0x000000);
		barBack.BackgroundTransparency = 0.4;
		barBack.BorderSizePixel = 0;
		barBack.Visible = p.team === 0;
		barBack.Parent = tag;

		const barFill = new Instance("Frame");
		barFill.Size = UDim2.fromScale(1, 1);
		barFill.BackgroundColor3 = staminaColour(1);
		barFill.BorderSizePixel = 0;
		barFill.Parent = barBack;

		model.PrimaryPart = body;
		model.Parent = this.actors;
		return { model, body, head, aura, shadow, ring, glow, barBack, barFill, height, fx: 1, fz: 0, sprite };
	}

	private makeBall(): BallView {
		const part = makePart(this.actors, "Ball", Enum.PartType.Ball, new Vector3(BALL_R * 2, BALL_R * 2, BALL_R * 2), colourOf(0xf4f4f4), 0);
		const patches: Part[] = [];
		for (let i = 0; i < PATCH_OFFSETS.size(); i++) {
			patches.push(makePart(this.actors, `BallPatch${i}`, Enum.PartType.Ball, new Vector3(0.5, 0.5, 0.5), colourOf(0x222222), 0));
		}
		const shadow = makePart(this.actors, "BallShadow", Enum.PartType.Cylinder, new Vector3(0.1, 1.6, 1.6), colourOf(0x000000), 0.5);

		const a0 = new Instance("Attachment");
		a0.Position = new Vector3(0, 0.5, 0);
		a0.Parent = part;
		const a1 = new Instance("Attachment");
		a1.Position = new Vector3(0, -0.5, 0);
		a1.Parent = part;
		const trail = new Instance("Trail");
		trail.Attachment0 = a0;
		trail.Attachment1 = a1;
		trail.Lifetime = 0.3;
		trail.Color = new ColorSequence(colourOf(BALL_TRAIL_COLOUR));
		trail.Transparency = new NumberSequence(0.2);
		trail.Enabled = false;
		trail.Parent = part;

		this.lastBallPos = new Vector3(0, 0, 0);
		return { part, patches, shadow, trail };
	}

	private makeZone(): ZoneView {
		const disc = makePart(this.actors, "ZoneDisc", Enum.PartType.Cylinder, new Vector3(0.1, 1, 1), colourOf(0xffffff), 1);
		const boat = makePart(this.actors, "ZoneBoat", Enum.PartType.Block, new Vector3(3.2, 1.4, 6), colourOf(0x6b4423), 1);
		const bow = makePart(this.actors, "ZoneBow", Enum.PartType.Block, new Vector3(1.6, 1.4, 1.6), colourOf(0x6b4423), 1);
		const horse = makePart(this.actors, "ZoneHorse", Enum.PartType.Block, new Vector3(3, 1.6, 1.2), colourOf(0x4a2e15), 1);
		const horseHead = makePart(this.actors, "ZoneHorseHead", Enum.PartType.Block, new Vector3(0.9, 1, 0.9), colourOf(0x4a2e15), 1);
		const wave = makePart(this.actors, "ZoneWave", Enum.PartType.Block, new Vector3(0.6, 2.4, 8), colourOf(0xbff6ff), 1);
		wave.Material = Enum.Material.Neon;
		return { disc, boat, bow, horse, horseHead, wave };
	}
}
