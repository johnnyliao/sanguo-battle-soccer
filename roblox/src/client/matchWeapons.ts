// Match-side weapon handling: procedural orientation for long / heavy weapons (via the shared weaponPose controller) and
// weapon trails that are switched on during attacks. Swords and fans keep their hand weld.
import { colorOf } from "./actor";
import * as fx from "./fx";
import type { LordWeapon } from "shared/net";
import { initWeaponPose, startWeaponAttack } from "./weaponPose";
import { weaponPoseIdFor } from "./weapons";

/** Takes over the weapon pose of a match avatar and builds one trail per weapon part. lordWeapon picks the pose of a lord's weapon. */
export function initMatchWeapon(model: Model, charId: string, root: BasePart, lordWeapon?: LordWeapon): Trail[] {
	initWeaponPose(model, weaponPoseIdFor(charId, lordWeapon), root);
	const trails: Trail[] = [];
	const weapon = model.FindFirstChild("Weapon");
	if (weapon === undefined) return trails;
	const color = colorOf(charId);
	for (const d of weapon.GetDescendants()) {
		if (!d.IsA("Attachment") || (d.Name !== "RightGrip" && d.Name !== "LeftGrip")) continue;
		const part = d.Parent;
		if (part === undefined || !part.IsA("BasePart")) continue;
		const s = part.Size;
		// The longest axis of the weapon part is its blade / shaft; the tip is the end farther from the grip.
		let axis = new Vector3(0, 1, 0);
		let half = s.Y / 2;
		let gripComp = d.Position.Y;
		if (s.X >= s.Y && s.X >= s.Z) {
			axis = new Vector3(1, 0, 0);
			half = s.X / 2;
			gripComp = d.Position.X;
		} else if (s.Z >= s.Y && s.Z >= s.X) {
			axis = new Vector3(0, 0, 1);
			half = s.Z / 2;
			gripComp = d.Position.Z;
		}
		const tipSign = gripComp > 0 ? -1 : 1;
		const t = fx.makeTrail(part, axis.mul(tipSign * half * 0.7), axis.mul(tipSign * half), color);
		t.Lifetime = 0.18;
		t.Transparency = new NumberSequence([new NumberSequenceKeypoint(0, 0.35), new NumberSequenceKeypoint(1, 1)]);
		trails.push(t);
	}
	return trails;
}

export function setMatchTrails(trails: Trail[], on: boolean): void {
	for (const t of trails) t.Enabled = on;
}

/** Starts the scripted weapon swing (no-op for sword / fan classes); `len` in seconds. */
export function swingMatchWeapon(model: Model, len: number): void {
	startWeaponAttack(model, len);
}
