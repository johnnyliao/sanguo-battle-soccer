/**
 * JS Math.sign / min / max / round semantics written with comparisons and
 * arithmetic only, so the same source compiles for web and Roblox (roblox-ts).
 * Web num.ts keeps the Math.* functions; roblox/overrides/sim/num.ts uses these,
 * and num.test.ts proves they agree with Math.* on edge values and random inputs.
 *
 * floor is a parameter (not imported) so that the Roblox num override can import
 * this file without creating an import cycle through num.ts.
 */

/** JS Math.sign: -0 for -0, +0 for +0, NaN for NaN. */
export function signJs(x: number): number {
  if (x > 0) return 1;
  if (x < 0) return -1;
  return x;
}

/** Two-argument JS min: NaN if either is NaN, and -0 is smaller than +0. */
function minPair(a: number, b: number): number {
  if (a !== a || b !== b) return a + b;
  if (a < b) return a;
  if (b < a) return b;
  if (a === 0) return 1 / a < 0 ? a : b;
  return a;
}

/** Two-argument JS max: NaN if either is NaN, and +0 is larger than -0. */
function maxPair(a: number, b: number): number {
  if (a !== a || b !== b) return a + b;
  if (a > b) return a;
  if (b > a) return b;
  if (a === 0) return 1 / a > 0 ? a : b;
  return a;
}

/** JS Math.min over any number of arguments (Infinity when none). */
export function minJs(...xs: number[]): number {
  let m = 1 / 0;
  for (const x of xs) m = minPair(m, x);
  return m;
}

/** JS Math.max over any number of arguments (-Infinity when none). */
export function maxJs(...xs: number[]): number {
  let m = -1 / 0;
  for (const x of xs) m = maxPair(m, x);
  return m;
}

/**
 * JS Math.round: halves round toward +Infinity, and a zero result keeps the
 * sign of x (so Math.round(-0.4) is -0). NaN and +-Infinity pass through.
 * Uses floor(x) and not floor(x + 0.5), which is wrong for 0.49999999999999994.
 */
export function roundJs(x: number, floor: (v: number) => number): number {
  if (x !== x || x === 1 / 0 || x === -1 / 0) return x;
  let r = floor(x);
  if (x - r >= 0.5) r = r + 1;
  if (r === 0 && (x < 0 || 1 / x < 0)) return x * 0; // -0 at runtime (x < 0 or x is -0); a -0 literal may fold to +0 in Luau
  return r;
}
