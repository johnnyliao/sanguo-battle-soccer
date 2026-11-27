import { describe, expect, it } from 'vitest';
import { computeAIInputs, createAIState } from '../ai/ai';
import { SIZE_PARAMS } from '../data/characters';
import type { CharacterDef, Weapon } from '../data/types';
import { EMPTY_INPUT, FIELD_D, createInitialState, step, type GameState, type InputFrame, type MatchSetup } from './index';

// Story soldiers (teamBuilder soldierDef, 黃巾兵 stats). A soldier who carries the ball must be hittable: a rampage (invincible)
// would make a punch or a lord special bounce off him, so the AI must never start one on a soldier.

const MID_Y = FIELD_D / 2;
const LORD = 0;
const SOLDIER = 1;
const NO_HUMANS = [false, false];
const PRESS_J: InputFrame = { ...EMPTY_INPUT, j: true };
const PRESS_L: InputFrame = { ...EMPTY_INPUT, l: true };
/** Long enough for the AI to press L on its per-tick chance near goal (about 1 press per 50 ticks). */
const AI_TICKS = 400;
const AI_SEEDS = [1, 7, 21];
/** Covers the longest basic attack (spear) and the punch's knock. */
const PUNCH_WINDOW = 40;
/** Covers the whirl's spin, the dragonspear windup and the featherfan. */
const SPECIAL_WINDOW = 120;

/** teamBuilder soldierDef (huangjin soldier). The special is passed in: the current shape is rampage, the fixed one is none. */
function soldierDef(special: CharacterDef['special']): CharacterDef {
  return {
    id: 'xiaobing_huangjin',
    name: '黃巾兵',
    country: 'wei',
    role: 'FW',
    size: 'M',
    stats: { power: 3, speed: 4, stamina: 4, technique: 3, defense: 3 },
    special,
  };
}

/** The soldier special as teamBuilder gives it now: no special. */
const SOLDIER_SPECIAL: CharacterDef['special'] = { name: '無', kind: 'straight', mode: 'none' };

/** Lord at level 1 (teamBuilder lordDef), with the weapon's special. No weapon = plain punch lord. */
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

/** 1v1 in play: lord at (lordX, MID_Y) facing +x, soldier at (soldierX, MID_Y) facing -x. The ball sits far away unless carried. */
function duel(lord: CharacterDef, soldier: CharacterDef, lordX: number, soldierX: number): GameState {
  const setup: MatchSetup = { seed: 1, teams: [[lord], [soldier]], startInPlay: true };
  const state = createInitialState(setup, SIZE_PARAMS);
  const l = state.players[LORD];
  l.x = lordX;
  l.y = MID_Y;
  l.facingX = 1;
  l.facingY = 0;
  const s = state.players[SOLDIER];
  s.x = soldierX;
  s.y = MID_Y;
  s.facingX = -1;
  s.facingY = 0;
  state.ball.x = 600;
  state.ball.y = MID_Y;
  return state;
}

/** Gives the ball to player idx at his feet. */
function carry(state: GameState, idx: number): void {
  const p = state.players[idx];
  state.ball.x = p.x;
  state.ball.y = p.y;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.ownerIdx = idx;
  state.ball.lastTouchIdx = idx;
}

/** Keeps the soldier on his spot, facing the lord's goal side, with the ball at his feet. */
function pin(state: GameState, x: number): void {
  const s = state.players[SOLDIER];
  s.x = x;
  s.y = MID_Y;
  s.facingX = -1;
  s.facingY = 0;
  carry(state, SOLDIER);
}

describe('story soldier holding the ball (AI)', () => {
  for (const seed of AI_SEEDS) {
    it(`seed ${seed}: the AI soldier carrying near goal never starts a rampage`, () => {
      // Lord far away and idle; the soldier stands 200 px from the goal he attacks (team 1 attacks x = 0).
      const state = duel(lordDef(undefined), soldierDef(SOLDIER_SPECIAL), 620, 200);
      const ai = createAIState(seed);
      let pressedL = false;
      let rampaged = false;
      for (let t = 0; t < AI_TICKS; t++) {
        pin(state, 200);
        const frames = computeAIInputs(state, ai, NO_HUMANS);
        frames[LORD] = { ...EMPTY_INPUT };
        if (frames[SOLDIER].l) pressedL = true;
        step(state, frames);
        if (state.players[SOLDIER].rampageTicks > 0) rampaged = true;
      }
      expect(pressedL).toBe(false);
      expect(rampaged).toBe(false);
    });
  }

  for (const seed of AI_SEEDS) {
    it(`seed ${seed}: after the AI soldier carries near goal, a lord punch drops the ball`, () => {
      const state = duel(lordDef(undefined), soldierDef(SOLDIER_SPECIAL), 620, 200);
      const ai = createAIState(seed);
      let rampaged = false;
      for (let t = 0; t < AI_TICKS; t++) {
        pin(state, 200);
        const frames = computeAIInputs(state, ai, NO_HUMANS);
        frames[LORD] = { ...EMPTY_INPUT };
        step(state, frames);
        if (state.players[SOLDIER].rampageTicks > 0) {
          rampaged = true;
          break;
        }
      }
      // Phase B: no AI for the soldier; the lord stands next to him and punches once.
      const soldier = state.players[SOLDIER];
      const lord = state.players[LORD];
      soldier.x = 300;
      soldier.y = MID_Y;
      soldier.facingX = -1;
      soldier.facingY = 0;
      soldier.vx = 0;
      soldier.vy = 0;
      carry(state, SOLDIER);
      lord.x = 322;
      lord.y = MID_Y;
      lord.facingX = -1;
      lord.facingY = 0;
      lord.vx = 0;
      lord.vy = 0;
      let lostBall = false;
      for (let t = 0; t < PUNCH_WINDOW; t++) {
        const frames = [t === 0 ? PRESS_J : { ...EMPTY_INPUT }, { ...EMPTY_INPUT }];
        step(state, frames);
        if (state.ball.ownerIdx !== SOLDIER) lostBall = true;
      }
      expect(rampaged).toBe(false);
      expect(lostBall).toBe(true);
    });
  }
});

describe('story soldier with special mode none', () => {
  it('pressing L while carrying does nothing: no special event, no cooldown, no stamina cost, no rampage', () => {
    const state = duel(lordDef(undefined), soldierDef(SOLDIER_SPECIAL), 620, 300);
    carry(state, SOLDIER);
    const soldier = state.players[SOLDIER];
    const stamina = soldier.stamina;
    let special = false;
    for (let t = 0; t < 60; t++) {
      carry(state, SOLDIER);
      step(state, [{ ...EMPTY_INPUT }, t === 0 ? PRESS_L : { ...EMPTY_INPUT }]);
      if (state.events.some((e) => e.type === 'special' || e.type === 'rampageStart')) special = true;
    }
    expect(special).toBe(false);
    expect(soldier.specialCooldown).toBe(0);
    expect(soldier.stamina).toBe(stamina);
    expect(soldier.rampageTicks).toBe(0);
    expect(state.ball.ownerIdx).toBe(SOLDIER);
  });

  it('a plain punch on the carrier knocks the ball loose', () => {
    const state = duel(lordDef(undefined), soldierDef(SOLDIER_SPECIAL), 300, 322);
    carry(state, SOLDIER);
    let lostBall = false;
    let hit = false;
    for (let t = 0; t < PUNCH_WINDOW; t++) {
      step(state, [t === 0 ? PRESS_J : { ...EMPTY_INPUT }, { ...EMPTY_INPUT }]);
      if (state.events.some((e) => e.type === 'hit' && e.victimIdx === SOLDIER)) hit = true;
      if (state.events.some((e) => e.type === 'looseBall' && e.playerIdx === SOLDIER)) lostBall = true;
    }
    expect(hit).toBe(true);
    expect(lostBall).toBe(true);
  });

  it('the whirl (sword) knocks the carrier’s ball loose', () => {
    const state = duel(lordDef('sword'), soldierDef(SOLDIER_SPECIAL), 300, 340);
    carry(state, SOLDIER);
    let lost = false;
    for (let t = 0; t < SPECIAL_WINDOW; t++) {
      step(state, [t === 0 ? PRESS_L : { ...EMPTY_INPUT }, { ...EMPTY_INPUT }]);
      if (state.ball.ownerIdx !== SOLDIER) lost = true;
    }
    expect(lost).toBe(true);
  });

  it('the dragonspear (spear) knocks the carrier’s ball loose', () => {
    const state = duel(lordDef('spear'), soldierDef(SOLDIER_SPECIAL), 300, 360);
    carry(state, SOLDIER);
    let lost = false;
    for (let t = 0; t < SPECIAL_WINDOW; t++) {
      step(state, [t === 0 ? PRESS_L : { ...EMPTY_INPUT }, { ...EMPTY_INPUT }]);
      if (state.ball.ownerIdx !== SOLDIER) lost = true;
    }
    expect(lost).toBe(true);
  });

  it('the featherfan (fan) knocks the carrier’s ball loose', () => {
    const state = duel(lordDef('fan'), soldierDef(SOLDIER_SPECIAL), 300, 360);
    carry(state, SOLDIER);
    let lost = false;
    for (let t = 0; t < SPECIAL_WINDOW; t++) {
      step(state, [t === 0 ? PRESS_L : { ...EMPTY_INPUT }, { ...EMPTY_INPUT }]);
      if (state.ball.ownerIdx !== SOLDIER) lost = true;
    }
    expect(lost).toBe(true);
  });
});
