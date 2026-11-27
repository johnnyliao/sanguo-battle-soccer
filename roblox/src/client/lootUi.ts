// Loot banner (batch 4 loot_banner, 1024×384 「獲得！」 ribbon with an empty middle). Not used yet: the P5 drops call showLootBanner.
import { ART4 } from "./artIds";
import { picture } from "./artUi";
import { text } from "./hud";

/**
 * Shows the loot ribbon centred in parent: the optional item icon on the left, the text (drawn by code) in the empty middle.
 * Returns the banner so the caller can hide or destroy it.
 */
export function showLootBanner(parent: Instance, iconId: string | undefined, content: string): ImageLabel {
	const banner = picture(parent, ART4.loot_banner, UDim2.fromScale(0.5, 0.2), UDim2.fromScale(0.5, 0.5));
	banner.AnchorPoint = new Vector2(0.5, 0.5);
	const ratio = new Instance("UIAspectRatioConstraint");
	ratio.AspectRatio = 1024 / 384;
	ratio.DominantAxis = Enum.DominantAxis.Width;
	ratio.Parent = banner;
	if (iconId !== undefined) {
		picture(banner, iconId, UDim2.fromScale(0.2, 0.6), UDim2.fromScale(0.14, 0.2));
		text(banner, content, UDim2.fromScale(0.42, 0.3), UDim2.fromScale(0.4, 0.35));
	} else {
		text(banner, content, UDim2.fromScale(0.6, 0.3), UDim2.fromScale(0.2, 0.35));
	}
	return banner;
}
