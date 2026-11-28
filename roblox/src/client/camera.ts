import { STUDS_PER_PX } from "shared/net";
import { FIELD_D, FIELD_W } from "shared/game/sim/constants";
import { pitchOffsetPx } from "./worldParts";
import * as fx from "./fx";
// Match camera, two modes (toggled with toggleCamMode):
// - "side": side-on oblique follow camera: stands on the near side (+Z), looks toward -Z and down. The look point sits
//   between the lord and the ball, so the lord stays on screen when the ball runs away.
// - "behind": over-the-shoulder camera behind the local lord, looking toward the enemy goal. mapMove() turns the screen
//   direction of the input into a world direction so "up" is always the way the lord faces the screen.
// Both modes track World X and Z with exponential smoothing; switching modes glides instead of jumping.
export type CamMode = "side" | "behind";

const CAM_PITCH_DEG = 52; // angle below horizontal (side mode; steep so the field below the lord stays in view)
const CAM_DISTANCE = 32; // studs from look-at point to camera (side mode)
const CAM_FOV = 50; // vertical field of view (degrees)
const CAM_TARGET_Y = 4; // look-at height above the ground (studs, side mode)
const CAM_FOLLOW_RATE = 6; // smoothing rate per second (higher = snappier)
const CAM_MARGIN_X = 4; // look-at point stays this far inside the pitch edge on X (studs)
const CAM_MARGIN_Z = 0; // and on Z (studs)
const CAM_SMALL_ZOOM = 0.85; // distance factor for 1v1 / 2v2 (small pitch)
const CAM_SIDE_LOOK_BLEND = 0.12; // side mode: look point this fraction of the way from the lord toward the ball
const CAM_BEHIND_BACK = 22; // behind mode: camera this far behind the lord (studs)
const CAM_BEHIND_HEIGHT = 14; // behind mode: camera height (studs)
const CAM_BEHIND_AHEAD = 8; // behind mode: look point this far ahead of the lord, toward the attack (studs)
const CAM_BEHIND_LOOK_Y = 2; // behind mode: look point height (studs)
const CAM_BEHIND_LOOK_BLEND = 0.25; // behind mode: look point this fraction of the way from the lord toward the ball
/** Quantising a screen-to-world move: a component counts only above this magnitude (keeps 8 directions). */
const MOVE_AXIS_THRESHOLD = 0.38;

/**
 * Screen shake for the match camera (main.client adds fx.shakeOffset every frame). intensity is the offset in studs at the
 * start of the shake (it decays to zero over duration seconds). Light 0.12, medium 0.3-0.4, heavy 0.7 keeps it subtle.
 */
export function shake(intensity: number, duration: number): void {
	fx.shake(intensity, duration);
}

let mode: CamMode = "side";
/** True while the behind view is really in use (mode is behind and the local lord is on the pitch). */
let behindActive = false;

/** Switches the match camera between the side and behind views. */
export function toggleCamMode(): void {
	mode = mode === "side" ? "behind" : "side";
}

/** The camera mode the player picked (the view may still fall back to side when there is no lord). */
export function getCamMode(): CamMode {
	return mode;
}

/** Pitch the camera follows (studs, World X / Z) and the camera distance. Default 5v5 until setCameraPitch(). */
let bounds = {
	x0: 0,
	x1: FIELD_W * STUDS_PER_PX,
	z0: 0,
	z1: FIELD_D * STUDS_PER_PX,
	distance: CAM_DISTANCE,
};

/** Sets the pitch the camera follows for a match (sim px field size, centred offset included). 1v1 / 2v2 zoom in a little. Call on each Setup. */
export function setCameraPitch(field: { w: number; d: number }, teamSize: number): void {
	const [offX, offY] = pitchOffsetPx(field.w, field.d);
	bounds = {
		x0: offX * STUDS_PER_PX,
		x1: (offX + field.w) * STUDS_PER_PX,
		z0: offY * STUDS_PER_PX,
		z1: (offY + field.d) * STUDS_PER_PX,
		distance: teamSize <= 2 ? CAM_DISTANCE * CAM_SMALL_ZOOM : CAM_DISTANCE,
	};
}

function clampX(v: number): number {
	return math.max(bounds.x0 + CAM_MARGIN_X, math.min(bounds.x1 - CAM_MARGIN_X, v));
}

function clampZ(v: number): number {
	return math.max(bounds.z0 + CAM_MARGIN_Z, math.min(bounds.z1 - CAM_MARGIN_Z, v));
}

function quantise(v: number): number {
	if (math.abs(v) <= MOVE_AXIS_THRESHOLD) return 0;
	return v > 0 ? 1 : -1;
}

/**
 * Turns a screen-direction move (moveX +1 = screen right, moveY +1 = screen down, as input.ts reports it) into a
 * world / sim direction (World X = sim x, World Z = sim y). Side view and no lord: returned unchanged.
 */
export function mapMove(moveX: number, moveY: number): [number, number] {
	if (mode !== "behind" || !behindActive) return [moveX, moveY];
	const cam = game.Workspace.CurrentCamera;
	if (cam === undefined) return [moveX, moveY];
	const look = cam.CFrame.LookVector;
	const right = cam.CFrame.RightVector;
	const fwd = new Vector3(look.X, 0, look.Z).Unit;
	const rt = new Vector3(right.X, 0, right.Z).Unit;
	// Screen up is -moveY, so forward contributes -moveY.
	const wx = rt.X * moveX - fwd.X * moveY;
	const wz = rt.Z * moveX - fwd.Z * moveY;
	return [quantise(wx), quantise(wz)];
}

export class FollowCamera {
	private cam: Camera;
	private eye = new Vector3(0, 0, 0);
	private look = new Vector3(0, 0, 0);
	private ready = false;
	private lastAttackDir = 1;

	constructor() {
		let cam = game.Workspace.CurrentCamera;
		while (cam === undefined) {
			task.wait();
			cam = game.Workspace.CurrentCamera;
		}
		cam.CameraType = Enum.CameraType.Scriptable;
		cam.FieldOfView = CAM_FOV;
		this.cam = cam;
	}

	/**
	 * Call every frame after Renderer.update. playerX / playerZ = the local lord's World X, Z (undefined when he has no
	 * character on the pitch: the camera then falls back to following the ball). ballX / ballZ = ball World X, Z.
	 * attackDir = +1 / -1: the direction (World X) the local lord's team attacks this half.
	 */
	update(
		dt: number,
		playerX: number | undefined,
		playerZ: number | undefined,
		ballX: number,
		ballZ: number,
		attackDir: number,
	): void {
		if (game.Workspace.GetAttribute("ShowroomActive") === true) return;
		const dir = attackDir < 0 ? -1 : 1;
		let desiredEye: Vector3;
		let desiredLook: Vector3;
		if (mode === "behind" && playerX !== undefined && playerZ !== undefined) {
			behindActive = true;
			const lx = clampX(playerX + (ballX - playerX) * CAM_BEHIND_LOOK_BLEND);
			const lz = clampZ(playerZ + (ballZ - playerZ) * CAM_BEHIND_LOOK_BLEND);
			desiredLook = new Vector3(lx + dir * CAM_BEHIND_AHEAD, CAM_BEHIND_LOOK_Y, lz);
			desiredEye = new Vector3(playerX - dir * CAM_BEHIND_BACK, CAM_BEHIND_HEIGHT, playerZ);
		} else {
			behindActive = false;
			const fx0 = playerX === undefined ? ballX : playerX + (ballX - playerX) * CAM_SIDE_LOOK_BLEND;
			// The lord stays centred on screen: no depth blend toward the ball, and no depth clamp (near-edge play stays centred).
			const fz0 = playerZ === undefined ? clampZ(ballZ) : playerZ;
			const look = new Vector3(clampX(fx0), CAM_TARGET_Y, fz0);
			const pitch = math.rad(CAM_PITCH_DEG);
			desiredLook = look;
			desiredEye = look.add(new Vector3(0, math.sin(pitch) * bounds.distance, math.cos(pitch) * bounds.distance));
		}
		// The attack direction flips at half time: cut to the new side instead of sweeping through the lord.
		if (!this.ready || dir !== this.lastAttackDir) {
			this.eye = desiredEye;
			this.look = desiredLook;
			this.ready = true;
			this.lastAttackDir = dir;
		} else {
			const k = 1 - math.exp(-CAM_FOLLOW_RATE * dt);
			this.eye = this.eye.Lerp(desiredEye, k);
			this.look = this.look.Lerp(desiredLook, k);
		}
		this.cam.CFrame = CFrame.lookAt(this.eye, this.look);
	}
}
