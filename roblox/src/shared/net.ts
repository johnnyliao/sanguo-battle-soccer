// Server <-> client contract for the R1a single-player match.
// The server is authoritative: it runs shared/game/sim at 60Hz; clients only send raw buttons
// and render the snapshots they receive.
const ReplicatedStorage = game.GetService("ReplicatedStorage");
const RunService = game.GetService("RunService");

/** Studs per sim pixel. Sim x -> World X, sim y (depth) -> World Z, sim z (height) -> World Y. */
export const STUDS_PER_PX = 0.2; // 2026-11-26: back to 0.2; the Roblox field is enlarged in the sim instead (FIELD_SCALE 1.5 via sync-game.mjs)

/** Extra sim-px offset added to x and y before scaling (the client sets it to centre small pitches). 0 = no offset. */
let simOffsetX = 0;
let simOffsetY = 0;

export function setSimOffset(xPx: number, yPx: number): void {
	simOffsetX = xPx;
	simOffsetY = yPx;
}

/** Sim pixel coords -> world position (ground at Y = 0). */
export function simToWorld(x: number, y: number, z: number): Vector3 {
	return new Vector3((x + simOffsetX) * STUDS_PER_PX, z * STUDS_PER_PX, (y + simOffsetY) * STUDS_PER_PX);
}

/** Server sends one Snapshot every SNAPSHOT_EVERY ticks (60Hz sim -> 30Hz snapshots). */
export const SNAPSHOT_EVERY = 2;
export const TICK_RATE = 60;

export type Country = "shu" | "wei" | "wu";

// ---------- client -> server ----------

/** Raw held state; sent whenever it changes. The server latches j/k/l presses between ticks. */
export interface ClientInput {
	moveX: number; // -1 | 0 | 1
	moveY: number; // -1 | 0 | 1  (-1 = up the screen = smaller sim y)
	dash: boolean;
	j: boolean;
	k: boolean;
	l: boolean;
}

/** Menu commands. "start" begins a quick match (also used for rematch). */
export type Command =
	| { cmd: "start"; country: Country }
	/** Starts story stage stageId (1..8) for the player's saved country and starter. */
	| { cmd: "story"; stageId: number }
	/** Picks the starter general; only accepted while the profile has no starter yet. */
	| { cmd: "chooseStarter"; country: Country; starter: string }
	/** Sets the lord's weapon (allowed any time; saved in the profile). */
	| { cmd: "chooseWeapon"; weapon: LordWeapon };

/** The lord's weapon (matches the sim's CharacterDef.weapon). */
export type LordWeapon = "sword" | "spear" | "fan";

// ---------- server -> client ----------

export interface SetupPlayer {
	idx: number;
	charId: string;
	name: string; // Chinese display name
	team: number; // 0 | 1
	role: string; // GK | DF | MF | FW
	size: string; // S | M | L
	radius: number; // sim px
	weapon?: LordWeapon; // only on the lord
}

/** Sent once when a match starts. */
export interface Setup {
	home: Country;
	away: Country;
	humanIdx: number;
	halfTicks: number;
	players: SetupPlayer[]; // index = player idx (home team first, then away; 2 * teamSize entries)
	teamSize: number; // 1..5 players per team
	field: { w: number; d: number; goalHalfW: number }; // sim px
	mode: "quick" | "story";
	stageId?: number; // story mode only
	awayLabel: string; // display name of the enemy side, e.g. "黃巾軍" or "魏"
	goalTarget?: number; // story only: first team to this many goals wins (no clock); absent = timed match
}

/** Server -> client result of a story stage, sent once when the stage's match ends. */
export interface StoryResult {
	stageId: number;
	won: boolean;
	xp: number;
	coins: number;
	levelBefore: number;
	levelAfter: number;
	recruited?: string; // charId, only when newly recruited by this result
	chapterClear: boolean;
}

export interface SnapPlayer {
	x: number;
	y: number;
	z: number;
	fx: number; // facingX
	fy: number; // facingY
	a: string; // PlayerAction ("normal", "down", "hitstun", ...)
	st: number; // stamina / maxStamina, 0..1
	inv: boolean; // isInvincible
	sp: string; // specialMode active indicator: "" or e.g. "rampage", "sail", "ride" (when the player's special is running)
}

export interface SnapBall {
	x: number;
	y: number;
	z: number;
	owner: number; // -1 = free
	special: string; // "" or SpecialShot.kind
}

/** Field effects drawn as simple shapes in R1a. r = radius in sim px (0 for non-area kinds). */
export interface SnapZone {
	k: "ice" | "gust" | "portal" | "eastwind" | "arrowship" | "rider" | "wave" | "whirl" | "spear" | "puff";
	x: number;
	y: number;
	r: number;
	team: number;
	dir: number; // arrowship dir / wave dirX sign; 0 otherwise
	dx?: number; // spear / puff unit direction (x, y); absent otherwise
	dy?: number;
	idx?: number; // whirl only: the spinning player's idx (the client starts / ends the spin from this zone)
}

export interface SnapPk {
	stage: string; // order | aim | flight | result | done
	shooterIdx: number;
	keeperIdx: number;
	meter: number; // 0..1 current power meter (pkMeterValue), -1 if not started
	score: [number, number];
	outcome: string; // last outcome text key or ""
}

export interface SimEventLite {
	type: string;
	[key: string]: unknown;
}

export interface Snapshot {
	tick: number;
	phase: string; // kickoff | play | goal | halftime | fulltime | pk
	phaseTimer: number;
	half: number;
	clockTicks: number;
	score: [number, number];
	swapped: boolean; // second half: teams have switched ends
	players: SnapPlayer[]; // 2 * teamSize
	ball: SnapBall;
	zones: SnapZone[];
	pk: SnapPk | undefined;
	/** Human player's special cooldown in ticks (0 = ready) and block reason ("" = can cast). */
	cooldown: number;
	blockReason: string;
	/** All sim events since the previous snapshot, in order. */
	events: SimEventLite[];
}

// ---------- remotes ----------

export const NET_FOLDER = "Net";
export const REMOTE_NAMES = ["Input", "Command", "Setup", "Snapshot", "StoryResult", "Tutorial"] as const;

/** Tutorial (story stage 0) step, server -> client. 1 = go to the ball, 2 = shoot into the goal, 3 = punch the enemy,
 *  4 = use your special, 5 = win the ball back, 6 = score again, 7 = done (celebration, then the win). */
export interface TutorialStep {
	step: number;
}

export interface Remotes {
	Input: RemoteEvent; // client -> server: (input: ClientInput)
	Command: RemoteEvent; // client -> server: (cmd: Command)
	Setup: RemoteEvent; // server -> client: (setup: Setup)
	Snapshot: RemoteEvent; // server -> client: (snap: Snapshot)
	StoryResult: RemoteEvent; // server -> client: (result: StoryResult)
	Tutorial: RemoteEvent; // server -> client: (step: TutorialStep)
}

/** Server creates the folder + remotes; clients wait for them. */
export function getRemotes(): Remotes {
	if (RunService.IsServer()) {
		let folder = ReplicatedStorage.FindFirstChild(NET_FOLDER) as Folder | undefined;
		if (!folder) {
			folder = new Instance("Folder");
			folder.Name = NET_FOLDER;
			folder.Parent = ReplicatedStorage;
		}
		for (const name of REMOTE_NAMES) {
			if (!folder.FindFirstChild(name)) {
				const r = new Instance("RemoteEvent");
				r.Name = name;
				r.Parent = folder;
			}
		}
		return {
			Input: folder.FindFirstChild("Input") as RemoteEvent,
			Command: folder.FindFirstChild("Command") as RemoteEvent,
			Setup: folder.FindFirstChild("Setup") as RemoteEvent,
			Snapshot: folder.FindFirstChild("Snapshot") as RemoteEvent,
			StoryResult: folder.FindFirstChild("StoryResult") as RemoteEvent,
			Tutorial: folder.FindFirstChild("Tutorial") as RemoteEvent,
		};
	}
	const folder = ReplicatedStorage.WaitForChild(NET_FOLDER) as Folder;
	return {
		Input: folder.WaitForChild("Input") as RemoteEvent,
		Command: folder.WaitForChild("Command") as RemoteEvent,
		Setup: folder.WaitForChild("Setup") as RemoteEvent,
		Snapshot: folder.WaitForChild("Snapshot") as RemoteEvent,
		StoryResult: folder.WaitForChild("StoryResult") as RemoteEvent,
		Tutorial: folder.WaitForChild("Tutorial") as RemoteEvent,
	};
}
