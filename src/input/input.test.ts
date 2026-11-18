import { describe, expect, it } from 'vitest';
import { DashDetector } from './DashDetector';
import { buildInputFrame, type RawInput } from './buildInputFrame';

/** Advances the detector by n ticks holding the given move (default idle). */
function run(d: DashDetector, n: number, mx: -1 | 0 | 1 = 0, my: -1 | 0 | 1 = 0): boolean {
  let dash = false;
  for (let i = 0; i < n; i++) dash = d.update(mx, my);
  return dash;
}

const NO_RAW: RawInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  j: false,
  k: false,
  l: false,
  dashButton: false,
};

describe('DashDetector', () => {
  it('single press does not dash', () => {
    const d = new DashDetector();
    expect(d.update(1, 0)).toBe(false);
    expect(run(d, 10, 1, 0)).toBe(false);
  });

  it('double tap within 15 ticks dashes while held, stops after release', () => {
    const d = new DashDetector();
    expect(d.update(1, 0)).toBe(false); // tap 1 press
    expect(d.update(0, 0)).toBe(false); // release
    expect(d.update(1, 0)).toBe(true); // tap 2 press, gap 1 tick
    expect(run(d, 5, 1, 0)).toBe(true); // stays held
    expect(d.update(0, 0)).toBe(false); // release clears dash
  });

  it('double tap at the 15-tick boundary still dashes', () => {
    const d = new DashDetector();
    d.update(0, 1); // press
    d.update(0, 0); // release
    run(d, 14); // idle 14 ticks
    expect(d.update(0, 1)).toBe(true);
  });

  it('second tap after 20 ticks does not dash', () => {
    const d = new DashDetector();
    d.update(-1, 0); // press
    d.update(0, 0); // release
    run(d, 19); // idle
    expect(d.update(-1, 0)).toBe(false);
    expect(run(d, 3, -1, 0)).toBe(false);
  });

  it('different direction second tap does not dash', () => {
    const d = new DashDetector();
    d.update(1, 0); // right press
    d.update(0, 0); // release
    expect(d.update(0, -1)).toBe(false); // up press
    expect(run(d, 3, 0, -1)).toBe(false);
  });

  it('diagonal input counts per axis direction', () => {
    const d = new DashDetector();
    d.update(1, 1); // right + down pressed
    d.update(0, 0); // both released
    expect(d.update(1, 0)).toBe(true); // right double tap
  });
});

describe('buildInputFrame', () => {
  it('maps directions to moveX/moveY', () => {
    const f = buildInputFrame({ ...NO_RAW, left: true, down: true, j: true }, false);
    expect(f).toEqual({ moveX: -1, moveY: 1, dash: false, j: true, k: false, l: false });
    expect(buildInputFrame({ ...NO_RAW, up: true }, false).moveY).toBe(-1);
    expect(buildInputFrame({ ...NO_RAW, right: true }, false).moveX).toBe(1);
  });

  it('left and right together cancel', () => {
    const f = buildInputFrame({ ...NO_RAW, left: true, right: true }, false);
    expect(f.moveX).toBe(0);
  });

  it('up and down together cancel', () => {
    const f = buildInputFrame({ ...NO_RAW, up: true, down: true }, false);
    expect(f.moveY).toBe(0);
  });

  it('dashButton forces dash true', () => {
    expect(buildInputFrame({ ...NO_RAW, dashButton: true }, false).dash).toBe(true);
    expect(buildInputFrame(NO_RAW, true).dash).toBe(true);
    expect(buildInputFrame(NO_RAW, false).dash).toBe(false);
  });
});
