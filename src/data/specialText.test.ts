import { describe, expect, it } from 'vitest';
import { specialDescription } from './specialText';
import type { CharacterDef } from './types';

function def(
  kind: CharacterDef['special']['kind'],
  mode?: CharacterDef['special']['mode'],
  noBall = false,
): CharacterDef {
  return {
    id: 'x',
    name: 'X',
    country: 'shu',
    role: 'FW',
    size: 'M',
    stats: { power: 5, speed: 5, stamina: 5, technique: 5, defense: 5 },
    special: { name: 'S', kind, mode, noBall },
  };
}

describe('specialDescription', () => {
  it('rampage (default mode) names the shot of its kind', () => {
    expect(specialDescription(def('straight'))).toEqual({ condition: '持球', effect: '無敵撞飛敵人，可帶球進門或射直線高速球' });
    expect(specialDescription(def('zigzag', 'rampage')).effect).toContain('蛇行球');
    expect(specialDescription(def('lob', 'rampage')).effect).toContain('高吊下墜球');
    expect(specialDescription(def('pierce', 'rampage')).effect).toContain('穿人擊倒球');
  });

  it('roar works with or without the ball', () => {
    const d = specialDescription(def('pierce', 'roar'));
    expect(d.condition).toBe('持球或不持球');
    expect(d.effect).toContain('暈眩');
  });

  it('lunge needs the ball', () => {
    const d = specialDescription(def('pierce', 'lunge'));
    expect(d.condition).toBe('持球');
    expect(d.effect).toContain('突進');
  });

  it('beam works with or without the ball when the character is no-ball', () => {
    const d = specialDescription(def('beam', 'beam', true));
    expect(d.condition).toBe('持球或不持球');
    expect(d.effect).toContain('擊倒');
  });

  it('fear works with or without the ball and stops the opponents', () => {
    const d = specialDescription(def('straight', 'fear', true));
    expect(d.condition).toBe('持球或不持球');
    expect(d.effect).toContain('周圍敵人');
  });

  it('leap works with or without the ball and silences the landing area', () => {
    const d = specialDescription(def('zigzag', 'leap', true));
    expect(d.condition).toBe('持球或不持球');
    expect(d.effect).toContain('沉默 2 秒');
  });

  it('summon needs the ball and calls cavalry', () => {
    const d = specialDescription(def('straight', 'summon'));
    expect(d.condition).toBe('持球');
    expect(d.effect).toContain('5 名鐵騎');
  });

  it('ride (騎士衝擊) works with or without the ball and names the knockdown share', () => {
    const d = specialDescription(def('lob', 'ride', true));
    expect(d.condition).toBe('持球或不持球');
    expect(d.effect).toContain('扣 20%');
  });

  it('keeps effect texts short enough for one team-select line', () => {
    const modes = ['rampage', 'roar', 'lunge', 'beam', 'summon', 'fear', 'leap', 'tiger', 'ride'] as const;
    for (const mode of modes) {
      for (const kind of ['straight', 'zigzag', 'lob', 'pierce', 'beam'] as const) {
        expect(specialDescription(def(kind, mode)).effect.length).toBeLessThanOrEqual(20);
      }
    }
  });
});
