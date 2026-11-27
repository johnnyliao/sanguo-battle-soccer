// Static 3D stadium for the 2.5D soccer match: grass, walls, stands, lighting (buildWorld, built once).
// The pitch layer (markings, goals, corner flags; plus a rope boundary and darker turf for small pitches) is rebuilt
// by buildPitchLayer() for every Setup, sized to that match's field. Smaller pitches are centred in the stadium by
// the sim offset that buildPitchLayer() sets (see shared/net setSimOffset).
// Coordinates: sim px * STUDS_PER_PX. Sim x -> World X, sim y -> World Z (0..FIELD_WID for the default field), height -> Y.
import { setSimOffset, STUDS_PER_PX } from "shared/net";
import { FIELD_D, FIELD_W, GOAL_HALF_W } from "shared/game/sim/constants";
import { colourOf, FIELD_LEN, FIELD_WID, part, pitchOffsetPx } from "./worldParts";
import { buildCrowd } from "./worldCrowd";
import { buildDecor, setupLighting } from "./worldDecor";

export { colourOf } from "./worldParts";

/** Field size in sim px (same shape as Setup.field). */
export interface PitchField {
	w: number;
	d: number;
	goalHalfW: number;
}

const DEFAULT_FIELD: PitchField = { w: FIELD_W, d: FIELD_D, goalHalfW: GOAL_HALF_W };
const DEFAULT_TEAM_SIZE = 5;

const GOAL_H_PX = 36;
const GOAL_DEPTH_PX = 24;
const KEEPER_LINE_PX = 140;
const KEEPER_HALF_D_PX = 40;
const KEEPER_MIN_TEAM_SIZE = 3; // keeper boxes only on 3v3 and up

const GOAL_H = GOAL_H_PX * STUDS_PER_PX;
const GOAL_DEPTH = GOAL_DEPTH_PX * STUDS_PER_PX;

const LINE_W = 0.35;
const LINE_COLOUR = colourOf(0xf5f5f0);
const GRASS_A = colourOf(0x4a9e3f);
const GRASS_B = colourOf(0x418f3a);
const TURF_OUTSIDE = colourOf(0x418f3a, 0.8); // darker turf outside a small pitch
const GOLD = colourOf(0xd9a21b);
const RED = colourOf(0xb3261e);
const WALL_RED = colourOf(0x8a2a22);
const WOOD_LOG = colourOf(0x7a5230);
const WOOD_BEAM = colourOf(0x5a3d24);
const WOOD_STAKE = colourOf(0x6b4a2b);
const ROPE_COLOUR = colourOf(0xd8c8a0);
const NET_COLOUR = colourOf(0xf2f2f2);
const NET_STEP = 1.2;
const NET_T = 0.08;
const NET_PANEL_T = 0.2;
const NET_PANEL_TRANSPARENCY = 0.9;

// Boundary around a small pitch: low posts and one rope, kept under the camera's sight line.
const BOUND_OUT = 1.5; // studs outside the pitch lines
const BOUND_POST_H = 1.3;
const BOUND_ROPE_Y = 1.0;
const BOUND_STEP = 4; // studs between posts

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

/** Ground and grass stripes of the default-size stadium pitch. They stay put when a smaller match pitch is drawn. */
function buildGround(parent: Instance): void {
	const ground = part(parent, "Ground", new Vector3(FIELD_LEN + 180, 1, FIELD_WID + 160), new CFrame(FIELD_LEN / 2, -0.6, FIELD_WID / 2), colourOf(0x8b6b45)); // top at -0.1, below the stripes (avoid z-fighting)
	ground.Material = Enum.Material.Ground;

	const stripeW = FIELD_LEN / 12;
	for (let i = 0; i < 12; i++) {
		const colour = i % 2 === 0 ? GRASS_A : GRASS_B;
		const stripe = part(parent, `Stripe${i}`, new Vector3(stripeW, 0.1, FIELD_WID), new CFrame(stripeW * (i + 0.5), -0.05, FIELD_WID / 2), colour);
		stripe.Material = Enum.Material.Grass;
	}
}

/** Darker turf on a rectangle of the stadium grass (studs, World X / Z). Empty rectangles are skipped. */
function turfPatch(parent: Instance, name: string, xa: number, za: number, xb: number, zb: number): void {
	if (xb - xa <= 0 || zb - za <= 0) return;
	const patch = part(parent, name, new Vector3(xb - xa, 0.1, zb - za), new CFrame((xa + xb) / 2, -0.02, (za + zb) / 2), TURF_OUTSIDE);
	patch.Material = Enum.Material.Grass;
}

/** Low boundary along one axis-aligned segment (studs): wooden posts with one rope between them. */
function boundaryRun(parent: Instance, ax: number, az: number, bx: number, bz: number): void {
	const alongX = az === bz;
	const len = alongX ? math.abs(bx - ax) : math.abs(bz - az);
	if (len <= 0) return;
	const n = math.max(1, math.floor(len / BOUND_STEP + 0.5));
	for (let i = 0; i <= n; i++) {
		const t = i / n;
		const post = part(parent, "BoundPost", new Vector3(0.35, BOUND_POST_H, 0.35), new CFrame(ax + (bx - ax) * t, BOUND_POST_H / 2, az + (bz - az) * t), WOOD_STAKE);
		post.Material = Enum.Material.Wood;
	}
	const rope = part(parent, "BoundRope", alongX ? new Vector3(len, 0.15, 0.15) : new Vector3(0.15, 0.15, len), new CFrame((ax + bx) / 2, BOUND_ROPE_Y, (az + bz) / 2), ROPE_COLOUR);
	rope.Material = Enum.Material.Fabric;
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

/** Rope net on the back, roof and both sides of a goal whose mouth runs from mz0 to mz1. */
function buildNet(parent: Instance, x0: number, out: number, mz0: number, mz1: number): void {
	const midZ = (mz0 + mz1) / 2;
	const width = mz1 - mz0;
	const xb = x0 + out * GOAL_DEPTH; // back of the net
	const xm = x0 + (out * GOAL_DEPTH) / 2; // middle of the depth

	// Back.
	netPanel(parent, xb, GOAL_H / 2, midZ, 0, GOAL_H, width);
	for (const z of netSteps(mz0, mz1)) rope(parent, xb, GOAL_H / 2, z, 0, GOAL_H, 0);
	for (const y of netSteps(0, GOAL_H)) rope(parent, xb, y, midZ, 0, 0, width);

	// Roof.
	netPanel(parent, xm, GOAL_H, midZ, GOAL_DEPTH, 0, width);
	for (const z of netSteps(mz0, mz1)) rope(parent, xm, GOAL_H, z, GOAL_DEPTH, 0, 0);
	for (const x of netSteps(x0, xb)) rope(parent, x, GOAL_H, midZ, 0, 0, width);

	// Sides.
	for (const z of [mz0, mz1]) {
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

/** Goal at goal line x0 with mouth from mz0 to mz1; out = -1 (left goal) or +1 (right goal), net extends behind the line. */
function buildGoal(parent: Instance, x0: number, out: number, mz0: number, mz1: number): void {
	const midZ = (mz0 + mz1) / 2;
	const width = mz1 - mz0;
	for (const z of [mz0, mz1]) {
		const post = part(parent, "Post", new Vector3(0.7, GOAL_H, 0.7), new CFrame(x0, GOAL_H / 2, z), GOLD);
		post.Material = Enum.Material.Metal;
		post.Reflectance = 0.1;
		const plinth = part(parent, "Plinth", new Vector3(1.2, 0.8, 1.2), new CFrame(x0, 0.4, z), RED);
		plinth.Material = Enum.Material.SmoothPlastic;
		buildDragonHead(parent, x0, z, out);
	}
	const bar = part(parent, "Crossbar", new Vector3(0.6, 0.6, width + 0.6), new CFrame(x0, GOAL_H - 0.3, midZ), RED);
	bar.Material = Enum.Material.SmoothPlastic;
	for (const z of [mz0, midZ, mz1]) {
		const band = part(parent, "CrossbarBand", new Vector3(0.7, 0.7, 0.4), new CFrame(x0, GOAL_H - 0.3, z), GOLD);
		band.Material = Enum.Material.Metal;
	}
	buildNet(parent, x0, out, mz0, mz1);
}

/**
 * Lines, centre circle, keeper boxes (3v3 and up), goals and corner flags for one match field, placed at the field's
 * centring offset. Smaller fields also get darker turf outside the pitch and a low boundary.
 */
function buildPitchMarkings(parent: Instance, field: PitchField, teamSize: number): void {
	const [offX, offY] = pitchOffsetPx(field.w, field.d);
	const small = offX > 0 || offY > 0;
	const X = (x: number): number => (offX + x) * STUDS_PER_PX;
	const Z = (y: number): number => (offY + y) * STUDS_PER_PX;
	const x0 = X(0);
	const x1 = X(field.w);
	const z0 = Z(0);
	const z1 = Z(field.d);
	const midX = X(field.w / 2);
	const midZ = Z(field.d / 2);
	const mouthZ0 = Z(field.d / 2 - field.goalHalfW);
	const mouthZ1 = Z(field.d / 2 + field.goalHalfW);

	if (small) {
		// Turf around the small pitch (the stadium grass beyond it stays, just darker).
		turfPatch(parent, "TurfFar", 0, 0, FIELD_LEN, z0);
		turfPatch(parent, "TurfNear", 0, z1, FIELD_LEN, FIELD_WID);
		turfPatch(parent, "TurfLeft", 0, z0, x0, z1);
		turfPatch(parent, "TurfRight", x1, z0, FIELD_LEN, z1);

		// Boundary posts and rope, 1.5 studs outside the lines. Goal lines stay open across the mouth.
		const bx0 = x0 - BOUND_OUT;
		const bx1 = x1 + BOUND_OUT;
		const bz0 = z0 - BOUND_OUT;
		const bz1 = z1 + BOUND_OUT;
		boundaryRun(parent, bx0, bz0, bx1, bz0);
		boundaryRun(parent, bx0, bz1, bx1, bz1);
		boundaryRun(parent, bx0, bz0, bx0, mouthZ0 - BOUND_OUT);
		boundaryRun(parent, bx0, mouthZ1 + BOUND_OUT, bx0, bz1);
		boundaryRun(parent, bx1, bz0, bx1, mouthZ0 - BOUND_OUT);
		boundaryRun(parent, bx1, mouthZ1 + BOUND_OUT, bx1, bz1);
	}

	// Touchlines and goal lines (goal lines are open across the goal mouth).
	line(parent, x0, z0, x1, z0);
	line(parent, x0, z1, x1, z1);
	line(parent, x0, z0, x0, mouthZ0);
	line(parent, x0, mouthZ1, x0, z1);
	line(parent, x1, z0, x1, mouthZ0);
	line(parent, x1, mouthZ1, x1, z1);
	line(parent, midX, z0, midX, z1);

	// Centre circle (white ring + green inner disc) and spot.
	const centreR = 40 * STUDS_PER_PX;
	const ring = part(parent, "CentreRing", new Vector3(0.05, centreR * 2, centreR * 2), new CFrame(midX, 0.03, midZ).mul(CFrame.Angles(0, 0, math.pi / 2)), LINE_COLOUR);
	ring.Shape = Enum.PartType.Cylinder;
	ring.Material = Enum.Material.SmoothPlastic;
	const inner = part(parent, "CentreInner", new Vector3(0.06, (centreR - LINE_W) * 2, (centreR - LINE_W) * 2), new CFrame(midX, 0.04, midZ).mul(CFrame.Angles(0, 0, math.pi / 2)), GRASS_A);
	inner.Shape = Enum.PartType.Cylinder;
	inner.Material = Enum.Material.Grass;
	const spot = part(parent, "CentreSpot", new Vector3(0.07, 0.6, 0.6), new CFrame(midX, 0.05, midZ).mul(CFrame.Angles(0, 0, math.pi / 2)), LINE_COLOUR);
	spot.Shape = Enum.PartType.Cylinder;
	spot.Material = Enum.Material.SmoothPlastic;

	// Keeper boxes: a rectangle from each goal line out to the keeper line (3v3 and up only).
	if (teamSize >= KEEPER_MIN_TEAM_SIZE) {
		const kz0 = Z(field.d / 2 - KEEPER_HALF_D_PX);
		const kz1 = Z(field.d / 2 + KEEPER_HALF_D_PX);
		const kx0 = X(KEEPER_LINE_PX);
		const kx1 = X(field.w - KEEPER_LINE_PX);
		line(parent, x0, kz0, kx0, kz0);
		line(parent, x0, kz1, kx0, kz1);
		line(parent, kx0, kz0, kx0, kz1);
		line(parent, kx1, kz0, kx1, kz1);
		line(parent, x1, kz0, kx1, kz0);
		line(parent, x1, kz1, kx1, kz1);
	}

	buildGoal(parent, x0, -1, mouthZ0, mouthZ1);
	buildGoal(parent, x1, 1, mouthZ0, mouthZ1);
	buildCornerFlags(parent, x0, x1, z0, z1);
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

/** Corner flags: thin red pole with a gold flag, for a pitch spanning xl..xr and zn..zf. Poles sit just inside each corner. */
function buildCornerFlags(parent: Instance, xl: number, xr: number, zn: number, zf: number): void {
	const corners: number[][] = [
		[xl, zn, 1, 1],
		[xr, zn, -1, 1],
		[xl, zf, 1, -1],
		[xr, zf, -1, -1],
	];
	for (const c of corners) {
		const px = c[0] + c[2] * 0.5;
		const pz = c[1] + c[3] * 0.5;
		part(parent, "FlagPole", new Vector3(0.2, 3.5, 0.2), new CFrame(px, 1.75, pz), RED);
		part(parent, "Flag", new Vector3(1.2, 0.8, 0.05), new CFrame(px + c[2] * 0.6, 3.0, pz), GOLD);
	}
}

/**
 * Rebuilds the pitch layer under Workspace.PitchLayer for one match: markings, goals and corner flags at the field's
 * size (plus turf and boundary for smaller fields). Also sets the sim offset that centres the field in the stadium.
 * Call on every Setup before any actor or the ball is placed. Safe to call again.
 */
export function buildPitchLayer(field: PitchField, teamSize: number): void {
	const [offX, offY] = pitchOffsetPx(field.w, field.d);
	setSimOffset(offX, offY);

	const ws = game.Workspace;
	const old = ws.FindFirstChild("PitchLayer");
	if (old !== undefined) old.Destroy();

	const layer = new Instance("Folder");
	layer.Name = "PitchLayer";
	layer.Parent = ws;
	buildPitchMarkings(layer, field, teamSize);
}

/**
 * Builds the static stadium under Workspace.Pitch (ground, walls, barricades, stands, decor, lighting), then the
 * default-size pitch layer so markings show before the first Setup. Safe to call again (rebuilds from scratch).
 */
export function buildWorld(): void {
	const ws = game.Workspace;
	const old = ws.FindFirstChild("Pitch");
	if (old !== undefined) old.Destroy();

	const pitch = new Instance("Folder");
	pitch.Name = "Pitch";
	pitch.Parent = ws;

	buildGround(pitch);
	buildWalls(pitch);
	buildBarricades(pitch);

	// Stands + soldier spectators (far side and both ends; the near side stays open for the camera).
	buildCrowd(pitch);
	// Camp, banners, hills, braziers, lighting.
	buildDecor(pitch);
	setupLighting();

	buildPitchLayer(DEFAULT_FIELD, DEFAULT_TEAM_SIZE);
}
