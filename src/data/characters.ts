import type { BodySize, CharacterDef, Country, Role, SizeParams, SpecialKind, Stats } from './types';

const STAT_KEYS: (keyof Stats)[] = ['power', 'speed', 'stamina', 'technique', 'defense'];

function ch(
  id: string,
  name: string,
  country: Country,
  role: Role,
  size: BodySize,
  stats: [number, number, number, number, number],
  specialName: string,
  specialKind: SpecialKind,
  specialMode: 'rampage' | 'roar' | 'lunge' | 'beam' | 'summon' | 'fear' | 'leap' | 'tiger' | 'slash' | 'ride' | 'icefield' | 'sail' | 'gust' | 'portal' | 'arrowship' | 'eastwind' = 'rampage',
  opts: { noBall?: boolean; bumpPct?: number } = {},
): CharacterDef {
  const [power, speed, stamina, technique, defense] = stats;
  return {
    id,
    name,
    country,
    role,
    size,
    stats: { power, speed, stamina, technique, defense },
    special: { name: specialName, kind: specialKind, mode: specialMode, ...opts },
  };
}

export const RAW_CHARACTERS: CharacterDef[] = [
  ch('zhangfei', '張飛', 'shu', 'GK', 'L', [9, 3, 10, 2, 9], '當陽怒吼', 'pierce', 'roar', { noBall: true }),
  ch('guanyu', '關羽', 'shu', 'DF', 'L', [9, 5, 8, 4, 8], '騎士衝擊', 'lob', 'ride', { noBall: true, bumpPct: 0.2 }),
  ch('zhugeliang', '諸葛亮', 'shu', 'MF', 'S', [3, 5, 4, 10, 4], '破魔光彈', 'beam', 'beam', { noBall: true }),
  ch('machao', '馬超', 'shu', 'MF', 'M', [7, 9, 6, 6, 4], '西涼鐵騎', 'straight', 'summon', { noBall: true, bumpPct: 0.1 }),
  ch('zhaoyun', '趙雲', 'shu', 'FW', 'M', [7, 9, 6, 8, 2], '遊龍穿刺', 'pierce', 'lunge', { noBall: true, bumpPct: 0.2 }),
  ch('xuchu', '許褚', 'wei', 'GK', 'L', [9, 3, 10, 2, 9], '惡虎吞天', 'pierce', 'tiger', { noBall: true }),
  ch('caocao', '曹操', 'wei', 'DF', 'M', [7, 5, 7, 6, 8], '霸刀連斬', 'zigzag', 'slash', { noBall: true }),
  ch('zhenji', '甄姬', 'wei', 'MF', 'S', [4, 6, 5, 9, 5], '冰雨招來', 'zigzag', 'icefield', { noBall: true }),
  ch('simayi', '司馬懿', 'wei', 'MF', 'S', [4, 5, 7, 9, 6], '鷹視狼顧', 'zigzag', 'leap', { noBall: true }),
  ch('zhangliao', '張遼', 'wei', 'FW', 'M', [7, 10, 6, 7, 2], '遼來了', 'straight', 'fear', { noBall: true }),
  ch('sunquan', '孫權', 'wu', 'GK', 'M', [6, 5, 7, 6, 9], '受箭回舟', 'pierce', 'arrowship', { noBall: true }),
  ch('daqiao', '大喬', 'wu', 'DF', 'M', [5, 6, 7, 6, 8], '時空之門', 'zigzag', 'portal', { noBall: true }),
  ch('zhouyu', '周瑜', 'wu', 'MF', 'M', [5, 6, 5, 10, 4], '赤壁東風', 'zigzag', 'eastwind', { noBall: true }),
  ch('xiaoqiao', '小喬', 'wu', 'MF', 'S', [3, 6, 5, 9, 5], '吹飛', 'zigzag', 'gust', { noBall: true }),
  ch('sunce', '孫策', 'wu', 'FW', 'M', [9, 8, 7, 6, 1], '揚帆起航', 'straight', 'sail', { noBall: true }),
];

/**
 * Scales a team's 25 stat values so they sum to `target`, keeping each value in 1..10.
 * Integer math only, so the result is deterministic. Returns new objects; the input is not mutated.
 */
export function normalizeTeam(defs: CharacterDef[], target = 150): CharacterDef[] {
  // Slot index order (character, then stat) is the tie-break order everywhere below.
  const values: number[] = [];
  defs.forEach((d) => STAT_KEYS.forEach((key) => values.push(d.stats[key])));
  const total = values.reduce((s, v) => s + v, 0);

  const out = values.map((v) => Math.floor((v * target) / total));
  const rems = values.map((v) => (v * target) % total);
  const order = values.map((_, i) => i).sort((a, b) => rems[b] - rems[a] || a - b);

  let remaining = target - out.reduce((s, v) => s + v, 0);
  for (const i of order) {
    if (remaining <= 0) break;
    out[i] += 1;
    remaining -= 1;
  }

  for (let i = 0; i < out.length; i++) {
    out[i] = Math.min(10, Math.max(1, out[i]));
  }

  // Clamping may have changed the sum; nudge stats that are not at the bound.
  let diff = target - out.reduce((s, v) => s + v, 0);
  while (diff !== 0) {
    const step = diff > 0 ? 1 : -1;
    let moved = false;
    for (const i of order) {
      if (diff === 0) break;
      const next = out[i] + step;
      if (next < 1 || next > 10) continue;
      out[i] = next;
      diff -= step;
      moved = true;
    }
    if (!moved) throw new Error(`normalizeTeam: cannot reach target ${target}`);
  }

  return defs.map((d, ci) => {
    const stats = { ...d.stats };
    STAT_KEYS.forEach((key, si) => {
      stats[key] = out[ci * STAT_KEYS.length + si];
    });
    return { ...d, stats };
  });
}

export function getTeam(country: Country): CharacterDef[] {
  return normalizeTeam(RAW_CHARACTERS.filter((d) => d.country === country));
}

export const CHARACTERS: CharacterDef[] = (['shu', 'wei', 'wu'] as const).flatMap((c) => getTeam(c));

export const COUNTRY_INFO: Record<Country, { name: string; color: number }> = {
  shu: { name: '蜀', color: 0x2fa84f },
  wei: { name: '魏', color: 0x2f6fd8 },
  wu: { name: '吳', color: 0xd83a2f },
};

export const SIZE_PARAMS: Record<BodySize, SizeParams> = {
  S: { radius: 7, mass: 0.8 },
  M: { radius: 9, mass: 1.0 },
  L: { radius: 12, mass: 1.4 },
};
