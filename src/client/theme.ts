import { CHARACTERS, COUNTRY_INFO } from "shared/data";
import type { Country } from "shared/data/types";

export function colorFromHex(c: number): Color3 {
	return Color3.fromRGB(math.floor(c / 65536) % 256, math.floor(c / 256) % 256, c % 256);
}

export function countryColor(country: Country): Color3 {
	return colorFromHex(COUNTRY_INFO[country].color);
}

export function countryName(country: Country): string {
	return COUNTRY_INFO[country].name;
}

export function hexString(c: Color3): string {
	return string.format("#%02x%02x%02x", math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5));
}

export function characterOf(charIdx: number) {
	return CHARACTERS[charIdx];
}

export const FONT = Enum.Font.SourceSansBold;
