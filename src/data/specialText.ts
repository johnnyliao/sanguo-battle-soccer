import type { CharacterDef, SpecialKind } from './types';

/** Short shot names used in the rampage effect text ("按攻擊射{name}球"). */
const SHOT_NAME: Record<SpecialKind, string> = {
  straight: '直線高速',
  zigzag: '蛇行',
  lob: '高吊下墜',
  pierce: '穿人擊倒',
  beam: '光彈',
};

/**
 * Team-select text for a special: when it can be used (condition) and what it does (effect, one short sentence).
 * Matches the rules in CLAUDE.md; the 12 s cooldown is shown by the caller.
 */
export function specialDescription(def: CharacterDef): { condition: string; effect: string } {
  const { kind, mode = 'rampage' } = def.special;
  switch (mode) {
    case 'rampage':
      return { condition: '持球', effect: `無敵撞飛敵人，可帶球進門或射${SHOT_NAME[kind]}球` };
    case 'roar':
      return { condition: '持球或不持球', effect: '震開周圍敵人並暈眩，持球者掉球' };
    case 'lunge':
      return { condition: '持球', effect: '無敵突進撞開敵人，可直接進球' };
    case 'beam':
      return { condition: '前半場持球', effect: '集氣後光彈直射，擊倒沿途所有人' };
    case 'summon':
      return { condition: '持球', effect: '召喚 5 名鐵騎追擊，撞倒對手' };
  }
}
