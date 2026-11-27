// Art helpers for the 2D UI (art ids in artIds.ts). Pictures keep their aspect ratio (Fit); buttons and bars are nine-sliced
// so their corners stay round at any size. Text is always a child label drawn on top of the art (see hud.ts text()).
import { ART } from "./artIds";

/** Button skins: resting and pressed art (512×160 buttons). */
export type ArtSkin = "red" | "blue" | "gold";
const SKIN: Record<ArtSkin, [string, string]> = {
	red: [ART.btn_red, ART.btn_red_pressed],
	blue: [ART.btn_blue, ART.btn_blue_pressed],
	gold: [ART.btn_gold, ART.btn_gold_pressed],
};

/** Nine-slice centre of the 512×160 button art (the corners and edges keep their size). */
const BUTTON_SLICE = new Rect(96, 48, 416, 112);
/** Nine-slice centre of the 512×64 bar art (round caps at both ends, the middle stretches). */
const BAR_SLICE = new Rect(16, 8, 496, 56);

/** Picture with a transparent background. Fit (default) keeps the aspect ratio; Crop fills the box (backgrounds). */
export function picture(
	parent: Instance,
	image: string,
	size: UDim2,
	pos: UDim2,
	scaleType: Enum.ScaleType = Enum.ScaleType.Fit,
): ImageLabel {
	const img = new Instance("ImageLabel");
	img.BackgroundTransparency = 1;
	img.BorderSizePixel = 0;
	img.ScaleType = scaleType;
	img.Image = image;
	img.Size = size;
	img.Position = pos;
	img.Parent = parent;
	return img;
}

/** Bar material (xp bar fill or frame): nine-sliced, so the bar can be any width without squashing the caps. */
export function barImage(parent: Instance, image: string, size: UDim2, pos: UDim2): ImageLabel {
	const img = new Instance("ImageLabel");
	img.BackgroundTransparency = 1;
	img.BorderSizePixel = 0;
	img.ScaleType = Enum.ScaleType.Slice;
	img.SliceCenter = BAR_SLICE;
	img.Image = image;
	img.Size = size;
	img.Position = pos;
	img.Parent = parent;
	return img;
}

/** Art button: the picture swaps to the pressed art while held. Add the label as a child (text()). */
export function artButton(parent: Instance, skin: ArtSkin, size: UDim2, pos: UDim2): ImageButton {
	const [up, down] = SKIN[skin];
	const b = new Instance("ImageButton");
	b.BackgroundTransparency = 1;
	b.BorderSizePixel = 0;
	b.AutoButtonColor = false;
	b.ScaleType = Enum.ScaleType.Slice;
	b.SliceCenter = BUTTON_SLICE;
	b.SliceScale = 0.5;
	b.Image = up;
	b.Size = size;
	b.Position = pos;
	b.Parent = parent;
	b.MouseButton1Down.Connect(() => {
		b.Image = down;
	});
	b.MouseButton1Up.Connect(() => {
		b.Image = up;
	});
	b.MouseLeave.Connect(() => {
		b.Image = up;
	});
	return b;
}

/**
 * Card or banner button whose art keeps its own aspect ratio (aspect = width / height). The height sets the size, so
 * text placed over the art lines up with the art. color (optional) fills only the picture window of the card frame
 * (0.11–0.90 × 0.13–0.645 of the card, named CardColor, ZIndex 1); the rest of the card stays the art itself.
 */
export function artCard(
	parent: Instance,
	image: string,
	aspect: number,
	size: UDim2,
	pos: UDim2,
	color?: Color3,
): ImageButton {
	const b = new Instance("ImageButton");
	b.BackgroundTransparency = 1;
	b.BorderSizePixel = 0;
	b.AutoButtonColor = false;
	b.Image = "";
	b.Size = size;
	b.Position = pos;
	// Children always draw above their parent, so the frame art is a child image (ZIndex 2) above the colour window (1).
	const art = new Instance("ImageLabel");
	art.Name = "CardFrame";
	art.BackgroundTransparency = 1;
	art.ScaleType = Enum.ScaleType.Fit;
	art.Image = image;
	art.Size = UDim2.fromScale(1, 1);
	art.ZIndex = 2;
	art.Parent = b;
	if (color !== undefined) {
		const win = new Instance("Frame");
		win.Name = "CardColor";
		win.Position = UDim2.fromScale(0.11, 0.13);
		win.Size = UDim2.fromScale(0.79, 0.515);
		win.BackgroundColor3 = color;
		win.BackgroundTransparency = 0;
		win.BorderSizePixel = 0;
		win.ZIndex = 1;
		const corner = new Instance("UICorner");
		corner.CornerRadius = new UDim(0.04, 0);
		corner.Parent = win;
		// Top is the full colour, the bottom darkens, so the window reads as lit from above.
		const shade = new Instance("UIGradient");
		shade.Rotation = 90;
		shade.Color = new ColorSequence(Color3.fromRGB(255, 255, 255), Color3.fromRGB(120, 120, 120));
		shade.Parent = win;
		win.Parent = b;
	}
	b.Parent = parent;
	const ratio = new Instance("UIAspectRatioConstraint");
	ratio.AspectRatio = aspect;
	ratio.DominantAxis = Enum.DominantAxis.Height;
	ratio.Parent = b;
	return b;
}

/** Ratio of the 512×768 card frames (art/incoming/batch2). */
export const CARD_ASPECT = 512 / 768;
