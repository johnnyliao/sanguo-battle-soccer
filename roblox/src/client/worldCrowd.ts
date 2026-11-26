// Tiered stands filled with Three-Kingdoms soldier spectators (coloured by faction), flag bearers on the top tier,
// and a cheer (hop) animation. Pure decoration; the near side (+Z) stays open for the camera.
// Parts budget (FIELD_LEN 360, FIELD_WID 78 studs): every soldier has 11 parts (10 body parts + 1 variant prop).
// Far stand 5 tiers x 147 soldiers, each end 5 tiers x 33 soldiers = 1065 soldiers x 11 = 11715; tiers 30; flags 29 x 3 = 87.
// Total = 11832 (<= 12000).
// Mesh path (ReplicatedStorage.CrowdTemplates with shu/wei/wu MeshParts present): one MeshPart per soldier,
// SEAT_SPACING_MESH 2.4 -> 1150 soldier parts; with tiers 30 and flags 87 the crowd is 1267 parts.
import { FIELD_LEN, FIELD_WID, colourOf, part } from "./worldParts";

const TIERS = 5;
const TIER_DEPTH = 3;
const TIER_BASE = 2.5;
const TIER_RISE = 2.2;
const SEAT_SPACING = 2.6; // fallback path (primitive soldiers)
const SEAT_SPACING_MESH = 2.4; // mesh path (one MeshPart per soldier)
const MESH_HEIGHT = 3.4;
const MESH_SCALE_MIN = 0.93;
const MESH_SCALE_MAX = 1.07;
const MESH_YAW = (12 * math.pi) / 180;
const LEG_H = 1.2; // legs part height; the template pivot is the legs centre
const SEED = 2026;
const FACTIONS = 3;
const VARIANTS = 3; // one template per faction and variant
const VARIANT_SPEAR = 0;
const VARIANT_SHIELD = 1;
const VARIANT_OFFICER = 2;
const SPEAR_CHANCE = 0.45;
const SHIELD_CHANCE = 0.35; // officers take the remaining 20%
const HOP_H = 0.8;
const HOP_SPEED = 10;
const FLAG_SPACING = 18;
const FLAG_POLE_H = 8;

// Faction index: 0 = 蜀 (green), 1 = 魏 (blue), 2 = 吳 (red).
const FACTION_COLOURS = [0x2e8b3a, 0x2e5fb3, 0xb3261e];
const RISER_A = colourOf(0x6b5f52);
const RISER_B = colourOf(0x5e5347);
const TRIM_COLOUR = colourOf(0x7a5230);
const GOLD = colourOf(0xd9a21b);
const DARK_METAL = colourOf(0x3a3a3a);
const TROUSERS = colourOf(0x2b2b2b);
const SKIN = colourOf(0xe0b48a);
const PAULDRON = colourOf(0x8c6a2c, 0.7);
const HELMET_METAL = colourOf(0x6e6e6e);
const LACQUER = colourOf(0x2f2622);
const RED_PLUME = colourOf(0xc0392b);
const WOOD = colourOf(0x6b4a2b);

let rng = new Random(SEED);
let crowdParts: BasePart[] = [];
let baseCFrames: CFrame[] = [];
let phases: number[] = [];
let cheerEnd = 0;
let heartbeat: RBXScriptConnection | undefined;
let meshTemplates: MeshPart[] | undefined; // per faction (shu, wei, wu); undefined = primitive fallback

/** Position from along/perp/height coordinates (along = X for far stand, Z for ends). */
function at(alongX: boolean, a: number, p: number, y: number): Vector3 {
	return alongX ? new Vector3(a, y, p) : new Vector3(p, y, a);
}

/** Crowd body part inside a template. Templates are cloned, so CastShadow is cleared here for every clone. */
function bodyPart(m: Model, name: string, size: Vector3, cf: CFrame, colour: Color3): Part {
	const p = part(m, name, size, cf, colour);
	p.CastShadow = false;
	return p;
}

/**
 * One soldier template per faction and variant, facing -Z (toward the pitch). PrimaryPart = Legs (centre at LEG_H/2).
 * Base (10 parts): Legs, Torso (faction robe), Plate (bronze chest armour), Belt (gold), Pauldron, ArmL, ArmR,
 * Head (SpecialMesh Head + face Decal), Helmet (flattened sphere mesh), Plume (red; gold for officers).
 * Variant prop (1 part): spear pole (spearman, raised right arm), round shield (shieldman, left arm), cape (officer).
 */
function buildTemplate(faction: number, variant: number): Model {
	const m = new Instance("Model");
	m.Name = "Soldier";
	const robe = colourOf(FACTION_COLOURS[faction]);
	const legs = bodyPart(m, "Legs", new Vector3(1.0, LEG_H, 0.7), new CFrame(0, LEG_H / 2, 0), TROUSERS);
	const torso = bodyPart(m, "Torso", new Vector3(1.2, 1.1, 0.8), new CFrame(0, 1.7, 0), robe);
	torso.Material = Enum.Material.Fabric;
	const plate = bodyPart(m, "Plate", new Vector3(0.62, 0.7, 0.15), new CFrame(0, 1.78, -0.45), LACQUER);
	plate.Material = Enum.Material.Metal;
	bodyPart(m, "Belt", new Vector3(1.25, 0.16, 0.85), new CFrame(0, 1.3, 0), GOLD);
	const pauldron = bodyPart(m, "Pauldron", new Vector3(1.7, 0.32, 0.9), new CFrame(0, 2.15, 0), PAULDRON);
	pauldron.Material = Enum.Material.Metal;
	const armL = bodyPart(m, "ArmL", new Vector3(0.34, 1.2, 0.34), new CFrame(-0.74, 1.6, 0), robe);
	armL.Material = Enum.Material.Fabric;
	const armR = bodyPart(m, "ArmR", new Vector3(0.34, 1.2, 0.34), new CFrame(0.74, 1.6, 0), robe);
	armR.Material = Enum.Material.Fabric;
	const head = bodyPart(m, "Head", new Vector3(0.7, 0.7, 0.7), new CFrame(0, 2.6, 0), SKIN);
	const headMesh = new Instance("SpecialMesh");
	headMesh.MeshType = Enum.MeshType.Head;
	headMesh.Parent = head;
	const face = new Instance("Decal");
	face.Name = "Face";
	face.Texture = "rbxasset://textures/face.png";
	face.Face = Enum.NormalId.Front;
	face.Parent = head;
	const helmet = bodyPart(m, "Helmet", new Vector3(0.84, 0.62, 0.84), new CFrame(0, 2.9, 0.04), HELMET_METAL);
	helmet.Material = Enum.Material.Metal;
	const helmetMesh = new Instance("SpecialMesh");
	helmetMesh.MeshType = Enum.MeshType.Sphere;
	helmetMesh.Parent = helmet;
	bodyPart(m, "Plume", new Vector3(0.12, 0.45, 0.3), new CFrame(0, 3.38, 0.05), variant === VARIANT_OFFICER ? GOLD : RED_PLUME);

	if (variant === VARIANT_SPEAR) {
		armR.CFrame = new CFrame(0.74, 1.75, -0.3).mul(CFrame.Angles(-0.35, 0, 0));
		const spear = bodyPart(m, "Spear", new Vector3(0.12, 3.0, 0.12), new CFrame(0.9, 1.9, -0.4), WOOD);
		spear.Material = Enum.Material.Wood;
	} else if (variant === VARIANT_SHIELD) {
		const shield = bodyPart(m, "Shield", new Vector3(0.1, 1.0, 1.0), new CFrame(-1.0, 1.45, -0.4).mul(CFrame.Angles(0, math.pi / 2, 0)), robe);
		shield.Shape = Enum.PartType.Cylinder;
	} else {
		const cape = bodyPart(m, "Cape", new Vector3(1.3, 1.9, 0.08), new CFrame(0, 1.45, 0.48), colourOf(FACTION_COLOURS[faction], 0.55));
		cape.Material = Enum.Material.Fabric;
	}
	m.PrimaryPart = legs;
	return m;
}

/** Faction index for a seat at fraction f (0..1) along the stand. mode: 0 = far (blocks), 1 = left end, 2 = right end. */
function factionAt(mode: number, f: number): number {
	if (mode === 0) return math.min(2, math.floor(f * 3));
	if (mode === 1) return rng.NextInteger(0, 1);
	return rng.NextInteger(1, 2);
}

function spawnSoldier(folder: Instance, template: Model, alongX: boolean, along: number, perp: number, top: number): void {
	const m = template.Clone();
	const pos = at(alongX, along, perp, top + LEG_H / 2);
	m.PivotTo(CFrame.lookAt(pos, new Vector3(FIELD_LEN / 2, pos.Y, FIELD_WID / 2)));
	m.Parent = folder;
	const phase = rng.NextNumber(0, math.pi * 2);
	for (const child of m.GetChildren()) {
		if (child.IsA("BasePart")) {
			crowdParts.push(child);
			baseCFrames.push(child.CFrame);
			phases.push(phase);
		}
	}
}

/** Loads the shu/wei/wu MeshParts from ReplicatedStorage.CrowdTemplates, scaled to MESH_HEIGHT. undefined if any is missing. */
function loadMeshTemplates(): MeshPart[] | undefined {
	const rs = game.GetService("ReplicatedStorage");
	const folder = rs.FindFirstChild("CrowdTemplates") ?? rs.WaitForChild("CrowdTemplates", 5);
	if (folder === undefined) return undefined;
	const out: MeshPart[] = [];
	for (const name of ["shu", "wei", "wu"]) {
		const src = folder.FindFirstChild(name);
		if (src === undefined || !src.IsA("MeshPart")) return undefined;
		const t = src.Clone();
		t.Size = src.Size.mul(MESH_HEIGHT / src.Size.Y);
		t.Anchored = true;
		t.CanCollide = false;
		t.CanQuery = false;
		t.CanTouch = false;
		t.CastShadow = false;
		out.push(t);
	}
	return out;
}

/** One MeshPart soldier: feet on top, facing the pitch like the primitive soldiers, with seeded scale and yaw variation. */
function spawnMeshSoldier(folder: Instance, template: MeshPart, alongX: boolean, along: number, perp: number, top: number): void {
	const p = template.Clone();
	p.Size = template.Size.mul(rng.NextNumber(MESH_SCALE_MIN, MESH_SCALE_MAX));
	const pos = at(alongX, along, perp, top + p.Size.Y / 2);
	const yaw = rng.NextNumber(-MESH_YAW, MESH_YAW);
	p.CFrame = CFrame.lookAt(pos, new Vector3(FIELD_LEN / 2, pos.Y, FIELD_WID / 2)).mul(CFrame.Angles(0, yaw, 0));
	p.Parent = folder;
	crowdParts.push(p);
	baseCFrames.push(p.CFrame);
	phases.push(rng.NextNumber(0, math.pi * 2));
}

function buildStand(folder: Instance, templates: Model[], spacing: number, mode: number, alongX: boolean, centre: number, length: number, edge: number, out: number): void {
	const count = math.floor(length / spacing);
	const step = length / count;
	for (let k = 0; k < TIERS; k++) {
		const top = TIER_BASE + k * TIER_RISE;
		const perp = edge + out * (k * TIER_DEPTH + TIER_DEPTH / 2);
		const front = edge + out * (k * TIER_DEPTH);
		const riser = k % 2 === 0 ? RISER_A : RISER_B;
		if (alongX) {
			part(folder, `Tier${k}`, new Vector3(length, top, TIER_DEPTH), new CFrame(centre, top / 2, perp), riser);
		} else {
			part(folder, `Tier${k}`, new Vector3(TIER_DEPTH, top, length), new CFrame(perp, top / 2, centre), riser);
		}
		const trimSize = alongX ? new Vector3(length, 0.3, 0.4) : new Vector3(0.4, 0.3, length);
		const trimPos = at(alongX, centre, front + out * 0.2, top + 0.15);
		const trim = part(folder, "SeatTrim", trimSize, new CFrame(trimPos), TRIM_COLOUR);
		trim.Material = Enum.Material.WoodPlanks;

		for (let i = 0; i < count; i++) {
			const along = centre - length / 2 + (i + 0.5) * step + (rng.NextNumber() - 0.5) * 0.5;
			const depth = perp + (rng.NextNumber() - 0.5) * 0.3;
			const faction = factionAt(mode, (i + 0.5) / count);
			const roll = rng.NextNumber();
			const variant = roll < SPEAR_CHANCE ? VARIANT_SPEAR : roll < SPEAR_CHANCE + SHIELD_CHANCE ? VARIANT_SHIELD : VARIANT_OFFICER;
			if (meshTemplates !== undefined) {
				spawnMeshSoldier(folder, meshTemplates[faction], alongX, along, depth, top);
			} else {
				spawnSoldier(folder, templates[faction * VARIANTS + variant], alongX, along, depth, top);
			}
		}
	}
}

function buildFlags(folder: Instance, mode: number, alongX: boolean, centre: number, length: number, edge: number, out: number): void {
	const top = TIER_BASE + (TIERS - 1) * TIER_RISE;
	const perp = edge + out * ((TIERS - 1) * TIER_DEPTH + TIER_DEPTH - 0.5);
	const n = math.floor(length / FLAG_SPACING);
	for (let j = 0; j < n; j++) {
		const along = centre - (n * FLAG_SPACING) / 2 + (j + 0.5) * FLAG_SPACING;
		const faction = factionAt(mode, (j + 0.5) / n);
		const pole = part(folder, "FlagPole", new Vector3(0.3, FLAG_POLE_H, 0.3), new CFrame(at(alongX, along, perp, top + FLAG_POLE_H / 2)), DARK_METAL);
		pole.Material = Enum.Material.Metal;
		const bannerSize = alongX ? new Vector3(2.5, 4, 0.1) : new Vector3(0.1, 4, 2.5);
		part(folder, "Banner", bannerSize, new CFrame(at(alongX, along + 1.35, perp, top + 6)), colourOf(FACTION_COLOURS[faction]));
		part(folder, "Finial", new Vector3(0.5, 0.5, 0.5), new CFrame(at(alongX, along, perp, top + FLAG_POLE_H + 0.25)), GOLD);
	}
}

function stopHeartbeat(): void {
	if (heartbeat !== undefined) {
		heartbeat.Disconnect();
		heartbeat = undefined;
	}
}

function onHeartbeat(): void {
	const now = os.clock();
	if (now >= cheerEnd) {
		stopHeartbeat();
		game.Workspace.BulkMoveTo(crowdParts, baseCFrames, Enum.BulkMoveMode.FireCFrameChanged);
		return;
	}
	const cframes: CFrame[] = [];
	for (let i = 0; i < crowdParts.size(); i++) {
		const hop = math.max(0, math.sin(now * HOP_SPEED + phases[i])) * HOP_H;
		cframes.push(new CFrame(0, hop, 0).mul(baseCFrames[i]));
	}
	game.Workspace.BulkMoveTo(crowdParts, cframes, Enum.BulkMoveMode.FireCFrameChanged);
}

/** Builds all stands, soldiers and flags under a Folder named "Crowd" in parent (an existing one is destroyed). */
export function buildCrowd(parent: Instance): void {
	const old = parent.FindFirstChild("Crowd");
	if (old !== undefined) old.Destroy();
	stopHeartbeat();
	cheerEnd = 0;
	crowdParts = [];
	baseCFrames = [];
	phases = [];
	rng = new Random(SEED);
	meshTemplates = loadMeshTemplates();

	const folder = new Instance("Folder");
	folder.Name = "Crowd";
	folder.Parent = parent;

	const templates: Model[] = [];
	if (meshTemplates === undefined) {
		for (let f = 0; f < FACTIONS; f++) {
			for (let v = 0; v < VARIANTS; v++) {
				templates.push(buildTemplate(f, v));
			}
		}
	}
	const spacing = meshTemplates !== undefined ? SEAT_SPACING_MESH : SEAT_SPACING;

	// Far stand (-Z) and both ends; the near side stays open for the camera.
	buildStand(folder, templates, spacing, 0, true, FIELD_LEN / 2, FIELD_LEN + 24, -1.8, -1);
	buildStand(folder, templates, spacing, 1, false, FIELD_WID / 2, FIELD_WID + 8, -8.3, -1);
	buildStand(folder, templates, spacing, 2, false, FIELD_WID / 2, FIELD_WID + 8, FIELD_LEN + 8.3, 1);

	buildFlags(folder, 0, true, FIELD_LEN / 2, FIELD_LEN + 24, -1.8, -1);
	buildFlags(folder, 1, false, FIELD_WID / 2, FIELD_WID + 8, -8.3, -1);
	buildFlags(folder, 2, false, FIELD_WID / 2, FIELD_WID + 8, FIELD_LEN + 8.3, 1);
}

/** Spectators hop for `seconds`. Calling again while cheering extends the end time. No-op if the crowd is not built. */
export function cheer(seconds = 2): void {
	if (crowdParts.size() === 0) return;
	cheerEnd = math.max(cheerEnd, os.clock() + seconds);
	if (heartbeat !== undefined) return;
	heartbeat = game.GetService("RunService").Heartbeat.Connect(() => onHeartbeat());
}
