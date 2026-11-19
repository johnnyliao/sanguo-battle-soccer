import { describe, expect, it } from 'vitest';
import { DEPTH_SCALE, FIELD_TOP, cameraTargetX, pkCameraX, worldToScreen } from './projection';

describe('worldToScreen', () => {
  it('keeps x and projects y with the depth scale', () => {
    expect(worldToScreen(100, 0, 0)).toEqual({ sx: 100, sy: FIELD_TOP });
    expect(worldToScreen(100, 200, 0)).toEqual({ sx: 100, sy: FIELD_TOP + 200 * DEPTH_SCALE });
  });

  it('lifts sy upward by height', () => {
    expect(worldToScreen(0, 0, 30).sy).toBe(FIELD_TOP - 30);
  });
});

describe('cameraTargetX', () => {
  it('centres on the ball when away from the edges', () => {
    expect(cameraTargetX(500, 640)).toBe(180);
  });

  it('clamps at the left edge', () => {
    expect(cameraTargetX(0, 640)).toBe(-40);
  });

  it('clamps at the right edge', () => {
    expect(cameraTargetX(1200, 640)).toBe(600);
  });

  it('follows a wider view and clamps it to the field', () => {
    expect(cameraTargetX(500, 800)).toBe(100);
    expect(cameraTargetX(1200, 800)).toBe(440);
  });

  it('centres a view wider than the field', () => {
    expect(cameraTargetX(0, 1400)).toBe(-100);
  });
});

describe('pkCameraX', () => {
  it('pins the right goal to the right edge of the view', () => {
    expect(pkCameraX(640)).toBe(600);
    expect(pkCameraX(800)).toBe(440);
  });
});
