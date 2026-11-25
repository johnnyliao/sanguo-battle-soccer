/**
 * Platform layer for the deterministic sim (web / Node version).
 * sim/, ai/ and data/ must use these instead of Math, Infinity, .length,
 * throw new Error, Array.prototype.sort, Array.from, flatMap.
 * The Roblox build replaces this file with roblox/overrides/sim/num.ts,
 * which must keep exactly the same exports and results.
 */

export const PI = Math.PI;
export const INF = Infinity;

export const abs = Math.abs;
export const sqrt = Math.sqrt;
export const floor = Math.floor;
export const sign = Math.sign;
export const sin = Math.sin;
export const cos = Math.cos;
export const atan2 = Math.atan2;
export const min: (...xs: number[]) => number = Math.min;
export const max: (...xs: number[]) => number = Math.max;

/** JS Math.round semantics (halves round toward +Infinity). */
export function round(x: number): number {
  return Math.round(x);
}

/** Length of an array or string. */
export function len(a: ReadonlyArray<unknown> | string): number {
  return a.length;
}

/** Throw an error (unrecoverable programming error). */
export function fail(msg: string): never {
  throw new Error(msg);
}

/** Returns a new, stably sorted copy. cmp < 0 means a before b. */
export function sortBy<T>(arr: ReadonlyArray<T>, cmp: (a: T, b: T) => number): T[] {
  return [...arr].sort(cmp);
}

/**
 * Low 32 bits of a*b as an UNSIGNED integer (0..2^32-1); a, b are treated as
 * 32-bit integers (signed or unsigned). Pure double arithmetic so both
 * platforms give identical bits. (Math.imul(a, b) >>> 0) === imulU(a, b).
 */
export function imulU(a: number, b: number): number {
  const ua = a >>> 0;
  const ub = b >>> 0;
  const bLo = ub & 0xffff;
  const bHi = ub >>> 16;
  // ua*bLo < 2^48 and (ua*bHi mod 2^16)*2^16 < 2^32: both exact in a double.
  const lo = ua * bLo;
  const hi = ((ua * bHi) % 65536) * 65536;
  return (lo + hi) % 4294967296;
}

/**
 * The 8 bytes of x as an IEEE-754 float64, big-endian, as 16 lowercase hex chars.
 * Used by the state digest so both platforms hash the same bits.
 */
export function f64hex(x: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x, false);
  let out = '';
  for (let i = 0; i < 8; i++) out += view.getUint8(i).toString(16).padStart(2, '0');
  return out;
}

const wordView = new DataView(new ArrayBuffer(8));

/** fdlibm GET_HIGH_WORD: upper 32 bits of x's float64 as a signed int32. */
export function hiWord(x: number): number {
  wordView.setFloat64(0, x, false);
  return wordView.getInt32(0, false);
}

/** fdlibm GET_LOW_WORD: lower 32 bits of x's float64 as an unsigned integer. */
export function loWord(x: number): number {
  wordView.setFloat64(0, x, false);
  return wordView.getUint32(4, false);
}

/** fdlibm INSERT_WORDS: the float64 with the given high and low 32-bit words. */
export function fromWords(hi: number, lo: number): number {
  wordView.setUint32(0, hi >>> 0, false);
  wordView.setUint32(4, lo >>> 0, false);
  return wordView.getFloat64(0, false);
}

/** Kind of a canonicalisable value: n number, s string, b boolean, t table (object or array), u undefined. */
export function kindOf(v: unknown): 'n' | 's' | 'b' | 't' | 'u' {
  if (v === undefined) return 'u';
  if (typeof v === 'number') return 'n';
  if (typeof v === 'string') return 's';
  if (typeof v === 'boolean') return 'b';
  if (typeof v === 'object' && v !== null) return 't';
  return fail('kindOf: unsupported value');
}

/** Length of a string in UTF-8 bytes (Roblox strings are byte strings). */
export function utf8Len(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Own entries of a plain object or array with undefined values skipped, keys as strings (array indices
 * are "0", "1", ...), sorted ascending by plain string comparison.
 */
export function entriesSorted(o: object): [string, unknown][] {
  const out: [string, unknown][] = [];
  const rec = o as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    const v = rec[k];
    if (v !== undefined) out.push([k, v]);
  }
  return sortBy(out, (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** FNV-1a 32-bit over the UTF-8 bytes of s, as 8 lowercase hex chars. */
export function fnv1aUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h = imulU(h ^ bytes[i], 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
