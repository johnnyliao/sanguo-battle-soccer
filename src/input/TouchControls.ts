import Phaser from 'phaser';

/** Held state of the on-screen controls. */
export interface TouchState {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  dash: boolean;
  j: boolean;
  k: boolean;
  l: boolean;
}

type ButtonKey = 'j' | 'k' | 'l';

interface ButtonDef {
  key: ButtonKey;
  x: number;
  y: number;
  r: number;
  label: string;
  labelSize: string;
}

const BUTTONS: ButtonDef[] = [
  { key: 'j', x: 585, y: 268, r: 28, label: '射/攻', labelSize: '14px' },
  { key: 'k', x: 530, y: 300, r: 24, label: '傳/跳', labelSize: '11px' },
  { key: 'l', x: 590, y: 205, r: 18, label: '叫', labelSize: '12px' },
];

const STICK_REST_X = 70;
const STICK_REST_Y = 270;
const STICK_R = 34;
const KNOB_R = 14;
const STICK_DEADZONE = 10;
const AXIS_RATIO = 0.38;
const DASH_RATIO = 0.85;
/** The joystick can start in the left 45% of the screen, below the top bar. */
const STICK_ZONE_X = 640 * 0.45;
const STICK_ZONE_TOP = 40;
const SCREEN_W = 640;
const SCREEN_H = 360;
const POINTERS_TOTAL = 4;
const DEPTH = 1100;
const FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';

interface StickClaim {
  kind: 'stick';
  ox: number;
  oy: number;
  x: number;
  y: number;
}

interface ButtonClaim {
  kind: 'button';
  def: ButtonDef;
}

type Claim = StickClaim | ButtonClaim;

function inScreen(p: Phaser.Input.Pointer): boolean {
  return p.x >= 0 && p.x <= SCREEN_W && p.y >= 0 && p.y <= SCREEN_H;
}

function inCircle(x: number, y: number, def: ButtonDef): boolean {
  return Math.hypot(x - def.x, y - def.y) <= def.r;
}

/**
 * On-screen controls for phones: a floating virtual joystick on the left and J / K / L buttons on the right.
 * Drawn above the HUD with scroll factor 0. Only active once a touch is seen (or on touch-capable devices),
 * so mouse-only desktops never show them.
 */
export class TouchControls {
  private scene: Phaser.Scene;
  private enabled: boolean;
  private wanted = true;
  private claims = new Map<Phaser.Input.Pointer, Claim>();
  private gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.enabled = scene.sys.game.device.input.touch;
    const pointersTotal = scene.input.manager.pointersTotal;
    if (pointersTotal < POINTERS_TOTAL) scene.input.addPointer(POINTERS_TOTAL - pointersTotal);

    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH);
    this.labels = BUTTONS.map((b) =>
      scene.add
        .text(b.x, b.y, b.label, {
          fontFamily: FONT,
          fontSize: b.labelSize,
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
          resolution: 2,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH + 1),
    );

    scene.input.on('pointerdown', this.onDown);
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.draw);
    this.applyVisibility();
  }

  /** Current held state. All false while hidden. */
  state(): TouchState {
    const out: TouchState = { moveX: 0, moveY: 0, dash: false, j: false, k: false, l: false };
    if (!this.isShown()) return out;
    for (const claim of this.claims.values()) {
      if (claim.kind === 'button') {
        out[claim.def.key] = true;
        continue;
      }
      const dx = claim.x - claim.ox;
      const dy = claim.y - claim.oy;
      const len = Math.hypot(dx, dy);
      if (len <= STICK_DEADZONE) continue;
      if (Math.abs(dx) > AXIS_RATIO * len) out.moveX = dx > 0 ? 1 : -1;
      if (Math.abs(dy) > AXIS_RATIO * len) out.moveY = dy > 0 ? 1 : -1;
      if (len > DASH_RATIO * STICK_R) out.dash = true;
    }
    return out;
  }

  /** Shows or hides the controls. Hidden on desktops that never produced a touch. */
  setVisible(visible: boolean): void {
    this.wanted = visible;
    if (!visible) this.claims.clear();
    this.applyVisibility();
  }

  /** True when the controls are enabled for this device and currently wanted on screen. */
  isShown(): boolean {
    return this.enabled && this.wanted;
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown);
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerup', this.onUp);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.draw);
    this.claims.clear();
    this.gfx.destroy();
    this.labels.forEach((t) => t.destroy());
  }

  private applyVisibility(): void {
    const shown = this.isShown();
    this.gfx.setVisible(shown);
    this.labels.forEach((t) => t.setVisible(shown));
  }

  private onDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.enabled && pointer.wasTouch) {
      this.enabled = true;
      this.applyVisibility();
    }
    if (!this.isShown() || !inScreen(pointer)) return;

    const button = BUTTONS.find((b) => inCircle(pointer.x, pointer.y, b));
    if (button) {
      this.claims.set(pointer, { kind: 'button', def: button });
      return;
    }
    if (pointer.x < STICK_ZONE_X && pointer.y > STICK_ZONE_TOP && !this.findStick()) {
      this.claims.set(pointer, { kind: 'stick', ox: pointer.x, oy: pointer.y, x: pointer.x, y: pointer.y });
    }
  };

  private onMove = (pointer: Phaser.Input.Pointer): void => {
    const claim = this.claims.get(pointer);
    if (!claim) return;
    if (claim.kind === 'stick') {
      claim.x = pointer.x;
      claim.y = pointer.y;
    } else if (!inCircle(pointer.x, pointer.y, claim.def)) {
      // Sliding off a button releases it.
      this.claims.delete(pointer);
    }
  };

  private onUp = (pointer: Phaser.Input.Pointer): void => {
    this.claims.delete(pointer);
  };

  private findStick(): StickClaim | undefined {
    for (const claim of this.claims.values()) {
      if (claim.kind === 'stick') return claim;
    }
    return undefined;
  }

  private isPressed(key: ButtonKey): boolean {
    for (const claim of this.claims.values()) {
      if (claim.kind === 'button' && claim.def.key === key) return true;
    }
    return false;
  }

  private draw = (): void => {
    const g = this.gfx.clear();
    if (!this.isShown()) return;

    const stick = this.findStick();
    const ox = stick ? stick.ox : STICK_REST_X;
    const oy = stick ? stick.oy : STICK_REST_Y;
    const dx = stick ? stick.x - stick.ox : 0;
    const dy = stick ? stick.y - stick.oy : 0;
    const len = Math.hypot(dx, dy);
    const scale = len > STICK_R ? STICK_R / len : 1;
    const alpha = stick ? 0.5 : 0.2;
    g.fillStyle(0xffffff, alpha * 0.4);
    g.fillCircle(ox, oy, STICK_R);
    g.lineStyle(2, 0xffffff, alpha);
    g.strokeCircle(ox, oy, STICK_R);
    g.fillStyle(0xffffff, alpha + 0.2);
    g.fillCircle(ox + dx * scale, oy + dy * scale, KNOB_R);

    for (const b of BUTTONS) {
      const pressed = this.isPressed(b.key);
      g.fillStyle(pressed ? 0xffd98a : 0xffffff, pressed ? 0.6 : 0.25);
      g.fillCircle(b.x, b.y, b.r);
      g.lineStyle(2, 0xffffff, pressed ? 0.9 : 0.5);
      g.strokeCircle(b.x, b.y, b.r);
    }
  };
}
