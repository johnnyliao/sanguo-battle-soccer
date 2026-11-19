import { describe, expect, it } from 'vitest';
import { ButtonLatch } from './ButtonLatch';

describe('ButtonLatch', () => {
  it('reports nothing when no press happened', () => {
    const latch = new ButtonLatch<'j'>();
    expect(latch.consume('j', false)).toBe(false);
  });

  it('reports a quick press (press and release between samples) on the next sample only', () => {
    const latch = new ButtonLatch<'j'>();
    latch.press('j');
    expect(latch.consume('j', false)).toBe(true);
    expect(latch.consume('j', false)).toBe(false);
  });

  it('reports a held button as held and keeps the latch cleared afterwards', () => {
    const latch = new ButtonLatch<'l'>();
    latch.press('l');
    expect(latch.consume('l', true)).toBe(true);
    expect(latch.consume('l', false)).toBe(false);
  });

  it('two quick taps with a sample between them give two separate true samples', () => {
    const latch = new ButtonLatch<'k'>();
    latch.press('k');
    const first = latch.consume('k', false);
    const between = latch.consume('k', false);
    latch.press('k');
    const second = latch.consume('k', false);
    expect([first, between, second]).toEqual([true, false, true]);
  });

  it('keys are independent', () => {
    const latch = new ButtonLatch<'j' | 'k'>();
    latch.press('j');
    expect(latch.consume('k', false)).toBe(false);
    expect(latch.consume('j', false)).toBe(true);
  });

  it('clear drops pending presses', () => {
    const latch = new ButtonLatch<'j'>();
    latch.press('j');
    latch.clear();
    expect(latch.consume('j', false)).toBe(false);
  });
});
