// Tiered stands filled with Three-Kingdoms soldier spectators (coloured by faction), flag bearers on the top tier,
// and a cheer (hop) animation. Pure decoration; the near side (+Z) stays open for the camera.
// Parts budget (FIELD_LEN 360, FIELD_WID 78 studs): far stand 5 tiers x 160 soldiers, each end 5 tiers x 35 soldiers
// = 1150 soldiers x 5 parts = 5750; risers 2 x 15 = 30; seat trims 15; 29 flags x 3 parts = 87. Total = 5882 (<= 6000).
import { FIELD_LEN, FIELD_WID, colourOf, part } from "./worldParts";

const TIERS = 5;
const TIER_DEPTH = 3;
const TIER_BASE = 2.5;
const TIER_RISE = 2.2;
const SEAT_SPACING = 2.4;
const LEG_H = 1.2; // legs part height; the template pivot is the legs centre
const SEED = 2026;
const SPEAR_CHANCE = 1 / 3;
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

let rng = new Random(SEED);
let crowdParts: BasePart[] = [];
let baseCFrames: CFrame[] = [];
let phases: number[] = [];
let cheerEnd = 0;
let heartbeat: RBXScriptConnection | undefined;

/** Position from along/perp/height coordinates (along = X for far stand, Z for ends). */
function at(alongX: boolean, a: number, p: number, y: number): Vector3 {
	return alongX ? new Vector3(a, y, p) : new Vector3(p, y, a);
}

/**
 * One soldier template per faction, 5 parts: legs (PrimaryPart, centre at LEG_H/2), torso, head, helmet,
 * and an accessory that is a red tassel or, for spear soldiers, a wooden spear (resized per clone).
 */
function buildTemplate(faction: number): Model {
	const m = new Instance("Model");
	m.Name = "Soldier";
	const legs = part(m, "Legs", new Vector3(1.2, LEG_H, 0.8), new CFrame(0, LEG_H / 2, 0), colourOf(0x2b2b2b));
	const torso = part(m, "Torso", new Vector3(1.6, 1.2, 0.9), new CFrame(0, 1.8, 0), colourOf(FACTION_COLOURS[faction]));
	torso.Material = Enum.Material.Fabric;
	part(m, "Head", new Vector3(0.8, 0.7, 0.8), new CFrame(0, 2.7, 0), colourOf(0xe0b48a));
	const helmet = part(m, "Helmet", new Vector3(0.9, 0.35, 0.9), new CFrame(0, 3.2, 0), DARK_METAL);
	helmet.Material = Enum.Material.Metal;
	part(m, "Accessory", new Vector3(0.15, 0.5, 0.3), new CFrame(0, 3.6, 0), colourOf(0xb3261e));
	m.PrimaryPart = legs;
	return m;
}

/** Faction index for a seat at fraction f (0..1) along the stand. mode: 0 = far (blocks), 1 = left end, 2 = right end. */
function factionAt(mode: number, f: number): number {
	if (mode === 0) return math.min(2, math.floor(f * 3));
	if (mode === 1) return rng.NextInteger(0, 1);
	return rng.NextInteger(1, 2);
}

function spawnSoldier(folder: Instance, template: Model, alongX: boolean, along: number, perp: number, top: number, spear: boolean): void {
	const m = template.Clone();
	const acc = m.FindFirstChild("Accessory") as BasePart;
	if (spear) {
		acc.Name = "Spear";
		acc.Size = new Vector3(0.12, 3.2, 0.12);
		acc.CFrame = new CFrame(0.95, 2.2, 0);
		acc.Color = colourOf(0x6b4a2b);
		acc.Material = Enum.Material.Wood;
	}
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

function buildStand(folder: Instance, templates: Model[], mode: number, alongX: boolean, centre: number, length: number, edge: number, out: number): void {
	const count = math.floor(length / SEAT_SPACING);
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
			const spear = rng.NextNumber() < SPEAR_CHANCE;
			spawnSoldier(folder, templates[faction], alongX, along, depth, top, spear);
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

	const folder = new Instance("Folder");
	folder.Name = "Crowd";
	folder.Parent = parent;

	const templates: Model[] = [buildTemplate(0), buildTemplate(1), buildTemplate(2)];

	// Far stand (-Z) and both ends; the near side stays open for the camera.
	buildStand(folder, templates, 0, true, FIELD_LEN / 2, FIELD_LEN + 24, -1.8, -1);
	buildStand(folder, templates, 1, false, FIELD_WID / 2, FIELD_WID + 8, -8.3, -1);
	buildStand(folder, templates, 2, false, FIELD_WID / 2, FIELD_WID + 8, FIELD_LEN + 8.3, 1);

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
