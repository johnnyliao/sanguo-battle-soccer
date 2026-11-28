// Lord cosmetic gear (R3b-2, 外觀部件拼裝): builds the parts a look picks (shared/cosmetics.ts) from plain Parts welded to
// the lord model's R15 parts. Client only. Part sizes are taken from the model's own Head and UpperTorso, so applyLook
// must run after makeAvatar has scaled the model. Every gear part is named "RankGear_…", massless and non-colliding; a
// repeat call removes the old gear first. Placeholder look until R3b-4 (3D art). The effect slots (beast, trail, orbit,
// entrance, goal) are R3b-3 and are not built here.
import type { LordClass } from "shared/game/data";
import type { LookMap, Slot } from "shared/cosmetics";
import { ART4 } from "./artIds";

const PREFIX = "RankGear_";
/** Length of PREFIX (9). */
const PREFIX_LEN = 9;

/** Main colour of the armour cloth by class (猛將紅、軍師綠、鐵壁藍). */
const CLASS_MAIN: Record<LordClass, Color3> = {
	mengjiang: Color3.fromRGB(180, 40, 40),
	junshi: Color3.fromRGB(40, 130, 70),
	tiebi: Color3.fromRGB(50, 90, 170),
};
const METAL_LEATHER = Color3.fromRGB(110, 72, 40);
const METAL_IRON = Color3.fromRGB(78, 82, 90);
const METAL_SILVER = Color3.fromRGB(214, 218, 226);
const METAL_GOLD = Color3.fromRGB(230, 180, 60);
const GOLD_TRIM = Color3.fromRGB(255, 200, 60);
const WHITE = Color3.fromRGB(255, 255, 255);
const EYE_GLOW = Color3.fromRGB(255, 240, 140);
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

/** The part worn in a slot, or undefined when the slot is empty or set to "none". */
function wornIn(look: LookMap, slot: Slot): string | undefined {
	const id = look[slot];
	return id === undefined || id === "none" ? undefined : id;
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
function addHeadwear(head: BasePart, kind: string, metal: Color3, main: Color3): void {
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
	} else if (kind === "eyeglow") {
		// A glowing slit across the eye opening on the front (-Z).
		const eye = addGear(head, "EyeGlow", Enum.PartType.Block, new Vector3(w * 0.85, h * 0.12, d * 0.06), new CFrame(0, h * 0.45, -d * 0.62), EYE_GLOW);
		eye.Material = Enum.Material.Neon;
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

/** Helmet part ids → the headwear kind and metal colour. */
function addHelmet(head: BasePart, id: string, main: Color3): void {
	if (id === "helmet_cloth") addHeadwear(head, "cloth", main, main);
	else if (id === "helmet_leather") addHeadwear(head, "leather", METAL_LEATHER, main);
	else if (id === "helmet_iron_plume") addHeadwear(head, "plume", METAL_IRON, main);
	else if (id === "helmet_eyeglow") addHeadwear(head, "eyeglow", METAL_IRON, main);
	else if (id === "helmet_phoenix") addHeadwear(head, "phoenix", METAL_GOLD, main);
	else if (id === "helmet_dragon") addHeadwear(head, "dragon", METAL_GOLD, main);
}

/** Chest plate on the front (-Z) of the torso. Cloth rags are a soft class-coloured panel. */
function addChest(torso: BasePart, id: string, main: Color3): void {
	const w = torso.Size.X;
	const h = torso.Size.Y;
	const d = torso.Size.Z;
	if (id === "chest_rags") {
		const rags = addGear(torso, "ChestRags", Enum.PartType.Block, new Vector3(w * 0.92, h * 0.6, d * 0.12), new CFrame(0, -h * 0.1, -d * 0.56), main);
		rags.Material = Enum.Material.Fabric;
		return;
	}
	let metal = METAL_GOLD;
	if (id === "chest_leather") metal = METAL_LEATHER;
	else if (id === "chest_iron") metal = METAL_IRON;
	else if (id === "chest_silver_shiny" || id === "chest_silver_gold") metal = METAL_SILVER;
	const plate = addGear(torso, "ChestPlate", Enum.PartType.Block, new Vector3(w * 0.92, h * 0.82, d * 0.12), new CFrame(0, 0, -d * 0.56), metal);
	if (id === "chest_silver_shiny") {
		plate.Material = Enum.Material.Metal;
		plate.Reflectance = 0.3;
	} else if (id === "chest_silver_gold") {
		// Gold trim down both sides of the silver plate.
		for (const sign of [-1, 1]) {
			addGear(torso, sign < 0 ? "TrimL" : "TrimR", Enum.PartType.Block, new Vector3(w * 0.07, h * 0.82, d * 0.14), new CFrame(sign * w * 0.46, 0, -d * 0.56), GOLD_TRIM);
		}
	} else if (id === "chest_gold_thunder") {
		plate.Material = Enum.Material.Metal;
		plate.Reflectance = 0.2;
		// A glowing thunder stripe slanting across the plate.
		const bolt = addGear(torso, "Thunder", Enum.PartType.Block, new Vector3(w * 0.08, h * 0.7, d * 0.04), new CFrame(0, 0, -d * 0.63).mul(CFrame.Angles(0, 0, 0.35)), EYE_GLOW);
		bolt.Material = Enum.Material.Neon;
	} else if (id === "chest_dragon") {
		// Gold trim along the bottom edge of the dragon plate.
		addGear(torso, "DragonTrim", Enum.PartType.Block, new Vector3(w * 0.92, h * 0.1, d * 0.14), new CFrame(0, -h * 0.36, -d * 0.56), GOLD_TRIM);
	}
}

/** Shoulder guards: two balls on the torso's upper corners, in leather, silver or gold. */
function addShoulders(torso: BasePart, id: string): void {
	const w = torso.Size.X;
	const h = torso.Size.Y;
	const d = torso.Size.Z;
	let metal = METAL_GOLD;
	if (id === "shoulder_leather") metal = METAL_LEATHER;
	else if (id === "shoulder_silver") metal = METAL_SILVER;
	const size = id === "shoulder_dragon" ? h * 0.5 : h * 0.4;
	for (const sign of [-1, 1]) {
		const shoulder = addGear(torso, sign < 0 ? "ShoulderL" : "ShoulderR", Enum.PartType.Ball, new Vector3(w * 0.5, size, d * 0.7), new CFrame(sign * w * 0.5, h * 0.38, 0), metal);
		if (id === "shoulder_lion" && sign > 0) {
			// Lion shoulder puffs steam (one emitter is enough).
			const steam = new Instance("ParticleEmitter");
			steam.Texture = "rbxasset://textures/particles/smoke_main.dds";
			steam.Color = new ColorSequence(Color3.fromRGB(255, 255, 255));
			steam.Size = new NumberSequence(0.6);
			steam.Transparency = new NumberSequence(0.5);
			steam.Lifetime = new NumberRange(0.6, 1);
			steam.Rate = 4;
			steam.Speed = new NumberRange(1, 2);
			steam.SpreadAngle = new Vector2(20, 20);
			steam.Parent = shoulder;
		}
	}
}

/**
 * Cape hanging from the back of the torso: short ends at the waist, the others reach the calf. kind: short = brown,
 * long = red, gold = red with gold trim, dragon = gold cloth. flame adds a class-coloured fire along the bottom edge.
 */
function addCape(torso: BasePart, kind: string, main: Color3, flame: boolean): void {
	const s = torso.Size;
	const w = s.X;
	const h = s.Y;
	const d = s.Z;
	const short = kind === "short";
	const length = short ? h * 1.2 : h * 3.2;
	const top = h * 0.45;
	const cloth = short ? CAPE_BROWN : kind === "dragon" ? CAPE_GOLD : CAPE_RED;
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
	if (flame) {
		// An invisible anchor on the bottom edge carries the fire emitter.
		const anchor = addGear(torso, "CapeFlame", Enum.PartType.Block, new Vector3(w * 0.85, h * 0.1, d * 0.1), new CFrame(0, top - length, d * 0.5 + d * 0.04), main);
		anchor.Transparency = 1;
		const fire = new Instance("ParticleEmitter");
		fire.Texture = "rbxasset://textures/particles/fire_main.dds";
		fire.Color = new ColorSequence(main);
		fire.Size = new NumberSequence(0.6);
		fire.Lifetime = new NumberRange(0.5, 0.9);
		fire.Rate = 20;
		fire.Speed = new NumberRange(0.5, 1.5);
		fire.SpreadAngle = new Vector2(25, 25);
		fire.LightEmission = 0.6;
		fire.EmissionDirection = Enum.NormalId.Bottom;
		fire.Parent = anchor;
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

/**
 * Wings: one transparent sheet on the back, wide enough for both wings, with the wing art on both faces (Front faces
 * the torso, Back faces out). The art label fits the sheet.
 */
function addWings(torso: BasePart, image: string, transparency: number): void {
	const w = torso.Size.X;
	const h = torso.Size.Y;
	const d = torso.Size.Z;
	const backZ = d * 0.5 + d * 0.2;
	const wings = addGear(torso, "WingsArt", Enum.PartType.Block, new Vector3(w * 4.4, w * 2.2, d * 0.04), new CFrame(0, h * 0.45, backZ), WHITE);
	wings.Transparency = 1;
	for (const face of [Enum.NormalId.Front, Enum.NormalId.Back]) {
		const gui = new Instance("SurfaceGui");
		gui.Name = "RankGear_WingsGui";
		gui.Face = face;
		gui.AlwaysOnTop = false;
		gui.LightInfluence = 0;
		// Canvas follows the face size, so the 2:1 wing art fills the 2:1 sheet without stretching.
		gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud;
		gui.PixelsPerStud = 100;
		gui.Parent = wings;
		const label = new Instance("ImageLabel");
		label.Name = "RankGear_WingsArt";
		label.BackgroundTransparency = 1;
		label.Size = UDim2.fromScale(1, 1);
		label.Image = image;
		label.ImageTransparency = transparency;
		label.ScaleType = Enum.ScaleType.Fit;
		label.Parent = gui;
	}
}

/** Puts the look's gear on a lord model (R15 rig: Head and UpperTorso must exist). Empty slots and "none" add nothing. */
export function applyLook(model: Model, look: LookMap, lordClass: LordClass): void {
	clearGear(model);
	const head = model.FindFirstChild("Head") as BasePart | undefined;
	const torso = model.FindFirstChild("UpperTorso") as BasePart | undefined;
	if (head === undefined || torso === undefined) return;
	const main = CLASS_MAIN[lordClass];

	const helmet = wornIn(look, "helmet");
	if (helmet !== undefined) addHelmet(head, helmet, main);
	const chest = wornIn(look, "chest");
	if (chest !== undefined) addChest(torso, chest, main);
	const shoulder = wornIn(look, "shoulder");
	if (shoulder !== undefined) addShoulders(torso, shoulder);
	const cape = wornIn(look, "cape");
	if (cape === "cape_brown") addCape(torso, "short", main, false);
	else if (cape === "cape_red") addCape(torso, "long", main, false);
	else if (cape === "cape_flame") addCape(torso, "long", main, true);
	else if (cape === "cape_gold") addCape(torso, "gold", main, false);
	else if (cape === "cape_dragon") addCape(torso, "dragon", main, false);
	const back = wornIn(look, "back");
	if (back === "back_pennant") addFlags(torso, 1, main);
	else if (back === "back_flags2") addFlags(torso, 2, main);
	else if (back === "back_flags4") addFlags(torso, 4, main);
	else if (back === "back_wings_aura") addWings(torso, ART4.wings_aura, 0.35);
	else if (back === "back_wings_gold") addWings(torso, ART4.wings_gold, 0.2);
}
