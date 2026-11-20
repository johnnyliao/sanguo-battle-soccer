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
  const { kind, mode = 'rampage', noBall = false } = def.special;
  const condition = noBall ? '持球或不持球' : '持球';
  switch (mode) {
    case 'rampage':
      return { condition, effect: `無敵撞飛敵人，可帶球進門或射${SHOT_NAME[kind]}球` };
    case 'roar':
      return { condition: '持球或不持球', effect: '震開周圍敵人並暈眩，持球者掉球' };
    case 'lunge':
      return { condition, effect: '無敵突進撞開敵人，可直接進球' };
    case 'beam':
      return { condition, effect: '集氣後光彈擊倒隨機一名敵人' };
    case 'summon':
      return { condition, effect: '召喚 5 名鐵騎追擊，撞倒對手' };
    case 'fear':
      return { condition, effect: '周圍敵人恐懼定身 3 秒並扣體力' };
    case 'leap':
      return { condition: '持球或不持球', effect: '後跳飛撲，落地扣敵人體力並沉默 2 秒' };
    case 'tiger':
      return { condition: '持球或不持球', effect: '5秒吞射門，吐球砸人扣80%，沒吞則震退' };
    case 'slash':
      return { condition: '持球或不持球', effect: '5秒連斬刀氣，命中扣體力並回補自己' };
  }
}
