// Static 3D pitch for the 2.5D soccer match: grass, lines, goals, walls, stands, lighting.
// buildWorld() is idempotent: it destroys the old "Pitch" folder before building a new one.
// Coordinates: sim px * STUDS_PER_PX. Sim x -> World X (0..FIELD_LEN studs), sim y -> World Z (0..FIELD_WID), height -> Y.
import { STUDS_PER_PX } from "shared/net";
import { FIELD_D } from "shared/game/sim/constants";
import { colourOf, FIELD_LEN, FIELD_WID, part } from "./worldParts";
import { buildCrowd } from "./worldCrowd";
import { buildDecor, setupLighting } from "./worldDecor";

export { colourOf } from "./worldParts";

const GOAL_MID_PX = FIELD_D / 2;
const GOAL_HALF_W_PX = 40;
const GOAL_H_PX = 36;
const GOAL_DEPTH_PX = 24;
const KEEPER_LINE_PX = 140;
const KEEPER_HALF_D_PX = 40;

const MOUTH_Z0 = (GOAL_MID_PX - GOAL_HALF_W_PX) * STUDS_PER_PX;
const MOUTH_Z1 = (GOAL_MID_PX + GOAL_HALF_W_PX) * STUDS_PER_PX;
const GOAL_H = GOAL_H_PX * STUDS_PER_PX;
const GOAL_DEPTH = GOAL_DEPTH_PX * STUDS_PER_PX;
const KEEPER_X = KEEPER_LINE_PX * STUDS_PER_PX;
const KEEPER_Z0 = (GOAL_MID_PX - KEEPER_HALF_D_PX) * STUDS_PER_PX;
const KEEPER_Z1 = (GOAL_MID_PX + KEEPER_HALF_D_PX) * STUDS_PER_PX;

const LINE_W = 0.35;
const LINE_COLOUR = colourOf(0xf5f5f0);
const GRASS_A = colourOf(0x4a9e3f);
const GRASS_B = colourOf(0x418f3a);
const GOLD = colourOf(0xd9a21b);
const RED = colourOf(0xb3261e);
const WALL_RED = colourOf(0x8a2a22);
const WOOD_LOG = colourOf(0x7a5230);
const WOOD_BEAM = colourOf(0x5a3d24);
const WOOD_STAKE = colourOf(0x6b4a2b);
const NET_COLOUR = colourOf(0xf2f2f2);
const NET_STEP = 1.2;
const NET_T = 0.08;
const NET_PANEL_T = 0.2;
const NET_PANEL_TRANSPARENCY = 0.9;


/** Thin white line on the grass between two ground points (axis-aligned, in studs). */
function line(parent: Instance, x1: number, z1: number, x2: number, z2: number): void {
	const size = new Vector3(math.abs(x2 - x1) + LINE_W, 0.05, math.abs(z2 - z1) + LINE_W);
	const l = part(parent, "Line", size, new CFrame((x1 + x2) / 2, 0.03, (z1 + z2) / 2), LINE_COLOUR);
	l.Material = Enum.Material.SmoothPlastic;
}

/** Wedge part (sharp edge along the part's local -Z), anchored and non-colliding like part(). */
function wedge(parent: Instance, name: string, size: Vector3, cf: CFrame, colour: Color3): WedgePart {
	const w = new Instance("WedgePart");
	w.Name = name;
	w.Anchored = true;
	w.CanCollide = false;
	w.CanQuery = false;
	w.CanTouch = false;
	w.Size = size;
	w.CFrame = cf;
	w.Color = colour;
	w.Parent = parent;
	return w;
}

function buildPitch(pitch: Instance): void {
	const ground = part(pitch, "Ground", new Vector3(FIELD_LEN + 180, 1, FIELD_WID + 160), new CFrame(FIELD_LEN / 2, -0.6, FIELD_WID / 2), colourOf(0x8b6b45)); // top at -0.1, below the stripes (avoid z-fighting)
	ground.Material = Enum.Material.Ground;

	const stripeW = FIELD_LEN / 12;
	for (let i = 0; i < 12; i++) {
		const colour = i % 2 === 0 ? GRASS_A : GRASS_B;
		const stripe = part(pitch, `Stripe${i}`, new Vector3(stripeW, 0.1, FIELD_WID), new CFrame(stripeW * (i + 0.5), -0.05, FIELD_WID / 2), colour);
		stripe.Material = Enum.Material.Grass;
	}

	// Touchlines and goal lines (goal lines are open across the goal mouth).
	line(pitch, 0, 0, FIELD_LEN, 0);
	line(pitch, 0, FIELD_WID, FIELD_LEN, FIELD_WID);
	line(pitch, 0, 0, 0, MOUTH_Z0);
	line(pitch, 0, MOUTH_Z1, 0, FIELD_WID);
	line(pitch, FIELD_LEN, 0, FIELD_LEN, MOUTH_Z0);
	line(pitch, FIELD_LEN, MOUTH_Z1, FIELD_LEN, FIELD_WID);
	line(pitch, FIELD_LEN / 2, 0, FIELD_LEN / 2, FIELD_WID);

	// Centre circle (white ring + green inner disc) and spot.
	const centreR = 40 * STUDS_PER_PX;
	const ring = part(pitch, "CentreRing", new Vector3(0.05, centreR * 2, centreR * 2), new CFrame(FIELD_LEN / 2, 0.03, FIELD_WID / 2).mul(CFrame.Angles(0, 0, math.pi / 2)), LINE_COLOUR);
	ring.Shape = Enum.PartType.Cylinder;
	ring.Material = Enum.Material.SmoothPlastic;
	const inner = part(pitch, "CentreInner", new Vector3(0.06, (centreR - LINE_W) * 2, (centreR - LINE_W) * 2), new CFrame(FIELD_LEN / 2, 0.04, FIELD_WID / 2).mul(CFrame.Angles(0, 0, math.pi / 2)), GRASS_A);
	inner.Shape = Enum.PartType.Cylinder;
	inner.Material = Enum.Material.Grass;
	const spot = part(pitch, "CentreSpot", new Vector3(0.07, 0.6, 0.6), new CFrame(FIELD_LEN / 2, 0.05, FIELD_WID / 2).mul(CFrame.Angles(0, 0, math.pi / 2)), LINE_COLOUR);
	spot.Shape = Enum.PartType.Cylinder;
	spot.Material = Enum.Material.SmoothPlastic;

	// Keeper boxes: a rectangle from each goal line out to the keeper line.
	line(pitch, 0, KEEPER_Z0, KEEPER_X, KEEPER_Z0);
	line(pitch, 0, KEEPER_Z1, KEEPER_X, KEEPER_Z1);
	line(pitch, KEEPER_X, KEEPER_Z0, KEEPER_X, KEEPER_Z1);
	line(pitch, FIELD_LEN - KEEPER_X, KEEPER_Z0, FIELD_LEN - KEEPER_X, KEEPER_Z1);
	line(pitch, FIELD_LEN, KEEPER_Z0, FIELD_LEN - KEEPER_X, KEEPER_Z0);
	line(pitch, FIELD_LEN, KEEPER_Z1, FIELD_LEN - KEEPER_X, KEEPER_Z1);
}

/** Evenly spaced positions from a to b (both included), about NET_STEP apart. */
function netSteps(a: number, b: number): number[] {
	const n = math.max(1, math.floor(math.abs(b - a) / NET_STEP + 0.5));
	const out: number[] = [];
	for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
	return out;
}

/** Thin white rope spanning sx/sy/sz along one axis (the other two sizes are NET_T). */
function rope(parent: Instance, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void {
	part(parent, "NetRope", new Vector3(math.max(sx, NET_T), math.max(sy, NET_T), math.max(sz, NET_T)), new CFrame(cx, cy, cz), NET_COLOUR);
}

/** Faint solid net panel (the flat axis has size 0 and becomes NET_PANEL_T). */
function netPanel(parent: Instance, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void {
	part(parent, "NetPanel", new Vector3(math.max(sx, NET_PANEL_T), math.max(sy, NET_PANEL_T), math.max(sz, NET_PANEL_T)), new CFrame(cx, cy, cz), NET_COLOUR, NET_PANEL_TRANSPARENCY);
}

/** Rope net on the back, roof and both sides of a goal. */
function buildNet(parent: Instance, x0: number, out: number): void {
	const midZ = (MOUTH_Z0 + MOUTH_Z1) / 2;
	const width = MOUTH_Z1 - MOUTH_Z0;
	const xb = x0 + out * GOAL_DEPTH; // back of the net
	const xm = x0 + (out * GOAL_DEPTH) / 2; // middle of the depth

	// Back.
	netPanel(parent, xb, GOAL_H / 2, midZ, 0, GOAL_H, width);
	for (const z of netSteps(MOUTH_Z0, MOUTH_Z1)) rope(parent, xb, GOAL_H / 2, z, 0, GOAL_H, 0);
	for (const y of netSteps(0, GOAL_H)) rope(parent, xb, y, midZ, 0, 0, width);

	// Roof.
	netPanel(parent, xm, GOAL_H, midZ, GOAL_DEPTH, 0, width);
	for (const z of netSteps(MOUTH_Z0, MOUTH_Z1)) rope(parent, xm, GOAL_H, z, GOAL_DEPTH, 0, 0);
	for (const x of netSteps(x0, xb)) rope(parent, x, GOAL_H, midZ, 0, 0, width);

	// Sides.
	for (const z of [MOUTH_Z0, MOUTH_Z1]) {
		netPanel(parent, xm, GOAL_H / 2, z, GOAL_DEPTH, GOAL_H, 0);
		for (const y of netSteps(0, GOAL_H)) rope(parent, xm, y, z, GOAL_DEPTH, 0, 0);
		for (const x of netSteps(x0, xb)) rope(parent, x, GOAL_H / 2, z, 0, GOAL_H, 0);
	}
}

/** Gold dragon head on top of a goal post. out = -1 (left goal) or +1 (right goal); the snout faces the pitch. */
function buildDragonHead(parent: Instance, x0: number, z: number, out: number): void {
	const y = GOAL_H + 0.4;
	const head = part(parent, "DragonHead", new Vector3(1.0, 0.8, 1.2), new CFrame(x0, y, z), GOLD);
	head.Material = Enum.Material.Metal;
	head.Reflectance = 0.1;

	// Snout: sharp edge points into the pitch (-out on X).
	const snoutX = x0 - out * 1.0;
	const snout = wedge(parent, "DragonSnout", new Vector3(0.8, 0.6, 1.0), CFrame.lookAt(new Vector3(snoutX, y, z), new Vector3(snoutX - out, y, z)), GOLD);
	snout.Material = Enum.Material.Metal;

	// Two horns sweeping up and back (away from the pitch).
	for (const zOff of [-0.35, 0.35]) {
		const hornC = new Vector3(x0 + out * 0.2, GOAL_H + 1.1, z + zOff);
		const horn = wedge(parent, "DragonHorn", new Vector3(0.2, 0.25, 0.7), CFrame.lookAt(hornC, new Vector3(hornC.X + out * 0.5, hornC.Y + 1, hornC.Z)), GOLD);
		horn.Material = Enum.Material.Metal;
	}

	// Red pearl in front of the snout.
	const pearl = part(parent, "DragonPearl", new Vector3(0.5, 0.5, 0.5), new CFrame(x0 - out * 1.75, y, z), RED);
	pearl.Shape = Enum.PartType.Ball;
}

/** Goal at goal line x0; out = -1 (left goal) or +1 (right goal), net extends behind the line. */
function buildGoal(parent: Instance, x0: number, out: number): void {
	const midZ = (MOUTH_Z0 + MOUTH_Z1) / 2;
	const width = MOUTH_Z1 - MOUTH_Z0;
	for (const z of [MOUTH_Z0, MOUTH_Z1]) {
		const post = part(parent, "Post", new Vector3(0.7, GOAL_H, 0.7), new CFrame(x0, GOAL_H / 2, z), GOLD);
		post.Material = Enum.Material.Metal;
		post.Reflectance = 0.1;
		const plinth = part(parent, "Plinth", new Vector3(1.2, 0.8, 1.2), new CFrame(x0, 0.4, z), RED);
		plinth.Material = Enum.Material.SmoothPlastic;
		buildDragonHead(parent, x0, z, out);
	}
	const bar = part(parent, "Crossbar", new Vector3(0.6, 0.6, width + 0.6), new CFrame(x0, GOAL_H - 0.3, midZ), RED);
	bar.Material = Enum.Material.SmoothPlastic;
	for (const z of [MOUTH_Z0, midZ, MOUTH_Z1]) {
		const band = part(parent, "CrossbarBand", new Vector3(0.7, 0.7, 0.4), new CFrame(x0, GOAL_H - 0.3, z), GOLD);
		band.Material = Enum.Material.Metal;
	}
	buildNet(parent, x0, out);
}

function buildPillar(parent: Instance, x: number, z: number): void {
	const pillar = part(parent, "Pillar", new Vector3(0.8, 3.6, 0.8), new CFrame(x, 1.8, z), WALL_RED);
	pillar.Material = Enum.Material.SmoothPlastic;
	const cap = part(parent, "PillarCap", new Vector3(1.1, 0.4, 1.1), new CFrame(x, 3.8, z), GOLD);
	cap.Material = Enum.Material.Metal;
}

/** One upright palisade log (cylinder rotated so its axis is vertical). */
function buildLog(parent: Instance, x: number, z: number): void {
	const log = part(parent, "Log", new Vector3(2.6, 0.7, 0.7), new CFrame(x, 1.3, z).mul(CFrame.Angles(0, 0, math.pi / 2)), WOOD_LOG);
	log.Shape = Enum.PartType.Cylinder;
	log.Material = Enum.Material.Wood;
}

function buildWalls(parent: Instance): void {
	const farZ = -1.2;
	// End palisades stop at the near corner (Z = FIELD_WID - 0.4) so nothing past FIELD_WID is taller than 2.5.
	const endZ0 = -2;
	const endZ1 = FIELD_WID - 0.4;

	// Far palisade: packed logs with a binding beam across the front.
	for (let x = -12; x <= FIELD_LEN + 12; x += 0.75) buildLog(parent, x, farZ);
	const farBeam = part(parent, "FarBinding", new Vector3(FIELD_LEN + 24, 0.4, 0.3), new CFrame(FIELD_LEN / 2, 1.9, farZ + 0.35), WOOD_BEAM);
	farBeam.Material = Enum.Material.Wood;

	// End palisades.
	for (const x of [-8, FIELD_LEN + 8]) {
		for (let z = endZ0; z <= endZ1; z += 0.75) buildLog(parent, x, z);
		const inward = x < FIELD_LEN / 2 ? 0.35 : -0.35;
		const beam = part(parent, "EndBinding", new Vector3(0.3, 0.4, endZ1 - endZ0), new CFrame(x + inward, 1.9, (endZ0 + endZ1) / 2), WOOD_BEAM);
		beam.Material = Enum.Material.Wood;
	}

	// Red lacquer pillars with gold caps on the far side only.
	for (let x = -6; x <= FIELD_LEN + 6; x += 30) buildPillar(parent, x, farZ);
}

/** One cheval-de-frise (拒馬) along the near side: a horizontal log with three pairs of crossed stakes. */
function buildCheval(parent: Instance, xc: number): void {
	const z = FIELD_WID + 2;
	const y = 1.0;
	const cos = math.cos(math.pi * 5 / 18); // 50 degrees
	const sin = math.sin(math.pi * 5 / 18);

	const logBar = part(parent, "ChevalLog", new Vector3(4.5, 0.6, 0.6), new CFrame(xc, y, z), WOOD_STAKE);
	logBar.Shape = Enum.PartType.Cylinder;
	logBar.Material = Enum.Material.Wood;

	for (const dx of [-1.5, 0, 1.5]) {
		const pivot = new Vector3(xc + dx, y, z);
		for (const sgn of [1, -1]) {
			const u = new Vector3(sgn * cos, sin, 0); // upper direction of this stake
			const tip = new Vector3(pivot.X + u.X * 0.95, pivot.Y + u.Y * 0.95, pivot.Z);
			const body = part(parent, "Stake", new Vector3(0.18, 0.18, 1.6), CFrame.lookAt(pivot, new Vector3(pivot.X + u.X, pivot.Y + u.Y, pivot.Z)), WOOD_STAKE);
			body.Material = Enum.Material.Wood;
			const point = wedge(parent, "StakeTip", new Vector3(0.18, 0.18, 0.3), CFrame.lookAt(tip, new Vector3(tip.X + u.X, tip.Y + u.Y, tip.Z)), WOOD_STAKE);
			point.Material = Enum.Material.Wood;
		}
	}
}

function buildBarricades(parent: Instance): void {
	for (let x = -6; x <= FIELD_LEN + 6; x += 6) buildCheval(parent, x);
}

/** Corner flags: thin red pole with a gold flag. Poles sit just inside each corner so nothing near is past FIELD_WID. */
function buildCornerFlags(parent: Instance): void {
	const corners: number[][] = [
		[0, 0, 1, 1],
		[FIELD_LEN, 0, -1, 1],
		[0, FIELD_WID, 1, -1],
		[FIELD_LEN, FIELD_WID, -1, -1],
	];
	for (const c of corners) {
		const px = c[0] + c[2] * 0.5;
		const pz = c[1] + c[3] * 0.5;
		part(parent, "FlagPole", new Vector3(0.2, 3.5, 0.2), new CFrame(px, 1.75, pz), RED);
		part(parent, "Flag", new Vector3(1.2, 0.8, 0.05), new CFrame(px + c[2] * 0.6, 3.0, pz), GOLD);
	}
}

/** Builds the static world under Workspace.Pitch. Safe to call again (rebuilds from scratch). */
export function buildWorld(): void {
	const ws = game.Workspace;
	const old = ws.FindFirstChild("Pitch");
	if (old !== undefined) old.Destroy();

	const pitch = new Instance("Folder");
	pitch.Name = "Pitch";
	pitch.Parent = ws;

	buildPitch(pitch);
	buildGoal(pitch, 0, -1);
	buildGoal(pitch, FIELD_LEN, 1);
	buildWalls(pitch);
	buildBarricades(pitch);
	buildCornerFlags(pitch);

	// Stands + soldier spectators (far side and both ends; the near side stays open for the camera).
	buildCrowd(pitch);
	// Camp, banners, hills, braziers, lighting.
	buildDecor(pitch);
	setupLighting();
}
