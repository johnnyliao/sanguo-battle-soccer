// Roblox override of src/sim/num.ts — keep exports and results identical.
import { makeFdlibm } from "./fdlibm";
import { maxJs, minJs, roundJs, signJs } from "./jsmath";

export const PI = math.pi;
export const INF = math.huge;

export function abs(x: number): number {
  return math.abs(x);
}

export function sqrt(x: number): number {
  return math.sqrt(x);
}

export function floor(x: number): number {
  return math.floor(x);
}

/** fdlibm GET_HIGH_WORD: upper 32 bits of x's float64 as a signed int32. */
export function hiWord(x: number): number {
  const [hi] = string.unpack(">i4I4", string.pack(">d", x));
  return hi as number;
}

/** fdlibm GET_LOW_WORD: lower 32 bits of x's float64 as an unsigned integer. */
export function loWord(x: number): number {
  const [, lo] = string.unpack(">i4I4", string.pack(">d", x));
  return lo as number;
}

/** fdlibm INSERT_WORDS: the float64 with the given high and low 32-bit words. */
export function fromWords(hi: number, lo: number): number {
  const [x] = string.unpack(
    ">d",
    string.pack(">I4I4", bit32.band(hi, 0xffffffff), bit32.band(lo, 0xffffffff)),
  );
  return x as number;
}

/** Throw an error (unrecoverable programming error). */
export function fail(msg: string): never {
  error(msg);
}

/** fdlibm sin / cos / atan2, bit-identical to V8's Math.* (see src/sim/fdlibm.ts). */
const fdLib = makeFdlibm({ hi: hiWord, from: fromWords, floor: floor, fail: fail });

export function sin(x: number): number {
  return fdLib.sin(x);
}

export function cos(x: number): number {
  return fdLib.cos(x);
}

export function atan2(y: number, x: number): number {
  return fdLib.atan2(y, x);
}

/** JS Math.sign semantics, including -0 and NaN. */
export function sign(x: number): number {
  return signJs(x);
}

/** JS Math.min semantics (NaN propagates, -0 < +0; Infinity when no arguments). */
export function min(...xs: number[]): number {
  return minJs(...xs);
}

/** JS Math.max semantics (NaN propagates, +0 > -0; -Infinity when no arguments). */
export function max(...xs: number[]): number {
  return maxJs(...xs);
}

/** JS Math.round semantics (halves round toward +Infinity, zero keeps the sign of x). */
export function round(x: number): number {
  return roundJs(x, floor);
}

/** Length of an array or string. */
export function len(a: ReadonlyArray<unknown> | string): number {
  if (typeIs(a, "string")) {
    return (a as string).size();
  }
  return (a as ReadonlyArray<unknown>).size();
}

/** Returns a new, stably sorted copy. cmp < 0 means a before b. */
export function sortBy<T>(arr: ReadonlyArray<T>, cmp: (a: T, b: T) => number): T[] {
  // Stable insertion sort: an element moves before earlier ones only when
  // cmp(x, prev) < 0. Luau's table.sort is not stable, so it is not used.
  const out: T[] = [];
  for (let i = 0; i < arr.size(); i++) {
    out[i] = arr[i];
  }
  for (let i = 1; i < out.size(); i++) {
    const x = out[i];
    let j = i;
    while (j > 0 && cmp(x, out[j - 1]) < 0) {
      out[j] = out[j - 1];
      j--;
    }
    out[j] = x;
  }
  return out;
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
  const packed = string.pack(">d", x);
  let out = "";
  for (let i = 1; i <= 8; i++) {
    const [b] = string.byte(packed, i);
    out += string.format("%02x", b);
  }
  return out;
}

/** Kind of a canonicalisable value: n number, s string, b boolean, t table (object or array), u undefined. */
export function kindOf(v: unknown): "n" | "s" | "b" | "t" | "u" {
  if (v === undefined) return "u";
  if (typeIs(v, "number")) return "n";
  if (typeIs(v, "string")) return "s";
  if (typeIs(v, "boolean")) return "b";
  if (typeIs(v, "table")) return "t";
  return fail("kindOf: unsupported value");
}

/** Length of a string in UTF-8 bytes (Roblox strings are byte strings). */
export function utf8Len(s: string): number {
  return len(s);
}

/**
 * Own entries of a plain object or array with undefined values skipped, keys as strings (array indices
 * are "0", "1", ...), sorted ascending by plain string comparison.
 * roblox-ts arrays are stored 1-based, so a numeric key k is the index k - 1.
 */
export function entriesSorted(o: object): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const [k, v] of pairs(o as Record<string, unknown>)) {
    if (v === undefined) continue;
    const key = typeIs(k, "number") ? tostring(k - 1) : tostring(k);
    out.push([key, v]);
  }
  return sortBy(out, (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** FNV-1a 32-bit over the UTF-8 bytes of s (Luau strings are UTF-8), as 8 lowercase hex chars. */
export function fnv1aUtf8(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 1; i <= len(s); i++) {
    const [b] = string.byte(s, i);
    h = imulU(bit32.bxor(h, b), 0x01000193) >>> 0;
  }
  return string.format("%08x", h);
}
