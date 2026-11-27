// Lord class passives (流派). Every hook returns at once for a player without lordClass, so the 15 ordinary characters are unchanged.
// Passive constants are in constants-lordclass.ts. Timed effects store an absolute end tick (state.tick), so nothing needs a per-tick countdown.
import { floor, min } from './num';
import * as C from './constants';
import type { Ball, GameState, Player } from './types';

/** 猛將 破陣: true if the ball holder's shield is ready, which absorbs this ball loss (the ball stays with him). Spends the shield. */
export function shieldAbsorbs(state: GameState, victim: Player): boolean {
  if (victim.lordClass !== 'mengjiang' || state.ball.ownerIdx !== victim.idx) return false;
  if (victim.shieldTick !== undefined && state.tick - victim.shieldTick < C.LORD_SHIELD_RECHARGE_TICKS) return false;
  victim.shieldTick = state.tick;
  state.events.push({ type: 'shieldBlock', playerIdx: victim.idx });
  return true;
}

/** Special cooldown set on a cast: 軍師 運籌 shortens it, everyone else gets SPECIAL_COOLDOWN_TICKS. */
export function castCooldown(p: Player): number {
  if (p.lordClass === 'junshi') return floor(C.SPECIAL_COOLDOWN_TICKS * C.LORD_JUNSHI_COOLDOWN_MULT);
  return C.SPECIAL_COOLDOWN_TICKS;
}

/** 猛將 破陣: a new knockdown caused by `attacker` cuts his special cooldown (only when there is cooldown left to cut). */
export function creditKnockdown(state: GameState, attacker: Player): void {
  if (attacker.lordClass !== 'mengjiang' || attacker.specialCooldown <= 0) return;
  const cut = min(attacker.specialCooldown, C.LORD_MENGJIANG_CD_CUT_TICKS);
  attacker.specialCooldown -= cut;
  state.events.push({ type: 'classCdCut', playerIdx: attacker.idx, ticks: cut });
}

/**
 * 鐵壁 固守: counts one knockdown of p. Returns true when this one is held in hitstun instead (every other one), and then sets the
 * hitstun and emits guardHold. Called by setDown only for a victim who is not already down.
 */
export function holdsKnockdown(state: GameState, p: Player): boolean {
  if (p.lordClass !== 'tiebi') return false;
  const count = p.knockdowns === undefined ? 1 : p.knockdowns + 1;
  p.knockdowns = count;
  if (count % C.LORD_TIEBI_HOLD_EVERY !== 0) return false;
  p.action = 'hitstun';
  p.actionTimer = C.LORD_TIEBI_HOLD_TICKS;
  state.events.push({ type: 'guardHold', playerIdx: p.idx });
  return true;
}

/** Ball-loss marks used by the passives: the tiebi hitter of a loose ball, and the junshi passer of a ball in flight. */
export function noteBallLost(state: GameState, attacker: Player): void {
  const ball = state.ball;
  if (attacker.lordClass === 'tiebi') {
    ball.tiebiHitIdx = attacker.idx;
    ball.tiebiHitTick = state.tick;
  } else {
    clearBallMarks(ball);
  }
}

/** Clears the passives' marks on the ball (a kick or a hit ends any pass or tiebi hit that was in flight). Writes nothing if none is set. */
export function clearBallMarks(ball: Ball): void {
  if (ball.passerIdx !== undefined) ball.passerIdx = undefined;
  if (ball.tiebiHitIdx !== undefined) {
    ball.tiebiHitIdx = undefined;
    ball.tiebiHitTick = undefined;
  }
}

/** A junshi pass is being released by p: the ball remembers him so the teammate who receives it gets the pass boost. */
export function markPass(state: GameState, p: Player): void {
  if (p.lordClass === 'junshi') state.ball.passerIdx = p.idx;
}

/**
 * Called when p gains the free ball (a pickup, or a goalkeeper catching a special). A teammate receiving a junshi pass gets the pass
 * boost. A tiebi who picks up a ball his own hit knocked loose, within the window, rallies his team.
 */
export function onBallGained(state: GameState, p: Player): void {
  const ball = state.ball;
  if (ball.passerIdx !== undefined) {
    const passer = state.players[ball.passerIdx];
    ball.passerIdx = undefined;
    if (passer.team === p.team && passer.idx !== p.idx) {
      p.passBoostUntil = state.tick + C.LORD_PASS_BOOST_TICKS;
      state.events.push({ type: 'passBoost', playerIdx: p.idx });
    }
  }
  if (ball.tiebiHitIdx !== undefined) {
    const hitIdx = ball.tiebiHitIdx;
    const fresh = state.tick - (ball.tiebiHitTick ?? 0) <= C.LORD_TIEBI_RALLY_WINDOW;
    ball.tiebiHitIdx = undefined;
    ball.tiebiHitTick = undefined;
    if (hitIdx === p.idx && fresh) teamRally(state, p);
  }
}

/** 鐵壁 固守: every teammate of p (p included) runs faster for LORD_TIEBI_RALLY_TICKS. */
function teamRally(state: GameState, p: Player): void {
  for (const q of state.players) {
    if (q.team === p.team) q.rallyUntil = state.tick + C.LORD_TIEBI_RALLY_TICKS;
  }
  state.events.push({ type: 'teamRally', team: p.team });
}

/** Speed multiplier from the class boosts (pass boost, team rally). Multiplies into maxSpeedOf; 1 when none is running. */
export function classSpeedMult(state: GameState, p: Player): number {
  let mult = 1;
  if (p.passBoostUntil !== undefined && state.tick < p.passBoostUntil) mult *= C.LORD_PASS_BOOST_MULT;
  if (p.rallyUntil !== undefined && state.tick < p.rallyUntil) mult *= C.LORD_TIEBI_RALLY_MULT;
  return mult;
}

/** 鐵壁 固守: multiplier on a slide tackle's contact distance. 1 for everyone else. */
export function tackleReachMult(p: Player): number {
  return p.lordClass === 'tiebi' ? C.LORD_TIEBI_TACKLE_RADIUS_MULT : 1;
}
