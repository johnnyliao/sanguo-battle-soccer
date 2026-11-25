import { R0_AWAY, R0_CHECKPOINT, R0_HOME, R0_SEED, createSelfPlay } from "shared/game/ai/selfplay";
import { R0_GOLDEN } from "./golden";

/**
 * R0 check: replays the web self-play match on Roblox and compares every checkpoint
 * (score + state digest) with the golden values recorded on the web build.
 */
function runR0(): void {
	const start = os.clock();
	const sp = createSelfPlay(R0_SEED, R0_HOME, R0_AWAY);
	let n = 0;
	while (!sp.done()) {
		// Chunks of R0_CHECKPOINT ticks; yielding between them avoids the script timeout.
		sp.step(R0_CHECKPOINT);
		task.wait();
		const t = sp.tick;
		const [h, a] = sp.score();
		const d = sp.digest();
		if (n >= R0_GOLDEN.size()) {
			print(`[R0] FAIL at tick=${t}: expected <no checkpoint> got score=${h}-${a} digest=${d}`);
			return;
		}
		const exp = R0_GOLDEN[n];
		if (exp.tick !== t || exp.home !== h || exp.away !== a || exp.digest !== d) {
			print(
				`[R0] FAIL at tick=${t}: expected tick=${exp.tick} score=${exp.home}-${exp.away} digest=${exp.digest}` +
					` got tick=${t} score=${h}-${a} digest=${d}`,
			);
			return;
		}
		print(`[R0] tick=${t} score=${h}-${a} digest=${d} OK`);
		n++;
	}
	if (n !== R0_GOLDEN.size()) {
		const exp = R0_GOLDEN[n];
		print(
			`[R0] FAIL at tick=${sp.tick}: expected tick=${exp.tick} score=${exp.home}-${exp.away} digest=${exp.digest}` +
				` got match finished after ${n} checkpoints`,
		);
		return;
	}
	const secs = string.format("%.1f", os.clock() - start);
	print(`[R0] PASS (${n} checkpoints, ${secs}s)`);
}

runR0();
