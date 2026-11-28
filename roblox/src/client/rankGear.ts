// Lord gear by rank (R3b-1, 階級外觀): headwear, shoulder guards, chest plate, cape, back flags and glow, built from plain
// Parts and welded to the lord model's R15 parts. Client only. Part sizes are taken from the model's own Head and
// UpperTorso, so applyRankGear must run after makeAvatar has scaled the model. Every gear part is named "RankGear_…",
// massless and non-colliding; a repeat call removes the old gear first. Placeholder look until R3b-2 (3D art).
import type { LordClass } from "shared/game/data";
import { rankByTier, type CapeKind, type HeadwearKind, type MetalKind } from "shared/rank";

const PREFIX = "RankGear_";
/** Length of PREFIX (9). */
const PREFIX_LEN = 9;

/** Main colour of the armour cloth by class (猛將紅、軍師綠、鐵壁藍). */
const CLASS_MAIN: Record<LordClass, Color3> = {
	mengjiang: Color3.fromRGB(180, 40, 40),
	junshi: Color3.fromRGB(40, 130, 70),
	tiebi: Color3.fromRGB(50, 90, 170),
};
const METAL_COLOUR: Record<MetalKind, Color3> = {
	cloth: Color3.fromRGB(138, 138, 138),
	leather: Color3.fromRGB(110, 72, 40),
	iron: Color3.fromRGB(78, 82, 90),
	silver: Color3.fromRGB(214, 218, 226),
	gold: Color3.fromRGB(230, 180, 60),
};
const GOLD_TRIM = Color3.fromRGB(255, 200, 60);
const PLUME_RED = Color3.fromRGB(198, 40, 40);
const FLAG_POLE = Color3.fromRGB(90, 60, 30);
const CAPE_BROWN = Color3.fromRGB(110, 68, 35);
const CAPE_RED = Color3.fromRGB(183, 28, 28);
const CAPE_GOLD = Color3.fromRGB(255, 213, 74);
/** Back flag poles: x of each pole as a fraction of the torso width (1 / 2 / 4 flags). */
const FLAG_X: Record<number, number[]> = {
	1: [0],
	2: [-0.3, 0.3],
	4: [-0.45, -0.15, 0.15, 0.45],
};

/** Removes the gear of an earlier call (every part named with the RankGear_ prefix). */
function clearGear(model: Model): void {
	for (const d of model.GetDescendants()) {
		if (string.sub(d.Name, 1, PREFIX_LEN) === PREFIX) d.Destroy();
	}
}

/** One gear part welded to `anchor` at `offset` (a CFrame in the anchor's local space). Returns the part. */
function addGear(anchor: BasePart, name: string, shape: Enum.PartType, size: Vector3, offset: CFrame, colour: Color3): Part {
	const part = new Instance("Part");
	part.Name = `${PREFIX}${name}`;
	part.Shape = shape;
	part.Size = size;
	part.Color = colour;
	part.Material = Enum.Material.SmoothPlastic;
	part.Anchored = false;
	part.CanCollide = false;
	part.CanQuery = false;
	part.CanTouch = false;
	part.Massless = true;
	part.CFrame = anchor.CFrame.mul(offset);
	part.Parent = anchor.Parent;
	const weld = new Instance("Weld");
	weld.Part0 = anchor;
	weld.Part1 = part;
	weld.C0 = offset;
	weld.Parent = part;
	return part;
}

/** Headwear on the Head: cloth = flat round headband, the others = a helmet (metal) with its extra piece. */
function addHeadwear(head: BasePart, kind: HeadwearKind, metal: Color3, main: Color3): void {
	const s = head.Size;
	const w = s.X;
	const h = s.Y;
	const d = s.Z;
	if (kind === "cloth") {
		// A cylinder lies flat: its length (X) is turned to Y by the rotation, so Size.X is the thickness.
		const flat = new CFrame(0, h * 0.42, 0).mul(CFrame.Angles(0, 0, math.pi / 2));
		addGear(head, "Headband", Enum.PartType.Cylinder, new Vector3(h * 0.18, w * 1.12, d * 1.12), flat, main);
		return;
	}
	addGear(head, "Helmet", Enum.PartType.Ball, new Vector3(w * 1.18, h * 0.8, d * 1.18), new CFrame(0, h * 0.45, 0), metal);
	if (kind === "plume") {
		addGear(head, "Plume", Enum.PartType.Block, new Vector3(w * 0.12, h * 0.45, d * 0.9), new CFrame(0, h * 1.02, 0), PLUME_RED);
	} else if (kind === "phoenix") {
		// Two wing flakes on the helmet sides, leaning outward.
		for (const sign of [-1, 1]) {
			const wing = new CFrame(sign * w * 0.6, h * 0.55, 0).mul(CFrame.Angles(0, 0, -sign * 0.45));
			addGear(head, sign < 0 ? "WingL" : "WingR", Enum.PartType.Block, new Vector3(w * 0.1, h * 0.7, d * 0.5), wing, GOLD_TRIM);
		}
	} else if (kind === "dragon") {
		// Two dragon horns on the front top, leaning forward and out.
		for (const sign of [-1, 1]) {
			const horn = new CFrame(sign * w * 0.28, h * 0.95, -d * 0.55).mul(CFrame.Angles(0.5, 0, sign * 0.35));
			addGear(head, sign < 0 ? "HornL" : "HornR", Enum.PartType.Block, new Vector3(w * 0.08, h * 0.5, d * 0.08), horn, GOLD_TRIM);
		}
	}
}

/** Shoulder guards (two balls on the torso's upper corners) and the chest plate on the front (-Z). */
function addArmour(torso: BasePart, metal: Color3, showShoulders: boolean): void {
	const s = torso.Size;
	const w = s.X;
	const h = s.Y;
	const d = s.Z;
	if (showShoulders) {
		for (const sign of [-1, 1]) {
			const shoulder = new CFrame(sign * w * 0.5, h * 0.38, 0);
			addGear(torso, sign < 0 ? "ShoulderL" : "ShoulderR", Enum.PartType.Ball, new Vector3(w * 0.5, h * 0.4, d * 0.7), shoulder, metal);
		}
	}
	const plate = new CFrame(0, 0, -d * 0.56);
	addGear(torso, "ChestPlate", Enum.PartType.Block, new Vector3(w * 0.92, h * 0.82, d * 0.12), plate, metal);
}

/** Cape hanging from the back of the torso: short ends at the waist, the others reach the calf. */
function addCape(torso: BasePart, kind: CapeKind): void {
	const s = torso.Size;
	const w = s.X;
	const h = s.Y;
	const d = s.Z;
	const length = kind === "short" ? h * 1.2 : h * 3.2;
	const top = h * 0.45;
	const cloth = kind === "short" ? CAPE_BROWN : kind === "dragon" ? CAPE_GOLD : CAPE_RED;
	const centre = new CFrame(0, top - length / 2, d * 0.5 + d * 0.04);
	addGear(torso, "Cape", Enum.PartType.Block, new Vector3(w * 0.85, length, d * 0.06), centre, cloth);
	if (kind === "gold") {
		// Red cape with gold trim: a bottom edge and two side edges.
		const bottom = new CFrame(0, top - length + h * 0.05, d * 0.5 + d * 0.04);
		addGear(torso, "CapeTrimBottom", Enum.PartType.Block, new Vector3(w * 0.9, h * 0.1, d * 0.08), bottom, GOLD_TRIM);
		for (const sign of [-1, 1]) {
			const edge = new CFrame(sign * w * 0.425, top - length / 2, d * 0.5 + d * 0.04);
			addGear(torso, sign < 0 ? "CapeTrimL" : "CapeTrimR", Enum.PartType.Block, new Vector3(w * 0.05, length, d * 0.08), edge, GOLD_TRIM);
		}
	}
}

/** Back flags: a thin pole per flag on the back of the torso, with a square flag in the class colour near the top. */
function addFlags(torso: BasePart, count: number, main: Color3): void {
	const xs = FLAG_X[count];
	if (xs === undefined) return;
	const s = torso.Size;
	const w = s.X;
	const h = s.Y;
	const d = s.Z;
	const backZ = d * 0.5 + d * 0.2;
	for (let i = 0; i < xs.size(); i++) {
		const x = xs[i] * w;
		const pole = new CFrame(x, h * 0.3, backZ);
		addGear(torso, `FlagPole${i}`, Enum.PartType.Block, new Vector3(w * 0.04, h * 2.2, d * 0.04), pole, FLAG_POLE);
		const flag = new CFrame(x + w * 0.45, h * 0.85, backZ);
		addGear(torso, `Flag${i}`, Enum.PartType.Block, new Vector3(w * 0.9, h * 0.55, d * 0.04), flag, main);
	}
}

/** Gold light and a few gold sparkles around the torso. */
function addGlow(torso: BasePart): void {
	const glow = addGear(torso, "Glow", Enum.PartType.Block, new Vector3(0.2, 0.2, 0.2), new CFrame(0, 0, 0), GOLD_TRIM);
	glow.Transparency = 1;
	const light = new Instance("PointLight");
	light.Color = GOLD_TRIM;
	light.Brightness = 1;
	light.Range = torso.Size.Y * 4;
	light.Parent = glow;
	const sparks = new Instance("ParticleEmitter");
	sparks.Texture = "rbxasset://textures/particles/sparkles_main.dds";
	sparks.Color = new ColorSequence(GOLD_TRIM);
	sparks.Size = new NumberSequence(0.4);
	sparks.Transparency = new NumberSequence(0.2);
	sparks.Lifetime = new NumberRange(0.8, 1.4);
	sparks.Rate = 5;
	sparks.Speed = new NumberRange(0.5, 1.5);
	sparks.SpreadAngle = new Vector2(180, 180);
	sparks.LightEmission = 1;
	sparks.Parent = glow;
}

/** Puts the gear for a rank tier on a lord model (R15 rig: Head and UpperTorso must exist). */
export function applyRankGear(model: Model, tier: number, lordClass: LordClass): void {
	clearGear(model);
	const rank = rankByTier(tier);
	const head = model.FindFirstChild("Head") as BasePart | undefined;
	const torso = model.FindFirstChild("UpperTorso") as BasePart | undefined;
	if (head === undefined || torso === undefined) return;
	const main = CLASS_MAIN[lordClass];
	const metal = METAL_COLOUR[rank.metal];

	addHeadwear(head, rank.headwear, metal, main);
	addArmour(torso, metal, rank.metal !== "cloth");
	if (rank.cape !== "none") addCape(torso, rank.cape);
	if (rank.backFlags > 0) addFlags(torso, rank.backFlags, main);
	if (rank.glow) addGlow(torso);
}
