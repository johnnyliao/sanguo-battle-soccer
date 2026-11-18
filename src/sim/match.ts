import {
  BALL_RADIUS,
  FIELD_D,
  FIELD_W,
  GOAL_CELEBRATE_TICKS,
  HALFTIME_TICKS,
  KICKOFF_TICKS,
} from './constants';
import { attackDir, formationPosition, goalMouth } from './field';
import { startPk } from './pk';
import type { GameState } from './types';

/** Kicking-off forward starts this far behind the center spot, on own half. */
const KICKOFF_FW_OFFSET = 14;

function otherTeam(team: 0 | 1): 0 | 1 {
  return team === 0 ? 1 : 0;
}

/** Counts the phase timer down one tick. Returns true when it has run out. */
function countdown(state: GameState): boolean {
  state.match.phaseTimer--;
  return state.match.phaseTimer <= 0;
}

/** Advances the match phase machine one tick. Called after physics in step. */
export function updateMatch(state: GameState): void {
  switch (state.match.phase) {
    case 'kickoff':
      if (countdown(state)) {
        state.match.phase = 'play';
        state.events.push({ type: 'whistle', reason: 'kickoff' });
      }
      break;
    case 'play':
      updatePlay(state);
      break;
    case 'goal':
      if (countdown(state)) resetForKickoff(state);
      break;
    case 'halftime':
      if (countdown(state)) startSecondHalf(state);
      break;
    case 'fulltime':
    case 'pk':
      break;
  }
}

/** Goal check first (a goal does not use up clock), then the clock. */
function updatePlay(state: GameState): void {
  if (detectGoal(state)) return;
  const m = state.match;
  m.clockTicks--;
  if (m.clockTicks <= 0) endHalf(state);
}

/** An unowned ball past a goal line inside the mouth scores for the team that attacks that goal. */
function detectGoal(state: GameState): boolean {
  const b = state.ball;
  if (b.ownerIdx !== -1) return false;
  if (b.x >= -BALL_RADIUS && b.x <= FIELD_W + BALL_RADIUS) return false;
  const side: 0 | 1 = b.x < 0 ? 0 : 1;
  const mouth = goalMouth(side);
  if (b.y < mouth.yMin || b.y > mouth.yMax) return false;

  // Side 0 is attacked by the team whose attack direction is -1.
  const team: 0 | 1 = (side === 0) === (attackDir(state, 0) === -1) ? 0 : 1;
  const m = state.match;
  m.score[team]++;
  b.ownerIdx = -1;
  b.special = null;
  m.lastGoal = { team, scorerIdx: b.lastTouchIdx, tick: state.tick };
  m.kickoffTeam = otherTeam(team);
  m.phase = 'goal';
  m.phaseTimer = GOAL_CELEBRATE_TICKS;
  state.events.push({ type: 'goal', team, scorerIdx: b.lastTouchIdx });
  return true;
}

function endHalf(state: GameState): void {
  const m = state.match;
  if (m.half === 1) {
    m.phase = 'halftime';
    m.phaseTimer = HALFTIME_TICKS;
    state.events.push({ type: 'whistle', reason: 'half' });
    return;
  }
  state.events.push({ type: 'whistle', reason: 'full' });
  if (m.score[0] !== m.score[1]) {
    m.phase = 'fulltime';
    state.events.push({ type: 'matchEnd', score: [m.score[0], m.score[1]] });
  } else {
    m.phase = 'pk';
    startPk(state);
    state.events.push({ type: 'pkStart' });
  }
}

function startSecondHalf(state: GameState): void {
  const m = state.match;
  m.half = 2;
  m.swapped = true;
  m.clockTicks = m.halfTicks;
  m.kickoffTeam = otherTeam(m.firstKickoffTeam);
  resetForKickoff(state);
}

/**
 * Puts every player on its formation spot for the current side, stops everyone, centers the ball,
 * and starts a kickoff wait. The kicking-off team's forward stands just behind the ball.
 */
export function resetForKickoff(state: GameState): void {
  const m = state.match;
  for (const p of state.players) {
    const dir = attackDir(state, p.team);
    const pos = formationPosition(p.idx % 5, dir);
    p.x = pos.x;
    p.y = pos.y;
    p.z = 0;
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.facingX = dir;
    p.facingY = 0;
    p.action = 'normal';
    p.actionTimer = 0;
    p.hitDone = false;
    p.callPassTicks = 0;
    p.noTouchTicks = 0;
    p.chargeTicks = 0;
  }

  const kicker = state.players[m.kickoffTeam * 5 + 4];
  kicker.x = FIELD_W / 2 - attackDir(state, m.kickoffTeam) * KICKOFF_FW_OFFSET;
  kicker.y = FIELD_D / 2;

  const b = state.ball;
  b.x = FIELD_W / 2;
  b.y = FIELD_D / 2;
  b.z = 0;
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  b.ownerIdx = -1;
  b.lastTouchIdx = -1;
  b.special = null;

  m.phase = 'kickoff';
  m.phaseTimer = KICKOFF_TICKS;
}
