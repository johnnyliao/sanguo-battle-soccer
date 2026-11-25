import { entriesSorted, f64hex, fnv1aUtf8, kindOf, utf8Len } from './num';
import type { GameState } from './types';

/**
 * Canonical text of a state value. Numbers are their float64 bits, strings are length-prefixed (UTF-8 bytes),
 * tables list their non-undefined entries sorted by key. Identical on web and Roblox.
 */
export function canonical(v: unknown): string {
  const k = kindOf(v);
  if (k === 'n') return 'n' + f64hex(v as number);
  if (k === 's') {
    const s = v as string;
    return `s${utf8Len(s)}:${s}`;
  }
  if (k === 'b') return v ? 'T' : 'F';
  if (k === 'u') return 'u';
  const parts: string[] = ['{'];
  for (const [key, value] of entriesSorted(v as object)) {
    parts.push(`${key}=${canonical(value)};`);
  }
  parts.push('}');
  return parts.join('');
}

/** Digest of a whole game state: FNV-1a over the UTF-8 bytes of its canonical text, 8 hex chars. */
export function stateDigest(state: GameState): string {
  return fnv1aUtf8(canonical(state));
}
