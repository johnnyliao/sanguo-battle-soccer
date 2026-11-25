// Weapon attachment for 3D avatars. ReplicatedStorage.Weapons.<charId> is a Model whose MeshParts each hold an Attachment
// named "RightGrip" or "LeftGrip"; the part is welded to the matching hand grip attachment. Missing weapon -> nothing.
const ReplicatedStorage = game.GetService("ReplicatedStorage");

let weaponFolder: Instance | undefined;

/** Looks up ReplicatedStorage.Weapons without yielding (the server copies it together with Avatars). */
function getWeaponFolder(): Instance | undefined {
	if (weaponFolder === undefined) {
		weaponFolder = ReplicatedStorage.FindFirstChild("Weapons");
	}
	return weaponFolder;
}

/** Clones the character's weapon, scales it by `factor` (avatar scale relative to its template) and welds every grip part to the hands. Returns the weapon parts. */
export function attachWeapons(avatar: Model, charId: string, factor: number): BasePart[] {
	const parts: BasePart[] = [];
	const folder = getWeaponFolder();
	if (folder === undefined) return parts;
	const template = folder.FindFirstChild(charId);
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
