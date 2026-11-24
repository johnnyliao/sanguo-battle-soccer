// Sim events forwarded to clients for visuals (pure). Coordinates stay in sim px; the client converts to studs.
import { FEAR_RADIUS, GUST_RADIUS } from "../sim/constants";
import type { GameState, SimEvent } from "../sim/types";

export interface WireEvent {
	/** Event kind (the sim event type for most; see toWireEvents). */
	t: string;
	/** Sim tick the event happened in. */
	tick: number;
	/** Player idx (caster, attacker, scorer, ...). */
	p?: number;
	/** Victim player idxs. */
	v?: number[];
	x?: number;
	y?: number;
	/** Radius in px. */
	r?: number;
	/** Field / ship id. */
	id?: number;
	/** Text: special name, attack kind, whistle reason, pk outcome, or the scorer's name for goals. */
	n?: string;
	/** Name of the player `p`. */
	m?: string;
	/** Direction (+1 / -1) for the arrowship. */
	d?: number;
	/** Half span in px for the arrowship. */
	w?: number;
	team?: number;
}

/** Picks the events that matter for visuals out of state.events (the events of the tick that was just stepped). */
export function toWireEvents(state: GameState): WireEvent[] {
	const out: WireEvent[] = [];
	const tick = state.tick;
	const nameOf = (idx: number): string => (idx >= 0 && idx < state.players.size() ? state.players[idx].name : "");
	for (const e of state.events as SimEvent[]) {
		switch (e.type) {
			case "goal":
				out.push({ t: "goal", tick, team: e.team, p: e.scorerIdx, n: nameOf(e.scorerIdx) });
				break;
			case "special":
				out.push({ t: "special", tick, p: e.playerIdx, m: nameOf(e.playerIdx), n: e.name });
				break;
			case "down":
				out.push({ t: "down", tick, p: e.playerIdx });
				break;
			case "hit":
				out.push({ t: "hit", tick, p: e.attackerIdx, v: [e.victimIdx], n: e.kind });
				break;
			case "iceStart":
				out.push({ t: "iceStart", tick, p: e.playerIdx, id: e.fieldId, x: e.x, y: e.y, r: e.radius });
				break;
			case "iceEnd":
				out.push({ t: "iceEnd", tick, id: e.fieldId });
				break;
			case "portalStart":
				out.push({ t: "portalStart", tick, p: e.playerIdx, id: e.portalId, x: e.x, y: e.y, r: e.radius });
				break;
			case "portalEnd":
				out.push({ t: "portalEnd", tick, id: e.portalId });
				break;
			case "eastwindStart":
				out.push({ t: "eastwindStart", tick, p: e.playerIdx, id: e.windId, x: e.x, y: e.y, r: e.radius });
				break;
			case "eastwindEnd":
				out.push({ t: "eastwindEnd", tick, id: e.windId });
				break;
			case "arrowshipStart":
				out.push({ t: "arrowshipStart", tick, p: e.playerIdx, id: e.shipId, x: e.x, y: e.y, d: e.dir, w: e.halfSpan });
				break;
			case "arrowshipEnd":
				out.push({ t: "arrowshipEnd", tick, id: e.shipId });
				break;
			case "gustBlow":
				out.push({ t: "gustBlow", tick, id: e.gustId, x: e.x, y: e.y, r: GUST_RADIUS, v: e.victimIdxs });
				break;
			case "roar":
				out.push({ t: "roar", tick, p: e.playerIdx, x: e.x, y: e.y, r: e.radius });
				break;
			case "fear": {
				const caster = state.players[e.playerIdx];
				out.push({ t: "fear", tick, p: e.playerIdx, x: caster.x, y: caster.y, r: FEAR_RADIUS, v: e.victimIdxs });
				break;
			}
			case "whistle":
				out.push({ t: "whistle", tick, n: e.reason });
				break;
			case "pkStart":
				out.push({ t: "pkStart", tick });
				break;
			case "pkResult":
				out.push({ t: "pkResult", tick, team: e.team, n: e.outcome });
				break;
			case "matchEnd":
				out.push({ t: "matchEnd", tick });
				break;
			default:
				break;
		}
	}
	return out;
}
