// The showroom stage set: round platform with colour-cycling rim lights, backdrop panels, lamp posts and spot / point lights.
// Everything is built client-side far away from the pitch.
import * as fx from "./fx";

export const STAGE_CENTER = new Vector3(0, 200, -600);
const PLATFORM_R = 34;
const RIM_COUNT = 48;
const BACK_COUNT = 16;
const WHITE_C = Color3.fromRGB(255, 255, 255);
const LAMP_COUNT = 8;

export interface StageEnv {
	folder: Folder;
	fxFolder: Folder;
	/** Cycles the neon colours; call every frame with the elapsed time. */
	animate(t: number): void;
}

function part(shape: Enum.PartType, cf: CFrame, size: Vector3, color: Color3, material: Enum.Material, parent: Instance): Part {
	const p = new Instance("Part");
	p.Shape = shape;
	p.Anchored = true;
	p.CanCollide = false;
	p.CanQuery = false;
	p.CanTouch = false;
	p.CastShadow = false;
	p.Material = material;
	p.Color = color;
	p.Size = size;
	p.CFrame = cf;
	p.Parent = parent;
	return p;
}

function addLight(host: Instance, color: Color3, brightness: number, range: number): PointLight {
	const l = new Instance("PointLight");
	l.Color = color;
	l.Brightness = brightness;
	l.Range = range;
	l.Parent = host;
	return l;
}

export function buildStageEnv(): StageEnv {
	const folder = new Instance("Folder");
	folder.Name = "ShowroomStage";
	const fxFolder = new Instance("Folder");
	fxFolder.Name = "Fx";
	fxFolder.Parent = folder;
	const c = STAGE_CENTER;

	// Platform: dark base, lighter top, neon rim.
	const flat = CFrame.Angles(0, 0, math.pi / 2);
	part(Enum.PartType.Cylinder, new CFrame(c.add(new Vector3(0, -1.2, 0))).mul(flat), new Vector3(2.4, PLATFORM_R * 2 + 4, PLATFORM_R * 2 + 4), Color3.fromRGB(30, 26, 52), Enum.Material.SmoothPlastic, folder);
	part(Enum.PartType.Cylinder, new CFrame(c.add(new Vector3(0, -0.05, 0))).mul(flat), new Vector3(0.2, PLATFORM_R * 2 - 4, PLATFORM_R * 2 - 4), Color3.fromRGB(52, 44, 84), Enum.Material.SmoothPlastic, folder);
	part(Enum.PartType.Cylinder, new CFrame(c.add(new Vector3(0, 0.02, 0))).mul(flat), new Vector3(0.2, 14, 14), Color3.fromRGB(150, 70, 90), Enum.Material.SmoothPlastic, folder);
	part(Enum.PartType.Cylinder, new CFrame(c.add(new Vector3(0, 0.04, 0))).mul(flat), new Vector3(0.2, 12.4, 12.4), Color3.fromRGB(46, 40, 76), Enum.Material.SmoothPlastic, folder);

	const rim: Part[] = [];
	for (let i = 0; i < RIM_COUNT; i++) {
		const ang = (i / RIM_COUNT) * 2 * math.pi;
		const p = c.add(new Vector3(math.cos(ang) * PLATFORM_R, 0.3, math.sin(ang) * PLATFORM_R));
		const seg = part(Enum.PartType.Block, CFrame.lookAt(p, p.add(new Vector3(-math.sin(ang), 0, math.cos(ang)))), new Vector3(1.6, 0.8, (2 * math.pi * PLATFORM_R) / RIM_COUNT + 0.2), fx.hue(i / RIM_COUNT), Enum.Material.Neon, folder);
		rim.push(seg);
	}

	// Backdrop: a ring of tall panels around the stage, each with a neon stripe in front.
	const back: Part[] = [];
	for (let i = 0; i < BACK_COUNT; i++) {
		const ang = (i / BACK_COUNT) * 2 * math.pi;
		const p = c.add(new Vector3(math.cos(ang) * 105, 32, math.sin(ang) * 105));
		const panelW = ((2 * math.pi * 105) / BACK_COUNT) * 1.05;
		const dark = i % 2 === 0 ? Color3.fromRGB(46, 28, 96) : Color3.fromRGB(24, 44, 110);
		part(Enum.PartType.Block, CFrame.lookAt(p, c.add(new Vector3(0, 32, 0))), new Vector3(panelW, 90, 3), dark, Enum.Material.SmoothPlastic, folder);
		const sp = c.add(new Vector3(math.cos(ang) * 102, 32, math.sin(ang) * 102));
		back.push(part(Enum.PartType.Block, CFrame.lookAt(sp, c.add(new Vector3(0, 32, 0))), new Vector3(2.2, 86, 1), fx.hue(i / BACK_COUNT), Enum.Material.Neon, folder));
	}

	// Lamp posts with colour-cycling lights.
	const lamps: Part[] = [];
	const lampLights: PointLight[] = [];
	for (let i = 0; i < LAMP_COUNT; i++) {
		const ang = ((i + 0.5) / LAMP_COUNT) * 2 * math.pi;
		const base = c.add(new Vector3(math.cos(ang) * (PLATFORM_R + 6), 0, math.sin(ang) * (PLATFORM_R + 6)));
		part(Enum.PartType.Block, new CFrame(base.add(new Vector3(0, 6, 0))), new Vector3(1.4, 12, 1.4), Color3.fromRGB(40, 36, 70), Enum.Material.SmoothPlastic, folder);
		const lamp = part(Enum.PartType.Ball, new CFrame(base.add(new Vector3(0, 13, 0))), new Vector3(3.6, 3.6, 3.6), fx.hue(i / LAMP_COUNT), Enum.Material.Neon, folder);
		lampLights.push(addLight(lamp, lamp.Color, 0.6, 30));
		lamps.push(lamp);
	}

	// Overhead spot on the stage plus two coloured fill lights.
	const spotHost = part(Enum.PartType.Block, new CFrame(c.add(new Vector3(0, 55, 0))), new Vector3(1, 1, 1), Color3.fromRGB(255, 255, 255), Enum.Material.SmoothPlastic, folder);
	spotHost.Transparency = 1;
	const spot = new Instance("SpotLight");
	spot.Face = Enum.NormalId.Bottom;
	spot.Angle = 80;
	spot.Range = 110;
	spot.Brightness = 1.2;
	spot.Color = Color3.fromRGB(255, 250, 235);
	spot.Parent = spotHost;
	const fillA = part(Enum.PartType.Block, new CFrame(c.add(new Vector3(-22, 16, 16))), new Vector3(1, 1, 1), WHITE_C, Enum.Material.SmoothPlastic, folder);
	fillA.Transparency = 1;
	addLight(fillA, Color3.fromRGB(255, 120, 200), 0.5, 40);
	const fillB = part(Enum.PartType.Block, new CFrame(c.add(new Vector3(22, 16, -16))), new Vector3(1, 1, 1), WHITE_C, Enum.Material.SmoothPlastic, folder);
	fillB.Transparency = 1;
	addLight(fillB, Color3.fromRGB(110, 200, 255), 0.5, 40);

	return {
		folder,
		fxFolder,
		animate(t: number) {
			for (let i = 0; i < rim.size(); i++) {
				rim[i].Color = fx.hue(t * 0.12 + i / RIM_COUNT);
			}
			for (let i = 0; i < back.size(); i++) {
				back[i].Color = fx.hue(t * 0.06 + i / BACK_COUNT, 0.7, 1);
			}
			for (let i = 0; i < lamps.size(); i++) {
				const col = fx.hue(t * 0.2 + i / LAMP_COUNT);
				lamps[i].Color = col;
				lampLights[i].Color = col;
			}
		},
	};
}
