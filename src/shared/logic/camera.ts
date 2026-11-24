// Camera math (pure).

/** Vertical FOV in degrees so that `visibleWidth` studs are visible across the screen at `dist` studs from the camera. */
export function cameraFov(visibleWidth: number, dist: number, aspect: number): number {
	const halfH = math.atan(visibleWidth / 2 / dist);
	const halfV = math.atan(math.tan(halfH) / aspect);
	return math.min(70, math.max(20, math.deg(halfV * 2)));
}

/** Camera centre X: follows the ball, but the view edge never goes more than `margin` studs past the field ends. */
export function cameraTargetX(ballX: number, halfVisible: number, fieldW: number, margin: number): number {
	const lo = halfVisible - margin;
	const hi = fieldW + margin - halfVisible;
	if (lo >= hi) return fieldW / 2;
	return math.min(hi, math.max(lo, ballX));
}

/** Frame-rate independent exponential smoothing toward a target. */
export function smooth(current: number, target: number, dt: number, rate: number): number {
	return current + (target - current) * (1 - math.exp(-rate * dt));
}
