import { describe, expect, it } from 'vitest';
import { RAW_CHARACTERS, SIZE_PARAMS } from '../data/characters';
import type { CharacterDef, Weapon } from '../data/types';
import { EMPTY_INPUT, FIELD_D, createInitialState, step, type GameState, type InputFrame, type MatchSetup, type SimEvent } from './index';

// Reproduces "normal attacks never hit a 黃巾兵 (xiaobing_huangjin) in a story 1v1". The defs mirror roblox/src/shared/teamBuilder.ts
// (lordDef at level 1, soldierDef('huangjin')), so the hit geometry is the one the story match uses.

const MID_Y = FIELD_D / 2;
const LORD_X = 300;
const LORD = 0;
const TARGET = 1;
/** Centre distances to try: 18 = touching (lord radius 9 + soldier radius 9); +4 = 0.5 x PUNCH_RANGE; +8 = 1.0 x PUNCH_RANGE. */
const DISTANCES = [18, 22, 26];
/** Covers the longest attack (spear, 17 ticks) and the windpuff's travel. */
const ATTACK_WINDOW = 30;
const WEAPONS: (Weapon | undefined)[] = [undefined, 'sword', 'spear', 'fan'];
const NO_INPUT: InputFrame = EMPTY_INPUT;
const PRESS_J: InputFrame = { ...EMPTY_INPUT, j: true };

type Logged = { tick: number; event: SimEvent };

/** teamBuilder lordDef at level 1 (stats 5/6/6/5/4), with the weapon and the matching special. */
function lordDef(weapon: Weapon | undefined): CharacterDef {
  const mode = weapon === 'sword' ? 'whirl' : weapon === 'spear' ? 'dragonspear' : weapon === 'fan' ? 'featherfan' : undefined;
  return {
    id: 'lord_1',
    name: '主公',
    country: 'shu',
    role: 'FW',
    size: 'M',
    stats: { power: 5, speed: 6, stamina: 6, technique: 5, defense: 4 },
    weapon,
    special: mode === undefined ? { name: 'test', kind: 'straight' } : { name: 'test', kind: 'straight', mode, noBall: true },
  };
}

/** teamBuilder soldierDef('huangjin', ...). */
function soldierDef(): CharacterDef {
  return {
    id: 'xiaobing_huangjin',
    name: '黃巾兵',
    country: 'wei',
    role: 'FW',
    size: 'M',
    stats: { power: 3, speed: 4, stamina: 4, technique: 3, defense: 3 },
    special: { name: '衝鋒', kind: 'straight', mode: 'rampage' },
  };
}

/** A general from RAW_CHARACTERS (for comparison), slot role FW, no ball needed. */
function generalDef(charId: string): CharacterDef {
  for (const d of RAW_CHARACTERS) {
    if (d.id === charId) return { ...d, role: 'FW', stats: { ...d.stats }, special: { ...d.special } };
  }
  throw new Error(`no general ${charId}`);
}

/** A 1v1 story-style state: lord at LORD_X facing +x, target `dist` px in front of him facing him. The ball sits far away. */
function duel(lord: CharacterDef, target: CharacterDef, dist: number): GameState {
  const setup: MatchSetup = { seed: 1, teams: [[lord], [target]], startInPlay: true };
  const state = createInitialState(setup, SIZE_PARAMS);
  const l = state.players[LORD];
  l.x = LORD_X;
  l.y = MID_Y;
  l.facingX = 1;
  l.facingY = 0;
  const t = state.players[TARGET];
  t.x = LORD_X + dist;
  t.y = MID_Y;
  t.facingX = -1;
  t.facingY = 0;
  state.ball.x = 600;
  state.ball.y = MID_Y;
  return state;
}

/**
 * Steps `n` ticks. `decide` gets the state before the tick and the tick index, and returns one frame per player
 * (index 0 = lord, 1 = target). Returns every event tagged with its tick.
 */
function play(state: GameState, n: number, decide: (s: GameState, tick: number) => InputFrame[]): Logged[] {
  const out: Logged[] = [];
  for (let i = 0; i < n; i++) {
    const tick = i;
    step(state, decide(state, i));
    for (const event of state.events) out.push({ tick, event });
  }
  return out;
}

/** Hit events with the lord as attacker and the target as victim. */
function hitsOnTarget(log: Logged[]): Logged[] {
  return log.filter((e) => e.event.type === 'hit' && e.event.attackerIdx === LORD && e.event.victimIdx === TARGET);
}

function distanceBetween(state: GameState): number {
  const dx = state.players[TARGET].x - state.players[LORD].x;
  const dy = state.players[TARGET].y - state.players[LORD].y;
  return Math.sqrt(dx * dx + dy * dy);
}

describe('lord basic attack vs 黃巾兵 (target stands still, facing the lord)', () => {
  for (const weapon of WEAPONS) {
    for (const dist of DISTANCES) {
      it(`weapon ${weapon ?? 'none'}: hit at centre distance ${dist}`, () => {
        const state = duel(lordDef(weapon), soldierDef(), dist);
        const log = play(state, ATTACK_WINDOW, (_s, i) => [i === 0 ? PRESS_J : NO_INPUT, NO_INPUT]);
        expect(hitsOnTarget(log).length).toBeGreaterThan(0);
      });
    }
  }
});

describe('comparison: basic attack vs a general (zhaoyun)', () => {
  for (const weapon of WEAPONS) {
    for (const dist of DISTANCES) {
      it(`weapon ${weapon ?? 'none'}: hit at centre distance ${dist}`, () => {
        const state = duel(lordDef(weapon), generalDef('zhaoyun'), dist);
        const log = play(state, ATTACK_WINDOW, (_s, i) => [i === 0 ? PRESS_J : NO_INPUT, NO_INPUT]);
        expect(hitsOnTarget(log).length).toBeGreaterThan(0);
      });
    }
  }
});

describe('moving target', () => {
  for (const weapon of WEAPONS) {
    it(`weapon ${weapon ?? 'none'}: soldier walks into the lord, lord presses J at 30 px`, () => {
      const state = duel(lordDef(weapon), soldierDef(), 60);
      let pressed = false;
      const log = play(state, 90, (s) => {
        const pressNow = !pressed && distanceBetween(s) <= 30;
        if (pressNow) pressed = true;
        return [pressNow ? PRESS_J : NO_INPUT, { ...EMPTY_INPUT, moveX: -1 }];
      });
      expect(pressed).toBe(true);
      expect(hitsOnTarget(log).length).toBeGreaterThan(0);
    });

    it(`weapon ${weapon ?? 'none'}: soldier walks away from the lord, lord presses J at touching range`, () => {
      const state = duel(lordDef(weapon), soldierDef(), 18);
      const log = play(state, ATTACK_WINDOW, (_s, i) => [
        i === 0 ? PRESS_J : NO_INPUT,
        { ...EMPTY_INPUT, moveX: 1 },
      ]);
      expect(hitsOnTarget(log).length).toBeGreaterThan(0);
    });

    it(`weapon ${weapon ?? 'none'}: lord walks toward a still soldier and presses J while still moving`, () => {
      const state = duel(lordDef(weapon), soldierDef(), 26);
      const log = play(state, ATTACK_WINDOW, (_s, i) => {
        if (i < 3) return [{ ...EMPTY_INPUT, moveX: 1 }, NO_INPUT];
        return [{ ...PRESS_J, moveX: 1 }, NO_INPUT];
      });
      expect(hitsOnTarget(log).length).toBeGreaterThan(0);
    });
  }
});

/** Moves the target to (LORD_X + dx, MID_Y + dy). */
function placeTarget(state: GameState, dx: number, dy: number): void {
  state.players[TARGET].x = LORD_X + dx;
  state.players[TARGET].y = MID_Y + dy;
}

describe('human assist (humanAssist set on the lord): basic attack turns to the nearest opponent', () => {
  // Side (90 deg) and behind (180 deg) at touching range: the lord faces +x, so without the assist neither is in the strike circle.
  const SIDE = { dx: 0, dy: 18 };
  const BEHIND = { dx: -18, dy: 0 };
  for (const weapon of WEAPONS) {
    for (const [label, spot] of [
      ['side 90 deg', SIDE],
      ['behind 180 deg', BEHIND],
    ] as const) {
      it(`weapon ${weapon ?? 'none'}: ${label} target is hit once the assist turns the lord`, () => {
        const state = duel(lordDef(weapon), soldierDef(), 18);
        placeTarget(state, spot.dx, spot.dy);
        state.players[LORD].humanAssist = true;
        const log = play(state, ATTACK_WINDOW, (_s, i) => [i === 0 ? PRESS_J : NO_INPUT, NO_INPUT]);
        expect(hitsOnTarget(log).length).toBeGreaterThan(0);
      });

      it(`weapon ${weapon ?? 'none'}: ${label} target is not hit without the assist (behaviour unchanged)`, () => {
        const state = duel(lordDef(weapon), soldierDef(), 18);
        placeTarget(state, spot.dx, spot.dy);
        const log = play(state, ATTACK_WINDOW, (_s, i) => [i === 0 ? PRESS_J : NO_INPUT, NO_INPUT]);
        expect(hitsOnTarget(log).length).toBe(0);
      });
    }
  }

  it('the assist does not turn the lord when no opponent is in reach', () => {
    const state = duel(lordDef(undefined), soldierDef(), 18);
    placeTarget(state, 0, 120);
    state.players[LORD].humanAssist = true;
    run(state, 1, PRESS_J);
    expect(state.players[LORD].facingX).toBe(1);
    expect(state.players[LORD].facingY).toBe(0);
  });
});

function run(state: GameState, n: number, input: InputFrame): void {
  for (let i = 0; i < n; i++) step(state, [input, NO_INPUT]);
}
