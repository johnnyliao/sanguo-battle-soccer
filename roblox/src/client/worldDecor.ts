// Stadium backdrop: military camp behind the far stand, war banners, distant hills, braziers (replacing the
// floodlights) and warm late-afternoon lighting. Pure decoration: every part is anchored, non-colliding, non-queryable.
// Imports only from worldParts (not world.ts) to avoid a circular import.
import { FIELD_LEN, FIELD_WID, colourOf, part } from "./worldParts";

const SEED = 20261126;
const FACTION = [0x2e8b3a, 0x2e5fb3, 0xb3261e];
const CLOTH = [0xd8ccb0, 0xc9b78f];
const GOLD = 0xd9a21b;
const BRONZE = 0x8c6a2c;
const POLE_DARK = 0x4a3a2a;
const DOOR_DARK = 0x2a2420;
const HILL_COLOURS = [0x5d7a4a, 0x6f7f5a, 0x7b7466];

const TENT_SPACING = 14;
const CAMP_ROW_Z = [-28, -40, -52];
const CMD_X = FIELD_LEN / 2;
const CMD_Z = -32;
const CMD_SCALE = 1.5;
const BANNER_Z = -19;
const BANNER_SPACING = 24;

/** Wedge with its tall edge on local +Z (the solid sits under the slope). */
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
	w.Material = Enum.Material.Fabric;
	w.Parent = parent;
	return w;
}

function pickCloth(rng: Random): Color3 {
	if (rng.NextNumber() < 0.25) {
		return colourOf(FACTION[rng.NextInteger(0, 2)]);
	}
	return colourOf(CLOTH[rng.NextInteger(0, 1)]);
}

/** Ridge tent centred at (cx, cz). Ridge runs along Z; s scales every dimension. */
function buildTent(parent: Instance, cx: number, cz: number, s: number, colour: Color3, rng: Random, withPole: boolean): void {
	const halfW = 4 * s;
	const ridge = 5 * s;
	const len = 7 * s;

	wedge(parent, "RoofL", new Vector3(len, ridge, halfW), new CFrame(cx - halfW / 2, ridge / 2, cz).mul(CFrame.Angles(0, math.pi / 2, 0)), colour);
	wedge(parent, "RoofR", new Vector3(len, ridge, halfW), new CFrame(cx + halfW / 2, ridge / 2, cz).mul(CFrame.Angles(0, -math.pi / 2, 0)), colour);

	const door = part(parent, "Door", new Vector3(2 * s, 2.2 * s, 0.2), new CFrame(cx, 1.1 * s, cz + len / 2 + 0.05), colourOf(DOOR_DARK));
	door.Material = Enum.Material.Fabric;

	if (withPole) {
		const pole = part(parent, "TentPole", new Vector3(0.3, 4 * s, 0.3), new CFrame(cx, ridge + 2 * s, cz), colourOf(POLE_DARK));
		pole.Material = Enum.Material.Wood;
		const pennant = part(parent, "Pennant", new Vector3(2 * s, 1.2 * s, 0.1), new CFrame(cx + 1 * s, 8.2 * s, cz), colourOf(FACTION[rng.NextInteger(0, 2)]));
		pennant.Material = Enum.Material.Fabric;
	}
}

/** Tall gold-trimmed war banner beside the command tent. */
function buildCommandBanner(parent: Instance, s: number): void {
	const px = CMD_X + 5 * s;
	const pz = CMD_Z + 3.5 * s + 1;
	const pole = part(parent, "CmdBannerPole", new Vector3(0.35, 14, 0.35), new CFrame(px, 7, pz), colourOf(POLE_DARK));
	pole.Material = Enum.Material.Wood;
	const cloth = part(parent, "CmdBannerCloth", new Vector3(2.5, 7, 0.12), new CFrame(px + 1.45, 9.5, pz), colourOf(FACTION[2]));
	cloth.Material = Enum.Material.Fabric;
	part(parent, "CmdBannerTrimTop", new Vector3(2.9, 0.3, 0.2), new CFrame(px + 1.45, 13, pz), colourOf(GOLD));
	part(parent, "CmdBannerTrimBottom", new Vector3(2.9, 0.3, 0.2), new CFrame(px + 1.45, 6, pz), colourOf(GOLD));
	const finial = part(parent, "CmdBannerFinial", new Vector3(0.9, 0.9, 0.9), new CFrame(px, 14.4, pz), colourOf(GOLD));
	finial.Shape = Enum.PartType.Ball;
}

function buildCamp(parent: Instance, rng: Random): void {
	const camp = new Instance("Folder");
	camp.Name = "Camp";
	camp.Parent = parent;

	for (let row = 0; row < CAMP_ROW_Z.size(); row++) {
		const rowZ = CAMP_ROW_Z[row];
		for (let x = -40 + row * 7; x <= FIELD_LEN + 40; x += TENT_SPACING) {
			const tx = x + rng.NextNumber(-1.5, 1.5);
			const tz = rowZ + rng.NextNumber(-1, 1);
			if (math.abs(tx - CMD_X) < 14 && math.abs(tz - CMD_Z) < 12) {
				continue; // keep clear of the command tent
			}
			const colour = pickCloth(rng);
			const withPole = rng.NextNumber() < 0.33;
			buildTent(camp, tx, tz, 1, colour, rng, withPole);
		}
	}

	buildTent(camp, CMD_X, CMD_Z, CMD_SCALE, colourOf(CLOTH[0]), rng, true);
	buildCommandBanner(camp, CMD_SCALE);
}

function buildBanners(parent: Instance): void {
	const banners = new Instance("Folder");
	banners.Name = "Banners";
	banners.Parent = parent;

	let k = 0;
	for (let x = -20; x <= FIELD_LEN + 20; x += BANNER_SPACING) {
		const pole = part(banners, "BannerPole", new Vector3(0.4, 12, 0.4), new CFrame(x, 6, BANNER_Z), colourOf(POLE_DARK));
		pole.Material = Enum.Material.Wood;
		const cloth = part(banners, "BannerCloth", new Vector3(2.5, 7, 0.15), new CFrame(x + 1.45, 8.3, BANNER_Z), colourOf(FACTION[k % 3]));
		cloth.Material = Enum.Material.Fabric;
		const finial = part(banners, "BannerFinial", new Vector3(0.9, 0.9, 0.9), new CFrame(x, 12.4, BANNER_Z), colourOf(GOLD));
		finial.Shape = Enum.PartType.Ball;
		k++;
	}
}

function buildHill(parent: Instance, x: number, z: number, rng: Random): void {
	const w = rng.NextNumber(60, 110);
	const h = rng.NextNumber(25, 60);
	const d = rng.NextNumber(40, 60);
	const idx = rng.NextInteger(0, 2);
	const hill = part(parent, "Hill", new Vector3(w, h, d), new CFrame(x, h / 2 - 1, z), colourOf(HILL_COLOURS[idx]));
	hill.Material = idx === 2 ? Enum.Material.Rock : Enum.Material.Grass;
}

function buildHills(parent: Instance, rng: Random): void {
	const hills = new Instance("Folder");
	hills.Name = "Hills";
	hills.Parent = parent;

	// Far range behind the camp.
	const span = (FIELD_LEN + 300) / 6;
	for (let k = 0; k < 7; k++) {
		buildHill(hills, -150 + k * span + rng.NextNumber(-10, 10), rng.NextNumber(-165, -120), rng);
	}
	// Ranges behind the end stands.
	for (const side of [-1, 1]) {
		for (let i = 0; i < 2; i++) {
			const x = side < 0 ? rng.NextNumber(-130, -70) : rng.NextNumber(FIELD_LEN + 70, FIELD_LEN + 130);
			buildHill(hills, x, rng.NextNumber(-40, 120), rng);
		}
	}
}

function addFire(bowl: Part): void {
	const fire = new Instance("ParticleEmitter");
	fire.Texture = "rbxasset://textures/particles/fire_main.dds";
	fire.Color = new ColorSequence(colourOf(0xff8020), colourOf(0xffe060));
	fire.LightEmission = 1;
	fire.Size = new NumberSequence(1.5, 0.3);
	fire.Lifetime = new NumberRange(0.6, 1);
	fire.Rate = 25;
	fire.Speed = new NumberRange(3, 5);
	fire.Parent = bowl;

	const light = new Instance("PointLight");
	light.Color = colourOf(0xffa040);
	light.Range = 18;
	light.Brightness = 1.5;
	light.Shadows = false;
	light.Parent = bowl;
}

/** Stone pillar with a bronze bowl at y about 5.5. */
function standingBrazier(parent: Instance, x: number, z: number): void {
	const pillar = part(parent, "BrazierPillar", new Vector3(1.6, 5, 1.6), new CFrame(x, 2.5, z), colourOf(0x6b6b6b));
	pillar.Material = Enum.Material.Slate;
	const bowl = part(parent, "BrazierBowl", new Vector3(2.4, 1, 2.4), new CFrame(x, 5.5, z), colourOf(BRONZE));
	bowl.Material = Enum.Material.Metal;
	addFire(bowl);
}

/** Low tripod brazier, total height about 1.85 (fire particles rise above it). */
function tripodBrazier(parent: Instance, x: number, z: number): void {
	const post = part(parent, "TripodPost", new Vector3(0.5, 1.2, 0.5), new CFrame(x, 0.6, z), colourOf(BRONZE));
	post.Material = Enum.Material.Metal;
	for (let i = 0; i < 3; i++) {
		const a = (i * 2 * math.pi) / 3;
		const leg = part(parent, "TripodLeg", new Vector3(0.2, 1.5, 0.2), new CFrame(x + math.cos(a) * 0.8, 0.75, z + math.sin(a) * 0.8), colourOf(BRONZE));
		leg.Material = Enum.Material.Metal;
	}
	const bowl = part(parent, "TripodBowl", new Vector3(2, 0.5, 2), new CFrame(x, 1.6, z), colourOf(BRONZE));
	bowl.Material = Enum.Material.Metal;
	addFire(bowl);
}

function buildBraziers(parent: Instance): void {
	const braziers = new Instance("Folder");
	braziers.Name = "Braziers";
	braziers.Parent = parent;

	standingBrazier(braziers, -16, -6);
	standingBrazier(braziers, FIELD_LEN + 16, -6);
	standingBrazier(braziers, -16, -20);
	standingBrazier(braziers, FIELD_LEN + 16, -20);

	tripodBrazier(braziers, -16, FIELD_WID + 6);
	tripodBrazier(braziers, FIELD_LEN + 16, FIELD_WID + 6);
	tripodBrazier(braziers, -16, FIELD_WID / 2);
	tripodBrazier(braziers, FIELD_LEN + 16, FIELD_WID / 2);
}

/** Builds everything under a Folder "Decor" in parent. Safe to call again (rebuilds from scratch). */
export function buildDecor(parent: Instance): void {
	const old = parent.FindFirstChild("Decor");
	if (old !== undefined) old.Destroy();

	const decor = new Instance("Folder");
	decor.Name = "Decor";
	decor.Parent = parent;

	// Ground under the camp: top at y = -0.1, stops short of the pitch area (z >= -2).
	const ground = part(decor, "CampGround", new Vector3(FIELD_LEN + 400, 1, 118), new CFrame(FIELD_LEN / 2, -0.65, -141), colourOf(0x7a6a48));
	ground.Material = Enum.Material.Ground;

	buildHills(decor, new Random(SEED + 1));
	buildCamp(decor, new Random(SEED));
	buildBanners(decor);
	buildBraziers(decor);
}

/** Warm late-afternoon lighting. Idempotent: destroys previously created effects by name first. */
export function setupLighting(): void {
	const lighting = game.GetService("Lighting");
	lighting.ClockTime = 17;
	lighting.GeographicLatitude = 35;
	lighting.Brightness = 2.4;
	lighting.Ambient = colourOf(0x5a5048);
	lighting.OutdoorAmbient = colourOf(0x9a8f80);
	lighting.ShadowSoftness = 0.4;
	lighting.EnvironmentDiffuseScale = 0.5;
	lighting.EnvironmentSpecularScale = 0.5;

	for (const name of ["Atmosphere", "MatchCC", "MatchBloom", "MatchSunRays"]) {
		const old = lighting.FindFirstChild(name);
		if (old !== undefined) old.Destroy();
	}

	const atmosphere = new Instance("Atmosphere");
	atmosphere.Name = "Atmosphere";
	atmosphere.Density = 0.3;
	atmosphere.Offset = 0.15;
	atmosphere.Color = colourOf(0xe8d2b0);
	atmosphere.Decay = colourOf(0xa08868);
	atmosphere.Glare = 0.2;
	atmosphere.Haze = 1.2;
	atmosphere.Parent = lighting;

	const cc = new Instance("ColorCorrectionEffect");
	cc.Name = "MatchCC";
	cc.Saturation = 0.1;
	cc.Contrast = 0.05;
	cc.Brightness = 0.02;
	cc.TintColor = colourOf(0xfff4e6);
	cc.Parent = lighting;

	const bloom = new Instance("BloomEffect");
	bloom.Name = "MatchBloom";
	bloom.Intensity = 0.35;
	bloom.Size = 24;
	bloom.Threshold = 1.3;
	bloom.Parent = lighting;

	const sunRays = new Instance("SunRaysEffect");
	sunRays.Name = "MatchSunRays";
	sunRays.Intensity = 0.04;
	sunRays.Spread = 0.6;
	sunRays.Parent = lighting;
}
