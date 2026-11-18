import type { BodySize, SizeParams } from '../data/types';
import { FIELD_D, FIELD_W } from './constants';
import { formationPosition } from './field';
import { EMPTY_INPUT, type GameState, type MatchSetup, type Player } from './types';

export function createInitialState(
  setup: MatchSetup,
  sizeParams: Record<BodySize, SizeParams>,
): GameState {
  const players: Player[] = [];
  for (let t = 0; t < 2; t++) {
    const team = t as 0 | 1;
    for (let slot = 0; slot < 5; slot++) {
      const def = setup.teams[team][slot];
      const size = sizeParams[def.size];
      const pos = formationPosition(team, slot);
      players.push({
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
        facingX: team === 0 ? 1 : -1,
        facingY: 0,
        action: 'normal',
        actionTimer: 0,
        noTouchTicks: 0,
        prevInput: { ...EMPTY_INPUT },
      });
    }
  }

  return {
    tick: 0,
    rng: (setup.seed >>> 0) || 0x9e3779b9,
    players,
    ball: {
      x: FIELD_W / 2,
      y: FIELD_D / 2,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      ownerIdx: -1,
      lastTouchIdx: -1,
    },
    events: [],
  };
}
