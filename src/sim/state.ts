import { len, fail, round } from './num';
import type { BodySize, SizeParams } from '../data/types';
import {
  FIELD_D,
  FIELD_W,
  GOAL_HALF_W,
  KICKOFF_TICKS,
  STAMINA_BASE,
  STAMINA_PER_STAT,
  TICK_HZ,
} from './constants';
import { attackDir, formationPosition } from './field';
import { resetForKickoff } from './match';
import { EMPTY_INPUT, type FieldSize, type GameState, type MatchSetup, type Player } from './types';

const DEFAULT_HALF_SECONDS = 120;

/** Most players per team the formations support. */
export const MAX_TEAM_SIZE = 5;

export function createInitialState(
  setup: MatchSetup,
  sizeParams: Record<BodySize, SizeParams>,
): GameState {
  const teamSize = len(setup.teams[0]);
  if (teamSize < 1 || teamSize > MAX_TEAM_SIZE || len(setup.teams[1]) !== teamSize) {
    fail(
      `createInitialState: teams need equal size 1..${MAX_TEAM_SIZE}, got ${teamSize} and ${len(setup.teams[1])}`,
    );
  }
  const field: FieldSize =
    setup.field === undefined
      ? { w: FIELD_W, d: FIELD_D, goalHalfW: GOAL_HALF_W }
      : { w: setup.field.w, d: setup.field.d, goalHalfW: setup.field.goalHalfW };
  if (!(field.w > 0 && field.d > 0 && field.goalHalfW > 0)) {
    fail(`createInitialState: field sizes must be positive, got w ${field.w}, d ${field.d}, goalHalfW ${field.goalHalfW}`);
  }
  const halfTicks = round((setup.halfSeconds ?? DEFAULT_HALF_SECONDS) * TICK_HZ);
  const state: GameState = {
    tick: 0,
    rng: (setup.seed >>> 0) || 0x9e3779b9,
    teamSize,
    field,
    players: [],
    riders: [],
    waves: [],
    iceFields: [],
    nextIceId: 1,
    gusts: [],
    nextGustId: 1,
    portals: [],
    nextPortalId: 1,
    eastwinds: [],
    nextEastWindId: 1,
    arrowships: [],
    nextArrowShipId: 1,
    ball: {
      x: field.w / 2,
      y: field.d / 2,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      ownerIdx: -1,
      lastTouchIdx: -1,
      special: undefined,
      tiger: undefined,
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
      lastGoal: undefined,
      pk: undefined,
    },
    events: [],
  };

  for (let t = 0; t < 2; t++) {
    const team = t as 0 | 1;
    const dir = attackDir(state, team);
    for (let slot = 0; slot < teamSize; slot++) {
      const def = setup.teams[team][slot];
      const size = sizeParams[def.size];
      const pos = formationPosition(field, teamSize, slot, dir);
      const maxStamina = STAMINA_BASE + def.stats.stamina * STAMINA_PER_STAT;
      const player: Player = {
        idx: team * teamSize + slot,
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
        rampageTicks: 0,
        bumpCooldown: 0,
        silenceTicks: 0,
        tigerTicks: 0,
        slashTicks: 0,
        rideHits: [],
        arrowshipUp: false,
        sailTicks: 0,
        sailPassenger: -1,
        sailPassengerOf: -1,
        specialMode: def.special.mode ?? 'rampage',
        specialCooldown: 0,
        specialBuffer: 0,
        specialKind: def.special.kind,
        specialName: def.special.name,
        specialNoBall: def.special.noBall ?? false,
        specialBumpPct: def.special.bumpPct ?? undefined,
        weapon: def.weapon,
        lordClass: def.lordClass,
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
