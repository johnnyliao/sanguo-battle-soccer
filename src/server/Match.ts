import type { Country } from "shared/data/types";
import type { WireEvent } from "shared/logic/events";
import { sanitizeInput } from "shared/logic/input";
import { MatchSim } from "shared/logic/matchSim";
import {
	REMOTES_FOLDER,
	REMOTE_EVENTS,
	REMOTE_INPUT,
	REMOTE_LOBBY,
	REMOTE_PICK,
	REMOTE_READY,
	REMOTE_SNAP,
	type LobbyMsg,
} from "shared/logic/remotes";
import { encodeSnapshot } from "shared/logic/snapshot";
import { assignSlot, humanIdxForSlot, isCountry, pickOpponent, releaseSlot, slotOf, type Slots } from "shared/logic/slots";
import { FixedStepper } from "shared/logic/timestep";

const Players = game.GetService("Players");
const ReplicatedStorage = game.GetService("ReplicatedStorage");
const RunService = game.GetService("RunService");

const SNAP_INTERVAL = 1 / 30;
const RESULT_SECONDS = 5;

/** Server-side match service: lobby (country pick), 60 Hz sim loop, input intake, 30 Hz snapshots, event forwarding. */
export class MatchService {
	private readonly rng = new Random(os.time());
	private readonly stepper = new FixedStepper(1 / 60, 5);
	private readonly slots: Slots = [undefined, undefined];
	/** Everyone connected, in join order. */
	private readonly joined: Player[] = [];
	private mode: "pick" | "play" | "result" = "pick";
	private countries: [Country, Country] | undefined = undefined;
	private match: MatchSim | undefined = undefined;
	private pending: WireEvent[] = [];
	private snapAcc = 0;
	private resultLeft = 0;

	private readonly lobbyRemote: RemoteEvent;
	private readonly eventsRemote: RemoteEvent;
	private readonly snapRemote: UnreliableRemoteEvent;

	constructor() {
		Players.CharacterAutoLoads = false;
		const folder = new Instance("Folder");
		folder.Name = REMOTES_FOLDER;
		const make = <T extends Instance>(className: "RemoteEvent" | "UnreliableRemoteEvent", name: string): T => {
			const r = new Instance(className);
			r.Name = name;
			r.Parent = folder;
			return r as unknown as T;
		};
		this.lobbyRemote = make<RemoteEvent>("RemoteEvent", REMOTE_LOBBY);
		this.eventsRemote = make<RemoteEvent>("RemoteEvent", REMOTE_EVENTS);
		this.snapRemote = make<UnreliableRemoteEvent>("UnreliableRemoteEvent", REMOTE_SNAP);
		const ready = make<RemoteEvent>("RemoteEvent", REMOTE_READY);
		const pick = make<RemoteEvent>("RemoteEvent", REMOTE_PICK);
		const input = make<RemoteEvent>("RemoteEvent", REMOTE_INPUT);
		folder.Parent = ReplicatedStorage;

		ready.OnServerEvent.Connect((player) => this.sendLobby(player));
		pick.OnServerEvent.Connect((player, ...args) => this.onPick(player, args[0]));
		input.OnServerEvent.Connect((player, ...args) => this.onInput(player, args[0]));
		Players.PlayerAdded.Connect((player) => this.onJoin(player));
		Players.PlayerRemoving.Connect((player) => this.onLeave(player));
		for (const player of Players.GetPlayers()) this.onJoin(player);
		RunService.Heartbeat.Connect((dt) => this.onHeartbeat(dt));
	}

	private onJoin(player: Player): void {
		if (this.joined.includes(player)) return;
		this.joined.push(player);
		assignSlot(this.slots, player.UserId);
		this.sendLobby(player);
	}

	private onLeave(player: Player): void {
		const idx = this.joined.indexOf(player);
		if (idx >= 0) this.joined.remove(idx);
		const slot = slotOf(this.slots, player.UserId);
		releaseSlot(this.slots, player.UserId);
		if (slot >= 0) this.match?.resetSlot(slot);
		if (this.joined.size() === 0) {
			// Nobody left: wait for the next first player to pick a country.
			this.mode = "pick";
			this.match = undefined;
			this.countries = undefined;
			this.pending = [];
			return;
		}
		// Spectators move into free slots, in join order.
		for (const p of this.joined) assignSlot(this.slots, p.UserId);
		// While picking, the picker must hold slot 0.
		if (this.mode === "pick" && this.slots[0] === undefined && this.slots[1] !== undefined) {
			this.slots[0] = this.slots[1];
			this.slots[1] = undefined;
		}
		this.broadcastLobby();
	}

	private onPick(player: Player, country: unknown): void {
		if (this.mode !== "pick" || !isCountry(country)) return;
		if (slotOf(this.slots, player.UserId) !== 0) return;
		this.countries = [country, pickOpponent(country, this.rng.NextNumber())];
		this.beginMatch();
	}

	private onInput(player: Player, raw: unknown): void {
		const slot = slotOf(this.slots, player.UserId);
		if (slot < 0 || this.mode !== "play" || this.match === undefined) return;
		const frame = sanitizeInput(raw);
		if (frame !== undefined) this.match.receive(slot, frame);
	}

	private beginMatch(): void {
		if (this.countries === undefined) return;
		this.match = new MatchSim(this.countries[0], this.countries[1], this.rng.NextInteger(1, 2147483646));
		this.stepper.reset();
		this.pending = [];
		this.snapAcc = 0;
		this.mode = "play";
		this.broadcastLobby();
	}

	private lobbyMsg(player: Player): LobbyMsg {
		const slot = slotOf(this.slots, player.UserId);
		const msg: LobbyMsg = {
			mode: this.mode,
			slot,
			humanIdx: humanIdxForSlot(slot),
			canPick: this.mode === "pick" && slot === 0,
		};
		if (this.countries !== undefined) msg.teams = [this.countries[0], this.countries[1]];
		if (this.mode === "result" && this.match !== undefined) {
			const m = this.match.state.match;
			msg.score = [m.score[0], m.score[1]];
			msg.pk = this.match.pkScore;
			msg.restartSec = RESULT_SECONDS;
		}
		return msg;
	}

	private sendLobby(player: Player): void {
		this.lobbyRemote.FireClient(player, this.lobbyMsg(player));
	}

	private broadcastLobby(): void {
		for (const p of this.joined) this.sendLobby(p);
	}

	private onHeartbeat(dt: number): void {
		const match = this.match;
		if (match === undefined || this.mode === "pick") return;

		if (this.mode === "play") {
			const steps = this.stepper.advance(dt);
			for (let i = 0; i < steps; i++) {
				for (const e of match.step(this.slots)) this.pending.push(e);
				if (match.ended) {
					this.mode = "result";
					this.resultLeft = RESULT_SECONDS;
					this.broadcastLobby();
					break;
				}
			}
		} else {
			this.resultLeft -= dt;
		}

		this.snapAcc += dt;
		if (this.snapAcc >= SNAP_INTERVAL) {
			this.snapAcc = this.snapAcc % SNAP_INTERVAL;
			this.snapRemote.FireAllClients(encodeSnapshot(match.state));
		}
		if (this.pending.size() > 0) {
			this.eventsRemote.FireAllClients(this.pending);
			this.pending = [];
		}

		if (this.mode === "result" && this.resultLeft <= 0) this.beginMatch();
	}
}
