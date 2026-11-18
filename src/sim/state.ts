import type { BodySize, SizeParams } from '../data/types';
import {
  FIELD_D,
  FIELD_W,
  KICKOFF_TICKS,
  STAMINA_BASE,
  STAMINA_PER_STAT,
  TICK_HZ,
} from './constants';
import { attackDir, formationPosition } from './field';
import { resetForKickoff } from './match';
import { EMPTY_INPUT, type GameState, type MatchSetup, type Player } from './types';

const DEFAULT_HALF_SECONDS = 120;

export function createInitialState(
  setup: MatchSetup,
  sizeParams: Record<BodySize, SizeParams>,
): GameState {
  const halfTicks = Math.round((setup.halfSeconds ?? DEFAULT_HALF_SECONDS) * TICK_HZ);
  const state: GameState = {
    tick: 0,
    rng: (setup.seed >>> 0) || 0x9e3779b9,
    players: [],
    ball: {
      x: FIELD_W / 2,
      y: FIELD_D / 2,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      ownerIdx: -1,
      lastTouchIdx: -1,
      special: null,
    },
    match: {
      phase: 'kickoff',
      phaseTimer: KICKOFF_TICKS,
      half: 1,
      clockTicks: halfTicks,
      halfTicks,
      score: [0, 0],
      swapped: false,
      kickoffTeam: 0,
      firstKickoffTeam: 0,
      lastGoal: null,
      pk: null,
    },
    events: [],
  };

  for (let t = 0; t < 2; t++) {
    const team = t as 0 | 1;
    const dir = attackDir(state, team);
    for (let slot = 0; slot < 5; slot++) {
      const def = setup.teams[team][slot];
      const size = sizeParams[def.size];
      const pos = formationPosition(slot, dir);
      const maxStamina = STAMINA_BASE + def.stats.stamina * STAMINA_PER_STAT;
      const player: Player = {
        idx: team * 5 + slot,
        charId: def.id,
        name: def.name,
        team,
        role: def.role,
        size: def.size,
        stats: { ...def.stats },
        radius: size.radius,
        mass: size.mass,
        x: pos.x,
        y: pos.y,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        facingX: dir,
        facingY: 0,
        stamina: maxStamina,
        maxStamina,
        action: 'normal',
        actionTimer: 0,
        hitDone: false,
        callPassTicks: 0,
        noTouchTicks: 0,
        chargeTicks: 0,
        specialKind: def.special.kind,
        specialName: def.special.name,
        prevInput: { ...EMPTY_INPUT },
      };
      state.players.push(player);
    }
  }

  resetForKickoff(state);
  if (setup.startInPlay) {
    state.match.phase = 'play';
    state.match.phaseTimer = 0;
  }
  return state;
}
