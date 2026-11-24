// Snapshot interpolation buffer (pure). Renders slightly behind the newest snapshot using the server tick timeline.
import type { Snapshot } from "./snapshot";

/** Moves larger than this between two snapshots (px) are teleports (kickoff reset, portal), not interpolated. */
const TELEPORT_PX = 150;
const MAX_KEPT = 40;
/** A tick this far behind the newest means the server restarted its match: start a new timeline. */
const RESTART_TICKS = 120;

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
	let d = (b - a) % (2 * math.pi);
	if (d > math.pi) d -= 2 * math.pi;
	if (d < -math.pi) d += 2 * math.pi;
	return a + d * t;
}

export function lerpSnapshot(a: Snapshot, b: Snapshot, t: number): Snapshot {
	const nearer = t < 0.5 ? a : b;
	const players = a.players.map((pa, i) => {
		const pb = b.players[i];
		const base = t < 0.5 ? pa : pb;
		const dx = pb.x - pa.x;
		const dy = pb.y - pa.y;
		if (dx * dx + dy * dy > TELEPORT_PX * TELEPORT_PX) return base;
		return {
			...base,
			x: lerp(pa.x, pb.x, t),
			y: lerp(pa.y, pb.y, t),
			z: lerp(pa.z, pb.z, t),
			facing: lerpAngle(pa.facing, pb.facing, t),
			stamina: lerp(pa.stamina, pb.stamina, t),
		};
	});
	const bdx = b.ball.x - a.ball.x;
	const bdy = b.ball.y - a.ball.y;
	const ball =
		bdx * bdx + bdy * bdy > TELEPORT_PX * TELEPORT_PX
			? nearer.ball
			: {
					x: lerp(a.ball.x, b.ball.x, t),
					y: lerp(a.ball.y, b.ball.y, t),
					z: lerp(a.ball.z, b.ball.z, t),
					ownerIdx: nearer.ball.ownerIdx,
				};
	return {
		tick: nearer.tick,
		phase: nearer.phase,
		half: nearer.half,
		clockTicks: nearer.clockTicks,
		score: nearer.score,
		ball,
		players,
	};
}

export class SnapshotBuffer {
	private snaps: Snapshot[] = [];
	/** Estimated (client clock - server clock). Follows the fastest arrivals, drifts up slowly. */
	private offset: number | undefined = undefined;

	/** Adds a snapshot received at client time `recvTime` (seconds). Returns false if it is stale or out of order. */
	push(recvTime: number, snap: Snapshot): boolean {
		const last = this.snaps[this.snaps.size() - 1];
		if (last !== undefined) {
			if (snap.tick <= last.tick && last.tick - snap.tick < RESTART_TICKS) return false;
			if (snap.tick < last.tick) this.reset();
		}
		const off = recvTime - snap.tick / 60;
		this.offset = this.offset === undefined || off < this.offset ? off : this.offset + (off - this.offset) * 0.02;
		this.snaps.push(snap);
		if (this.snaps.size() > MAX_KEPT) this.snaps.remove(0);
		return true;
	}

	reset(): void {
		this.snaps = [];
		this.offset = undefined;
	}

	/** The state to draw at client time `now`, `delay` seconds behind the newest data. */
	sample(now: number, delay: number): Snapshot | undefined {
		const n = this.snaps.size();
		if (n === 0 || this.offset === undefined) return undefined;
		const serverTime = now - this.offset - delay;
		const first = this.snaps[0];
		if (n === 1 || serverTime <= first.tick / 60) return first;
		const last = this.snaps[n - 1];
		if (serverTime >= last.tick / 60) return last;
		for (let i = n - 1; i > 0; i--) {
			const a = this.snaps[i - 1];
			const b = this.snaps[i];
			const ta = a.tick / 60;
			const tb = b.tick / 60;
			if (serverTime >= ta && serverTime <= tb) {
				return lerpSnapshot(a, b, tb > ta ? (serverTime - ta) / (tb - ta) : 1);
			}
		}
		return last;
	}
}
