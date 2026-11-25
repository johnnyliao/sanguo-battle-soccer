// Authoritative 1-human vs AI 5v5 match. Runs the shared sim at 60Hz and streams snapshots to the human.
import { computeAIInputs, createAIState, type AIState } from "shared/game/ai";
import { getTeam, SIZE_PARAMS } from "shared/game/data";
import {
	autoPkOrders,
	createInitialState,
	step,
	type GameState,
	type InputFrame,
} from "shared/game/sim";
import {
	getRemotes,
	SNAPSHOT_EVERY,
	TICK_RATE,
	type Country,
	type Setup,
	type SetupPlayer,
	type SimEventLite,
} from "shared/net";
import { buildSnapshot } from "./snapshot";

const Players = game.GetService("Players");
const RunService = game.GetService("RunService");

const TICK_DT = 1 / TICK_RATE;
/** Caps catch-up work per rendered frame; leftover time beyond this is dropped. */
const MAX_TICKS_PER_FRAME = 4;
const COUNTRIES: Country[] = ["shu", "wei", "wu"];
/** Idx of the human-controlled player (home FW). */
const HUMAN_IDX = 4;
const HUMAN_MASK: boolean[] = [false, false, false, false, true, false, false, false, false, false];

const remotes = getRemotes();
Players.CharacterAutoLoads = false;

// Match session. state === undefined means no match is running.
let humanPlayer: Player | undefined;
let state: GameState | undefined;
let ai: AIState | undefined;
let held: InputFrame = { moveX: 0, moveY: 0, dash: false, j: false, k: false, l: false };
/** Presses (j/k/l) seen since the last tick; consumed by the next tick. */
const latch = { j: false, k: false, l: false };
/** Events produced since the last Snapshot send. */
let pending: SimEventLite[] = [];
let acc = 0;
let finishedAcc = 0;

function isFulltime(s: GameState): boolean {
	return s.match.phase === "fulltime";
}

function toDir(v: unknown): -1 | 0 | 1 {
	if (!typeIs(v, "number") || v !== v) return 0;
	return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function parseCountry(v: unknown): Country | undefined {
	if (v === "shu" || v === "wei" || v === "wu") return v;
	return undefined;
}

function pickAway(home: Country): Country {
	const others = COUNTRIES.filter((c) => c !== home);
	return others[math.random(0, others.size() - 1)];
}

function stopMatch(): void {
	humanPlayer = undefined;
	state = undefined;
	ai = undefined;
	pending = [];
	acc = 0;
	finishedAcc = 0;
}

function startMatch(player: Player, home: Country): void {
	const away = pickAway(home);
	const seed = (os.time() + math.random(1, 1000000000)) % 2147483647;
	const s = createInitialState({ seed, teams: [getTeam(home), getTeam(away)] }, SIZE_PARAMS);
	state = s;
	ai = createAIState(seed);
	humanPlayer = player;
	held = { moveX: 0, moveY: 0, dash: false, j: false, k: false, l: false };
	latch.j = false;
	latch.k = false;
	latch.l = false;
	pending = [];
	acc = 0;
	finishedAcc = 0;

	const players = s.players.map(
		(p): SetupPlayer => ({
			idx: p.idx,
			charId: p.charId,
			name: p.name,
			team: p.team,
			role: p.role,
			size: p.size,
			radius: p.radius,
		}),
	);
	const setup: Setup = { home, away, humanIdx: HUMAN_IDX, halfTicks: s.match.halfTicks, players };
	remotes.Setup.FireClient(player, setup);
}

function sendSnapshot(s: GameState): void {
	const p = humanPlayer;
	if (p === undefined) return;
	remotes.Snapshot.FireClient(p, buildSnapshot(s, HUMAN_IDX, pending));
	pending = [];
}

/** One 60Hz sim tick with the human's latched input. */
function runTick(s: GameState, a: AIState): void {
	const inputs = computeAIInputs(s, a, HUMAN_MASK);
	inputs[HUMAN_IDX] = {
		moveX: held.moveX,
		moveY: held.moveY,
		dash: held.dash,
		j: held.j || latch.j,
		k: held.k || latch.k,
		l: held.l || latch.l,
	};
	latch.j = false;
	latch.k = false;
	latch.l = false;

	// Dev hook (off unless attribute set): press special for player idx 0-9 for one tick.
	if (game.GetService("Workspace").GetAttribute("DebugNoAISpecial") === true) {
		for (let i = 0; i < inputs.size(); i++) {
			if (i !== HUMAN_IDX) inputs[i] = { ...inputs[i], l: false };
		}
	}
	const dbg = game.GetService("Workspace").GetAttribute("DebugSpecialIdx");
	if (typeIs(dbg, "number")) {
		const di = math.floor(dbg);
		if (di >= 0 && di < inputs.size()) {
			inputs[di] = { ...inputs[di], l: true };
		}
		game.GetService("Workspace").SetAttribute("DebugSpecialIdx", undefined);
	}

	// Dev hook (off unless attribute set): DebugShootAtGoal = team (0/1) -> an opponent fires a shot at that team's goal.
	const dbgShoot = game.GetService("Workspace").GetAttribute("DebugShootAtGoal");
	if (typeIs(dbgShoot, "number")) {
		game.GetService("Workspace").SetAttribute("DebugShootAtGoal", undefined);
		const gk = s.players[dbgShoot === 0 ? 0 : 5];
		let shooter = s.players[dbgShoot === 0 ? 9 : 4];
		let bestD = 1e9;
		for (const q of s.players) {
			if (q.team === gk.team || q.role === "GK") continue;
			const dd = math.abs(q.x - gk.x);
			if (dd < bestD) {
				bestD = dd;
				shooter = q;
			}
		}
		const dirX = gk.x < 600 ? 1 : -1;
		const goalX = gk.x < 600 ? 0 : 1200;
		shooter.x = goalX + dirX * 130;
		shooter.y = 130;
		shooter.vx = 0;
		shooter.vy = 0;
		const b = s.ball;
		b.x = goalX + dirX * 100;
		b.y = 130;
		b.z = 8;
		b.vx = -dirX * 260;
		b.vy = 0;
		b.vz = 0;
		b.ownerIdx = -1;
		b.lastTouchIdx = shooter.idx;
		b.special = undefined;
		// Put one more opponent in the lob's landing zone so a tiger ball has someone to hit.
		for (const q of s.players) {
			if (q.team === gk.team || q.role === "GK" || q === shooter) continue;
			q.x = goalX + dirX * 400;
			q.y = 130;
			q.vx = 0;
			q.vy = 0;
			break;
		}
	}

	step(s, inputs);
	const pk = s.match.pk;
	if (s.match.phase === "pk" && pk !== undefined && pk.stage === "order") {
		autoPkOrders(s, -1);
	}
	for (const e of s.events) {
		pending.push({ ...e } as SimEventLite);
	}
}

// Start / rematch. A new start replaces any running match and makes the sender the human.
remotes.Command.OnServerEvent.Connect((player, raw) => {
	if (!typeIs(raw, "table")) return;
	const r = raw as { cmd?: unknown; country?: unknown };
	if (r.cmd !== "start") return;
	const country = parseCountry(r.country);
	if (country === undefined) return;
	startMatch(player, country);
});

// Raw held buttons from the human. Untrusted: coerce every field.
remotes.Input.OnServerEvent.Connect((player, raw) => {
	if (player !== humanPlayer) return;
	if (!typeIs(raw, "table")) return;
	const r = raw as { moveX?: unknown; moveY?: unknown; dash?: unknown; j?: unknown; k?: unknown; l?: unknown };
	held = {
		moveX: toDir(r.moveX),
		moveY: toDir(r.moveY),
		dash: r.dash === true,
		j: r.j === true,
		k: r.k === true,
		l: r.l === true,
	};
	if (held.j) latch.j = true;
	if (held.k) latch.k = true;
	if (held.l) latch.l = true;
});

Players.PlayerRemoving.Connect((player: Player) => {
	if (player === humanPlayer) stopMatch();
});

RunService.Heartbeat.Connect((dt: number) => {
	const s = state;
	const a = ai;
	if (s === undefined || a === undefined || humanPlayer === undefined) return;

	if (s.match.phase === "fulltime") {
		// Match is over: stop stepping, keep sending the final state at the snapshot rate.
		finishedAcc += dt;
		if (finishedAcc >= SNAPSHOT_EVERY * TICK_DT) {
			finishedAcc = 0;
			sendSnapshot(s);
		}
		return;
	}

	const dbgSpeed = game.GetService("Workspace").GetAttribute("DebugMatchSpeed");
	acc += typeIs(dbgSpeed, "number") && dbgSpeed > 0 ? dt * dbgSpeed : dt;
	let ticks = 0;
	while (acc >= TICK_DT && ticks < MAX_TICKS_PER_FRAME && !isFulltime(s)) {
		runTick(s, a);
		acc -= TICK_DT;
		ticks++;
		if (s.tick % SNAPSHOT_EVERY === 0) sendSnapshot(s);
	}
	if (acc >= TICK_DT) acc = 0;
});
