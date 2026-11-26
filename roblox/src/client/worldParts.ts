// Shared helpers and dimensions for the static stadium (world.ts, worldCrowd.ts, worldDecor.ts).
// Coordinates: sim px * STUDS_PER_PX. Sim x -> World X (0..FIELD_LEN studs), sim y -> World Z (0..FIELD_WID), height -> Y.
// The camera sits on the near side (+Z, beyond FIELD_WID) looking toward -Z at 38 degrees down, so anything at
// Z > FIELD_WID must stay low (about 2.5 studs) or it blocks the view.
import { STUDS_PER_PX } from "shared/net";
import { FIELD_D, FIELD_W } from "shared/game/sim/constants";

export const FIELD_LEN = FIELD_W * STUDS_PER_PX; // along X
export const FIELD_WID = FIELD_D * STUDS_PER_PX; // along Z

/** 0xRRGGBB -> Color3. shade scales each channel (clamped to 255). */
export function colourOf(hex: number, shade = 1): Color3 {
	const r = math.min(255, math.floor((math.floor(hex / 65536) % 256) * shade));
	const g = math.min(255, math.floor((math.floor(hex / 256) % 256) * shade));
	const b = math.min(255, math.floor((hex % 256) * shade));
	return Color3.fromRGB(r, g, b);
}

/** Anchored, non-colliding, non-queryable decorative part. */
export function part(parent: Instance, name: string, size: Vector3, cf: CFrame, colour: Color3, transparency = 0): Part {
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
