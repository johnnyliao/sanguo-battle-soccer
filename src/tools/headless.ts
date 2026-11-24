import { computeAIInputs, createAIState } from "shared/ai";
import { getTeam, SIZE_PARAMS } from "shared/data";
import { createInitialState, step, type GameState } from "shared/sim";

/** Fixed scenario. The reference run in the web project must use the same values. */
const SEED = 12345;
const HALF_SECONDS = 120;
const TICKS = 14400; // 2 x 120 s at 60 Hz

/** C-style %.16e text for a double (0 printed as "0" so -0 and 0 match). */
function num(x: number): string {
	if (x === 0) return "0";
	return string.format("%.16e", x);
}

/** One line per tick with every value the sim changes, all as exact float text. */
function line(state: GameState, aiRng: number): string {
	const parts: string[] = [
		num(state.tick),
		num(state.rng),
		num(aiRng),
		state.match.phase,
		num(state.match.phaseTimer),
		num(state.match.clockTicks),
		num(state.match.score[0]),
		num(state.match.score[1]),
		num(state.ball.x),
		num(state.ball.y),
		num(state.ball.z),
		num(state.ball.vx),
		num(state.ball.vy),
		num(state.ball.vz),
		num(state.ball.ownerIdx),
	];
	for (const p of state.players) {
		parts.push(
			num(p.x),
			num(p.y),
			num(p.z),
			num(p.vx),
			num(p.vy),
			num(p.stamina),
			p.action,
			num(p.actionTimer),
		);
	}
	return parts.join(" ");
}

const state = createInitialState(
	{ seed: SEED, teams: [getTeam("shu"), getTeam("wu")], halfSeconds: HALF_SECONDS },
	SIZE_PARAMS,
);
const ai = createAIState((SEED ^ 0x5bd1e995) >>> 0);
const humanMask = state.players.map(() => false);
const eventCounts = new Map<string, number>();

print(line(state, ai.rng));
for (let i = 0; i < TICKS; i++) {
	const inputs = computeAIInputs(state, ai, humanMask);
	step(state, inputs);
	for (const e of state.events) {
		eventCounts.set(e.type, (eventCounts.get(e.type) ?? 0) + 1);
	}
	print(line(state, ai.rng));
}

const kinds: string[] = [];
for (const [k] of eventCounts) kinds.push(k);
kinds.sort((a, b) => a < b);
print("SUMMARY phase=" + state.match.phase + " half=" + num(state.match.half) + " score=" + num(state.match.score[0]) + "-" + num(state.match.score[1]) + " tick=" + num(state.tick));
for (const k of kinds) print("EVENT " + k + " " + num(eventCounts.get(k) ?? 0));
