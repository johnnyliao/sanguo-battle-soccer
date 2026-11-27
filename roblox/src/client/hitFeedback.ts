// Hit feedback on the victim of a landed attack: a short red flash on the model, a damage number over its head that drifts back
// along the knock and fades, and a puff of dust pushed the same way. Called by MatchFx for every "hit" event.
import * as fx from "./fx";

/** Red flash on the victim's model (Highlight). */
const FLASH_SECS = 0.15;
const FLASH_RED = Color3.fromRGB(255, 50, 50);
/** Damage number: lifetime, how far it rises and drifts (studs) by the end, and its colour. */
const NUMBER_SECS = 0.9;
const NUMBER_RISE = 3;
const NUMBER_DRIFT = 2.5;
const NUMBER_COLOR = Color3.fromRGB(255, 235, 140);
const BLACK = Color3.fromRGB(0, 0, 0);
/** Dust puff pushed this many studs along the knock. */
const DUST_PUSH = 2;

/** Briefly tints the victim's model red. */
export function flashVictim(model: Model | undefined): void {
	if (model === undefined) return;
	const hl = new Instance("Highlight");
	hl.Name = "HitFlash";
	hl.FillColor = FLASH_RED;
	hl.OutlineColor = FLASH_RED;
	hl.FillTransparency = 0.35;
	hl.OutlineTransparency = 0.5;
	hl.Parent = model;
	fx.expire(hl, FLASH_SECS);
	fx.spawn(() => {
		fx.run(FLASH_SECS, () => {});
		hl.Destroy();
	});
}

/** Damage number at `pos` (world studs) that rises and drifts along (dirX, dirZ) while it fades out. */
export function damageNumber(pos: Vector3, dirX: number, dirZ: number, damage: number): void {
	const host = fx.anchorPart(pos);
	const bb = new Instance("BillboardGui");
	bb.Size = UDim2.fromScale(4, 2);
	bb.AlwaysOnTop = true;
	bb.Parent = host;
	const t = new Instance("TextLabel");
	t.BackgroundTransparency = 1;
	t.Size = UDim2.fromScale(1, 1);
	t.Text = `-${damage}`;
	t.Font = Enum.Font.GothamBlack;
	t.TextScaled = true;
	t.TextColor3 = NUMBER_COLOR;
	t.TextStrokeTransparency = 0;
	t.TextStrokeColor3 = BLACK;
	t.Parent = bb;
	fx.spawn(() => {
		fx.run(NUMBER_SECS, (a) => {
			const pop = a < 0.12 ? 0.6 + a * 3.3 : 1;
			bb.Size = UDim2.fromScale(4 * pop, 2 * pop);
			host.CFrame = new CFrame(pos.add(new Vector3(dirX * NUMBER_DRIFT * a, NUMBER_RISE * a, dirZ * NUMBER_DRIFT * a)));
			t.TextTransparency = a > 0.6 ? (a - 0.6) / 0.4 : 0;
			t.TextStrokeTransparency = t.TextTransparency;
		});
		host.Destroy();
	});
	fx.expire(host, NUMBER_SECS);
}

/** Dust puff at the victim's feet, pushed a little along the knock. */
export function knockDust(footPos: Vector3, dirX: number, dirZ: number): void {
	fx.dust(footPos.add(new Vector3(dirX * DUST_PUSH, 0.4, dirZ * DUST_PUSH)), 4, 3);
}
