// Lord look effects (R3b-3, 外觀特效): the beast (floating art sprite), the orbit (two
// swords, the halo), the foot effects (dust, sparks, trails, the vortex disc) and the kickoff entrance and goal effects.
// Client only, visual only. Every part is named "LookFx_…", anchored, massless and non-colliding, lives under the lord's
// avatar model (so a model removal clears it) and is placed by CFrame every frame (no welds). Only the local player's own
// lord (full) gets the particles, trails and the entrance / goal effects; other lords get the beast and the orbit only.
// The beast, halo, vortex and trail are 2D art sprites (BillboardGui / SurfaceGui / Trail texture) built in buildBeast() and
// the sprite helpers; their art ids are in artIds.ts (ART4). Sprite sizes follow the lord's height.
import type { LordClass } from "shared/game/data";
import { SLOTS, type LookMap } from "shared/cosmetics";
import * as fx from "./fx";
import { ART4 } from "./artIds";

const Debris = game.GetService("Debris");
const Players = game.GetService("Players");
const Workspace = game.GetService("Workspace");

const PREFIX = "LookFx_";
const SMOKE_TEXTURE = "rbxasset://textures/particles/smoke_main.dds";
const FIRE_TEXTURE = "rbxasset://textures/particles/fire_main.dds";
const SPARKLE_TEXTURE = "rbxasset://textures/particles/sparkles_main.dds";

/** Foot speed (studs/s) above which the foot effects (dust, sparks, trails) run. */
const MOVE_SPEED = 2.5;
/** Beast: height above the head top, bob amplitude (studs), bob rate (rad/s), and the back offset from the lord. */
const BEAST_UP = 2.2;
const BEAST_BOB = 0.5;
const BEAST_BOB_RATE = 1.6;
const BEAST_BACK = 2.6;
const BEAST_TRANSPARENCY = 0.45;
/** Big-roar swell: the beast grows to BEAST_BIG times its size and back within BEAST_BIG_DUR seconds. */
const BEAST_BIG = 1.4;
const BEAST_BIG_DUR = 0.6;
/** Art size reference: the studs of a sprite are given for this lord height and scale with height / REF_HEIGHT. */
const REF_HEIGHT = 8.8;
/** Beast art side (studs at REF_HEIGHT). Halo and vortex disc diameters (studs at REF_HEIGHT). */
const BEAST_SIZE = 5.5;
const HALO_SIZE = 3.4;
const VORTEX_SIZE = 6.5;
/** Orbit: sword radius (studs), spin rate (rad/s), halo spin (rad/s), vortex disc spin (rad/s). */
const ORBIT_R = 2.8;
const ORBIT_SPIN = 2.5;
const HALO_SPIN = 1.2;
const VORTEX_SPIN = 2.0;
/** Entrance flags: count, pole height, rise / hold / sink times (s). */
const FLAG_X = [-6.5, -3.9, -1.3, 1.3, 3.9, 6.5];
const FLAG_POLE = 8;
const FLAG_RISE = 0.4;
const FLAG_HOLD_END = 1.5;
const FLAG_SINK = 0.4;
/** Entrance pillar: length (studs), radius (studs), fall time (s), total time (s). */
const PILLAR_LEN = 60;
const PILLAR_R = 1.3;
const PILLAR_FALL = 0.4;
const PILLAR_DUR = 2;
/** Entrance banner: shown for this many seconds (the fade takes the last 40%). */
const BANNER_DUR = 2;
/** Goal emblem duration (s) and goal dragon flight time (s). */
const EMBLEM_DUR = 2;
const DRAGON_DUR = 2;
const DRAGON_LINKS = 7;

const GOLD = Color3.fromRGB(255, 210, 90);
const WHITE = Color3.fromRGB(255, 255, 255);
const BLACK = Color3.fromRGB(0, 0, 0);
/** Class colour of the glow effects (猛將紅、軍師綠、鐵壁藍). */
const CLASS_GLOW: Record<LordClass, Color3> = {
	mengjiang: Color3.fromRGB(230, 60, 50),
	junshi: Color3.fromRGB(70, 220, 110),
	tiebi: Color3.fromRGB(70, 130, 255),
};
/** Turns a cylinder (axis along its X) so the axis points up (Y); the same turn lays a disc flat. */
const AXIS_TO_UP = CFrame.Angles(0, 0, math.pi / 2);
const BEASTS = ["beast_chihu", "beast_qingluan", "beast_xuangui", "beast_jinlong"];

/** A beast sprite: place() puts it for this frame (foot, lord facing, time, swell scale). */
interface BeastRig {
	place: (foot: Vector3, facing: Vector3, t: number, scale: number) => void;
}

interface Sword {
	blade: Part;
	guard: Part;
}

function v3(x: number, y: number, z: number): Vector3 {
	return new Vector3(x, y, z);
}

function makePart(parent: Instance, name: string, shape: Enum.PartType, size: Vector3, colour: Color3, neon: boolean, transparency: number): Part {
	const p = new Instance("Part");
	p.Name = `${PREFIX}${name}`;
	p.Shape = shape;
	p.Anchored = true;
	p.CanCollide = false;
	p.CanQuery = false;
	p.CanTouch = false;
	p.CastShadow = false;
	p.Massless = true;
	p.Size = size;
	p.Color = colour;
	p.Material = neon ? Enum.Material.Neon : Enum.Material.SmoothPlastic;
	p.Transparency = transparency;
	p.Parent = parent;
	return p;
}

/** Where the beast hovers this frame: above and behind the lord, facing the way he faces, with a slow bob and turn. */
function beastRoot(foot: Vector3, facing: Vector3, height: number, t: number): CFrame {
	const bob = math.sin(t * BEAST_BOB_RATE) * BEAST_BOB;
	const centre = v3(foot.X - facing.X * BEAST_BACK, foot.Y + height + BEAST_UP + bob, foot.Z - facing.Z * BEAST_BACK);
	const ahead = v3(centre.X + facing.X, centre.Y, centre.Z + facing.Z);
	return CFrame.lookAt(centre, ahead).mul(CFrame.Angles(0, math.sin(t * 0.5) * 0.25, 0));
}

/** Pixels per stud at a world point, from the camera's vertical FOV, so a sprite keeps its world size on screen. */
function pixelsPerStud(at: Vector3): number {
	const cam = game.Workspace.CurrentCamera;
	if (cam === undefined) return 40;
	const dist = math.max(0.1, cam.CFrame.Position.sub(at).Magnitude);
	return cam.ViewportSize.Y / (2 * dist * math.tan(math.rad(cam.FieldOfView) / 2));
}

/** A transparent image label that fills its parent (a BillboardGui or SurfaceGui). */
function artLabel(parent: Instance, image: string, transparency: number): ImageLabel {
	const label = new Instance("ImageLabel");
	label.Name = `${PREFIX}Art`;
	label.BackgroundTransparency = 1;
	label.Size = UDim2.fromScale(1, 1);
	label.Image = image;
	label.ImageTransparency = transparency;
	label.ScaleType = Enum.ScaleType.Fit;
	label.Parent = parent;
	return label;
}

/** A flat art plate: a transparent Part with one SurfaceGui per listed face, each showing the art. */
function artPlate(model: Model, name: string, image: string, size: Vector3, faces: Enum.NormalId[], transparency: number): Part {
	const part = makePart(model, name, Enum.PartType.Block, size, WHITE, false, 1);
	for (const face of faces) {
		const gui = new Instance("SurfaceGui");
		gui.Name = `${PREFIX}${name}Gui`;
		gui.Face = face;
		gui.AlwaysOnTop = false;
		gui.LightInfluence = 0;
		gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud;
		gui.PixelsPerStud = 100;
		gui.Parent = part;
		artLabel(gui, image, transparency);
	}
	return part;
}

/**
 * A beast sprite: a transparent anchor under the model with a BillboardGui that always faces the camera. Its pixel size is
 * the art's world size (BEAST_SIZE scaled to the lord's height, times the swell) converted at the anchor's distance.
 */
function beastRig(model: Model, image: string, glow: Color3, height: number): BeastRig {
	const size = (BEAST_SIZE * height) / REF_HEIGHT;
	const anchor = makePart(model, "Beast", Enum.PartType.Block, v3(0.2, 0.2, 0.2), glow, false, 1);
	const light = new Instance("PointLight");
	light.Color = glow;
	light.Range = 10;
	light.Brightness = 0.7;
	light.Parent = anchor;
	const gui = new Instance("BillboardGui");
	gui.Name = `${PREFIX}BeastGui`;
	gui.Adornee = anchor;
	gui.AlwaysOnTop = false;
	gui.LightInfluence = 0;
	gui.Parent = anchor;
	artLabel(gui, image, BEAST_TRANSPARENCY);
	return {
		place: (foot, facing, t, scale) => {
			const root = beastRoot(foot, facing, height, t);
			const px = size * scale * pixelsPerStud(root.Position);
			anchor.CFrame = root;
			gui.Size = UDim2.fromOffset(px, px);
		},
	};
}

/**
 * Builds the beast of a beast part id (beast_chihu / beast_qingluan / beast_xuangui / beast_jinlong) as its ART4 sprite.
 * Each beast hovers above and behind the lord with the same bob and swell.
 */
function buildBeast(model: Model, id: string, height: number): BeastRig | undefined {
	if (id === "beast_chihu") return beastRig(model, ART4.beast_chihu, Color3.fromRGB(255, 60, 50), height);
	if (id === "beast_qingluan") return beastRig(model, ART4.beast_qingluan, Color3.fromRGB(80, 255, 120), height);
	if (id === "beast_xuangui") return beastRig(model, ART4.beast_xuangui, Color3.fromRGB(60, 140, 255), height);
	if (id === "beast_jinlong") return beastRig(model, ART4.beast_jinlong, GOLD, height);
	return undefined;
}

/** Warning banner for the entrance: a big gold line at the top of the screen that fades out. Local player only. */
function showBanner(text: string): void {
	const playerGui = Players.LocalPlayer.FindFirstChild("PlayerGui");
	if (playerGui === undefined) return;
	const gui = new Instance("ScreenGui");
	gui.Name = "LookFxBanner";
	gui.IgnoreGuiInset = true;
	gui.ResetOnSpawn = false;
	gui.DisplayOrder = 55;
	gui.Parent = playerGui;
	const label = new Instance("TextLabel");
	label.Name = "Banner";
	label.AnchorPoint = new Vector2(0.5, 0.5);
	label.Position = UDim2.fromScale(0.5, 0.22);
	label.Size = UDim2.fromScale(0.9, 0.1);
	label.BackgroundTransparency = 1;
	label.Font = Enum.Font.GothamBlack;
	label.TextScaled = true;
	label.TextColor3 = GOLD;
	label.TextStrokeColor3 = BLACK;
	label.TextStrokeTransparency = 0;
	label.Text = text;
	label.Parent = gui;
	Debris.AddItem(gui, BANNER_DUR + 1);
	fx.spawn(() =>
		fx.run(BANNER_DUR, (a) => {
			const k = a < 0.6 ? 0 : (a - 0.6) / 0.4;
			label.TextTransparency = k;
			label.TextStrokeTransparency = k;
		}),
	);
}

function dustEmitter(host: Part): ParticleEmitter {
	const e = new Instance("ParticleEmitter");
	e.Name = `${PREFIX}Dust`;
	e.Texture = SMOKE_TEXTURE;
	e.Color = new ColorSequence(Color3.fromRGB(150, 140, 125));
	e.Size = new NumberSequence([new NumberSequenceKeypoint(0, 1), new NumberSequenceKeypoint(1, 2.6)]);
	e.Transparency = new NumberSequence([new NumberSequenceKeypoint(0, 0.5), new NumberSequenceKeypoint(1, 1)]);
	e.Lifetime = new NumberRange(0.5, 0.8);
	e.Rate = 12;
	e.Speed = new NumberRange(0.5, 1.5);
	e.SpreadAngle = new Vector2(60, 60);
	e.EmissionDirection = Enum.NormalId.Top;
	e.Enabled = false;
	e.Parent = host;
	return e;
}

function sparkEmitter(host: Part, name: string, colour: Color3, size: number, speed: NumberRange, lifetime: NumberRange): ParticleEmitter {
	const e = new Instance("ParticleEmitter");
	e.Name = `${PREFIX}${name}`;
	e.Texture = SPARKLE_TEXTURE;
	e.Color = new ColorSequence(colour);
	e.Size = new NumberSequence(size);
	e.LightEmission = 1;
	e.Lifetime = lifetime;
	e.Rate = 12;
	e.Speed = speed;
	e.SpreadAngle = new Vector2(50, 50);
	e.Enabled = false;
	e.Parent = host;
	return e;
}

/** Ring of fire bursts round the lord (entrance_fire): eight hosts, each one one-off burst. */
function fireRing(model: Model, foot: Vector3): void {
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * math.pi * 2;
		const host = makePart(model, "FireHost", Enum.PartType.Block, v3(0.2, 0.2, 0.2), BLACK, false, 1);
		host.CFrame = new CFrame(foot.X + math.cos(a) * 3, foot.Y + 1.5, foot.Z + math.sin(a) * 3);
		const e = new Instance("ParticleEmitter");
		e.Name = `${PREFIX}Fire`;
		e.Texture = FIRE_TEXTURE;
		e.Color = new ColorSequence(Color3.fromRGB(255, 140, 40));
		e.Size = new NumberSequence(1.4);
		e.Lifetime = new NumberRange(0.5, 0.9);
		e.Speed = new NumberRange(3, 6);
		e.SpreadAngle = new Vector2(70, 70);
		e.LightEmission = 0.6;
		e.Rate = 0;
		e.Parent = host;
		e.Emit(6);
		Debris.AddItem(host, 2);
	}
}

/** Six flags of the class colour rise behind the lord, stay 1.5 s and sink (entrance_flags). */
function flagRow(model: Model, glow: Color3, getFoot: () => Vector3, getFacing: () => Vector3): void {
	const parts: { pole: Part; cloth: Part; x: number }[] = [];
	for (let i = 0; i < FLAG_X.size(); i++) {
		const pole = makePart(model, `FlagPole${i}`, Enum.PartType.Block, v3(0.3, FLAG_POLE, 0.3), Color3.fromRGB(90, 60, 30), false, 0);
		const cloth = makePart(model, `Flag${i}`, Enum.PartType.Block, v3(2.6, 2.2, 0.15), glow, false, 0);
		parts.push({ pole, cloth, x: FLAG_X[i] });
	}
	fx.spawn(() =>
		fx.run(FLAG_HOLD_END + FLAG_SINK, (a, _dt) => {
			const t = a * (FLAG_HOLD_END + FLAG_SINK);
			let up = 1;
			if (t < FLAG_RISE) up = t / FLAG_RISE;
			else if (t > FLAG_HOLD_END) up = math.max(0, 1 - (t - FLAG_HOLD_END) / FLAG_SINK);
			const foot = getFoot();
			const f = getFacing();
			const base = CFrame.lookAt(v3(foot.X - f.X * 4, foot.Y, foot.Z - f.Z * 4), v3(foot.X - f.X * 4 + f.X, foot.Y, foot.Z - f.Z * 4 + f.Z));
			const drop = -FLAG_POLE * (1 - up);
			for (const p of parts) {
				p.pole.CFrame = base.mul(new CFrame(p.x, drop + FLAG_POLE / 2, 0));
				p.cloth.CFrame = base.mul(new CFrame(p.x + 1.3, drop + FLAG_POLE - 1.6, 0));
			}
		}),
	);
	for (const p of parts) {
		Debris.AddItem(p.pole, FLAG_HOLD_END + FLAG_SINK + 1);
		Debris.AddItem(p.cloth, FLAG_HOLD_END + FLAG_SINK + 1);
	}
}

export class LookFx {
	private readonly model: Model;
	private readonly name: string;
	private readonly height: number;
	private readonly full: boolean;
	private readonly lordClass: LordClass;
	private readonly worn = new Set<string>();
	private beast: BeastRig | undefined;
	private beastLeft = 0;
	private swords: Sword[] = [];
	private halo: Part | undefined;
	private vortex: Part | undefined;
	private footPart: Part | undefined;
	private footEmitters: ParticleEmitter[] = [];
	private footTrails: Trail[] = [];
	private movingOn = false;
	private clock = 0;
	private lastFoot: Vector3 | undefined;
	private lastFacing = v3(1, 0, 0);

	constructor(model: Model, look: LookMap, lordClass: LordClass, full: boolean, name: string, height: number) {
		this.model = model;
		this.name = name;
		this.height = height;
		this.full = full;
		this.lordClass = lordClass;
		for (const slot of SLOTS) {
			const id = look[slot];
			if (id !== undefined && id !== "none") this.worn.add(id);
		}
		const glow = CLASS_GLOW[lordClass];

		for (const id of BEASTS) {
			if (this.worn.has(id)) this.beast = buildBeast(model, id, height);
		}
		if (this.worn.has("orbit_weapons")) {
			for (let i = 0; i < 2; i++) {
				const blade = makePart(model, `Sword${i}Blade`, Enum.PartType.Block, v3(0.2, 3.2, 0.12), Color3.fromRGB(214, 218, 226), false, 0);
				const guard = makePart(model, `Sword${i}Guard`, Enum.PartType.Block, v3(0.7, 0.14, 0.2), GOLD, false, 0);
				this.swords.push({ blade, guard });
			}
		}
		if (this.worn.has("orbit_halo")) {
			const d = (HALO_SIZE * height) / REF_HEIGHT;
			this.halo = artPlate(model, "Halo", ART4.halo, v3(d, 0.1, d), [Enum.NormalId.Top, Enum.NormalId.Bottom], 0.1);
		}
		if (!full) return;

		const wantsFoot =
			this.worn.has("trail_dust") || this.worn.has("trail_sparks") || this.worn.has("trail_light") || this.worn.has("trail_dragonscale");
		if (wantsFoot) {
			const foot = makePart(model, "Foot", Enum.PartType.Block, v3(0.2, 0.2, 0.2), BLACK, false, 1);
			this.footPart = foot;
			if (this.worn.has("trail_dust")) this.footEmitters.push(dustEmitter(foot));
			if (this.worn.has("trail_sparks")) {
				this.footEmitters.push(sparkEmitter(foot, "Sparks", Color3.fromRGB(255, 150, 50), 0.5, new NumberRange(3, 5), new NumberRange(0.3, 0.5)));
			}
			if (this.worn.has("trail_dragonscale")) {
				this.footEmitters.push(sparkEmitter(foot, "GoldDust", GOLD, 0.6, new NumberRange(1, 2), new NumberRange(0.6, 1)));
				const scaleTrail = fx.makeTrail(foot, v3(-1.2, 0, 0), v3(1.2, 0, 0), GOLD);
				scaleTrail.Texture = ART4.fx_dragonscale;
				scaleTrail.TextureMode = Enum.TextureMode.Stretch;
				this.footTrails.push(scaleTrail);
			}
			if (this.worn.has("trail_light")) {
				this.footTrails.push(fx.makeTrail(foot, v3(-1.2, 0, 0), v3(1.2, 0, 0), glow));
			}
		}
		if (this.worn.has("trail_vortex")) {
			const d = (VORTEX_SIZE * height) / REF_HEIGHT;
			this.vortex = artPlate(model, "Vortex", ART4.fx_vortex, v3(d, 0.1, d), [Enum.NormalId.Top], 0.5);
		}
	}

	/** Every frame (render.ts drawPlayers): foot position (world studs), facing (any length) and the frame time. */
	frame(dt: number, foot: Vector3, facing: Vector3): void {
		this.clock += dt;
		let speed = 0;
		if (this.lastFoot !== undefined && dt > 0) speed = foot.sub(this.lastFoot).Magnitude / dt;
		this.lastFoot = foot;
		if (facing.Magnitude > 0.01) this.lastFacing = facing.Unit;
		const t = this.clock;

		let scale = 1;
		if (this.beastLeft > 0) {
			this.beastLeft = math.max(0, this.beastLeft - dt);
			const k = 1 - this.beastLeft / BEAST_BIG_DUR;
			scale = 1 + (BEAST_BIG - 1) * math.sin(math.pi * k);
		}
		this.beast?.place(foot, this.lastFacing, t, scale);

		for (let i = 0; i < this.swords.size(); i++) {
			const a = t * ORBIT_SPIN + i * math.pi;
			const base = new CFrame(foot.X + math.cos(a) * ORBIT_R, foot.Y + this.height * 0.5, foot.Z + math.sin(a) * ORBIT_R);
			this.swords[i].blade.CFrame = base;
			this.swords[i].guard.CFrame = base.mul(new CFrame(0, -1.6, 0));
		}
		if (this.halo !== undefined) {
			this.halo.CFrame = new CFrame(foot.X, foot.Y + this.height + 0.7, foot.Z).mul(CFrame.Angles(0, t * HALO_SPIN, 0));
		}
		if (this.vortex !== undefined) {
			this.vortex.CFrame = new CFrame(foot.X, foot.Y + 0.2, foot.Z).mul(CFrame.Angles(0, t * VORTEX_SPIN, 0));
		}
		if (this.footPart !== undefined) {
			this.footPart.CFrame = new CFrame(foot.X, foot.Y + 0.3, foot.Z);
			const moving = speed > MOVE_SPEED;
			if (moving !== this.movingOn) {
				this.movingOn = moving;
				for (const e of this.footEmitters) e.Enabled = moving;
				for (const tr of this.footTrails) tr.Enabled = moving;
			}
		}
	}

	/** The lord's special starts (render.ts): the beast swells. */
	special(): void {
		this.beastLeft = BEAST_BIG_DUR;
	}

	/** Kickoff entrance (the first kickoff of the match, local lord only). The camera pull is done by the caller. */
	entrance(): void {
		if (!this.full || this.lastFoot === undefined) return;
		const foot = this.lastFoot;
		if (this.worn.has("entrance_roar")) {
			this.special();
			fx.shake(0.3, 0.5);
		}
		if (this.worn.has("entrance_fire")) fireRing(this.model, foot);
		if (this.worn.has("entrance_flags")) {
			flagRow(
				this.model,
				CLASS_GLOW[this.lordClass],
				() => this.lastFoot ?? foot,
				() => this.lastFacing,
			);
		}
		if (this.worn.has("entrance_pillar")) {
			this.pillar(foot);
			showBanner(`大將軍統領 ${this.name} 登場！`);
		}
	}

	/** Goal by the lord's team (render.ts): emblem over the lord; the dragon flies from one pitch end to the other. */
	goal(from: Vector3, to: Vector3): void {
		if (!this.full) return;
		if (this.worn.has("goal_emblem")) this.emblem();
		if (this.worn.has("goal_dragon")) this.dragon(from, to);
	}

	private pillar(foot: Vector3): void {
		const col = makePart(this.model, "EntrancePillar", Enum.PartType.Cylinder, v3(PILLAR_LEN, PILLAR_R * 2, PILLAR_R * 2), GOLD, true, 0);
		const ring = makePart(this.model, "EntranceRing", Enum.PartType.Cylinder, v3(0.2, 5, 5), GOLD, true, 0);
		fx.spawn(() =>
			fx.run(PILLAR_DUR, (a) => {
				const t = a * PILLAR_DUR;
				const f = this.lastFoot ?? foot;
				const drop = math.min(1, t / PILLAR_FALL);
				const centre = PILLAR_LEN / 2 + 40 * (1 - drop);
				const tr = t > PILLAR_DUR - 0.6 ? (t - (PILLAR_DUR - 0.6)) / 0.6 : 0;
				col.CFrame = new CFrame(f.X, f.Y + centre, f.Z).mul(AXIS_TO_UP);
				col.Transparency = tr;
				ring.CFrame = new CFrame(f.X, f.Y + 0.2, f.Z).mul(AXIS_TO_UP);
				ring.Transparency = math.max(0, 1 - a * 1.5);
			}),
		);
		Debris.AddItem(col, PILLAR_DUR + 1);
		Debris.AddItem(ring, PILLAR_DUR + 1);
	}

	private emblem(): void {
		const frame = makePart(this.model, "EmblemFrame", Enum.PartType.Cylinder, v3(0.2, 6.6, 6.6), WHITE, true, 0);
		const disc = makePart(this.model, "EmblemDisc", Enum.PartType.Cylinder, v3(0.3, 5.2, 5.2), CLASS_GLOW[this.lordClass], true, 0);
		fx.spawn(() =>
			fx.run(EMBLEM_DUR, (a) => {
				const f = this.lastFoot ?? v3(0, 0, 0);
				const s = 0.4 + 1.2 * fx.easeOut(a);
				const centre = new CFrame(f.X, f.Y + this.height + 4.5, f.Z).mul(AXIS_TO_UP);
				frame.Size = v3(0.2, 6.6 * s, 6.6 * s);
				disc.Size = v3(0.3, 5.2 * s, 5.2 * s);
				frame.CFrame = centre;
				disc.CFrame = centre;
				frame.Transparency = a;
				disc.Transparency = a;
			}),
		);
		Debris.AddItem(frame, EMBLEM_DUR + 1);
		Debris.AddItem(disc, EMBLEM_DUR + 1);
	}

	private dragon(from: Vector3, to: Vector3): void {
		const links: Part[] = [];
		for (let i = 0; i < DRAGON_LINKS; i++) {
			links.push(makePart(this.model, `DragonLink${i}`, Enum.PartType.Ball, v3(1.6, 1.6, 1.6), GOLD, true, 0));
		}
		const trail = fx.makeTrail(links[0], v3(0, 0.8, 0), v3(0, -0.8, 0), GOLD);
		trail.Enabled = true;
		fx.spawn(() =>
			fx.run(DRAGON_DUR, (a) => {
				for (let i = 0; i < links.size(); i++) {
					const lag = a - i * 0.03;
					const u = math.max(0, math.min(1, lag));
					const p = from.Lerp(to, u);
					const wave = math.sin(u * math.pi * 4) * 1.2;
					links[i].CFrame = new CFrame(p.X, p.Y + 8 + wave, p.Z);
					links[i].Transparency = lag < 0 ? 1 : 0;
				}
			}),
		);
		for (const l of links) Debris.AddItem(l, DRAGON_DUR + 1);
	}
}

/** Builds the look effects of one lord (a rig even when the look has no effect parts). full = the local player's own lord. */
export function createLookFx(model: Model, look: LookMap, lordClass: LordClass, full: boolean, name: string, height: number): LookFx {
	return new LookFx(model, look, lordClass, full, name, height);
}
