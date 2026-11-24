// One running match: sim state + AI + human input latches (pure, no Roblox services). The server drives it once per tick.
import { computeAIInputs, createAIState, type AIState } from "../ai";
import { getTeam, SIZE_PARAMS } from "../data";
import type { Country } from "../data/types";
import { autoPkOrders, createInitialState, step, type GameState, type InputFrame } from "../sim";
import { toWireEvents, type WireEvent } from "./events";
import { humanIdxForSlot, humanMask, type Slots } from "./slots";
import { InputLatch } from "./input";

export class MatchSim {
	readonly state: GameState;
	private readonly ai: AIState;
	private readonly latches: [InputLatch, InputLatch] = [new InputLatch(), new InputLatch()];
	/** True once the match (including a penalty shootout) is over. The sim is no longer stepped. */
	ended = false;
	/** Penalty shootout score if the match went to PK. */
	pkScore: [number, number] | undefined = undefined;

	constructor(
		readonly home: Country,
		readonly away: Country,
		seed: number,
		halfSeconds?: number,
	) {
		this.state = createInitialState({ seed, teams: [getTeam(home), getTeam(away)], halfSeconds }, SIZE_PARAMS);
		this.ai = createAIState((seed ^ 0x5bd1e995) >>> 0);
	}

	/** Latest frame from the human in `slot` (already validated). */
	receive(slot: number, frame: InputFrame): void {
		if (slot === 0 || slot === 1) this.latches[slot].receive(frame);
	}

	resetSlot(slot: number): void {
		if (slot === 0 || slot === 1) this.latches[slot].reset();
	}

	/** Runs one sim tick and returns the visual events of that tick. */
	step(slots: Slots): WireEvent[] {
		if (this.ended) return [];
		const state = this.state;
		const pk = state.match.phase === "pk";
		// The shootout has no human UI in this demo: the AI takes every kick for both teams.
		if (pk && state.match.pk !== undefined && state.match.pk.stage === "order") autoPkOrders(state, -1);
		const mask = pk ? humanMask([undefined, undefined], state.players.size()) : humanMask(slots, state.players.size());
		const inputs = computeAIInputs(state, this.ai, mask);
		if (!pk) {
			for (let s = 0; s < 2; s++) {
				if (slots[s] !== undefined) inputs[humanIdxForSlot(s)] = this.latches[s].consume();
			}
		}
		step(state, inputs);
		const wire = toWireEvents(state);
		for (const e of state.events) {
			if (e.type === "matchEnd") {
				this.ended = true;
				const p = state.match.pk;
				if (p !== undefined) this.pkScore = [p.score[0], p.score[1]];
			}
		}
		return wire;
	}
}
