// Showroom props (bike, boat, ship, rider, tiger head, arrow): ReplicatedStorage.Props.<name> when present,
// otherwise a bright neon stand-in built from parts. Props are anchored and moved with PivotTo; they face -Z (LookVector).
import * as fx from "./fx";

const ReplicatedStorage = game.GetService("ReplicatedStorage");

export interface Prop {
	model: Model;
	/** Rider root position in the prop's pivot frame. */
	seat: Vector3;
	/** The pivot sits `lift` above the ground reference (real models are pivoted at their bounding-box centre). */
	lift: number;
	real: boolean;
}

interface Piece {
	shape: Enum.PartType;
	size: Vector3;
	pos: Vector3;
	rotX?: number;
	color: Color3;
}

function piece(shape: Enum.PartType, size: Vector3, pos: Vector3, color: Color3, rotX = 0): Piece {
	return { shape, size, pos, color, rotX };
}

const B = Enum.PartType.Block;
const BALL = Enum.PartType.Ball;
const WHITE = Color3.fromRGB(255, 255, 255);

function standInPieces(kind: string, color: Color3): Piece[] {
	const gold = Color3.fromRGB(255, 210, 60);
	const dark = Color3.fromRGB(40, 30, 50);
	if (kind === "bike") {
		return [
			piece(B, new Vector3(2.2, 1.4, 8), new Vector3(0, 2.2, 0), color),
			piece(BALL, new Vector3(3.4, 3.4, 3.4), new Vector3(0, 1.7, -3.4), gold),
			piece(BALL, new Vector3(3.4, 3.4, 3.4), new Vector3(0, 1.7, 3.4), gold),
			piece(B, new Vector3(3.6, 0.4, 0.4), new Vector3(0, 3.8, -3), WHITE),
			piece(B, new Vector3(1.2, 1, 3), new Vector3(0, 3.2, 2), gold),
		];
	}
	if (kind === "boat") {
		return [
			piece(B, new Vector3(6, 2, 14), new Vector3(0, 1.2, 0), color),
			piece(B, new Vector3(4, 1.2, 4), new Vector3(0, 2.4, -8), color, -25),
			piece(B, new Vector3(0.5, 9, 0.5), new Vector3(0, 6.5, 1), gold),
			piece(B, new Vector3(0.3, 6.5, 5), new Vector3(0, 7, 3.5), WHITE),
			piece(B, new Vector3(6.4, 0.5, 14.4), new Vector3(0, 2.3, 0), gold),
		];
	}
	if (kind === "ship") {
		return [
			piece(B, new Vector3(9, 3.5, 24), new Vector3(0, 2, 0), color),
			piece(B, new Vector3(6, 2, 6), new Vector3(0, 4, -14), color, -25),
			piece(B, new Vector3(9.6, 0.7, 24.4), new Vector3(0, 3.8, 0), gold),
			piece(B, new Vector3(0.8, 18, 0.8), new Vector3(0, 12, -4), gold),
			piece(B, new Vector3(0.4, 11, 9), new Vector3(0, 13, -4), WHITE),
			piece(B, new Vector3(0.8, 14, 0.8), new Vector3(0, 11, 6), gold),
			piece(B, new Vector3(0.4, 9, 7), new Vector3(0, 12, 6), WHITE),
			piece(B, new Vector3(3, 3, 4), new Vector3(0, 5.5, 9), dark),
		];
	}
	if (kind === "horse") {
		return [
			piece(B, new Vector3(2.4, 3, 5.6), new Vector3(0, 3.8, 0), color),
			piece(B, new Vector3(1.3, 2.8, 2.4), new Vector3(0, 5.6, -3.4), color, 30),
			piece(B, new Vector3(0.7, 2.8, 0.7), new Vector3(-0.8, 1.4, -2), color),
			piece(B, new Vector3(0.7, 2.8, 0.7), new Vector3(0.8, 1.4, -2), color),
			piece(B, new Vector3(0.7, 2.8, 0.7), new Vector3(-0.8, 1.4, 2), color),
			piece(B, new Vector3(0.7, 2.8, 0.7), new Vector3(0.8, 1.4, 2), color),
			piece(B, new Vector3(1.7, 3.2, 1.5), new Vector3(0, 6.9, 0), gold),
			piece(BALL, new Vector3(1.7, 1.7, 1.7), new Vector3(0, 9, 0), WHITE),
			piece(B, new Vector3(0.3, 0.3, 8), new Vector3(1.5, 7.2, -1.5), WHITE),
		];
	}
	if (kind === "tiger") {
		const orange = Color3.fromRGB(255, 150, 20);
		return [
			piece(BALL, new Vector3(13, 13, 13), new Vector3(0, 8, 0), orange),
			piece(BALL, new Vector3(3.4, 3.4, 3.4), new Vector3(-5, 14, 0), orange),
			piece(BALL, new Vector3(3.4, 3.4, 3.4), new Vector3(5, 14, 0), orange),
			piece(BALL, new Vector3(2, 2, 2), new Vector3(-3, 10, -5.6), WHITE),
			piece(BALL, new Vector3(2, 2, 2), new Vector3(3, 10, -5.6), WHITE),
			piece(B, new Vector3(9, 3, 6), new Vector3(0, 2.2, -2.6), Color3.fromRGB(190, 20, 40)),
			piece(B, new Vector3(1.2, 3.6, 1.2), new Vector3(-2.6, 4.6, -5.4), WHITE),
			piece(B, new Vector3(1.2, 3.6, 1.2), new Vector3(2.6, 4.6, -5.4), WHITE),
			piece(B, new Vector3(1.2, 3, 1.2), new Vector3(-2.6, 0.9, -5.4), WHITE),
			piece(B, new Vector3(1.2, 3, 1.2), new Vector3(2.6, 0.9, -5.4), WHITE),
			piece(B, new Vector3(0.8, 5, 0.8), new Vector3(0, 12, -6), dark),
			piece(B, new Vector3(0.8, 4, 0.8), new Vector3(-3, 11.5, -6), dark),
			piece(B, new Vector3(0.8, 4, 0.8), new Vector3(3, 11.5, -6), dark),
		];
	}
	// arrow
	return [piece(B, new Vector3(0.2, 0.2, 3.4), new Vector3(0, 0, 0), color), piece(B, new Vector3(0.6, 0.6, 0.9), new Vector3(0, 0, -1.9), WHITE)];
}

function seatFor(kind: string, footOffset: number): Vector3 {
	if (kind === "bike") return new Vector3(0, 2.9 + footOffset, 0.4);
	if (kind === "boat") return new Vector3(0, 2.6 + footOffset, 1.5);
	if (kind === "ship") return new Vector3(0, 4.2 + footOffset, 2);
	return new Vector3(0, footOffset, 0);
}

function buildStandIn(kind: string, color: Color3, footOffset: number): Prop {
	const m = new Instance("Model");
	m.Name = kind;
	for (const p of standInPieces(kind, color)) {
		const part = fx.glow(p.shape, new CFrame(p.pos).mul(CFrame.Angles(math.rad(p.rotX ?? 0), 0, 0)), p.size, p.color, 0);
		part.Parent = m;
	}
	m.WorldPivot = new CFrame(0, 0, 0);
	return { model: m, seat: seatFor(kind, footOffset), lift: 0, real: false };
}

/** Clones ReplicatedStorage.Props.<name> (centre pivot, anchored, no collisions) or builds a neon stand-in of `kind`. The model is parented under fx. */
export function makeProp(name: string, kind: string, color: Color3, footOffset: number): Prop {
	const folder = ReplicatedStorage.FindFirstChild("Props");
	const real = folder !== undefined ? folder.FindFirstChild(name) : undefined;
	let prop: Prop;
	if (real !== undefined && real.IsA("Model")) {
		const m = real.Clone();
		for (const d of m.GetDescendants()) {
			if (d.IsA("BasePart")) {
				d.Anchored = true;
				d.CanCollide = false;
				d.CanQuery = false;
				d.CanTouch = false;
			}
		}
		m.WorldPivot = new CFrame(0, 0, 0);
		m.PivotTo(new CFrame(0, 0, 0));
		const [boxCF, boxSize] = m.GetBoundingBox();
		m.WorldPivot = boxCF;
		let seat = new Vector3(0, boxSize.Y / 2 + footOffset, 0);
		const att = m.FindFirstChild("Seat", true);
		if (att !== undefined && att.IsA("Attachment")) {
			seat = boxCF.PointToObjectSpace(att.WorldPosition);
		}
		prop = { model: m, seat, lift: boxSize.Y / 2, real: true };
	} else {
		prop = buildStandIn(kind, color, footOffset);
	}
	prop.model.Parent = fx.getParent();
	return prop;
}

/** Pivot CFrame of the prop for a ground reference `cf`. */
export function propPivot(p: Prop, cf: CFrame): CFrame {
	return cf.mul(new CFrame(0, p.lift, 0));
}

/** Moves the prop and returns the CFrame where a rider's HumanoidRootPart should be. */
export function placeProp(p: Prop, cf: CFrame): CFrame {
	const pivot = propPivot(p, cf);
	p.model.PivotTo(pivot);
	return pivot.mul(new CFrame(p.seat));
}
