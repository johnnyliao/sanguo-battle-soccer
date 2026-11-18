import type { InputFrame } from '../sim/types';

/** Raw held state of each virtual control, before conflict resolution. */
export interface RawInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  j: boolean;
  k: boolean;
  l: boolean;
  dashButton: boolean;
}

/** Turns raw held state plus the double-tap dash state into an InputFrame. */
export function buildInputFrame(raw: RawInput, dash: boolean): InputFrame {
  const moveX = raw.left === raw.right ? 0 : raw.left ? -1 : 1;
  const moveY = raw.up === raw.down ? 0 : raw.up ? -1 : 1;
  return {
    moveX,
    moveY,
    dash: dash || raw.dashButton,
    j: raw.j,
    k: raw.k,
    l: raw.l,
  };
}
