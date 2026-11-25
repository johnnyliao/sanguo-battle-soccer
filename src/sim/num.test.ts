import { describe, expect, it } from 'vitest';
import { entriesSorted, f64hex, fnv1aUtf8, fromWords, hiWord, imulU, kindOf, len, loWord, sortBy } from './num';
import { maxJs, minJs, roundJs, signJs } from './jsmath';

/** Edge inputs for sign / min / max / round, including signed zeros and ties. */
const EDGE = [0, -0, 0.5, -0.5, 1.5, -1.5, -0.4, 0.4, 0.49999999999999994, -0.49999999999999994, 2.5, -2.5, 1, -1, 3, -3, NaN, Infinity, -Infinity, 1e300, -1e300, 4503599627370497, -4503599627370497];

/** Deterministic LCG values across magnitudes, plus half-integers and zeros. */
function randomValues(n: number): number[] {
  let s = 987654321 >>> 0;
  const next = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = next();
    if (i % 7 === 0) out.push(Math.round((next() - 0.5) * 200) / 2);
    else if (i % 11 === 0) out.push(next() < 0.5 ? -0 : 0);
    else out.push((r - 0.5) * Math.pow(10, Math.floor(next() * 12) - 4));
  }
  return out;
}

describe('jsmath (Roblox override semantics) vs Math.*', () => {
  it('signJs matches Math.sign on edge values (signed zeros, NaN)', () => {
    for (const x of EDGE) expect(Object.is(signJs(x), Math.sign(x))).toBe(true);
  });

  it('minJs / maxJs match Math.min / Math.max on pairs and triples of edge values', () => {
    for (const a of EDGE) {
      for (const b of EDGE) {
        expect(Object.is(minJs(a, b), Math.min(a, b))).toBe(true);
        expect(Object.is(maxJs(a, b), Math.max(a, b))).toBe(true);
        for (const c of [0, -0, NaN, 2]) {
          expect(Object.is(minJs(a, b, c), Math.min(a, b, c))).toBe(true);
          expect(Object.is(maxJs(a, b, c), Math.max(a, b, c))).toBe(true);
        }
      }
    }
    expect(minJs()).toBe(Infinity);
    expect(maxJs()).toBe(-Infinity);
  });

  it('roundJs(x, Math.floor) matches Math.round on edge values', () => {
    for (const x of EDGE) expect(Object.is(roundJs(x, Math.floor), Math.round(x))).toBe(true);
    expect(roundJs(0.49999999999999994, Math.floor)).toBe(0);
    expect(Object.is(roundJs(-0.4, Math.floor), -0)).toBe(true);
    expect(roundJs(-2.5, Math.floor)).toBe(-2);
  });

  it('sign / min / max / round match Math on 10000 random values', () => {
    const vals = randomValues(10000);
    let mismatches = 0;
    for (let i = 0; i < vals.length; i++) {
      const x = vals[i];
      const y = vals[(i * 31 + 7) % vals.length];
      if (!Object.is(signJs(x), Math.sign(x))) mismatches++;
      if (!Object.is(minJs(x, y), Math.min(x, y))) mismatches++;
      if (!Object.is(maxJs(x, y), Math.max(x, y))) mismatches++;
      if (!Object.is(roundJs(x, Math.floor), Math.round(x))) mismatches++;
    }
    expect(mismatches).toBe(0);
  });
});

describe('hiWord / loWord / fromWords', () => {
  it('splits and joins float64 bits as fdlibm does', () => {
    expect(hiWord(1)).toBe(0x3ff00000);
    expect(loWord(1)).toBe(0);
    expect(hiWord(-2)).toBe(0xc0000000 | 0);
    expect(Object.is(fromWords(0x3ff00000, 0), 1)).toBe(true);
    expect(Object.is(fromWords(0x80000000 | 0, 0), -0)).toBe(true);
    for (const x of [0.1, -123.456, 5e-324, 1.7976931348623157e308, Infinity]) {
      expect(Object.is(fromWords(hiWord(x), loWord(x)), x)).toBe(true);
    }
  });
});

describe('imulU', () => {
  const edge = [0, 1, -1, 0x7fffffff, 0x80000000, 0xffffffff, 0x6d2b79f5, 0x01000193, -12345];

  it('matches (Math.imul(a, b) >>> 0) for all edge-value pairs', () => {
    for (const a of edge) {
      for (const b of edge) {
        expect(imulU(a, b)).toBe(Math.imul(a, b) >>> 0);
      }
    }
  });

  it('matches (Math.imul(a, b) >>> 0) on 100000 LCG pairs (signed and unsigned)', () => {
    let s = 12345 >>> 0;
    const next = (): number => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s;
    };
    let mismatches = 0;
    for (let i = 0; i < 100000; i++) {
      const a = i % 2 === 0 ? next() | 0 : next();
      const b = i % 3 === 0 ? next() : next() | 0;
      if (imulU(a, b) !== (Math.imul(a, b) >>> 0)) mismatches++;
    }
    expect(mismatches).toBe(0);
  });
});

describe('sortBy', () => {
  it('is stable: equal keys keep their input order', () => {
    const items = [
      { k: 2, i: 0 },
      { k: 1, i: 1 },
      { k: 2, i: 2 },
      { k: 1, i: 3 },
      { k: 0, i: 4 },
      { k: 2, i: 5 },
    ];
    const sorted = sortBy(items, (a, b) => a.k - b.k);
    expect(sorted.map((x) => x.i)).toEqual([4, 1, 3, 0, 2, 5]);
  });

  it('does not mutate its input and returns a new array', () => {
    const input = [3, 1, 2];
    const copy = [...input];
    const sorted = sortBy(input, (a, b) => a - b);
    expect(input).toEqual(copy);
    expect(sorted).not.toBe(input);
    expect(sorted).toEqual([1, 2, 3]);
  });
});

describe('len', () => {
  it('returns the length of arrays and strings', () => {
    expect(len([1, 2, 3])).toBe(3);
    expect(len('ab')).toBe(2);
    expect(len([])).toBe(0);
  });
});

describe('platform helpers', () => {
  it('f64hex gives the big-endian float64 bits', () => {
    expect(f64hex(1)).toBe('3ff0000000000000');
    expect(f64hex(-0)).toBe('8000000000000000');
  });

  it('fnv1aUtf8 of the empty string is the offset basis', () => {
    expect(fnv1aUtf8('')).toBe('811c9dc5');
  });

  it('fnv1aUtf8 of a Chinese string equals manual FNV over the TextEncoder bytes', () => {
    const s = '三國足球';
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(s)) {
      h = Math.imul(h ^ b, 0x01000193) >>> 0;
    }
    expect(fnv1aUtf8(s)).toBe((h >>> 0).toString(16).padStart(8, '0'));
  });

  it('kindOf classifies values and rejects functions', () => {
    expect(kindOf(1)).toBe('n');
    expect(kindOf('a')).toBe('s');
    expect(kindOf(false)).toBe('b');
    expect(kindOf([])).toBe('t');
    expect(kindOf({})).toBe('t');
    expect(kindOf(undefined)).toBe('u');
    expect(() => kindOf(() => 0)).toThrow();
  });

  it('entriesSorted skips undefined and orders keys', () => {
    expect(entriesSorted({ b: 1, a: 2, c: undefined })).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
    expect(entriesSorted([10, undefined, 30])).toEqual([
      ['0', 10],
      ['2', 30],
    ]);
  });
});
