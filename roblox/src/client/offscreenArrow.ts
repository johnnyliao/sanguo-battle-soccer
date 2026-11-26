// Off-screen arrow: a gold arrow at the screen edge that points at the human player when he is outside the view.
// Mirrors the web MatchScene (ARROW_*): clamped to the band between the top scoreboard and the bottom key hint
// (or the touch buttons), placed on the line from the screen centre toward the player.
const Players = game.GetService("Players");
const Workspace = game.GetService("Workspace");
const UserInputService = game.GetService("UserInputService");

const ARROW_MARGIN = 10;
const ARROW_PX = 30;
const EDGE_X = 20;
const TOP_BAND = 120;
const BOTTOM_BAND = 60;
const BOTTOM_BAND_TOUCH = 170;
/** Badge centre is this many px inward from the arrow centre. */
const BADGE_OFFSET = 26;
const BADGE_PX = 22;
const GOLD = Color3.fromRGB(255, 210, 58);

export interface OffscreenArrow {
	/** worldPos = the human's chest position (studs), or undefined to hide. Call every frame. */
	update(worldPos: Vector3 | undefined): void;
	destroy(): void;
}

export function createOffscreenArrow(): OffscreenArrow {
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "OffscreenArrow";
	gui.IgnoreGuiInset = true;
	gui.ResetOnSpawn = false;
	gui.DisplayOrder = 5; // below the HUD (10), key hint (20) and effect flash (60)
	gui.Parent = playerGui;

	// The arrow rotates as a whole; its glyph points up at rotation 0.
	const arrow = new Instance("Frame");
	arrow.Name = "Arrow";
	arrow.AnchorPoint = new Vector2(0.5, 0.5);
	arrow.Size = UDim2.fromOffset(ARROW_PX, ARROW_PX);
	arrow.BackgroundTransparency = 1;
	arrow.BorderSizePixel = 0;
	arrow.Visible = false;
	arrow.Parent = gui;

	const glyph = new Instance("TextLabel");
	glyph.Size = UDim2.fromScale(1, 1);
	glyph.BackgroundTransparency = 1;
	glyph.Text = "▲";
	glyph.TextScaled = true;
	glyph.Font = Enum.Font.GothamBlack;
	glyph.TextColor3 = GOLD;
	glyph.TextStrokeColor3 = Color3.fromRGB(0, 0, 0);
	glyph.TextStrokeTransparency = 0;
	glyph.Parent = arrow;

	// The badge stays upright, so it is a separate frame placed inward from the arrow.
	const badge = new Instance("Frame");
	badge.Name = "Badge";
	badge.AnchorPoint = new Vector2(0.5, 0.5);
	badge.Size = UDim2.fromOffset(BADGE_PX, BADGE_PX);
	badge.BackgroundColor3 = GOLD;
	badge.BorderSizePixel = 0;
	badge.Visible = false;
	badge.Parent = gui;
	const corner = new Instance("UICorner");
	corner.CornerRadius = new UDim(0.5, 0);
	corner.Parent = badge;

	const badgeText = new Instance("TextLabel");
	badgeText.Size = UDim2.fromScale(1, 1);
	badgeText.BackgroundTransparency = 1;
	badgeText.Text = "你";
	badgeText.TextScaled = true;
	badgeText.Font = Enum.Font.GothamBold;
	badgeText.TextColor3 = Color3.fromRGB(0, 0, 0);
	badgeText.Parent = badge;

	const touch = UserInputService.TouchEnabled;
	const bottomBand = touch ? BOTTOM_BAND_TOUCH : BOTTOM_BAND;

	const hide = (): void => {
		arrow.Visible = false;
		badge.Visible = false;
	};

	return {
		update(worldPos: Vector3 | undefined): void {
			const cam = Workspace.CurrentCamera;
			if (worldPos === undefined || cam === undefined) {
				hide();
				return;
			}
			const vs = cam.ViewportSize;
			const W = vs.X;
			const H = vs.Y;
			const [p] = cam.WorldToViewportPoint(worldPos);
			const inFront = p.Z > 0;
			const cx = W / 2;
			const cy = H / 2;
			const minX = ARROW_MARGIN;
			const maxX = W - ARROW_MARGIN;
			const minY = TOP_BAND;
			const maxY = H - bottomBand;
			if (inFront && p.X >= minX && p.X <= maxX && p.Y >= minY && p.Y <= maxY) {
				hide();
				return;
			}

			// Direction from the screen centre toward the player. Behind the camera the projection is mirrored, so flip it.
			let dx = p.X - cx;
			let dy = p.Y - cy;
			if (!inFront) {
				dx = -dx;
				dy = -dy;
			}
			let len = math.sqrt(dx * dx + dy * dy);
			if (len < 1e-6) {
				dx = 0;
				dy = -1;
				len = 1;
			}
			dx /= len;
			dy /= len;

			// Walk from the centre along the direction until the first band edge.
			const clampMinX = EDGE_X;
			const clampMaxX = W - EDGE_X;
			let t = math.huge;
			if (dx > 0) t = math.min(t, (clampMaxX - cx) / dx);
			else if (dx < 0) t = math.min(t, (clampMinX - cx) / dx);
			if (dy > 0) t = math.min(t, (maxY - cy) / dy);
			else if (dy < 0) t = math.min(t, (minY - cy) / dy);
			const ex = cx + dx * t;
			const ey = cy + dy * t;

			// Roblox rotation is clockwise in degrees; the glyph points up at 0.
			arrow.Rotation = math.deg(math.atan2(dx, -dy));
			arrow.Position = UDim2.fromOffset(ex, ey);
			arrow.Visible = true;
			badge.Position = UDim2.fromOffset(ex - dx * BADGE_OFFSET, ey - dy * BADGE_OFFSET);
			badge.Visible = true;
		},
		destroy(): void {
			gui.Destroy();
		},
	};
}
