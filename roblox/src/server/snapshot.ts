// Builds the server -> client Snapshot from the sim state. Pure: reads state, changes nothing.
import {
	ARROWSHIP_HALF_SPAN,
	EASTWIND_RADIUS,
	GUST_RADIUS,
	ICE_RADIUS,
	PORTAL_RADIUS,
	isInvincible,
	pkMeterValue,
	type GameState,
	type Player,
} from "shared/game/sim";
import type { SnapPlayer, SnapPk, SnapZone, Snapshot, SimEventLite } from "shared/net";

/** Special kind shown on a player while his special effect is running; "" when none. */
function specialOf(p: Player): string {
	if (p.rampageTicks > 0) return "rampage";
	if (p.sailTicks > 0) return "sail";
	if (p.tigerTicks > 0) return "tiger";
	if (p.slashTicks > 0) return "slash";
	if (p.action === "ride") return "ride";
	return "";
}

function dirSign(v: number): number {
	return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** Full Snapshot for the human at humanIdx. events = sim events since the previous snapshot, in order. */
export function buildSnapshot(state: GameState, humanIdx: number, events: SimEventLite[]): Snapshot {
	const players: SnapPlayer[] = state.players.map(
		(p): SnapPlayer => ({
			x: p.x,
			y: p.y,
			z: p.z,
			fx: p.facingX,
			fy: p.facingY,
			a: p.action,
			st: p.maxStamina > 0 ? p.stamina / p.maxStamina : 0,
			inv: isInvincible(p),
			sp: specialOf(p),
		}),
	);

	const zones: SnapZone[] = [];
	for (const f of state.iceFields) {
		zones.push({ k: "ice", x: f.x, y: f.y, r: ICE_RADIUS, team: f.team, dir: 0 });
	}
	for (const g of state.gusts) {
		zones.push({ k: "gust", x: g.x, y: g.y, r: GUST_RADIUS, team: g.team, dir: 0 });
	}
	for (const po of state.portals) {
		zones.push({ k: "portal", x: po.x, y: po.y, r: PORTAL_RADIUS, team: po.team, dir: 0 });
	}
	for (const ew of state.eastwinds) {
		zones.push({ k: "eastwind", x: ew.x, y: ew.y, r: EASTWIND_RADIUS, team: ew.team, dir: 0 });
	}
	for (const s of state.arrowships) {
		zones.push({ k: "arrowship", x: s.x, y: s.y, r: ARROWSHIP_HALF_SPAN, team: s.team, dir: s.dir });
	}
	for (const r of state.riders) {
		zones.push({ k: "rider", x: r.x, y: r.y, r: 0, team: r.team, dir: 0 });
	}
	for (const w of state.waves) {
		zones.push({ k: "wave", x: w.x, y: w.y, r: 0, team: w.team, dir: dirSign(w.dirX) });
	}

	const pkState = state.match.pk;
	const pk: SnapPk | undefined =
		pkState === undefined
			? undefined
			: {
					stage: pkState.stage,
					shooterIdx: pkState.shooterIdx,
					keeperIdx: pkState.keeperIdx,
					meter: pkState.meterTicks < 0 ? -1 : pkMeterValue(pkState.meterTicks),
					score: [pkState.score[0], pkState.score[1]],
					outcome: pkState.outcome ?? "",
				};

	const ball = state.ball;
	const human = state.players[humanIdx];
	return {
		tick: state.tick,
		phase: state.match.phase,
		phaseTimer: state.match.phaseTimer,
		half: state.match.half,
		clockTicks: state.match.clockTicks,
		score: [state.match.score[0], state.match.score[1]],
		swapped: state.match.swapped,
		players,
		ball: {
			x: ball.x,
			y: ball.y,
			z: ball.z,
			owner: ball.ownerIdx,
			special: ball.special ? ball.special.kind : ball.tiger ? "tiger" : "",
		},
		zones,
		pk,
		cooldown: human.specialCooldown,
		blockReason: "",
		events,
	};
}
