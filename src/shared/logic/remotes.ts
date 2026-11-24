// Names and payload types of the remotes (created by the server at runtime under ReplicatedStorage.Remotes).
export const REMOTES_FOLDER = "Remotes";
export const REMOTE_READY = "Ready"; // client -> server: listeners are connected, send the lobby state
export const REMOTE_PICK = "Pick"; // client -> server: country id string
export const REMOTE_INPUT = "Input"; // client -> server: InputFrame
export const REMOTE_LOBBY = "Lobby"; // server -> client: LobbyMsg
export const REMOTE_EVENTS = "Events"; // server -> client: WireEvent[]
export const REMOTE_SNAP = "Snap"; // server -> client (unreliable): buffer from encodeSnapshot

export interface LobbyMsg {
	/** pick: waiting for the first player's country. play: match running. result: match over, restarts soon. */
	mode: "pick" | "play" | "result";
	/** 0 or 1 if this client plays, -1 if it spectates. */
	slot: number;
	/** Sim player index this client controls, or -1. */
	humanIdx: number;
	/** True for the client that may pick the country (slot 0 during pick). */
	canPick: boolean;
	/** Country ids of team 0 and team 1, once chosen. */
	teams?: [string, string];
	/** Final score (result mode). */
	score?: [number, number];
	/** Penalty shootout score if the match went to PK (result mode). */
	pk?: [number, number];
	/** Seconds until the next match (result mode). */
	restartSec?: number;
}
