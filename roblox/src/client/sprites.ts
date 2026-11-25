// Sprite sheets for characters drawn as camera-facing 2D billboards in the Roblox client.
// Characters without an entry in SPRITES keep the colour-block body (render.ts).

export interface AnimDef {
	frames: number[]; // frame index = row * cols + col
	fps: number;
	loop: boolean;
}

export interface SpriteSheet {
	image: string;
	imageFlip: string; // each cell mirrored horizontally, same layout
	frameW: number;
	frameH: number;
	cols: number;
	anchorX: number; // foot point in the unflipped cell, px from top-left (flipped sheet: frameW - anchorX)
	anchorY: number;
	displayHeight: number; // sim px; studs per sheet px = STUDS_PER_PX * displayHeight / frameH
	anims: Record<string, AnimDef>;
}

export const SPRITES: Record<string, SpriteSheet | undefined> = {
	zhangliao: {
		image: "rbxassetid://75955656284306",
		imageFlip: "rbxassetid://133517530363091",
		frameW: 204,
		frameH: 132,
		cols: 4,
		anchorX: 132,
		anchorY: 129,
		displayHeight: 60,
		anims: {
			idle: { frames: [0, 1, 2, 3], fps: 6, loop: true },
			run: { frames: [4, 5, 6, 7], fps: 10, loop: true },
			attack: { frames: [8, 9, 10, 11], fps: 14, loop: false },
			charge: { frames: [8], fps: 1, loop: true },
			cast: { frames: [14], fps: 1, loop: true },
			special: { frames: [12, 13, 14, 15], fps: 8, loop: false },
			rampage: { frames: [14, 15], fps: 8, loop: true },
			lunge: { frames: [14, 15], fps: 8, loop: true },
			shot: { frames: [11], fps: 1, loop: true },
			dive: { frames: [17], fps: 1, loop: true },
			hitstun: { frames: [16], fps: 1, loop: true },
			down: { frames: [17, 18], fps: 6, loop: false },
			recover: { frames: [19], fps: 1, loop: true },
		},
	},
};

/** Maps a snapshot action / special mode to a sheet animation name (the sheet may lack it; caller falls back to "idle"). */
export function animFor(action: string, sp: string, moving: boolean): string {
	if (action === "punch" || action === "tackle") return "attack";
	if (action === "fear") return "hitstun";
	if (action === "hitstun" || action === "down" || action === "dive" || action === "recover" || action === "lunge" || action === "cast") {
		return action;
	}
	if (action === "ride" || action === "leap") return "lunge";
	if (action === "charge") return "charge";
	if (sp === "rampage") return "rampage";
	return moving ? "run" : "idle";
}
