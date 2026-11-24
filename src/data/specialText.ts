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
      return { condition: '持球或不持球', effect: '震開周圍敵人暈眩、震飛範圍內的球，持球者掉球' };
    case 'lunge':
      return { condition, effect: '無敵突進撞開敵人，撞敵扣20%、每撞一人回20%' };
    case 'beam':
      return { condition, effect: '集氣後隨機擊倒一名敵人1秒、扣30%，持球者掉球' };
    case 'summon':
      return { condition, effect: '5名鐵騎追擊3秒，撞倒扣10%，持球者掉球' };
    case 'fear':
      return { condition, effect: '周圍200px敵定身3秒、扣10%，持球者掉球' };
    case 'leap':
      return { condition: '持球或不持球', effect: '後跳飛撲，落地周圍敵扣15%並沉默2秒' };
    case 'tiger':
      return { condition: '持球或不持球', effect: '5秒吞射正門，吐球砸敵扣80%暈3秒；沒吞則震退扣10%' };
    case 'slash':
      return { condition: '持球或不持球', effect: '5秒每0.2秒揮刀，刀氣命中扣5%、回補自己5%' };
    case 'ride':
      return { condition: '持球或不持球', effect: '騎車衝刺，撞開路上敵人扣 20%' };
    case 'sail':
      return { condition: '持球或不持球', effect: '上船滑行4秒移速+50%，撞敵擊飛1秒扣80%；可載隊友' };
    case 'icefield':
      return { condition: '持球或不持球', effect: '原地冰雨4秒(半徑110)，內敵緩速85%、每0.5秒扣5%' };
  }
}
