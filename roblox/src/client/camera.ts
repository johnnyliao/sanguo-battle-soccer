// Side-on oblique follow camera: stands on the near side (+Z), looks toward -Z and down,
// and tracks the ball's World X with exponential smoothing.
const CAM_PITCH_DEG = 38; // angle below horizontal
const CAM_DISTANCE = 70; // studs from look-at point to camera
const CAM_FOV = 50; // vertical field of view (degrees)
const CAM_TARGET_Y = 3; // look-at height above the ground (studs)
const CAM_CENTRE_Z = 26; // field centre Z (52 / 2 studs)
const CAM_FOLLOW_RATE = 4; // smoothing rate per second (higher = snappier)
const CAM_MIN_X = 20; // camera X clamp (studs); field spans 0..240
const CAM_MAX_X = 220;

export class FollowCamera {
	private cam: Camera;
	private x = 0;
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

	/** focusX = ball World X in studs (Renderer.getFocusX()). Call every frame after Renderer.update. */
	update(dt: number, focusX: number): void {
		const target = math.max(CAM_MIN_X, math.min(CAM_MAX_X, focusX));
		if (!this.ready) {
			this.x = target;
			this.ready = true;
		} else {
			const k = 1 - math.exp(-CAM_FOLLOW_RATE * dt);
			this.x += (target - this.x) * k;
		}
		const pitch = math.rad(CAM_PITCH_DEG);
		const look = new Vector3(this.x, CAM_TARGET_Y, CAM_CENTRE_Z);
		const eye = look.add(new Vector3(0, math.sin(pitch) * CAM_DISTANCE, math.cos(pitch) * CAM_DISTANCE));
		this.cam.CFrame = CFrame.lookAt(eye, look);
	}
}
