/** Double-tap window in ticks (press, release, press again). */
const DOUBLE_TAP_TICKS = 15;

type Dir = 'left' | 'right' | 'up' | 'down';
const DIRS: Dir[] = ['left', 'right', 'up', 'down'];

/**
 * Pure double-tap dash detector. Call update() once per tick with the current
 * move direction. Dash latches when a direction is pressed again within
 * DOUBLE_TAP_TICKS of its last release, and stays true while that direction
 * remains held.
 */
export class DashDetector {
  private tick = 0;
  private held: Record<Dir, boolean> = { left: false, right: false, up: false, down: false };
  private lastRelease: Record<Dir, number> = {
    left: -Infinity,
    right: -Infinity,
    up: -Infinity,
    down: -Infinity,
  };
  private dashDir: Dir | null = null;

  update(moveX: -1 | 0 | 1, moveY: -1 | 0 | 1): boolean {
    this.tick++;
    const now: Record<Dir, boolean> = {
      left: moveX < 0,
      right: moveX > 0,
      up: moveY < 0,
      down: moveY > 0,
    };

    for (const dir of DIRS) {
      if (now[dir] && !this.held[dir]) {
        if (this.tick - this.lastRelease[dir] <= DOUBLE_TAP_TICKS) {
          this.dashDir = dir;
        }
      } else if (!now[dir] && this.held[dir]) {
        this.lastRelease[dir] = this.tick;
        if (this.dashDir === dir) this.dashDir = null;
      }
      this.held[dir] = now[dir];
    }

    return this.dashDir !== null;
  }
}
