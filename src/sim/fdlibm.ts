/**
 * Port of the fdlibm sin / cos / atan2 routines that V8 uses for Math.sin,
 * Math.cos and Math.atan2 (v8/src/base/ieee754.cc, fdlibm 5.3 derived), so that
 * Roblox (Luau's C libm) gives the same bits as the web build.
 *
 * Only IEEE double arithmetic, comparisons and the word helpers below are used.
 * The word helpers and floor are passed in via makeFdlibm: roblox/overrides/sim/num.ts
 * imports this file, so this file must not import num.ts (that would be a cycle).
 *
 * Not ported: __kernel_rem_pio2 (large-argument reduction). For |x| > 2^19*pi/2
 * (about 823550) sin and cos call fail().
 */

/** Platform primitives supplied by num.ts (web: DataView; Roblox: string.pack). */
export interface FdWords {
  /** GET_HIGH_WORD: upper 32 bits of x as a signed int32. */
  hi: (x: number) => number;
  /** INSERT_WORDS: the double with the given high and low 32-bit words. */
  from: (hi: number, lo: number) => number;
  floor: (x: number) => number;
  fail: (msg: string) => never;
}

export interface Fdlibm {
  sin: (x: number) => number;
  cos: (x: number) => number;
  atan2: (y: number, x: number) => number;
}

const HALF = 0.5;
const ONE = 1.0;
const TINY = 1.0e-300;

// __kernel_sin coefficients
const S1 = -1.66666666666666324348e-01;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

// __kernel_cos coefficients
const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

// __ieee754_rem_pio2 constants
const INVPIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21;
const PIO2_3T = 8.47842766036889956997e-32;

/** High words of n*pi/2 for n = 1..32 (used to decide when reduction needs more bits). */
const NPIO2_HW: number[] = [
  0x3ff921fb, 0x400921fb, 0x4012d97c, 0x401921fb, 0x401f6a7a, 0x4022d97c, 0x4025fdbb, 0x402921fb,
  0x402c463a, 0x402f6a7a, 0x4031475c, 0x4032d97c, 0x40346b9c, 0x4035fdbb, 0x40378fdb, 0x403921fb,
  0x403ab41b, 0x403c463a, 0x403dd85a, 0x403f6a7a, 0x40407e4c, 0x4041475c, 0x4042106c, 0x4042d97c,
  0x4043a28c, 0x40446b9c, 0x404534ac, 0x4045fdbb, 0x4046c6cb, 0x40478fdb, 0x404858eb, 0x404921fb,
];

// atan coefficients
const ATANHI: number[] = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1,
  1.57079632679489655800e0,
];
const ATANLO: number[] = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
  6.12323399573676603587e-17,
];
const AT0 = 3.33333333333329318027e-1;
const AT1 = -1.99999999998764832476e-1;
const AT2 = 1.42857142725034663711e-1;
const AT3 = -1.11111104054623557880e-1;
const AT4 = 9.09088713343650656196e-2;
const AT5 = -7.69187620504482999495e-2;
const AT6 = 6.66107313738753120669e-2;
const AT7 = -5.83357013379057348645e-2;
const AT8 = 4.97687799461593236017e-2;
const AT9 = -3.65315727442169155270e-2;
const AT10 = 1.62858201153657823623e-2;

// atan2 constants
const PI_O_4 = 7.8539816339744827900e-1;
const PI_O_2 = 1.5707963267948965580e0;
const PI = 3.1415926535897931160e0;
const PI_LO = 1.2246467991473531772e-16;

/** Builds the fdlibm sin / cos / atan2 on top of the given word primitives. */
export function makeFdlibm(w: FdWords): Fdlibm {
  const fabs = (v: number): number => (v === 0 ? 0 : v < 0 ? -v : v);

  function kernelSin(x: number, y: number, iy: boolean): number {
    const ix = w.hi(x) & 0x7fffffff;
    if (ix < 0x3e400000) return x; // |x| < 2^-27
    const z = x * x;
    const v = z * x;
    const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
    if (!iy) return x + v * (S1 + z * r);
    return x - ((z * (HALF * y - v * r) - y) - v * S1);
  }

  function kernelCos(x: number, y: number): number {
    const ix = w.hi(x) & 0x7fffffff;
    if (ix < 0x3e400000) return ONE;
    const z = x * x;
    const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
    if (ix < 0x3fd33333) return ONE - (HALF * z - (z * r - x * y));
    let qx: number;
    if (ix > 0x3fe90000) {
      qx = 0.28125;
    } else {
      qx = w.from(ix - 0x00200000, 0);
    }
    const hz = HALF * z - qx;
    const a = ONE - qx;
    return a - (hz - (z * r - x * y));
  }

  /** __ieee754_rem_pio2 for |x| <= 2^19*pi/2: returns [n, y0, y1] with x = n*pi/2 + y0 + y1. */
  function remPio2(x: number): [number, number, number] {
    const hx = w.hi(x);
    const ix = hx & 0x7fffffff;
    if (ix <= 0x3fe921fb) return [0, x, 0];
    if (ix < 0x4002d97c) {
      // |x| < 3pi/4, special case with n = +-1
      if (hx > 0) {
        let z = x - PIO2_1;
        if (ix !== 0x3ff921fb) {
          const y0 = z - PIO2_1T;
          return [1, y0, z - y0 - PIO2_1T];
        }
        z = z - PIO2_2;
        const y0 = z - PIO2_2T;
        return [1, y0, z - y0 - PIO2_2T];
      }
      let z = x + PIO2_1;
      if (ix !== 0x3ff921fb) {
        const y0 = z + PIO2_1T;
        return [-1, y0, z - y0 + PIO2_1T];
      }
      z = z + PIO2_2;
      const y0 = z + PIO2_2T;
      return [-1, y0, z - y0 + PIO2_2T];
    }
    if (ix <= 0x413921fb) {
      // medium size
      let t = fabs(x);
      const n = w.floor(t * INVPIO2 + HALF);
      const fn = n;
      let r = t - fn * PIO2_1;
      let ww = fn * PIO2_1T;
      let y0: number;
      if (n < 32 && ix !== NPIO2_HW[n - 1]) {
        y0 = r - ww;
      } else {
        const j = ix >>> 20;
        y0 = r - ww;
        let i = j - ((w.hi(y0) >>> 20) & 0x7ff);
        if (i > 16) {
          // second iteration, good to 118 bits
          t = r;
          ww = fn * PIO2_2;
          r = t - ww;
          ww = fn * PIO2_2T - (t - r - ww);
          y0 = r - ww;
          i = j - ((w.hi(y0) >>> 20) & 0x7ff);
          if (i > 49) {
            // third iteration
            t = r;
            ww = fn * PIO2_3;
            r = t - ww;
            ww = fn * PIO2_3T - (t - r - ww);
            y0 = r - ww;
          }
        }
      }
      const y1 = r - y0 - ww;
      if (hx < 0) return [-n, -y0, -y1];
      return [n, y0, y1];
    }
    return w.fail("fdlibm: |x| > 2^19*pi/2 (large-argument reduction not ported)");
  }

  function sin(x: number): number {
    const ix = w.hi(x) & 0x7fffffff;
    if (ix <= 0x3fe921fb) return kernelSin(x, 0, false);
    if (ix >= 0x7ff00000) return x - x;
    const r = remPio2(x);
    const q = r[0] & 3;
    if (q === 0) return kernelSin(r[1], r[2], true);
    if (q === 1) return kernelCos(r[1], r[2]);
    if (q === 2) return -kernelSin(r[1], r[2], true);
    return -kernelCos(r[1], r[2]);
  }

  function cos(x: number): number {
    const ix = w.hi(x) & 0x7fffffff;
    if (ix <= 0x3fe921fb) return kernelCos(x, 0);
    if (ix >= 0x7ff00000) return x - x;
    const r = remPio2(x);
    const q = r[0] & 3;
    if (q === 0) return kernelCos(r[1], r[2]);
    if (q === 1) return -kernelSin(r[1], r[2], true);
    if (q === 2) return -kernelCos(r[1], r[2]);
    return kernelSin(r[1], r[2], true);
  }

  /** fdlibm atan. */
  function atan(xIn: number): number {
    let x = xIn;
    const hx = w.hi(x);
    const ix = hx & 0x7fffffff;
    if (ix >= 0x44100000) {
      // |x| >= 2^66, including infinities
      if (x !== x) return x + x;
      if (hx > 0) return ATANHI[3] + ATANLO[3];
      return -ATANHI[3] - ATANLO[3];
    }
    let id: number;
    if (ix < 0x3fdc0000) {
      // |x| < 0.4375
      if (ix < 0x3e400000) return x; // |x| < 2^-27
      id = -1;
    } else {
      x = fabs(x);
      if (ix < 0x3ff30000) {
        if (ix < 0x3fe60000) {
          id = 0;
          x = (2.0 * x - ONE) / (2.0 + x);
        } else {
          id = 1;
          x = (x - ONE) / (x + ONE);
        }
      } else if (ix < 0x40038000) {
        id = 2;
        x = (x - 1.5) / (ONE + 1.5 * x);
      } else {
        id = 3;
        x = -1.0 / x;
      }
    }
    const z = x * x;
    const z2 = z * z;
    const s1 = z * (AT0 + z2 * (AT2 + z2 * (AT4 + z2 * (AT6 + z2 * (AT8 + z2 * AT10)))));
    const s2 = z2 * (AT1 + z2 * (AT3 + z2 * (AT5 + z2 * (AT7 + z2 * AT9))));
    if (id < 0) return x - x * (s1 + s2);
    const res = ATANHI[id] - (x * (s1 + s2) - ATANLO[id] - x);
    return hx < 0 ? -res : res;
  }

  function atan2(y: number, x: number): number {
    if (x !== x || y !== y) return x + y;
    const hx = w.hi(x);
    const ix = hx & 0x7fffffff;
    const hy = w.hi(y);
    const iy = hy & 0x7fffffff;
    if (x === 1) return atan(y);
    // 2*sign(x) + sign(y)
    const m = (hy < 0 ? 1 : 0) + (hx < 0 ? 2 : 0);
    if (y === 0) {
      if (m === 0 || m === 1) return y;
      if (m === 2) return PI + TINY;
      return -PI - TINY;
    }
    if (x === 0) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;
    if (ix === 0x7ff00000) {
      if (iy === 0x7ff00000) {
        if (m === 0) return PI_O_4 + TINY;
        if (m === 1) return -PI_O_4 - TINY;
        if (m === 2) return 3.0 * PI_O_4 + TINY;
        return -3.0 * PI_O_4 - TINY;
      }
      if (m === 0) return 0;
      if (m === 1) return y * 0; // -0 computed at runtime (y < 0); a -0 literal may be folded to +0 in Luau
      if (m === 2) return PI + TINY;
      return -PI - TINY;
    }
    if (iy === 0x7ff00000) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;
    // compute y/x
    const k = floorDiv(iy - ix, 1048576);
    let z: number;
    let mm = m;
    if (k > 60) {
      z = PI_O_2 + 0.5 * PI_LO;
      mm = m >= 2 ? m - 2 : m;
    } else if (hx < 0 && k < -60) {
      z = 0.0;
    } else {
      z = atan(fabs(y / x));
    }
    if (mm === 0) return z;
    if (mm === 1) return -z;
    if (mm === 2) return PI - (z - PI_LO);
    return z - PI_LO - PI;
  }

  /** floor(a / b) for integer a and power-of-two b: the same as an arithmetic shift. */
  function floorDiv(a: number, b: number): number {
    return w.floor(a / b);
  }

  return { sin, cos, atan2 };
}
