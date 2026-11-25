// Static 3D pitch for the 2.5D soccer match: grass, lines, goals, walls, stands, lighting.
// buildWorld() is idempotent: it destroys the old "Pitch" folder before building a new one.
// Coordinates: sim px * STUDS_PER_PX. Sim x -> World X (0..240 studs), sim y -> World Z (0..52), height -> Y.
import { STUDS_PER_PX } from "shared/net";

const FIELD_W_PX = 1200;
const FIELD_D_PX = 260;
const GOAL_MID_PX = 130;
const GOAL_HALF_W_PX = 40;
const GOAL_H_PX = 36;
const GOAL_DEPTH_PX = 24;
const KEEPER_LINE_PX = 140;
const KEEPER_HALF_D_PX = 40;

const FIELD_LEN = FIELD_W_PX * STUDS_PER_PX; // 240 studs along X
const FIELD_WID = FIELD_D_PX * STUDS_PER_PX; // 52 studs along Z
const MOUTH_Z0 = (GOAL_MID_PX - GOAL_HALF_W_PX) * STUDS_PER_PX; // 18
const MOUTH_Z1 = (GOAL_MID_PX + GOAL_HALF_W_PX) * STUDS_PER_PX; // 34
const GOAL_H = GOAL_H_PX * STUDS_PER_PX; // 7.2
const GOAL_DEPTH = GOAL_DEPTH_PX * STUDS_PER_PX; // 4.8
const KEEPER_X = KEEPER_LINE_PX * STUDS_PER_PX; // 28
const KEEPER_Z0 = (GOAL_MID_PX - KEEPER_HALF_D_PX) * STUDS_PER_PX; // 10
const KEEPER_Z1 = (GOAL_MID_PX + KEEPER_HALF_D_PX) * STUDS_PER_PX; // 42

export function colourOf(hex: number, shade = 1): Color3 {
	const r = math.min(255, math.floor((math.floor(hex / 65536) % 256) * shade));
	const g = math.min(255, math.floor((math.floor(hex / 256) % 256) * shade));
	const b = math.min(255, math.floor((hex % 256) * shade));
	return Color3.fromRGB(r, g, b);
}

const LINE_W = 0.35;
const LINE_COLOUR = colourOf(0xf5f5f0);
const GOLD = colourOf(0xd9a21b);
const RED = colourOf(0xb3261e);
const WALL_RED = colourOf(0x8a2a22);
const RISER_A = colourOf(0x6b5a48);
const RISER_B = colourOf(0x7d6a55);
const NET_COLOUR = colourOf(0xf2f2f2);
const NET_TRANSPARENCY = 0.6;

const TIERS = 5;
const TIER_DEPTH = 3;
const TIER_BASE = 2.5;
const TIER_RISE = 2.2;
const CROWD_SPACING = 3;
const CROWD_PALETTE = [0xc0392b, 0xf1c40f, 0x2e86de, 0xecf0f1, 0x27ae60, 0x8e5a2b, 0xd7b899, 0x34495e];

/** 0xRRGGBB -> Color3. shade scales each channel (clamped to 255). */

function part(parent: Instance, name: string, size: Vector3, cf: CFrame, colour: Color3, transparency = 0): Part {
	const p = new Instance("Part");
	p.Name = name;
	p.Anchored = true;
	p.CanCollide = false;
	p.CanQuery = false;
	p.CanTouch = false;
	p.Size = size;
	p.CFrame = cf;
	p.Color = colour;
	p.Transparency = transparency;
	p.Parent = parent;
	return p;
}

/** Thin white line on the grass between two ground points (axis-aligned, in studs). */
function line(parent: Instance, x1: number, z1: number, x2: number, z2: number): void {
	const size = new Vector3(math.abs(x2 - x1) + LINE_W, 0.05, math.abs(z2 - z1) + LINE_W);
	part(parent, "Line", size, new CFrame((x1 + x2) / 2, 0.03, (z1 + z2) / 2), LINE_COLOUR);
}

function buildPitch(pitch: Instance): void {
	part(pitch, "Ground", new Vector3(FIELD_LEN + 180, 1, FIELD_WID + 160), new CFrame(FIELD_LEN / 2, -0.6, FIELD_WID / 2), colourOf(0x4a3d2a)); // top at -0.1, below the stripes (avoid z-fighting)

	const stripeW = FIELD_LEN / 12;
	for (let i = 0; i < 12; i++) {
		const colour = i % 2 === 0 ? colourOf(0x3f9a3a) : colourOf(0x37893a);
		part(pitch, `Stripe${i}`, new Vector3(stripeW, 0.1, FIELD_WID), new CFrame(stripeW * (i + 0.5), -0.05, FIELD_WID / 2), colour);
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
	part(pitch, "CentreRing", new Vector3(0.05, centreR * 2, centreR * 2), new CFrame(FIELD_LEN / 2, 0.03, FIELD_WID / 2).mul(CFrame.Angles(0, 0, math.pi / 2)), LINE_COLOUR);
	part(pitch, "CentreInner", new Vector3(0.06, (centreR - LINE_W) * 2, (centreR - LINE_W) * 2), new CFrame(FIELD_LEN / 2, 0.04, FIELD_WID / 2).mul(CFrame.Angles(0, 0, math.pi / 2)), colourOf(0x3f9a3a));
	part(pitch, "CentreSpot", new Vector3(0.07, 0.6, 0.6), new CFrame(FIELD_LEN / 2, 0.05, FIELD_WID / 2).mul(CFrame.Angles(0, 0, math.pi / 2)), LINE_COLOUR);

	// Keeper boxes: a rectangle from each goal line out to the keeper line.
	line(pitch, 0, KEEPER_Z0, KEEPER_X, KEEPER_Z0);
	line(pitch, 0, KEEPER_Z1, KEEPER_X, KEEPER_Z1);
	line(pitch, KEEPER_X, KEEPER_Z0, KEEPER_X, KEEPER_Z1);
	line(pitch, FIELD_LEN - KEEPER_X, KEEPER_Z0, FIELD_LEN - KEEPER_X, KEEPER_Z1);
	line(pitch, FIELD_LEN, KEEPER_Z0, FIELD_LEN - KEEPER_X, KEEPER_Z0);
	line(pitch, FIELD_LEN, KEEPER_Z1, FIELD_LEN - KEEPER_X, KEEPER_Z1);
}

/** Goal at goal line x0; out = -1 (left goal) or +1 (right goal), net extends behind the line. */
function buildGoal(parent: Instance, x0: number, out: number): void {
	const midZ = (MOUTH_Z0 + MOUTH_Z1) / 2;
	const width = MOUTH_Z1 - MOUTH_Z0;
	part(parent, "Post", new Vector3(0.6, GOAL_H, 0.6), new CFrame(x0, GOAL_H / 2, MOUTH_Z0), GOLD);
	part(parent, "Post", new Vector3(0.6, GOAL_H, 0.6), new CFrame(x0, GOAL_H / 2, MOUTH_Z1), GOLD);
	part(parent, "Crossbar", new Vector3(0.6, 0.6, width + 0.6), new CFrame(x0, GOAL_H - 0.3, midZ), RED);
	part(parent, "NetBack", new Vector3(0.2, GOAL_H, width), new CFrame(x0 + out * GOAL_DEPTH, GOAL_H / 2, midZ), NET_COLOUR, NET_TRANSPARENCY);
	part(parent, "NetRoof", new Vector3(GOAL_DEPTH, 0.2, width), new CFrame(x0 + (out * GOAL_DEPTH) / 2, GOAL_H, midZ), NET_COLOUR, NET_TRANSPARENCY);
	for (const z of [MOUTH_Z0, MOUTH_Z1]) {
		part(parent, "NetSide", new Vector3(GOAL_DEPTH, GOAL_H, 0.2), new CFrame(x0 + (out * GOAL_DEPTH) / 2, GOAL_H / 2, z), NET_COLOUR, NET_TRANSPARENCY);
	}
}

function buildPillar(parent: Instance, x: number, z: number): void {
	part(parent, "Pillar", new Vector3(0.8, 3.6, 0.8), new CFrame(x, 1.8, z), WALL_RED);
	part(parent, "PillarCap", new Vector3(1.1, 0.4, 1.1), new CFrame(x, 3.8, z), GOLD);
}

function buildWalls(parent: Instance): void {
	const farZ = -1.2;
	const nearZ = FIELD_WID + 1.2;
	part(parent, "WallFar", new Vector3(FIELD_LEN + 24, 2.5, 0.6), new CFrame(FIELD_LEN / 2, 1.25, farZ), WALL_RED);
	part(parent, "WallNear", new Vector3(FIELD_LEN + 24, 2.5, 0.6), new CFrame(FIELD_LEN / 2, 1.25, nearZ), WALL_RED);
	part(parent, "WallLeft", new Vector3(0.6, 2.5, FIELD_WID + 4), new CFrame(-8, 1.25, FIELD_WID / 2), WALL_RED);
	part(parent, "WallRight", new Vector3(0.6, 2.5, FIELD_WID + 4), new CFrame(FIELD_LEN + 8, 1.25, FIELD_WID / 2), WALL_RED);
	for (let x = -6; x <= FIELD_LEN + 6; x += 30) {
		buildPillar(parent, x, farZ);
		buildPillar(parent, x, nearZ);
	}
}

/**
 * Tiered stand. alongX: tiers run along X (far side) or along Z (end stands).
 * edge = inner face of the wall, out = -1/+1 direction the tiers climb away from the pitch.
 */
function buildStand(parent: Instance, alongX: boolean, centre: number, length: number, edge: number, out: number): void {
	for (let k = 0; k < TIERS; k++) {
		const top = TIER_BASE + k * TIER_RISE;
		const perp = edge + out * (k * TIER_DEPTH + TIER_DEPTH / 2);
		const riser = k % 2 === 0 ? RISER_A : RISER_B;
		if (alongX) {
			part(parent, `Tier${k}`, new Vector3(length, top, TIER_DEPTH), new CFrame(centre, top / 2, perp), riser);
		} else {
			part(parent, `Tier${k}`, new Vector3(TIER_DEPTH, top, length), new CFrame(perp, top / 2, centre), riser);
		}
		const count = math.floor(length / CROWD_SPACING);
		for (let i = 0; i < count; i++) {
			const along = centre - length / 2 + (i + 0.5) * CROWD_SPACING;
			const colour = colourOf(CROWD_PALETTE[(i * 5 + k * 3) % CROWD_PALETTE.size()]);
			if (alongX) {
				part(parent, "Fan", new Vector3(2, 1.8, 1.2), new CFrame(along, top + 0.9, perp), colour);
			} else {
				part(parent, "Fan", new Vector3(1.2, 1.8, 2), new CFrame(perp, top + 0.9, along), colour);
			}
		}
	}
}

function buildFloodlight(parent: Instance, x: number, z: number): void {
	part(parent, "LightPole", new Vector3(1.2, 22, 1.2), new CFrame(x, 11, z), colourOf(0x555555));
	const head = part(parent, "LightHead", new Vector3(6, 2, 2), new CFrame(x, 22.5, z), colourOf(0xfff6e0));
	head.Material = Enum.Material.Neon;
}

function setupLighting(): void {
	const lighting = game.GetService("Lighting");
	lighting.ClockTime = 16.5;
	lighting.GeographicLatitude = 35;
	lighting.Brightness = 2.2;
	lighting.ShadowSoftness = 0.5;
	lighting.Ambient = colourOf(0x4a4a58);
	lighting.OutdoorAmbient = colourOf(0x8a8f9a);

	const old = lighting.FindFirstChild("Atmosphere");
	if (old !== undefined) old.Destroy();
	const atmosphere = new Instance("Atmosphere");
	atmosphere.Density = 0.25;
	atmosphere.Offset = 0.2;
	atmosphere.Color = colourOf(0xcfe0f0);
	atmosphere.Decay = colourOf(0x9ab0c8);
	atmosphere.Glare = 0.1;
	atmosphere.Haze = 0.6;
	atmosphere.Parent = lighting;
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

	// Stands on the far side (-Z) and both ends; the near side stays open for the camera.
	buildStand(pitch, true, FIELD_LEN / 2, FIELD_LEN + 24, -1.8, -1);
	buildStand(pitch, false, FIELD_WID / 2, FIELD_WID + 8, -8.3, -1);
	buildStand(pitch, false, FIELD_WID / 2, FIELD_WID + 8, FIELD_LEN + 8.3, 1);

	buildFloodlight(pitch, -16, -6);
	buildFloodlight(pitch, FIELD_LEN + 16, -6);
	buildFloodlight(pitch, -16, FIELD_WID + 6);
	buildFloodlight(pitch, FIELD_LEN + 16, FIELD_WID + 6);

	setupLighting();
}
