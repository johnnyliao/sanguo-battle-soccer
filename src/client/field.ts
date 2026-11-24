import { FIELD_STUDS_D, FIELD_STUDS_W, STUDS_PER_PX } from "shared/logic/scale";
import { GK_AREA_DEPTH, GOAL_DEPTH, GOAL_HALF_W, GOAL_H } from "shared/sim/constants";

function makePart(parent: Instance, name: string, size: Vector3, cf: CFrame, color: Color3, transparency = 0): Part {
	const p = new Instance("Part");
	p.Name = name;
	p.Anchored = true;
	p.CanCollide = false;
	p.CanQuery = false;
	p.CanTouch = false;
	p.Size = size;
	p.CFrame = cf;
	p.Color = color;
	p.Material = Enum.Material.SmoothPlastic;
	p.Transparency = transparency;
	p.Parent = parent;
	return p;
}

const WHITE = Color3.fromRGB(245, 245, 245);

function buildGoal(parent: Instance, side: 0 | 1): void {
	const x0 = side === 0 ? 0 : FIELD_STUDS_W;
	const out = side === 0 ? -1 : 1;
	const zc = FIELD_STUDS_D / 2;
	const halfW = GOAL_HALF_W * STUDS_PER_PX;
	const h = GOAL_H * STUDS_PER_PX;
	const depth = GOAL_DEPTH * STUDS_PER_PX;
	const t = 0.3;
	const xb = x0 + out * depth;
	for (const sz of [-1, 1]) {
		makePart(parent, "Post", new Vector3(t, h, t), new CFrame(x0, h / 2, zc + sz * halfW), WHITE);
		makePart(parent, "BackPost", new Vector3(t, h, t), new CFrame(xb, h / 2, zc + sz * halfW), WHITE);
		makePart(parent, "SideNet", new Vector3(depth, h, 0.05), new CFrame((x0 + xb) / 2, h / 2, zc + sz * halfW), WHITE, 0.75);
		makePart(parent, "SideBar", new Vector3(depth, t, t), new CFrame((x0 + xb) / 2, h, zc + sz * halfW), WHITE);
	}
	makePart(parent, "Crossbar", new Vector3(t, t, halfW * 2 + t), new CFrame(x0, h, zc), WHITE);
	makePart(parent, "BackBar", new Vector3(t, t, halfW * 2 + t), new CFrame(xb, h, zc), WHITE);
	makePart(parent, "BackNet", new Vector3(0.05, h, halfW * 2), new CFrame(xb, h / 2, zc), WHITE, 0.75);
	makePart(parent, "RoofNet", new Vector3(depth, 0.05, halfW * 2), new CFrame((x0 + xb) / 2, h, zc), WHITE, 0.8);
}

/** Builds the pitch under Workspace: grass, lines, two goals and a dark out-of-bounds border. Returns the folder. */
export function buildField(): Folder {
	const folder = new Instance("Folder");
	folder.Name = "SanguoField";
	const W = FIELD_STUDS_W;
	const D = FIELD_STUDS_D;

	// Out of bounds: dark ground around the pitch, just below the grass.
	makePart(folder, "OutOfBounds", new Vector3(W + 60, 1, D + 40), new CFrame(W / 2, -0.6, D / 2), Color3.fromRGB(34, 36, 40));

	// Grass in alternating stripes.
	const stripes = 12;
	const sw = W / stripes;
	for (let i = 0; i < stripes; i++) {
		const color = i % 2 === 0 ? Color3.fromRGB(78, 164, 84) : Color3.fromRGB(68, 150, 74);
		makePart(folder, "Grass", new Vector3(sw, 1, D), new CFrame(sw * i + sw / 2, -0.5, D / 2), color);
	}

	// White lines, 0.06 studs thick on top of the grass.
	const lt = 0.25;
	const line = (sx: number, sz: number, cx: number, cz: number, yaw = 0): void => {
		makePart(folder, "Line", new Vector3(sx, 0.06, sz), new CFrame(cx, 0.03, cz).mul(CFrame.Angles(0, yaw, 0)), WHITE);
	};
	line(W, lt, W / 2, lt / 2);
	line(W, lt, W / 2, D - lt / 2);
	line(lt, D, lt / 2, D / 2);
	line(lt, D, W - lt / 2, D / 2);
	line(lt, D, W / 2, D / 2);
	const area = GK_AREA_DEPTH * STUDS_PER_PX;
	line(lt, D, area, D / 2);
	line(lt, D, W - area, D / 2);
	// Centre circle from short segments.
	const segs = 28;
	const radius = 4;
	const segLen = (2 * math.pi * radius) / segs + 0.08;
	for (let i = 0; i < segs; i++) {
		const a = (i / segs) * 2 * math.pi;
		line(segLen, lt, W / 2 + math.cos(a) * radius, D / 2 + math.sin(a) * radius, -(a + math.pi / 2));
	}

	buildGoal(folder, 0);
	buildGoal(folder, 1);
	folder.Parent = game.GetService("Workspace");
	return folder;
}
