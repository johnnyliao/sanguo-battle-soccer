// The three lord classes (流派): display name, role, passive name, a short description, and the stats the class grows.
import type { LordClass, Role, Stats } from './types';

export interface LordClassInfo {
  name: string;
  role: Role;
  passive: string;
  desc: string;
  growth: (keyof Stats)[];
}

export const LORD_CLASS_INFO: Record<LordClass, LordClassInfo> = {
  mengjiang: {
    name: '猛將',
    role: 'FW',
    passive: '破陣',
    desc: '持球被打時有護盾不掉球（每 3 秒一次）；擊倒敵人時大招冷卻縮短 2 秒',
    growth: ['power', 'speed'],
  },
  junshi: {
    name: '軍師',
    role: 'MF',
    passive: '運籌',
    desc: '大招冷卻縮短 25%；傳球給隊友後，接球的隊友加速 2 秒',
    growth: ['technique', 'stamina'],
  },
  tiebi: {
    name: '鐵壁',
    role: 'DF',
    passive: '固守',
    desc: '鏟球範圍變大；被打倒地時每兩次有一次只會硬直；搶到球時全隊加速',
    growth: ['defense', 'stamina'],
  },
};
