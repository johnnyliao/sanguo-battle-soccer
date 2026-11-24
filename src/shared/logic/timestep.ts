// Fixed-timestep accumulator (pure). Same policy as the web game: clamp the frame time, cap the steps, drop any backlog.
export class FixedStepper {
	private acc = 0;

	constructor(
		private readonly stepSec: number = 1 / 60,
		private readonly maxSteps: number = 5,
		private readonly maxFrameSec: number = 0.25,
	) {}

	/** Adds a frame's elapsed time and returns how many fixed steps to run now. */
	advance(dt: number): number {
		if (dt > 0) this.acc += math.min(dt, this.maxFrameSec);
		let steps = 0;
		// 1e-9 absorbs float drift so 60 frames of 1/60 s give exactly 60 steps.
		while (this.acc >= this.stepSec - 1e-9 && steps < this.maxSteps) {
			this.acc -= this.stepSec;
			steps++;
		}
		if (this.acc >= this.stepSec - 1e-9) this.acc = 0;
		if (this.acc < 0) this.acc = 0;
		return steps;
	}

	reset(): void {
		this.acc = 0;
	}
}
