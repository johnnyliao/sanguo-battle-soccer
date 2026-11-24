import { characterOf, colorFromHex, countryColor, FONT } from "./theme";
import { STUDS_PER_PX } from "shared/logic/scale";

interface Dims {
	bw: number;
	bh: number;
	bd: number;
	head: number;
}

const DIMS: Record<"S" | "M" | "L", Dims> = {
	S: { bw: 1.4, bh: 1.9, bd: 1.0, head: 0.9 },
	M: { bw: 1.7, bh: 2.4, bd: 1.2, head: 1.1 },
	L: { bw: 2.1, bh: 2.9, bd: 1.4, head: 1.3 },
};

function newPart(parent: Instance, name: string, size: Vector3, color: Color3): Part {
	const p = new Instance("Part");
	p.Name = name;
	p.Anchored = true;
	p.CanCollide = false;
	p.CanQuery = false;
	p.CanTouch = false;
	p.Size = size;
	p.Color = color;
	p.Material = Enum.Material.SmoothPlastic;
	p.Parent = parent;
	return p;
}

/** A blocky player: team-coloured body, lighter head, dark visor on the front, and a name / stamina billboard. */
export class PlayerView {
	readonly charIdx: number;
	private readonly model: Model;
	private readonly body: Part;
	private readonly head: Part;
	private readonly visor: Part;
	private readonly dims: Dims;
	private readonly fill: Frame | undefined;
	private lastRatio = -1;
	private lastRampage = false;

	constructor(parent: Instance, charIdx: number, isMine: boolean, showStamina: boolean) {
		const def = characterOf(charIdx);
		this.charIdx = charIdx;
		this.dims = DIMS[def.size];
		const d = this.dims;
		const teamColor = countryColor(def.country);
		this.model = new Instance("Model");
		this.model.Name = def.name;
		this.body = newPart(this.model, "Body", new Vector3(d.bw, d.bh, d.bd), teamColor);
		this.head = newPart(this.model, "Head", new Vector3(d.head, d.head, d.head), teamColor.Lerp(new Color3(1, 1, 1), 0.55));
		this.visor = newPart(this.model, "Visor", new Vector3(d.head * 0.7, d.head * 0.25, 0.1), Color3.fromRGB(30, 30, 30));
		this.model.Parent = parent;

		const gui = new Instance("BillboardGui");
		gui.Name = "Tag";
		gui.Size = UDim2.fromOffset(120, 52);
		gui.StudsOffset = new Vector3(0, d.head / 2 + 1.3, 0);
		gui.AlwaysOnTop = true;
		gui.LightInfluence = 0;
		gui.Adornee = this.head;

		if (isMine) {
			const marker = new Instance("TextLabel");
			marker.BackgroundTransparency = 1;
			marker.Size = UDim2.fromOffset(120, 16);
			marker.Position = UDim2.fromOffset(0, 0);
			marker.Font = FONT;
			marker.Text = "▼";
			marker.TextSize = 18;
			marker.TextColor3 = colorFromHex(0xffd84a);
			marker.TextStrokeTransparency = 0.3;
			marker.Parent = gui;
		}

		const name = new Instance("TextLabel");
		name.BackgroundTransparency = 1;
		name.Size = UDim2.fromOffset(120, 20);
		name.Position = UDim2.fromOffset(0, 16);
		name.Font = FONT;
		name.Text = def.name;
		name.TextSize = 18;
		name.TextColor3 = isMine ? colorFromHex(0xffd84a) : teamColor.Lerp(new Color3(1, 1, 1), 0.45);
		name.TextStrokeTransparency = 0.3;
		name.Parent = gui;

		if (showStamina) {
			const back = new Instance("Frame");
			back.BackgroundColor3 = Color3.fromRGB(20, 20, 20);
			back.BackgroundTransparency = 0.3;
			back.BorderSizePixel = 0;
			back.Size = UDim2.fromOffset(64, 7);
			back.Position = UDim2.fromOffset(28, 38);
			back.Parent = gui;
			const fill = new Instance("Frame");
			fill.BackgroundColor3 = Color3.fromRGB(80, 220, 90);
			fill.BorderSizePixel = 0;
			fill.Size = UDim2.fromScale(1, 1);
			fill.Parent = back;
			this.fill = fill;
		}
		gui.Parent = this.head;
	}

	/** Positions are sim px; facing is the sim facing angle (radians). */
	update(x: number, y: number, z: number, facing: number, down: boolean, rampage: boolean, stamina: number, maxStamina: number): void {
		const d = this.dims;
		const lift = down ? d.bd / 2 : 0;
		const pos = new Vector3(x * STUDS_PER_PX, z * STUDS_PER_PX + lift, y * STUDS_PER_PX);
		let base = CFrame.lookAt(pos, pos.add(new Vector3(math.cos(facing), 0, math.sin(facing))));
		if (down) base = base.mul(CFrame.Angles(math.rad(90), 0, 0));
		this.body.CFrame = base.mul(new CFrame(0, d.bh / 2, 0));
		this.head.CFrame = base.mul(new CFrame(0, d.bh + d.head / 2, 0));
		this.visor.CFrame = base.mul(new CFrame(0, d.bh + d.head * 0.55, -d.head / 2));

		if (rampage !== this.lastRampage) {
			this.lastRampage = rampage;
			this.body.Material = rampage ? Enum.Material.Neon : Enum.Material.SmoothPlastic;
		}
		if (this.fill !== undefined && maxStamina > 0) {
			const ratio = math.clamp(stamina / maxStamina, 0, 1);
			if (math.abs(ratio - this.lastRatio) > 0.01) {
				this.lastRatio = ratio;
				this.fill.Size = UDim2.fromScale(ratio, 1);
				this.fill.BackgroundColor3 =
					ratio > 0.5 ? Color3.fromRGB(80, 220, 90) : ratio > 0.25 ? Color3.fromRGB(240, 200, 60) : Color3.fromRGB(230, 70, 60);
			}
		}
	}

	destroy(): void {
		this.model.Destroy();
	}
}
