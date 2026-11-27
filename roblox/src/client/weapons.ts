// Weapon attachment for 3D avatars. ReplicatedStorage.Weapons.<charId> is a Model whose MeshParts each hold an Attachment
// named "RightGrip" or "LeftGrip"; the part is welded to the matching hand grip attachment. Missing weapon -> nothing.
import type { LordWeapon } from "shared/net";
import { isLordId, isSoldierId } from "./animIds";

const ReplicatedStorage = game.GetService("ReplicatedStorage");

/** Weapon templates tried for a lord, in order (the fan falls back to xiaoqiao when zhugeliang has no template). */
const LORD_WEAPON_TEMPLATES: Record<LordWeapon, string[]> = {
	sword: ["caocao"],
	spear: ["zhaoyun"],
	fan: ["zhugeliang", "xiaoqiao"],
};

let weaponFolder: Instance | undefined;

/** Looks up ReplicatedStorage.Weapons without yielding (the server copies it together with Avatars). */
function getWeaponFolder(): Instance | undefined {
	if (weaponFolder === undefined) {
		weaponFolder = ReplicatedStorage.FindFirstChild("Weapons");
	}
	return weaponFolder;
}

/**
 * Weapon template name for a charId: its own Weapons entry if present; lord_* falls back to the generic sword (caocao),
 * xiaobing_* to the generic spear (zhaoyun). A lord uses its chosen weapon (sword / spear / fan; undefined = sword).
 * Returns the charId itself when nothing applies (then no weapon is attached).
 */
export function weaponNameFor(folder: Instance, charId: string, lordWeapon?: LordWeapon): string {
	if (folder.FindFirstChild(charId) !== undefined) return charId;
	if (isLordId(charId)) {
		for (const name of LORD_WEAPON_TEMPLATES[lordWeapon ?? "sword"]) {
			if (folder.FindFirstChild(name) !== undefined) return name;
		}
		return "caocao";
	}
	if (isSoldierId(charId)) return "zhaoyun";
	return charId;
}

/** Pose id for a lord's weapon: a spear lord uses zhaoyun's procedural spear pose; sword and fan keep the hand weld. Other ids unchanged. */
export function weaponPoseIdFor(charId: string, lordWeapon?: LordWeapon): string {
	return isLordId(charId) && lordWeapon === "spear" ? "zhaoyun" : charId;
}

/** Clones the character's weapon, scales it by `factor` (avatar scale relative to its template) and welds every grip part to the hands. Returns the weapon parts. */
export function attachWeapons(avatar: Model, charId: string, factor: number, lordWeapon?: LordWeapon): BasePart[] {
	const parts: BasePart[] = [];
	const folder = getWeaponFolder();
	if (folder === undefined) return parts;
	const template = folder.FindFirstChild(weaponNameFor(folder, charId, lordWeapon));
	if (template === undefined) return parts;

	let weapon: Model;
	if (template.IsA("Model")) {
		weapon = template.Clone();
	} else if (template.IsA("BasePart")) {
		weapon = new Instance("Model");
		template.Clone().Parent = weapon;
	} else {
		return parts;
	}
	weapon.Name = "Weapon";
	if (factor > 0 && factor !== 1) {
		weapon.ScaleTo(weapon.GetScale() * factor);
	}

	for (const d of weapon.GetDescendants()) {
		if (!d.IsA("Attachment")) continue;
		const isRight = d.Name === "RightGrip";
		if (!isRight && d.Name !== "LeftGrip") continue;
		const part = d.Parent;
		if (part === undefined || !part.IsA("BasePart")) continue;
		const hand = avatar.FindFirstChild(isRight ? "RightHand" : "LeftHand");
		if (hand === undefined || !hand.IsA("BasePart")) continue;
		const grip = hand.FindFirstChild(isRight ? "RightGripAttachment" : "LeftGripAttachment");
		if (grip === undefined || !grip.IsA("Attachment")) continue;
		part.Massless = true;
		part.CanCollide = false;
		part.CanQuery = false;
		part.CanTouch = false;
		part.Anchored = false;
		const weld = new Instance("Weld");
		weld.Name = "WeaponGrip";
		weld.Part0 = hand;
		weld.Part1 = part;
		weld.C0 = grip.CFrame;
		weld.C1 = d.CFrame;
		weld.Parent = part;
		parts.push(part);
	}
	// Any other part of the weapon model (not welded) must not stay anchored or collide.
	for (const d of weapon.GetDescendants()) {
		if (d.IsA("BasePart")) {
			d.CanCollide = false;
			d.CanQuery = false;
			d.CanTouch = false;
			d.Massless = true;
		}
	}
	weapon.Parent = avatar;
	return parts;
}
