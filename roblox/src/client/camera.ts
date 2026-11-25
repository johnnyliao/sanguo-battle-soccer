// Side-on oblique follow camera: stands on the near side (+Z), looks toward -Z and down,
// and tracks the ball's World X and Z with exponential smoothing (close framing, follows depth).
const CAM_PITCH_DEG = 38; // angle below horizontal
const CAM_DISTANCE = 30; // studs from look-at point to camera
const CAM_FOV = 50; // vertical field of view (degrees)
const CAM_TARGET_Y = 3; // look-at height above the ground (studs)
const CAM_FOLLOW_RATE = 4; // smoothing rate per second (higher = snappier)
const CAM_MIN_X = 12; // camera X clamp (studs); field spans 0..240
const CAM_MAX_X = 228;
const CAM_MIN_Z = 14; // camera Z clamp (studs); field spans 0..52
const CAM_MAX_Z = 38;

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
		const targetX = math.max(CAM_MIN_X, math.min(CAM_MAX_X, focusX));
		const targetZ = math.max(CAM_MIN_Z, math.min(CAM_MAX_Z, focusZ));
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
		const eye = look.add(new Vector3(0, math.sin(pitch) * CAM_DISTANCE, math.cos(pitch) * CAM_DISTANCE));
		this.cam.CFrame = CFrame.lookAt(eye, look);
	}
}
