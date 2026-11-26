import { describe, expect, it } from 'vitest';
import { R0_AWAY, R0_CHECKPOINT, R0_HOME, R0_SEED, createSelfPlay } from './selfplay';

interface Checkpoint {
  tick: number;
  home: number;
  away: number;
  digest: string;
}

const MATCH_TIMEOUT_MS = 600_000;

function runScenario(): Checkpoint[] {
  const sp = createSelfPlay(R0_SEED, R0_HOME, R0_AWAY);
  const out: Checkpoint[] = [];
  while (!sp.done()) {
    sp.step(R0_CHECKPOINT);
    const [home, away] = sp.score();
    out.push({ tick: sp.tick, home, away, digest: sp.digest() });
  }
  return out;
}

describe('R0 self-play golden', () => {
  it(
    'is deterministic on web and collects checkpoints',
    () => {
      const first = runScenario();
      const second = runScenario();
      expect(second).toEqual(first);
      expect(first.length).toBeGreaterThan(1);
    },
    MATCH_TIMEOUT_MS,
  );
});
