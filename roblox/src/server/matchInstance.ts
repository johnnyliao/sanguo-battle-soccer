// One server-side match for one player: the shared sim at 60Hz, AI for every other player, the owner's latched input.
// Setup, snapshots and events go only to the owner. The caller steps it from Heartbeat with update(dt).
import { computeAIInputs, createAIState, type AIState } from "shared/game/ai";
import { attackDir, autoPkOrders, step, type GameState, type InputFrame } from "shared/game/sim";
import { getRemotes, SNAPSHOT_EVERY, TICK_RATE, type Setup, type SimEventLite, type TutorialStep } from "shared/net";
import { TUTORIAL_STAGE_ID } from "shared/story";
import { buildSnapshot } from "./snapshot";

const TICK_DT = 1 / TICK_RATE;
/** Caps catch-up work per rendered frame; leftover time beyond this is dropped. */
const MAX_TICKS_PER_FRAME = 4;
/** Tutorial: the enemy stands still (no AI input) until this step; from step 5 on he plays normally. */
const TUTORIAL_AI_FROM_STEP = 5;
/** Tutorial: step 1 (reach the ball) stays up at least this long before it can advance. */
const TUTORIAL_STEP1_MIN_TICKS = 1.5 * TICK_RATE;
/** Tutorial: the wait after the special is cast (step 4), so the effect can play before step 5. */
const TUTORIAL_SPECIAL_WAIT_TICKS = 1.5 * TICK_RATE;
/** Tutorial: step 5 also ends once the human has held the ball this long, so it cannot get stuck. */
const TUTORIAL_STEAL_HOLD_TICKS = 2 * TICK_RATE;
/** Tutorial: the celebration hold on step 7 before the win is given. */
const TUTORIAL_FINAL_WAIT_TICKS = 3 * TICK_RATE;
/** Goal-target stages: the celebration hold after the deciding goal before the match ends. */
const GOAL_CELEBRATE_TICKS = 2 * TICK_RATE;
const NO_INPUT: InputFrame = { moveX: 0, moveY: 0, dash: false, j: false, k: false, l: false };

const remotes = getRemotes();

/**
 * Server-side state of the stage 0 tutorial. Steps: 1 reach ball, 2 score, 3 punch the enemy, 4 special, 5 win the
 * ball back, 6 score again, 7 done (celebration, then the win).
 */
interface TutorialState {
	step: number;
	/** Ticks since the current step began; step 1 needs TUTORIAL_STEP1_MIN_TICKS before it can advance. */
	stepTicks: number;
	/** Countdown ticks: the wait after the special (step 4) and the celebration hold (step 7). 0 = not counting. */
	timer: number;
	/** Home score when a scoring step (2, 6) began; that step ends once it rises. */
	scoreBase: number;
	/** Human's special cooldown on the previous tick: a rise means a special was just cast. */
	prevCooldown: number;
	/** Step 5: the human has lost the ball at some point since step 5 began. */
	lostBall: boolean;
	/** Step 5: ticks in a row the human has held the ball since step 5 began. */
	holdTicks: number;
}

/** Human mask for a match: one entry per player (2 * teamSize), true only at humanIdx. */
function humanMaskFor(teamSize: number, humanIdx: number): boolean[] {
	const mask: boolean[] = [];
	for (let i = 0; i < 2 * teamSize; i++) mask.push(i === humanIdx);
	return mask;
}

function toDir(v: unknown): -1 | 0 | 1 {
	if (!typeIs(v, "number") || v !== v) return 0;
	return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function isFulltime(s: GameState): boolean {
	return s.match.phase === "fulltime";
}

export class MatchInstance {
	readonly player: Player;
	readonly state: GameState;
	readonly humanIdx: number;
	private readonly ai: AIState;
	private readonly humanMask: boolean[];
	private held: InputFrame = { moveX: 0, moveY: 0, dash: false, j: false, k: false, l: false };
	/** Presses (j/k/l) seen since the last tick; consumed by the next tick. */
	private readonly latch = { j: false, k: false, l: false };
	/** Events produced since the last Snapshot send. */
	private pending: SimEventLite[] = [];
	private acc = 0;
	private finishedAcc = 0;
	private notified = false;
	private onFulltime: ((inst: MatchInstance) => void) | undefined;
	/** Set only for the stage 0 tutorial. */
	private readonly tut: TutorialState | undefined;
	/** Story matches (tutorial included) honour the owner's DebugStoryWin attribute while they run. */
	private readonly story: boolean;
	/** Story goal-target stages: the first team to this many goals wins. undefined = timed match. */
	private readonly goalTarget: number | undefined;
	/** Goal-target stages: ticks left in the celebration after the deciding goal; 0 = not counting. */
	private goalCelebrateTicks = 0;
	/** Goal-target stages: the score at the deciding goal (the final result). */
	private lockedScore: [number, number] | undefined;

	/** Creates the match and sends its Setup to the owner. onFulltime runs once, when the sim reaches fulltime. */
	constructor(
		player: Player,
		state: GameState,
		seed: number,
		humanIdx: number,
		setup: Setup,
		onFulltime?: (inst: MatchInstance) => void,
	) {
		this.player = player;
		this.state = state;
		this.humanIdx = humanIdx;
		// Basic-attack assist for the human only: turns him to the nearest opponent in reach (see assistTurn in the sim).
		state.players[humanIdx].humanAssist = true;
		this.ai = createAIState(seed);
		this.humanMask = humanMaskFor(state.teamSize, humanIdx);
		this.onFulltime = onFulltime;
		this.goalTarget = setup.goalTarget;
		this.story = setup.mode === "story";
		this.tut =
			setup.mode === "story" && setup.stageId === TUTORIAL_STAGE_ID
				? { step: 1, stepTicks: 0, timer: 0, scoreBase: 0, prevCooldown: 0, lostBall: false, holdTicks: 0 }
				: undefined;
		if (this.tut !== undefined) this.placeTutorialLordAtStart();
		remotes.Setup.FireClient(player, setup);
		if (this.tut !== undefined) remotes.Tutorial.FireClient(player, { step: 1 } as TutorialStep);
	}

	/** Raw held buttons from the owner. Untrusted: coerce every field. */
	setInput(raw: unknown): void {
		if (!typeIs(raw, "table")) return;
		const r = raw as { moveX?: unknown; moveY?: unknown; dash?: unknown; j?: unknown; k?: unknown; l?: unknown };
		this.held = {
			moveX: toDir(r.moveX),
			moveY: toDir(r.moveY),
			dash: r.dash === true,
			j: r.j === true,
			k: r.k === true,
			l: r.l === true,
		};
		if (this.held.j) this.latch.j = true;
		if (this.held.k) this.latch.k = true;
		if (this.held.l) this.latch.l = true;
	}

	/** Advances the match by dt seconds of real time (called every Heartbeat). */
	update(dt: number): void {
		const s = this.state;
		if (isFulltime(s)) {
			// Match is over: stop stepping, keep sending the final state at the snapshot rate.
			this.notifyFulltime();
			this.finishedAcc += dt;
			if (this.finishedAcc >= SNAPSHOT_EVERY * TICK_DT) {
				this.finishedAcc = 0;
				this.sendSnapshot();
			}
			return;
		}

		// Dev hook (off unless attribute set): DebugStoryWin on the owner ends a running story match as a 1-0 home win.
		if (this.story && this.player.GetAttribute("DebugStoryWin") === true) {
			s.match.score[0] = 1;
			s.match.score[1] = 0;
			s.match.phase = "fulltime";
			this.notifyFulltime();
			return;
		}

		const dbgSpeed = game.GetService("Workspace").GetAttribute("DebugMatchSpeed");
		this.acc += typeIs(dbgSpeed, "number") && dbgSpeed > 0 ? dt * dbgSpeed : dt;
		let ticks = 0;
		while (this.acc >= TICK_DT && ticks < MAX_TICKS_PER_FRAME && !isFulltime(s)) {
			this.runTick();
			this.acc -= TICK_DT;
			ticks++;
			if (s.tick % SNAPSHOT_EVERY === 0) this.sendSnapshot();
		}
		if (this.acc >= TICK_DT) this.acc = 0;
		if (isFulltime(s)) this.notifyFulltime();
	}

	/** Drops the callback and buffered events. The caller removes the instance from its map. */
	destroy(): void {
		this.onFulltime = undefined;
		this.pending = [];
	}

	private notifyFulltime(): void {
		if (this.notified) return;
		this.notified = true;
		const cb = this.onFulltime;
		this.onFulltime = undefined;
		if (cb !== undefined) cb(this);
	}

	private sendSnapshot(): void {
		remotes.Snapshot.FireClient(this.player, buildSnapshot(this.state, this.humanIdx, this.pending));
		this.pending = [];
	}

	/** One 60Hz sim tick with the owner's latched input. */
	private runTick(): void {
		const s = this.state;
		const wasGoal = s.match.phase === "goal";
		const inputs = computeAIInputs(s, this.ai, this.humanMask);
		const held = this.held;
		inputs[this.humanIdx] = {
			moveX: held.moveX,
			moveY: held.moveY,
			dash: held.dash,
			j: held.j || this.latch.j,
			k: held.k || this.latch.k,
			l: held.l || this.latch.l,
		};
		this.latch.j = false;
		this.latch.k = false;
		this.latch.l = false;

		// Tutorial: the enemy stands still until step 5 (he stays idle through the kick-off after the first goal too).
		if (this.tut !== undefined && this.tut.step < TUTORIAL_AI_FROM_STEP) {
			for (let i = s.teamSize; i < 2 * s.teamSize; i++) inputs[i] = NO_INPUT;
		}
		// Tutorial from step 5: the enemy may run and tackle, but never shoots, passes or uses his special, so he cannot score.
		// While he holds the ball he stands still (the human takes it by tackling); on every other tick his movement is
		// dropped, so he moves at about half speed.
		if (this.tut !== undefined && this.tut.step >= TUTORIAL_AI_FROM_STEP) {
			const slow = s.tick % 2 === 1;
			for (let i = s.teamSize; i < 2 * s.teamSize; i++) {
				const raw = inputs[i];
				const holding = s.ball.ownerIdx === i;
				const still = holding || slow;
				inputs[i] = {
					moveX: still ? 0 : raw.moveX,
					moveY: still ? 0 : raw.moveY,
					dash: !holding && raw.dash,
					j: !holding && raw.j,
					k: false,
					l: false,
				};
			}
		}

		// Dev hook (off unless attribute set): press special for player idx 0-9 for one tick.
		if (game.GetService("Workspace").GetAttribute("DebugNoAISpecial") === true) {
			for (let i = 0; i < inputs.size(); i++) {
				if (i !== this.humanIdx) inputs[i] = { ...inputs[i], l: false };
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
			const n = s.teamSize;
			const gk = s.players[dbgShoot === 0 ? 0 : n];
			let shooter = s.players[dbgShoot === 0 ? 2 * n - 1 : n - 1];
			let bestD = 1e9;
			for (const q of s.players) {
				if (q.team === gk.team || q.role === "GK") continue;
				const dd = math.abs(q.x - gk.x);
				if (dd < bestD) {
					bestD = dd;
					shooter = q;
				}
			}
			const dirX = gk.x < s.field.w / 2 ? 1 : -1;
			const goalX = gk.x < s.field.w / 2 ? 0 : s.field.w;
			shooter.x = goalX + dirX * 130;
			shooter.y = s.field.d / 2;
			shooter.vx = 0;
			shooter.vy = 0;
			const b = s.ball;
			b.x = goalX + dirX * 100;
			b.y = s.field.d / 2;
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
				q.y = s.field.d / 2;
				q.vx = 0;
				q.vy = 0;
				break;
			}
		}

		step(s, inputs);
		// Story: the kickoff after a goal starts with the human's team's specials ready.
		if (this.story && wasGoal && s.match.phase === "kickoff") this.readyHumanTeamSpecials();
		const pk = s.match.pk;
		if (s.match.phase === "pk" && pk !== undefined && pk.stage === "order") {
			autoPkOrders(s, -1);
		}
		for (const e of s.events) {
			this.pending.push({ ...e } as SimEventLite);
		}
		this.advanceTutorial();
		this.advanceGoalTarget();
	}

	/** Story kickoff after a goal: every player on the human's team gets his special cooldown cleared. */
	private readyHumanTeamSpecials(): void {
		const s = this.state;
		const team = s.players[this.humanIdx].team;
		for (const p of s.players) {
			if (p.team === team) p.specialCooldown = 0;
		}
	}

	/**
	 * Goal-target stages, checked after every tick: once a team reaches goalTarget, the match keeps running for
	 * GOAL_CELEBRATE_TICKS so the goal can be seen, then ends at fulltime (the team that reached the target wins).
	 */
	private advanceGoalTarget(): void {
		const target = this.goalTarget;
		if (target === undefined) return;
		const s = this.state;
		if (this.goalCelebrateTicks > 0) {
			this.goalCelebrateTicks--;
			if (this.goalCelebrateTicks === 0) {
				// Restore the score from the deciding goal so a goal during the celebration can't change the result.
				const locked = this.lockedScore;
				if (locked !== undefined) {
					s.match.score[0] = locked[0];
					s.match.score[1] = locked[1];
				}
				s.match.phase = "fulltime";
			}
			return;
		}
		if (s.match.score[0] >= target || s.match.score[1] >= target) {
			this.lockedScore = [s.match.score[0], s.match.score[1]];
			this.goalCelebrateTicks = GOAL_CELEBRATE_TICKS;
		}
	}

	/**
	 * Tutorial steps, checked after every tick: 1 human owns the ball -> 2 home scores -> 3 human's punch or tackle hits
	 * the enemy -> 4 human casts his special (cooldown rises) and the effect plays -> 5 the enemy AI is on and the human
	 * wins the ball back -> 6 home scores again -> 7 celebration -> the match ends as a home win. Ball ownership counts
	 * only in 'play' (not during the kickoff wait). Each step change is sent to the owner.
	 */
	private advanceTutorial(): void {
		const tut = this.tut;
		if (tut === undefined) return;
		const s = this.state;
		const human = s.players[this.humanIdx];
		const humanHasBall = s.match.phase === "play" && s.ball.ownerIdx === this.humanIdx;

		tut.stepTicks++;
		if (tut.step === 1) {
			if (humanHasBall && tut.stepTicks >= TUTORIAL_STEP1_MIN_TICKS) this.setTutorialStep(2);
		} else if (tut.step === 2) {
			if (s.match.score[0] > tut.scoreBase) this.setTutorialStep(3);
		} else if (tut.step === 3) {
			if (this.humanHitEnemy()) this.setTutorialStep(4);
		} else if (tut.step === 4) {
			if (tut.timer > 0) {
				tut.timer--;
				if (tut.timer === 0) this.setTutorialStep(5);
			} else if (human.specialCooldown > tut.prevCooldown) {
				tut.timer = TUTORIAL_SPECIAL_WAIT_TICKS;
			}
		} else if (tut.step === 5) {
			if (humanHasBall) {
				tut.holdTicks++;
				if (tut.lostBall || tut.holdTicks >= TUTORIAL_STEAL_HOLD_TICKS) this.setTutorialStep(6);
			} else {
				tut.holdTicks = 0;
				tut.lostBall = true;
			}
		} else if (tut.step === 6) {
			if (s.match.score[0] > tut.scoreBase) this.setTutorialStep(7);
		} else if (tut.step === 7) {
			tut.timer--;
			if (tut.timer <= 0) this.finishTutorial();
		}
		tut.prevCooldown = human.specialCooldown;
	}

	/** True when this tick's events include a punch or tackle by the human that hit an opponent. */
	private humanHitEnemy(): boolean {
		const s = this.state;
		const team = s.players[this.humanIdx].team;
		for (const e of s.events) {
			if (e.type !== "hit" || e.attackerIdx !== this.humanIdx) continue;
			if ((e.kind === "punch" || e.kind === "tackle") && s.players[e.victimIdx].team !== team) return true;
		}
		return false;
	}

	/**
	 * Tutorial start only: the lord (human) kicks off from the centre spot, so move him back into his own half
	 * and leave the ball free at the centre, so he has to walk to it for step 1. Not repeated on later kickoffs.
	 */
	private placeTutorialLordAtStart(): void {
		const s = this.state;
		const human = s.players[this.humanIdx];
		const dir = attackDir(s, human.team);
		human.x = dir > 0 ? s.field.w * 0.2 : s.field.w * 0.8;
		human.y = s.field.d / 2;
		human.vx = 0;
		human.vy = 0;
		const b = s.ball;
		b.x = s.field.w / 2;
		b.y = s.field.d / 2;
		b.z = 0;
		b.vx = 0;
		b.vy = 0;
		b.vz = 0;
		b.ownerIdx = -1;
		b.lastTouchIdx = -1;
		b.special = undefined;
	}

	/** Enters a tutorial step: resets its counters and sends the step to the owner. */
	private setTutorialStep(step: number): void {
		const tut = this.tut;
		if (tut === undefined) return;
		tut.step = step;
		tut.stepTicks = 0;
		tut.timer = step === 7 ? TUTORIAL_FINAL_WAIT_TICKS : 0;
		tut.lostBall = false;
		tut.holdTicks = 0;
		if (step === 2 || step === 6) tut.scoreBase = this.state.match.score[0];
		remotes.Tutorial.FireClient(this.player, { step } as TutorialStep);
	}

	/** Ends the tutorial as a home win through the normal fulltime path (the story finish pays the rewards). */
	private finishTutorial(): void {
		const s = this.state;
		if (s.match.score[0] <= s.match.score[1]) s.match.score[0] = s.match.score[1] + 1;
		s.match.phase = "fulltime";
	}
}
