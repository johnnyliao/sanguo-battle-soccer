import type { WireEvent } from "shared/logic/events";
import { STUDS_PER_PX } from "shared/logic/scale";

const TweenService = game.GetService("TweenService");
const Debris = game.GetService("Debris");

const ICE = Color3.fromRGB(150, 220, 255);
const PORTAL = Color3.fromRGB(170, 90, 255);
const EASTWIND = Color3.fromRGB(140, 255, 190);
const ROAR = Color3.fromRGB(255, 160, 60);
const FEAR = Color3.fromRGB(150, 60, 200);
const GUST = Color3.fromRGB(255, 160, 200);
const HIT = Color3.fromRGB(255, 240, 150);
const SPECIAL = Color3.fromRGB(120, 230, 255);
const SHIP = Color3.fromRGB(122, 84, 48);

const DISC_H = 0.12;

/** Simple visuals for specials. All coordinates arrive in sim px. */
export class FxManager {
	private readonly fields = new Map<string, Part>();

	/** `posOf(idx)` returns the current sim px position of a player, if known. */
	constructor(
		private readonly parent: Instance,
		private readonly posOf: (idx: number) => [number, number] | undefined,
	) {}

	private disc(x: number, y: number, radiusPx: number, color: Color3, transparency: number, lift: number): Part {
		const p = new Instance("Part");
		p.Name = "Fx";
		p.Anchored = true;
		p.CanCollide = false;
		p.CanQuery = false;
		p.CanTouch = false;
		p.CastShadow = false;
		p.Shape = Enum.PartType.Cylinder;
		p.Material = Enum.Material.Neon;
		p.Color = color;
		p.Transparency = transparency;
		const d = radiusPx * STUDS_PER_PX * 2;
		p.Size = new Vector3(DISC_H, d, d);
		// A cylinder's axis is X: turn it so the axis is vertical and the disc lies flat.
		p.CFrame = new CFrame(x * STUDS_PER_PX, lift, y * STUDS_PER_PX).mul(CFrame.Angles(0, 0, math.rad(90)));
		p.Parent = this.parent;
		return p;
	}

	private ring(x: number, y: number, radiusPx: number, color: Color3, seconds = 0.6): void {
		const p = this.disc(x, y, 4, color, 0.35, 0.2);
		const d = radiusPx * STUDS_PER_PX * 2;
		const tween = TweenService.Create(p, new TweenInfo(seconds, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
			Size: new Vector3(DISC_H, d, d),
			Transparency: 1,
		});
		tween.Play();
		Debris.AddItem(p, seconds + 0.2);
	}

	private startField(key: string, e: WireEvent, color: Color3, transparency: number, lift: number): void {
		if (e.x === undefined || e.y === undefined || e.r === undefined) return;
		this.removeField(key);
		const p = this.disc(e.x, e.y, e.r, color, transparency, lift);
		p.Name = key;
		this.fields.set(key, p);
		Debris.AddItem(p, 15); // safety net if the end event is ever missed
	}

	private removeField(key: string): void {
		const p = this.fields.get(key);
		if (p !== undefined) {
			p.Destroy();
			this.fields.delete(key);
		}
	}

	handle(e: WireEvent): void {
		const id = e.id ?? 0;
		switch (e.t) {
			case "iceStart":
				this.startField(`ice${id}`, e, ICE, 0.55, 0.1);
				break;
			case "iceEnd":
				this.removeField(`ice${id}`);
				break;
			case "portalStart":
				this.startField(`portal${id}`, e, PORTAL, 0.55, 0.12);
				break;
			case "portalEnd":
				this.removeField(`portal${id}`);
				break;
			case "eastwindStart":
				this.startField(`wind${id}`, e, EASTWIND, 0.6, 0.14);
				break;
			case "eastwindEnd":
				this.removeField(`wind${id}`);
				break;
			case "arrowshipStart": {
				if (e.x === undefined || e.y === undefined || e.w === undefined) break;
				const key = `ship${id}`;
				this.removeField(key);
				const p = new Instance("Part");
				p.Name = key;
				p.Anchored = true;
				p.CanCollide = false;
				p.CanQuery = false;
				p.CanTouch = false;
				p.Material = Enum.Material.Wood;
				p.Color = SHIP;
				p.Size = new Vector3(1.2, 4, e.w * STUDS_PER_PX * 2);
				p.CFrame = new CFrame(e.x * STUDS_PER_PX, 2, e.y * STUDS_PER_PX);
				p.Parent = this.parent;
				this.fields.set(key, p);
				Debris.AddItem(p, 15);
				break;
			}
			case "arrowshipEnd":
				this.removeField(`ship${id}`);
				break;
			case "roar":
				if (e.x !== undefined && e.y !== undefined && e.r !== undefined) this.ring(e.x, e.y, e.r, ROAR);
				break;
			case "fear":
				if (e.x !== undefined && e.y !== undefined && e.r !== undefined) this.ring(e.x, e.y, e.r, FEAR, 0.8);
				break;
			case "gustBlow":
				if (e.x !== undefined && e.y !== undefined && e.r !== undefined) this.ring(e.x, e.y, e.r, GUST);
				break;
			case "hit": {
				const victim = e.v !== undefined ? this.posOf(e.v[0]) : undefined;
				if (victim !== undefined) this.ring(victim[0], victim[1], 14, HIT, 0.3);
				break;
			}
			case "special": {
				const caster = e.p !== undefined ? this.posOf(e.p) : undefined;
				if (caster !== undefined) this.ring(caster[0], caster[1], 30, SPECIAL, 0.5);
				break;
			}
			default:
				break;
		}
	}

	clear(): void {
		for (const [, p] of this.fields) p.Destroy();
		this.fields.clear();
	}
}
