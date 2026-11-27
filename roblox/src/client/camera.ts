import { STUDS_PER_PX } from "shared/net";
import { FIELD_D, FIELD_W } from "shared/game/sim/constants";
import { pitchOffsetPx } from "./worldParts";
import * as fx from "./fx";
// Side-on oblique follow camera: stands on the near side (+Z), looks toward -Z and down,
// and tracks the ball's World X and Z with exponential smoothing (close framing, follows depth).
const CAM_PITCH_DEG = 38; // angle below horizontal
const CAM_DISTANCE = 30; // studs from look-at point to camera
const CAM_FOV = 50; // vertical field of view (degrees)
const CAM_TARGET_Y = 3; // look-at height above the ground (studs)
const CAM_FOLLOW_RATE = 4; // smoothing rate per second (higher = snappier)
const CAM_MARGIN_X = 12; // look-at point stays this far inside the pitch edge on X (studs)
const CAM_MARGIN_Z = 14; // and on Z (studs)
const CAM_SMALL_ZOOM = 0.85; // distance factor for 1v1 / 2v2 (small pitch)

/**
 * Screen shake for the match camera (main.client adds fx.shakeOffset every frame). intensity is the offset in studs at the
 * start of the shake (it decays to zero over duration seconds). Light 0.12, medium 0.3-0.4, heavy 0.7 keeps it subtle.
 */
export function shake(intensity: number, duration: number): void {
	fx.shake(intensity, duration);
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

export class FollowCamera {
	private cam: Camera;
	private x = 0;
	private z = 0;
	private ready = false;

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

	/** focusX / focusZ = ball World X, Z in studs (Renderer.getFocusX() / getFocusZ()). Call every frame after Renderer.update. */
	update(dt: number, focusX: number, focusZ: number): void {
		if (game.Workspace.GetAttribute("ShowroomActive") === true) return;
		const targetX = math.max(bounds.x0 + CAM_MARGIN_X, math.min(bounds.x1 - CAM_MARGIN_X, focusX));
		const targetZ = math.max(bounds.z0 + CAM_MARGIN_Z, math.min(bounds.z1 - CAM_MARGIN_Z, focusZ));
		if (!this.ready) {
			this.x = targetX;
			this.z = targetZ;
			this.ready = true;
		} else {
			const k = 1 - math.exp(-CAM_FOLLOW_RATE * dt);
			this.x += (targetX - this.x) * k;
			this.z += (targetZ - this.z) * k;
		}
		const pitch = math.rad(CAM_PITCH_DEG);
		const look = new Vector3(this.x, CAM_TARGET_Y, this.z);
		const eye = look.add(new Vector3(0, math.sin(pitch) * bounds.distance, math.cos(pitch) * bounds.distance));
		this.cam.CFrame = CFrame.lookAt(eye, look);
	}
}
