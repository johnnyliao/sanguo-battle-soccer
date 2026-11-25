import { describe, expect, it } from 'vitest';
import { makeFdlibm } from './fdlibm';
import { fromWords, hiWord } from './num';

const fd = makeFdlibm({
  hi: hiWord,
  from: fromWords,
  floor: Math.floor,
  fail: (msg: string): never => {
    throw new Error(msg);
  },
});

/** Deterministic LCG in [0, 1). */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SPECIALS = [
  0, -0, Infinity, -Infinity, NaN,
  Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI, (3 * Math.PI) / 4, -(3 * Math.PI) / 4,
  Math.PI / 4, -Math.PI / 4, 2 ** -27, -(2 ** -27), 2 ** -26, 0.4375, -0.4375, 0.6875,
  1, -1, 1.1875, 2.4375, 2 ** 66, -(2 ** 66), 2 ** 60, -(2 ** 60), 2 ** -60, -(2 ** -60),
  1e-300, -1e-300, 5e-324, 1.7976931348623157e308, 823549.5, -823549.5,
];

function report(name: string, mismatches: [number, number, number][]): void {
  if (mismatches.length === 0) return;
  const head = mismatches
    .slice(0, 5)
    .map(([a, b, c]) => `${name}(${a}) = ${b}, Math gives ${c}`)
    .join('\n');
  throw new Error(`${mismatches.length} mismatches in ${name}\n${head}`);
}

describe('fdlibm sin / cos vs Math.sin / Math.cos (bit-for-bit)', () => {
  it('matches on 1,000,000 deterministic inputs across ranges, tiny values and specials', () => {
    const rnd = makeRng(20260524);
    // Large finite specials are out of range for the unported reduction (they call fail()).
    const inputs: number[] = SPECIALS.filter((v) => !(Math.abs(v) > 823549 && Math.abs(v) !== Infinity));
    for (let i = 0; i < 250000; i++) inputs.push(rnd() * 20 - 10); // [-10, 10]
    for (let i = 0; i < 250000; i++) inputs.push(rnd() * 2000 - 1000); // [-1e3, 1e3]
    for (let i = 0; i < 200000; i++) {
      // tiny values, log-uniform between 1e-300 and 1e-5
      const mag = Math.pow(10, -300 + rnd() * 295);
      inputs.push(rnd() < 0.5 ? mag : -mag);
    }
    for (let i = 0; i < 100000; i++) inputs.push(rnd() * 1646000 - 823000); // medium reduction range (< 2^19*pi/2)
    expect(inputs.length).toBeGreaterThanOrEqual(800000);

    const sinBad: [number, number, number][] = [];
    const cosBad: [number, number, number][] = [];
    for (const x of inputs) {
      const s = fd.sin(x);
      const sm = Math.sin(x);
      if (!Object.is(s, sm)) sinBad.push([x, s, sm]);
      const c = fd.cos(x);
      const cm = Math.cos(x);
      if (!Object.is(c, cm)) cosBad.push([x, c, cm]);
    }
    report('sin', sinBad);
    report('cos', cosBad);
  });

  it('matches on 1,000,000 inputs in [-10, 10] for sin and cos separately', () => {
    const rnd = makeRng(7);
    const bad: [number, number, number][] = [];
    for (let i = 0; i < 1000000; i++) {
      const x = rnd() * 20 - 10;
      if (!Object.is(fd.sin(x), Math.sin(x))) bad.push([x, fd.sin(x), Math.sin(x)]);
      if (!Object.is(fd.cos(x), Math.cos(x))) bad.push([x, fd.cos(x), Math.cos(x)]);
    }
    report('sin/cos', bad);
  });

  it('throws for |x| beyond the medium reduction range', () => {
    expect(() => fd.sin(1e7)).toThrow();
    expect(() => fd.cos(-1e7)).toThrow();
  });
});

describe('fdlibm atan2 vs Math.atan2 (bit-for-bit)', () => {
  it('matches on 1,000,000 (y, x) pairs including zeros, infinities and NaN', () => {
    const rnd = makeRng(424242);
    const pool = [...SPECIALS, 1, -1, 2, -2, 0.5, -0.5, 1e-300, -1e-300, 1e300, -1e300];
    const bad: [number, number, number][] = [];
    const check = (y: number, x: number): void => {
      const a = fd.atan2(y, x);
      const b = Math.atan2(y, x);
      if (!Object.is(a, b)) bad.push([y, x, a]);
    };
    for (let i = 0; i < 1000000; i++) {
      const mode = i % 4;
      let y: number;
      let x: number;
      if (mode === 0) {
        y = rnd() * 20 - 10;
        x = rnd() * 20 - 10;
      } else if (mode === 1) {
        y = (rnd() * 2 - 1) * Math.pow(10, Math.floor(rnd() * 600) - 300);
        x = (rnd() * 2 - 1) * Math.pow(10, Math.floor(rnd() * 600) - 300);
      } else if (mode === 2) {
        y = rnd() * 2000 - 1000;
        x = rnd() * 2000 - 1000;
      } else {
        y = pool[Math.floor(rnd() * pool.length)];
        x = pool[Math.floor(rnd() * pool.length)];
      }
      check(y, x);
    }
    // every combination of the special values
    for (const y of SPECIALS) for (const x of SPECIALS) check(y, x);
    report('atan2', bad);
  });
});
